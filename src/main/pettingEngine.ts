/**
 * Petting engine — counts pets, fires milestone whispers, and surfaces an
 * idle "wants pets" nudge if the user hasn't petted Clawd in a long time.
 *
 * Persistence: a small electron-store file separate from the main settings
 * store, since pet stats are user data, not configuration.
 *
 * The renderer is responsible for *detecting* the pet gesture; this engine
 * just receives a registration event, increments the counter, returns a
 * description of what happened, and broadcasts to all renderers.
 *
 * Idle nudge: a 1-minute interval checks (last pet > 3h ago) AND
 * (last nudge was on a different calendar day). When both conditions hold,
 * a single whisper goes out and lastIdleNudgeAt is bumped.
 */
import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { PetEvent, PetStats } from '@shared/types'
import logger from './logger'

const MILESTONES = new Set([1, 10, 50, 100, 250, 500, 1000, 2500, 5000])

const ACK_PHRASES = [
  "that's nice…",
  'thanks!',
  'you’re kind 🌸',
  'mmm.',
  'happy clawd noises',
  'good vibes',
  'aww',
  'thanks for the love',
  'pet pet pet',
  'soft.'
]

const MILESTONE_PHRASES: Record<number, string> = {
  1: 'first pet ever — i’ll remember this.',
  10: '10 pets! we’re bonding.',
  50: '50 pets, certified friend.',
  100: '100 pets! i’m basically your pet now.',
  250: '250 pets — touched by your kindness.',
  500: '500 pets, we’ve been through a lot together.',
  1000: '1,000 pets. legendary.',
  2500: 'i’ve lost count. ok 2,500. 🥹',
  5000: '5,000 pets. you are the petting champion.'
}

const IDLE_NUDGE_PHRASES = [
  "haven't been petted in a while…",
  'feeling unloved over here',
  'a small pet would be nice',
  'remember me?'
]

interface PetStoreShape extends PetStats {}

class PetStore {
  private store: Store<PetStoreShape>
  constructor() {
    this.store = new Store<PetStoreShape>({
      name: 'pet-stats',
      defaults: {
        count: 0,
        lastPettedAt: 0,
        lastIdleNudgeAt: 0
      }
    })
  }
  get(): PetStats {
    return {
      count: this.store.get('count') ?? 0,
      lastPettedAt: this.store.get('lastPettedAt') ?? 0,
      lastIdleNudgeAt: this.store.get('lastIdleNudgeAt') ?? 0
    }
  }
  set(patch: Partial<PetStats>): void {
    for (const k of Object.keys(patch) as Array<keyof PetStats>) {
      const v = patch[k]
      if (v !== undefined) this.store.set(k, v as never)
    }
  }
}

let _store: PetStore | null = null
function store(): PetStore {
  if (!_store) _store = new PetStore()
  return _store
}

let idleTimer: NodeJS.Timeout | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

async function whisper(text: string): Promise<void> {
  try {
    const mod = await import('./whisperEngine')
    const fn = (mod as unknown as { surfaceWhisper?: (t: string) => void }).surfaceWhisper
    if (typeof fn === 'function') fn(text)
  } catch {
    // ignore
  }
}

function pickPhrase(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]
}

/**
 * Register a single pet event. Returns the (count, milestone) outcome.
 * Called from the renderer when the stroke gesture or the right-click
 * menu item fires.
 *
 * Has a built-in cooldown: a single registration counts at most once per
 * 1.5s so spam-stroking doesn't inflate the lifetime counter.
 */
export function registerPet(): PetEvent {
  const s = store().get()
  const now = Date.now()
  const COOLDOWN_MS = 1500
  if (now - s.lastPettedAt < COOLDOWN_MS) {
    // Reuse the previous count — return as non-milestone so the renderer
    // doesn't double-fire animations.
    return { count: s.count, milestone: false }
  }

  const newCount = s.count + 1
  const milestone = MILESTONES.has(newCount)
  store().set({ count: newCount, lastPettedAt: now })

  // Fire whisper occasionally on regular pets (~25%); always on milestones.
  if (milestone) {
    void whisper(MILESTONE_PHRASES[newCount] ?? 'milestone pet ✨')
  } else if (Math.random() < 0.25) {
    void whisper(pickPhrase(ACK_PHRASES))
  }

  const ev: PetEvent = { count: newCount, milestone }
  broadcast(IPC.PET_EVENT, ev)
  // Aural cue — soft warm coo on every successful pet.
  void import('./sound').then((m) => m.playSound('pet')).catch(() => undefined)
  // Achievements may have crossed a threshold (10/100/...). Check async.
  void import('./achievements')
    .then((m) => m.check())
    .catch(() => undefined)
  return ev
}

export function getStats(): PetStats {
  return store().get()
}

/** Same calendar day check (local time). */
function isSameLocalDay(a: number, b: number): boolean {
  if (a === 0 || b === 0) return false
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

const IDLE_THRESHOLD_MS = 3 * 60 * 60 * 1000 // 3 hours

function checkIdleNudge(): void {
  const s = store().get()
  if (s.count === 0) return // never been petted — don't pester first-time users
  const now = Date.now()
  const sincePet = now - s.lastPettedAt
  if (sincePet < IDLE_THRESHOLD_MS) return
  if (isSameLocalDay(now, s.lastIdleNudgeAt)) return // already nudged today
  store().set({ lastIdleNudgeAt: now })
  void whisper(pickPhrase(IDLE_NUDGE_PHRASES))
  logger.info('Pet engine: idle nudge fired')
}

export function startPetEngine(): void {
  if (idleTimer) return
  // Check once a minute. Cheap.
  idleTimer = setInterval(checkIdleNudge, 60_000)
}

export function shutdown(): void {
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}
