/** Global hotkey registration. */
import { globalShortcut } from 'electron'
import logger from './logger'

let registered: string | null = null

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

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
  registered = null
}
