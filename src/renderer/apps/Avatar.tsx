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
import { CostumeOverlay } from '../components/CostumeOverlay'
import { GazeOverlay } from '../components/GazeOverlay'
import { playSound, setMuted as setSoundMuted, setVolume as setSoundVolume, type SoundName } from '../components/soundEngine'
import type {
  AppSettings,
  AvatarAnimState,
  AvatarLayout,
  CollectionItem,
  DailyTodoStore,
  FunFrame,
  PetStats,
  PomodoroStatus,
  PomodoroStreakState,
  WhisperEvent
} from '@shared/types'
import { clamp } from '@shared/time'
import { TOOLTIP_HALO_PX } from '@shared/constants'

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
  const [layout, setLayout] = useState<AvatarLayout | null>(null)
  const [funActive, setFunActive] = useState<boolean>(false)
  const [fetching, setFetching] = useState<boolean>(false)
  const [funFrame, setFunFrame] = useState<FunFrame | null>(null)
  const [pettingActive, setPettingActive] = useState<boolean>(false)
  const [hearts, setHearts] = useState<Array<{ id: number; x: number }>>([])
  const heartIdRef = useRef(0)
  const pettingTimeoutRef = useRef<number | null>(null)
  // Forces a re-render 5s after the last pet so the mood ring's pink
  // afterglow logic re-evaluates and falls back to the default color.
  const afterglowTimeoutRef = useRef<number | null>(null)
  const [pomoStatus, setPomoStatus] = useState<PomodoroStatus | null>(null)
  const [petStats, setPetStats] = useState<PetStats | null>(null)
  const [snackingUntil, setSnackingUntil] = useState<number>(0)
  const [, forceTick] = useState(0)
  const [costume, setCostume] = useState<AppSettings['costume']>('none')
  const [mascotVariant, setMascotVariant] = useState<AppSettings['mascotVariant']>('clawd')
  const [raveActive, setRaveActive] = useState<boolean>(false)
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([])
  const [streak, setStreak] = useState<PomodoroStreakState | null>(null)
  const [gaze, setGaze] = useState<'left' | 'right' | 'none'>('none')
  const [emote, setEmote] = useState<string | null>(null)
  const emoteTimeoutRef = useRef<number | null>(null)
  // Phase 2 reaction states.
  const [tickleActive, setTickleActive] = useState(false)
  const [waveActive, setWaveActive] = useState(false)
  const [highFiveActive, setHighFiveActive] = useState(false)
  const [foodReaction, setFoodReaction] = useState<{ food: string; reaction: 'love' | 'meh' | 'reject' } | null>(null)
  const [sleeping, setSleeping] = useState(false)
  const reactionTimerRef = useRef<number | null>(null)
  const foodTimerRef = useRef<number | null>(null)
  const wheelAccum = useRef(0)
  const lastResize = useRef(0)
  const whisperTimerRef = useRef<number | null>(null)
  const funActiveRef = useRef<boolean>(false)

  // Initial settings + subscriptions
  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setSize(s.avatarSize)
      setCostume(s.costume ?? 'none')
      setMascotVariant(s.mascotVariant ?? 'clawd')
      setSoundMuted(s.mute === true)
      setSoundVolume(typeof s.volume === 'number' ? s.volume : 0.6)
    })
    void window.api.todos.list().then(setTodos)

    const offState = window.api.avatar.onAnimState(setState)
    const offTodos = window.api.todos.onChanged(setTodos)
    const offLayout = window.api.avatar.onLayout((l) => {
      setLayout(l)
      setSize(l.avatarSize)
    })
    // Pull initial layout synchronously so the tooltip has correct geometry
    // on the very first hover (the broadcast may arrive after the tooltip
    // already animates in).
    void window.api.avatar.getLayout().then((l) => {
      if (l) {
        setLayout(l)
        setSize(l.avatarSize)
      }
    })
    const offFunFrame = window.api.avatar.onFunFrame(setFunFrame)
    const offFunState = window.api.avatar.onFunState(({ active, fetching: f }) => {
      setFunActive(active)
      funActiveRef.current = active
      setFetching(f)
      if (!active) setFunFrame(null) // clear residual transform
    })
    // Listen for petting events from main (broadcast on every successful
    // registration). Trigger the blush state + spawn a heart.
    const offPet = window.api.petting.onEvent(() => {
      // Spawn a heart at a slightly random x offset so they don't overlap
      const id = ++heartIdRef.current
      const x = (Math.random() - 0.5) * 24 // -12..12px
      setHearts((h) => [...h.slice(-2), { id, x }]) // cap at 3 on screen
      window.setTimeout(() => {
        setHearts((h) => h.filter((heart) => heart.id !== id))
      }, 1400)
      // Hold blush state for ~1.4s — refreshed on each subsequent pet.
      setPettingActive(true)
      if (pettingTimeoutRef.current !== null) {
        window.clearTimeout(pettingTimeoutRef.current)
      }
      pettingTimeoutRef.current = window.setTimeout(() => {
        setPettingActive(false)
        pettingTimeoutRef.current = null
      }, 1400)
      // Refresh stats so the ring color logic can read the pet timestamp.
      void window.api.petting.getStats().then(setPetStats)
      // Schedule a re-render 5s after the pet so the mood ring's pink
      // afterglow logic flips back to the default color even if no other
      // state changes happen in between.
      if (afterglowTimeoutRef.current !== null) {
        window.clearTimeout(afterglowTimeoutRef.current)
      }
      afterglowTimeoutRef.current = window.setTimeout(() => {
        afterglowTimeoutRef.current = null
        // Touch petStats to nudge React to re-render and re-evaluate the
        // mood ring color. petStats fields don't change here; React's
        // shallow-equality on the object reference is what triggers it.
        setPetStats((s) => (s ? { ...s } : s))
      }, 5100)
    })

    // Mood ring inputs: pomodoro status + pet stats. Re-read on each
    // pomodoro tick / pet event so the ring color stays in sync.
    void window.api.pomodoro.getStatus().then(setPomoStatus)
    void window.api.petting.getStats().then(setPetStats)
    const offPomo = window.api.pomodoro.onStatus(setPomoStatus)
    const offSnack = window.api.snack.onEvent((ev) => {
      const until = Date.now() + ev.durationMs
      setSnackingUntil(until)
      // Tick the component every 200ms during the chomp so the fade-out
      // can be driven by date-comparison without a separate animation lib.
      const iv = window.setInterval(() => {
        if (Date.now() >= until) {
          window.clearInterval(iv)
          setSnackingUntil(0)
          forceTick((n) => n + 1)
        } else {
          forceTick((n) => n + 1)
        }
      }, 200)
    })
    // Settings broadcast so costume / sizes update without restarting.
    const offSettings = window.api.settings.onChanged((s) => {
      setSize(s.avatarSize)
      setCostume(s.costume ?? 'none')
      setMascotVariant(s.mascotVariant ?? 'clawd')
      setSoundMuted(s.mute === true)
      setSoundVolume(typeof s.volume === 'number' ? s.volume : 0.6)
    })
    const offRave = window.api.avatar.onRaveState(setRaveActive)
    const offPlaySound = window.api.avatar.onPlaySound((name) => {
      playSound(name as SoundName)
    })

    // Phase 2 subscriptions.
    const offTickle = window.api.avatar.onTickle(() => {
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current)
      setTickleActive(true)
      reactionTimerRef.current = window.setTimeout(() => setTickleActive(false), 2000)
    })
    const offWave = window.api.avatar.onWave(() => {
      setWaveActive(true)
      window.setTimeout(() => setWaveActive(false), 1200)
    })
    const offHighFive = window.api.avatar.onHighFive(() => {
      setHighFiveActive(true)
      window.setTimeout(() => setHighFiveActive(false), 900)
    })
    const offFoodReaction = window.api.avatar.onFoodReaction((r) => {
      if (foodTimerRef.current) window.clearTimeout(foodTimerRef.current)
      setFoodReaction(r)
      foodTimerRef.current = window.setTimeout(() => setFoodReaction(null), 1800)
    })
    const offSleepState = window.api.avatar.onSleepState(setSleeping)
    void window.api.collection.get().then((c) => setCollectionItems(c.items))
    const offCollection = window.api.collection.onEvent((c) => setCollectionItems(c.items))
    void window.api.pomodoroStreak.get().then(setStreak)
    const offStreak = window.api.pomodoroStreak.onState(setStreak)
    const offGaze = window.api.avatar.onGaze(setGaze)
    const offEmote = window.api.avatar.onEmote(({ emoji, durationMs }) => {
      setEmote(emoji)
      if (emoteTimeoutRef.current !== null) {
        window.clearTimeout(emoteTimeoutRef.current)
      }
      emoteTimeoutRef.current = window.setTimeout(() => {
        setEmote(null)
        emoteTimeoutRef.current = null
      }, durationMs)
    })
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
      offLayout()
      offFunFrame()
      offFunState()
      offPet()
      offPomo()
      offSnack()
      offSettings()
      offRave()
      offPlaySound()
      offTickle()
      offWave()
      offHighFive()
      offFoodReaction()
      offSleepState()
      offCollection()
      offStreak()
      offGaze()
      offEmote()
      if (whisperTimerRef.current !== null) {
        window.clearTimeout(whisperTimerRef.current)
      }
      if (pettingTimeoutRef.current !== null) {
        window.clearTimeout(pettingTimeoutRef.current)
      }
      if (emoteTimeoutRef.current !== null) {
        window.clearTimeout(emoteTimeoutRef.current)
      }
      if (afterglowTimeoutRef.current !== null) {
        window.clearTimeout(afterglowTimeoutRef.current)
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

  // Phase 2: figure-8 wave detector + high-five (click + space).
  // The previous version counted X and Y reversals independently per
  // pointermove event — diagonal zigzags counted both at once. Real
  // figure-8s alternate: X-reversal at the lobe ends, Y-reversal at
  // the crossing. We enforce that by requiring an X-reversal to be
  // followed by a Y-reversal (and vice versa) before counting; same-
  // frame double-flips don't accumulate.
  useEffect(() => {
    let lastX = 0
    let lastY = 0
    let lastSignX = 0
    let lastSignY = 0
    let alternations = 0 // count of X→Y or Y→X reversals
    let lastReversalAxis: 'x' | 'y' | null = null
    let firstAt = 0
    const WINDOW_MS = 1500
    const NEEDED = 4 // 4 alternations ≈ a real figure-8
    const onMove = (e: PointerEvent): void => {
      const slot = avatarSlotRef.current
      if (!slot) return
      const r = slot.getBoundingClientRect()
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (!inside) {
        alternations = 0
        lastReversalAxis = null
        firstAt = 0
        return
      }
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      const sx = dx > 1 ? 1 : dx < -1 ? -1 : 0
      const sy = dy > 1 ? 1 : dy < -1 ? -1 : 0
      // Detect a reversal on the dominant axis only — whichever has the
      // larger magnitude. This prevents same-frame double-counting.
      let reversedAxis: 'x' | 'y' | null = null
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (sx !== 0 && sx !== lastSignX && lastSignX !== 0) reversedAxis = 'x'
        if (sx !== 0) lastSignX = sx
      } else {
        if (sy !== 0 && sy !== lastSignY && lastSignY !== 0) reversedAxis = 'y'
        if (sy !== 0) lastSignY = sy
      }
      lastX = e.clientX
      lastY = e.clientY
      const now = Date.now()
      if (reversedAxis && reversedAxis !== lastReversalAxis) {
        // Genuine alternation between axes.
        if (alternations === 0) firstAt = now
        alternations += 1
        lastReversalAxis = reversedAxis
        if (now - firstAt > WINDOW_MS) {
          // Reset stale streak.
          alternations = 1
          firstAt = now
        }
      }
      if (alternations >= NEEDED) {
        alternations = 0
        lastReversalAxis = null
        firstAt = 0
        setWaveActive(true)
        window.setTimeout(() => setWaveActive(false), 1200)
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // High-five: spacebar pressed while pointer is over the avatar slot
  // (no mouse click required — too easy to misfire with click).
  useEffect(() => {
    let pointerOverSlot = false
    let lastFireAt = 0
    const onMove = (e: PointerEvent): void => {
      const slot = avatarSlotRef.current
      if (!slot) return
      const r = slot.getBoundingClientRect()
      pointerOverSlot =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      if (!pointerOverSlot) return
      const now = Date.now()
      if (now - lastFireAt < 1500) return
      lastFireAt = now
      setHighFiveActive(true)
      window.setTimeout(() => setHighFiveActive(false), 900)
      playSound('snack' as SoundName)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Drag-and-drop emoji onto the avatar slot.
  useEffect(() => {
    const slot = avatarSlotRef.current
    if (!slot) return
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      const text = e.dataTransfer?.getData('text/plain') ?? ''
      // Match any single emoji (loose: any non-ASCII char).
      const match = text.trim().match(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u)
      if (!match) return
      const emoji = Array.from(match[0])[0] ?? ''
      if (!emoji) return
      void window.api.avatar.foodDrop(emoji)
    }
    slot.addEventListener('dragover', onDragOver)
    slot.addEventListener('drop', onDrop)
    return () => {
      slot.removeEventListener('dragover', onDragOver)
      slot.removeEventListener('drop', onDrop)
    }
  }, [])

  const ratio = todos && todos.todos.length ? todos.todos.filter((t) => t.done).length / todos.todos.length : 0
  const total = todos?.todos.length ?? 0
  const allDone = total > 0 && ratio === 1
  const variant: AvatarAnimState | 'happy' = allDone ? 'happy' : state

  /**
   * Mood ring color — picks the most relevant signal in priority order:
   *   pet (5s afterglow) > pomodoro (work=blue, break=green) >
   *   all-todos-done (green) > overdue (amber) > idle (purple).
   * Fun mode keeps its rainbow handled by funActive flag below.
   */
  const moodColor = ((): string => {
    if (raveActive) return '#FF66E0' // bright pink — bumped further by hue-rotate filter
    const recentPet = petStats?.lastPettedAt && Date.now() - petStats.lastPettedAt < 5_000
    if (pettingActive || recentPet) return '#F8A8B0' // pink — just petted
    if (pomoStatus?.state === 'running') {
      return pomoStatus.phase === 'work' ? '#7C6FF7' : '#4ADE80'
    }
    if (allDone) return '#4ADE80' // green — full completion
    // Overdue check: any todo created >24h ago that's still undone.
    const now = Date.now()
    const overdue = todos?.todos.some((t) => !t.done && now - t.createdAt > 24 * 60 * 60 * 1000)
    if (overdue) return '#F5C542' // amber
    return '#7C6FF7' // default purple
  })()

  /**
   * Drag handling — uses Pointer Events with setPointerCapture so that
   * mousemove/mouseup keep firing even when the cursor leaves the avatar's
   * (small) BrowserWindow. With plain mouseup-on-window the up event was
   * silently lost on fast drags that exited the 64px window.
   *
   * - pointerdown captures the screen-space cursor position
   * - pointermove streams new cursor positions to main → main moves window
   * - pointerup / pointercancel ends the drag, edge-snaps, persists position
   * - if cursor never moved more than 5 px (manhattan), treat as a click → open chat
   *
   * We use clientX/Y plus window.screenX/Y to compute screen-space coords,
   * because the renderer doesn't have direct access to the mouse's
   * absolute screen position.
   */
  const dragRef = useRef<{
    downAt: { x: number; y: number }
    moved: boolean
    pointerId: number
    /** Stroke-gesture tracker. Updated on each pointermove. */
    stroke: {
      startClientX: number
      lastClientX: number
      /** Sign of the last *committed* direction (after we've seen REVERSAL_DELTA_PX of motion in that direction). */
      lastDeltaSign: number // -1, 0, or 1
      /**
       * Pending displacement since lastDeltaSign was committed. We only
       * commit a NEW direction (and count a reversal) once the cursor has
       * moved REVERSAL_DELTA_PX in that direction — this kills the phantom
       * reversals from sub-pixel mouse jitter that used to fire pets on
       * unidirectional drags.
       */
      pendingDx: number
      reversals: number
      maxAbsX: number
      startedAt: number
      isPetting: boolean
    }
  } | null>(null)
  const CLICK_THRESHOLD_PX = 5
  // Stroke parameters. A "reversal" is committed only when the cursor has
  // moved at least REVERSAL_DELTA_PX in the new direction since the last
  // committed direction — small sub-pixel jitter on unidirectional drags
  // no longer fires phantom reversals. Tightening this to 6px makes the
  // gesture genuinely require an intentional left-right oscillation.
  const STROKE_REVERSALS_THRESHOLD = 2
  const STROKE_WINDOW_MS = 1100
  const REVERSAL_DELTA_PX = 6

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return // only primary button
    // Fun mode: any click stops the romp. Don't engage drag/click pipeline.
    if (funActiveRef.current) {
      void window.api.avatar.funToggle()
      return
    }
    // Capture the pointer so subsequent pointermove/pointerup events fire
    // on this element regardless of where the cursor actually is.
    e.currentTarget.setPointerCapture(e.pointerId)
    const screenX = e.screenX
    const screenY = e.screenY
    dragRef.current = {
      downAt: { x: screenX, y: screenY },
      moved: false,
      pointerId: e.pointerId,
      stroke: {
        startClientX: e.clientX,
        lastClientX: e.clientX,
        lastDeltaSign: 0,
        pendingDx: 0,
        reversals: 0,
        maxAbsX: 0,
        startedAt: Date.now(),
        isPetting: false
      }
    }
    void window.api.avatar.dragStart(screenX, screenY)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return
    const dx = e.screenX - dragRef.current.downAt.x
    const dy = e.screenY - dragRef.current.downAt.y

    // Stroke detection. Real petting is a tight side-to-side oscillation
    // (small max horizontal excursion, multiple reversals, mostly horizontal).
    // Real drags are mostly unidirectional with significant vertical motion.
    // Heuristics below distinguish them; if any drag-like signal shows up,
    // we drop out of stroke detection and let normal drag-to-move proceed.
    const stroke = dragRef.current.stroke
    const elapsed = Date.now() - stroke.startedAt
    const slot = avatarSlotRef.current
    let pointerInSlot = true
    if (slot) {
      const r = slot.getBoundingClientRect()
      pointerInSlot =
        e.clientX >= r.left - 4 &&
        e.clientX <= r.right + 4 &&
        e.clientY >= r.top - 4 &&
        e.clientY <= r.bottom + 4
    }

    // Update max horizontal excursion from start.
    const absXFromStart = Math.abs(e.clientX - stroke.startClientX)
    if (absXFromStart > stroke.maxAbsX) stroke.maxAbsX = absXFromStart

    // Drag-like signals — drop out of stroke mode permanently.
    const verticalDrift = Math.abs(dy) > 8 // >8px vertical = not a stroke
    const escapedSlot = !pointerInSlot
    const tooFar = stroke.maxAbsX > 25 // strokes oscillate tightly
    const expired = elapsed > STROKE_WINDOW_MS

    if (!stroke.isPetting && (verticalDrift || escapedSlot || tooFar || expired)) {
      // Definitely a drag attempt. Clear reversal counters; fall through
      // to drag-to-move logic below.
      stroke.reversals = 0
      stroke.lastDeltaSign = 0
      stroke.pendingDx = 0
    } else if (!stroke.isPetting) {
      // Accumulate horizontal motion. A reversal is only counted when
      // the user has moved REVERSAL_DELTA_PX in the OPPOSITE direction
      // since the last committed direction — this filters jitter.
      const cdx = e.clientX - stroke.lastClientX
      stroke.lastClientX = e.clientX
      stroke.pendingDx += cdx
      const accSign = stroke.pendingDx > 0 ? 1 : stroke.pendingDx < 0 ? -1 : 0
      if (accSign !== 0 && Math.abs(stroke.pendingDx) >= REVERSAL_DELTA_PX) {
        if (stroke.lastDeltaSign !== 0 && accSign !== stroke.lastDeltaSign) {
          stroke.reversals += 1
        }
        stroke.lastDeltaSign = accSign
        stroke.pendingDx = 0
      }
      if (stroke.reversals >= STROKE_REVERSALS_THRESHOLD) {
        stroke.isPetting = true
        stroke.reversals = 0
        stroke.pendingDx = 0
        stroke.startedAt = Date.now()
        void window.api.petting.register()
        return
      }
    }

    // Already petting — keep counting reversals for additional pets.
    if (stroke.isPetting) {
      const cdx = e.clientX - stroke.lastClientX
      stroke.lastClientX = e.clientX
      stroke.pendingDx += cdx
      const accSign = stroke.pendingDx > 0 ? 1 : stroke.pendingDx < 0 ? -1 : 0
      if (accSign !== 0 && Math.abs(stroke.pendingDx) >= REVERSAL_DELTA_PX) {
        if (stroke.lastDeltaSign !== 0 && accSign !== stroke.lastDeltaSign) {
          stroke.reversals += 1
        }
        stroke.lastDeltaSign = accSign
        stroke.pendingDx = 0
      }
      if (stroke.reversals >= 2) {
        stroke.reversals = 0
        void window.api.petting.register()
      }
      return
    }

    // Drag-to-move: cursor moved >5px AND we ruled out stroke. Promotes
    // immediately on the first move past 5px screen-distance — the older
    // "wait for slot exit" gate was preventing legitimate drags.
    if (!dragRef.current.moved && Math.abs(dx) + Math.abs(dy) > CLICK_THRESHOLD_PX) {
      dragRef.current.moved = true
    }
    if (dragRef.current.moved) {
      void window.api.avatar.dragTo(e.screenX, e.screenY)
    }
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released — ignore
    }
    const moved = dragRef.current.moved
    const wasPetting = dragRef.current.stroke.isPetting
    dragRef.current = null
    void window.api.avatar.dragEnd()
    if (!moved && !wasPetting) {
      // Tap on the avatar with no drag → open chat.
      void window.api.chat.open()
    }
  }

  /**
   * Hover suggestion. After ~700ms of mouse-over (no movement, no chat
   * window already open), fire a contextual one-liner via main → Claude.
   * The suggestion shows in the same whisper-tooltip slot. We rate-limit
   * to once per 60s to avoid burning the API on idle hovers.
   */
  const hoverTimerRef = useRef<number | null>(null)
  const lastHoverFireRef = useRef<number>(0)
  const avatarSlotRef = useRef<HTMLDivElement | null>(null)
  const HOVER_DELAY_MS = 700
  const HOVER_COOLDOWN_MS = 60_000

  const armHover = (): void => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
    }
    hoverTimerRef.current = window.setTimeout(async () => {
      hoverTimerRef.current = null
      // Skip if a whisper is already on screen, or we're mid-drag
      if (whisper || dragRef.current) return
      // Cooldown gate
      const now = Date.now()
      if (now - lastHoverFireRef.current < HOVER_COOLDOWN_MS) return
      lastHoverFireRef.current = now
      try {
        const text = await window.api.avatar.hoverSuggest()
        if (text && !whisper) {
          // Reuse the whisper tooltip slot. Clear any previous timer.
          if (whisperTimerRef.current !== null) {
            window.clearTimeout(whisperTimerRef.current)
          }
          setWhisper({ text, key: Date.now() })
          whisperTimerRef.current = window.setTimeout(() => {
            setWhisper(null)
            whisperTimerRef.current = null
          }, 6500)
        }
      } catch {
        // Quietly ignore — hover should never disrupt
      }
    }, HOVER_DELAY_MS)
  }

  const cancelHover = (): void => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  // Pointer-tracking fallback. macOS panel windows that haven't been activated
  // sometimes don't dispatch mouseenter / pointerenter to the renderer until
  // *another* window in the app has had focus once. We side-step this by
  // listening to pointermove globally: as long as the cursor is over the
  // avatar slot, we re-arm the hover timer (debounced). Once the avatar is
  // clicked once, the regular pointer-enter path also starts working — but
  // this listener ensures the very first hover after launch fires reliably.
  useEffect(() => {
    let lastEnterAt = 0
    const onMove = (e: PointerEvent): void => {
      const slot = avatarSlotRef.current
      if (!slot) return
      const r = slot.getBoundingClientRect()
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      const now = Date.now()
      if (inside) {
        // Debounce: only re-arm if we haven't seen an "enter" recently.
        if (now - lastEnterAt > 200) {
          lastEnterAt = now
          armHover()
        }
      } else {
        cancelHover()
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whisper])


  // Where the avatar slot sits inside the window. Defaults to centered
  // (TOOLTIP_HALO_PX top, horizontally centered) until the first layout
  // event arrives from main. After that, main controls the offsets — when
  // the window is clamped against a screen edge to keep the tooltip on
  // screen, the slot moves the opposite direction so the avatar stays put.
  const slotInsetX = layout?.slotInsetX
  const slotInsetY = layout?.slotInsetY ?? TOOLTIP_HALO_PX
  const isSnacking = snackingUntil > Date.now()

  return (
    // Outer fills the whole BrowserWindow, but pointer-events on the halo
    // bands above/below/around the avatar are disabled so users can click
    // through the transparent halo to whatever's underneath. Only the
    // avatar slot itself is interactive.
    <div className="w-full h-full relative pointer-events-none">
      <div
        ref={avatarSlotRef}
        className="absolute flex items-center justify-center cursor-grab active:cursor-grabbing pointer-events-auto"
        style={{
          width: size,
          height: size,
          top: slotInsetY,
          // Rave mode: continuous hue rotation makes the whole avatar +
          // ring + costume cycle through colors. Cheap and visible.
          animation: raveActive ? 'clawd-rave 1.5s linear infinite' : undefined,
          ...(slotInsetX === undefined
            ? { left: '50%', transform: 'translateX(-50%)' }
            : { left: slotInsetX })
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerEnter={armHover}
        onPointerLeave={cancelHover}
        onMouseEnter={armHover}
        onMouseLeave={cancelHover}
      >
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

        {/* Progress + mood ring. Ring is always rendered now so the
            mood-color signal is visible even with no todos. */}
        <ProgressRing
          ratio={total > 0 ? ratio : 0}
          size={size}
          color={moodColor}
        />

        {/* Fun-mode transform layer — rotation + non-uniform scaling for
            squash/stretch. We wrap the existing motion.div instead of
            applying the transform inline, because framer-motion overwrites
            its target's transform every animation frame. */}
        <motion.div
          className="relative pointer-events-none"
          style={{
            width: size * 0.78,
            height: size * 0.78,
            transform: funFrame
              ? `rotate(${funFrame.rotateDeg}deg) scale(${funFrame.scaleX}, ${funFrame.scaleY})`
              : undefined,
            transformOrigin: '50% 60%',
            // Mascot color variant — pure CSS hue rotate over the
            // orange-base SVG palette. Saturate slightly so the result
            // doesn't look washed out.
            filter:
              mascotVariant === 'mocha'
                ? 'hue-rotate(-30deg) saturate(0.7) brightness(0.8)'
                : mascotVariant === 'mint'
                  ? 'hue-rotate(110deg) saturate(0.85)'
                  : mascotVariant === 'plum'
                    ? 'hue-rotate(220deg) saturate(0.8)'
                    : undefined
          }}
          // Pet wobble: tiny side-to-side bob while petting state is active.
          // Doesn't fight framer-motion variants because we animate the
          // wrapper, not the inner motion.div.
          // Snack chomp: a quick scaleY pulse loop while snacking.
          // (Co-pilot gaze used to tilt the body here; that was confusing —
          // gaze is now a pure eye-pupil overlay below.)
          animate={
            pettingActive
              ? { rotate: [-4, 4, -3, 3, 0] }
              : isSnacking
                ? { scaleY: [1, 0.92, 1, 0.94, 1], rotate: 0 }
                : { rotate: 0 }
          }
          transition={
            pettingActive
              ? { duration: 0.6, ease: 'easeInOut' }
              : isSnacking
                ? { duration: 0.45, ease: 'easeInOut', repeat: Infinity }
                : { duration: 0.2 }
          }
        >
          <motion.div
            className="relative pixel pointer-events-none w-full h-full"
            variants={VARIANTS}
            // In fun mode the physics layer drives all motion; halt the
            // breathing/wobble variants so they don't fight the squash.
            animate={funActive ? false : variant}
          >
            <Clawd
              state={
                sleeping
                  ? 'sleep'
                  : pettingActive
                    ? 'blush'
                    : allDone
                      ? 'idle'
                      : state
              }
              todosComplete={allDone && !pettingActive && !sleeping}
              width="100%"
              height="100%"
            />
            {/* Costume / hat overlay — same 64x64 viewBox, stacked on top. */}
            <CostumeOverlay
              costume={costume}
              className="absolute inset-0 pointer-events-none"
              width="100%"
              height="100%"
            />
            {/* Gaze overlay — paints small white pupils that shift toward
                an open chat window. Stacked above the costume so a hat or
                shades doesn't cover it (shades are mostly transparent
                pixels in our overlay so the pupil still reads through). */}
            <GazeOverlay
              gaze={gaze}
              className="absolute inset-0 pointer-events-none"
              width="100%"
              height="100%"
            />
          </motion.div>
        </motion.div>

        {/* Fetch ball — appears next to Clawd while a fetch session is
            running (NOT during free-roam fun mode). */}
        <AnimatePresence>
          {fetching && (
            <motion.div
              key="fetch-ball"
              className="pointer-events-none absolute"
              style={{
                left: '-10%',
                top: '20%',
                fontSize: Math.max(14, size * 0.32)
              }}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{
                opacity: 1,
                scale: 1,
                rotate: [0, 360],
                y: [0, -4, 0]
              }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{
                rotate: { duration: 1.2, ease: 'linear', repeat: Infinity },
                y: { duration: 0.6, ease: 'easeInOut', repeat: Infinity },
                opacity: { duration: 0.3 }
              }}
            >
              <span role="img" aria-label="ball">🎾</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Snack bowl — appears next to the avatar while snacking, fades. */}
        <AnimatePresence>
          {isSnacking && (
            <motion.div
              key="snack-bowl"
              className="pointer-events-none absolute"
              style={{ left: '60%', top: '60%', fontSize: Math.max(14, size * 0.32) }}
              initial={{ opacity: 0, y: 6, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -2, scale: 0.6 }}
              transition={{ duration: 0.3 }}
            >
              <span role="img" aria-label="snack">🥬</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emote — momentary emoji above Clawd's head (CPU load etc). */}
        <AnimatePresence>
          {emote && (
            <motion.div
              key={`emote-${emote}`}
              className="pointer-events-none absolute"
              style={{ left: '50%', top: -8, fontSize: Math.max(14, size * 0.35) }}
              initial={{ opacity: 0, scale: 0.5, y: 6, x: '-50%' }}
              animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, scale: 0.4, y: -8, x: '-50%' }}
              transition={{ duration: 0.4 }}
            >
              {emote}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wave reaction — ✋ briefly above Clawd's head. */}
        <AnimatePresence>
          {waveActive && (
            <motion.div
              key={`wave-${Date.now()}`}
              className="pointer-events-none absolute"
              style={{ left: '50%', top: -10, fontSize: Math.max(16, size * 0.4) }}
              initial={{ opacity: 0, x: '-50%', y: 6, rotate: -30 }}
              animate={{ opacity: 1, x: '-50%', y: 0, rotate: [0, -25, 25, -15, 15, 0] }}
              exit={{ opacity: 0, x: '-50%', y: -8 }}
              transition={{ duration: 1.0 }}
            >
              ✋
            </motion.div>
          )}
        </AnimatePresence>

        {/* High-five reaction — bigger ✋ that pops in. */}
        <AnimatePresence>
          {highFiveActive && (
            <motion.div
              key={`hf-${Date.now()}`}
              className="pointer-events-none absolute"
              style={{ left: '50%', top: '20%', fontSize: Math.max(20, size * 0.55) }}
              initial={{ opacity: 0, x: '-50%', scale: 0.4 }}
              animate={{ opacity: 1, x: '-50%', scale: [0.4, 1.2, 1] }}
              exit={{ opacity: 0, x: '-50%', scale: 0.6 }}
              transition={{ duration: 0.7 }}
            >
              ✋
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tickle — Clawd does a giggle wiggle (the wrapper rotates). The
            visible cue is also a 🤭 emoji floating up. */}
        <AnimatePresence>
          {tickleActive && (
            <motion.div
              key={`tk-${Date.now()}`}
              className="pointer-events-none absolute"
              style={{ left: '50%', top: '5%', fontSize: Math.max(14, size * 0.4) }}
              initial={{ opacity: 0, x: '-50%', y: 6 }}
              animate={{ opacity: 1, x: '-50%', y: -8 }}
              exit={{ opacity: 0, x: '-50%' }}
              transition={{ duration: 1.6 }}
            >
              🤭
            </motion.div>
          )}
        </AnimatePresence>

        {/* Food reaction — 💕 / 😐 / 🚫 next to Clawd. */}
        <AnimatePresence>
          {foodReaction && (
            <motion.div
              key={`food-${foodReaction.food}-${Date.now()}`}
              className="pointer-events-none absolute"
              style={{ left: '70%', top: '25%', fontSize: Math.max(14, size * 0.36) }}
              initial={{ opacity: 0, scale: 0.5, x: '-50%' }}
              animate={{ opacity: 1, scale: 1, x: '-50%' }}
              exit={{ opacity: 0, x: '-50%' }}
              transition={{ duration: 0.4 }}
            >
              {foodReaction.reaction === 'love'
                ? '💕'
                : foodReaction.reaction === 'reject'
                  ? '🚫'
                  : '😐'}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sleep z's — when Clawd is sleeping, gentle z's float up. */}
        {sleeping && (
          <motion.div
            className="pointer-events-none absolute"
            style={{ left: '70%', top: '5%', fontSize: Math.max(14, size * 0.32) }}
            animate={{ opacity: [0.2, 1, 0.2], y: [0, -10, -20] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            💤
          </motion.div>
        )}

        {/* Streak badge — small 🔥 chip in upper-right while a streak is active. */}
        {streak && streak.currentDays > 0 && (
          <div
            className="pointer-events-none absolute font-mono text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-amber-500/90 text-black border border-amber-300 shadow-md"
            style={{
              top: -4,
              right: -4,
              transform: 'rotate(8deg)'
            }}
            title={`${streak.currentDays}-day pomodoro streak${streak.todayCounts ? '' : ' (at risk — finish a focus block today!)'}`}
          >
            🔥{streak.currentDays}
          </div>
        )}

        {/* Heart particles — float up and fade out on each pet. */}
        <AnimatePresence>
          {hearts.map((h) => (
            <motion.div
              key={h.id}
              className="pointer-events-none absolute text-pink-300 text-base"
              style={{
                left: '50%',
                top: '20%',
                transformOrigin: '50% 50%'
              }}
              initial={{ opacity: 0, x: h.x, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], x: h.x, y: -38, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            >
              ♥
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Collection strip — small emoji row below the avatar slot, in the
          bottom halo. Renders only when there are items, so it doesn't
          intrude on the empty-state. */}
      {collectionItems.length > 0 && slotInsetX !== undefined && (
        <div
          className="absolute pointer-events-none flex gap-0.5 items-center justify-center"
          style={{
            left: slotInsetX + size / 2,
            top: slotInsetY + size + 2,
            transform: 'translateX(-50%)',
            fontSize: Math.max(10, size * 0.22),
            lineHeight: 1
          }}
        >
          {collectionItems.slice(-6).map((it) => (
            <span key={it.id} title={it.label}>
              {it.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Tooltip — sibling of the avatar slot so its `right` / `left` are
          measured in WINDOW coords, letting it extend toward whichever side
          of the window has more room. Anchored to a few px above the slot. */}
      <AnimatePresence>
        {whisper && (
          <TooltipBubble
            key={whisper.key}
            text={whisper.text}
            avatarSize={size}
            slotInsetX={slotInsetX}
            slotInsetY={slotInsetY}
            windowWidth={layout?.windowWidth}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Pop-up bubble shown above the avatar. Anchored to the side of the WINDOW
 * (not just the avatar slot) that has more room, so the tooltip can fully
 * extend without being clipped. Main has already clamped the window inside
 * the screen, so anything inside the window will be visible.
 */
function TooltipBubble({
  text,
  avatarSize,
  slotInsetX,
  slotInsetY,
  windowWidth
}: {
  text: string
  avatarSize: number
  slotInsetX: number | undefined
  slotInsetY: number
  windowWidth: number | undefined
}): JSX.Element {
  // Anchor the tooltip a few px above the avatar slot.
  const bottomAnchor = slotInsetY - 4

  // Without layout info: just sit centered above the avatar slot with a
  // safe, conservative width.
  if (slotInsetX === undefined || windowWidth === undefined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.6 }}
        className="pointer-events-none absolute px-3 py-1.5 rounded-2xl bg-[#1A1A2E] text-textMain text-xs leading-snug shadow-lg border border-accent/30 text-center"
        style={{
          left: '50%',
          top: bottomAnchor,
          transform: 'translate(-50%, -100%)',
          width: 320,
          maxWidth: 320,
          whiteSpace: 'normal',
          wordBreak: 'break-word'
        }}
      >
        {text}
      </motion.div>
    )
  }

  const slotCenterX = slotInsetX + avatarSize / 2
  const PAD = 8

  // Cap the tooltip width to whatever fits inside the window with PAD on
  // both sides. Anchor the tooltip horizontally centered on the avatar
  // slot, but clamp the left edge so the bubble stays inside the window
  // even when the avatar is jammed into a corner. Critically, we do NOT
  // force the width to the cap — short messages shrink to their content
  // (`width: max-content` with `maxWidth: cap`), long ones wrap.
  const maxWidth = Math.max(180, windowWidth - 2 * PAD)

  // Translate-x: center on slot, clamped to the window. We can't know the
  // tooltip's actual rendered width here without measuring, so we use the
  // CSS solution `left: 50% of the slot center, transform: translateX(-50%)`
  // for centering, then a separate clamp computed from the worst-case
  // width (the cap). When content is shorter than the cap, the bubble
  // stays visually centered on the avatar without protruding.
  const halfMax = maxWidth / 2
  let centerX = slotCenterX
  if (centerX - halfMax < PAD) centerX = PAD + halfMax
  if (centerX + halfMax > windowWidth - PAD) centerX = windowWidth - PAD - halfMax

  const alignStyle: React.CSSProperties = {
    left: centerX,
    top: bottomAnchor,
    transform: 'translate(-50%, -100%)'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.6 }}
      className="pointer-events-none absolute px-3 py-1.5 rounded-2xl bg-[#1A1A2E] text-textMain text-xs leading-snug shadow-lg border border-accent/30 text-center"
      style={{
        ...alignStyle,
        maxWidth,
        width: 'max-content',
        whiteSpace: 'normal',
        wordBreak: 'break-word'
      }}
    >
      {text}
    </motion.div>
  )
}
