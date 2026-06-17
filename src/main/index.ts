/**
 * Main entry. Wires everything together:
 * - settings + keychain
 * - tray + avatar + global hotkey
 * - idle tracker + whisper engine
 * - IPC handlers
 */
import { app, BrowserWindow, powerMonitor } from 'electron'
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
import { createSettingsWindow, createCompanionWindow, createPomodoroWindow } from './secondaryWindows'
import { applyHotkeyFromSettings, broadcast, registerIpc } from './ipcHandlers'
import idleTracker from './idleTracker'
import { fireImmediate, startWhisperEngine, stopWhisperEngine } from './whisperEngine'
import { startRolloverTicker, getDaily, onChange as onTodoChange } from './todoStore'
import { unregisterAllHotkeys, registerExtraHotkey } from './hotkey'
import { configureAutoUpdater } from './updater'
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
    onOpenCompanion: () => createCompanionWindow(),
    onOpenPomodoro: () => createPomodoroWindow(),
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
    onOpenCompanion: () => createCompanionWindow(),
    onOpenPomodoro: () => createPomodoroWindow(),
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
  // Phase 2 sleep mode: broadcast AVATAR_SLEEP_STATE so the avatar
  // renderer can show a curled-up Clawd with z's. Independent of the
  // idle-alert state; both can be active simultaneously.
  idleTracker.on('sleeping', () => {
    broadcast(IPC.AVATAR_SLEEP_STATE, { sleeping: true })
  })
  idleTracker.on('awake', () => {
    broadcast(IPC.AVATAR_SLEEP_STATE, { sleeping: false })
  })
  idleTracker.start()

  // ─── Todo rollover ────────────────────────────────────
  startRolloverTicker()

  // ─── Pet engine (idle-nudge ticker) ───────────────────
  void import('./pettingEngine').then((m) => m.startPetEngine())

  // ─── Achievements (periodic predicate check) ─────────
  void import('./achievements').then((m) => m.start())

  // ─── Emote engine (CPU-load watch) ──────────────────
  void import('./emoteEngine').then((m) => m.start())

  // ─── Background schedulers (daily summary, hour bell, clipboard) ─
  void import('./schedulers').then((m) => m.startSchedulers())

  // ─── Chess game store (load persisted board if any) ─
  void import('./chessGame').then((m) => m.startChess())
  void import('./chessOpenings').then((m) => m.validateOpenings())

  // ─── Quick capture global shortcut (Cmd+Shift+T) ────
  registerExtraHotkey('CommandOrControl+Shift+T', () => {
    void import('./secondaryWindows').then((m) => m.createQuickCaptureWindow())
  })

  // ─── Summon Clawd hotkey ────────────────────────────
  // Brings the avatar to the active space, lifts it above other windows,
  // and focuses it. Useful when the user has buried it under fullscreen
  // apps or moved to a different space.
  //
  // Cmd+Shift+P is reportedly eaten by some apps (VS Code's command
  // palette, browsers' Print). We try a list in order; the first one the
  // OS actually grabs wins. Even when registerExtraHotkey returns true
  // for one of these, that doesn't guarantee macOS routes the keystroke
  // to us — it can be soft-claimed by a focused app — so registering a
  // secondary helps. Both fire the same handler.
  const summonClawd = (): void => {
    const avatar = getAvatarWindow()
    if (!avatar || avatar.isDestroyed()) {
      createAvatarWindow()
      return
    }
    avatar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    if (!avatar.isVisible()) avatar.show()
    avatar.setAlwaysOnTop(true, 'screen-saver')
    avatar.moveTop()
    avatar.focus()
    logger.info('Summon Clawd: triggered')
    const desired = settingsStore().get().showOnAllSpaces
    if (!desired) {
      setTimeout(() => {
        if (avatar && !avatar.isDestroyed()) {
          avatar.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true })
        }
      }, 600)
    }
  }
  // Primary + fallback. Both are wired so users can hit whichever sticks.
  registerExtraHotkey('CommandOrControl+Shift+P', summonClawd)
  registerExtraHotkey('CommandOrControl+Alt+C', summonClawd)

  // ─── Wake greetings ──────────────────────────────────
  // After resuming from sleep, surface a friendly "welcome back" via the
  // whisper pipeline. Throttled by the OS so spurious resumes won't spam.
  const WAKE_PHRASES = [
    'welcome back',
    'good to see you',
    'glad you’re back',
    'i missed you',
    'ready when you are'
  ]
  let lastWakeAt = 0
  powerMonitor.on('resume', () => {
    const s = settingsStore().get()
    if (!s.wakeGreetings) return
    const now = Date.now()
    if (now - lastWakeAt < 5 * 60 * 1000) return // 5-minute floor
    lastWakeAt = now
    const phrase = WAKE_PHRASES[Math.floor(Math.random() * WAKE_PHRASES.length)] ?? 'hi!'
    void import('./whisperEngine').then((m) => m.surfaceWhisper(phrase))
    void import('./sound').then((m) => m.playSound('wake')).catch(() => undefined)
  })

  // ─── Birthday check ───────────────────────────────────
  // If today matches the configured birthday: switch to party costume for
  // the day and surface a one-shot happy-birthday whisper. Runs once at
  // boot AND every 6 hours after, so a long-running app catches midnight
  // rollovers without depending on system suspend events.
  let lastBirthdayKey = ''
  const checkBirthday = async (): Promise<void> => {
    const s = settingsStore().get()
    if (!s.birthday) return
    const now = new Date()
    if (now.getMonth() + 1 !== s.birthday.month || now.getDate() !== s.birthday.day) {
      // If costume was "party" because of a past birthday, leave the user
      // to clear it manually — we don't undo their costume choice.
      return
    }
    const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    if (lastBirthdayKey === todayKey) return
    lastBirthdayKey = todayKey
    if (s.costume !== 'party') {
      settingsStore().update({ costume: 'party' })
    }
    const mod = await import('./whisperEngine')
    setTimeout(() => mod.surfaceWhisper('happy birthday! 🎉'), 1500)
  }
  void checkBirthday()
  setInterval(() => void checkBirthday(), 6 * 60 * 60 * 1000)

  // ─── Pomodoro: auto-suggest on first todo of the day ─
  // We watch todoStore changes; when the count goes from 0 to 1 in a single
  // calendar day and pomodoro is idle, we surface a one-shot whisper.
  let lastTodoCount = getDaily().todos.length
  let suggestedToday = false
  let suggestedDateKey = new Date().toISOString().slice(0, 10)
  onTodoChange(() => {
    void import('./pomodoro').then((pomodoro) => {
      const todayKey = new Date().toISOString().slice(0, 10)
      if (todayKey !== suggestedDateKey) {
        suggestedDateKey = todayKey
        suggestedToday = false
      }
      const count = getDaily().todos.length
      const settings = settingsStore().get()
      const grew = count > lastTodoCount && lastTodoCount === 0 && count === 1
      lastTodoCount = count
      if (
        grew &&
        !suggestedToday &&
        !pomodoro.isActive() &&
        settings.pomodoroSuggestOnFirstTodo
      ) {
        suggestedToday = true
        // Reuse the whisper system to surface a friendly nudge.
        void import('./whisperEngine').then((m) => {
          m.surfaceWhisper("First todo of the day — want a 25-min focus block? Right-click me → Pomodoro")
        })
      }
    })
  })

  // ─── Whisper engine ───────────────────────────────────
  if (await hasApiKey()) {
    startWhisperIfNeeded()
  } else {
    logger.warn('No API key — opening Settings for first run')
    createSettingsWindow()
    // Poll for the user adding a key, so whispers start without a restart.
    watchForApiKey()
  }

  // ─── Auto-updater (no-op in dev, active when packaged) ──
  configureAutoUpdater()

  logger.info('Pocket Clawd ready')
}

app.whenReady().then(() => {
  // Last-resort guard so a transient bug in a tick loop or async tool call
  // doesn't kill the app with a native error dialog. We log it and stop
  // fun mode (the most likely culprit because it ticks at 60Hz).
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception in main', err)
    void import('./funEngine')
      .then((m) => {
        if (m.isActive()) m.stop()
      })
      .catch(() => undefined)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection in main', reason)
  })

  // Konami code listener — attached to every BrowserWindow created in the
  // app. We hook web-contents-created which fires once per window.
  void import('./konami').then((konami) => {
    app.on('browser-window-created', (_e, win) => konami.attachToWindow(win))
    // Also attach to any windows that already exist (avatar bootstraps fast).
    for (const w of BrowserWindow.getAllWindows()) konami.attachToWindow(w)
  })

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
  // Stop fun mode if it's running so the tick loop doesn't fight teardown.
  void import('./funEngine').then((m) => m.stop())
  // Stop pomodoro tick.
  void import('./pomodoro').then((m) => m.shutdown())
  // Stop pet idle-nudge ticker.
  void import('./pettingEngine').then((m) => m.shutdown())
  // Reset konami state.
  void import('./konami').then((m) => m.shutdown())
  // Achievements ticker.
  void import('./achievements').then((m) => m.shutdown())
  // Emote engine.
  void import('./emoteEngine').then((m) => m.shutdown())
  // Background schedulers.
  void import('./schedulers').then((m) => m.shutdown())
  if (apiKeyWatchInterval) {
    clearInterval(apiKeyWatchInterval)
    apiKeyWatchInterval = null
  }
})
