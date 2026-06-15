/**
 * Avatar window: small, frameless, transparent, always-on-top "panel" so it
 * floats above fullscreen apps on macOS.
 */
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import logger from './logger'
import { settingsStore } from './settings'
import { clamp } from '@shared/time'

declare global {
  // Set to true once the user has explicitly chosen to quit (tray menu, Cmd+Q).
  // The avatar window's close handler reads this to distinguish "user closed
  // the window" (block & hide) from "the whole app is quitting" (let it close).
  // eslint-disable-next-line no-var
  var __pocketClaudeQuitting: boolean | undefined
}

let win: BrowserWindow | null = null

function defaultPosition(size: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const margin = 24
  return { x: width - size - margin, y: height - size - margin }
}

export function createAvatarWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win

  const settings = settingsStore().get()
  const size = clamp(settings.avatarSize, 40, 120)
  const pos = settings.avatarPosition ?? defaultPosition(size)

  win = new BrowserWindow({
    width: size,
    height: size,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    movable: true,
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

  win.on('moved', () => {
    if (!win) return
    const [x, y] = win.getPosition()
    const snapped = snapToEdge(x, y, size)
    if (snapped) {
      win.setPosition(snapped.x, snapped.y, true)
      settingsStore().update({ avatarPosition: snapped })
    } else {
      settingsStore().update({ avatarPosition: { x, y } })
    }
  })

  /**
   * The avatar is the app's anchor — closing it would orphan the tray and
   * kill the user's only way back into chat. Block close attempts (Cmd+W,
   * window-control buttons, etc.) by reshowing the window. The only way to
   * exit is the tray "Quit Claude" item or Cmd+Q, which set the global
   * __pocketClaudeQuitting flag before triggering the close.
   */
  win.on('close', (e) => {
    if (!globalThis.__pocketClaudeQuitting) {
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

/** Snap the window if its origin is within 20px of any work-area edge. */
function snapToEdge(
  x: number,
  y: number,
  size: number
): { x: number; y: number } | null {
  const display = screen.getDisplayNearestPoint({ x, y })
  const { x: ax, y: ay, width: aw, height: ah } = display.workArea
  const margin = 16
  const threshold = 20
  let nx = x
  let ny = y
  let snapped = false

  if (Math.abs(x - ax) < threshold) {
    nx = ax + margin
    snapped = true
  } else if (Math.abs(ax + aw - (x + size)) < threshold) {
    nx = ax + aw - size - margin
    snapped = true
  }
  if (Math.abs(y - ay) < threshold) {
    ny = ay + margin
    snapped = true
  } else if (Math.abs(ay + ah - (y + size)) < threshold) {
    ny = ay + ah - size - margin
    snapped = true
  }
  return snapped ? { x: nx, y: ny } : null
}

export function getAvatarWindow(): BrowserWindow | null {
  return win
}

export function resizeAvatar(newSize: number): void {
  if (!win || win.isDestroyed()) return
  const size = clamp(newSize, 40, 120)
  const [x, y] = win.getPosition()
  win.setSize(size, size, true)
  settingsStore().update({ avatarSize: size })
  logger.debug('Avatar resized to', size, 'at', { x, y })
}

export function setShowOnAllSpaces(visible: boolean): void {
  if (!win || win.isDestroyed()) return
  win.setVisibleOnAllWorkspaces(visible, { visibleOnFullScreen: true })
  settingsStore().update({ showOnAllSpaces: visible })
}
