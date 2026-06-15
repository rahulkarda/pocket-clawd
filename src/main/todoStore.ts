/**
 * Daily todo store. Persisted in electron-store under key `daily-todos`.
 * - Auto-resets at midnight; if there are incomplete todos, surfaces them via
 *   `pendingCarryForward` so the renderer can ask the user what to keep.
 * - Archives completed todos as JSON + markdown summary on rollover.
 */
import Store from 'electron-store'
import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { nanoid } from 'nanoid'
import logger from './logger'
import { localDateKey } from '@shared/time'
import type { DailyTodoStore, Todo } from '@shared/types'

interface PersistShape {
  'daily-todos': DailyTodoStore
}

let store: Store<PersistShape> | null = null
let listeners: Array<() => void> = []

function getStore(): Store<PersistShape> {
  if (!store) {
    store = new Store<PersistShape>({
      name: 'todos',
      defaults: {
        'daily-todos': { date: localDateKey(), todos: [] }
      }
    })
  }
  return store
}

function emit(): void {
  for (const fn of listeners) fn()
}

export function onChange(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function getDaily(): DailyTodoStore {
  return getStore().get('daily-todos')
}

function setDaily(d: DailyTodoStore): void {
  getStore().set('daily-todos', d)
  emit()
}

export function addTodo(text: string): Todo {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Todo text cannot be empty')
  if (trimmed.length > 500) throw new Error('Todo text too long (max 500 chars)')
  const todo: Todo = {
    id: nanoid(),
    text: trimmed,
    done: false,
    createdAt: Date.now()
  }
  const d = getDaily()
  setDaily({ ...d, todos: [...d.todos, todo] })
  return todo
}

export function toggleTodo(id: string): void {
  const d = getDaily()
  setDaily({
    ...d,
    todos: d.todos.map((t) =>
      t.id === id
        ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined }
        : t
    )
  })
}

export function deleteTodo(id: string): void {
  const d = getDaily()
  setDaily({ ...d, todos: d.todos.filter((t) => t.id !== id) })
}

export function completionStats(): { done: number; total: number; ratio: number } {
  const d = getDaily()
  const done = d.todos.filter((t) => t.done).length
  const total = d.todos.length
  return { done, total, ratio: total === 0 ? 0 : done / total }
}

/**
 * Archive completed todos for the given date as JSON + markdown.
 * Failures are logged but never throw — archive failure should not block the rollover.
 */
async function archiveDay(d: DailyTodoStore): Promise<void> {
  if (d.todos.length === 0) return
  try {
    const settingsModule = await import('./settings')
    const dir = settingsModule.settingsStore().get().outputDir || path.join(app.getPath('documents'), 'claude-sessions')
    await fs.mkdir(dir, { recursive: true })

    const completed = d.todos.filter((t) => t.done)
    if (completed.length === 0) return

    const jsonPath = path.join(dir, `todos-${d.date}.json`)
    await fs.writeFile(jsonPath, JSON.stringify({ date: d.date, completed }, null, 2), 'utf-8')

    const md = [
      `# Todos completed — ${d.date}`,
      '',
      ...completed.map((t) => `- [x] ${t.text}`),
      ''
    ].join('\n')
    const mdPath = path.join(dir, `todos-${d.date}.md`)
    await fs.writeFile(mdPath, md, 'utf-8')
    logger.info('Archived todos for', d.date)
  } catch (err) {
    logger.error('Todo archive failed', err)
  }
}

/**
 * If the stored date is yesterday or older:
 * - archive the day
 * - if there are incomplete todos, stash them in pendingCarryForward and clear the active list
 *   (the renderer will ask "carry these forward?" on the first chat session)
 * - else simply reset
 */
export async function maybeRollover(): Promise<void> {
  const today = localDateKey()
  const d = getDaily()
  if (d.date === today) return

  await archiveDay(d)

  const incomplete = d.todos.filter((t) => !t.done)
  setDaily({
    date: today,
    todos: [],
    pendingCarryForward: incomplete.length ? incomplete : undefined
  })
  logger.info('Day rolled over to', today, 'pending:', incomplete.length)
}

export function pendingCarryForward(): Todo[] {
  return getDaily().pendingCarryForward ?? []
}

/** Resolve carry-forward: keep the listed IDs (becomes today's todos), drop the rest.
 *  Always clears `pendingCarryForward` so the prompt only fires once per rollover. */
export function resolveCarryForward(keepIds: string[]): void {
  const d = getDaily()
  const pending = d.pendingCarryForward ?? []
  const kept: Todo[] = pending
    .filter((t) => keepIds.includes(t.id))
    .map((t) => ({ ...t, id: nanoid(), done: false, createdAt: Date.now(), completedAt: undefined }))
  setDaily({
    date: d.date,
    todos: [...d.todos, ...kept],
    pendingCarryForward: undefined
  })
}

/** Schedule midnight rollover checks every minute. Idempotent. */
let rolloverTimer: NodeJS.Timeout | null = null
export function startRolloverTicker(): void {
  if (rolloverTimer) return
  void maybeRollover()
  rolloverTimer = setInterval(() => {
    void maybeRollover()
  }, 60_000)
}
