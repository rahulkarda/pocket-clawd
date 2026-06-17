/** Right-click context menu for the floating avatar. */
import { BrowserWindow, Menu } from 'electron'
import { settingsStore } from './settings'
import { resizeAvatar, setShowOnAllSpaces } from './avatarWindow'
import * as funEngine from './funEngine'
import * as pomodoro from './pomodoro'
import * as petting from './pettingEngine'
import * as snackEngine from './snackEngine'
import { IPC } from '@shared/ipc'

export interface AvatarMenuActions {
  onOpenChat: () => void
  onOpenTodos: () => void
  onOpenSettings: () => void
  onOpenCompanion: () => void
  onOpenPomodoro: () => void
  onQuit: () => void
}

export function showAvatarContextMenu(win: BrowserWindow, actions: AvatarMenuActions): void {
  const settings = settingsStore().get()

  const menu = Menu.buildFromTemplate([
    { label: 'Open Chat', accelerator: 'Cmd+Shift+C', click: () => actions.onOpenChat() },
    { type: 'separator' },
    { label: 'My Todos', click: () => actions.onOpenTodos() },
    {
      label: pomodoro.isActive() ? `Pomodoro · ${pomodoro.statusLabel()}` : 'Pomodoro…',
      click: () => actions.onOpenPomodoro()
    },
    { type: 'separator' },
    {
      label: 'Show on All Spaces',
      type: 'checkbox',
      checked: settings.showOnAllSpaces,
      click: (item) => setShowOnAllSpaces(item.checked)
    },
    { type: 'separator' },
    {
      label: 'Avatar Size',
      submenu: [
        { label: 'Small (48px)', type: 'radio', checked: settings.avatarSize === 48, click: () => resizeAvatar(48) },
        { label: 'Medium (64px)', type: 'radio', checked: settings.avatarSize === 64, click: () => resizeAvatar(64) },
        { label: 'Large (96px)', type: 'radio', checked: settings.avatarSize === 96, click: () => resizeAvatar(96) }
      ]
    },
    { type: 'separator' },
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
      label: 'Tickle Clawd 🤭',
      click: () => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send(IPC.AVATAR_TICKLE_EVENT, { ts: Date.now() })
        }
        void import('./sound').then((m) => m.playSound('pet')).catch(() => undefined)
        void import('./whisperEngine')
          .then((m) => m.surfaceWhisper('tickle tickle!'))
          .catch(() => undefined)
      }
    },
    {
      label: 'Costume',
      submenu: (['none', 'santa', 'shades', 'party', 'witch'] as const).map((c) => ({
        label: c === 'none' ? 'None' : c.charAt(0).toUpperCase() + c.slice(1),
        type: 'radio' as const,
        checked: settings.costume === c,
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
    {
      label: settings.mute ? '🔊 Sounds on' : '🔇 Mute sounds',
      click: () => {
        settingsStore().update({ mute: !settings.mute })
      }
    },
    { type: 'separator' },
    { label: 'Settings…', click: () => actions.onOpenSettings() },
    { label: 'What Clawd can do…', click: () => actions.onOpenCompanion() },
    { type: 'separator' },
    { label: 'Quit Clawd', role: 'quit', click: () => actions.onQuit() }
  ])

  menu.popup({ window: win })
}
