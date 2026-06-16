/**
 * Emote engine — watches system signals (CPU load, low battery) and asks
 * Clawd to react with a brief emoji emote.
 *
 * Triggers (any one fires once, with a 10-minute floor between fires):
 *   - 1-minute load average > 4 → 😅 "hang in there"
 *   - low battery + on battery → 🪫
 *
 * Cheap to run; checks every 30s.
 */
import os from 'os'
import { BrowserWindow, powerMonitor } from 'electron'
import { IPC } from '@shared/ipc'
import logger from './logger'

const CHECK_INTERVAL_MS = 30_000
const FLOOR_MS = 10 * 60 * 1000 // don't double-fire within 10 minutes
const HIGH_LOAD_THRESHOLD = 4

let timer: NodeJS.Timeout | null = null
let lastEmoteAt = 0

function broadcast(emoji: string, durationMs: number): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      w.webContents.send(IPC.AVATAR_EMOTE, { emoji, durationMs })
    }
  }
}

function check(): void {
  const now = Date.now()
  if (now - lastEmoteAt < FLOOR_MS) return

  const load1 = os.loadavg()[0] ?? 0
  if (load1 > HIGH_LOAD_THRESHOLD) {
    lastEmoteAt = now
    broadcast('😅', 10_000)
    logger.info(`Emote: high CPU load ${load1.toFixed(1)}`)
    return
  }

  // Battery check — only if on AC/DC info available.
  try {
    const isOnBattery = powerMonitor.isOnBatteryPower?.()
    if (isOnBattery) {
      // We can't read level reliably without `systemPreferences` calls;
      // skip until Phase 4. Keep the hook here so it's easy to extend.
    }
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
