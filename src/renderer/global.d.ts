/**
 * Renderer-side type augmentation for window.api.
 * The Api type is defined in src/preload/index.ts; we duplicate the
 * declaration here because tsconfig.web.json deliberately doesn't include
 * the preload sources.
 */
import type {
  AppSettings,
  AvatarAnimState,
  ChatMessage,
  ChatStreamEvent,
  DailyTodoStore,
  Todo,
  WhisperEvent
} from '@shared/types'

declare global {
  interface Window {
    api: {
      settings: {
        get: () => Promise<AppSettings>
        update: (patch: Partial<AppSettings>) => Promise<AppSettings>
        apiKeyPresent: () => Promise<boolean>
        setApiKey: (key: string) => Promise<boolean>
        clearApiKey: () => Promise<boolean>
        pickOutputDir: () => Promise<string | null>
        loginItemStatus: () => Promise<{ wanted: boolean; actual: boolean; mismatch: boolean }>
        openLoginItemsPane: () => Promise<void>
      }
      chat: {
        open: () => Promise<void>
        close: () => Promise<void>
        send: (history: ChatMessage[]) => Promise<{ ok: boolean; full: string }>
        onStream: (cb: (ev: ChatStreamEvent) => void) => () => void
      }
      todoWindow: {
        open: () => Promise<void>
        close: () => Promise<void>
      }
      settingsWindow: {
        open: () => Promise<void>
        close: () => Promise<void>
      }
      todos: {
        list: () => Promise<DailyTodoStore>
        add: (text: string) => Promise<Todo>
        toggle: (id: string) => Promise<void>
        remove: (id: string) => Promise<void>
        pendingCarryForward: () => Promise<Todo[]>
        resolveCarryForward: (keepIds: string[]) => Promise<void>
        onChanged: (cb: (d: DailyTodoStore) => void) => () => void
      }
      avatar: {
        resize: (size: number) => Promise<void>
        showContextMenu: () => Promise<void>
        dragStart: (x: number, y: number) => Promise<void>
        dragTo: (x: number, y: number) => Promise<void>
        dragEnd: () => Promise<void>
        onAnimState: (cb: (s: AvatarAnimState) => void) => () => void
        onWhisper: (cb: (w: WhisperEvent) => void) => () => void
      }
      app: {
        quit: () => Promise<void>
        registerActivity: () => Promise<void>
      }
    }
  }
}

export {}
