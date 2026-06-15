/**
 * Anthropic streaming chat client + system prompt builder.
 *
 * AGENTIC LOOP:
 *   We support tool use (custom todo tools, search_past_sessions, plus
 *   Anthropic-hosted web_search and web_fetch). One "send" from the
 *   renderer can produce multiple Claude turns under the hood:
 *
 *     stream → if stop_reason==='tool_use' → run tools → feed back → stream again
 *
 *   We stop when stop_reason==='end_turn'. A safety cap of 10 turns
 *   prevents runaway loops. Text deltas from every stream are forwarded to
 *   the renderer continuously, so the user sees Claude "thinking" between
 *   tool calls naturally.
 *
 * SPEC_READY: Claude is instructed to emit "<SPEC_READY>...</SPEC_READY>"
 *   on session-end. We don't use stop_sequences (would cut at opening tag);
 *   the orchestrator detects the closing tag in the accumulated stream and
 *   parses the content out for writing to disk.
 */
import Anthropic from '@anthropic-ai/sdk'
import logger from './logger'
import { getApiKey } from './keychain'
import { settingsStore } from './settings'
import { getDaily } from './todoStore'
import { getTimeSlot, timeSlotLabel } from '@shared/time'
import { runTool, TOOLS } from './tools'
import type { ChatMessage, TimeSlot } from '@shared/types'

const SYSTEM_TEMPLATE = (
  slot: TimeSlot,
  nowHHMM: string,
  userContext: string,
  todoBlock: string
): string => `You are Clawd — a concise, warm companion living in a macOS tray widget. You check in with the user through short, focused questions, help them stay on top of their day, and have access to tools.

TIME CONTEXT: ${nowHHMM}, ${timeSlotLabel(slot)}
USER CONTEXT: ${userContext}

${todoBlock}

Based on the time of day, adapt your opening question:
- Brahma Muhurta (4:00–6:30am): Ask about sadhana / morning intention
- Morning (6:30–9:00am): Ask about priorities for the day
- Work hours (9:00am–6:00pm): Ask about current task, blockers, or progress
- Evening (6:00–9:00pm): Ask about gym / wind-down / reflection
- Night (9:00pm+): Ask about what was accomplished, what to carry forward

Keep questions SHORT (1–2 sentences). Never ask more than one question at a time.

TOOLS:
You have access to tools. Use them when natural — don't ask permission, just act:
- add_todo / complete_todo / delete_todo / list_todos: when the user mentions tasks they want to track or finish, manage their list silently. Acknowledge with a single short line ("added", "got it, marked done") — don't recite the whole list back.
- search_past_sessions: when the user references something they said earlier ("last week we talked about", "remind me what I said about X").
- web_search / web_fetch: for current events, facts past your training cutoff, or content at a specific URL.

When the user types "done" (case-insensitive), thank them briefly (1 sentence), then output ONLY:

<SPEC_READY>
---
date: YYYY-MM-DD
time: HH:MM
time_of_day: <slot>
session_duration_turns: <int>
topics_discussed:
  - topic 1
  - topic 2
mood: <one word>
energy: <one word>
---

## Session Summary

A 3rd-person past-tense synthesis of what was shared (~150 words max).

## Key Points

- Bullet 1
- Bullet 2

## Next Actions (if any mentioned)

- Action 1
</SPEC_READY>

Do not include any text after </SPEC_READY>.`

function buildTodoBlock(): string {
  const d = getDaily()
  if (!d.todos.length) return "TODAY'S TODOS: (none yet)"
  const lines = d.todos.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n')
  return `TODAY'S TODOS (from user's daily list):\n${lines}\n\nReference these naturally if relevant. Don't list them robotically.`
}

export function buildSystemPrompt(): string {
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const slot = getTimeSlot(now)
  const ctx = settingsStore().get().userContext
  return SYSTEM_TEMPLATE(slot, hhmm, ctx, buildTodoBlock())
}

let _client: Anthropic | null = null
let _clientFingerprint: string | null = null

async function getClient(): Promise<Anthropic> {
  const settings = settingsStore().get()
  const baseURL = settings.baseURL.trim()
  const fingerprint = baseURL || 'default'
  if (_client && _clientFingerprint === fingerprint) return _client

  const key = await getApiKey()
  if (!key) throw new Error('Anthropic API key not configured. Open Settings to add one.')

  _client = new Anthropic({
    apiKey: key,
    ...(baseURL ? { baseURL } : {})
  })
  _clientFingerprint = fingerprint
  return _client
}

/** Reset the cached client (e.g. when the API key or baseURL changes). */
export function resetClient(): void {
  _client = null
  _clientFingerprint = null
}

export interface StreamCallbacks {
  onDelta: (text: string) => void
  onDone: (full: string) => void
  onError: (msg: string) => void
}

const MAX_TURNS = 10

type AnyMessageParam = Anthropic.MessageParam

/**
 * Build the tools array based on user settings.
 * Custom tools always available; server-side tools per Settings.
 */
function buildTools(): Anthropic.Messages.ToolUnion[] {
  const s = settingsStore().get()
  const tools: Anthropic.Messages.ToolUnion[] = []
  // Custom tools — always on
  for (const t of TOOLS) {
    tools.push(t as Anthropic.Tool)
  }
  // Server-side: web_search (Anthropic-hosted, costs extra tokens)
  if (s.enableWebSearch) {
    tools.push({
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: 5
    } as Anthropic.Messages.WebSearchTool20260209)
  }
  // Memory tool wired in Phase C — TOOLS list will gain memory_20250818 there.
  return tools
}

/**
 * Send the full conversation history and run the agentic loop.
 * Each turn streams text deltas to the renderer; tool calls happen client-side
 * (via runTool) and are fed back as a tool_result message in the next turn.
 */
export async function streamChat(
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  let client: Anthropic
  try {
    client = await getClient()
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : String(err))
    return
  }

  const system = buildSystemPrompt()
  const model = settingsStore().get().model
  const tools = buildTools()
  const messages: AnyMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content
  }))

  let combinedText = ''
  let turn = 0

  try {
    while (turn < MAX_TURNS) {
      turn += 1
      const stream = client.messages.stream(
        {
          model,
          max_tokens: 4096,
          system,
          messages,
          tools
        },
        { signal: abortSignal }
      )

      // Forward text deltas from this turn to the renderer.
      stream.on('text', (text) => {
        combinedText += text
        callbacks.onDelta(text)
      })

      const final = await stream.finalMessage()

      // Append the assistant response to history exactly as returned
      // (text + tool_use blocks). MUST keep tool_use blocks intact for
      // the API to accept the next turn.
      messages.push({ role: 'assistant', content: final.content })

      if (final.stop_reason !== 'tool_use') {
        // end_turn / max_tokens / stop_sequence — finished
        callbacks.onDone(combinedText)
        return
      }

      // Run every requested tool, gather tool_result blocks for the next user turn.
      const toolUses = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const result = await runTool(tu.name, tu.input)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: result.content,
          ...(result.is_error ? { is_error: true } : {})
        })
      }
      messages.push({ role: 'user', content: toolResults })
      // Loop: stream the next assistant turn.
    }

    logger.warn(`agentic loop hit MAX_TURNS=${MAX_TURNS}`)
    callbacks.onDone(combinedText)
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('Stream aborted')
      return
    }
    logger.error('Claude stream error', err)
    callbacks.onError(err instanceof Error ? err.message : String(err))
  }
}

/** One-shot, non-streaming call. Used by the whisper engine. No tools. */
export async function oneShot(opts: {
  system: string
  user: string
  maxTokens: number
  model?: string
}): Promise<string> {
  const client = await getClient()
  const resp = await client.messages.create({
    model: opts.model ?? settingsStore().get().model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }]
  })
  const first = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return first?.text ?? ''
}
