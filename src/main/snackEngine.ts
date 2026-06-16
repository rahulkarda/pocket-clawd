/**
 * Snack — give Clawd a snack and watch them nibble for 3 seconds.
 *
 * Cooldown: 4 seconds between snacks (so users can't spam-stack).
 * Lifetime counter persisted in electron-store. Broadcasts a SNACK_EVENT
 * with `durationMs` so the renderer can run the chomp animation for
 * exactly the right duration.
 *
 * No tick loop — just a one-shot broadcast per call.
 */
import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { SnackEvent, SnackStats } from '@shared/types'
import logger from './logger'

const COOLDOWN_MS = 4000
const SNACK_DURATION_MS = 3000

interface ShapeT extends SnackStats {}

class SnackStore {
  private store: Store<ShapeT>
  constructor() {
    this.store = new Store<ShapeT>({
      name: 'snack-stats',
      defaults: { count: 0, lastGivenAt: 0 }
    })
  }
  get(): SnackStats {
    return {
      count: this.store.get('count') ?? 0,
      lastGivenAt: this.store.get('lastGivenAt') ?? 0
    }
  }
  set(patch: Partial<SnackStats>): void {
    for (const k of Object.keys(patch) as Array<keyof SnackStats>) {
      const v = patch[k]
      if (v !== undefined) this.store.set(k, v as never)
    }
  }
}

let _store: SnackStore | null = null
function store(): SnackStore {
  if (!_store) _store = new SnackStore()
  return _store
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

async function whisper(text: string): Promise<void> {
  try {
    const mod = await import('./whisperEngine')
    const fn = (mod as unknown as { surfaceWhisper?: (t: string) => void }).surfaceWhisper
    if (typeof fn === 'function') fn(text)
  } catch {
    // ignore
  }
}

const ACK = ['nom nom nom…', 'nom nom! thanks!', '*munch* nom nom', 'nom nom nom 🥬', 'nom! delicious.', 'nom-nom-nom!', '*chomp* nom nom']

export function giveSnack(): SnackEvent | null {
  const s = store().get()
  const now = Date.now()
  if (now - s.lastGivenAt < COOLDOWN_MS) return null
  const newCount = s.count + 1
  store().set({ count: newCount, lastGivenAt: now })
  // Always whisper a "nom nom nom" — user feedback wants this consistent.
  void whisper(ACK[Math.floor(Math.random() * ACK.length)] ?? 'nom nom nom')
  const ev: SnackEvent = { count: newCount, durationMs: SNACK_DURATION_MS }
  broadcast(IPC.SNACK_EVENT, ev)
  void import('./sound').then((m) => m.playSound('snack')).catch(() => undefined)
  void import('./achievements')
    .then((m) => m.check())
    .catch(() => undefined)
  logger.info(`Snack given (lifetime ${newCount})`)
  return ev
}

export function getStats(): SnackStats {
  return store().get()
}
