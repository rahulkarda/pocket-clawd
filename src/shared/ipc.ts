/** Centralized IPC channel names — single source of truth for main + preload + renderer. */

export const IPC = {
  // ─── Settings ───────────────────────────────────────
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed', // broadcast — fires after every settings update
  SETTINGS_GET_API_KEY_PRESENT: 'settings:apiKey:present',
  SETTINGS_SET_API_KEY: 'settings:apiKey:set',
  SETTINGS_CLEAR_API_KEY: 'settings:apiKey:clear',
  SETTINGS_PICK_OUTPUT_DIR: 'settings:outputDir:pick',
  SETTINGS_LOGIN_ITEM_STATUS: 'settings:loginItem:status',
  SETTINGS_OPEN_LOGIN_ITEMS_PANE: 'settings:loginItem:openPane',
  SETTINGS_CLEAR_MEMORY: 'settings:memory:clear',
  SETTINGS_OPEN_MEMORY_DIR: 'settings:memory:openDir',

  // ─── Window control ─────────────────────────────────
  CHAT_OPEN: 'chat:open',
  CHAT_CLOSE: 'chat:close',
  TODO_OPEN: 'todo:open',
  TODO_CLOSE: 'todo:close',
  SETTINGS_WINDOW_OPEN: 'settings-window:open',
  SETTINGS_WINDOW_CLOSE: 'settings-window:close',
  COMPANION_WINDOW_OPEN: 'companion-window:open',
  COMPANION_WINDOW_CLOSE: 'companion-window:close',
  QUICK_WINDOW_OPEN: 'quick-window:open',
  QUICK_WINDOW_CLOSE: 'quick-window:close',

  // ─── Companion (read-only info) ─────────────────────
  COMPANION_GET_TOOLSET: 'companion:get-toolset',
  COMPANION_GET_MEMORY_INFO: 'companion:get-memory-info',
  COMPANION_GET_APP_VERSION: 'companion:get-app-version',

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
  AVATAR_DRAG_START: 'avatar:drag-start',
  AVATAR_DRAG_TO: 'avatar:drag-to',
  AVATAR_DRAG_END: 'avatar:drag-end',
  AVATAR_ANIM_STATE: 'avatar:anim-state', // broadcast
  AVATAR_WHISPER: 'avatar:whisper', // broadcast
  AVATAR_CONTEXT_MENU: 'avatar:context-menu',
  AVATAR_HOVER_SUGGEST: 'avatar:hover-suggest',
  AVATAR_LAYOUT: 'avatar:layout', // broadcast — slot inset (x,y) where avatar sits inside the window
  AVATAR_GET_LAYOUT: 'avatar:get-layout', // request: synchronous fetch of current layout
  AVATAR_FUN_TOGGLE: 'avatar:fun-toggle', // request: toggle fun mode on/off
  AVATAR_FUN_FETCH: 'avatar:fun-fetch', // request: 60-second fetch session
  AVATAR_FUN_STATE: 'avatar:fun-state', // broadcast — fun mode is currently active?
  AVATAR_FUN_FRAME: 'avatar:fun-frame', // broadcast — per-frame transform for the avatar
  AVATAR_RAVE_STATE: 'avatar:rave-state', // broadcast — Konami-triggered rave mode active flag
  AVATAR_GAZE: 'avatar:gaze', // broadcast — direction Clawd should glance (left/right/none)
  AVATAR_EMOTE: 'avatar:emote', // broadcast — momentary emoji emote (sweat/etc)
  AVATAR_PLAY_SOUND: 'avatar:play-sound', // broadcast — renderer plays a synthesized cue

  // ─── Phase 2 interactions ───────────────────────────
  AVATAR_WAVE: 'avatar:wave', // broadcast — render a wave reaction
  AVATAR_TICKLE: 'avatar:tickle', // request: trigger a tickle (from menu)
  AVATAR_TICKLE_EVENT: 'avatar:tickle-event', // broadcast — render tickle anim
  AVATAR_DANCE: 'avatar:dance', // request: start a dance session (renderer→main)
  AVATAR_DANCE_STATE: 'avatar:dance-state', // broadcast — dancing? + remaining ms
  AVATAR_HIGH_FIVE: 'avatar:high-five', // broadcast — render high-five anim
  AVATAR_FOOD_DROP: 'avatar:food-drop', // request: user dropped an emoji on Clawd (renderer→main)
  AVATAR_FOOD_REACTION: 'avatar:food-reaction', // broadcast — Clawd reacts to dropped food
  AVATAR_SLEEP_STATE: 'avatar:sleep-state', // broadcast — sleeping vs awake

  // ─── App ────────────────────────────────────────────
  APP_QUIT: 'app:quit',
  APP_OPEN_LAST_SPEC: 'app:open-last-spec',
  APP_REGISTER_ACTIVITY: 'app:register-activity',

  // ─── Auto-update ────────────────────────────────────
  UPDATE_STATUS: 'update:status', // broadcast
  UPDATE_CHECK_NOW: 'update:check-now',
  UPDATE_GET_LAST: 'update:get-last',
  UPDATE_QUIT_AND_INSTALL: 'update:quit-and-install',

  // ─── Pomodoro ───────────────────────────────────────
  POMODORO_WINDOW_OPEN: 'pomodoro-window:open',
  POMODORO_WINDOW_CLOSE: 'pomodoro-window:close',
  POMODORO_GET_STATUS: 'pomodoro:get-status',
  POMODORO_START: 'pomodoro:start',
  POMODORO_PAUSE: 'pomodoro:pause',
  POMODORO_RESUME: 'pomodoro:resume',
  POMODORO_RESET: 'pomodoro:reset',
  POMODORO_SKIP: 'pomodoro:skip',
  POMODORO_STATUS: 'pomodoro:status', // broadcast

  // ─── Petting ────────────────────────────────────────
  PET_REGISTER: 'pet:register', // request: register a single pet event
  PET_GET_STATS: 'pet:get-stats',
  PET_EVENT: 'pet:event', // broadcast — fires on every pet
  JOURNAL_APPEND: 'journal:append', // request: append a journal entry to memory dir

  // ─── Snack ──────────────────────────────────────────
  SNACK_GIVE: 'snack:give', // request: give Clawd a snack
  SNACK_GET_STATS: 'snack:get-stats',
  SNACK_EVENT: 'snack:event', // broadcast — fires when a snack is given

  // ─── Collection ─────────────────────────────────────
  COLLECTION_GET: 'collection:get',
  COLLECTION_EVENT: 'collection:event', // broadcast — fires when a new item is earned

  // ─── Achievements ───────────────────────────────────
  ACHIEVEMENTS_GET_CATALOG: 'achievements:get-catalog',
  ACHIEVEMENTS_GET_EARNED: 'achievements:get-earned',
  ACHIEVEMENTS_EVENT: 'achievements:event', // broadcast — fires when one is earned

  // ─── Pomodoro streak ────────────────────────────────
  POMODORO_STREAK_GET: 'pomodoro-streak:get',
  POMODORO_STREAK_STATE: 'pomodoro-streak:state' // broadcast
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
