/** Global hotkey registration. */
import { globalShortcut } from 'electron'
import logger from './logger'

let registered: string | null = null
const extraRegistered = new Set<string>()

export function registerHotkey(accelerator: string, handler: () => void): boolean {
  if (registered) globalShortcut.unregister(registered)
  try {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) {
      registered = accelerator
      logger.info('Hotkey registered:', accelerator)
      return true
    }
    logger.warn('Hotkey registration returned false:', accelerator)
    return false
  } catch (err) {
    logger.error('Hotkey registration threw', err)
    return false
  }
}

/**
 * Register an additional global hotkey alongside the primary one. Used
 * for Quick Capture (Cmd+Shift+T) etc. Returns true on success.
 *
 * Note: Electron's globalShortcut.register returns true even when the
 * OS doesn't actually route keystrokes to the handler (some accelerators
 * are "soft-claimed" by macOS / focused apps and silently shadowed).
 * We still log the result; if a hotkey isn't firing despite this saying
 * "registered", the accelerator is being eaten upstream.
 */
export function registerExtraHotkey(accelerator: string, handler: () => void): boolean {
  try {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) {
      extraRegistered.add(accelerator)
      const isReg = globalShortcut.isRegistered(accelerator)
      logger.info(`Extra hotkey registered: ${accelerator} (isRegistered=${isReg})`)
      return true
    }
    logger.warn(`Extra hotkey registration returned false: ${accelerator}`)
    return false
  } catch (err) {
    logger.error('Extra hotkey registration threw', err)
    return false
  }
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
  registered = null
  extraRegistered.clear()
}

/**
 * Unregister a single accelerator (if it was previously registered via
 * registerExtraHotkey). Used when the user changes a hotkey through
 * Settings — we drop the old binding before installing the new one.
 */
export function unregisterHotkey(accelerator: string): void {
  if (!accelerator) return
  try {
    if (globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator)
    }
    extraRegistered.delete(accelerator)
  } catch (err) {
    logger.warn(`Failed to unregister hotkey ${accelerator}`, err)
  }
}
