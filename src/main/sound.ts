/**
 * Sound broadcaster — main-side helper that asks the avatar renderer to
 * play a synthesized cue. Single line of indirection so feature engines
 * (pet, snack, pomodoro, fun, etc) don't each need to know about
 * BrowserWindow plumbing.
 *
 * The renderer side (avatar.tsx + soundEngine.ts) gates on the user's
 * mute / volume settings; this just fires-and-forgets the broadcast.
 */
import { BrowserWindow } from 'electron'
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

export function playSound(name: SoundName): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.AVATAR_PLAY_SOUND, name)
  }
}
