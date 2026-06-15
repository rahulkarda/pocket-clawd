/**
 * Spec-writer: extracts <SPEC_READY>...</SPEC_READY> block from the assistant's
 * final message, prepends a transcript, and writes to the configured output dir.
 */
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import logger from './logger'
import { settingsStore } from './settings'
import { localDateKey } from '@shared/time'
import type { ChatMessage } from '@shared/types'

const SPEC_RE = /<SPEC_READY>\s*([\s\S]*?)\s*<\/SPEC_READY>/

export function extractSpec(text: string): string | null {
  const m = text.match(SPEC_RE)
  return m ? m[1].trim() : null
}

/** Strip the SPEC_READY block from a streamed assistant message for clean display. */
export function stripSpecBlock(text: string): string {
  return text.replace(SPEC_RE, '').trim()
}

function formatTranscript(history: ChatMessage[]): string {
  const lines: string[] = ['## Raw Transcript', '']
  for (const m of history) {
    const t = new Date(m.ts)
    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    const speaker = m.role === 'user' ? 'You' : 'Claude'
    lines.push(`**${speaker} (${hhmm}):** ${m.content}`, '')
  }
  return lines.join('\n')
}

export async function writeSpec(
  specBlock: string,
  history: ChatMessage[]
): Promise<string> {
  const dir =
    settingsStore().get().outputDir || path.join(app.getPath('documents'), 'claude-sessions')
  await fs.mkdir(dir, { recursive: true })

  const now = new Date()
  const date = localDateKey(now)
  const hhmm = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`
  const fileName = `${date}_${hhmm}.spec.md`
  const filePath = path.join(dir, fileName)

  const transcript = formatTranscript(history)
  const content = `${specBlock}\n\n${transcript}`
  await fs.writeFile(filePath, content, 'utf-8')
  logger.info('Spec written:', filePath)
  return filePath
}

let _lastPath: string | null = null
export function setLastSpec(p: string): void {
  _lastPath = p
}
export function getLastSpec(): string | null {
  return _lastPath
}
