/**
 * Chess game store — owns a single in-memory game instance plus a small
 * persistence shell (so closing the chess window doesn't lose state).
 *
 * Phase A: human-vs-self only. The window UI drives both sides; main
 * just validates and broadcasts. Phase B will plug an AI in here.
 *
 * Persistence: the latest game's FEN + move history is saved in
 * electron-store under `chess-game`, keyed by a single slot. Restored on
 * the next /chess open. Resetting the board wipes the slot.
 */
import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import {
  initialState,
  applyMove,
  legalMoves,
  gameStatus,
  toFEN,
  fromFEN,
  moveToAlgebraic,
  parseAlgebraic,
  pieceType,
  colorOf,
  type GameState,
  type Move,
  type Color
} from '@shared/chess'
import logger from './logger'

interface ChessStoreShape {
  fen: string | null
  history: string[] // SAN strings, in order
  // Phase B: ai opponent flag + side; ignored in Phase A.
  vsAi: boolean
  aiColor: Color
}

class ChessStore {
  private store: Store<ChessStoreShape>
  constructor() {
    this.store = new Store<ChessStoreShape>({
      name: 'chess-game',
      defaults: { fen: null, history: [], vsAi: false, aiColor: 'b' }
    })
  }
  get(): ChessStoreShape {
    return {
      fen: this.store.get('fen'),
      history: this.store.get('history') ?? [],
      vsAi: this.store.get('vsAi') ?? false,
      aiColor: this.store.get('aiColor') ?? 'b'
    }
  }
  set(patch: Partial<ChessStoreShape>): void {
    for (const k of Object.keys(patch) as Array<keyof ChessStoreShape>) {
      const v = patch[k]
      if (v !== undefined) this.store.set(k, v as never)
    }
  }
}

let _store: ChessStore | null = null
function store(): ChessStore {
  if (!_store) _store = new ChessStore()
  return _store
}

/** In-memory current state. Always synced with persisted FEN. */
let current: GameState = initialState()
let history: string[] = []

function loadFromStore(): void {
  const s = store().get()
  if (s.fen) {
    const parsed = fromFEN(s.fen)
    if (parsed) {
      current = parsed
      history = s.history.slice()
      return
    }
    logger.warn('chess: stored FEN was invalid, resetting')
  }
  current = initialState()
  history = []
}

function saveToStore(): void {
  store().set({ fen: toFEN(current), history })
}

function broadcast(): void {
  const status = gameStatus(current)
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    w.webContents.send(IPC.CHESS_STATE, {
      fen: toFEN(current),
      history: history.slice(),
      status,
      legalMoves: legalMovesAsAlg(),
      turn: current.turn,
      vsAi: store().get().vsAi,
      aiColor: store().get().aiColor
    })
  }
}

function legalMovesAsAlg(): string[] {
  return legalMoves(current).map((m) => moveToAlgebraic(current, m))
}

/* ─── Whisper reactions ─────────────────────────────────────── */

const PIECE_NAMES: Record<string, string> = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'
}

function reactionAfterMove(prev: GameState, move: Move): string | null {
  const moverPiece = prev.board[move.from[0]][move.from[1]]
  if (!moverPiece) return null
  const captured = prev.board[move.to[0]][move.to[1]]
  // Only react to OUR moves (the player driving the board); when AI plays
  // (Phase B), it gets its own commentary path. Here we just describe.
  const after = applyMove(prev, move)
  const status = gameStatus(after)

  if (status === 'checkmate') {
    // After applyMove `current.turn` is the side that just got mated.
    // The mover (winner) is the opposite color. If the AI is playing
    // and it's the AI that won, ggwp; if the user mated the AI, "you got me!".
    const s = store().get()
    const winner = colorOf(moverPiece)
    if (s.vsAi) {
      return winner === s.aiColor ? 'mate. ggwp.' : 'you got me!'
    }
    return 'checkmate.'
  }
  if (status === 'stalemate') return 'stalemate. interesting.'
  if (status === 'check') return 'check!'
  if (move.promotion) return 'promotion!'
  if (captured) {
    const name = PIECE_NAMES[pieceType(captured).toUpperCase()] ?? 'piece'
    return name === 'queen' ? 'oof, queen down.' : `${name} down.`
  }
  if (pieceType(moverPiece) === 'K' && Math.abs(move.to[1] - move.from[1]) === 2) {
    return 'castled.'
  }
  return null
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

/* ─── Public API ────────────────────────────────────────────── */

export function getState(): {
  fen: string
  history: string[]
  status: ReturnType<typeof gameStatus>
  legalMoves: string[]
  turn: Color
  vsAi: boolean
  aiColor: Color
} {
  return {
    fen: toFEN(current),
    history: history.slice(),
    status: gameStatus(current),
    legalMoves: legalMovesAsAlg(),
    turn: current.turn,
    vsAi: store().get().vsAi,
    aiColor: store().get().aiColor
  }
}

/**
 * Try to make a move. Accepts either a structured move or an algebraic
 * string. Returns { ok, san?, status?, error? }.
 *
 * Phase A: any caller can move either side. Phase B will gate based on
 * vsAi + whose turn it is.
 */
export function tryMove(input: Move | string): {
  ok: boolean
  san?: string
  error?: string
} {
  let move: Move | null = null
  if (typeof input === 'string') {
    move = parseAlgebraic(current, input)
    if (!move) return { ok: false, error: `couldn't parse "${input}"` }
  } else {
    // Validate by checking against legalMoves
    const legal = legalMoves(current).find(
      (m) =>
        m.from[0] === input.from[0] &&
        m.from[1] === input.from[1] &&
        m.to[0] === input.to[0] &&
        m.to[1] === input.to[1] &&
        (input.promotion ?? null) === (m.promotion ?? null)
    )
    if (!legal) {
      // Maybe promotion not specified; allow if there's exactly one promotion option
      const promoCands = legalMoves(current).filter(
        (m) =>
          m.from[0] === input.from[0] &&
          m.from[1] === input.from[1] &&
          m.to[0] === input.to[0] &&
          m.to[1] === input.to[1]
      )
      if (promoCands.length === 0) return { ok: false, error: 'illegal move' }
      // Default to queen promotion if user didn't specify
      const queenPromo = promoCands.find((m) => m.promotion?.toUpperCase() === 'Q')
      move = queenPromo ?? promoCands[0]
    } else {
      move = legal
    }
  }

  const san = moveToAlgebraic(current, move)
  const prev = current
  current = applyMove(current, move)
  history.push(san)
  saveToStore()

  const reaction = reactionAfterMove(prev, move)
  if (reaction) void whisper(reaction)

  broadcast()
  // Notify the openings drill (if active) so it can validate the move
  // matches the expected line.
  void import('./chessOpenings').then((m) => m.onUserMove(san)).catch(() => undefined)
  // Phase B: if vsAi and it's now AI's turn, kick off AI move.
  void maybeAiMove()
  return { ok: true, san }
}

export function reset(): void {
  current = initialState()
  history = []
  saveToStore()
  broadcast()
}

/**
 * Load a position from FEN. Used by /puzzle to drop the user into a
 * specific tactical position. Resets move history (a puzzle is its own
 * mini-game). Returns false if the FEN is malformed.
 */
export function loadFEN(fen: string): boolean {
  const parsed = fromFEN(fen)
  if (!parsed) return false
  current = parsed
  history = []
  saveToStore()
  broadcast()
  return true
}

export function setVsAi(enabled: boolean, aiColor: Color = 'b'): void {
  store().set({ vsAi: enabled, aiColor })
  broadcast()
  // If turning AI on while it's its turn, kick a move.
  void maybeAiMove()
}

/**
 * Phase B hook — placeholder. Real implementation lives in `chessAI.ts`.
 * Kept here as a one-line dynamic import to avoid a hard dependency in
 * Phase A and to keep the store loadable when the AI module is absent.
 */
async function maybeAiMove(): Promise<void> {
  const s = store().get()
  if (!s.vsAi) return
  if (current.turn !== s.aiColor) return
  if (gameStatus(current) === 'checkmate' || gameStatus(current) === 'stalemate') return
  try {
    const ai = await import('./chessAI')
    const m = ai.pickMove(current)
    if (m) {
      // Small delay so the move feels deliberate, not instant.
      setTimeout(() => {
        // Re-check turn in case the user reset mid-think.
        if (current.turn !== s.aiColor) return
        const san = moveToAlgebraic(current, m)
        current = applyMove(current, m)
        history.push(san)
        saveToStore()
        // Whisper AI commentary asynchronously (Phase B fills in).
        void ai.commentaryFor?.(toFEN(current), san)?.then((text) => {
          if (text) void whisper(text)
        })
        broadcast()
      }, 350)
    }
  } catch {
    // chessAI not available (Phase A) — do nothing.
  }
}

export function startChess(): void {
  loadFromStore()
}

export function shutdown(): void {
  saveToStore()
}
