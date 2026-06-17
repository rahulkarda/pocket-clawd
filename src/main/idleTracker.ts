/**
 * Idle activity tracker.
 * Uses electron's powerMonitor.getSystemIdleTime() — system-wide idle (no input events).
 * Emits 'idle-alert' when threshold exceeded; 'active' when user returns.
 *
 * Also emits 'sleeping' / 'awake' for the Phase-2 sleep mode (Clawd
 * curls up at a shorter, gentler threshold than idle-alert).
 */
import { powerMonitor } from 'electron'
import { EventEmitter } from 'events'
import logger from './logger'

class IdleTracker extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private wasIdle = false
  private wasSleeping = false
  private idleThresholdSec = 30 * 60
  private sleepThresholdSec = 15 * 60

  setThresholdMinutes(minutes: number): void {
    this.idleThresholdSec = Math.max(60, Math.floor(minutes * 60))
  }

  setSleepThresholdMinutes(minutes: number): void {
    this.sleepThresholdSec = Math.max(60, Math.floor(minutes * 60))
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      const idleSec = powerMonitor.getSystemIdleTime()
      // Idle alert (existing behavior).
      const isIdle = idleSec >= this.idleThresholdSec
      if (isIdle && !this.wasIdle) {
        this.wasIdle = true
        logger.info(`Idle alert fired (${idleSec}s)`)
        this.emit('idle-alert')
      } else if (!isIdle && this.wasIdle) {
        this.wasIdle = false
        logger.info('User returned from idle')
        this.emit('active')
      }
      // Sleep mode (Phase 2).
      const isSleeping = idleSec >= this.sleepThresholdSec
      if (isSleeping && !this.wasSleeping) {
        this.wasSleeping = true
        logger.info(`Clawd sleeping (${idleSec}s)`)
        this.emit('sleeping')
      } else if (!isSleeping && this.wasSleeping) {
        this.wasSleeping = false
        logger.info('Clawd waking')
        this.emit('awake')
      }
    }, 30_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Manually mark activity (e.g. on chat input). Resets idle + sleep flags. */
  registerActivity(): void {
    if (this.wasIdle) {
      this.wasIdle = false
      this.emit('active')
    }
    if (this.wasSleeping) {
      this.wasSleeping = false
      this.emit('awake')
    }
  }
}

const _tracker = new IdleTracker()
export default _tracker
