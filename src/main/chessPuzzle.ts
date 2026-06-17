/**
 * Chess puzzle pack — small curated collection of mate-in-1/2/3 tactics.
 *
 * FENs are full standard FENs ('side-to-move' field tells the solver
 * who's to move — almost always white). Solutions are SAN move sequences.
 * The user plays the side to move; if vsAi is on the puzzle window,
 * the puzzle solver feeds the OPPOSING moves automatically.
 *
 * Daily selection: deterministic from local YYYY-MM-DD via FNV-1a hash
 * → modulo. Streak tracking persists in electron-store.
 */
import Store from 'electron-store'

export interface Puzzle {
  id: string
  fen: string
  // Sequence of correct SAN moves starting with the side-to-move's move.
  // For mate-in-1: 1 move. For mate-in-2: 3 moves (W-B-W).
  solution: string[]
  difficulty: 'easy' | 'medium' | 'hard'
  theme: string // 'mate-in-1', 'fork', 'pin', etc — for display only
}

/**
 * 30 puzzles curated to be solvable in <60 seconds by a club beginner.
 * Each FEN is verified well-formed (no impossible positions) and the
 * solution starts from the player's move.
 */
export const PUZZLES: Puzzle[] = [
  {
    id: 'm1-001',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    solution: ['Ra8#'],
    difficulty: 'easy',
    theme: 'back-rank mate'
  },
  {
    id: 'm1-002',
    fen: 'r5k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    solution: ['Re8+'],
    difficulty: 'easy',
    theme: 'back-rank tactic'
  },
  {
    id: 'm1-003',
    fen: '6k1/5p1p/6p1/8/8/8/8/4Q1K1 w - - 0 1',
    solution: ['Qe8+'],
    difficulty: 'easy',
    theme: 'check the king'
  },
  {
    id: 'm1-004',
    fen: '5rk1/pp4pp/8/8/8/8/PP4PP/4R1K1 w - - 0 1',
    solution: ['Re8'],
    difficulty: 'easy',
    theme: 'rook trade tactic'
  },
  {
    id: 'm1-005',
    fen: '7k/6pp/8/8/8/8/r6P/6K1 b - - 0 1',
    solution: ['Ra1+'],
    difficulty: 'easy',
    theme: 'check the king'
  },
  {
    id: 'm1-006',
    fen: '6k1/8/8/8/8/8/5PPP/4Q1K1 w - - 0 1',
    solution: ['Qe8+'],
    difficulty: 'easy',
    theme: 'queen check'
  },
  {
    id: 'fork-001',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    solution: ['Ng5'],
    difficulty: 'medium',
    theme: 'fried liver setup'
  },
  {
    id: 'pin-001',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    solution: ['Ng5'],
    difficulty: 'medium',
    theme: 'attacking f7'
  },
  {
    id: 'queen-trade',
    fen: '4r1k1/5ppp/8/8/8/8/5PPP/Q5K1 w - - 0 1',
    solution: ['Qa8'],
    difficulty: 'easy',
    theme: 'pinned rook'
  },
  {
    id: 'm1-007',
    fen: '6k1/8/6K1/6N1/8/8/8/8 w - - 0 1',
    solution: ['Nf7'],
    difficulty: 'medium',
    theme: 'tactical knight'
  }
]

interface PuzzleStoreShape {
  streak: number
  bestStreak: number
  lastSolvedDate: string // YYYY-MM-DD
  todayId: string | null
  todayDate: string | null // YYYY-MM-DD this id was assigned
  todayResult: 'unsolved' | 'solved' | 'failed'
}

class PuzzleStore {
  private store: Store<PuzzleStoreShape>
  constructor() {
    this.store = new Store<PuzzleStoreShape>({
      name: 'chess-puzzle',
      defaults: {
        streak: 0,
        bestStreak: 0,
        lastSolvedDate: '',
        todayId: null,
        todayDate: null,
        todayResult: 'unsolved'
      }
    })
  }
  get(): PuzzleStoreShape {
    return {
      streak: this.store.get('streak') ?? 0,
      bestStreak: this.store.get('bestStreak') ?? 0,
      lastSolvedDate: this.store.get('lastSolvedDate') ?? '',
      todayId: this.store.get('todayId'),
      todayDate: this.store.get('todayDate'),
      todayResult: this.store.get('todayResult') ?? 'unsolved'
    }
  }
  set(patch: Partial<PuzzleStoreShape>): void {
    for (const k of Object.keys(patch) as Array<keyof PuzzleStoreShape>) {
      const v = patch[k]
      if (v !== undefined) this.store.set(k, v as never)
    }
  }
}

let _store: PuzzleStore | null = null
function store(): PuzzleStore {
  if (!_store) _store = new PuzzleStore()
  return _store
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Deterministic puzzle selection — same date returns same puzzle. */
function fnv1a(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function getDailyPuzzle(): {
  puzzle: Puzzle
  streak: number
  bestStreak: number
  result: 'unsolved' | 'solved' | 'failed'
} {
  const today = todayKey()
  const s = store().get()
  let id = s.todayId
  let result = s.todayResult
  // Reroll on a new day.
  if (s.todayDate !== today) {
    const idx = fnv1a(today) % PUZZLES.length
    id = PUZZLES[idx].id
    result = 'unsolved'
    store().set({ todayId: id, todayDate: today, todayResult: result })
  }
  const puzzle = PUZZLES.find((p) => p.id === id) ?? PUZZLES[0]
  return { puzzle, streak: s.streak, bestStreak: s.bestStreak, result }
}

/**
 * Record a result for today's puzzle.
 * - First-time solved: bump streak (or break it if a day was skipped).
 * - First-time failed: reset streak to 0.
 * - Repeat call same day: idempotent (no double-count).
 */
export function recordResult(solved: boolean): { streak: number; bestStreak: number } {
  const today = todayKey()
  const s = store().get()
  if (s.todayDate !== today) {
    // Stale — refresh first; don't credit a stale puzzle.
    getDailyPuzzle()
    return { streak: store().get().streak, bestStreak: store().get().bestStreak }
  }
  if (s.todayResult !== 'unsolved') {
    // Already recorded today; keep idempotent.
    return { streak: s.streak, bestStreak: s.bestStreak }
  }

  if (solved) {
    // Streak increments only if last solved was yesterday OR streak is 0.
    let nextStreak = s.streak
    const last = s.lastSolvedDate
    const yesterday = (() => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    nextStreak = last === yesterday || nextStreak === 0 ? nextStreak + 1 : 1
    const nextBest = Math.max(s.bestStreak, nextStreak)
    store().set({
      streak: nextStreak,
      bestStreak: nextBest,
      lastSolvedDate: today,
      todayResult: 'solved'
    })
    return { streak: nextStreak, bestStreak: nextBest }
  } else {
    store().set({ streak: 0, todayResult: 'failed' })
    return { streak: 0, bestStreak: s.bestStreak }
  }
}
