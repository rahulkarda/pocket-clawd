/**
 * Pomodoro window — current phase, time remaining, big start/pause/skip
 * controls, optional task label for work blocks, lifetime cycle counter.
 *
 * State is owned by main; this UI just dispatches IPC and renders status
 * pushed via POMODORO_STATUS broadcasts.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { PomodoroStatus } from '@shared/types'

const PHASE_LABEL: Record<PomodoroStatus['phase'], string> = {
  work: 'Focus',
  'short-break': 'Short break',
  'long-break': 'Long break'
}

const PHASE_COLOR: Record<PomodoroStatus['phase'], string> = {
  work: '#7C6FF7', // accent (purple)
  'short-break': '#4ADE80', // green
  'long-break': '#F5C542' // amber
}

function formatMMSS(totalSec: number): string {
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

export function PomodoroApp(): JSX.Element {
  const [status, setStatus] = useState<PomodoroStatus | null>(null)
  const [taskLabel, setTaskLabel] = useState('')

  useEffect(() => {
    void window.api.pomodoro.getStatus().then(setStatus)
    return window.api.pomodoro.onStatus(setStatus)
  }, [])

  const ratio = useMemo(() => {
    if (!status || status.phaseTotalSec === 0) return 0
    return Math.max(0, Math.min(1, 1 - status.remainingSec / status.phaseTotalSec))
  }, [status])

  const start = async (): Promise<void> => {
    await window.api.pomodoro.start(taskLabel.trim(), 'work')
  }
  const pause = async (): Promise<void> => {
    await window.api.pomodoro.pause()
  }
  const resume = async (): Promise<void> => {
    await window.api.pomodoro.resume()
  }
  const reset = async (): Promise<void> => {
    if (!confirm('Reset the pomodoro? Current progress will be lost.')) return
    setTaskLabel('')
    await window.api.pomodoro.reset()
  }
  const skip = async (): Promise<void> => {
    await window.api.pomodoro.skip()
  }
  const startBreak = async (which: 'short-break' | 'long-break'): Promise<void> => {
    await window.api.pomodoro.start('', which)
  }

  const phase = status?.phase ?? 'work'
  const color = PHASE_COLOR[phase]
  const phaseName = PHASE_LABEL[phase]

  return (
    <div className="w-screen h-screen flex flex-col bg-bg text-textMain rounded-2xl overflow-hidden border border-white/5">
      <div className="drag flex items-center justify-between px-4 py-3 border-b border-white/5 bg-panel/80">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">Pomodoro</span>
          <span className="text-[10px] text-textMeta">
            {status
              ? `Cycle ${status.workCycleIndex} · ${status.workBlocksCompleted} block${status.workBlocksCompleted === 1 ? '' : 's'} done today`
              : 'Loading…'}
          </span>
        </div>
        <button
          className="no-drag w-6 h-6 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-sm leading-none flex items-center justify-center"
          onClick={() => window.api.pomodoroWindow.close()}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 gap-3">
        {/* Phase chip */}
        <span
          className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}22`, color, borderWidth: 1, borderColor: `${color}55`, borderStyle: 'solid' }}
        >
          {phaseName}
          {status?.state === 'paused' && ' · paused'}
          {status?.state === 'idle' && ' · idle'}
        </span>

        {/* Timer ring */}
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
            <motion.circle
              cx="50"
              cy="50"
              r="44"
              stroke={color}
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 44}
              animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - ratio) }}
              transition={{ duration: 0.4 }}
            />
          </svg>
          <div className="text-center">
            <div className="font-mono text-3xl tabular-nums tracking-tight">
              {formatMMSS(status?.remainingSec ?? 0)}
            </div>
            <div className="text-[10px] text-textMeta mt-0.5">
              of {formatMMSS(status?.phaseTotalSec ?? 0)}
            </div>
          </div>
        </div>

        {/* Task label input — only for work phase, only when starting */}
        {status?.state === 'idle' && phase === 'work' && (
          <input
            value={taskLabel}
            onChange={(e) => setTaskLabel(e.target.value.slice(0, 200))}
            placeholder="Optional: what are you focusing on?"
            className="w-full max-w-[280px] bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent/40 text-center"
          />
        )}
        {status?.taskLabel && status.state !== 'idle' && phase === 'work' && (
          <div className="text-[11px] text-textMeta italic max-w-[280px] text-center truncate">
            {status.taskLabel}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 mt-2">
          {status?.state === 'idle' && (
            <button
              onClick={start}
              className="px-5 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/90"
            >
              Start focus
            </button>
          )}
          {status?.state === 'running' && (
            <>
              <button
                onClick={pause}
                className="px-4 py-2 rounded-lg bg-bubble-user text-textMain text-sm hover:bg-bubble-user/80"
              >
                Pause
              </button>
              <button
                onClick={skip}
                className="px-3 py-2 rounded-lg bg-bg/60 border border-white/10 text-textMeta text-xs hover:text-textMain"
                title="End this phase early"
              >
                Skip ▸
              </button>
            </>
          )}
          {status?.state === 'paused' && (
            <>
              <button
                onClick={resume}
                className="px-5 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/90"
              >
                Resume
              </button>
              <button
                onClick={reset}
                className="px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs hover:bg-red-500/25"
              >
                Reset
              </button>
            </>
          )}
        </div>

        {/* Quick break starters when idle */}
        {status?.state === 'idle' && (
          <div className="flex items-center gap-2 mt-1 text-[10px] text-textMeta">
            <span>Or start a break:</span>
            <button
              onClick={() => void startBreak('short-break')}
              className="underline decoration-dotted hover:text-textMain"
            >
              short
            </button>
            <span>·</span>
            <button
              onClick={() => void startBreak('long-break')}
              className="underline decoration-dotted hover:text-textMain"
            >
              long
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/5 bg-panel/60 flex items-center justify-between text-[10px] text-textMeta">
        <button
          onClick={() => void window.api.settingsWindow.open()}
          className="hover:text-textMain underline decoration-dotted"
        >
          Adjust durations
        </button>
        {status && status.state !== 'idle' && (
          <button
            onClick={reset}
            className="hover:text-red-300"
            title="Reset session"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
