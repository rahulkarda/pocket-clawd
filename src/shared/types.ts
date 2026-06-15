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
  /** First-run completion gate */
  onboarded: boolean
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
  onboarded: false
}

// ──────────────────────────────────────────────────────────
// Avatar state
// ──────────────────────────────────────────────────────────

export type AvatarAnimState = 'idle' | 'whisper' | 'idle-alert' | 'active'

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
