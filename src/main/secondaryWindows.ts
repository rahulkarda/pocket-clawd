/** Floating Todo panel + Settings panel + Companion (info) panel. */
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { getAvatarWindow } from './avatarWindow'

let todoWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let companionWin: BrowserWindow | null = null
let pomodoroWin: BrowserWindow | null = null
let quickCaptureWin: BrowserWindow | null = null

const TODO_W = 320
const TODO_H = 380
const SETTINGS_W = 520
const SETTINGS_H = 580
const COMPANION_W = 560
const COMPANION_H = 640
const POMODORO_W = 360
const POMODORO_H = 460
const QUICK_W = 360
const QUICK_H = 88

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
    todoWin.moveTop()
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
  todoWin.setAlwaysOnTop(true, 'screen-saver')

  if (process.env['ELECTRON_RENDERER_URL']) {
    void todoWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/todo.html`)
  } else {
    void todoWin.loadFile(path.join(__dirname, '../renderer/todo.html'))
  }
  todoWin.once('ready-to-show', () => {
    if (!todoWin) return
    todoWin.show()
    todoWin.moveTop()
    todoWin.focus()
  })
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
    settingsWin.moveTop()
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
  // Match the chat panel's window level so opening Settings while chat
  // is in front doesn't bury Settings underneath. Plain alwaysOnTop:true
  // alone isn't enough — chat is at 'screen-saver' level on macOS, and
  // moveTop() can't lift across levels.
  settingsWin.setAlwaysOnTop(true, 'screen-saver')
  settingsWin.once('ready-to-show', () => {
    if (!settingsWin) return
    settingsWin.show()
    settingsWin.moveTop()
    settingsWin.focus()
  })
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

/**
 * Companion window — read-only "About / What can Clawd do" panel.
 * Same chrome as Settings but its own renderer entry.
 */
export function createCompanionWindow(): BrowserWindow {
  if (companionWin && !companionWin.isDestroyed()) {
    companionWin.show()
    companionWin.moveTop()
    companionWin.focus()
    return companionWin
  }
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  companionWin = new BrowserWindow({
    width: COMPANION_W,
    height: COMPANION_H,
    x: Math.floor((width - COMPANION_W) / 2),
    y: Math.floor((height - COMPANION_H) / 2),
    frame: false,
    transparent: false,
    backgroundColor: '#0D0D0D',
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    show: false,
    title: 'Companion',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void companionWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/companion.html`)
  } else {
    void companionWin.loadFile(path.join(__dirname, '../renderer/companion.html'))
  }
  companionWin.setAlwaysOnTop(true, 'screen-saver')
  companionWin.once('ready-to-show', () => {
    if (!companionWin) return
    companionWin.show()
    companionWin.moveTop()
    companionWin.focus()
  })
  companionWin.on('closed', () => {
    companionWin = null
  })
  return companionWin
}

export function closeCompanionWindow(): void {
  if (companionWin && !companionWin.isDestroyed()) companionWin.close()
  companionWin = null
}

export function getCompanionWindow(): BrowserWindow | null {
  return companionWin
}

/**
 * Pomodoro window — floating panel anchored above the avatar (similar to
 * Todo). Shows timer + start/pause/skip controls.
 */
export function createPomodoroWindow(): BrowserWindow {
  if (pomodoroWin && !pomodoroWin.isDestroyed()) {
    pomodoroWin.show()
    pomodoroWin.moveTop()
    pomodoroWin.focus()
    return pomodoroWin
  }
  const { x, y } = anchorAboveAvatar(POMODORO_W, POMODORO_H)
  pomodoroWin = new BrowserWindow({
    width: POMODORO_W,
    height: POMODORO_H,
    x,
    y,
    frame: false,
    transparent: false,
    backgroundColor: '#0D0D0D',
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'Pomodoro',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  pomodoroWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  pomodoroWin.setAlwaysOnTop(true, 'screen-saver')

  if (process.env['ELECTRON_RENDERER_URL']) {
    void pomodoroWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/pomodoro.html`)
  } else {
    void pomodoroWin.loadFile(path.join(__dirname, '../renderer/pomodoro.html'))
  }
  pomodoroWin.once('ready-to-show', () => {
    if (!pomodoroWin) return
    pomodoroWin.show()
    pomodoroWin.moveTop()
    pomodoroWin.focus()
  })
  pomodoroWin.on('closed', () => {
    pomodoroWin = null
  })
  return pomodoroWin
}

export function closePomodoroWindow(): void {
  if (pomodoroWin && !pomodoroWin.isDestroyed()) pomodoroWin.close()
  pomodoroWin = null
}

export function getPomodoroWindow(): BrowserWindow | null {
  return pomodoroWin
}

/**
 * Quick Capture — tiny single-input window summoned via Cmd+Shift+T.
 * Type a todo, hit Enter, window closes and the todo is added. Esc closes.
 * Sized to be unobtrusive; centered.
 */
export function createQuickCaptureWindow(): BrowserWindow {
  if (quickCaptureWin && !quickCaptureWin.isDestroyed()) {
    quickCaptureWin.show()
    quickCaptureWin.moveTop()
    quickCaptureWin.focus()
    return quickCaptureWin
  }
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  quickCaptureWin = new BrowserWindow({
    width: QUICK_W,
    height: QUICK_H,
    x: Math.floor((width - QUICK_W) / 2),
    y: Math.floor(height * 0.35),
    frame: false,
    transparent: false,
    backgroundColor: '#0D0D0D',
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'Quick Capture',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  quickCaptureWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  quickCaptureWin.setAlwaysOnTop(true, 'screen-saver')
  if (process.env['ELECTRON_RENDERER_URL']) {
    void quickCaptureWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/quick.html`)
  } else {
    void quickCaptureWin.loadFile(path.join(__dirname, '../renderer/quick.html'))
  }
  quickCaptureWin.once('ready-to-show', () => {
    if (!quickCaptureWin) return
    quickCaptureWin.show()
    quickCaptureWin.moveTop()
    quickCaptureWin.focus()
  })
  // Auto-close on blur — feels right for a transient pop-in.
  quickCaptureWin.on('blur', () => {
    if (quickCaptureWin && !quickCaptureWin.isDestroyed()) quickCaptureWin.close()
  })
  quickCaptureWin.on('closed', () => {
    quickCaptureWin = null
  })
  return quickCaptureWin
}

export function closeQuickCaptureWindow(): void {
  if (quickCaptureWin && !quickCaptureWin.isDestroyed()) quickCaptureWin.close()
  quickCaptureWin = null
}
