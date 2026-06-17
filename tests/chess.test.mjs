import {
  initialState, applyMove, legalMoves, isInCheck, isCheckmate, isStalemate,
  toFEN, fromFEN, parseAlgebraic, moveToAlgebraic, gameStatus
} from './chess.js'

let pass = 0, fail = 0
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + label) }
  else { fail++; console.log('FAIL ' + label + (detail ? ' :: ' + detail : '')) }
}

const s0 = initialState()
ok('initial.20moves', legalMoves(s0).length === 20, `got ${legalMoves(s0).length}`)

const e4 = parseAlgebraic(s0, 'e4')
ok('parse.e4', !!e4)
const s1 = applyMove(s0, e4)
ok('after-e4.turn=b', s1.turn === 'b')
ok('after-e4.ep', s1.enPassant && s1.enPassant[0] === 5 && s1.enPassant[1] === 4)

let s = initialState()
const moves = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7']
for (const san of moves) {
  const m = parseAlgebraic(s, san)
  if (!m) { fail++; console.log('FAIL parse ' + san); break }
  s = applyMove(s, m)
}
ok('scholars.checkmate', isCheckmate(s))

s = initialState()
for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) {
  s = applyMove(s, parseAlgebraic(s, san))
}
const castle = parseAlgebraic(s, 'O-O')
ok('parse.O-O', !!castle)
const s2 = applyMove(s, castle)
ok('castled.king-on-g1', s2.board[7][6] === 'K')
ok('castled.rook-on-f1', s2.board[7][5] === 'R')

s = initialState()
for (const san of ['e4', 'd5', 'e5', 'f5']) {
  s = applyMove(s, parseAlgebraic(s, san))
}
ok('ep.target-set', s.enPassant && s.enPassant[0] === 2 && s.enPassant[1] === 5)
const epm = parseAlgebraic(s, 'exf6')
ok('ep.parse', !!epm)
const s3 = applyMove(s, epm)
ok('ep.captured-pawn-removed', s3.board[3][5] === null)
ok('ep.our-pawn-on-f6', s3.board[2][5] === 'P')

s = fromFEN('8/P7/8/8/8/8/8/4k2K w - - 0 1')
ok('fen.parse', !!s)
const promos = legalMoves(s, [1,0])
ok('promo.4-options', promos.length === 4, `got ${promos.length}`)

s = fromFEN('4k3/8/8/4r3/8/4N3/8/4K3 w - - 0 1')
const knightMoves = legalMoves(s, [5,4])
ok('pin.knight-stuck', knightMoves.length === 0)

s = fromFEN('5k2/5P2/5K2/8/8/8/8/8 b - - 0 1')
ok('stalemate.detected', isStalemate(s))

s = fromFEN('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1')
const wMoves = legalMoves(s)
const hasOO = wMoves.some(m => m.from[0]===7 && m.from[1]===4 && m.to[1]===6)
ok('castle.through-check.no-OO', !hasOO)

s = fromFEN('r3k2r/8/8/8/4r3/8/4r3/R3K2R w KQkq - 0 1')
ok('in-check.detected', isInCheck(s, 'w'))
const wm = legalMoves(s)
const castleAttempts = wm.filter(m => m.from[0]===7 && m.from[1]===4 && Math.abs(m.to[1]-4)===2)
ok('castle.out-of-check.0', castleAttempts.length === 0)

const startFen = toFEN(initialState())
const expected = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
ok('fen.start-roundtrip', startFen === expected, startFen)

s = fromFEN('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1')
const capPromo = parseAlgebraic(s, 'axb8=Q')
ok('promo.capture', !!capPromo)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail > 0 ? 1 : 0)
