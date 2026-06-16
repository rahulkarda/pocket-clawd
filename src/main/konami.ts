/**
 * Konami code detector — tracks the classic ↑↑↓↓←→←→BA sequence across
 * all of the app's BrowserWindows via the `before-input-event` hook.
 * Triggers a 30-second "rave mode" broadcast that the avatar listens to.
 *
 * Runs cheaply: each input event compares one char against the next-expected
 * char of the sequence and resets on mismatch. Per-window listeners are
 * attached as windows are created (registered from index.ts).
 */
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import logger from './logger'

const SEQUENCE: string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a'
]

const RAVE_DURATION_MS = 30_000

let progress = 0
let raveActive = false
let raveTimeout: NodeJS.Timeout | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function startRave(): void {
  if (raveActive) return
  raveActive = true
  broadcast(IPC.AVATAR_RAVE_STATE, { active: true, durationMs: RAVE_DURATION_MS })
  void import('./sound').then((m) => m.playSound('rave')).catch(() => undefined)
  if (raveTimeout) clearTimeout(raveTimeout)
  raveTimeout = setTimeout(() => {
    raveActive = false
    broadcast(IPC.AVATAR_RAVE_STATE, { active: false, durationMs: 0 })
    raveTimeout = null
  }, RAVE_DURATION_MS)
  logger.info('Konami code triggered — rave mode for 30s')
}

/**
 * Hook the input listener on a BrowserWindow. Idempotent — multiple calls
 * for the same window are deduped via a tagged property.
 */
const TAG = Symbol.for('pocket-clawd.konami')
type Tagged = BrowserWindow & { [TAG]?: boolean }
export function attachToWindow(win: BrowserWindow): void {
  const tagged = win as Tagged
  if (tagged[TAG]) return
  tagged[TAG] = true
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    const expected = SEQUENCE[progress]
    // Match on input.key. Letters arrive as 'b' / 'a' (lowercase) when
    // shift isn't held; that's what we want — fail otherwise.
    if (input.key === expected) {
      progress += 1
      if (progress >= SEQUENCE.length) {
        progress = 0
        startRave()
      }
    } else {
      // If the user re-pressed the first char, jump-restart.
      progress = input.key === SEQUENCE[0] ? 1 : 0
    }
  })
}

export function isRaveActive(): boolean {
  return raveActive
}

export function shutdown(): void {
  if (raveTimeout) {
    clearTimeout(raveTimeout)
    raveTimeout = null
  }
  raveActive = false
  progress = 0
}
