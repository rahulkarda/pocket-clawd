/**
 * Settings persistence.
 * Wraps electron-store, resolves the default output dir at runtime.
 */
import Store from 'electron-store'
import { app, BrowserWindow } from 'electron'
import path from 'path'
import { IPC } from '@shared/ipc'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

class SettingsStore {
  private store: Store<AppSettings>

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'settings',
      defaults: {
        ...DEFAULT_SETTINGS,
        outputDir: path.join(app.getPath('documents'), 'claude-sessions')
      }
    })
  }

  get(): AppSettings {
    return this.store.store
  }

  /**
   * Persist a settings patch and broadcast SETTINGS_CHANGED to every
   * renderer so live UI (Avatar costume, etc.) updates without a poll.
   */
  update(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.store.store, ...patch }
    this.store.store = next
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.SETTINGS_CHANGED, next)
    }
    return next
  }

  reset(): void {
    this.store.clear()
  }
}

let _instance: SettingsStore | null = null
export function settingsStore(): SettingsStore {
  if (!_instance) _instance = new SettingsStore()
  return _instance
}
