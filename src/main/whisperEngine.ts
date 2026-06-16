/**
 * Whisper engine — generates short ambient nudges via a lightweight Claude call
 * on a randomized 8–12 minute timer (configurable). Caches recent whispers for
 * 24h to avoid repeats.
 */
import Store from 'electron-store'
import logger from './logger'
import { oneShot } from './anthropicClient'
import { settingsStore } from './settings'
import { hasApiKey } from './keychain'
import { getTimeSlot, timeSlotLabel } from '@shared/time'
import type { TimeSlot } from '@shared/types'

interface WhisperCacheShape {
  whispers: Array<{ text: string; ts: number }>
}

const cache = new Store<WhisperCacheShape>({
  name: 'whisper-cache',
  defaults: { whispers: [] }
})

const DAY_MS = 24 * 60 * 60 * 1000

function recentWhispers(): string[] {
  const all = cache.get('whispers')
  const cutoff = Date.now() - DAY_MS
  const fresh = all.filter((w) => w.ts >= cutoff)
  if (fresh.length !== all.length) cache.set('whispers', fresh)
  return fresh.map((w) => w.text)
}

function rememberWhisper(text: string): void {
  const cur = cache.get('whispers')
  cache.set('whispers', [...cur, { text, ts: Date.now() }])
}

function buildSystem(slot: TimeSlot, hhmm: string, recent: string[]): string {
  const recentBlock = recent.length
    ? `\n\nAvoid repeating any of these recent whispers:\n${recent.map((r) => `- ${r}`).join('\n')}`
    : ''

  // Pull persona from settings so the user's own bio (set in the Settings UI)
  // shapes the whispers — repo ships a generic default; local installs override.
  const persona = settingsStore().get().userContext

  return `Current time: ${hhmm}, time slot: ${timeSlotLabel(slot)}
User context: ${persona}

Generate ONE short whisper (max 8 words). A micro-prompt, gentle nudge, or moment of awareness appropriate to the time of day and the user's context. No punctuation at the end. No quotes. Just the raw whisper text.

Examples: "What are you building right now", "One thing to finish before lunch", "Take a breath", "How's the energy"${recentBlock}`
}

export async function generateWhisper(): Promise<string | null> {
  if (!(await hasApiKey())) return null
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const slot = getTimeSlot(now)
  try {
    const text = await oneShot({
      system: buildSystem(slot, hhmm, recentWhispers()),
      user: 'Generate one whisper now.',
      maxTokens: 30
    })
    const cleaned = text.trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '')
    if (cleaned) {
      rememberWhisper(cleaned)
      return cleaned
    }
    return null
  } catch (err) {
    logger.warn('Whisper generation failed', err)
    return null
  }
}

let timer: NodeJS.Timeout | null = null
let onWhisperFn: ((text: string) => void) | null = null

function nextDelayMs(): number {
  const s = settingsStore().get()
  // Defensive: any of these could be NaN if a user/script wrote bad JSON to
  // settings, and setTimeout(NaN) fires immediately — that would loop the
  // whisper engine into an infinite quota burn.
  const minMin = Number.isFinite(s.whisperIntervalMin) ? Math.max(1, s.whisperIntervalMin) : 8
  const maxMin = Number.isFinite(s.whisperIntervalMax) ? Math.max(minMin, s.whisperIntervalMax) : Math.max(minMin, 12)
  const minMs = minMin * 60_000
  const maxMs = maxMin * 60_000
  return Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs))
}

async function fire(): Promise<void> {
  const text = await generateWhisper()
  if (text && onWhisperFn) onWhisperFn(text)
  scheduleNext()
}

function scheduleNext(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void fire()
  }, nextDelayMs())
}

export function startWhisperEngine(onWhisper: (text: string) => void): void {
  onWhisperFn = onWhisper
  scheduleNext()
  logger.info('Whisper engine started')
}

export function stopWhisperEngine(): void {
  if (timer) clearTimeout(timer)
  timer = null
}

/** Trigger a whisper now (used when idle alert fires, if configured).
 *  Reschedules the next regular whisper so the user doesn't see two close together. */
export async function fireImmediate(): Promise<void> {
  const text = await generateWhisper()
  if (text && onWhisperFn) onWhisperFn(text)
  if (timer) scheduleNext()
}

/**
 * Surface a literal whisper text immediately (skips Claude generation).
 * Used by the pomodoro engine for phase-transition messages so they don't
 * burn API tokens and can include exact phrasing.
 */
export function surfaceWhisper(text: string): void {
  if (!text) return
  if (onWhisperFn) onWhisperFn(text)
}

/**
 * Generate a contextual hover suggestion — short one-liner triggered when
 * the user hovers over the avatar. Distinct from periodic whispers in tone:
 *   - more concrete (references current todos / time of day directly)
 *   - on-demand only, no caching beyond the standard 24h whisper dedup
 *   - returns null if no API key, network error, or empty result
 *
 * The user's hover is the signal that they want a nudge right now. Compaction
 * is implicit: we deliberately keep this to a 30-token oneShot so it's snappy.
 */
export async function generateHoverSuggestion(): Promise<string | null> {
  if (!(await hasApiKey())) return null
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const slot = getTimeSlot(now)
  const settings = settingsStore().get()

  // Pull a tiny snapshot of todos so the suggestion can reference them.
  let todoLine = ''
  try {
    const { getDaily } = await import('./todoStore')
    const d = getDaily()
    const open = d.todos.filter((t) => !t.done)
    if (open.length > 0) {
      todoLine = `\nOpen todos right now: ${open.slice(0, 5).map((t) => `"${t.text}"`).join(', ')}`
    }
  } catch {
    // ignore — suggestion still works without it
  }

  const system = `Current time: ${hhmm}, time slot: ${timeSlotLabel(slot)}
User context: ${settings.userContext}${todoLine}

The user is hovering over Clawd's avatar in their menubar. Generate ONE short, contextual suggestion (max 10 words) — a specific nudge or question that reflects what they should focus on right now. If they have open todos, you may pick the most timely one and prompt about it (e.g. "Knock out the eval harness?"). Otherwise reflect the time of day. No emoji. No quotes. Just the raw suggestion text.

Avoid these recent ones:
${recentWhispers().slice(0, 5).map((r) => `- ${r}`).join('\n') || '(none)'}`

  try {
    const text = await oneShot({
      system,
      user: 'Generate one suggestion now.',
      maxTokens: 30
    })
    const cleaned = text.trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '')
    if (cleaned) {
      rememberWhisper(cleaned)
      return cleaned
    }
    return null
  } catch (err) {
    logger.warn('Hover suggestion failed', err)
    return null
  }
}
