/**
 * Avatar window: small, frameless, transparent, always-on-top "panel" so it
 * floats above fullscreen apps on macOS.
 *
 * The window is intentionally LARGER than the avatar bitmap on every side
 * so the whisper / hover-suggestion tooltips can render outside the avatar
 * without being clipped by the OS at the window bounds:
 *   - vertical headroom: TOOLTIP_HALO_PX above + below
 *   - horizontal:        max(size, TOOLTIP_WINDOW_WIDTH)
 *
 * The halo bands are fully transparent and pointer-events-none, so the user
 * sees the avatar where they expect it, and clicks pass through the wings to
 * whatever is underneath.
 *
 * `settings.avatarPosition` stores the *avatar* visible top-left (NOT the
 * window origin). All translation between avatar coords and window coords
 * happens at the boundary in this file.
 */
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import logger from './logger'
import { settingsStore } from './settings'
import { clamp } from '@shared/time'
import { TOOLTIP_HALO_PX, TOOLTIP_WINDOW_WIDTH } from '@shared/constants'
import { IPC } from '@shared/ipc'
import type { AvatarLayout } from '@shared/types'

declare global {
  // Set to true once the user has explicitly chosen to quit (tray menu, Cmd+Q).
  // The avatar window's close handler reads this to distinguish "user closed
  // the window" (block & hide) from "the whole app is quitting" (let it close).
  // eslint-disable-next-line no-var
  var __pocketClawdQuitting: boolean | undefined
}

let win: BrowserWindow | null = null

/** Window width — at least as wide as the avatar, but capped for the tooltip. */
function windowWidth(size: number): number {
  return Math.max(size, TOOLTIP_WINDOW_WIDTH)
}

/** Window height — avatar + halo top + halo bottom. */
function windowHeight(size: number): number {
  return size + 2 * TOOLTIP_HALO_PX
}

/** Horizontal inset from the window's left edge to the avatar's left edge. */
function avatarSlotInsetX(size: number): number {
  return Math.floor((windowWidth(size) - size) / 2)
}

/**
 * Default avatar (visible top-left) for first launch.
 */
function defaultAvatarPosition(size: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const margin = 24
  return { x: width - size - margin, y: height - size - margin }
}

/** Translate avatar position → window origin, given the current avatar size.
 *  The result is then *clamped* to the screen by `clampWindowToScreen`. */
function avatarPosToWindowPos(p: { x: number; y: number }, size: number): { x: number; y: number } {
  return {
    x: p.x - avatarSlotInsetX(size),
    y: p.y - TOOLTIP_HALO_PX
  }
}

/** Translate window origin → avatar visible top-left, given the current avatar size.
 *  Used when reading back from native window position; assumes the window is unclamped. */
function windowPosToAvatarPos(p: { x: number; y: number }, size: number): { x: number; y: number } {
  return {
    x: p.x + avatarSlotInsetX(size),
    y: p.y + TOOLTIP_HALO_PX
  }
}

/**
 * Clamp the proposed window origin so the entire window stays within the
 * work area of the display nearest the *avatar* (not the window). Returns
 * the actually-used window origin AND the inset (in window px) where the
 * avatar slot must sit so the avatar appears at the user's intended X.
 *
 * Without this, when the avatar sits near the right edge of the screen, the
 * tooltip-bearing window extends past the edge and the OS clips the tooltip.
 */
function clampWindowToScreen(
  avatarPos: { x: number; y: number },
  size: number
): { windowPos: { x: number; y: number }; slotInsetX: number; slotInsetY: number } {
  const display = screen.getDisplayNearestPoint({ x: avatarPos.x, y: avatarPos.y })
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea
  const ww = windowWidth(size)
  const wh = windowHeight(size)

  // Naive window origin (avatar-centered).
  let wx = avatarPos.x - avatarSlotInsetX(size)
  let wy = avatarPos.y - TOOLTIP_HALO_PX

  // Clamp into the work area.
  if (wx < dx) wx = dx
  if (wy < dy) wy = dy
  if (wx + ww > dx + dw) wx = dx + dw - ww
  if (wy + wh > dy + dh) wy = dy + dh - wh

  // The avatar's intended screen position is fixed at avatarPos.{x,y}.
  // The slot inset is derived from where the avatar should sit relative
  // to the (possibly clamped) window origin.
  const slotInsetX = avatarPos.x - wx
  const slotInsetY = avatarPos.y - wy
  return { windowPos: { x: wx, y: wy }, slotInsetX, slotInsetY }
}

let lastLayout: AvatarLayout | null = null

/**
 * Send the current layout to the avatar renderer so it can draw the avatar
 * slot at the correct offset within the (possibly clamped) window.
 */
function emitLayout(slotInsetX: number, slotInsetY: number, size: number): void {
  if (!win || win.isDestroyed()) return
  const payload: AvatarLayout = {
    slotInsetX,
    slotInsetY,
    windowWidth: windowWidth(size),
    windowHeight: windowHeight(size),
    avatarSize: size
  }
  lastLayout = payload
  win.webContents.send(IPC.AVATAR_LAYOUT, payload)
}

export function createAvatarWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win

  const settings = settingsStore().get()
  const size = clamp(settings.avatarSize, 40, 120)
  const avatarPos = settings.avatarPosition ?? defaultAvatarPosition(size)
  const { windowPos, slotInsetX, slotInsetY } = clampWindowToScreen(avatarPos, size)

  win = new BrowserWindow({
    width: windowWidth(size),
    height: windowHeight(size),
    x: windowPos.x,
    y: windowPos.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000', // RGBA 0 alpha — kills the default opaque fill
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    movable: false, // we drag via JS to support click-vs-drag detection
    focusable: true,
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setVisibleOnAllWorkspaces(settings.showOnAllSpaces, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver')

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/avatar.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/avatar.html'))
  }

  // Send the initial layout once the renderer is ready to receive it.
  win.webContents.on('did-finish-load', () => {
    emitLayout(slotInsetX, slotInsetY, size)
  })

  // Note: window 'moved' events fire only when the OS moves the window
  // (e.g. setPosition or native drag from movable:true). Since we now drive
  // drag entirely via JS in the renderer (movable:false above), position
  // persistence happens in endDrag() — no 'moved' listener needed.

  /**
   * The avatar is the app's anchor — closing it would orphan the tray and
   * kill the user's only way back into chat. Block close attempts (Cmd+W,
   * window-control buttons, etc.) by reshowing the window. The only way to
   * exit is the tray "Quit Claude" item or Cmd+Q, which set the global
   * __pocketClawdQuitting flag before triggering the close.
   */
  win.on('close', (e) => {
    if (!globalThis.__pocketClawdQuitting) {
      e.preventDefault()
      win?.hide()
      setTimeout(() => win?.show(), 50)
    }
  })

  win.on('closed', () => {
    win = null
  })

  return win
}

/**
 * Snap the avatar (not the window) to a work-area edge if its origin is
 * within 20 px. Operates in avatar coordinates.
 */
function snapAvatarToEdge(
  avatarX: number,
  avatarY: number,
  size: number
): { x: number; y: number } | null {
  const display = screen.getDisplayNearestPoint({ x: avatarX, y: avatarY })
  const { x: ax, y: ay, width: aw, height: ah } = display.workArea
  const margin = 16
  const threshold = 20
  let nax = avatarX
  let nay = avatarY
  let snapped = false

  if (Math.abs(avatarX - ax) < threshold) {
    nax = ax + margin
    snapped = true
  } else if (Math.abs(ax + aw - (avatarX + size)) < threshold) {
    nax = ax + aw - size - margin
    snapped = true
  }
  if (Math.abs(avatarY - ay) < threshold) {
    nay = ay + margin
    snapped = true
  } else if (Math.abs(ay + ah - (avatarY + size)) < threshold) {
    nay = ay + ah - size - margin
    snapped = true
  }
  return snapped ? { x: nax, y: nay } : null
}

export function getAvatarWindow(): BrowserWindow | null {
  return win
}

/**
 * Drag state for the JS-driven move. We track the screen-space delta between
 * cursor and window origin at mouseDown, then on each mouseMove translate the
 * cursor's new screen position back to the window origin.
 */
let dragOffset: { dx: number; dy: number } | null = null

export function startDrag(cursorScreenX: number, cursorScreenY: number): void {
  if (!win || win.isDestroyed()) return
  const [wx, wy] = win.getPosition()
  dragOffset = { dx: cursorScreenX - wx, dy: cursorScreenY - wy }
}

export function dragTo(cursorScreenX: number, cursorScreenY: number): void {
  if (!win || win.isDestroyed() || !dragOffset) return
  const nx = Math.round(cursorScreenX - dragOffset.dx)
  const ny = Math.round(cursorScreenY - dragOffset.dy)
  win.setPosition(nx, ny, false)
}

export function endDrag(): void {
  if (!win || win.isDestroyed() || !dragOffset) {
    dragOffset = null
    return
  }
  const settings = settingsStore().get()
  const size = clamp(settings.avatarSize, 40, 120)
  const [wx, wy] = win.getPosition()
  // Approximate avatar position from current window origin assuming avatar
  // was centered in the window. (Mid-drag this is correct — we only clamp
  // when re-anchoring at end-of-drag below.)
  const avatarPos = windowPosToAvatarPos({ x: wx, y: wy }, size)
  const snapped = snapAvatarToEdge(avatarPos.x, avatarPos.y, size)
  const finalAvatarPos = snapped ?? avatarPos
  const { windowPos, slotInsetX, slotInsetY } = clampWindowToScreen(finalAvatarPos, size)
  win.setPosition(windowPos.x, windowPos.y, !!snapped)
  emitLayout(slotInsetX, slotInsetY, size)
  settingsStore().update({ avatarPosition: finalAvatarPos })
  dragOffset = null
}

/**
 * Resize the avatar bitmap. The window changes both width and height; we
 * keep the *avatar visible position* fixed across the resize so the mascot
 * doesn't drift in the corner.
 */
export function resizeAvatar(newSize: number): void {
  if (!win || win.isDestroyed()) return
  const size = clamp(newSize, 40, 120)
  const oldSettings = settingsStore().get()
  const oldSize = clamp(oldSettings.avatarSize, 40, 120)
  // Recover the avatar's current visible position in screen coords.
  const [oldWx, oldWy] = win.getPosition()
  const avatarPos = windowPosToAvatarPos({ x: oldWx, y: oldWy }, oldSize)
  // Clamp the new window position into the screen.
  const { windowPos, slotInsetX, slotInsetY } = clampWindowToScreen(avatarPos, size)
  win.setSize(windowWidth(size), windowHeight(size), true)
  win.setPosition(windowPos.x, windowPos.y, false)
  emitLayout(slotInsetX, slotInsetY, size)
  settingsStore().update({ avatarSize: size, avatarPosition: avatarPos })
  logger.debug('Avatar resized to', size, 'at', avatarPos)
}

export function setShowOnAllSpaces(visible: boolean): void {
  if (!win || win.isDestroyed()) return
  win.setVisibleOnAllWorkspaces(visible, { visibleOnFullScreen: true })
  settingsStore().update({ showOnAllSpaces: visible })
}

/** Get the most recently emitted avatar layout (or null before first emit). */
export function getLastLayout(): AvatarLayout | null {
  return lastLayout
}
