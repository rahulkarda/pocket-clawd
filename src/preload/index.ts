/**
 * Preload bridge — exposes a typed `window.api` to all renderer processes.
 * Single API surface; each renderer uses only the methods it needs.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  AvatarAnimState,
  ChatMessage,
  ChatStreamEvent,
  DailyTodoStore,
  Todo,
  WhisperEvent
} from '@shared/types'

const api = {
  // ─── Settings ───────────────────────────────────────
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.SETTINGS_UPDATE, patch),
    apiKeyPresent: (): Promise<boolean> => ipcRenderer.invoke(IPC.SETTINGS_GET_API_KEY_PRESENT),
    setApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke(IPC.SETTINGS_SET_API_KEY, key),
    clearApiKey: (): Promise<boolean> => ipcRenderer.invoke(IPC.SETTINGS_CLEAR_API_KEY),
    pickOutputDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.SETTINGS_PICK_OUTPUT_DIR),
    loginItemStatus: (): Promise<{ wanted: boolean; actual: boolean; mismatch: boolean }> =>
      ipcRenderer.invoke(IPC.SETTINGS_LOGIN_ITEM_STATUS),
    openLoginItemsPane: (): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_OPEN_LOGIN_ITEMS_PANE)
  },

  // ─── Windows ────────────────────────────────────────
  chat: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.CHAT_OPEN),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.CHAT_CLOSE),
    send: (history: ChatMessage[]): Promise<{ ok: boolean; full: string }> =>
      ipcRenderer.invoke(IPC.CHAT_SEND, history),
    onStream: (cb: (ev: ChatStreamEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: ChatStreamEvent): void => cb(ev)
      ipcRenderer.on(IPC.CHAT_STREAM_EVENT, listener)
      return () => ipcRenderer.off(IPC.CHAT_STREAM_EVENT, listener)
    }
  },

  todoWindow: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.TODO_OPEN),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.TODO_CLOSE)
  },

  settingsWindow: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_WINDOW_OPEN),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_WINDOW_CLOSE)
  },

  // ─── Todos ──────────────────────────────────────────
  todos: {
    list: (): Promise<DailyTodoStore> => ipcRenderer.invoke(IPC.TODO_LIST),
    add: (text: string): Promise<Todo> => ipcRenderer.invoke(IPC.TODO_ADD, text),
    toggle: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TODO_TOGGLE, id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TODO_DELETE, id),
    pendingCarryForward: (): Promise<Todo[]> => ipcRenderer.invoke(IPC.TODO_PENDING_CARRYFWD),
    resolveCarryForward: (keepIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.TODO_RESOLVE_CARRYFWD, keepIds),
    onChanged: (cb: (d: DailyTodoStore) => void): (() => void) => {
      const listener = (_e: unknown, d: DailyTodoStore): void => cb(d)
      ipcRenderer.on(IPC.TODO_CHANGED, listener)
      return () => ipcRenderer.off(IPC.TODO_CHANGED, listener)
    }
  },

  // ─── Avatar ─────────────────────────────────────────
  avatar: {
    resize: (size: number): Promise<void> => ipcRenderer.invoke(IPC.AVATAR_RESIZE, size),
    showContextMenu: (): Promise<void> => ipcRenderer.invoke(IPC.AVATAR_CONTEXT_MENU),
    dragStart: (x: number, y: number): Promise<void> =>
      ipcRenderer.invoke(IPC.AVATAR_DRAG_START, x, y),
    dragTo: (x: number, y: number): Promise<void> =>
      ipcRenderer.invoke(IPC.AVATAR_DRAG_TO, x, y),
    dragEnd: (): Promise<void> => ipcRenderer.invoke(IPC.AVATAR_DRAG_END),
    onAnimState: (cb: (s: AvatarAnimState) => void): (() => void) => {
      const listener = (_e: unknown, s: AvatarAnimState): void => cb(s)
      ipcRenderer.on(IPC.AVATAR_ANIM_STATE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_ANIM_STATE, listener)
    },
    onWhisper: (cb: (w: WhisperEvent) => void): (() => void) => {
      const listener = (_e: unknown, w: WhisperEvent): void => cb(w)
      ipcRenderer.on(IPC.AVATAR_WHISPER, listener)
      return () => ipcRenderer.off(IPC.AVATAR_WHISPER, listener)
    }
  },

  // ─── App ────────────────────────────────────────────
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke(IPC.APP_QUIT),
    registerActivity: (): Promise<void> => ipcRenderer.invoke(IPC.APP_REGISTER_ACTIVITY)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
