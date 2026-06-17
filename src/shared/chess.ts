/**
 * Chess engine — rules, move generation, FEN, check/mate.
 *
 * Pure functional; no UI / no main / no IPC dependencies. Used by both
 * the renderer (board UI) and main (game store, AI). No external deps.
 *
 * Board representation:
 *   - 8x8 array of piece characters or null. Index [0][0] = a8 (top-left
 *     in white's view). [7][0] = a1, [7][7] = h1.
 *   - Pieces are letters: K Q R B N P (white), k q r b n p (black).
 *
 * Move representation:
 *   - { from: [r, c], to: [r, c], promotion?: 'Q'|'R'|'B'|'N' }
 *   - Castling and en passant are detected from the move shape; the
 *     caller doesn't need a flag.
 *
 * Conventions:
 *   - "color" is 'w' | 'b'.
 *   - All move generators return PSEUDO-LEGAL moves; legality (own king
 *     not in check after the move) is filtered by `legalMoves()`.
 *   - We do NOT support 50-move rule, threefold repetition, or insufficient
 *     material — Clawd's chess is casual; those would just produce confusing
 *     "draw?" prompts.
 */

export type Color = 'w' | 'b'
export type PieceLetter = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p'
export type Square = [number, number] // [row, col], both 0..7

export interface Move {
  from: Square
  to: Square
  promotion?: 'Q' | 'R' | 'B' | 'N' | 'q' | 'r' | 'b' | 'n'
}

export interface GameState {
  board: (PieceLetter | null)[][]
  turn: Color
  // Castling rights: which sides can each color still castle?
  castling: {
    wK: boolean // white king-side
    wQ: boolean // white queen-side
    bK: boolean
    bQ: boolean
  }
  // En passant target square (the square BEHIND the pawn that just moved
  // two), or null. Used only on the very next half-move.
  enPassant: Square | null
  halfmoveClock: number // for 50-move rule (we expose, don't enforce draws)
  fullmoveNumber: number
}

/* ─── Piece helpers ─────────────────────────────────────────── */

export function colorOf(p: PieceLetter): Color {
  return p === p.toUpperCase() ? 'w' : 'b'
}

export function pieceType(p: PieceLetter): 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' {
  return p.toUpperCase() as 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8
}

function squaresEqual(a: Square, b: Square): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/* ─── Initial position ──────────────────────────────────────── */

export function initialState(): GameState {
  const board: (PieceLetter | null)[][] = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  ]
  return {
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1
  }
}

/* ─── Pseudo-legal move generation ──────────────────────────── */

const KNIGHT_OFFSETS: Square[] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
]
const KING_OFFSETS: Square[] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1]
]
const ROOK_DIRS: Square[] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const BISHOP_DIRS: Square[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

function pseudoLegalMoves(state: GameState, from: Square): Move[] {
  const piece = state.board[from[0]][from[1]]
  if (!piece) return []
  const us = colorOf(piece)
  const type = pieceType(piece)
  const moves: Move[] = []
  const enemy = us === 'w' ? 'b' : 'w'

  const tryStep = (dr: number, dc: number, sliding: boolean): void => {
    let r = from[0] + dr
    let c = from[1] + dc
    while (inBounds(r, c)) {
      const tgt = state.board[r][c]
      if (tgt === null) {
        moves.push({ from, to: [r, c] })
      } else {
        if (colorOf(tgt) === enemy) moves.push({ from, to: [r, c] })
        break
      }
      if (!sliding) break
      r += dr
      c += dc
    }
  }

  if (type === 'P') {
    const dir = us === 'w' ? -1 : 1
    const startRow = us === 'w' ? 6 : 1
    const promoRow = us === 'w' ? 0 : 7
    const r1 = from[0] + dir
    // Single push
    if (inBounds(r1, from[1]) && state.board[r1][from[1]] === null) {
      if (r1 === promoRow) {
        for (const p of ['Q', 'R', 'B', 'N'] as const) {
          moves.push({ from, to: [r1, from[1]], promotion: us === 'w' ? p : (p.toLowerCase() as 'q') })
        }
      } else {
        moves.push({ from, to: [r1, from[1]] })
        // Double push
        if (from[0] === startRow) {
          const r2 = from[0] + 2 * dir
          if (state.board[r2][from[1]] === null) {
            moves.push({ from, to: [r2, from[1]] })
          }
        }
      }
    }
    // Captures (incl. en passant)
    for (const dc of [-1, 1]) {
      const cc = from[1] + dc
      if (!inBounds(r1, cc)) continue
      const tgt = state.board[r1][cc]
      if (tgt && colorOf(tgt) === enemy) {
        if (r1 === promoRow) {
          for (const p of ['Q', 'R', 'B', 'N'] as const) {
            moves.push({ from, to: [r1, cc], promotion: us === 'w' ? p : (p.toLowerCase() as 'q') })
          }
        } else {
          moves.push({ from, to: [r1, cc] })
        }
      } else if (
        state.enPassant &&
        state.enPassant[0] === r1 &&
        state.enPassant[1] === cc
      ) {
        moves.push({ from, to: [r1, cc] })
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = from[0] + dr
      const c = from[1] + dc
      if (!inBounds(r, c)) continue
      const tgt = state.board[r][c]
      if (tgt === null || colorOf(tgt) === enemy) moves.push({ from, to: [r, c] })
    }
  } else if (type === 'B') {
    for (const [dr, dc] of BISHOP_DIRS) tryStep(dr, dc, true)
  } else if (type === 'R') {
    for (const [dr, dc] of ROOK_DIRS) tryStep(dr, dc, true)
  } else if (type === 'Q') {
    for (const [dr, dc] of [...ROOK_DIRS, ...BISHOP_DIRS]) tryStep(dr, dc, true)
  } else if (type === 'K') {
    for (const [dr, dc] of KING_OFFSETS) {
      const r = from[0] + dr
      const c = from[1] + dc
      if (!inBounds(r, c)) continue
      const tgt = state.board[r][c]
      if (tgt === null || colorOf(tgt) === enemy) moves.push({ from, to: [r, c] })
    }
    // Castling — checked at legal-move filter (squares-not-attacked clause)
    const homeRow = us === 'w' ? 7 : 0
    if (from[0] === homeRow && from[1] === 4) {
      const cKey = us === 'w' ? 'wK' : 'bK'
      const qKey = us === 'w' ? 'wQ' : 'bQ'
      // King-side
      if (
        state.castling[cKey] &&
        state.board[homeRow][5] === null &&
        state.board[homeRow][6] === null &&
        state.board[homeRow][7] === (us === 'w' ? 'R' : 'r')
      ) {
        moves.push({ from, to: [homeRow, 6] })
      }
      // Queen-side
      if (
        state.castling[qKey] &&
        state.board[homeRow][1] === null &&
        state.board[homeRow][2] === null &&
        state.board[homeRow][3] === null &&
        state.board[homeRow][0] === (us === 'w' ? 'R' : 'r')
      ) {
        moves.push({ from, to: [homeRow, 2] })
      }
    }
  }
  return moves
}

/* ─── Apply a move (mutating clone) ─────────────────────────── */

/** Returns a NEW state with `move` applied. Doesn't validate legality. */
export function applyMove(state: GameState, move: Move): GameState {
  const next: GameState = {
    board: state.board.map((row) => row.slice()),
    turn: state.turn === 'w' ? 'b' : 'w',
    castling: { ...state.castling },
    enPassant: null,
    halfmoveClock: state.halfmoveClock + 1,
    fullmoveNumber: state.fullmoveNumber + (state.turn === 'b' ? 1 : 0)
  }
  const piece = state.board[move.from[0]][move.from[1]]
  if (!piece) return next
  const us = colorOf(piece)
  const type = pieceType(piece)
  const captured = state.board[move.to[0]][move.to[1]]

  // Reset halfmove on pawn move or capture
  if (type === 'P' || captured) next.halfmoveClock = 0

  // Move the piece
  next.board[move.from[0]][move.from[1]] = null
  next.board[move.to[0]][move.to[1]] = move.promotion
    ? (us === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase()) as PieceLetter
    : piece

  // En passant capture: pawn moved diagonally to empty square
  if (type === 'P' && move.from[1] !== move.to[1] && captured === null) {
    const capRow = move.from[0] // captured pawn sits where ours was, same column as target
    next.board[capRow][move.to[1]] = null
  }

  // Set en passant target on double pawn push
  if (type === 'P' && Math.abs(move.to[0] - move.from[0]) === 2) {
    next.enPassant = [(move.from[0] + move.to[0]) / 2, move.from[1]]
  }

  // Castling: move the rook too
  if (type === 'K' && Math.abs(move.to[1] - move.from[1]) === 2) {
    const homeRow = us === 'w' ? 7 : 0
    if (move.to[1] === 6) {
      // King-side
      next.board[homeRow][5] = next.board[homeRow][7]
      next.board[homeRow][7] = null
    } else if (move.to[1] === 2) {
      // Queen-side
      next.board[homeRow][3] = next.board[homeRow][0]
      next.board[homeRow][0] = null
    }
  }

  // Update castling rights
  if (type === 'K') {
    if (us === 'w') { next.castling.wK = false; next.castling.wQ = false }
    else { next.castling.bK = false; next.castling.bQ = false }
  }
  if (type === 'R') {
    if (us === 'w' && move.from[0] === 7 && move.from[1] === 0) next.castling.wQ = false
    if (us === 'w' && move.from[0] === 7 && move.from[1] === 7) next.castling.wK = false
    if (us === 'b' && move.from[0] === 0 && move.from[1] === 0) next.castling.bQ = false
    if (us === 'b' && move.from[0] === 0 && move.from[1] === 7) next.castling.bK = false
  }
  // Capturing a rook on its starting square also revokes that castling right.
  if (captured) {
    if (move.to[0] === 7 && move.to[1] === 0) next.castling.wQ = false
    if (move.to[0] === 7 && move.to[1] === 7) next.castling.wK = false
    if (move.to[0] === 0 && move.to[1] === 0) next.castling.bQ = false
    if (move.to[0] === 0 && move.to[1] === 7) next.castling.bK = false
  }

  return next
}

/* ─── Attack detection / check / mate ───────────────────────── */

/** Is square (r,c) attacked by `byColor`? Used for check detection and
 *  the squares-not-attacked clause in castling. */
export function isSquareAttacked(state: GameState, r: number, c: number, byColor: Color): boolean {
  // Walk every piece of `byColor`, generate its pseudo-legal moves, and
  // check whether any targets (r,c). Pawns are special: their captures
  // are different from their pushes.
  for (let pr = 0; pr < 8; pr++) {
    for (let pc = 0; pc < 8; pc++) {
      const p = state.board[pr][pc]
      if (!p || colorOf(p) !== byColor) continue
      const type = pieceType(p)
      if (type === 'P') {
        const dir = byColor === 'w' ? -1 : 1
        if (pr + dir === r && (pc - 1 === c || pc + 1 === c)) return true
        continue
      }
      // For other pieces, pseudo-legal includes captures and quiet moves.
      // Only target-square equality matters for attack detection.
      const moves = pseudoLegalMoves(state, [pr, pc])
      for (const m of moves) {
        if (m.to[0] === r && m.to[1] === c) {
          // Filter out castling pseudo-moves: those don't attack the
          // landing square through the rook's eyes.
          if (type === 'K' && Math.abs(m.to[1] - m.from[1]) === 2) continue
          return true
        }
      }
    }
  }
  return false
}

export function findKing(state: GameState, color: Color): Square | null {
  const k: PieceLetter = color === 'w' ? 'K' : 'k'
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (state.board[r][c] === k) return [r, c]
    }
  }
  return null
}

export function isInCheck(state: GameState, color: Color): boolean {
  const k = findKing(state, color)
  if (!k) return false
  return isSquareAttacked(state, k[0], k[1], color === 'w' ? 'b' : 'w')
}

/* ─── Legal move generation ─────────────────────────────────── */

export function legalMoves(state: GameState, from?: Square): Move[] {
  const out: Move[] = []
  const us = state.turn
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (from && (r !== from[0] || c !== from[1])) continue
      const p = state.board[r][c]
      if (!p || colorOf(p) !== us) continue
      const candidates = pseudoLegalMoves(state, [r, c])
      for (const m of candidates) {
        // Castling has extra constraints: king can't be in check, can't
        // pass through an attacked square.
        if (pieceType(p) === 'K' && Math.abs(m.to[1] - m.from[1]) === 2) {
          if (isInCheck(state, us)) continue
          const enemy = us === 'w' ? 'b' : 'w'
          const homeRow = us === 'w' ? 7 : 0
          const through = m.to[1] === 6 ? 5 : 3
          if (isSquareAttacked(state, homeRow, through, enemy)) continue
        }
        const after = applyMove(state, m)
        if (!isInCheck(after, us)) out.push(m)
      }
    }
  }
  return out
}

export function isCheckmate(state: GameState): boolean {
  return isInCheck(state, state.turn) && legalMoves(state).length === 0
}

export function isStalemate(state: GameState): boolean {
  return !isInCheck(state, state.turn) && legalMoves(state).length === 0
}

export function gameStatus(state: GameState): 'in-progress' | 'checkmate' | 'stalemate' | 'check' {
  const moves = legalMoves(state)
  if (moves.length === 0) {
    return isInCheck(state, state.turn) ? 'checkmate' : 'stalemate'
  }
  return isInCheck(state, state.turn) ? 'check' : 'in-progress'
}

/* ─── Algebraic notation ────────────────────────────────────── */

export function squareToAlg(s: Square): string {
  const file = String.fromCharCode('a'.charCodeAt(0) + s[1])
  const rank = String(8 - s[0])
  return file + rank
}

export function algToSquare(s: string): Square | null {
  if (s.length !== 2) return null
  const c = s.charCodeAt(0) - 'a'.charCodeAt(0)
  const r = 8 - parseInt(s[1], 10)
  if (!inBounds(r, c)) return null
  return [r, c]
}

/**
 * Parse user algebraic input ('e4', 'Nf3', 'O-O', 'exd5', 'Qh4#') to a
 * Move. Returns null if input is ambiguous or illegal in the given state.
 *
 * This is intentionally tolerant — drops check (+) / mate (#) / x markers,
 * accepts both 'O-O' and 'o-o', strips spaces. Promotion: 'e8=Q'.
 */
export function parseAlgebraic(state: GameState, input: string): Move | null {
  const cleaned = input.trim().replace(/[+#!?]/g, '')
  if (!cleaned) return null
  // Castling
  if (/^o-o-o$/i.test(cleaned)) {
    const homeRow = state.turn === 'w' ? 7 : 0
    const m: Move = { from: [homeRow, 4], to: [homeRow, 2] }
    return legalMoves(state).find((x) => squaresEqual(x.from, m.from) && squaresEqual(x.to, m.to)) ?? null
  }
  if (/^o-o$/i.test(cleaned)) {
    const homeRow = state.turn === 'w' ? 7 : 0
    const m: Move = { from: [homeRow, 4], to: [homeRow, 6] }
    return legalMoves(state).find((x) => squaresEqual(x.from, m.from) && squaresEqual(x.to, m.to)) ?? null
  }
  // Promotion suffix
  let promotion: 'Q' | 'R' | 'B' | 'N' | undefined
  let core = cleaned
  const promoMatch = core.match(/=([QRBN])$/i)
  if (promoMatch) {
    promotion = promoMatch[1].toUpperCase() as 'Q' | 'R' | 'B' | 'N'
    core = core.slice(0, -2)
  }
  // Pawn move like 'e4', 'exd5'
  // Piece move like 'Nf3', 'Nbd7', 'R1e3', 'Qxh4'
  const pieceMatch = core.match(/^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])$/)
  if (!pieceMatch) return null
  const [, pieceLetter, fileHint, rankHint, target] = pieceMatch
  const to = algToSquare(target)
  if (!to) return null
  const targetType = (pieceLetter ?? 'P').toUpperCase() as 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
  const candidates = legalMoves(state).filter((m) => {
    if (m.to[0] !== to[0] || m.to[1] !== to[1]) return false
    const piece = state.board[m.from[0]][m.from[1]]
    if (!piece) return false
    if (pieceType(piece) !== targetType) return false
    if (fileHint && m.from[1] !== fileHint.charCodeAt(0) - 'a'.charCodeAt(0)) return false
    if (rankHint && m.from[0] !== 8 - parseInt(rankHint, 10)) return false
    if (promotion && m.promotion?.toUpperCase() !== promotion) return false
    if (!promotion && m.promotion) return false
    return true
  })
  if (candidates.length === 1) return candidates[0]
  return null
}

/**
 * Format a move in standard algebraic notation, given the state BEFORE the
 * move was made. Used for chat-back rendering and PGN.
 */
export function moveToAlgebraic(state: GameState, move: Move): string {
  const piece = state.board[move.from[0]][move.from[1]]
  if (!piece) return '?'
  const type = pieceType(piece)
  const capture =
    state.board[move.to[0]][move.to[1]] !== null ||
    (type === 'P' && move.from[1] !== move.to[1])

  // Castling
  if (type === 'K' && Math.abs(move.to[1] - move.from[1]) === 2) {
    return move.to[1] === 6 ? 'O-O' : 'O-O-O'
  }

  let str = ''
  if (type !== 'P') {
    str += type
    // Disambiguate
    const others = legalMoves(state).filter(
      (m) =>
        !(m.from[0] === move.from[0] && m.from[1] === move.from[1]) &&
        m.to[0] === move.to[0] &&
        m.to[1] === move.to[1] &&
        pieceType(state.board[m.from[0]][m.from[1]] as PieceLetter) === type
    )
    if (others.length > 0) {
      const sameFile = others.some((m) => m.from[1] === move.from[1])
      const sameRank = others.some((m) => m.from[0] === move.from[0])
      if (!sameFile) str += String.fromCharCode('a'.charCodeAt(0) + move.from[1])
      else if (!sameRank) str += String(8 - move.from[0])
      else str += squareToAlg(move.from)
    }
  } else if (capture) {
    // Pawn capture: 'exd5'
    str += String.fromCharCode('a'.charCodeAt(0) + move.from[1])
  }
  if (capture) str += 'x'
  str += squareToAlg(move.to)
  if (move.promotion) str += '=' + move.promotion.toUpperCase()

  // Append +/# from resulting state
  const after = applyMove(state, move)
  const status = gameStatus(after)
  if (status === 'checkmate') str += '#'
  else if (status === 'check') str += '+'
  return str
}

/* ─── ASCII board (for /chess in chat) ──────────────────────── */

export function asciiBoard(state: GameState): string {
  const lines: string[] = []
  lines.push('  a b c d e f g h')
  for (let r = 0; r < 8; r++) {
    const rank = 8 - r
    const cells = state.board[r].map((p) => p ?? '.').join(' ')
    lines.push(`${rank} ${cells} ${rank}`)
  }
  lines.push('  a b c d e f g h')
  return lines.join('\n')
}

/* ─── FEN ──────────────────────────────────────────────────── */

export function toFEN(state: GameState): string {
  const rows: string[] = []
  for (let r = 0; r < 8; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c]
      if (p === null) empty++
      else {
        if (empty > 0) row += empty
        empty = 0
        row += p
      }
    }
    if (empty > 0) row += empty
    rows.push(row)
  }
  let castling = ''
  if (state.castling.wK) castling += 'K'
  if (state.castling.wQ) castling += 'Q'
  if (state.castling.bK) castling += 'k'
  if (state.castling.bQ) castling += 'q'
  if (!castling) castling = '-'
  const ep = state.enPassant ? squareToAlg(state.enPassant) : '-'
  return `${rows.join('/')} ${state.turn} ${castling} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`
}

export function fromFEN(fen: string): GameState | null {
  const parts = fen.trim().split(/\s+/)
  if (parts.length < 4) return null
  const [boardPart, turnPart, castlingPart, epPart, halfmovePart, fullmovePart] = parts
  const rows = boardPart.split('/')
  if (rows.length !== 8) return null
  const board: (PieceLetter | null)[][] = []
  for (const row of rows) {
    const r: (PieceLetter | null)[] = []
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        const n = parseInt(ch, 10)
        for (let i = 0; i < n; i++) r.push(null)
      } else if ('KQRBNPkqrbnp'.includes(ch)) {
        r.push(ch as PieceLetter)
      } else {
        return null
      }
    }
    if (r.length !== 8) return null
    board.push(r)
  }
  if (turnPart !== 'w' && turnPart !== 'b') return null
  return {
    board,
    turn: turnPart as Color,
    castling: {
      wK: castlingPart.includes('K'),
      wQ: castlingPart.includes('Q'),
      bK: castlingPart.includes('k'),
      bQ: castlingPart.includes('q')
    },
    enPassant: epPart === '-' ? null : algToSquare(epPart),
    halfmoveClock: halfmovePart ? parseInt(halfmovePart, 10) || 0 : 0,
    fullmoveNumber: fullmovePart ? parseInt(fullmovePart, 10) || 1 : 1
  }
}
