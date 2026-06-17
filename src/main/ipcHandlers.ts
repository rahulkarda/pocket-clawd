/**
 * Centralized IPC registration. All main-side handlers live here so the
 * surface area is auditable in one file.
 */
import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron'
import { IPC } from '@shared/ipc'
import logger from './logger'
import * as keychain from './keychain'
import { settingsStore } from './settings'
import { resetClient, streamChat } from './anthropicClient'
import { extractSpec, stripSpecBlock, writeSpec, setLastSpec } from './specWriter'
import { clearMemory, getMemoryRoot, getMemoryStats } from './memory'
import idleTracker from './idleTracker'
import {
  addTodo,
  deleteTodo,
  getDaily,
  onChange as onTodoChange,
  pendingCarryForward,
  resolveCarryForward,
  toggleTodo
} from './todoStore'
import {
  createChatWindow,
  closeChatWindow,
  getChatWindow
} from './chatWindow'
import {
  createTodoWindow,
  closeTodoWindow,
  getTodoWindow,
  createSettingsWindow,
  closeSettingsWindow,
  createCompanionWindow,
  closeCompanionWindow,
  createPomodoroWindow,
  closePomodoroWindow
} from './secondaryWindows'
import { resizeAvatar, getAvatarWindow, startDrag, dragTo, endDrag, getLastLayout } from './avatarWindow'
import { showAvatarContextMenu, type AvatarMenuActions } from './avatarMenu'
import { registerHotkey } from './hotkey'
import { getToolsetForCompanion } from './tools'
import * as funEngine from './funEngine'
import * as pomodoro from './pomodoro'
import * as petting from './pettingEngine'
import * as snackEngine from './snackEngine'
import * as collection from './collection'
import * as achievements from './achievements'
import type { ChatMessage, AppSettings, ChatStreamEvent } from '@shared/types'

interface AppActions extends AvatarMenuActions {
  onApplyHotkey: (accel: string) => void
}

/** Broadcast an event to every open window. */
function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

export function registerIpc(actions: AppActions): void {
  // ─── Settings ───────────────────────────────────────
  ipcMain.handle(IPC.SETTINGS_GET, (): AppSettings => settingsStore().get())

  ipcMain.handle(IPC.SETTINGS_UPDATE, (_e, patch: Partial<AppSettings>) => {
    // Defensive sanitization — IPC inputs cross a trust boundary even
    // though the only caller is our own renderer. Build the clean patch
    // FIELD-BY-FIELD with an allow-list — never spread `patch` directly,
    // because TypeScript's Partial<AppSettings> is erased at runtime and
    // any extra keys in the renderer payload would otherwise persist.
    const clean: Partial<AppSettings> = {}
    if (typeof patch.userContext === 'string') {
      clean.userContext = patch.userContext.slice(0, 4000)
    }
    if (typeof patch.baseURL === 'string') {
      clean.baseURL = patch.baseURL.trim().slice(0, 500)
    }
    if (typeof patch.hotkey === 'string') {
      clean.hotkey = patch.hotkey.trim().slice(0, 100)
    }
    if (typeof patch.outputDir === 'string') {
      clean.outputDir = patch.outputDir.slice(0, 1024)
    }
    if (typeof patch.model === 'string') {
      clean.model = patch.model.slice(0, 100)
    }
    if (patch.whisperIntervalMin !== undefined) {
      const n = Number(patch.whisperIntervalMin)
      clean.whisperIntervalMin = Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : 8
    }
    if (patch.whisperIntervalMax !== undefined) {
      const n = Number(patch.whisperIntervalMax)
      clean.whisperIntervalMax = Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : 12
    }
    if (patch.idleAlertMinutes !== undefined) {
      const n = Number(patch.idleAlertMinutes)
      clean.idleAlertMinutes = Number.isFinite(n) ? Math.max(5, Math.min(240, n)) : 30
    }
    if (patch.avatarSize !== undefined) {
      const n = Number(patch.avatarSize)
      clean.avatarSize = Number.isFinite(n) ? Math.max(40, Math.min(120, n)) : 64
    }
    if (patch.avatarPosition !== undefined) {
      // null = unset; otherwise must be {x:number, y:number}
      if (patch.avatarPosition === null) {
        clean.avatarPosition = null
      } else if (
        typeof patch.avatarPosition === 'object' &&
        Number.isFinite(patch.avatarPosition.x) &&
        Number.isFinite(patch.avatarPosition.y)
      ) {
        clean.avatarPosition = { x: patch.avatarPosition.x, y: patch.avatarPosition.y }
      }
    }
    if (patch.pomodoroWorkMin !== undefined) {
      const n = Number(patch.pomodoroWorkMin)
      clean.pomodoroWorkMin = Number.isFinite(n) ? Math.max(1, Math.min(180, Math.round(n))) : 25
    }
    if (patch.pomodoroShortBreakMin !== undefined) {
      const n = Number(patch.pomodoroShortBreakMin)
      clean.pomodoroShortBreakMin = Number.isFinite(n) ? Math.max(1, Math.min(60, Math.round(n))) : 5
    }
    if (patch.pomodoroLongBreakMin !== undefined) {
      const n = Number(patch.pomodoroLongBreakMin)
      clean.pomodoroLongBreakMin = Number.isFinite(n) ? Math.max(1, Math.min(120, Math.round(n))) : 15
    }
    if (patch.pomodoroCyclesBeforeLongBreak !== undefined) {
      const n = Number(patch.pomodoroCyclesBeforeLongBreak)
      clean.pomodoroCyclesBeforeLongBreak = Number.isFinite(n) ? Math.max(1, Math.min(12, Math.round(n))) : 4
    }
    if (patch.pomodoroAutoStartNext !== undefined) clean.pomodoroAutoStartNext = patch.pomodoroAutoStartNext === true
    if (patch.pomodoroNotify !== undefined) clean.pomodoroNotify = patch.pomodoroNotify === true
    if (patch.pomodoroSuggestOnFirstTodo !== undefined) clean.pomodoroSuggestOnFirstTodo = patch.pomodoroSuggestOnFirstTodo === true
    if (patch.whisperOnIdleAlert !== undefined) clean.whisperOnIdleAlert = patch.whisperOnIdleAlert === true
    if (patch.showOnAllSpaces !== undefined) clean.showOnAllSpaces = patch.showOnAllSpaces === true
    if (patch.openAtLogin !== undefined) clean.openAtLogin = patch.openAtLogin === true
    if (patch.enableWebSearch !== undefined) clean.enableWebSearch = patch.enableWebSearch === true
    if (patch.enableMemory !== undefined) clean.enableMemory = patch.enableMemory === true
    if (patch.onboarded !== undefined) clean.onboarded = patch.onboarded === true
    if (patch.costume !== undefined) {
      const allowed = ['none', 'santa', 'shades', 'party', 'witch'] as const
      clean.costume = (allowed as readonly string[]).includes(patch.costume as string)
        ? (patch.costume as AppSettings['costume'])
        : 'none'
    }
    if (patch.birthday !== undefined) {
      if (patch.birthday === null) {
        clean.birthday = null
      } else if (
        typeof patch.birthday === 'object' &&
        Number.isFinite(patch.birthday.month) &&
        Number.isFinite(patch.birthday.day) &&
        patch.birthday.month >= 1 && patch.birthday.month <= 12 &&
        patch.birthday.day >= 1 && patch.birthday.day <= 31
      ) {
        clean.birthday = {
          month: Math.round(patch.birthday.month),
          day: Math.round(patch.birthday.day)
        }
      } else {
        clean.birthday = null
      }
    }
    if (patch.wakeGreetings !== undefined) {
      clean.wakeGreetings = patch.wakeGreetings === true
    }
    if (patch.mute !== undefined) clean.mute = patch.mute === true
    if (patch.volume !== undefined) {
      const n = Number(patch.volume)
      clean.volume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.6
    }

    const prev = settingsStore().get()
    const next = settingsStore().update(clean)

    if (clean.idleAlertMinutes && clean.idleAlertMinutes !== prev.idleAlertMinutes) {
      idleTracker.setThresholdMinutes(next.idleAlertMinutes)
    }
    if (clean.hotkey && clean.hotkey !== prev.hotkey) {
      actions.onApplyHotkey(next.hotkey)
    }
    if (clean.baseURL !== undefined && clean.baseURL !== prev.baseURL) {
      resetClient()
    }
    if (clean.openAtLogin !== undefined && clean.openAtLogin !== prev.openAtLogin) {
      // Tell macOS to add/remove this app from the user's Login Items.
      app.setLoginItemSettings({
        openAtLogin: next.openAtLogin,
        openAsHidden: false
      })
    }
    // Note: settingsStore.update() already broadcasts SETTINGS_CHANGED to
    // every window. The previous explicit broadcast call here was a
    // duplicate; removed to avoid double-firing renderer subscribers.
    return next
  })

  ipcMain.handle(IPC.SETTINGS_GET_API_KEY_PRESENT, (): Promise<boolean> => keychain.hasApiKey())
  ipcMain.handle(IPC.SETTINGS_SET_API_KEY, async (_e, key: string) => {
    await keychain.setApiKey(key)
    resetClient()
    return true
  })
  ipcMain.handle(IPC.SETTINGS_CLEAR_API_KEY, async () => {
    await keychain.clearApiKey()
    resetClient()
    return true
  })
  ipcMain.handle(IPC.SETTINGS_PICK_OUTPUT_DIR, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose output directory',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settingsStore().get().outputDir
    })
    if (result.canceled || !result.filePaths[0]) return null
    settingsStore().update({ outputDir: result.filePaths[0] })
    return result.filePaths[0]
  })

  /**
   * Returns the actual macOS Login Item state vs what the user wants.
   * Unsigned apps cannot register themselves via setLoginItemSettings —
   * macOS silently rejects the call, so we read back the truth and let
   * the renderer show an honest banner if the two disagree.
   */
  ipcMain.handle(IPC.SETTINGS_LOGIN_ITEM_STATUS, () => {
    const wanted = settingsStore().get().openAtLogin
    const actual = app.getLoginItemSettings().openAtLogin
    return { wanted, actual, mismatch: wanted !== actual }
  })

  ipcMain.handle(IPC.SETTINGS_OPEN_LOGIN_ITEMS_PANE, async () => {
    // macOS deep link straight to the Login Items pane.
    await shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension')
  })

  /**
   * Clear all of Clawd's persistent memory — wipes ~/Documents/clawd-memory/.
   * Returns void on success, throws on failure (renderer surfaces the message).
   */
  ipcMain.handle(IPC.SETTINGS_CLEAR_MEMORY, async () => {
    await clearMemory()
  })

  /** Open the memory folder in Finder so the user can inspect/edit/back up. */
  ipcMain.handle(IPC.SETTINGS_OPEN_MEMORY_DIR, async () => {
    const root = getMemoryRoot()
    // Ensure the dir exists before asking Finder to open it.
    await import('fs').then((fs) => fs.promises.mkdir(root, { recursive: true }))
    await shell.openPath(root)
  })

  // ─── Window control ─────────────────────────────────
  ipcMain.handle(IPC.CHAT_OPEN, () => {
    createChatWindow()
  })
  ipcMain.handle(IPC.CHAT_CLOSE, () => closeChatWindow())
  ipcMain.handle(IPC.TODO_OPEN, () => {
    createTodoWindow()
  })
  ipcMain.handle(IPC.TODO_CLOSE, () => closeTodoWindow())
  ipcMain.handle(IPC.SETTINGS_WINDOW_OPEN, () => {
    createSettingsWindow()
  })
  ipcMain.handle(IPC.SETTINGS_WINDOW_CLOSE, () => closeSettingsWindow())
  ipcMain.handle(IPC.COMPANION_WINDOW_OPEN, () => {
    createCompanionWindow()
  })
  ipcMain.handle(IPC.COMPANION_WINDOW_CLOSE, () => closeCompanionWindow())

  // ─── Companion (read-only info queries) ─────────────
  ipcMain.handle(IPC.COMPANION_GET_TOOLSET, () => getToolsetForCompanion())
  ipcMain.handle(IPC.COMPANION_GET_MEMORY_INFO, async () => {
    try {
      return await getMemoryStats()
    } catch (err) {
      logger.warn('getMemoryStats failed', err)
      return { root: getMemoryRoot(), totalBytes: 0, fileCount: 0 }
    }
  })
  ipcMain.handle(IPC.COMPANION_GET_APP_VERSION, () => app.getVersion())

  // ─── Chat ───────────────────────────────────────────
  // Guard against concurrent chat sends from the same renderer — without
  // this, two in-flight streams would interleave deltas in the UI.
  let chatBusy = false
  ipcMain.handle(IPC.CHAT_SEND, async (_e, history: ChatMessage[]) => {
    if (chatBusy) {
      // Surface the rejection through the same event channel the renderer
      // is already listening on, so its 'streaming' state resets and the
      // user sees the failure instead of a stuck spinner.
      const w = getChatWindow()
      if (w && !w.isDestroyed()) {
        w.webContents.send(IPC.CHAT_STREAM_EVENT, {
          type: 'error',
          message: 'Already streaming a previous message — please wait.'
        })
      }
      return { ok: false, full: '', error: 'A previous message is still streaming' }
    }
    chatBusy = true
    idleTracker.registerActivity()
    const chatWin = getChatWindow()
    if (!chatWin) {
      chatBusy = false
      return { ok: false, full: '' }
    }

    const send = (ev: ChatStreamEvent): void => {
      if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send(IPC.CHAT_STREAM_EVENT, ev)
    }

    let full = ''
    try {
      await streamChat(history, {
      onDelta: (text) => {
        full += text
        send({ type: 'delta', text })
      },
      onDone: async (finalText) => {
        const spec = extractSpec(finalText)
        if (spec) {
          try {
            // Strip the SPEC_READY block from the assistant message so it
            // doesn't appear duplicated in the saved transcript.
            const cleanFinal = stripSpecBlock(finalText)
            const filePath = await writeSpec(spec, history.concat({
              id: 'final',
              role: 'assistant',
              content: cleanFinal,
              ts: new Date().toISOString()
            }))
            setLastSpec(filePath)
            send({ type: 'done', full: finalText, specReady: { filePath } })
          } catch (err) {
            logger.error('Spec write failed', err)
            send({ type: 'error', message: `Spec write failed: ${(err as Error).message}` })
          }
        } else {
          send({ type: 'done', full: finalText })
        }
      },
      onError: (msg) => send({ type: 'error', message: msg })
      })
    } finally {
      chatBusy = false
    }

    return { ok: true, full }
  })

  // ─── Todos ──────────────────────────────────────────
  ipcMain.handle(IPC.TODO_LIST, () => getDaily())
  ipcMain.handle(IPC.TODO_ADD, (_e, text: string) => addTodo(text))
  ipcMain.handle(IPC.TODO_TOGGLE, (_e, id: string) => {
    toggleTodo(id)
    idleTracker.registerActivity()
  })
  ipcMain.handle(IPC.TODO_DELETE, (_e, id: string) => deleteTodo(id))
  ipcMain.handle(IPC.TODO_PENDING_CARRYFWD, () => pendingCarryForward())
  ipcMain.handle(IPC.TODO_RESOLVE_CARRYFWD, (_e, keepIds: string[]) => resolveCarryForward(keepIds))

  // ─── Avatar ─────────────────────────────────────────
  ipcMain.handle(IPC.AVATAR_RESIZE, (_e, size: number) => resizeAvatar(size))
  ipcMain.handle(IPC.AVATAR_CONTEXT_MENU, () => {
    const w = getAvatarWindow()
    if (w) showAvatarContextMenu(w, actions)
  })
  // Drag protocol: renderer sends mouse-screen coords on each phase.
  // We stay in screen space (not client) so multi-display setups Just Work.
  ipcMain.handle(IPC.AVATAR_DRAG_START, (_e, x: number, y: number) => startDrag(x, y))
  ipcMain.handle(IPC.AVATAR_DRAG_TO, (_e, x: number, y: number) => dragTo(x, y))
  ipcMain.handle(IPC.AVATAR_DRAG_END, () => endDrag())

  /** Hover suggestion: generates a contextual one-liner via Claude.
   *  Returns string | null (null if no API key, error, or empty). */
  ipcMain.handle(IPC.AVATAR_HOVER_SUGGEST, async () => {
    const { generateHoverSuggestion } = await import('./whisperEngine')
    return await generateHoverSuggestion()
  })

  /** Fun mode toggle. */
  ipcMain.handle(IPC.AVATAR_FUN_TOGGLE, () => {
    funEngine.toggle()
    return funEngine.isActive()
  })

  /** Play fetch — 60-second fun mode session. */
  ipcMain.handle(IPC.AVATAR_FUN_FETCH, () => {
    funEngine.playFetch(60_000)
    return funEngine.isActive()
  })

  /** Synchronous fetch of last broadcast layout (or null). */
  ipcMain.handle(IPC.AVATAR_GET_LAYOUT, () => getLastLayout())

  // ─── Pomodoro ───────────────────────────────────────
  ipcMain.handle(IPC.POMODORO_WINDOW_OPEN, () => {
    createPomodoroWindow()
  })
  ipcMain.handle(IPC.POMODORO_WINDOW_CLOSE, () => closePomodoroWindow())
  ipcMain.handle(IPC.POMODORO_GET_STATUS, () => pomodoro.getStatus())
  ipcMain.handle(
    IPC.POMODORO_START,
    (_e, rawPayload: unknown) => {
      // Defensive validation — TypeScript typing on the renderer doesn't
      // protect main from a malformed payload. A non-string taskLabel
      // would crash the engine on `taskLabel.slice(...)`, and an unknown
      // phase string would NaN out the timer math.
      const payload =
        rawPayload && typeof rawPayload === 'object' ? (rawPayload as Record<string, unknown>) : {}
      const taskLabel =
        typeof payload.taskLabel === 'string' ? payload.taskLabel : ''
      const allowedPhases = ['work', 'short-break', 'long-break'] as const
      const phase = (allowedPhases as readonly string[]).includes(payload.phase as string)
        ? (payload.phase as 'work' | 'short-break' | 'long-break')
        : 'work'
      pomodoro.startSession(taskLabel, phase)
      return pomodoro.getStatus()
    }
  )
  ipcMain.handle(IPC.POMODORO_PAUSE, () => {
    pomodoro.pause()
    return pomodoro.getStatus()
  })
  ipcMain.handle(IPC.POMODORO_RESUME, () => {
    pomodoro.resume()
    return pomodoro.getStatus()
  })
  ipcMain.handle(IPC.POMODORO_RESET, () => {
    pomodoro.reset()
    return pomodoro.getStatus()
  })
  ipcMain.handle(IPC.POMODORO_SKIP, () => {
    pomodoro.skip()
    return pomodoro.getStatus()
  })

  // ─── Petting ────────────────────────────────────────
  ipcMain.handle(IPC.PET_REGISTER, () => petting.registerPet())
  ipcMain.handle(IPC.PET_GET_STATS, () => petting.getStats())

  // ─── Phase 2 interactions ───────────────────────────
  // Tickle: tray / context menu fires a tickle event; renderer animates +
  // we surface a quick whisper. No persistent counter for v1.
  ipcMain.handle(IPC.AVATAR_TICKLE, () => {
    broadcast(IPC.AVATAR_TICKLE_EVENT, { ts: Date.now() })
    void import('./sound').then((m) => m.playSound('pet')).catch(() => undefined)
  })
  // Food drop: user drag-and-dropped an emoji on the avatar window.
  // Match against a small reaction table, broadcast the verdict to
  // renderer so it can show the right face / particle. The renderer
  // does its own validation (only single emoji); main re-validates the
  // payload here as a defense-in-depth against future renderer bugs.
  ipcMain.handle(IPC.AVATAR_FOOD_DROP, (_e, payload: unknown) => {
    const food =
      payload && typeof payload === 'object'
        ? String((payload as { emoji?: unknown }).emoji ?? '').slice(0, 8)
        : ''
    if (!food) return { reaction: 'reject' as const, food: '' }
    const loves = ['🥬', '🥕', '🥦', '🍓', '🥝', '🍎', '🥥']
    const rejects = ['🍕', '🍔', '🍟', '🌭', '🥩', '🍗']
    let reaction: 'love' | 'meh' | 'reject' = 'meh'
    if (loves.includes(food)) reaction = 'love'
    else if (rejects.includes(food)) reaction = 'reject'
    broadcast(IPC.AVATAR_FOOD_REACTION, { food, reaction })
    if (reaction === 'love') {
      void import('./sound').then((m) => m.playSound('snack')).catch(() => undefined)
    }
    return { reaction, food }
  })

  // ─── Snack ──────────────────────────────────────────
  ipcMain.handle(IPC.SNACK_GIVE, () => snackEngine.giveSnack())
  ipcMain.handle(IPC.SNACK_GET_STATS, () => snackEngine.getStats())

  // ─── Collection ─────────────────────────────────────
  ipcMain.handle(IPC.COLLECTION_GET, () => collection.getState())

  // ─── Achievements ───────────────────────────────────
  ipcMain.handle(IPC.ACHIEVEMENTS_GET_CATALOG, () => achievements.getCatalog())
  ipcMain.handle(IPC.ACHIEVEMENTS_GET_EARNED, () => achievements.getEarned())

  // ─── Pomodoro streak ────────────────────────────────
  ipcMain.handle(IPC.POMODORO_STREAK_GET, async () => {
    const m = await import('./pomodoroStreak')
    return m.getState()
  })

  // ─── Auto-update ────────────────────────────────────
  ipcMain.handle(IPC.UPDATE_CHECK_NOW, async () => {
    const { checkForUpdatesNow } = await import('./updater')
    return await checkForUpdatesNow()
  })
  ipcMain.handle(IPC.UPDATE_GET_LAST, async () => {
    const { getLastUpdaterStatus } = await import('./updater')
    return getLastUpdaterStatus()
  })
  ipcMain.handle(IPC.UPDATE_QUIT_AND_INSTALL, async () => {
    const { quitAndInstall } = await import('./updater')
    quitAndInstall()
  })

  // ─── App ────────────────────────────────────────────
  ipcMain.handle(IPC.APP_QUIT, () => app.quit())
  ipcMain.handle(IPC.APP_REGISTER_ACTIVITY, () => idleTracker.registerActivity())

  // ─── Broadcasts ─────────────────────────────────────
  onTodoChange(() => {
    const todoWin = getTodoWindow()
    const avatar = getAvatarWindow()
    const payload = getDaily()
    if (todoWin && !todoWin.isDestroyed()) todoWin.webContents.send(IPC.TODO_CHANGED, payload)
    if (avatar && !avatar.isDestroyed()) avatar.webContents.send(IPC.TODO_CHANGED, payload)
  })

  // Re-export broadcast helper for the entry point
  ;(globalThis as unknown as { __ipcBroadcast?: typeof broadcast }).__ipcBroadcast = broadcast
}

export { broadcast }

/** Apply hotkey from current settings. */
export function applyHotkeyFromSettings(handler: () => void): void {
  const accel = settingsStore().get().hotkey
  registerHotkey(accel, handler)
}
