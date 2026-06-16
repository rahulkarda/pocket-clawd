/**
 * Achievements — local milestones based on aggregate counters from petting,
 * snacks, pomodoro, fun mode, and todos.
 *
 * Catalog is static. Each achievement has a `predicate(ctx) → boolean`.
 * The runner is invoked from the periodic checks in pomodoro / petting /
 * snack engines. Earned achievements are persisted with their timestamp.
 *
 * On first earn we surface a whisper + broadcast ACHIEVEMENTS_EVENT so the
 * Companion window can refresh and toast.
 */
import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { Achievement, AchievementEarned, AchievementsState } from '@shared/types'
import logger from './logger'

interface PredicateCtx {
  petCount: number
  snackCount: number
  pomodoroCompleted: number
  todoCompletedToday: number
  funModeStartedTotal: number // optional, future
}

interface AchievementDef extends Achievement {
  predicate: (ctx: PredicateCtx) => boolean
}

const CATALOG: AchievementDef[] = [
  {
    id: 'first-pet',
    label: 'First Touch',
    description: 'Pet Clawd for the first time.',
    emoji: '👋',
    predicate: (c) => c.petCount > 0
  },
  {
    id: 'pet-10',
    label: 'Friend',
    description: 'Pet Clawd 10 times.',
    emoji: '🌱',
    predicate: (c) => c.petCount >= 10
  },
  {
    id: 'pet-100',
    label: 'Best Friend',
    description: 'Pet Clawd 100 times.',
    emoji: '🌸',
    predicate: (c) => c.petCount >= 100
  },
  {
    id: 'pet-1000',
    label: 'Soulmate',
    description: 'Pet Clawd 1,000 times.',
    emoji: '💖',
    predicate: (c) => c.petCount >= 1000
  },
  {
    id: 'snack-1',
    label: 'Generous',
    description: 'Give Clawd a snack.',
    emoji: '🥬',
    predicate: (c) => c.snackCount >= 1
  },
  {
    id: 'snack-10',
    label: 'Caretaker',
    description: 'Give Clawd 10 snacks.',
    emoji: '🍱',
    predicate: (c) => c.snackCount >= 10
  },
  {
    id: 'pomo-1',
    label: 'First Focus',
    description: 'Complete one pomodoro.',
    emoji: '⏱️',
    predicate: (c) => c.pomodoroCompleted >= 1
  },
  {
    id: 'pomo-10',
    label: 'Steady Worker',
    description: 'Complete 10 pomodoros.',
    emoji: '🔟',
    predicate: (c) => c.pomodoroCompleted >= 10
  },
  {
    id: 'pomo-50',
    label: 'Deep Work',
    description: 'Complete 50 pomodoros.',
    emoji: '🛠️',
    predicate: (c) => c.pomodoroCompleted >= 50
  },
  {
    id: 'todo-3-day',
    label: 'Task Trio',
    description: 'Complete 3 todos in a single day.',
    emoji: '✅',
    predicate: (c) => c.todoCompletedToday >= 3
  }
]

class AchievementsStore {
  private store: Store<AchievementsState>
  constructor() {
    this.store = new Store<AchievementsState>({
      name: 'achievements',
      defaults: { earned: [] }
    })
  }
  get(): AchievementsState {
    return { earned: this.store.get('earned') ?? [] }
  }
  add(id: string): void {
    const cur = this.get().earned
    if (cur.find((e) => e.id === id)) return
    cur.push({ id, earnedAt: Date.now() })
    this.store.set('earned', cur)
  }
}

let _store: AchievementsStore | null = null
function store(): AchievementsStore {
  if (!_store) _store = new AchievementsStore()
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

/**
 * Build the predicate context by reading from the various engines and the
 * todoStore. Cheap; called on each significant state change.
 */
async function buildCtx(): Promise<PredicateCtx> {
  const petting = await import('./pettingEngine')
  const snack = await import('./snackEngine')
  const pomodoro = await import('./pomodoro')
  const todoStore = await import('./todoStore')
  const dailyTodos = todoStore.getDaily()
  return {
    petCount: petting.getStats().count,
    snackCount: snack.getStats().count,
    pomodoroCompleted: pomodoro.getStatus().workBlocksCompleted,
    todoCompletedToday: dailyTodos.todos.filter((t) => t.done).length,
    funModeStartedTotal: 0
  }
}

/**
 * Run the predicates against current state. Surface whispers + broadcast
 * for any newly-earned achievement.
 */
export async function check(): Promise<void> {
  try {
    const ctx = await buildCtx()
    const cur = new Set(store().get().earned.map((e) => e.id))
    let newAny = false
    for (const a of CATALOG) {
      if (cur.has(a.id)) continue
      if (a.predicate(ctx)) {
        store().add(a.id)
        cur.add(a.id)
        newAny = true
        void whisper(`achievement: ${a.label} ${a.emoji}`)
        void import('./sound').then((m) => m.playSound('achievement')).catch(() => undefined)
        logger.info(`Achievement earned: ${a.id}`)
      }
    }
    if (newAny) {
      broadcast(IPC.ACHIEVEMENTS_EVENT, store().get())
    }
  } catch (err) {
    logger.warn('Achievements check failed', err)
  }
}

export function getCatalog(): Achievement[] {
  return CATALOG.map(({ predicate: _p, ...rest }) => rest)
}

export function getEarned(): AchievementsState {
  return store().get()
}

/** Periodic ticker — runs every 30s while the app is alive. */
let timer: NodeJS.Timeout | null = null
export function start(): void {
  if (timer) return
  timer = setInterval(() => {
    void check()
  }, 30_000)
  // Run once immediately so existing-state achievements (e.g. user already
  // had 100 pets before this engine existed) get marked on first launch.
  void check()
}

export function shutdown(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
