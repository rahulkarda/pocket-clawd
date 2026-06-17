/**
 * Chess AI — minimax with alpha-beta pruning, plus optional async Claude
 * commentary after each move.
 *
 * Phase B. Replaces the Phase A stub. Hybrid design:
 *   - Move selection is INSTANT (synchronous minimax). The user never
 *     waits for the LLM to think.
 *   - Commentary is fire-and-forget after the move is on the board.
 *     Surfaces through the whisper system.
 *
 * Strength: ~700-900 ELO. 3-ply default, 4-ply at low piece counts.
 * Strong enough to feel like a friend who plays casually; weak enough
 * to be beatable by a club player and interesting for a beginner.
 *
 * Eval is material + simple piece-square tables (encourage central
 * pawns, develop knights/bishops, king safety in the opening). No
 * heavy positional terms — keeps the engine fast and avoids an
 * "engine-y" feeling.
 */
import {
  legalMoves,
  applyMove,
  pieceType,
  colorOf,
  isInCheck,
  gameStatus,
  type GameState,
  type Move,
  type Color,
  type PieceLetter
} from '@shared/chess'

const PIECE_VALUE: Record<string, number> = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000
}

// Piece-square tables (white perspective; mirror for black).
// Modest values so material dominates; PSTs just break ties.
const PST_PAWN = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0]
]
const PST_KNIGHT = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50]
]
const PST_BISHOP = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20]
]
const PST_ROOK = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0]
]
const PST_QUEEN = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20]
]
const PST_KING_OPENING = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20]
]

function pstValue(piece: PieceLetter, r: number, c: number): number {
  const isWhite = piece === piece.toUpperCase()
  const row = isWhite ? r : 7 - r
  const col = c
  switch (pieceType(piece)) {
    case 'P': return PST_PAWN[row][col]
    case 'N': return PST_KNIGHT[row][col]
    case 'B': return PST_BISHOP[row][col]
    case 'R': return PST_ROOK[row][col]
    case 'Q': return PST_QUEEN[row][col]
    case 'K': return PST_KING_OPENING[row][col]
    default: return 0
  }
}

/** Evaluate from white's perspective. + means white better. */
function evaluate(state: GameState): number {
  let score = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c]
      if (!p) continue
      const baseValue = PIECE_VALUE[pieceType(p).toUpperCase()] ?? 0
      const psqt = pstValue(p, r, c)
      const sign = colorOf(p) === 'w' ? 1 : -1
      score += sign * (baseValue + psqt)
    }
  }
  return score
}

/**
 * Simple move ordering — search captures first (MVV-LVA-ish): captures
 * of high-value pieces by low-value pieces are searched before quiet
 * moves. Speeds alpha-beta enormously.
 */
function orderMoves(state: GameState, moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => scoreMove(state, b) - scoreMove(state, a))
}

function scoreMove(state: GameState, m: Move): number {
  const cap = state.board[m.to[0]][m.to[1]]
  const mover = state.board[m.from[0]][m.from[1]]
  if (!cap || !mover) return 0
  const capVal = PIECE_VALUE[pieceType(cap).toUpperCase()] ?? 0
  const moverVal = PIECE_VALUE[pieceType(mover).toUpperCase()] ?? 0
  return capVal * 10 - moverVal // MVV-LVA
}

/** Negamax with alpha-beta pruning. Returns score from `state.turn`'s POV. */
function negamax(state: GameState, depth: number, alpha: number, beta: number): number {
  if (depth === 0) {
    const e = evaluate(state)
    return state.turn === 'w' ? e : -e
  }
  const moves = legalMoves(state)
  if (moves.length === 0) {
    if (isInCheck(state, state.turn)) {
      // Mated. Negate by depth so faster mates score higher.
      return -100000 + (10 - depth) * 100
    }
    return 0 // stalemate
  }
  let best = -Infinity
  for (const move of orderMoves(state, moves)) {
    const after = applyMove(state, move)
    const score = -negamax(after, depth - 1, -beta, -alpha)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/**
 * Pick the best move. Uses negamax at depth 3 (4 in late game with few
 * pieces). Slight randomization at the top level so identical positions
 * don't always produce identical games — picks among moves within
 * 30 centipawns of the best.
 */
export function pickMove(state: GameState): Move | null {
  const moves = legalMoves(state)
  if (moves.length === 0) return null

  // Late-game depth boost.
  const pieces = state.board.flat().filter(Boolean).length
  const depth = pieces <= 14 ? 4 : 3

  const candidates: Array<{ move: Move; score: number }> = []
  for (const move of orderMoves(state, moves)) {
    const after = applyMove(state, move)
    const score = -negamax(after, depth - 1, -Infinity, Infinity)
    candidates.push({ move, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  // Randomize among near-best so games vary.
  const TOL = 30
  const top = candidates.filter((c) => c.score >= candidates[0].score - TOL)
  const pick = top[Math.floor(Math.random() * top.length)]
  return pick.move
}

/**
 * Async Claude commentary. Fire-and-forget; the game proceeds without
 * waiting. Returns null on any error so the caller doesn't surface an
 * empty whisper.
 *
 * Cost minimization:
 *   - 1 LLM call per AI move at most
 *   - Capped at 30 output tokens
 *   - Skipped entirely if no API key
 *   - Heavily rate-limited (1 commentary per 8 seconds wall clock)
 */
let lastCommentaryAt = 0
const COMMENTARY_COOLDOWN_MS = 8_000

export async function commentaryFor(fen: string, lastSan: string): Promise<string | null> {
  const now = Date.now()
  if (now - lastCommentaryAt < COMMENTARY_COOLDOWN_MS) return null
  try {
    const { hasApiKey } = await import('./keychain')
    if (!(await hasApiKey())) return null
    lastCommentaryAt = now
    const { oneShot } = await import('./anthropicClient')
    const text = await oneShot({
      system:
        "You are Clawd, a tiny pixel-art chess companion. You just played a move in a casual game. Whisper a SHORT (max 8 words) reaction in lowercase, no punctuation at the end. Be playful, occasionally honest about whether the move was risky. Don't quote yourself. No emoji.",
      user: `Position (FEN): ${fen}\nMy last move (SAN): ${lastSan}\nReact.`,
      maxTokens: 30,
      model: 'claude-haiku-4-5-20251001'
    })
    const cleaned = text.trim().replace(/^["']|["']$/g, '')
    if (!cleaned) return null
    return cleaned.slice(0, 60)
  } catch {
    // Network / auth / refusal / anything — drop silently. Game proceeds.
    return null
  }
}
