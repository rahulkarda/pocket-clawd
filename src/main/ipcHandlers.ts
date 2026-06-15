/**
 * Centralized IPC registration. All main-side handlers live here so the
 * surface area is auditable in one file.
 */
import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { IPC } from '@shared/ipc'
import logger from './logger'
import * as keychain from './keychain'
import { settingsStore } from './settings'
import { resetClient, streamChat } from './anthropicClient'
import { extractSpec, stripSpecBlock, writeSpec, setLastSpec } from './specWriter'
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
  closeSettingsWindow
} from './secondaryWindows'
import { resizeAvatar, getAvatarWindow } from './avatarWindow'
import { showAvatarContextMenu, type AvatarMenuActions } from './avatarMenu'
import { registerHotkey } from './hotkey'
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
    // though the only caller is our own renderer.
    const clean: Partial<AppSettings> = { ...patch }
    if (typeof clean.userContext === 'string') {
      clean.userContext = clean.userContext.slice(0, 4000)
    }
    if (typeof clean.baseURL === 'string') {
      clean.baseURL = clean.baseURL.trim().slice(0, 500)
    }
    if (typeof clean.hotkey === 'string') {
      clean.hotkey = clean.hotkey.trim().slice(0, 100)
    }
    if (clean.whisperIntervalMin !== undefined) {
      const n = Number(clean.whisperIntervalMin)
      clean.whisperIntervalMin = Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : 8
    }
    if (clean.whisperIntervalMax !== undefined) {
      const n = Number(clean.whisperIntervalMax)
      clean.whisperIntervalMax = Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : 12
    }
    if (clean.idleAlertMinutes !== undefined) {
      const n = Number(clean.idleAlertMinutes)
      clean.idleAlertMinutes = Number.isFinite(n) ? Math.max(5, Math.min(240, n)) : 30
    }
    if (clean.avatarSize !== undefined) {
      const n = Number(clean.avatarSize)
      clean.avatarSize = Number.isFinite(n) ? Math.max(40, Math.min(120, n)) : 64
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

  // ─── Chat ───────────────────────────────────────────
  // Guard against concurrent chat sends from the same renderer — without
  // this, two in-flight streams would interleave deltas in the UI.
  let chatBusy = false
  ipcMain.handle(IPC.CHAT_SEND, async (_e, history: ChatMessage[]) => {
    if (chatBusy) {
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
