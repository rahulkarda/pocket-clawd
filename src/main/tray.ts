/** Tray icon + right-click menu. */
import { Tray, Menu, nativeImage, shell, app } from 'electron'
import path from 'path'
import logger from './logger'
import { getLastSpec } from './specWriter'
import * as funEngine from './funEngine'
import * as pomodoro from './pomodoro'
import * as petting from './pettingEngine'
import * as snackEngine from './snackEngine'
import { settingsStore } from './settings'

let tray: Tray | null = null

function iconPath(): string {
  // In dev, assets live in the project root; in prod, electron-builder places
  // them under process.resourcesPath/assets.
  const dev = path.join(__dirname, '../../assets/tray-iconTemplate.png')
  const prod = path.join(process.resourcesPath, 'assets/tray-iconTemplate.png')
  return app.isPackaged ? prod : dev
}

interface TrayActions {
  onOpenChat: () => void
  onOpenSettings: () => void
  onOpenCompanion: () => void
  onOpenPomodoro: () => void
  onQuit: () => void
}

export function createTray(actions: TrayActions): Tray {
  const img = nativeImage.createFromPath(iconPath())
  // Falls back gracefully if PNG missing — empty image still shows in menubar.
  if (img.isEmpty()) {
    logger.warn('Tray icon missing or empty:', iconPath(), '— run `npm run build:icons`.')
  } else {
    img.setTemplateImage(true)
  }

  tray = new Tray(img)
  tray.setToolTip('Clawd')

  tray.on('click', () => actions.onOpenChat())
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Clawd', accelerator: 'Cmd+Shift+C', click: () => actions.onOpenChat() },
      { type: 'separator' },
      {
        label: 'View last session',
        enabled: !!getLastSpec(),
        click: () => {
          const p = getLastSpec()
          if (p) void shell.openPath(p)
        }
      },
      { label: 'Settings…', click: () => actions.onOpenSettings() },
      { label: 'What Clawd can do…', click: () => actions.onOpenCompanion() },
      { type: 'separator' },
      {
        label: settingsStore().get().mute ? '🔊 Sounds on' : '🔇 Mute sounds',
        click: () => {
          const cur = settingsStore().get().mute
          settingsStore().update({ mute: !cur })
        }
      },
      { type: 'separator' },
      {
        label: pomodoro.isActive() ? `Pomodoro · ${pomodoro.statusLabel()}` : 'Pomodoro…',
        click: () => actions.onOpenPomodoro()
      },
      {
        label: `Pet Clawd${petting.getStats().count > 0 ? ` (${petting.getStats().count})` : ''}`,
        click: () => {
          petting.registerPet()
        }
      },
      {
        label: 'Give Clawd a snack 🥬',
        click: () => {
          snackEngine.giveSnack()
        }
      },
      {
        label: 'Costume',
        submenu: (['none', 'santa', 'shades', 'party', 'witch'] as const).map((c) => ({
          label: c === 'none' ? 'None' : c.charAt(0).toUpperCase() + c.slice(1),
          type: 'radio' as const,
          checked: settingsStore().get().costume === c,
          click: () => {
            settingsStore().update({ costume: c })
          }
        }))
      },
      {
        label: funEngine.isActive() ? 'Stop fun mode' : 'Fun mode (Clawd plays!)',
        click: () => funEngine.toggle()
      },
      {
        label: 'Play fetch (60s) 🎾',
        click: () => funEngine.playFetch(60_000)
      },
      {
        label: 'Play chess ♟',
        click: () => {
          void import('./secondaryWindows').then((m) => m.createChessWindow())
        }
      },
      { type: 'separator' },
      { label: 'Quit Clawd', role: 'quit', click: () => actions.onQuit() }
    ])
    if (tray) tray.popUpContextMenu(menu)
  })

  return tray
}

export function getTray(): Tray | null {
  return tray
}
