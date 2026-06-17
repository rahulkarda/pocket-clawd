/**
 * Emote engine — watches system signals (CPU load, low battery) and asks
 * Clawd to react with a brief emoji emote.
 *
 * Currently DISABLED: the high-CPU 😅 emote was overlaying Clawd's face
 * in a way that obscured the mascot. Keeping the engine wired so future
 * triggers can plug in, but `check()` is a no-op for now.
 *
 * Cheap to run; checks every 30s.
 */
import { BrowserWindow, powerMonitor } from 'electron'
import { IPC } from '@shared/ipc'

const CHECK_INTERVAL_MS = 30_000

let timer: NodeJS.Timeout | null = null

// Kept exported (unused) so future signals can plug in without re-wiring
// the broadcast plumbing.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function broadcast(emoji: string, durationMs: number): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      w.webContents.send(IPC.AVATAR_EMOTE, { emoji, durationMs })
    }
  }
}

function check(): void {
  // CPU-load 😅 emote removed per user request — the floating emoji
  // covered Clawd's face. Battery-low never landed (Phase 4 deferred).
  // Until something replaces them, this engine just ticks idly.
  try {
    void powerMonitor.isOnBatteryPower?.()
  } catch {
    // ignore
  }
}

export function start(): void {
  if (timer) return
  timer = setInterval(check, CHECK_INTERVAL_MS)
}

export function shutdown(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

