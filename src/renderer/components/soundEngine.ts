/**
 * Sound engine — synthesized cues via the Web Audio API. No external
 * audio assets; everything's generated from oscillators / filters /
 * envelopes at runtime.
 *
 * Public API: `playSound(name, opts?)`. The avatar window subscribes to
 * the AVATAR_PLAY_SOUND broadcast and calls into here. Settings provide
 * a master mute toggle and 0..1 volume. Each preset is a small recipe
 * function that wires nodes onto the shared master gain bus.
 *
 * Why renderer-side and not main: AudioContext lives in renderer only
 * (Electron's main process has no audio output). Main broadcasts WHAT
 * to play; the renderer plays it.
 *
 * No clicks: every envelope ends at 0 via a guaranteed
 * linearRampToValueAtTime(0, end), and oscillators stop slightly past
 * the envelope tail.
 */

export type SoundName =
  | 'pet'           // soft warm coo — fired on each pet event
  | 'snack'         // tiny crunch / pop — snack given
  | 'pomo-end'      // pomodoro work block complete (warm)
  | 'pomo-break'    // break finished (gentler)
  | 'achievement'   // milestone unlock (cheerful)
  | 'wall-bounce'   // fun-mode wall hit (small)
  | 'rave'          // konami unlock (longer, ascending)
  | 'wake'          // welcome back on wake from sleep

let audioCtx: AudioContext | null = null
let masterBus: GainNode | null = null
let muted = false
let masterVolume = 0.6

/**
 * Initialize lazily — AudioContext creation requires a user gesture in
 * many browsers, but Electron is permissive. We still defer to the
 * first play call so we don't waste audio resources on launch.
 */
function ensureContext(): { ctx: AudioContext; bus: GainNode } | null {
  try {
    if (!audioCtx) {
      const Ctx =
        (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      audioCtx = new Ctx()
      masterBus = audioCtx.createGain()
      masterBus.gain.value = muted ? 0 : masterVolume
      masterBus.connect(audioCtx.destination)
    }
    if (!masterBus) return null
    return { ctx: audioCtx, bus: masterBus }
  } catch {
    return null
  }
}

export function setMuted(next: boolean): void {
  muted = next
  if (masterBus && audioCtx) {
    const now = audioCtx.currentTime
    masterBus.gain.cancelScheduledValues(now)
    // Anchor the current value so the ramp is deterministic — without this,
    // linearRampToValueAtTime has no preceding scheduled event to ramp from
    // after cancelScheduledValues, and the start value becomes UA-dependent.
    masterBus.gain.setValueAtTime(masterBus.gain.value, now)
    masterBus.gain.linearRampToValueAtTime(muted ? 0 : masterVolume, now + 0.05)
  }
}

export function setVolume(v: number): void {
  masterVolume = Math.max(0, Math.min(1, v))
  if (!muted && masterBus && audioCtx) {
    const now = audioCtx.currentTime
    masterBus.gain.cancelScheduledValues(now)
    masterBus.gain.setValueAtTime(masterBus.gain.value, now)
    masterBus.gain.linearRampToValueAtTime(masterVolume, now + 0.05)
  }
}

// ─── Recipes ────────────────────────────────────────────────────────

/** The judge-selected pet sound: detuned sine pair, warm low-pass coo. */
function petCoo(ctx: AudioContext, bus: GainNode): void {
  const t0 = ctx.currentTime
  const dur = 0.32

  const envGain = ctx.createGain()
  envGain.gain.setValueAtTime(0.0001, t0)
  envGain.gain.linearRampToValueAtTime(0.22, t0 + 0.035)
  envGain.gain.linearRampToValueAtTime(0.18, t0 + 0.14)
  envGain.gain.setTargetAtTime(0.0001, t0 + 0.18, 0.06)
  envGain.gain.linearRampToValueAtTime(0.0, t0 + dur)

  const lpf = ctx.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.setValueAtTime(2500, t0)
  lpf.Q.setValueAtTime(0.7, t0)

  const hpf = ctx.createBiquadFilter()
  hpf.type = 'highpass'
  hpf.frequency.setValueAtTime(420, t0)
  hpf.Q.setValueAtTime(0.5, t0)

  const baseFreq = 720
  const oscA = ctx.createOscillator()
  oscA.type = 'sine'
  oscA.frequency.setValueAtTime(baseFreq, t0)
  oscA.frequency.linearRampToValueAtTime(baseFreq * 1.018, t0 + 0.12)
  oscA.frequency.linearRampToValueAtTime(baseFreq * 1.005, t0 + 0.26)
  oscA.detune.setValueAtTime(-7, t0)

  const oscB = ctx.createOscillator()
  oscB.type = 'sine'
  oscB.frequency.setValueAtTime(baseFreq, t0)
  oscB.frequency.linearRampToValueAtTime(baseFreq * 1.018, t0 + 0.12)
  oscB.frequency.linearRampToValueAtTime(baseFreq * 1.005, t0 + 0.26)
  oscB.detune.setValueAtTime(7, t0)

  const a = ctx.createGain()
  a.gain.setValueAtTime(0.5, t0)
  const b = ctx.createGain()
  b.gain.setValueAtTime(0.5, t0)

  oscA.connect(a)
  oscB.connect(b)
  a.connect(hpf)
  b.connect(hpf)
  hpf.connect(lpf)
  lpf.connect(envGain)
  envGain.connect(bus)

  oscA.start(t0)
  oscB.start(t0)
  oscA.stop(t0 + dur + 0.02)
  oscB.stop(t0 + dur + 0.02)
}

/** Quick warm pop — for snack. Same family as pet but shorter + brighter. */
function snackBlip(ctx: AudioContext, bus: GainNode): void {
  const t0 = ctx.currentTime
  const dur = 0.18
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.linearRampToValueAtTime(0.25, t0 + 0.012)
  env.gain.setTargetAtTime(0.0001, t0 + 0.05, 0.04)
  env.gain.linearRampToValueAtTime(0, t0 + dur)

  const lpf = ctx.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.setValueAtTime(3200, t0)
  lpf.Q.setValueAtTime(0.6, t0)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, t0)
  osc.frequency.exponentialRampToValueAtTime(660, t0 + dur)
  osc.connect(lpf)
  lpf.connect(env)
  env.connect(bus)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** Two-note ascending chime — for pomodoro end. */
function pomoChime(ctx: AudioContext, bus: GainNode, low = 660, high = 990): void {
  const t0 = ctx.currentTime
  const note = (freq: number, delay: number, len: number, vol: number): void => {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t0 + delay)
    env.gain.linearRampToValueAtTime(vol, t0 + delay + 0.025)
    env.gain.setTargetAtTime(0.0001, t0 + delay + 0.1, 0.12)
    env.gain.linearRampToValueAtTime(0, t0 + delay + len)

    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 2400
    lpf.Q.value = 0.7

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t0 + delay)
    osc.connect(lpf)
    lpf.connect(env)
    env.connect(bus)
    osc.start(t0 + delay)
    osc.stop(t0 + delay + len + 0.02)
  }
  note(low, 0, 0.45, 0.18)
  note(high, 0.16, 0.55, 0.2)
}

/** Bright sparkly arp — for achievement unlocks. */
function achievementChime(ctx: AudioContext, bus: GainNode): void {
  const t0 = ctx.currentTime
  const notes = [659, 784, 988, 1318] // E5 G5 B5 E6
  notes.forEach((freq, i) => {
    const delay = i * 0.07
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t0 + delay)
    env.gain.linearRampToValueAtTime(0.18, t0 + delay + 0.015)
    env.gain.setTargetAtTime(0.0001, t0 + delay + 0.06, 0.1)
    env.gain.linearRampToValueAtTime(0, t0 + delay + 0.4)

    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 4000
    lpf.Q.value = 0.4

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t0 + delay)
    osc.connect(lpf)
    lpf.connect(env)
    env.connect(bus)
    osc.start(t0 + delay)
    osc.stop(t0 + delay + 0.42)
  })
}

/** Tiny boop — wall bounce in fun mode. */
function bounceTick(ctx: AudioContext, bus: GainNode): void {
  const t0 = ctx.currentTime
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.linearRampToValueAtTime(0.12, t0 + 0.005)
  env.gain.linearRampToValueAtTime(0, t0 + 0.08)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(540, t0)
  osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.07)
  osc.connect(env)
  env.connect(bus)
  osc.start(t0)
  osc.stop(t0 + 0.1)
}

/** Rising 5-note happy run — for konami / rave unlock. */
function raveFanfare(ctx: AudioContext, bus: GainNode): void {
  const t0 = ctx.currentTime
  const seq = [523, 659, 784, 988, 1175] // C5 E5 G5 B5 D6
  seq.forEach((freq, i) => {
    const delay = i * 0.08
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t0 + delay)
    env.gain.linearRampToValueAtTime(0.2, t0 + delay + 0.015)
    env.gain.setTargetAtTime(0.0001, t0 + delay + 0.08, 0.07)
    env.gain.linearRampToValueAtTime(0, t0 + delay + 0.35)

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t0 + delay)
    osc.connect(env)
    env.connect(bus)
    osc.start(t0 + delay)
    osc.stop(t0 + delay + 0.36)
  })
}

/** Two soft sines for the wake greeting. */
function wakeHum(ctx: AudioContext, bus: GainNode): void {
  pomoChime(ctx, bus, 540, 720)
}

const RECIPES: Record<SoundName, (ctx: AudioContext, bus: GainNode) => void> = {
  pet: petCoo,
  snack: snackBlip,
  'pomo-end': (c, b) => pomoChime(c, b, 660, 990),
  'pomo-break': (c, b) => pomoChime(c, b, 880, 660),
  achievement: achievementChime,
  'wall-bounce': bounceTick,
  rave: raveFanfare,
  wake: wakeHum
}

/**
 * Play a sound by name. No-ops if AudioContext can't be created (e.g.
 * permissions, headless test) or if muted. Returns true if a sound was
 * scheduled, false otherwise.
 */
export function playSound(name: SoundName): boolean {
  if (muted) return false
  const ready = ensureContext()
  if (!ready) return false
  const recipe = RECIPES[name]
  if (!recipe) return false
  try {
    recipe(ready.ctx, ready.bus)
    return true
  } catch {
    return false
  }
}
