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
