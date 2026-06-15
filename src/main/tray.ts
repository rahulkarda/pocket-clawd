/** Tray icon + right-click menu. */
import { Tray, Menu, nativeImage, shell, app } from 'electron'
import path from 'path'
import logger from './logger'
import { getLastSpec } from './specWriter'

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
  tray.setToolTip('Claude')

  tray.on('click', () => actions.onOpenChat())
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Claude', accelerator: 'Cmd+Shift+C', click: () => actions.onOpenChat() },
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
      { type: 'separator' },
      { label: 'Quit Claude', role: 'quit', click: () => actions.onQuit() }
    ])
    if (tray) tray.popUpContextMenu(menu)
  })

  return tray
}

export function getTray(): Tray | null {
  return tray
}
