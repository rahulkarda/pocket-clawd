/**
 * Pomodoro streak tracker — counts consecutive calendar days with at least
 * one completed work block. Updated whenever the pomodoro engine reports a
 * newly-completed work block.
 *
 * Persistence: `pomodoro-streak.json` via electron-store, kept separate from
 * pomodoro live state so a session restart doesn't reset the streak.
 *
 * Update rule:
 *   - First completion ever: streak = 1, lastDay = today
 *   - Today already counted: no change
 *   - Yesterday was last day: streak += 1, lastDay = today
 *   - Anything older: streak = 1 (broken), lastDay = today
 */
import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import logger from './logger'

interface StreakShape {
  currentDays: number
  longestDays: number
  lastDayWithCompletion: string // 'YYYY-MM-DD' or ''
}

class StreakStore {
  private store: Store<StreakShape>
  constructor() {
    this.store = new Store<StreakShape>({
      name: 'pomodoro-streak',
      defaults: { currentDays: 0, longestDays: 0, lastDayWithCompletion: '' }
    })
  }
  get(): StreakShape {
    return {
      currentDays: this.store.get('currentDays') ?? 0,
      longestDays: this.store.get('longestDays') ?? 0,
      lastDayWithCompletion: this.store.get('lastDayWithCompletion') ?? ''
    }
  }
  set(patch: Partial<StreakShape>): void {
    for (const k of Object.keys(patch) as Array<keyof StreakShape>) {
      const v = patch[k]
      if (v !== undefined) this.store.set(k, v as never)
    }
  }
}

let _store: StreakStore | null = null
function store(): StreakStore {
  if (!_store) _store = new StreakStore()
  return _store
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

/** Public state — what the renderer sees. */
export interface StreakState {
  currentDays: number
  longestDays: number
  /** True iff today is included in `currentDays`. */
  todayCounts: boolean
}

/** Track the lifetime work-blocks-completed count we've seen so we know
 *  which broadcasts represent a NEW completion vs. a redundant status push. */
let lastSeenCompleted = -1

export function getState(): StreakState {
  const s = store().get()
  return {
    currentDays: s.currentDays,
    longestDays: s.longestDays,
    todayCounts: s.lastDayWithCompletion === todayKey()
  }
}

/** Recompute "currentDays" given today's date — handles app reopens after
 *  a multi-day gap so the displayed streak isn't stale. */
function refreshTransientState(): void {
  const s = store().get()
  // If the last completion was neither today nor yesterday, the streak is
  // OVER but we don't reset it until the next completion occurs (so the UI
  // can show "you had a 7-day streak" rather than dropping silently).
  // Companion can choose to display 0 if `todayCounts && currentDays > 0`.
  if (s.lastDayWithCompletion === todayKey()) return
  if (s.lastDayWithCompletion === yesterdayKey()) return
  // No-op — `getState().todayCounts` will be false, signalling the streak
  // is at risk. We don't write to store here.
}

/**
 * Called when the pomodoro engine reports its current
 * `workBlocksCompleted`. We compare against the last seen value; if it
 * went up by ≥1, that's a new completion → bump the streak.
 */
export function onPomodoroWorkBlocksCompletedChanged(total: number): void {
  if (lastSeenCompleted === -1) {
    // First broadcast since boot — initialize without bumping.
    lastSeenCompleted = total
    refreshTransientState()
    broadcast(IPC.POMODORO_STREAK_STATE, getState())
    return
  }
  if (total <= lastSeenCompleted) return
  lastSeenCompleted = total

  const s = store().get()
  const today = todayKey()
  if (s.lastDayWithCompletion === today) {
    // Already counted today; only broadcast in case renderers are listening.
    broadcast(IPC.POMODORO_STREAK_STATE, getState())
    return
  }
  let newCurrent: number
  if (s.lastDayWithCompletion === yesterdayKey()) {
    newCurrent = s.currentDays + 1
  } else {
    newCurrent = 1 // streak reset (or first ever)
  }
  const newLongest = Math.max(s.longestDays, newCurrent)
  store().set({
    currentDays: newCurrent,
    longestDays: newLongest,
    lastDayWithCompletion: today
  })
  logger.info(`Pomodoro streak: ${newCurrent} day${newCurrent === 1 ? '' : 's'} (longest ${newLongest})`)
  broadcast(IPC.POMODORO_STREAK_STATE, getState())
}
