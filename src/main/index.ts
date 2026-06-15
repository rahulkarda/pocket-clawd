/**
 * Main entry. Wires everything together:
 * - settings + keychain
 * - tray + avatar + global hotkey
 * - idle tracker + whisper engine
 * - IPC handlers
 */
import { app, BrowserWindow } from 'electron'
import logger from './logger'
import { settingsStore } from './settings'
import { hasApiKey } from './keychain'
import { createTray } from './tray'
import { createAvatarWindow, getAvatarWindow } from './avatarWindow'
import {
  createChatWindow,
  closeChatWindow,
  getChatWindow
} from './chatWindow'
import { createSettingsWindow } from './secondaryWindows'
import { applyHotkeyFromSettings, broadcast, registerIpc } from './ipcHandlers'
import idleTracker from './idleTracker'
import { fireImmediate, startWhisperEngine, stopWhisperEngine } from './whisperEngine'
import { startRolloverTicker } from './todoStore'
import { unregisterAllHotkeys } from './hotkey'
import { IPC } from '@shared/ipc'
import type { AvatarAnimState } from '@shared/types'

// ─── Single instance lock ─────────────────────────────────
// If another instance already holds the lock, exit immediately.
// `app.quit()` is async; without `process.exit()` the rest of this
// module would still register listeners and bootstrap the app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  const avatar = getAvatarWindow()
  if (avatar) avatar.show()
})

// macOS: keep running when last window closes — this is a tray app
app.on('window-all-closed', () => {
  // Intentionally do not call app.quit(); we live in the menubar.
})

let currentAnimState: AvatarAnimState = 'idle'
function setAvatarState(state: AvatarAnimState): void {
  currentAnimState = state
  broadcast(IPC.AVATAR_ANIM_STATE, state)
}

/**
 * Open or focus the chat window AND hook its lifecycle:
 * - on open  → avatar goes 'active'
 * - on close → avatar goes back to 'idle' (unless an idle-alert is active)
 *
 * Centralized here so every entry point (hotkey, tray click, avatar click,
 * context menu) gets identical behavior.
 */
function openChatWithLifecycle(): void {
  const win = createChatWindow()
  setAvatarState('active')
  win.once('closed', () => {
    if (currentAnimState === 'active') setAvatarState('idle')
  })
}

let whisperRunning = false
function startWhisperIfNeeded(): void {
  if (whisperRunning) return
  whisperRunning = true
  startWhisperEngine((text) => {
    broadcast(IPC.AVATAR_WHISPER, { text, durationMs: 6000 })
    const prev = currentAnimState
    setAvatarState('whisper')
    setTimeout(() => {
      if (currentAnimState === 'whisper') setAvatarState(prev === 'whisper' ? 'idle' : prev)
    }, 1200)
  })
}

/** Polls the Keychain every 30s after a no-key bootstrap so the user can
 *  add the key in Settings without having to restart the app. The handle
 *  is module-scoped so will-quit can clear it. */
let apiKeyWatchInterval: NodeJS.Timeout | null = null
function watchForApiKey(): void {
  if (apiKeyWatchInterval) return
  apiKeyWatchInterval = setInterval(async () => {
    if (await hasApiKey()) {
      logger.info('API key detected — starting whisper engine')
      startWhisperIfNeeded()
      if (apiKeyWatchInterval) {
        clearInterval(apiKeyWatchInterval)
        apiKeyWatchInterval = null
      }
    }
  }, 30_000)
}

async function bootstrap(): Promise<void> {
  // Settings + idle threshold
  const settings = settingsStore().get()
  idleTracker.setThresholdMinutes(settings.idleAlertMinutes)

  // Apply the persisted "open at login" setting on every launch so it
  // stays in sync if the user re-installed or moved the .app bundle.
  // Hidden:true means the avatar is suppressed at first; the tray icon
  // still appears and Cmd+Shift+C still opens chat.
  app.setLoginItemSettings({
    openAtLogin: settings.openAtLogin,
    openAsHidden: false
  })

  // ─── Tray ─────────────────────────────────────────────
  createTray({
    onOpenChat: () => openChatWithLifecycle(),
    onOpenSettings: () => createSettingsWindow(),
    onQuit: () => app.quit()
  })

  // ─── Avatar window (always present) ───────────────────
  createAvatarWindow()

  // ─── IPC ──────────────────────────────────────────────
  registerIpc({
    onOpenChat: () => openChatWithLifecycle(),
    onOpenTodos: () => {
      // imported lazily to avoid circular import surface
      import('./secondaryWindows').then((m) => m.createTodoWindow())
    },
    onOpenSettings: () => createSettingsWindow(),
    onQuit: () => app.quit(),
    onApplyHotkey: (accel) => {
      applyHotkeyFromSettings(() => {
        const existing = getChatWindow()
        if (existing && !existing.isDestroyed()) {
          closeChatWindow()
        } else {
          openChatWithLifecycle()
        }
      })
      logger.info('Hotkey re-applied:', accel)
    }
  })

  // ─── Hotkey ───────────────────────────────────────────
  // The hotkey toggles the chat panel. Open path goes through
  // openChatWithLifecycle so the avatar state machine stays in sync.
  applyHotkeyFromSettings(() => {
    const existing = getChatWindow()
    if (existing && !existing.isDestroyed()) {
      closeChatWindow()
    } else {
      openChatWithLifecycle()
    }
  })

  // ─── Idle tracker ─────────────────────────────────────
  idleTracker.on('idle-alert', () => {
    setAvatarState('idle-alert')
    if (settingsStore().get().whisperOnIdleAlert) {
      void fireImmediate()
    }
  })
  idleTracker.on('active', () => {
    if (currentAnimState === 'idle-alert') setAvatarState('idle')
  })
  idleTracker.start()

  // ─── Todo rollover ────────────────────────────────────
  startRolloverTicker()

  // ─── Whisper engine ───────────────────────────────────
  if (await hasApiKey()) {
    startWhisperIfNeeded()
  } else {
    logger.warn('No API key — opening Settings for first run')
    createSettingsWindow()
    // Poll for the user adding a key, so whispers start without a restart.
    watchForApiKey()
  }

  logger.info('Pocket Clawd ready')
}

app.whenReady().then(() => {
  void bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createAvatarWindow()
  })
})

// Mark that we're quitting BEFORE windows start closing, so the avatar
// window's close-blocker (which would normally re-show it on Cmd+W) lets
// it actually close this time. Fires for tray "Quit Claude", Cmd+Q, and
// any programmatic app.quit().
app.on('before-quit', () => {
  globalThis.__pocketClawdQuitting = true
})

app.on('will-quit', () => {
  unregisterAllHotkeys()
  stopWhisperEngine()
  idleTracker.stop()
  if (apiKeyWatchInterval) {
    clearInterval(apiKeyWatchInterval)
    apiKeyWatchInterval = null
  }
})
