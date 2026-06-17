/**
 * Preload bridge — exposes a typed `window.api` to all renderer processes.
 * Single API surface; each renderer uses only the methods it needs.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  Achievement,
  AchievementsState,
  AppSettings,
  AvatarAnimState,
  AvatarLayout,
  ChatMessage,
  ChatStreamEvent,
  CollectionState,
  DailyTodoStore,
  FunFrame,
  MemoryInfo,
  PetEvent,
  PetStats,
  PomodoroPhase,
  PomodoroStatus,
  PomodoroStreakState,
  SnackEvent,
  SnackStats,
  Todo,
  ToolDescriptor,
  UpdaterStatus,
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
      ipcRenderer.invoke(IPC.SETTINGS_OPEN_LOGIN_ITEMS_PANE),
    clearMemory: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_CLEAR_MEMORY),
    openMemoryDir: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_OPEN_MEMORY_DIR),
    onChanged: (cb: (s: AppSettings) => void): (() => void) => {
      const listener = (_e: unknown, s: AppSettings): void => cb(s)
      ipcRenderer.on(IPC.SETTINGS_CHANGED, listener)
      return () => ipcRenderer.off(IPC.SETTINGS_CHANGED, listener)
    }
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

  companionWindow: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.COMPANION_WINDOW_OPEN),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.COMPANION_WINDOW_CLOSE)
  },

  // ─── Companion (read-only info queries) ─────────────
  companion: {
    getToolset: (): Promise<ToolDescriptor[]> => ipcRenderer.invoke(IPC.COMPANION_GET_TOOLSET),
    getMemoryInfo: (): Promise<MemoryInfo> => ipcRenderer.invoke(IPC.COMPANION_GET_MEMORY_INFO),
    getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.COMPANION_GET_APP_VERSION)
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
    hoverSuggest: (): Promise<string | null> => ipcRenderer.invoke(IPC.AVATAR_HOVER_SUGGEST),
    onAnimState: (cb: (s: AvatarAnimState) => void): (() => void) => {
      const listener = (_e: unknown, s: AvatarAnimState): void => cb(s)
      ipcRenderer.on(IPC.AVATAR_ANIM_STATE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_ANIM_STATE, listener)
    },
    onWhisper: (cb: (w: WhisperEvent) => void): (() => void) => {
      const listener = (_e: unknown, w: WhisperEvent): void => cb(w)
      ipcRenderer.on(IPC.AVATAR_WHISPER, listener)
      return () => ipcRenderer.off(IPC.AVATAR_WHISPER, listener)
    },
    onLayout: (cb: (l: AvatarLayout) => void): (() => void) => {
      const listener = (_e: unknown, l: AvatarLayout): void => cb(l)
      ipcRenderer.on(IPC.AVATAR_LAYOUT, listener)
      return () => ipcRenderer.off(IPC.AVATAR_LAYOUT, listener)
    },
    getLayout: (): Promise<AvatarLayout | null> => ipcRenderer.invoke(IPC.AVATAR_GET_LAYOUT),
    funToggle: (): Promise<boolean> => ipcRenderer.invoke(IPC.AVATAR_FUN_TOGGLE),
    funFetch: (): Promise<boolean> => ipcRenderer.invoke(IPC.AVATAR_FUN_FETCH),
    onFunFrame: (cb: (f: FunFrame) => void): (() => void) => {
      const listener = (_e: unknown, f: FunFrame): void => cb(f)
      ipcRenderer.on(IPC.AVATAR_FUN_FRAME, listener)
      return () => ipcRenderer.off(IPC.AVATAR_FUN_FRAME, listener)
    },
    onFunState: (cb: (state: { active: boolean; fetching: boolean }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { active: boolean; fetching?: boolean }): void =>
        cb({ active: payload.active, fetching: payload.fetching === true })
      ipcRenderer.on(IPC.AVATAR_FUN_STATE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_FUN_STATE, listener)
    },
    onRaveState: (cb: (active: boolean) => void): (() => void) => {
      const listener = (_e: unknown, payload: { active: boolean }): void => cb(payload.active)
      ipcRenderer.on(IPC.AVATAR_RAVE_STATE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_RAVE_STATE, listener)
    },
    onGaze: (cb: (direction: 'left' | 'right' | 'none') => void): (() => void) => {
      const listener = (_e: unknown, payload: { direction: 'left' | 'right' | 'none' }): void =>
        cb(payload.direction)
      ipcRenderer.on(IPC.AVATAR_GAZE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_GAZE, listener)
    },
    onEmote: (cb: (e: { emoji: string; durationMs: number }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { emoji: string; durationMs: number }): void =>
        cb(payload)
      ipcRenderer.on(IPC.AVATAR_EMOTE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_EMOTE, listener)
    },
    onPlaySound: (cb: (name: string) => void): (() => void) => {
      const listener = (_e: unknown, name: string): void => cb(name)
      ipcRenderer.on(IPC.AVATAR_PLAY_SOUND, listener)
      return () => ipcRenderer.off(IPC.AVATAR_PLAY_SOUND, listener)
    },
    // Phase 2 interactions
    tickle: (): Promise<void> => ipcRenderer.invoke(IPC.AVATAR_TICKLE),
    onTickle: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.AVATAR_TICKLE_EVENT, listener)
      return () => ipcRenderer.off(IPC.AVATAR_TICKLE_EVENT, listener)
    },
    foodDrop: (emoji: string): Promise<{ reaction: 'love' | 'meh' | 'reject'; food: string }> =>
      ipcRenderer.invoke(IPC.AVATAR_FOOD_DROP, { emoji }),
    onFoodReaction: (
      cb: (e: { food: string; reaction: 'love' | 'meh' | 'reject' }) => void
    ): (() => void) => {
      const listener = (
        _e: unknown,
        payload: { food: string; reaction: 'love' | 'meh' | 'reject' }
      ): void => cb(payload)
      ipcRenderer.on(IPC.AVATAR_FOOD_REACTION, listener)
      return () => ipcRenderer.off(IPC.AVATAR_FOOD_REACTION, listener)
    },
    onSleepState: (cb: (sleeping: boolean) => void): (() => void) => {
      const listener = (_e: unknown, payload: { sleeping: boolean }): void => cb(payload.sleeping)
      ipcRenderer.on(IPC.AVATAR_SLEEP_STATE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_SLEEP_STATE, listener)
    },
    onWave: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.AVATAR_WAVE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_WAVE, listener)
    },
    onHighFive: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.AVATAR_HIGH_FIVE, listener)
      return () => ipcRenderer.off(IPC.AVATAR_HIGH_FIVE, listener)
    }
  },

  // ─── App ────────────────────────────────────────────
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke(IPC.APP_QUIT),
    registerActivity: (): Promise<void> => ipcRenderer.invoke(IPC.APP_REGISTER_ACTIVITY)
  },

  // ─── Auto-update ────────────────────────────────────
  updater: {
    checkNow: (): Promise<UpdaterStatus> => ipcRenderer.invoke(IPC.UPDATE_CHECK_NOW),
    getLast: (): Promise<UpdaterStatus> => ipcRenderer.invoke(IPC.UPDATE_GET_LAST),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_QUIT_AND_INSTALL),
    onStatus: (cb: (s: UpdaterStatus) => void): (() => void) => {
      const listener = (_e: unknown, s: UpdaterStatus): void => cb(s)
      ipcRenderer.on(IPC.UPDATE_STATUS, listener)
      return () => ipcRenderer.off(IPC.UPDATE_STATUS, listener)
    }
  },

  // ─── Pomodoro window control ────────────────────────
  pomodoroWindow: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.POMODORO_WINDOW_OPEN),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.POMODORO_WINDOW_CLOSE)
  },

  // ─── Pomodoro engine ────────────────────────────────
  pomodoro: {
    getStatus: (): Promise<PomodoroStatus> => ipcRenderer.invoke(IPC.POMODORO_GET_STATUS),
    start: (taskLabel: string = '', phase: PomodoroPhase = 'work'): Promise<PomodoroStatus> =>
      ipcRenderer.invoke(IPC.POMODORO_START, { taskLabel, phase }),
    pause: (): Promise<PomodoroStatus> => ipcRenderer.invoke(IPC.POMODORO_PAUSE),
    resume: (): Promise<PomodoroStatus> => ipcRenderer.invoke(IPC.POMODORO_RESUME),
    reset: (): Promise<PomodoroStatus> => ipcRenderer.invoke(IPC.POMODORO_RESET),
    skip: (): Promise<PomodoroStatus> => ipcRenderer.invoke(IPC.POMODORO_SKIP),
    onStatus: (cb: (s: PomodoroStatus) => void): (() => void) => {
      const listener = (_e: unknown, s: PomodoroStatus): void => cb(s)
      ipcRenderer.on(IPC.POMODORO_STATUS, listener)
      return () => ipcRenderer.off(IPC.POMODORO_STATUS, listener)
    }
  },

  // ─── Petting ────────────────────────────────────────
  petting: {
    register: (): Promise<PetEvent> => ipcRenderer.invoke(IPC.PET_REGISTER),
    getStats: (): Promise<PetStats> => ipcRenderer.invoke(IPC.PET_GET_STATS),
    onEvent: (cb: (e: PetEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: PetEvent): void => cb(ev)
      ipcRenderer.on(IPC.PET_EVENT, listener)
      return () => ipcRenderer.off(IPC.PET_EVENT, listener)
    }
  },

  // ─── Snack ──────────────────────────────────────────
  snack: {
    give: (): Promise<SnackEvent | null> => ipcRenderer.invoke(IPC.SNACK_GIVE),
    getStats: (): Promise<SnackStats> => ipcRenderer.invoke(IPC.SNACK_GET_STATS),
    onEvent: (cb: (e: SnackEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: SnackEvent): void => cb(ev)
      ipcRenderer.on(IPC.SNACK_EVENT, listener)
      return () => ipcRenderer.off(IPC.SNACK_EVENT, listener)
    }
  },

  // ─── Collection ─────────────────────────────────────
  collection: {
    get: (): Promise<CollectionState> => ipcRenderer.invoke(IPC.COLLECTION_GET),
    onEvent: (cb: (s: CollectionState) => void): (() => void) => {
      const listener = (_e: unknown, s: CollectionState): void => cb(s)
      ipcRenderer.on(IPC.COLLECTION_EVENT, listener)
      return () => ipcRenderer.off(IPC.COLLECTION_EVENT, listener)
    }
  },

  // ─── Achievements ───────────────────────────────────
  achievements: {
    getCatalog: (): Promise<Achievement[]> => ipcRenderer.invoke(IPC.ACHIEVEMENTS_GET_CATALOG),
    getEarned: (): Promise<AchievementsState> => ipcRenderer.invoke(IPC.ACHIEVEMENTS_GET_EARNED),
    onEvent: (cb: (s: AchievementsState) => void): (() => void) => {
      const listener = (_e: unknown, s: AchievementsState): void => cb(s)
      ipcRenderer.on(IPC.ACHIEVEMENTS_EVENT, listener)
      return () => ipcRenderer.off(IPC.ACHIEVEMENTS_EVENT, listener)
    }
  },

  // ─── Pomodoro streak ────────────────────────────────
  pomodoroStreak: {
    get: (): Promise<PomodoroStreakState> => ipcRenderer.invoke(IPC.POMODORO_STREAK_GET),
    onState: (cb: (s: PomodoroStreakState) => void): (() => void) => {
      const listener = (_e: unknown, s: PomodoroStreakState): void => cb(s)
      ipcRenderer.on(IPC.POMODORO_STREAK_STATE, listener)
      return () => ipcRenderer.off(IPC.POMODORO_STREAK_STATE, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
