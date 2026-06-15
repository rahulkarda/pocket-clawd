/**
 * Idle activity tracker.
 * Uses electron's powerMonitor.getSystemIdleTime() — system-wide idle (no input events).
 * Emits 'idle-alert' when threshold exceeded; 'active' when user returns.
 */
import { powerMonitor } from 'electron'
import { EventEmitter } from 'events'
import logger from './logger'

class IdleTracker extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private wasIdle = false
  private idleThresholdSec = 30 * 60

  setThresholdMinutes(minutes: number): void {
    this.idleThresholdSec = Math.max(60, Math.floor(minutes * 60))
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      const idleSec = powerMonitor.getSystemIdleTime()
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
    }, 30_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Manually mark activity (e.g. on chat input). Resets the wasIdle flag. */
  registerActivity(): void {
    if (this.wasIdle) {
      this.wasIdle = false
      this.emit('active')
    }
  }
}

const _tracker = new IdleTracker()
export default _tracker
