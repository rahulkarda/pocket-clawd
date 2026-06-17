/**
 * Renderer-side type augmentation for window.api.
 * The Api type is defined in src/preload/index.ts; we duplicate the
 * declaration here because tsconfig.web.json deliberately doesn't include
 * the preload sources.
 */
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
        clearMemory: () => Promise<void>
        openMemoryDir: () => Promise<void>
        onChanged: (cb: (s: AppSettings) => void) => () => void
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
      companionWindow: {
        open: () => Promise<void>
        close: () => Promise<void>
      }
      quickCaptureWindow: {
        open: () => Promise<void>
        close: () => Promise<void>
      }
      companion: {
        getToolset: () => Promise<ToolDescriptor[]>
        getMemoryInfo: () => Promise<MemoryInfo>
        getAppVersion: () => Promise<string>
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
        hoverSuggest: () => Promise<string | null>
        onAnimState: (cb: (s: AvatarAnimState) => void) => () => void
        onWhisper: (cb: (w: WhisperEvent) => void) => () => void
        onLayout: (cb: (l: AvatarLayout) => void) => () => void
        getLayout: () => Promise<AvatarLayout | null>
        funToggle: () => Promise<boolean>
        funFetch: () => Promise<boolean>
        onFunFrame: (cb: (f: FunFrame) => void) => () => void
        onFunState: (cb: (state: { active: boolean; fetching: boolean }) => void) => () => void
        onRaveState: (cb: (active: boolean) => void) => () => void
        onGaze: (cb: (direction: 'left' | 'right' | 'none') => void) => () => void
        onEmote: (cb: (e: { emoji: string; durationMs: number }) => void) => () => void
        onPlaySound: (cb: (name: string) => void) => () => void
        tickle: () => Promise<void>
        onTickle: (cb: () => void) => () => void
        foodDrop: (emoji: string) => Promise<{ reaction: 'love' | 'meh' | 'reject'; food: string }>
        onFoodReaction: (
          cb: (e: { food: string; reaction: 'love' | 'meh' | 'reject' }) => void
        ) => () => void
        onSleepState: (cb: (sleeping: boolean) => void) => () => void
        onWave: (cb: () => void) => () => void
        onHighFive: (cb: () => void) => () => void
      }
      app: {
        quit: () => Promise<void>
        registerActivity: () => Promise<void>
      }
      updater: {
        checkNow: () => Promise<UpdaterStatus>
        getLast: () => Promise<UpdaterStatus>
        quitAndInstall: () => Promise<void>
        onStatus: (cb: (s: UpdaterStatus) => void) => () => void
      }
      pomodoroWindow: {
        open: () => Promise<void>
        close: () => Promise<void>
      }
      pomodoro: {
        getStatus: () => Promise<PomodoroStatus>
        start: (taskLabel?: string, phase?: PomodoroPhase) => Promise<PomodoroStatus>
        pause: () => Promise<PomodoroStatus>
        resume: () => Promise<PomodoroStatus>
        reset: () => Promise<PomodoroStatus>
        skip: () => Promise<PomodoroStatus>
        onStatus: (cb: (s: PomodoroStatus) => void) => () => void
      }
      petting: {
        register: () => Promise<PetEvent>
        getStats: () => Promise<PetStats>
        onEvent: (cb: (e: PetEvent) => void) => () => void
      }
      journal: {
        append: (text: string) => Promise<{ ok: boolean; file?: string; reason?: string }>
      }
      snack: {
        give: () => Promise<SnackEvent | null>
        getStats: () => Promise<SnackStats>
        onEvent: (cb: (e: SnackEvent) => void) => () => void
      }
      collection: {
        get: () => Promise<CollectionState>
        onEvent: (cb: (s: CollectionState) => void) => () => void
      }
      achievements: {
        getCatalog: () => Promise<Achievement[]>
        getEarned: () => Promise<AchievementsState>
        onEvent: (cb: (s: AchievementsState) => void) => () => void
      }
      pomodoroStreak: {
        get: () => Promise<PomodoroStreakState>
        onState: (cb: (s: PomodoroStreakState) => void) => () => void
      }
    }
  }
}

export {}
