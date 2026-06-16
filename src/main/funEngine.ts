/**
 * Fun mode — moves the avatar around the screen with a sequence of playful
 * behaviors (run, jump, roll, bounce, spin, idle) until stopped.
 *
 * Architecture:
 *   - Main owns the simulation. Position updates are window setPosition()s
 *     so the OS chrome moves natively (no white box artifacts on transparent).
 *   - Per-frame transforms (rotation, squash) are broadcast to the renderer
 *     via AVATAR_FUN_FRAME and applied as CSS transforms inside the avatar
 *     slot. Renderer doesn't touch position.
 *   - Click on the avatar (any pointerdown) stops fun mode.
 *   - The simulation respects the work area of the display nearest the
 *     avatar's last known position; bounces off edges; never leaves the screen.
 *
 * Behaviors are scheduled by picking the next one when the current one
 * completes. We never block — the tick loop is the only state machine.
 */
import { BrowserWindow, screen } from 'electron'
import { IPC } from '@shared/ipc'
import type { FunFrame } from '@shared/types'
import logger from './logger'
import { settingsStore } from './settings'
import { getAvatarWindow } from './avatarWindow'
import { TOOLTIP_HALO_PX } from '@shared/constants'

interface Behavior {
  name: 'run' | 'jump' | 'roll' | 'bounce' | 'spin' | 'idle' | 'tumble'
  /** Wall-clock ms when this behavior started. */
  startedAt: number
  /** Total duration in ms. */
  durationMs: number
  /** Behavior-specific parameters. */
  params: Record<string, number>
}

interface FunState {
  active: boolean
  /** rAF-style tick handle (we use setInterval since this is main, not renderer). */
  tickHandle: NodeJS.Timeout | null
  /** Last frame timestamp for delta-based physics. */
  lastTickAt: number
  /** Avatar visible top-left, screen coords. Mirrors settings.avatarPosition during fun mode. */
  ax: number
  ay: number
  /** Avatar baseline Y — the "ground" we return to after jumps. */
  baselineY: number
  /** Velocity in px/sec (negative = up/left). */
  vx: number
  vy: number
  /** Current behavior. */
  current: Behavior | null
  /** Cumulative degrees of avatar rotation (visual only). */
  rotateDeg: number
  /** Y-squash factor for the next frame, 0.7..1.3, 1.0 = neutral. */
  scaleY: number
  scaleX: number
  /** When set, fun mode auto-stops at this wall-clock ms. Used by "fetch". */
  autoStopAt: number
}

const state: FunState = {
  active: false,
  tickHandle: null,
  lastTickAt: 0,
  ax: 0,
  ay: 0,
  baselineY: 0,
  vx: 0,
  vy: 0,
  current: null,
  rotateDeg: 0,
  scaleY: 1,
  scaleX: 1,
  autoStopAt: 0
}

const TICK_MS = 16 // ~60 Hz
const GRAVITY = 1800 // px/s^2 — gentle game-y gravity
const RUN_SPEED = 260 // px/s sideways
const FAST_RUN_SPEED = 420
const BOUNCE_DAMPING = 0.55
const FRICTION_PER_SEC = 0.9 // velocity multiplier on landing

function broadcastState(active: boolean): void {
  const win = getAvatarWindow()
  if (win && !win.isDestroyed()) {
    // `fetching` is true only when fun mode was started via playFetch()
    // (autoStopAt set). Free-roam fun mode reports fetching=false.
    win.webContents.send(IPC.AVATAR_FUN_STATE, {
      active,
      fetching: active && state.autoStopAt > 0
    })
  }
}

function broadcastFrame(): void {
  const win = getAvatarWindow()
  if (!win || win.isDestroyed()) return
  const frame: FunFrame = {
    rotateDeg: state.rotateDeg,
    scaleY: state.scaleY,
    scaleX: state.scaleX,
    mood: state.current?.name === 'spin' || state.current?.name === 'tumble' ? 'dizzy' : 'excited'
  }
  win.webContents.send(IPC.AVATAR_FUN_FRAME, frame)
}

/** Choose the next behavior. Weighted random — bias toward movement. */
function pickNextBehavior(now: number, avatarSize: number): Behavior {
  const choices: Array<{ name: Behavior['name']; weight: number }> = [
    { name: 'run', weight: 4 },
    { name: 'jump', weight: 3 },
    { name: 'roll', weight: 3 },
    { name: 'bounce', weight: 2 },
    { name: 'spin', weight: 1 },
    { name: 'tumble', weight: 2 },
    { name: 'idle', weight: 1 }
  ]
  const total = choices.reduce((s, c) => s + c.weight, 0)
  let pick = Math.random() * total
  let chosen: Behavior['name'] = 'run'
  for (const c of choices) {
    pick -= c.weight
    if (pick <= 0) {
      chosen = c.name
      break
    }
  }
  // Avoid two of the same in a row.
  if (state.current && chosen === state.current.name) {
    return pickNextBehavior(now, avatarSize)
  }
  switch (chosen) {
    case 'run': {
      const dir = Math.random() < 0.5 ? -1 : 1
      const speed = (Math.random() < 0.3 ? FAST_RUN_SPEED : RUN_SPEED) * dir
      return {
        name: 'run',
        startedAt: now,
        durationMs: 1200 + Math.random() * 1200,
        params: { vx: speed }
      }
    }
    case 'jump': {
      const dir = Math.random() < 0.5 ? -1 : 1
      return {
        name: 'jump',
        startedAt: now,
        durationMs: 900,
        params: {
          vx: RUN_SPEED * 0.7 * dir,
          vy: -700 // initial upward velocity
        }
      }
    }
    case 'roll': {
      const dir = Math.random() < 0.5 ? -1 : 1
      const speed = RUN_SPEED * dir
      // Roll = move while spinning; rotation rate proportional to speed
      const circumference = Math.PI * avatarSize
      const rotPerSec = (Math.abs(speed) / circumference) * 360 * dir
      return {
        name: 'roll',
        startedAt: now,
        durationMs: 1500 + Math.random() * 1000,
        params: { vx: speed, rotPerSec }
      }
    }
    case 'bounce': {
      return {
        name: 'bounce',
        startedAt: now,
        durationMs: 1500,
        params: { vy: -500 + Math.random() * -200, vx: (Math.random() - 0.5) * 80 }
      }
    }
    case 'spin': {
      return {
        name: 'spin',
        startedAt: now,
        durationMs: 800 + Math.random() * 600,
        params: { rotPerSec: (Math.random() < 0.5 ? -1 : 1) * (540 + Math.random() * 360) }
      }
    }
    case 'tumble': {
      const dir = Math.random() < 0.5 ? -1 : 1
      return {
        name: 'tumble',
        startedAt: now,
        durationMs: 1100,
        params: {
          vx: RUN_SPEED * 0.9 * dir,
          vy: -550,
          rotPerSec: dir * 720
        }
      }
    }
    case 'idle':
    default: {
      return {
        name: 'idle',
        startedAt: now,
        durationMs: 350 + Math.random() * 400,
        params: {}
      }
    }
  }
}

/**
 * Apply one tick of physics and behavior. Mutates `state`, repositions the
 * window, and broadcasts the frame transform.
 */
function tick(): void {
  if (!state.active) return
  const win = getAvatarWindow()
  if (!win || win.isDestroyed()) {
    stop()
    return
  }
  // Auto-stop (used by playFetch / time-bounded sessions).
  if (state.autoStopAt > 0 && Date.now() >= state.autoStopAt) {
    stop()
    return
  }
  const now = Date.now()
  const dt = Math.min(0.05, (now - state.lastTickAt) / 1000) // cap dt at 50ms
  state.lastTickAt = now

  const settings = settingsStore().get()
  const avatarSize = Math.max(40, Math.min(120, settings.avatarSize))

  if (!state.current || now - state.current.startedAt > state.current.durationMs) {
    // Starting a new behavior — apply launch impulses.
    const next = pickNextBehavior(now, avatarSize)
    state.current = next
    if (next.params.vx !== undefined) state.vx = next.params.vx
    if (next.params.vy !== undefined) state.vy = next.params.vy
    if (next.name === 'idle') {
      // come to a stop
      state.vx = 0
      state.vy = 0
    }
  }

  const cur = state.current
  // Apply behavior-specific per-tick logic.
  switch (cur.name) {
    case 'run': {
      // ground-level run; bob slightly via scaleY
      const t = (now - cur.startedAt) / 1000
      state.scaleY = 1 + Math.sin(t * 18) * 0.06
      state.scaleX = 1 - Math.sin(t * 18) * 0.04
      // tilt subtly forward in the direction of motion
      state.rotateDeg = Math.sin(t * 18) * 4 * Math.sign(state.vx || 1)
      break
    }
    case 'jump': {
      // gravity governs vy
      state.vy += GRAVITY * dt
      // squash before impact, stretch on the way up
      state.scaleY = state.vy < 0 ? 1.15 : 0.92
      state.scaleX = state.vy < 0 ? 0.9 : 1.08
      state.rotateDeg = (state.vx || 1) > 0 ? 8 : -8
      break
    }
    case 'roll': {
      const rotPerSec = cur.params.rotPerSec ?? 360
      state.rotateDeg += rotPerSec * dt
      state.scaleY = 1
      state.scaleX = 1
      break
    }
    case 'bounce': {
      state.vy += GRAVITY * dt
      state.scaleY = state.vy < 0 ? 1.18 : 0.9
      state.scaleX = state.vy < 0 ? 0.85 : 1.12
      state.rotateDeg = 0
      break
    }
    case 'spin': {
      const rotPerSec = cur.params.rotPerSec ?? 540
      state.rotateDeg += rotPerSec * dt
      // shimmy a bit
      state.scaleY = 1 + Math.sin((now - cur.startedAt) / 80) * 0.05
      state.scaleX = 1 - Math.sin((now - cur.startedAt) / 80) * 0.05
      state.vx *= 0.92
      break
    }
    case 'tumble': {
      // a chaotic gravity-arc + rotation
      state.vy += GRAVITY * dt
      const rotPerSec = cur.params.rotPerSec ?? 720
      state.rotateDeg += rotPerSec * dt
      state.scaleY = 1
      state.scaleX = 1
      break
    }
    case 'idle': {
      // settle
      state.vx *= Math.pow(FRICTION_PER_SEC, dt * 60)
      state.vy = 0
      const t = (now - cur.startedAt) / 1000
      state.scaleY = 1 + Math.sin(t * 4) * 0.03
      state.scaleX = 1 - Math.sin(t * 4) * 0.03
      // lazy un-rotate toward upright
      state.rotateDeg *= 0.9
      break
    }
  }

  // Integrate position. Guard against non-finite values — if any state
  // slipped to NaN/Infinity (e.g. settings.avatarPosition was missing on
  // first launch, or a behavior produced a bad impulse), reset to a safe
  // origin instead of letting the bad value flow into win.setPosition.
  const safeNum = (n: number, fallback: number): number =>
    Number.isFinite(n) ? n : fallback
  state.vx = safeNum(state.vx, 0)
  state.vy = safeNum(state.vy, 0)
  state.ax = safeNum(state.ax + state.vx * dt, state.ax)
  state.ay = safeNum(state.ay + state.vy * dt, state.ay)
  state.ax = safeNum(state.ax, 0)
  state.ay = safeNum(state.ay, 0)

  // Collide with screen edges. The avatar window has a transparent halo
  // (TOOLTIP_HALO_PX) above the avatar; the WHOLE window must stay inside
  // the work area or macOS clips it (which previously made fun mode
  // appear to "stick" at the top — the avatar was alive at y≈29 but the
  // window with its halo was rendered partly off-screen and the OS would
  // not accept further upward setPosition calls).
  const display = screen.getDisplayNearestPoint({ x: state.ax, y: state.ay })
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea
  const minX = dx + 4
  const maxX = dx + dw - avatarSize - 4
  // Avatar's minimum Y so the window's top (= ay - TOOLTIP_HALO_PX) stays
  // inside the work area.
  const ceiling = dy + TOOLTIP_HALO_PX + 4
  // Treat the bottom of the work area as the floor.
  const floor = dy + dh - avatarSize - 4

  if (state.ax < minX) {
    state.ax = minX
    state.vx = Math.abs(state.vx) * BOUNCE_DAMPING
    // playful kick: spin a bit on wall hit
    state.rotateDeg += 25
    void import('./sound').then((m) => m.playSound('wall-bounce')).catch(() => undefined)
  } else if (state.ax > maxX) {
    state.ax = maxX
    state.vx = -Math.abs(state.vx) * BOUNCE_DAMPING
    state.rotateDeg -= 25
    void import('./sound').then((m) => m.playSound('wall-bounce')).catch(() => undefined)
  }

  if (state.ay > floor) {
    state.ay = floor
    if (Math.abs(state.vy) > 60) {
      state.vy = -Math.abs(state.vy) * BOUNCE_DAMPING
      // landing squash on the next frame is handled by behaviors that read scaleY
    } else {
      state.vy = 0
    }
    state.baselineY = floor
  }
  if (state.ay < ceiling) {
    state.ay = ceiling
    // Bounce DOWN with at least a minimum downward velocity so the avatar
    // can't get pinned against the top of the screen with vy ≈ 0. Without
    // a min, repeated ceiling kisses dampen vy to nothing and gravity has
    // to do all the work — visually it looks "stuck".
    state.vy = Math.max(80, Math.abs(state.vy) * 0.5)
  }

  // Move the window to follow the new avatar position. setPosition rejects
  // anything that isn't a finite integer with a TypeError, so guard hard.
  const windowWidthPx = win.getSize()[0]
  const windowOriginX = Math.round(state.ax - Math.floor((windowWidthPx - avatarSize) / 2))
  const windowOriginY = Math.round(state.ay - TOOLTIP_HALO_PX)
  if (
    !Number.isFinite(windowOriginX) ||
    !Number.isFinite(windowOriginY) ||
    !Number.isInteger(windowOriginX) ||
    !Number.isInteger(windowOriginY)
  ) {
    // State got corrupted — abort fun mode rather than crashing the app.
    logger.warn('Fun mode: bad window coords; stopping', {
      ax: state.ax,
      ay: state.ay,
      vx: state.vx,
      vy: state.vy,
      windowOriginX,
      windowOriginY
    })
    stop()
    return
  }
  win.setPosition(windowOriginX, windowOriginY, false)

  broadcastFrame()
}

/** Reset the avatar to a clean state when fun mode ends. */
function settle(): void {
  state.scaleY = 1
  state.scaleX = 1
  state.rotateDeg = 0
  broadcastFrame()
}

export function isActive(): boolean {
  return state.active
}

export function start(): void {
  if (state.active) return
  const win = getAvatarWindow()
  if (!win || win.isDestroyed()) return
  const settings = settingsStore().get()
  const avatarSize = Math.max(40, Math.min(120, settings.avatarSize))
  // Read the actual current avatar visible position from settings, falling
  // back to the bottom-right of the primary display if the saved value is
  // missing or non-finite (which would otherwise cause NaN propagation in
  // the physics integrator).
  const display = screen.getDisplayNearestPoint(win.getBounds())
  const fallback = {
    x: display.workArea.x + display.workArea.width - avatarSize - 24,
    y: display.workArea.y + display.workArea.height - avatarSize - 24
  }
  const saved = settings.avatarPosition
  const startPos =
    saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : fallback
  state.ax = startPos.x
  state.ay = startPos.y
  state.baselineY = display.workArea.y + display.workArea.height - avatarSize - 4
  state.vx = 0
  state.vy = 0
  state.rotateDeg = 0
  state.scaleX = 1
  state.scaleY = 1
  state.current = null
  // Anchor lastTickAt slightly in the past so the first dt is non-zero and
  // physics actually advances on the first tick.
  state.lastTickAt = Date.now() - TICK_MS
  state.active = true
  broadcastState(true)
  state.tickHandle = setInterval(tick, TICK_MS)
  logger.info('Fun mode: started')
}

export function stop(): void {
  if (!state.active) return
  state.active = false
  state.autoStopAt = 0
  if (state.tickHandle) {
    clearInterval(state.tickHandle)
    state.tickHandle = null
  }
  // Persist where Clawd ended up — but only if both coords are real numbers.
  if (Number.isFinite(state.ax) && Number.isFinite(state.ay)) {
    settingsStore().update({ avatarPosition: { x: state.ax, y: state.ay } })
  }
  settle()
  broadcastState(false)
  logger.info('Fun mode: stopped at', { x: state.ax, y: state.ay })
}

export function toggle(): void {
  if (state.active) stop()
  else start()
}

/**
 * Time-bounded fetch session. Just runs the fun-mode loop with a hard
 * stop after `durationMs`. The renderer shows a 🎾 ball overlay during
 * the same window so it reads as "playing fetch".
 */
export function playFetch(durationMs: number = 60_000): void {
  start()
  state.autoStopAt = Date.now() + durationMs
  // Re-broadcast so the renderer learns this is a fetch (not free-roam) — the
  // start() above already broadcast active=true with fetching=false.
  broadcastState(true)
}
