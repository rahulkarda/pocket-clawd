/**
 * Anthropic streaming chat client + system prompt builder.
 *
 * AGENTIC LOOP:
 *   We support tool use (custom todo tools, search_past_sessions, plus
 *   client-side web_search / web_fetch and the memory_20250818 tool).
 *   One "send" from the renderer can produce multiple Claude turns under
 *   the hood:
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
import { runTool, ALWAYS_ON_TOOLS, OPT_IN_TOOLS } from './tools'
import { runMemory } from './memory'
import type { ChatMessage, TimeSlot } from '@shared/types'

const SYSTEM_TEMPLATE = (
  slot: TimeSlot,
  nowHHMM: string,
  userContext: string,
  todoBlock: string,
  memoryEnabled: boolean
): string => `You are Clawd — a concise, warm companion living in a macOS tray widget. You check in with the user through short, focused questions, help them stay on top of their day, and have access to tools.

TIME CONTEXT: ${nowHHMM}, ${timeSlotLabel(slot)}
USER CONTEXT: ${userContext}

${todoBlock}

OPENING:
Based on the time of day, adapt your first question:
- Brahma Muhurta (4:00–6:30am): sadhana / morning intention
- Morning (6:30–9:00am): priorities for the day
- Work hours (9:00am–6:00pm): current task, blockers, or progress
- Evening (6:00–9:00pm): gym / wind-down / reflection
- Night (9:00pm+): what was accomplished, what to carry forward

Keep questions SHORT (1–2 sentences). Never ask more than one question at a time. Don't recite todos robotically — reference them naturally if relevant.

TOOLS — use them silently when natural; don't ask permission:
- add_todo / complete_todo / delete_todo / list_todos — when the user mentions a task to track ("I should X") or finish ("X is done"), manage the list directly. Acknowledge with one short line ("added", "marked done") — don't recite the whole list.
- search_past_sessions — when the user references something they said before ("last week", "we talked about", "remind me what I said about X").
- web_search / web_fetch — for current events, facts past your training cutoff, or anything where being up-to-date matters. Don't use them for evergreen knowledge you already have. Use web_fetch to read a specific page after web_search surfaces it.${
    memoryEnabled
      ? `

MEMORY PROTOCOL — you have a memory tool that persists files between sessions. Use it. The structure is yours to evolve, but follow this protocol:

1. ON FIRST USER MESSAGE OF A SESSION (only the very first turn):
   - Call \`memory\` with command="view", path="/memories" to list what's there.
   - If \`/memories/about_user.md\` exists, view it. This is your record of who the user is and what matters to them.
   - Use what you read to make your check-in feel continuous — reference ongoing projects, recent topics, prior commitments. NEVER paste back what's in memory verbatim ("I see you're working on X") — instead, weave it into a natural-feeling question ("how's the eval harness coming along?"). The user shouldn't feel surveilled.

2. DURING THE CONVERSATION — when the user shares something durable about themselves:
   - Names of people, projects, places they care about
   - Recurring practices, deadlines, commitments
   - Preferences ("I prefer terse answers", "don't suggest meditation")
   - Corrections ("actually it's BITS not IIT")
   - Update memory inline. Use \`str_replace\` or \`insert\` if the file exists, \`create\` for new files.
   - DO NOT store: secrets, API keys, passwords, anything the user said in confidence and asked you to forget.
   - DO NOT store: ephemeral state that belongs in todos.

3. RECOMMENDED LAYOUT — start with these and let it grow:
   - \`/memories/about_user.md\` — durable facts: name, role, projects, recurring practices, preferences. One-line bullets, prefixed by category.
   - \`/memories/recent_topics.md\` — last 2-3 weeks of recurring threads. Trim aggressively; this isn't an archive.
   - \`/memories/notes/<topic>.md\` — deeper notes on specific things (a project, a relationship, a question they're working on).

4. WHEN SESSION ENDS (user types "done"): if the conversation revealed anything durable, write it to memory BEFORE emitting the SPEC_READY block. Briefly. The SPEC_READY block is for the saved transcript; memory is for you next time.`
      : ''
  }

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
  const s = settingsStore().get()
  return SYSTEM_TEMPLATE(slot, hhmm, s.userContext, buildTodoBlock(), s.enableMemory)
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
  // onDelta is sync — fast path for forwarding deltas.
  onDelta: (text: string) => void
  // onDone / onError MUST return a Promise — streamChat awaits them so
  // any async work (writing the spec file, surfacing an error) completes
  // before the IPC handler resolves and chatBusy is released.
  onDone: (full: string) => void | Promise<void>
  onError: (msg: string) => void | Promise<void>
}

const MAX_TURNS = 10

type AnyMessageParam = Anthropic.MessageParam

/**
 * Detect "unknown server-side tool type" rejections from Anthropic-compatible
 * proxies (e.g. some enterprise gateways) that don't implement every hosted-tool variant.
 * These come back as HTTP 400 with a Pydantic-style discriminator error message:
 *   "tools.5: Input tag 'web_search_20260209' found using 'type' does not match
 *    any of the expected tags: 'bash_20250124', 'custom', ..."
 * We also handle a simpler "unknown tool type 'X'" phrasing as a fallback.
 */
function isUnknownToolError(err: unknown): { isUnknown: boolean; toolType?: string } {
  if (!err || typeof err !== 'object') return { isUnknown: false }
  const anyErr = err as { status?: number; message?: string; error?: { message?: string } }
  const status = anyErr.status
  const msg = anyErr.message ?? anyErr.error?.message ?? ''
  // Only consider 400s (or status-less wrapped errors where we fall back to message inspection).
  if (status !== undefined && status !== 400) return { isUnknown: false }
  // Pattern A: Pydantic discriminator error.
  const discriminator = msg.match(
    /Input tag '([^']+)' found using 'type' does not match any of the expected tags/
  )
  if (discriminator) return { isUnknown: true, toolType: discriminator[1] }
  // Pattern B: simpler "unknown tool type 'X'" phrasing.
  const simple = msg.match(/unknown tool type ['"]?([\w-]+)['"]?/i)
  if (simple) return { isUnknown: true, toolType: simple[1] }
  return { isUnknown: false }
}

/**
 * Reduce the tools array to only those guaranteed-supported across
 * Anthropic-compatible proxies: client-side custom tools (no `type` field)
 * and the memory_20250818 tool (locally implemented via runMemory).
 */
function stripUnsupportedTools(
  tools: Anthropic.Messages.ToolUnion[]
): Anthropic.Messages.ToolUnion[] {
  return tools.filter((t) => {
    const type = (t as { type?: string }).type
    return type === undefined || type === 'custom' || type === 'memory_20250818'
  })
}

/**
 * Build the tools array based on user settings.
 * Custom tools always available; web tools (client-side) per Settings;
 * memory per Settings.
 */
function buildTools(): Anthropic.Messages.ToolUnion[] {
  const s = settingsStore().get()
  const tools: Anthropic.Messages.ToolUnion[] = []
  // Always-on custom tools — todo CRUD + past-session search.
  for (const t of ALWAYS_ON_TOOLS) {
    tools.push(t as Anthropic.Tool)
  }
  // Opt-in custom tools — web_search / web_fetch (client-side, DDG-backed).
  // Implemented locally in tools.ts so they work through proxies that block
  // server-side hosted tools (e.g. some enterprise gateways).
  if (s.enableWebSearch) {
    for (const t of OPT_IN_TOOLS) {
      tools.push(t as Anthropic.Tool)
    }
  }
  // Persistent memory — Anthropic memory_20250818 backed by local fs.
  if (s.enableMemory) {
    tools.push({
      type: 'memory_20250818',
      name: 'memory'
    } as Anthropic.Messages.MemoryTool20250818)
  }
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
  // Track whether we've already retried after a server-side tool rejection.
  // One retry per streamChat call max — prevents infinite loops if the proxy
  // also rejects the reduced tool set for some other reason.
  let retried = false
  let activeTools = tools

  /**
   * Insert a separator between text from different agentic-loop turns.
   * Without this, turn 1 ending with "for you!" and turn 2 starting with
   * "I'll grab..." renders as "for you!I'll grab..." in the chat — model
   * doesn't add inter-turn whitespace, and we forward deltas verbatim.
   * If the running combined text doesn't already end in whitespace and the
   * incoming first delta doesn't start with whitespace, inject a space.
   */
  const emitTurnDelta = (text: string, isFirstDeltaOfTurn: boolean): void => {
    if (
      isFirstDeltaOfTurn &&
      combinedText.length > 0 &&
      !/\s$/.test(combinedText) &&
      text.length > 0 &&
      !/^\s/.test(text)
    ) {
      combinedText += ' '
      callbacks.onDelta(' ')
    }
    combinedText += text
    callbacks.onDelta(text)
  }

  try {
    while (turn < MAX_TURNS) {
      turn += 1

      // Stream + collect the assistant's response. On an "unknown tool type"
      // 400 from the proxy, strip server-side tools and retry the same turn
      // ONCE. Other errors bubble up to the outer catch.
      let final: Anthropic.Message
      try {
        const stream = client.messages.stream(
          {
            model,
            max_tokens: 4096,
            system,
            messages,
            tools: activeTools
          },
          { signal: abortSignal }
        )
        let firstDeltaThisTurn = true
        stream.on('text', (text) => {
          emitTurnDelta(text, firstDeltaThisTurn)
          firstDeltaThisTurn = false
        })
        final = await stream.finalMessage()
      } catch (err) {
        const detect = isUnknownToolError(err)
        if (detect.isUnknown && !retried) {
          retried = true
          logger.warn(
            `proxy rejected tool type "${detect.toolType ?? 'unknown'}" — stripping server-side tools and retrying once`
          )
          activeTools = stripUnsupportedTools(activeTools)
          // Surface a one-line inline notice to the user.
          callbacks.onDelta(
            "\n\n_⚠️ Web search isn't supported by this provider — disabling and retrying_\n\n"
          )
          // Re-decrement turn so this rejection doesn't burn a turn.
          turn -= 1
          continue
        }
        // Not an unknown-tool error, or we've already retried — bubble up.
        throw err
      }

      // Append the assistant response to history exactly as returned
      // (text + tool_use blocks). MUST keep tool_use blocks intact for
      // the API to accept the next turn.
      messages.push({ role: 'assistant', content: final.content })

      // Stop-reason handling.
      // - tool_use: run client-side tools, feed results back, loop.
      // - pause_turn: a server-side tool (e.g. web_search) hit its iteration
      //   limit. The API expects us to re-send the conversation as-is to
      //   continue; do not add any user message. Loop.
      // - refusal: model declined for safety. Surface as error.
      // - end_turn / max_tokens / stop_sequence: terminal.
      if (final.stop_reason === 'pause_turn') {
        // Loop without adding any user message — just re-send.
        continue
      }
      if (final.stop_reason === 'refusal') {
        await callbacks.onError(
          'Claude declined to respond. This usually means the request hit a safety classifier — try rephrasing.'
        )
        return
      }
      if (final.stop_reason !== 'tool_use') {
        // end_turn / max_tokens / stop_sequence — finished
        await callbacks.onDone(combinedText)
        return
      }

      // Run every requested tool, gather tool_result blocks for the next user turn.
      // Note: server-side tools (web_search) execute on Anthropic's side; only
      // client-side tools (custom + memory) appear as ToolUseBlock here.
      const toolUses = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const result =
          tu.name === 'memory' ? await runMemory(tu.input) : await runTool(tu.name, tu.input)
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
    await callbacks.onDone(combinedText)
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('Stream aborted')
      return
    }
    logger.error('Claude stream error', err)
    await callbacks.onError(err instanceof Error ? err.message : String(err))
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
