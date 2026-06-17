/**
 * Chess window — board, move history, controls.
 *
 * Phase A: human vs human (or vs self). Click a piece, click a target.
 * Phase B onward: vs-AI toggle (engine in main process).
 *
 * Drag interactions are intentionally click-click rather than HTML5 drag —
 * dragging on a frameless transparent Electron panel has historical bugs
 * and click-click works fine for a non-blitz board.
 */
import { useEffect, useState } from 'react'
import {
  fromFEN,
  legalMoves,
  squareToAlg,
  pieceType,
  colorOf,
  type GameState,
  type Square,
  type PieceLetter
} from '@shared/chess'
import { PixelClawdKing } from '../components/PixelClawdKing'

// White piece glyph → Unicode. Black mirrors with toLowerCase via offset.
const PIECE_GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
}

interface ChessRemoteState {
  fen: string
  history: string[]
  status: 'in-progress' | 'check' | 'checkmate' | 'stalemate'
  legalMoves: string[]
  turn: 'w' | 'b'
  vsAi: boolean
  aiColor: 'w' | 'b'
}

export function ChessApp(): JSX.Element {
  const [remote, setRemote] = useState<ChessRemoteState | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [promoting, setPromoting] = useState<{ from: Square; to: Square } | null>(null)
  const [pixelKing, setPixelKing] = useState(true)

  useEffect(() => {
    void window.api.chess.getState().then((s) => setRemote(s as ChessRemoteState))
    const off = window.api.chess.onState((s) => setRemote(s as ChessRemoteState))
    void window.api.settings.get().then((s) => setPixelKing(s.chessPixelClawdKing !== false))
    const offSettings = window.api.settings.onChanged((s) =>
      setPixelKing(s.chessPixelClawdKing !== false)
    )
    return () => {
      off()
      offSettings()
    }
  }, [])

  const game: GameState | null = remote ? fromFEN(remote.fen) : null
  if (!remote || !game) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-bg text-textMeta text-xs">
        Loading…
      </div>
    )
  }

  const movesFromSelected = selected ? legalMoves(game, selected) : []
  const targetSquares = new Set(movesFromSelected.map((m) => `${m.to[0]}-${m.to[1]}`))

  const onSquareClick = (r: number, c: number): void => {
    setMoveError(null)
    const piece = game.board[r][c]
    // Selecting a friendly piece
    if (piece && colorOf(piece) === game.turn) {
      // If vs AI and it's not our color, ignore.
      if (remote.vsAi && remote.turn === remote.aiColor) return
      setSelected([r, c])
      return
    }
    // Attempting a move
    if (selected) {
      const candidate = movesFromSelected.find((m) => m.to[0] === r && m.to[1] === c)
      if (!candidate) {
        // Click on empty / enemy non-target → just deselect
        setSelected(null)
        return
      }
      // Promotion?
      const fromPiece = game.board[selected[0]][selected[1]]
      if (
        fromPiece &&
        pieceType(fromPiece) === 'P' &&
        (r === 0 || r === 7)
      ) {
        // Check if any candidate has promotion (always does at last rank)
        if (candidate.promotion) {
          setPromoting({ from: selected, to: [r, c] })
          return
        }
      }
      void submitMove(selected, [r, c])
      setSelected(null)
    }
  }

  const submitMove = async (
    from: Square,
    to: Square,
    promotion?: 'Q' | 'R' | 'B' | 'N'
  ): Promise<void> => {
    const res = await window.api.chess.move({ from, to, promotion })
    if (!res.ok) setMoveError(res.error ?? 'illegal move')
    setPromoting(null)
  }

  const onReset = async (): Promise<void> => {
    await window.api.chess.reset()
    setSelected(null)
    setMoveError(null)
  }

  const onToggleAi = async (): Promise<void> => {
    await window.api.chess.setVsAi(!remote.vsAi, 'b')
  }

  // History as paired turn rows (1. e4 e5  2. Nf3 ...)
  const pairs: Array<{ n: number; w?: string; b?: string }> = []
  for (let i = 0; i < remote.history.length; i += 2) {
    pairs.push({ n: i / 2 + 1, w: remote.history[i], b: remote.history[i + 1] })
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-bg text-textMain rounded-2xl overflow-hidden border border-white/5">
      {/* Header */}
      <div className="drag flex items-center justify-between px-4 py-3 border-b border-white/5 bg-panel/80">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">Chess</span>
          <span className="text-[10px] text-textMeta">
            {remote.status === 'checkmate'
              ? `${remote.turn === 'w' ? 'Black' : 'White'} wins by checkmate`
              : remote.status === 'stalemate'
                ? 'Stalemate · draw'
                : remote.status === 'check'
                  ? `${remote.turn === 'w' ? 'White' : 'Black'} to move (check!)`
                  : `${remote.turn === 'w' ? 'White' : 'Black'} to move`}
            {remote.vsAi ? ' · vs Clawd' : ''}
          </span>
        </div>
        <button
          className="no-drag w-6 h-6 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-sm leading-none flex items-center justify-center"
          onClick={() => window.api.chess.close()}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto">
        {/* Board */}
        <div className="no-drag aspect-square w-full max-w-[400px] mx-auto grid grid-cols-8 grid-rows-8 rounded-md overflow-hidden border border-white/10 select-none">
          {Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => {
              const piece = game.board[r][c]
              const dark = (r + c) % 2 === 1
              const isSelected = selected && selected[0] === r && selected[1] === c
              const isTarget = targetSquares.has(`${r}-${c}`)
              const lastMoveFrom = remote.history.length > 0
                // We don't have the from square in history (just SAN); skip
                // last-move highlight in Phase A. Could be added by storing
                // structured moves alongside SAN.
                ? false
                : false
              return (
                <button
                  key={`${r}-${c}`}
                  className="relative flex items-center justify-center text-2xl font-light cursor-pointer focus:outline-none transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? '#5b8def'
                      : isTarget
                        ? dark
                          ? '#3a5e3a'
                          : '#7aab7a'
                        : dark
                          ? '#5d4a3a'
                          : '#e8d8b8',
                    color: piece ? (colorOf(piece) === 'w' ? '#fafafa' : '#1a1a1a') : 'transparent'
                  }}
                  onClick={() => onSquareClick(r, c)}
                  aria-label={squareToAlg([r, c]) + (piece ? ` ${piece}` : ' empty')}
                >
                  {/* Coordinate hints in the corners (a1..h8) — small, low-contrast */}
                  {c === 0 && (
                    <span
                      className="absolute top-0 left-0.5 text-[9px] leading-none pointer-events-none"
                      style={{ color: dark ? '#e8d8b8' : '#5d4a3a', opacity: 0.7 }}
                    >
                      {8 - r}
                    </span>
                  )}
                  {r === 7 && (
                    <span
                      className="absolute bottom-0 right-0.5 text-[9px] leading-none pointer-events-none"
                      style={{ color: dark ? '#e8d8b8' : '#5d4a3a', opacity: 0.7 }}
                    >
                      {String.fromCharCode('a'.charCodeAt(0) + c)}
                    </span>
                  )}
                  {piece && pieceType(piece) === 'K' && pixelKing ? (
                    <PixelClawdKing
                      variant={colorOf(piece) === 'w' ? 'white' : 'black'}
                      style={{ width: '78%', height: '78%' }}
                    />
                  ) : (
                    piece && PIECE_GLYPH[piece as PieceLetter]
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Error / status */}
        {moveError && (
          <div className="text-[11px] text-rose-300 text-center">{moveError}</div>
        )}

        {/* Move history */}
        <div className="no-drag bg-panel/40 rounded-md border border-white/5 max-h-32 overflow-y-auto px-3 py-2 text-[11px] font-mono leading-snug">
          {pairs.length === 0 ? (
            <div className="text-textMeta text-center">No moves yet.</div>
          ) : (
            pairs.map((p) => (
              <div key={p.n} className="flex gap-2">
                <span className="text-textMeta w-6">{p.n}.</span>
                <span className="w-14">{p.w ?? ''}</span>
                <span className="w-14">{p.b ?? ''}</span>
              </div>
            ))
          )}
        </div>

        {/* Controls */}
        <div className="no-drag flex gap-2">
          <button
            onClick={() => void onReset()}
            className="flex-1 px-3 py-1.5 rounded-md bg-panel hover:bg-panel/80 border border-white/10 text-[11px]"
          >
            New game
          </button>
          <button
            onClick={() => void onToggleAi()}
            className="flex-1 px-3 py-1.5 rounded-md border text-[11px] transition-colors"
            style={{
              backgroundColor: remote.vsAi ? '#5b8def33' : 'transparent',
              borderColor: remote.vsAi ? '#5b8def' : 'rgba(255,255,255,0.1)'
            }}
          >
            {remote.vsAi ? '✓ vs Clawd' : 'vs Clawd'}
          </button>
        </div>
      </div>

      {/* Promotion picker */}
      {promoting && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-panel border border-white/20 rounded-lg p-3 flex gap-2">
            {(['Q', 'R', 'B', 'N'] as const).map((p) => (
              <button
                key={p}
                onClick={() => void submitMove(promoting.from, promoting.to, p)}
                className="w-12 h-12 rounded bg-bg hover:bg-white/10 text-3xl flex items-center justify-center"
              >
                {PIECE_GLYPH[remote.turn === 'w' ? p : p.toLowerCase()]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
