/** Floating Todo panel + Settings panel — both frameless, alwaysOnTop. */
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { getAvatarWindow } from './avatarWindow'

let todoWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null

const TODO_W = 320
const TODO_H = 380
const SETTINGS_W = 520
const SETTINGS_H = 580

function anchorAboveAvatar(w: number, h: number): { x: number; y: number } {
  const avatar = getAvatarWindow()
  const display = screen.getPrimaryDisplay()
  if (!avatar || avatar.isDestroyed()) {
    const { width, height } = display.workAreaSize
    return { x: width - w - 24, y: height - h - 24 }
  }
  const [ax, ay] = avatar.getPosition()
  const [aw] = avatar.getSize()
  let x = ax + aw - w
  let y = ay - h - 12
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea
  if (x < dx + 8) x = dx + 8
  if (x + w > dx + dw - 8) x = dx + dw - w - 8
  if (y < dy + 8) y = ay + 12
  if (y + h > dy + dh - 8) y = dy + dh - h - 8
  return { x, y }
}

export function createTodoWindow(): BrowserWindow {
  if (todoWin && !todoWin.isDestroyed()) {
    todoWin.show()
    todoWin.focus()
    return todoWin
  }
  const { x, y } = anchorAboveAvatar(TODO_W, TODO_H)
  todoWin = new BrowserWindow({
    width: TODO_W,
    height: TODO_H,
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
  todoWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void todoWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/todo.html`)
  } else {
    void todoWin.loadFile(path.join(__dirname, '../renderer/todo.html'))
  }
  todoWin.once('ready-to-show', () => todoWin?.show())
  todoWin.on('closed', () => {
    todoWin = null
  })
  return todoWin
}

export function getTodoWindow(): BrowserWindow | null {
  return todoWin
}

export function closeTodoWindow(): void {
  if (todoWin && !todoWin.isDestroyed()) todoWin.close()
  todoWin = null
}

export function createSettingsWindow(): BrowserWindow {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return settingsWin
  }
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  settingsWin = new BrowserWindow({
    width: SETTINGS_W,
    height: SETTINGS_H,
    x: Math.floor((width - SETTINGS_W) / 2),
    y: Math.floor((height - SETTINGS_H) / 2),
    frame: false,
    transparent: false,
    backgroundColor: '#0D0D0D',
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    show: false,
    title: 'Settings',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void settingsWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`)
  } else {
    void settingsWin.loadFile(path.join(__dirname, '../renderer/settings.html'))
  }
  settingsWin.once('ready-to-show', () => settingsWin?.show())
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  return settingsWin
}

export function closeSettingsWindow(): void {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close()
  settingsWin = null
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWin
}
