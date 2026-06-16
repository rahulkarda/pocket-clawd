/**
 * Auto-update wiring for pocket-clawd.
 *
 * On launch (after a brief delay so the UI is up), check the GitHub
 * Releases feed for a newer version. If one is available, download in
 * the background and install on app quit. The user is notified via the
 * updater's 'update-available' / 'update-downloaded' events; we forward
 * those to a UI broadcast so Settings can render them.
 *
 * Manual check is also exposed via IPC (Settings → "Check for updates").
 *
 * Failure modes (network, no release feed, dev mode) are intentionally
 * silent — auto-update should never disrupt the app's primary use.
 */
import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import logger from './logger'
import { IPC } from '@shared/ipc'
import type { UpdaterStatus } from '@shared/types'

let lastStatus: UpdaterStatus = { state: 'idle' }

function broadcast(status: UpdaterStatus): void {
  lastStatus = status
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.UPDATE_STATUS, status)
  }
}

export function getLastUpdaterStatus(): UpdaterStatus {
  return lastStatus
}

export function configureAutoUpdater(): void {
  if (!app.isPackaged) {
    logger.info('autoUpdater: dev mode — skipping (only enabled in packaged builds)')
    return
  }

  // electron-updater logs are noisy by default; pipe through our logger
  autoUpdater.logger = {
    info: (m: unknown) => logger.info('autoUpdater:', m),
    warn: (m: unknown) => logger.warn('autoUpdater:', m),
    error: (m: unknown) => logger.error('autoUpdater:', m),
    debug: () => undefined
  } as unknown as typeof autoUpdater.logger

  // Don't auto-download — let the user trigger via the UI banner. Auto-install
  // on quit is fine since the user has implicitly consented by clicking the
  // banner's "Restart now" action (or just quitting at end of day).
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    broadcast({ state: 'available', version: info.version })
    // Kick off the download immediately — user already sees the banner.
    void autoUpdater.downloadUpdate().catch((err) => {
      logger.error('autoUpdater download failed', err)
      broadcast({ state: 'error', message: (err as Error).message })
    })
  })
  autoUpdater.on('update-not-available', (info) =>
    broadcast({ state: 'not-available', version: info?.version })
  )
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', progress: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    logger.error('autoUpdater error', err)
    broadcast({ state: 'error', message: err.message })
  })

  // First check: 30s after launch, so it doesn't compete with the rest of
  // the bootstrap. Subsequent checks: every 4 hours.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => logger.warn('initial update check failed', err))
  }, 30_000)
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch((err) => logger.warn('periodic update check failed', err))
  }, 4 * 60 * 60 * 1000)
}

/** Manually triggered from Settings — forces a fresh check. */
export async function checkForUpdatesNow(): Promise<UpdaterStatus> {
  if (!app.isPackaged) {
    return { state: 'not-available', message: 'Updates only run in packaged builds' }
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    return { state: 'error', message: (err as Error).message }
  }
  return lastStatus
}

/** Triggered from Settings when the user clicks "Restart and update". */
export function quitAndInstall(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall(false, true)
}
