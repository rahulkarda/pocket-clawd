/**
 * Anthropic streaming chat client + system prompt builder.
 *
 * Stop sequence strategy:
 *   We instruct Claude to emit "<SPEC_READY>...</SPEC_READY>" on session-end.
 *   The Anthropic API supports `stop_sequences`, but we don't use it for the OPENING
 *   tag — we want the full block. Instead the orchestrator detects </SPEC_READY> in
 *   the accumulated stream and parses the content. This keeps streaming UX intact.
 */
import Anthropic from '@anthropic-ai/sdk'
import logger from './logger'
import { getApiKey } from './keychain'
import { settingsStore } from './settings'
import { getDaily } from './todoStore'
import { getTimeSlot, timeSlotLabel } from '@shared/time'
import type { ChatMessage, TimeSlot } from '@shared/types'

const SYSTEM_TEMPLATE = (
  slot: TimeSlot,
  nowHHMM: string,
  userContext: string,
  todoBlock: string
): string => `You are a concise, warm assistant living in a macOS tray widget.
Your job is to check in with the user through short, focused questions.

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
Reference the user's todos naturally if relevant — don't list them robotically.

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

/**
 * Send the full conversation history and stream the response.
 * Uses `messages.stream()` helper — gives us text_stream + final message.
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
  const messages = history.map((m) => ({ role: m.role, content: m.content }))

  try {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 4096,
        system,
        messages
      },
      { signal: abortSignal }
    )

    // SDK ≥0.30: iterate text deltas via the .on('text') stream API.
    // Using stream.on() is the documented interface for receiving text chunks.
    stream.on('text', (text) => callbacks.onDelta(text))

    const final = await stream.finalMessage()
    const full = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    callbacks.onDone(full)
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('Stream aborted')
      return
    }
    logger.error('Claude stream error', err)
    callbacks.onError(err instanceof Error ? err.message : String(err))
  }
}

/** One-shot, non-streaming call. Used by the whisper engine. */
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
