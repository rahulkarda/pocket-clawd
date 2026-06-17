# Tests

## Chess engine

`tests/chess.test.mjs` — 21 correctness probes for `src/shared/chess.ts`.

Run:

```sh
mkdir -p /tmp/chess-test-run
npx tsc --target es2022 --module es2022 --moduleResolution node --strict --skipLibCheck \
  --outDir /tmp/chess-test-run src/shared/chess.ts
cp tests/chess.test.mjs /tmp/chess-test-run/
node /tmp/chess-test-run/chess.test.mjs
```

Covers: initial position, en passant (target + capture), Scholar's mate, castling
(kingside, through-check blocked, out-of-check blocked, rook on f1 after O-O),
promotion (push + capture, all 4 options), pinned piece blocked, stalemate
detection, FEN round-trip.

Last run: 21 passed, 0 failed.
