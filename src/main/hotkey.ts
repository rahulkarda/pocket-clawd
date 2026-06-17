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
 */
export function registerExtraHotkey(accelerator: string, handler: () => void): boolean {
  try {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) {
      extraRegistered.add(accelerator)
      logger.info('Extra hotkey registered:', accelerator)
      return true
    }
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
