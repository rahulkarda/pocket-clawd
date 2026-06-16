/**
 * Collection — small visible reward items earned at pomodoro milestones.
 * Items render as emoji "trinkets" next to Clawd in the avatar slot.
 *
 * Award rule: every COMPLETED_PER_AWARD work blocks (default 4) you earn
 * one item from the rotating ITEMS pool. The check runs each time the
 * pomodoro engine broadcasts a workBlocksCompleted increment via its
 * status broadcast (we hook into that).
 *
 * Cap: max MAX_ITEMS items at a time (oldest drops off when full so the
 * UI doesn't get overcrowded).
 */
import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { CollectionItem, CollectionState, PomodoroStatus } from '@shared/types'
import logger from './logger'

const COMPLETED_PER_AWARD = 4
const MAX_ITEMS = 8

/** Pool of award candidates. Random pick on each award. */
const ITEMS: Array<{ emoji: string; label: string }> = [
  { emoji: '🪨', label: 'pet rock' },
  { emoji: '☕', label: 'coffee mug' },
  { emoji: '🌸', label: 'flower' },
  { emoji: '🍪', label: 'cookie' },
  { emoji: '🎁', label: 'gift' },
  { emoji: '🔮', label: 'crystal ball' },
  { emoji: '🌟', label: 'shiny star' },
  { emoji: '🍃', label: 'leaf' },
  { emoji: '🦋', label: 'butterfly' },
  { emoji: '🍄', label: 'mushroom' },
  { emoji: '🎈', label: 'balloon' },
  { emoji: '📚', label: 'book' }
]

interface ShapeT extends CollectionState {}

class CollectionStore {
  private store: Store<ShapeT>
  constructor() {
    this.store = new Store<ShapeT>({
      name: 'collection',
      defaults: { items: [], lastAwardedAtPomodoroCount: 0 }
    })
  }
  get(): CollectionState {
    return {
      items: this.store.get('items') ?? [],
      lastAwardedAtPomodoroCount: this.store.get('lastAwardedAtPomodoroCount') ?? 0
    }
  }
  set(patch: Partial<CollectionState>): void {
    for (const k of Object.keys(patch) as Array<keyof CollectionState>) {
      const v = patch[k]
      if (v !== undefined) this.store.set(k, v as never)
    }
  }
}

let _store: CollectionStore | null = null
function store(): CollectionStore {
  if (!_store) _store = new CollectionStore()
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

export function getState(): CollectionState {
  return store().get()
}

/**
 * Called whenever the pomodoro status broadcasts. If the lifetime
 * workBlocksCompleted has crossed a multiple of COMPLETED_PER_AWARD that
 * we haven't yet awarded for, grant one item.
 */
export function maybeAward(status: PomodoroStatus): void {
  const s = store().get()
  const total = status.workBlocksCompleted
  // How many awards SHOULD the user have at this completed-count?
  const owedAwards = Math.floor(total / COMPLETED_PER_AWARD)
  const alreadyAwardedFor = Math.floor(s.lastAwardedAtPomodoroCount / COMPLETED_PER_AWARD)
  if (owedAwards <= alreadyAwardedFor) return
  // Grant the difference (could be >1 if state desynced).
  const toGrant = owedAwards - alreadyAwardedFor
  const items: CollectionItem[] = [...s.items]
  for (let i = 0; i < toGrant; i++) {
    const pick = ITEMS[Math.floor(Math.random() * ITEMS.length)]
    if (!pick) continue
    items.push({
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      emoji: pick.emoji,
      label: pick.label,
      earnedAt: Date.now()
    })
    if (items.length > MAX_ITEMS) items.shift()
    void whisper(`new keepsake: a ${pick.label} ${pick.emoji}`)
  }
  store().set({ items, lastAwardedAtPomodoroCount: total })
  broadcast(IPC.COLLECTION_EVENT, { items })
  logger.info(`Collection: awarded ${toGrant} items, total ${items.length}`)
}
