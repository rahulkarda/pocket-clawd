/**
 * Custom tool definitions exposed to Clawd.
 *
 * ALWAYS_ON: todo CRUD + past-session search (always registered).
 *   add_todo          create a todo
 *   complete_todo     mark a todo done (resolves by id OR fuzzy text match)
 *   delete_todo       remove a todo
 *   list_todos        snapshot current todos
 *   search_past_sessions  grep .spec.md transcripts in the output dir
 *
 * OPT_IN: web access tools (registered only when settings.enableWebSearch is on).
 *   web_search        DuckDuckGo HTML search, parsed via regex
 *   web_fetch         fetch a URL and return text
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

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const FETCH_TIMEOUT_MS = 15_000
const MAX_RESPONSE_CHARS = 8000
const MAX_SNIPPET_CHARS = 300

export const ALWAYS_ON_TOOLS = [
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

export const OPT_IN_TOOLS = [
  {
    name: 'web_search',
    description:
      'Search the web for current information, recent events, or facts past your training cutoff. Returns top 5-10 results with title, URL, and snippet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Trimmed to 500 chars.'
        },
        max_results: {
          type: 'integer',
          description: 'Max results to return. Default 7, max 10.',
          minimum: 1,
          maximum: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description:
      'Fetch a single http(s) URL and return its text content (HTML stripped to plain text). Capped at 8000 chars. Use after web_search when you need the body of a specific result.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Absolute http or https URL to fetch.'
        }
      },
      required: ['url']
    }
  }
]

/** Combined list of every tool name we know how to dispatch. */
export const TOOLS = [...ALWAYS_ON_TOOLS, ...OPT_IN_TOOLS]

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
// web_search / web_fetch — client-side, no API key required
// ────────────────────────────────────────────────────────────

/**
 * Decode DDG's redirect URLs. They look like:
 *   //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F&rut=...
 * or
 *   /l/?uddg=https%3A%2F%2Fexample.com%2F
 * If the input isn't a redirect, return it as-is (after //→https:// fix).
 */
function decodeDdgUrl(raw: string): string {
  let u = raw.trim()
  if (u.startsWith('//')) u = 'https:' + u
  // Match the uddg query param.
  const m = u.match(/[?&]uddg=([^&]+)/)
  if (m) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      return u
    }
  }
  return u
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

interface SearchResult {
  title: string
  url: string
  snippet: string
}

/**
 * Parse the DuckDuckGo HTML SERP. We look for blocks that contain a
 * `.result__a` anchor (title+href) and try to associate a `.result__snippet`
 * sibling. Defensive: any failure returns an empty list rather than throwing.
 */
function parseDdgHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  // Each result is roughly: <a class="result__a" href="…">TITLE</a> … <a class="result__snippet">SNIPPET</a>
  // We pair them by walking the title regex and then searching forward for the
  // next snippet within a reasonable window.
  const titleRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g

  // Pre-collect snippet positions so we can pick the next one after each title.
  const snippets: { index: number; text: string }[] = []
  let sm: RegExpExecArray | null
  while ((sm = snippetRe.exec(html)) !== null) {
    snippets.push({ index: sm.index, text: stripTags(sm[1]) })
  }

  let tm: RegExpExecArray | null
  while ((tm = titleRe.exec(html)) !== null && results.length < maxResults) {
    const rawHref = tm[1]
    const titleHtml = tm[2]
    const url = decodeDdgUrl(decodeHtmlEntities(rawHref))
    const title = stripTags(titleHtml)
    if (!title || !url) continue
    // Find first snippet whose start index is after this title's match.
    const nextSnip = snippets.find((s) => s.index > tm!.index)
    let snippet = nextSnip ? nextSnip.text : ''
    if (snippet.length > MAX_SNIPPET_CHARS) {
      snippet = snippet.slice(0, MAX_SNIPPET_CHARS - 1) + '…'
    }
    results.push({ title, url, snippet })
  }
  return results
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    })
  } finally {
    clearTimeout(timer)
  }
}

async function tool_web_search(input: {
  query: string
  max_results?: number
}): Promise<ToolResult> {
  if (typeof input.query !== 'string' || !input.query.trim()) {
    return { is_error: true, content: 'web_search: query must be a non-empty string' }
  }
  const query = input.query.trim().slice(0, 500)
  const max = Math.max(1, Math.min(10, input.max_results ?? 7))
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`

  let html: string
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
    if (!res.ok) {
      return { is_error: true, content: `web_search: HTTP ${res.status} from DuckDuckGo` }
    }
    html = await res.text()
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'request timed out' : (err as Error).message
    return { is_error: true, content: `web_search: ${msg}` }
  }

  let results: SearchResult[]
  try {
    results = parseDdgHtml(html, max)
  } catch (err) {
    return { is_error: true, content: `web_search: parse failed (${(err as Error).message})` }
  }

  if (results.length === 0) {
    return { content: JSON.stringify({ query, results: [], note: 'No results parsed.' }) }
  }

  // Cap total response size; trim trailing results if needed.
  let payload = JSON.stringify({ query, results }, null, 2)
  if (payload.length > MAX_RESPONSE_CHARS) {
    while (results.length > 1 && payload.length > MAX_RESPONSE_CHARS) {
      results.pop()
      payload = JSON.stringify({ query, results, truncated: true }, null, 2)
    }
    if (payload.length > MAX_RESPONSE_CHARS) {
      payload = payload.slice(0, MAX_RESPONSE_CHARS - 1) + '…'
    }
  }
  return { content: payload }
}

async function tool_web_fetch(input: { url: string }): Promise<ToolResult> {
  if (typeof input.url !== 'string' || !input.url.trim()) {
    return { is_error: true, content: 'web_fetch: url must be a non-empty string' }
  }
  let parsed: URL
  try {
    parsed = new URL(input.url.trim())
  } catch {
    return { is_error: true, content: 'web_fetch: invalid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { is_error: true, content: 'web_fetch: only http(s) URLs are allowed' }
  }

  let body: string
  try {
    const res = await fetchWithTimeout(parsed.toString(), FETCH_TIMEOUT_MS)
    if (!res.ok) {
      return { is_error: true, content: `web_fetch: HTTP ${res.status}` }
    }
    body = await res.text()
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'request timed out' : (err as Error).message
    return { is_error: true, content: `web_fetch: ${msg}` }
  }

  // Strip <script>/<style> blocks first, then tags.
  const cleaned = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  let text = stripTags(cleaned)
  if (text.length > MAX_RESPONSE_CHARS) {
    text = text.slice(0, MAX_RESPONSE_CHARS - 1) + '…'
  }
  return { content: JSON.stringify({ url: parsed.toString(), text }) }
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
      case 'web_search':
        return await tool_web_search(input as { query: string; max_results?: number })
      case 'web_fetch':
        return await tool_web_fetch(input as { url: string })
      default:
        return { is_error: true, content: `Unknown tool: ${name}` }
    }
  } catch (err) {
    logger.error(`tool error: ${name}`, err)
    return { is_error: true, content: `tool error: ${(err as Error).message}` }
  }
}
