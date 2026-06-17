/**
 * Dance engine — coordinates a short Clawd dance session.
 *
 * Main owns the START/STOP timing so callers (chat slash, tray, future
 * keyboard shortcut) all converge on one source of truth. The renderer
 * subscribes to AVATAR_DANCE_STATE and runs the actual animation +
 * looped beat sound locally — keeping audio + bob in lockstep doesn't
 * tolerate IPC jitter, so we don't try.
 */
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'

const DEFAULT_DANCE_MS = 8_000
const MAX_DANCE_MS = 30_000
const MIN_DANCE_MS = 2_000

let activeUntil = 0
let stopTimer: NodeJS.Timeout | null = null

function broadcast(active: boolean, remainingMs: number): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      w.webContents.send(IPC.AVATAR_DANCE_STATE, { active, remainingMs })
    }
  }
}

/**
 * Start (or extend) a dance session. Multiple calls within an active
 * session restart the timer, so /dance during a dance just refreshes
 * the duration rather than stacking timers.
 */
export function startDance(durationMs?: number): void {
  const dur = Math.max(
    MIN_DANCE_MS,
    Math.min(MAX_DANCE_MS, typeof durationMs === 'number' ? durationMs : DEFAULT_DANCE_MS)
  )
  activeUntil = Date.now() + dur
  if (stopTimer) clearTimeout(stopTimer)
  broadcast(true, dur)
  stopTimer = setTimeout(() => {
    activeUntil = 0
    stopTimer = null
    broadcast(false, 0)
  }, dur)
  // Surface a one-line whisper so something's visible even if sound
  // is muted. Avoid spam: the renderer's own tooltip text covers
  // repeats during an already-active session.
  void import('./whisperEngine')
    .then((m) => m.surfaceWhisper('dancing!'))
    .catch(() => undefined)
}

export function isDancing(): boolean {
  return Date.now() < activeUntil
}

export function shutdown(): void {
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  activeUntil = 0
}
