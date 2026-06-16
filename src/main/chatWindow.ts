/**
 * Chat panel — frameless 380×520 window, also alwaysOnTop, anchored above the avatar.
 */
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { getAvatarWindow } from './avatarWindow'
import { IPC } from '@shared/ipc'

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
    // Tell the avatar to glance toward the chat window. Direction is based
    // on the chat's screen-X relative to the avatar's screen-X.
    const avatar = getAvatarWindow()
    if (avatar && !avatar.isDestroyed()) {
      const [ax] = avatar.getPosition()
      const [aw] = avatar.getSize()
      const [cx] = win.getPosition()
      const [cw] = win.getSize()
      const avatarMid = ax + aw / 2
      const chatMid = cx + cw / 2
      const dir = chatMid > avatarMid ? 'right' : 'left'
      avatar.webContents.send(IPC.AVATAR_GAZE, { direction: dir })
    }
  })

  win.on('blur', () => {
    // Stay open on blur — the panel is alwaysOnTop and explicit close.
  })

  // Capture this BrowserWindow in a local so the 'closed' handler doesn't
  // clobber a *different* freshly-created chat window if the user closes
  // and re-opens chat in quick succession (Electron fires 'closed'
  // asynchronously after createChatWindow returns and may overlap a
  // reopen call that has already replaced module-scoped `win`).
  const thisWin = win
  thisWin.on('closed', () => {
    if (win === thisWin) win = null
    // Clear the gaze when chat closes.
    const avatar = getAvatarWindow()
    if (avatar && !avatar.isDestroyed()) {
      avatar.webContents.send(IPC.AVATAR_GAZE, { direction: 'none' })
    }
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
