/**
 * Pomodoro engine — work-block timer with short and long breaks.
 *
 * State machine (simple, persistent in memory only — restarts blank):
 *   idle ─start(work)→ running ─tick→ running ... ─complete→ next phase
 *   running ─pause→ paused ─resume→ running
 *   * any state ─reset→ idle
 *   * running ─skip→ ends current phase early (advances to next)
 *
 * Phase progression:
 *   work → short-break (cycles 1..N-1)
 *   work → long-break (cycle N) and then cycle counter resets
 *   any break → work
 *
 * The tick runs at 1 Hz (no rAF — UI just polls or subscribes). At each
 * tick we recompute remaining seconds from a wall-clock anchor so missed
 * ticks (sleep, throttle) don't drift. Status is broadcast on every state
 * change AND every tick to all renderers.
 *
 * Notifications fire on phase transitions when settings.pomodoroNotify=true.
 * Phase-aware whispers reuse the existing whisper system: the engine calls
 * whisperEngine.surfaceWhisper() with a per-transition message.
 */
import { Notification, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { PomodoroPhase, PomodoroState, PomodoroStatus } from '@shared/types'
import logger from './logger'
import { settingsStore } from './settings'

interface InternalState {
  state: PomodoroState
  phase: PomodoroPhase
  /** Wall-clock ms when the current phase will hit zero (only valid while running). */
  expiresAt: number
  /** Seconds remaining if we're paused (snapshot at pause, used to recompute expiresAt on resume). */
  pausedRemainingSec: number
  /** 1-based; counts work cycles in the current set (1..cyclesBeforeLongBreak). */
  workCycleIndex: number
  /** Lifetime counter of completed work blocks. */
  workBlocksCompleted: number
  /** User's intent for this work block (carried across pause/resume but cleared on phase change). */
  taskLabel: string
  /** 1-second tick handle. */
  tickHandle: NodeJS.Timeout | null
}

const internal: InternalState = {
  state: 'idle',
  phase: 'work',
  expiresAt: 0,
  pausedRemainingSec: 0,
  workCycleIndex: 1,
  workBlocksCompleted: 0,
  taskLabel: '',
  tickHandle: null
}

function phaseDurationSec(phase: PomodoroPhase): number {
  const s = settingsStore().get()
  switch (phase) {
    case 'work':
      return Math.max(1, Math.min(180, s.pomodoroWorkMin)) * 60
    case 'short-break':
      return Math.max(1, Math.min(60, s.pomodoroShortBreakMin)) * 60
    case 'long-break':
      return Math.max(1, Math.min(120, s.pomodoroLongBreakMin)) * 60
  }
}

function remainingSec(): number {
  if (internal.state === 'running') {
    return Math.max(0, Math.round((internal.expiresAt - Date.now()) / 1000))
  }
  if (internal.state === 'paused') return internal.pausedRemainingSec
  return phaseDurationSec(internal.phase)
}

export function getStatus(): PomodoroStatus {
  return {
    state: internal.state,
    phase: internal.phase,
    remainingSec: remainingSec(),
    phaseTotalSec: phaseDurationSec(internal.phase),
    workCycleIndex: internal.workCycleIndex,
    workBlocksCompleted: internal.workBlocksCompleted,
    taskLabel: internal.taskLabel
  }
}

function broadcast(): void {
  const status = getStatus()
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.POMODORO_STATUS, status)
  }
  // Side-effect: collection awards check on every status update. Cheap;
  // the collection module no-ops unless a milestone has been crossed.
  void import('./collection')
    .then((m) => m.maybeAward(status))
    .catch(() => undefined)
  // Side-effect: streak tracker — bumps once per local day per increment.
  void import('./pomodoroStreak')
    .then((m) => m.onPomodoroWorkBlocksCompletedChanged(status.workBlocksCompleted))
    .catch(() => undefined)
}

function clearTick(): void {
  if (internal.tickHandle) {
    clearInterval(internal.tickHandle)
    internal.tickHandle = null
  }
}

function startTick(): void {
  clearTick()
  // Tick at 250ms so the seconds display updates without visible drift.
  // We always recompute from expiresAt, so faster ticking doesn't add cost.
  internal.tickHandle = setInterval(() => {
    if (internal.state !== 'running') return
    const left = remainingSec()
    if (left <= 0) {
      onPhaseComplete()
    } else {
      // Cheap broadcast — only renderers with the listener will pay attention.
      broadcast()
    }
  }, 250)
}

function notify(title: string, body: string): void {
  if (!settingsStore().get().pomodoroNotify) return
  try {
    new Notification({ title, body, silent: false }).show()
  } catch (err) {
    logger.warn('pomodoro notification failed', err)
  }
}

/**
 * Surface a phase-aware whisper through the existing whisper pipeline.
 * We dynamic-import to avoid an import cycle (whisperEngine depends on
 * settings + anthropicClient; this file is small and standalone).
 */
async function whisper(text: string): Promise<void> {
  try {
    const mod = await import('./whisperEngine')
    const fn = (mod as unknown as { surfaceWhisper?: (text: string) => void }).surfaceWhisper
    if (typeof fn === 'function') {
      fn(text)
    }
  } catch {
    // ignore — whisper is best-effort
  }
}

function nextPhaseAfter(phase: PomodoroPhase): PomodoroPhase {
  const cyclesBeforeLong = Math.max(
    1,
    Math.min(12, settingsStore().get().pomodoroCyclesBeforeLongBreak)
  )
  if (phase === 'work') {
    return internal.workCycleIndex >= cyclesBeforeLong ? 'long-break' : 'short-break'
  }
  return 'work'
}

function onPhaseComplete(): void {
  const finished = internal.phase
  const next = nextPhaseAfter(finished)
  // Update counters based on what just finished.
  if (finished === 'work') {
    internal.workBlocksCompleted += 1
    if (next === 'long-break') {
      internal.workCycleIndex = 1
    } else {
      internal.workCycleIndex += 1
    }
    notify('Work block complete', `Time for a ${next === 'long-break' ? 'long' : 'short'} break.`)
    void import('./sound').then((m) => m.playSound('pomo-end')).catch(() => undefined)
    void whisper(
      next === 'long-break'
        ? 'Big break time — stand up, stretch, hydrate.'
        : 'Quick break — eyes off the screen for a bit.'
    )
  } else {
    notify('Break over', 'Back to focus — start the next work block when ready.')
    void import('./sound').then((m) => m.playSound('pomo-break')).catch(() => undefined)
    void whisper(
      finished === 'long-break'
        ? "Refreshed? Let's pick the next thing and dive in."
        : 'Break done — what are you tackling next?'
    )
    // Task label is cleared between work blocks so user can re-set focus.
    internal.taskLabel = ''
  }

  internal.phase = next
  const settings = settingsStore().get()
  if (settings.pomodoroAutoStartNext) {
    internal.expiresAt = Date.now() + phaseDurationSec(next) * 1000
    internal.state = 'running'
  } else {
    internal.state = 'idle'
    clearTick()
  }
  broadcast()
}

/**
 * Begin a new pomodoro session at `phase` (default: work). If a session is
 * already running it's reset first.
 */
export function startSession(taskLabel: string = '', phase: PomodoroPhase = 'work'): void {
  reset() // implicit reset is fine — we're explicitly (re)starting
  internal.phase = phase
  internal.taskLabel = taskLabel.slice(0, 200)
  internal.expiresAt = Date.now() + phaseDurationSec(phase) * 1000
  internal.state = 'running'
  startTick()
  broadcast()
  void whisper(
    phase === 'work'
      ? taskLabel
        ? `Locked in: ${taskLabel}. Let's go.`
        : "Focus block started — let's go."
      : 'Break started — take it easy.'
  )
  logger.info(
    `Pomodoro: started ${phase}, ${phaseDurationSec(phase)}s${taskLabel ? ` (label-len ${taskLabel.length})` : ''}`
  )
}

export function pause(): void {
  if (internal.state !== 'running') return
  internal.pausedRemainingSec = remainingSec()
  internal.state = 'paused'
  clearTick()
  broadcast()
  logger.info('Pomodoro: paused', internal.pausedRemainingSec)
}

export function resume(): void {
  if (internal.state !== 'paused') return
  internal.expiresAt = Date.now() + internal.pausedRemainingSec * 1000
  internal.state = 'running'
  startTick()
  broadcast()
  logger.info('Pomodoro: resumed')
}

export function reset(): void {
  clearTick()
  internal.state = 'idle'
  internal.phase = 'work'
  internal.expiresAt = 0
  internal.pausedRemainingSec = 0
  internal.taskLabel = ''
  // Note: workCycleIndex + workBlocksCompleted persist within a run so the
  // user can see lifetime counts in the UI; only a quit clears them.
  broadcast()
}

export function skip(): void {
  if (internal.state === 'idle') return
  // Pretend the phase elapsed.
  onPhaseComplete()
}

/** True if there is an active session (running or paused). */
export function isActive(): boolean {
  return internal.state !== 'idle'
}

/** Convenience for the avatar menu UI text. */
export function statusLabel(): string {
  switch (internal.state) {
    case 'running':
      return `${phaseLabel(internal.phase)} · ${formatMMSS(remainingSec())} left`
    case 'paused':
      return `Paused · ${phaseLabel(internal.phase)}`
    case 'idle':
    default:
      return 'Pomodoro: idle'
  }
}

export function phaseLabel(phase: PomodoroPhase): string {
  switch (phase) {
    case 'work':
      return 'Focus'
    case 'short-break':
      return 'Short break'
    case 'long-break':
      return 'Long break'
  }
}

export function formatMMSS(totalSec: number): string {
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

export function shutdown(): void {
  clearTick()
}
