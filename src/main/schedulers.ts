/**
 * Background schedulers — daily summary whisper + smart hour bell +
 * clipboard listener. All three live in main process and tick on
 * lightweight intervals; each gates on its own setting so users can
 * disable independently.
 */
import { clipboard } from 'electron'
import { createHash } from 'crypto'
import { settingsStore } from './settings'
import { playSound } from './sound'
import logger from './logger'

let summaryTimer: NodeJS.Timeout | null = null
let bellTimer: NodeJS.Timeout | null = null
let clipboardTimer: NodeJS.Timeout | null = null
let lastSummaryDate = '' // YYYY-MM-DD of the last fired summary
let lastBellHour = -1
// Store a fingerprint, not the plaintext, so a copied secret doesn't
// linger in main-process memory longer than necessary.
let lastClipboardFingerprint = ''

function fingerprint(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function whisper(text: string): Promise<void> {
  try {
    const m = await import('./whisperEngine')
    m.surfaceWhisper(text)
  } catch {
    // ignore
  }
}

/**
 * Daily summary — at the configured hour, aggregates a tiny stat
 * snapshot and surfaces it through the whisper system.
 */
async function fireSummary(): Promise<void> {
  try {
    const todoStore = await import('./todoStore')
    const petting = await import('./pettingEngine')
    const snack = await import('./snackEngine')
    const pomo = await import('./pomodoro')
    const daily = todoStore.getDaily()
    const todosDone = daily.todos.filter((t) => t.done).length
    const blocks = pomo.getStatus().workBlocksCompleted
    const pets = petting.getStats().count
    const snacks = snack.getStats().count
    const parts: string[] = []
    if (todosDone > 0) parts.push(`${todosDone} todo${todosDone === 1 ? '' : 's'}`)
    if (blocks > 0) parts.push(`${blocks} pomodoro${blocks === 1 ? '' : 's'}`)
    if (pets > 0) parts.push(`${pets} pet${pets === 1 ? '' : 's'}`)
    if (snacks > 0) parts.push(`${snacks} snack${snacks === 1 ? '' : 's'}`)
    const text = parts.length > 0
      ? `Today so far: ${parts.join(', ')}. Nice.`
      : "Quiet day. Tomorrow's a fresh start."
    void whisper(text)
  } catch (err) {
    logger.warn('Daily summary failed', err)
  }
}

function checkSummary(): void {
  const s = settingsStore().get()
  if (s.summaryHour < 0 || s.summaryHour > 23) return
  const now = new Date()
  if (now.getHours() !== s.summaryHour) return
  const key = todayKey()
  if (lastSummaryDate === key) return
  lastSummaryDate = key
  void fireSummary()
}

function checkBell(): void {
  const s = settingsStore().get()
  if (!s.hourBellEnabled) return
  const now = new Date()
  const h = now.getHours()
  // Fire only at minute 0 (with a small grace window since we tick on 60s)
  // and only inside the configured window. End is exclusive.
  if (h < s.hourBellStart || h >= s.hourBellEnd) return
  if (now.getMinutes() !== 0) return
  if (lastBellHour === h) return
  lastBellHour = h
  void playSound('pomo-break')
}

function checkClipboard(): void {
  const s = settingsStore().get()
  if (!s.clipboardSuggestions) return
  let text = ''
  try {
    text = clipboard.readText() ?? ''
  } catch {
    return
  }
  text = text.trim()
  if (!text) return
  const fp = fingerprint(text)
  if (fp === lastClipboardFingerprint) return
  lastClipboardFingerprint = fp
  // Only react to URLs.
  if (!/^https?:\/\/\S+$/i.test(text)) return
  void whisper(`Copied a URL — open chat and ask me to summarize it.`)
}

export function startSchedulers(): void {
  if (summaryTimer || bellTimer || clipboardTimer) return
  // Prime the clipboard fingerprint with whatever's already on the
  // clipboard at boot, so a URL the user copied minutes ago in another
  // app doesn't surface a phantom "summarize this?" whisper as soon as
  // Clawd starts. Only diffs-after-boot fire.
  try {
    const existing = clipboard.readText()?.trim() ?? ''
    if (existing) lastClipboardFingerprint = fingerprint(existing)
  } catch {
    // ignore
  }
  // Coarse 60s tick handles both summary and bell.
  summaryTimer = setInterval(() => {
    checkSummary()
    checkBell()
  }, 60_000)
  // Clipboard watcher ticks at 1.5s so a freshly-copied URL surfaces fast.
  clipboardTimer = setInterval(checkClipboard, 1500)
  logger.info('Background schedulers started (summary, bell, clipboard)')
}

export function shutdown(): void {
  if (summaryTimer) clearInterval(summaryTimer)
  if (bellTimer) clearInterval(bellTimer)
  if (clipboardTimer) clearInterval(clipboardTimer)
  summaryTimer = null
  bellTimer = null
  clipboardTimer = null
}
