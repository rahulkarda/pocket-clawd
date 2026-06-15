/** Right-click context menu for the floating avatar. */
import { Menu, type BrowserWindow } from 'electron'
import { settingsStore } from './settings'
import { resizeAvatar, setShowOnAllSpaces } from './avatarWindow'

export interface AvatarMenuActions {
  onOpenChat: () => void
  onOpenTodos: () => void
  onOpenSettings: () => void
  onQuit: () => void
}

export function showAvatarContextMenu(win: BrowserWindow, actions: AvatarMenuActions): void {
  const settings = settingsStore().get()

  const menu = Menu.buildFromTemplate([
    { label: 'Open Chat', accelerator: 'Cmd+Shift+C', click: () => actions.onOpenChat() },
    { type: 'separator' },
    { label: 'My Todos', click: () => actions.onOpenTodos() },
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
    { label: 'Settings…', click: () => actions.onOpenSettings() },
    { type: 'separator' },
    { label: 'Quit Claude', role: 'quit', click: () => actions.onQuit() }
  ])

  menu.popup({ window: win })
}
