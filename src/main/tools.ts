/**
 * Custom tool definitions exposed to Clawd.
 *
 * Five tools — todo CRUD + past-session search:
 *   add_todo          create a todo
 *   complete_todo     mark a todo done (resolves by id OR fuzzy text match)
 *   delete_todo       remove a todo
 *   list_todos        snapshot current todos
 *   search_past_sessions  grep .spec.md transcripts in the output dir
 *
 * Each tool has a hard input-validation step before doing anything,
 * since Claude can in principle pass anything (typed, but not enforced
 * server-side beyond JSON-schema basics).
 */
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import logger from './logger'
import { settingsStore } from './settings'
import {
  addTodo,
  deleteTodo,
  getDaily,
  toggleTodo
} from './todoStore'
import type { Todo } from '@shared/types'

// ────────────────────────────────────────────────────────────
// Tool input schemas (Anthropic JSON-schema dialect)
// ────────────────────────────────────────────────────────────

export const TOOLS = [
  {
    name: 'add_todo',
    description:
      "Add a new todo to the user's daily list. Use this when the user mentions a task, intention, or commitment they want to track. Don't add todos for things they've already done — those go in memory or just acknowledge them.",
    input_schema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: "The todo text. Keep it concise and action-oriented (e.g. 'Finish eval harness', not 'I should probably try to finish the eval harness today')."
        }
      },
      required: ['text']
    }
  },
  {
    name: 'complete_todo',
    description:
      "Mark a todo as done. You can pass either the exact todo id (preferred — get from list_todos) OR a substring of the todo text for fuzzy match. Use when the user says 'I finished X', 'X is done', 'check off X', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        id_or_text: {
          type: 'string',
          description: "Either the todo's `id` (from list_todos) or a substring of its text."
        }
      },
      required: ['id_or_text']
    }
  },
  {
    name: 'delete_todo',
    description:
      "Remove a todo from the list entirely. Different from complete_todo — use this when the user says 'cancel X', 'never mind X', 'remove X'. For things they actually finished, use complete_todo instead.",
    input_schema: {
      type: 'object' as const,
      properties: {
        id_or_text: {
          type: 'string',
          description: "Either the todo's `id` or a substring of its text."
        }
      },
      required: ['id_or_text']
    }
  },
  {
    name: 'list_todos',
    description:
      "Get the current daily todo list (today's todos, both done and pending). Call this when the user asks about their list, or when you need to know what's on it before adding/completing/deleting. Returns id, text, done, createdAt for each.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'search_past_sessions',
    description:
      "Search the user's previous chat session transcripts (.spec.md files) for a keyword or phrase. Use when the user references 'last time', 'we discussed', 'I mentioned earlier this week', etc. Returns up to `limit` matches with date, time, file path, and a snippet around the match.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Substring to search for (case-insensitive).'
        },
        limit: {
          type: 'integer',
          description: 'Max results to return. Default 5, max 20.',
          minimum: 1,
          maximum: 20
        }
      },
      required: ['query']
    }
  }
]

// ────────────────────────────────────────────────────────────
// Tool implementations
// ────────────────────────────────────────────────────────────

interface ToolResult {
  is_error?: boolean
  content: string
}

function findTodo(idOrText: string): Todo | null {
  const todos = getDaily().todos
  const exact = todos.find((t) => t.id === idOrText)
  if (exact) return exact
  const lower = idOrText.toLowerCase()
  const fuzzy = todos.find((t) => t.text.toLowerCase().includes(lower))
  return fuzzy ?? null
}

async function tool_add_todo(input: { text: string }): Promise<ToolResult> {
  if (typeof input.text !== 'string' || !input.text.trim()) {
    return { is_error: true, content: 'add_todo: text must be a non-empty string' }
  }
  if (input.text.length > 500) {
    return { is_error: true, content: 'add_todo: text exceeds 500 chars' }
  }
  const todo = addTodo(input.text)
  return { content: `Added todo: ${todo.id} — "${todo.text}"` }
}

async function tool_complete_todo(input: { id_or_text: string }): Promise<ToolResult> {
  if (typeof input.id_or_text !== 'string' || !input.id_or_text.trim()) {
    return { is_error: true, content: 'complete_todo: id_or_text must be a non-empty string' }
  }
  const target = findTodo(input.id_or_text)
  if (!target) {
    return { is_error: true, content: `complete_todo: no todo matched "${input.id_or_text}"` }
  }
  if (target.done) {
    return { content: `"${target.text}" was already done.` }
  }
  toggleTodo(target.id)
  return { content: `Completed: "${target.text}"` }
}

async function tool_delete_todo(input: { id_or_text: string }): Promise<ToolResult> {
  if (typeof input.id_or_text !== 'string' || !input.id_or_text.trim()) {
    return { is_error: true, content: 'delete_todo: id_or_text must be a non-empty string' }
  }
  const target = findTodo(input.id_or_text)
  if (!target) {
    return { is_error: true, content: `delete_todo: no todo matched "${input.id_or_text}"` }
  }
  deleteTodo(target.id)
  return { content: `Removed: "${target.text}"` }
}

async function tool_list_todos(): Promise<ToolResult> {
  const d = getDaily()
  if (d.todos.length === 0) {
    return { content: 'No todos for today yet.' }
  }
  // Compact JSON for Claude — easier than markdown to reason about
  const summary = d.todos.map((t) => ({
    id: t.id,
    text: t.text,
    done: t.done
  }))
  return { content: JSON.stringify({ date: d.date, todos: summary }, null, 2) }
}

async function tool_search_past_sessions(input: {
  query: string
  limit?: number
}): Promise<ToolResult> {
  if (typeof input.query !== 'string' || !input.query.trim()) {
    return { is_error: true, content: 'search_past_sessions: query must be a non-empty string' }
  }
  const limit = Math.max(1, Math.min(20, input.limit ?? 5))
  const dir =
    settingsStore().get().outputDir || path.join(app.getPath('documents'), 'claude-sessions')

  let entries: string[]
  try {
    entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.spec.md'))
  } catch (err) {
    return { content: `No past sessions found (${(err as Error).message}).` }
  }

  if (entries.length === 0) {
    return { content: 'No past sessions to search.' }
  }

  const q = input.query.toLowerCase()
  type Hit = { file: string; date: string; time: string; snippet: string }
  const hits: Hit[] = []
  for (const f of entries.sort().reverse()) {
    if (hits.length >= limit) break
    let body: string
    try {
      body = await fs.readFile(path.join(dir, f), 'utf-8')
    } catch {
      continue
    }
    const idx = body.toLowerCase().indexOf(q)
    if (idx === -1) continue
    const start = Math.max(0, idx - 80)
    const end = Math.min(body.length, idx + q.length + 80)
    const snippet = (start > 0 ? '…' : '') + body.slice(start, end).replace(/\s+/g, ' ').trim() + (end < body.length ? '…' : '')
    // Filename pattern: YYYY-MM-DD_HH-MM.spec.md
    const m = f.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})\.spec\.md$/)
    hits.push({
      file: f,
      date: m?.[1] ?? '',
      time: m?.[2]?.replace('-', ':') ?? '',
      snippet
    })
  }

  if (hits.length === 0) {
    return { content: `No matches for "${input.query}" in ${entries.length} past session(s).` }
  }
  return { content: JSON.stringify({ matches: hits, total_files_searched: entries.length }, null, 2) }
}

// ────────────────────────────────────────────────────────────
// Dispatch
// ────────────────────────────────────────────────────────────

export async function runTool(name: string, input: unknown): Promise<ToolResult> {
  logger.info(`tool_use: ${name}`, JSON.stringify(input))
  try {
    switch (name) {
      case 'add_todo':
        return await tool_add_todo(input as { text: string })
      case 'complete_todo':
        return await tool_complete_todo(input as { id_or_text: string })
      case 'delete_todo':
        return await tool_delete_todo(input as { id_or_text: string })
      case 'list_todos':
        return await tool_list_todos()
      case 'search_past_sessions':
        return await tool_search_past_sessions(input as { query: string; limit?: number })
      default:
        return { is_error: true, content: `Unknown tool: ${name}` }
    }
  } catch (err) {
    logger.error(`tool error: ${name}`, err)
    return { is_error: true, content: `tool error: ${(err as Error).message}` }
  }
}
