/**
 * Sound broadcaster — main-side helper that asks the avatar renderer to
 * play a synthesized cue. Single line of indirection so feature engines
 * (pet, snack, pomodoro, fun, etc) don't each need to know about
 * BrowserWindow plumbing.
 *
 * Targets the avatar window ONLY. Other renderers (chat, todo, settings,
 * companion, pomodoro) host the same preload and would receive these
 * messages via getAllWindows(); we keep the channel narrowed to the
 * avatar so nothing else can observe playback events. (Per Phase 1
 * audit: principle of least channel.)
 */
import { getAvatarWindow } from './avatarWindow'
import { IPC } from '@shared/ipc'

export type SoundName =
  | 'pet'
  | 'snack'
  | 'pomo-end'
  | 'pomo-break'
  | 'achievement'
  | 'wall-bounce'
  | 'rave'
  | 'wake'
  | 'dance'

export function playSound(name: SoundName): void {
  const win = getAvatarWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send(IPC.AVATAR_PLAY_SOUND, name)
}

