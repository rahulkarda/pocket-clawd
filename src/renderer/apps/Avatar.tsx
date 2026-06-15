/**
 * Avatar — the floating Clawd pixel mascot.
 *
 * Responsibilities:
 *   - Render the right Clawd variant for the current animation state
 *   - Render the progress ring (todo completion %)
 *   - Show whisper tooltips with fade-in/out
 *   - Scroll-to-resize → IPC to main
 *   - Right-click → main shows context menu
 *   - Click → open chat
 *
 * The window itself is dragged via `-webkit-app-region: drag` on the root.
 * Inputs (the SVG, tooltip) sit in `no-drag` regions.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Clawd } from '../components/Clawd'
import { ProgressRing } from '../components/ProgressRing'
import type { AvatarAnimState, DailyTodoStore, WhisperEvent } from '@shared/types'
import { clamp } from '@shared/time'

const VARIANTS: Variants = {
  idle: {
    scale: [1, 1.06, 1],
    transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' }
  },
  whisper: {
    rotate: [-2, 2, 0],
    scale: 1,
    transition: { duration: 0.6, ease: 'easeInOut' }
  },
  'idle-alert': {
    scale: [1, 1.12, 1],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
  },
  active: {
    scale: 1.08,
    rotate: [-1, 1, -1],
    transition: { rotate: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }
  },
  happy: {
    scale: [1, 1.25, 0.95, 1.1, 1],
    transition: { duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }
  }
}

export function Avatar(): JSX.Element {
  const [state, setState] = useState<AvatarAnimState>('idle')
  const [todos, setTodos] = useState<DailyTodoStore | null>(null)
  const [whisper, setWhisper] = useState<{ text: string; key: number } | null>(null)
  const [size, setSize] = useState<number>(64)
  const wheelAccum = useRef(0)
  const lastResize = useRef(0)
  const whisperTimerRef = useRef<number | null>(null)

  // Initial settings + subscriptions
  useEffect(() => {
    void window.api.settings.get().then((s) => setSize(s.avatarSize))
    void window.api.todos.list().then(setTodos)

    const offState = window.api.avatar.onAnimState(setState)
    const offTodos = window.api.todos.onChanged(setTodos)
    const offWhisper = window.api.avatar.onWhisper((w: WhisperEvent) => {
      // Cancel any in-flight whisper timeout so two whispers in quick
      // succession don't have the first one's clear racing the second.
      if (whisperTimerRef.current !== null) {
        window.clearTimeout(whisperTimerRef.current)
      }
      setWhisper({ text: w.text, key: Date.now() })
      whisperTimerRef.current = window.setTimeout(() => {
        setWhisper(null)
        whisperTimerRef.current = null
      }, w.durationMs)
    })

    return () => {
      offState()
      offTodos()
      offWhisper()
      if (whisperTimerRef.current !== null) {
        window.clearTimeout(whisperTimerRef.current)
      }
    }
  }, [])

  // Scroll-to-resize (4px steps, throttled to 60ms)
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      wheelAccum.current += e.deltaY
      const now = Date.now()
      if (now - lastResize.current < 60) return
      const step = wheelAccum.current > 0 ? -4 : 4
      wheelAccum.current = 0
      lastResize.current = now
      const next = clamp(size + step, 40, 120)
      if (next !== size) {
        setSize(next)
        void window.api.avatar.resize(next)
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [size])

  // Right-click → main shows the native context menu
  useEffect(() => {
    const onCtx = (e: MouseEvent): void => {
      e.preventDefault()
      void window.api.avatar.showContextMenu()
    }
    window.addEventListener('contextmenu', onCtx)
    return () => window.removeEventListener('contextmenu', onCtx)
  }, [])

  const ratio = todos && todos.todos.length ? todos.todos.filter((t) => t.done).length / todos.todos.length : 0
  const total = todos?.todos.length ?? 0
  const allDone = total > 0 && ratio === 1
  const variant: AvatarAnimState | 'happy' = allDone ? 'happy' : state

  const onClick = (): void => {
    void window.api.chat.open()
  }

  return (
    <div className="drag w-full h-full relative flex items-center justify-center">
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            state === 'idle-alert'
              ? 'radial-gradient(circle, rgba(245,197,66,0.45) 0%, transparent 65%)'
              : state === 'active'
                ? 'radial-gradient(circle, rgba(124,111,247,0.4) 0%, transparent 60%)'
                : 'radial-gradient(circle, rgba(124,111,247,0.18) 0%, transparent 65%)',
          filter: 'blur(8px)'
        }}
      />

      {/* Progress ring */}
      {total > 0 && (
        <ProgressRing
          ratio={ratio}
          size={size}
          color={allDone ? '#4ADE80' : '#7C6FF7'}
        />
      )}

      <motion.div
        className="no-drag relative pixel cursor-pointer"
        style={{ width: size * 0.78, height: size * 0.78 }}
        variants={VARIANTS}
        animate={variant}
        onClick={onClick}
      >
        <Clawd
          state={allDone ? 'idle' : state}
          todosComplete={allDone}
          width="100%"
          height="100%"
        />
      </motion.div>

      {/* Whisper tooltip */}
      <AnimatePresence>
        {whisper && (
          <motion.div
            key={whisper.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.6 }}
            className="no-drag absolute -top-8 px-3 py-1 rounded-full bg-[#1A1A2E] text-textMain text-xs whitespace-nowrap shadow-lg border border-accent/30"
          >
            {whisper.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
