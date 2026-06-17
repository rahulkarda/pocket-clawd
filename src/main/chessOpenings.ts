/**
 * Chess openings drill — quiz the user on a small set of opening lines.
 *
 * Phase C: 3 openings (Sicilian Najdorf, Italian, Queen's Gambit Declined).
 * Each is a sequence of canonical moves. The drill works by replaying
 * the line move-by-move on the chess board:
 *   - Computer plays the "white" half of each pair as the line dictates
 *   - User plays the "black" half (or vice versa for openings where they're
 *     defending). On wrong move, gently mark and re-prompt.
 *
 * Persistence: each opening tracks `successes` and `failures` so we can
 * surface which lines need work (Phase C scope: just count them).
 */
import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import {
  initialState,
  applyMove,
  parseAlgebraic,
  toFEN,
  type GameState
} from '@shared/chess'

interface OpeningLine {
  slug: string
  name: string
  /** SAN moves in order, starting with white's first move. */
  moves: string[]
  /** Which side the USER plays. 'w' or 'b'. */
  userSide: 'w' | 'b'
}

const OPENINGS: OpeningLine[] = [
  {
    slug: 'sicilian',
    name: 'Sicilian Najdorf',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    userSide: 'b'
  },
  {
    slug: 'italian',
    name: 'Italian Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6'],
    userSide: 'w'
  },
  {
    slug: 'qgd',
    name: "Queen's Gambit Declined",
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'],
    userSide: 'b'
  }
]

interface OpeningsStoreShape {
  // map of slug -> { successes, failures }
  stats: Record<string, { successes: number; failures: number }>
  // Active drill
  activeSlug: string | null
  activeMoveIndex: number // next move INDEX to play
}

class OpeningsStore {
  private store: Store<OpeningsStoreShape>
  constructor() {
    this.store = new Store<OpeningsStoreShape>({
      name: 'chess-openings',
      defaults: { stats: {}, activeSlug: null, activeMoveIndex: 0 }
    })
  }
  get(): OpeningsStoreShape {
    return {
      stats: this.store.get('stats') ?? {},
      activeSlug: this.store.get('activeSlug'),
      activeMoveIndex: this.store.get('activeMoveIndex') ?? 0
    }
  }
  set(patch: Partial<OpeningsStoreShape>): void {
    for (const k of Object.keys(patch) as Array<keyof OpeningsStoreShape>) {
      const v = patch[k]
      if (v !== undefined) this.store.set(k, v as never)
    }
  }
}

let _store: OpeningsStore | null = null
function store(): OpeningsStore {
  if (!_store) _store = new OpeningsStore()
  return _store
}

async function whisper(text: string): Promise<void> {
  if (!text) return
  try {
    const m = await import('./whisperEngine')
    m.surfaceWhisper(text)
  } catch {
    // ignore
  }
}

function broadcast(payload: {
  active: boolean
  slug?: string
  name?: string
  expectedMove?: string
  userSide?: 'w' | 'b'
  movesPlayed?: number
  total?: number
}): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.CHESS_OPENING_STATE, payload)
  }
}

/**
 * Start an openings drill. Resets the chess game to the standard
 * starting position, then plays the COMPUTER's moves (the side the
 * user is NOT playing) until it's the user's turn. The user makes the
 * expected move; if wrong, we whisper "not the line — try again".
 */
export async function start(slug: string): Promise<{ ok: boolean; error?: string }> {
  const opening = OPENINGS.find((o) => o.slug === slug)
  if (!opening) {
    return {
      ok: false,
      error: `Unknown opening "${slug}". Try sicilian, italian, or qgd.`
    }
  }
  // Reset the game store to a fresh board.
  const game = await import('./chessGame')
  game.reset()
  // Disable vs-AI mode for the drill — we're driving moves directly.
  game.setVsAi(false, 'b')

  store().set({ activeSlug: slug, activeMoveIndex: 0 })

  // Play computer moves until it's the user's turn.
  await advanceComputerMoves(opening, 0)

  // Open the chess window so the user can see the position.
  void import('./secondaryWindows').then((m) => m.createChessWindow())

  void whisper(`Drill: ${opening.name}. Your move.`)
  return { ok: true }
}

/**
 * Advance the computer's moves starting from `fromIndex`. Returns when
 * either the line is complete or it's the user's turn.
 */
async function advanceComputerMoves(opening: OpeningLine, fromIndex: number): Promise<void> {
  const game = await import('./chessGame')
  let i = fromIndex
  while (i < opening.moves.length) {
    const turnIsWhite = i % 2 === 0
    const isUserTurn =
      (opening.userSide === 'w' && turnIsWhite) ||
      (opening.userSide === 'b' && !turnIsWhite)
    if (isUserTurn) break
    // Computer plays the next move from the line.
    const san = opening.moves[i]
    const res = game.tryMove(san)
    if (!res.ok) {
      // Shouldn't happen if the line is correct; bail gracefully.
      await whisper('drill: line problem, stopping.')
      store().set({ activeSlug: null, activeMoveIndex: 0 })
      broadcast({ active: false })
      return
    }
    i++
  }
  store().set({ activeMoveIndex: i })
  if (i >= opening.moves.length) {
    // Drill complete!
    const cur = store().get()
    const stats = { ...cur.stats }
    const slot = stats[opening.slug] ?? { successes: 0, failures: 0 }
    stats[opening.slug] = { successes: slot.successes + 1, failures: slot.failures }
    store().set({ stats, activeSlug: null, activeMoveIndex: 0 })
    void whisper(`drill complete: ${opening.name}. nice.`)
    broadcast({ active: false })
    return
  }
  broadcast({
    active: true,
    slug: opening.slug,
    name: opening.name,
    expectedMove: opening.moves[i],
    userSide: opening.userSide,
    movesPlayed: i,
    total: opening.moves.length
  })
}

/**
 * Called from chessGame after every successful USER move. Validates the
 * move matches the expected line; otherwise rolls back and prompts.
 *
 * Phase C: we don't roll back the game state on a wrong move (that
 * would require deep coupling to chessGame's history). Instead we
 * cancel the drill and tell the user. Quick to ship, easy to retry.
 */
export async function onUserMove(san: string): Promise<void> {
  const cur = store().get()
  if (!cur.activeSlug) return
  const opening = OPENINGS.find((o) => o.slug === cur.activeSlug)
  if (!opening) {
    store().set({ activeSlug: null, activeMoveIndex: 0 })
    return
  }
  const expected = opening.moves[cur.activeMoveIndex]
  // Compare loosely: strip +/# from both sides.
  const norm = (s: string): string => s.replace(/[+#]/g, '')
  if (norm(san) !== norm(expected)) {
    const stats = { ...cur.stats }
    const slot = stats[opening.slug] ?? { successes: 0, failures: 0 }
    stats[opening.slug] = { successes: slot.successes, failures: slot.failures + 1 }
    store().set({ stats, activeSlug: null, activeMoveIndex: 0 })
    void whisper(`not the line — expected ${expected}. drill ended.`)
    broadcast({ active: false })
    return
  }
  // Correct! Advance computer's reply.
  await advanceComputerMoves(opening, cur.activeMoveIndex + 1)
}

export function getActive(): OpeningsStoreShape {
  return store().get()
}

/** Validate the openings table once at startup so a typo in a SAN
 *  string can't silently bottle up a drill. Logs but doesn't crash. */
export function validateOpenings(): void {
  const errors: string[] = []
  for (const opening of OPENINGS) {
    let s: GameState = initialState()
    for (const san of opening.moves) {
      const m = parseAlgebraic(s, san)
      if (!m) {
        errors.push(`${opening.slug}: invalid move "${san}" at ply ${opening.moves.indexOf(san) + 1}`)
        break
      }
      s = applyMove(s, m)
    }
  }
  if (errors.length > 0) {
    void import('./logger').then(({ default: logger }) => {
      for (const e of errors) logger.warn(`chess openings: ${e}`)
    })
  }
}
