/**
 * Shared types crossing the main/renderer boundary.
 * Pydantic-style: strict, typed, no untyped dicts.
 */

// ──────────────────────────────────────────────────────────
// Todos
// ──────────────────────────────────────────────────────────

export interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: number
  completedAt?: number
}

export interface DailyTodoStore {
  date: string // "YYYY-MM-DD"
  todos: Todo[]
  /** Set when the day rolls over and we need to ask the user about carry-forward */
  pendingCarryForward?: Todo[]
}

// ──────────────────────────────────────────────────────────
// Chat
// ──────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  /** ISO timestamp */
  ts: string
}

export interface SessionEndPayload {
  filePath: string
  spec: string
}

// ──────────────────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────────────────

export interface AppSettings {
  hotkey: string
  outputDir: string
  model: string
  /**
   * Optional base URL for the Anthropic SDK. Empty = use Anthropic's default
   * (`api.anthropic.com`). Set to a custom proxy (e.g. an enterprise gateway)
   * if you need to route requests through one. The SDK appends `/v1/...`.
   */
  baseURL: string
  avatarSize: number
  avatarPosition: { x: number; y: number } | null
  whisperIntervalMin: number // 5–30
  whisperIntervalMax: number
  idleAlertMinutes: number
  userContext: string
  whisperOnIdleAlert: boolean
  showOnAllSpaces: boolean
  /** Launch the app on macOS login. Toggled via Settings UI. */
  openAtLogin: boolean
  /** Enable Anthropic-hosted web_search tool. Server-side; uses extra tokens. */
  enableWebSearch: boolean
  /** Enable persistent memory tool (~/Documents/clawd-memory/). */
  enableMemory: boolean
  /** First-run completion gate */
  onboarded: boolean
  /** Pomodoro work-block duration in minutes (default 25). */
  pomodoroWorkMin: number
  /** Pomodoro short-break duration in minutes (default 5). */
  pomodoroShortBreakMin: number
  /** Pomodoro long-break duration in minutes (default 15). */
  pomodoroLongBreakMin: number
  /** How many work blocks before a long break (default 4). */
  pomodoroCyclesBeforeLongBreak: number
  /** Auto-start the next phase when one ends, vs. waiting for user. */
  pomodoroAutoStartNext: boolean
  /** Show macOS notifications at phase transitions. */
  pomodoroNotify: boolean
  /** Suggest a pomodoro via whisper when the user adds the first todo of a day. */
  pomodoroSuggestOnFirstTodo: boolean
  /** Costume / hat overlay rendered above Clawd's head. */
  costume: 'none' | 'santa' | 'shades' | 'party' | 'witch'
  /** Optional birthday for one-shot launch greetings. null = no birthday set. */
  birthday: { month: number; day: number } | null
  /** Surface a "welcome back" whisper when the system wakes from sleep. */
  wakeGreetings: boolean
  /** Master mute for all synthesized sounds (pet, snack, pomo end, etc). */
  mute: boolean
  /** Master volume 0..1 for synthesized sounds. */
  volume: number
  /** Hour-of-day (0-23) when daily summary whisper fires. -1 disables. */
  summaryHour: number
  /** Smart hour bell — chime at the top of every work hour. */
  hourBellEnabled: boolean
  hourBellStart: number // 0-23
  hourBellEnd: number // 0-23 (exclusive end)
  /** Clipboard listener — when a URL is copied, suggest summarizing it. */
  clipboardSuggestions: boolean
  /** Mascot color variant. Applied as CSS hue-rotate over the orange Clawd. */
  mascotVariant: 'clawd' | 'mocha' | 'mint' | 'plum'
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: 'CommandOrControl+Shift+C',
  outputDir: '', // resolved at runtime to ~/Documents/claude-sessions
  model: 'claude-sonnet-4-6',
  baseURL: '',
  avatarSize: 64,
  avatarPosition: null,
  whisperIntervalMin: 8,
  whisperIntervalMax: 12,
  idleAlertMinutes: 30,
  userContext:
    'You are talking to a software developer. Keep check-ins short and focused. Adapt your tone to the time of day. (Edit this in Settings to personalize.)',
  whisperOnIdleAlert: true,
  showOnAllSpaces: true,
  openAtLogin: false,
  // Off by default — server-side web_search is billable, and some
  // proxies (e.g. enterprise gateways) don't allow it. Toggle in Settings.
  enableWebSearch: false,
  enableMemory: true,
  onboarded: false,
  pomodoroWorkMin: 25,
  pomodoroShortBreakMin: 5,
  pomodoroLongBreakMin: 15,
  pomodoroCyclesBeforeLongBreak: 4,
  pomodoroAutoStartNext: false,
  pomodoroNotify: true,
  pomodoroSuggestOnFirstTodo: true,
  costume: 'none',
  birthday: null,
  wakeGreetings: true,
  mute: false,
  volume: 0.6,
  summaryHour: 18,
  hourBellEnabled: false,
  hourBellStart: 9,
  hourBellEnd: 18,
  clipboardSuggestions: false,
  mascotVariant: 'clawd'
}

// ──────────────────────────────────────────────────────────
// Avatar state
// ──────────────────────────────────────────────────────────

export type AvatarAnimState = 'idle' | 'whisper' | 'idle-alert' | 'active' | 'blush' | 'sleep'

// ──────────────────────────────────────────────────────────
// Time of day
// ──────────────────────────────────────────────────────────

export type TimeSlot =
  | 'brahma-muhurta' // 4:00–6:30
  | 'morning' // 6:30–9:00
  | 'work' // 9:00–18:00
  | 'evening' // 18:00–21:00
  | 'night' // 21:00+

// ──────────────────────────────────────────────────────────
// Streaming events from main → chat renderer
// ──────────────────────────────────────────────────────────

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; full: string; specReady?: { filePath: string } }
  | { type: 'error'; message: string }

// ──────────────────────────────────────────────────────────
// Whisper
// ──────────────────────────────────────────────────────────

export interface WhisperEvent {
  text: string
  durationMs: number
}

// ──────────────────────────────────────────────────────────
// Auto-update
// ──────────────────────────────────────────────────────────

export interface UpdaterStatus {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  version?: string
  message?: string
  progress?: number
}

// ──────────────────────────────────────────────────────────
// Companion (read-only info window)
// ──────────────────────────────────────────────────────────

export type ToolCategory = 'todo' | 'memory' | 'web'

export interface ToolDescriptor {
  /** Tool name as registered with the Anthropic API. */
  name: string
  /** First sentence of the tool's description (what Clawd sees in its system prompt). */
  description: string
  category: ToolCategory
  /** ALWAYS_ON tools are registered every turn; opt-ins depend on a setting. */
  alwaysOn: boolean
}

export interface MemoryInfo {
  root: string
  totalBytes: number
  fileCount: number
}

// ──────────────────────────────────────────────────────────
// Petting
// ──────────────────────────────────────────────────────────

export interface PetStats {
  /** Lifetime pet count, persisted in electron-store. */
  count: number
  /** Wall-clock ms of the most recent pet, or 0 if never. */
  lastPettedAt: number
  /** Wall-clock ms of the most recent idle "wants pets" nudge, or 0. */
  lastIdleNudgeAt: number
}

export interface PetEvent {
  /** Total count after this pet. */
  count: number
  /** True if this pet hits a milestone (10/100/500/1000/...). */
  milestone: boolean
}

// ──────────────────────────────────────────────────────────
// Snack
// ──────────────────────────────────────────────────────────

export interface SnackStats {
  /** Lifetime snacks given. */
  count: number
  /** Wall-clock ms of the most recent snack. */
  lastGivenAt: number
}

export interface SnackEvent {
  /** Total count after this snack. */
  count: number
  /** Duration of the chomping animation in ms. */
  durationMs: number
}

// ──────────────────────────────────────────────────────────
// Collection (pet rocks etc.)
// ──────────────────────────────────────────────────────────

/** A single item in the user's collection — earned via pomodoros etc. */
export interface CollectionItem {
  id: string
  emoji: string
  label: string
  earnedAt: number
}

export interface CollectionState {
  items: CollectionItem[]
  /** Lifetime pomodoros completed at last check (we award every Nth). */
  lastAwardedAtPomodoroCount: number
}

// ──────────────────────────────────────────────────────────
// Achievements
// ──────────────────────────────────────────────────────────

export interface Achievement {
  id: string
  label: string
  description: string
  emoji: string
}

export interface AchievementEarned {
  id: string
  earnedAt: number
}

export interface AchievementsState {
  /** All earned achievements (one entry per ID). */
  earned: AchievementEarned[]
}

// ──────────────────────────────────────────────────────────
// Pomodoro streak
// ──────────────────────────────────────────────────────────

export interface PomodoroStreakState {
  currentDays: number
  longestDays: number
  /** True iff today is the most recent counted day. */
  todayCounts: boolean
}

// ──────────────────────────────────────────────────────────
// Pomodoro
// ──────────────────────────────────────────────────────────

export type PomodoroPhase = 'work' | 'short-break' | 'long-break'
export type PomodoroState = 'idle' | 'running' | 'paused'

export interface PomodoroStatus {
  state: PomodoroState
  phase: PomodoroPhase
  /** Seconds remaining in the current phase. Updated every tick while running. */
  remainingSec: number
  /** Total seconds the current phase was configured for. */
  phaseTotalSec: number
  /**
   * 1-based index of the current work block in the cycle (resets after a
   * long break). E.g. 1..N where N = cyclesBeforeLongBreak.
   */
  workCycleIndex: number
  /** Total work blocks completed since app start. */
  workBlocksCompleted: number
  /**
   * Optional task label the user typed when starting this work block.
   * Cleared at phase transitions; re-asked on the next work block.
   */
  taskLabel: string
}

/**
 * Per-frame visual transform for the avatar during fun mode. Window position
 * is set by main directly via setPosition; the renderer applies these
 * transforms inside the avatar slot for rotation, scaling, and squash.
 */
export interface FunFrame {
  /** Rotation in degrees, applied as CSS rotate(). */
  rotateDeg: number
  /** Vertical squash factor. 1.0 = neutral, <1 squashed (landed), >1 stretched (jumping). */
  scaleY: number
  /** Horizontal squash factor (mirrors scaleY for volume preservation). */
  scaleX: number
  /** Optional facial expression hint for the renderer (eyes wide, etc). Future use. */
  mood?: 'idle' | 'excited' | 'dizzy'
}
export interface AvatarLayout {
  /** Horizontal pixel offset from window left to avatar slot left. */
  slotInsetX: number
  /** Vertical pixel offset from window top to avatar slot top. */
  slotInsetY: number
  /** Window width in pixels. */
  windowWidth: number
  /** Window height in pixels. */
  windowHeight: number
  /** Avatar size in pixels (width = height). */
  avatarSize: number
}
