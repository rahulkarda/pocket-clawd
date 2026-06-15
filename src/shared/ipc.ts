/** Centralized IPC channel names — single source of truth for main + preload + renderer. */

export const IPC = {
  // ─── Settings ───────────────────────────────────────
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_GET_API_KEY_PRESENT: 'settings:apiKey:present',
  SETTINGS_SET_API_KEY: 'settings:apiKey:set',
  SETTINGS_CLEAR_API_KEY: 'settings:apiKey:clear',
  SETTINGS_PICK_OUTPUT_DIR: 'settings:outputDir:pick',

  // ─── Window control ─────────────────────────────────
  CHAT_OPEN: 'chat:open',
  CHAT_CLOSE: 'chat:close',
  TODO_OPEN: 'todo:open',
  TODO_CLOSE: 'todo:close',
  SETTINGS_WINDOW_OPEN: 'settings-window:open',
  SETTINGS_WINDOW_CLOSE: 'settings-window:close',

  // ─── Chat ───────────────────────────────────────────
  CHAT_SEND: 'chat:send',
  CHAT_STREAM_EVENT: 'chat:stream-event',
  CHAT_OPENING_QUESTION: 'chat:opening-question',
  CHAT_END_SESSION: 'chat:end-session',

  // ─── Todos ──────────────────────────────────────────
  TODO_LIST: 'todo:list',
  TODO_ADD: 'todo:add',
  TODO_TOGGLE: 'todo:toggle',
  TODO_DELETE: 'todo:delete',
  TODO_CHANGED: 'todo:changed', // broadcast
  TODO_PENDING_CARRYFWD: 'todo:carryfwd:pending',
  TODO_RESOLVE_CARRYFWD: 'todo:carryfwd:resolve',

  // ─── Avatar ─────────────────────────────────────────
  AVATAR_RESIZE: 'avatar:resize',
  AVATAR_MOVE: 'avatar:move',
  AVATAR_ANIM_STATE: 'avatar:anim-state', // broadcast
  AVATAR_WHISPER: 'avatar:whisper', // broadcast
  AVATAR_CONTEXT_MENU: 'avatar:context-menu',

  // ─── App ────────────────────────────────────────────
  APP_QUIT: 'app:quit',
  APP_OPEN_LAST_SPEC: 'app:open-last-spec',
  APP_REGISTER_ACTIVITY: 'app:register-activity'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
