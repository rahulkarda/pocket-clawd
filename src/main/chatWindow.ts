/**
 * Chat panel — frameless 380×520 window, also alwaysOnTop, anchored above the avatar.
 */
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { getAvatarWindow } from './avatarWindow'

let win: BrowserWindow | null = null

const W = 380
const H = 520
const GAP = 12

function anchorPosition(): { x: number; y: number } {
  const avatar = getAvatarWindow()
  const display = screen.getPrimaryDisplay()
  if (!avatar || avatar.isDestroyed()) {
    const { width, height } = display.workAreaSize
    return { x: width - W - 24, y: height - H - 24 }
  }
  const [ax, ay] = avatar.getPosition()
  const [aw] = avatar.getSize()
  const { x: dx, y: dy, width: dw } = display.workArea
  // Default: open up-and-left of avatar
  let x = ax + aw - W
  let y = ay - H - GAP
  if (x < dx + 8) x = dx + 8
  if (x + W > dx + dw - 8) x = dx + dw - W - 8
  if (y < dy + 8) y = ay + GAP // open below if no room above
  return { x, y }
}

export function createChatWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return win
  }
  const { x, y } = anchorPosition()

  win = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver')

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/chat.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/chat.html'))
  }

  win.once('ready-to-show', () => {
    if (!win) return
    win.show()
    win.focus()
  })

  win.on('blur', () => {
    // Stay open on blur — the panel is alwaysOnTop and explicit close.
  })

  win.on('closed', () => {
    win = null
  })

  return win
}

export function getChatWindow(): BrowserWindow | null {
  return win
}

export function closeChatWindow(): void {
  if (win && !win.isDestroyed()) win.close()
  win = null
}

export function toggleChatWindow(): void {
  if (win && !win.isDestroyed()) {
    closeChatWindow()
  } else {
    createChatWindow()
  }
}
