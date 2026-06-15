/**
 * Persistent memory backend for Anthropic's memory_20250818 tool.
 *
 * Claude calls this tool with commands like `view`, `create`, `str_replace`,
 * `insert`, `delete`, `rename` operating on a virtual `/memories/` root.
 * We map that root to ~/Documents/clawd-memory/ on the real filesystem and
 * implement each command.
 *
 * Security:
 *   - All paths are resolved RELATIVE to /memories/ and then joined onto
 *     MEMORY_ROOT. Any attempt to traverse outside (../, absolute paths,
 *     symlinks pointing out) is rejected.
 *   - Per-file size cap of 100 KB.
 *   - Per-store cap of 10 MB total — soft warning above that.
 */
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import logger from './logger'

const MAX_FILE_BYTES = 100 * 1024 // 100 KB per file
const MAX_TOTAL_BYTES = 10 * 1024 * 1024 // 10 MB across all memory files

/** Root for Clawd's persistent memory. Resolved at use time so user changes
 *  to home dir / network mount take effect on next call. */
function memoryRoot(): string {
  return path.join(os.homedir(), 'Documents', 'clawd-memory')
}

/**
 * Resolve a tool-supplied path (always starts with `/memories`) to an
 * absolute filesystem path under the memory root. Throws on traversal.
 *
 * This is the LEXICAL guard — it catches `../`, absolute paths, etc. It
 * does NOT detect symlink escapes; for that, callers must additionally
 * pass the resolved path through `assertNoSymlinkEscape` once the
 * deepest existing parent is known.
 */
function resolveSafe(toolPath: string): string {
  if (typeof toolPath !== 'string' || !toolPath.startsWith('/memories')) {
    throw new Error(`memory: path must start with /memories — got ${JSON.stringify(toolPath)}`)
  }
  // Strip the /memories prefix; what remains is relative to the root.
  const rel = toolPath.replace(/^\/memories\/?/, '')
  const root = memoryRoot()
  // Normalize and check we stay under root. Defends against `../`, absolute
  // paths, and other lexical escapes.
  const abs = path.resolve(root, rel)
  const rootResolved = path.resolve(root)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    throw new Error(`memory: path traversal blocked: ${toolPath}`)
  }
  return abs
}

/**
 * Symlink-escape guard. Walks from `abs` up the tree until it finds a
 * path component that exists on disk, realpath()s that, then checks the
 * realpath is still within the realpath of the memory root. This catches
 * symlinks at any layer (root → intermediate → leaf), without breaking
 * for not-yet-existing create/rename targets.
 */
async function assertNoSymlinkEscape(abs: string): Promise<void> {
  const root = memoryRoot()
  const rootReal = await fs.realpath(root)
  // Find the deepest existing ancestor of `abs` (including `abs` itself).
  let probe = abs
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const real = await fs.realpath(probe)
      // Compare realpath of the existing ancestor against realpath of root.
      if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
        throw new Error('memory: symlink escape blocked')
      }
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        const parent = path.dirname(probe)
        if (parent === probe) {
          // Climbed to filesystem root without finding anything — refuse.
          throw new Error('memory: cannot resolve any ancestor of target')
        }
        probe = parent
        continue
      }
      throw err
    }
  }
}

async function ensureRoot(): Promise<void> {
  await fs.mkdir(memoryRoot(), { recursive: true })
}

async function getTotalSize(): Promise<number> {
  let total = 0
  async function walk(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) {
        try {
          const st = await fs.stat(p)
          total += st.size
        } catch {
          // ignore
        }
      }
    }
  }
  await walk(memoryRoot())
  return total
}

/**
 * Anthropic's memory tool input shape (from MemoryTool20250818Command):
 *   view:        { command: "view", path: "/memories/foo.md", view_range?: [a, b] }
 *   create:      { command: "create", path: "/memories/foo.md", file_text: "..." }
 *   str_replace: { command: "str_replace", path: "...", old_str, new_str }
 *   insert:      { command: "insert", path: "...", insert_line, insert_text }
 *   delete:      { command: "delete", path: "..." }
 *   rename:      { command: "rename", old_path, new_path }
 */
interface MemoryInput {
  command: string
  path?: string
  file_text?: string
  view_range?: [number, number]
  old_str?: string
  new_str?: string
  insert_line?: number
  insert_text?: string
  old_path?: string
  new_path?: string
}

interface MemoryResult {
  content: string
  is_error?: boolean
}

/** Combined lexical + symlink guard. Use this everywhere instead of bare resolveSafe. */
async function safePath(toolPath: string): Promise<string> {
  const abs = resolveSafe(toolPath)
  await assertNoSymlinkEscape(abs)
  return abs
}

async function cmd_view(input: MemoryInput): Promise<MemoryResult> {
  if (!input.path) return { is_error: true, content: 'view: path required' }
  const abs = await safePath(input.path)
  let stat: import('fs').Stats
  try {
    stat = await fs.stat(abs)
  } catch {
    return { is_error: true, content: `view: not found: ${input.path}` }
  }

  if (stat.isDirectory()) {
    const entries = await fs.readdir(abs, { withFileTypes: true })
    const lines: string[] = []
    for (const e of entries) {
      lines.push(e.isDirectory() ? `${e.name}/` : e.name)
    }
    return { content: lines.length ? lines.join('\n') : '(empty directory)' }
  }

  // File: read text
  const text = await fs.readFile(abs, 'utf-8')
  if (input.view_range && Array.isArray(input.view_range)) {
    const [a, b] = input.view_range
    const lines = text.split('\n')
    const start = Math.max(0, (a ?? 1) - 1)
    const end = b === -1 || b == null ? lines.length : Math.min(lines.length, b)
    return { content: lines.slice(start, end).join('\n') }
  }
  return { content: text }
}

async function cmd_create(input: MemoryInput): Promise<MemoryResult> {
  if (!input.path) return { is_error: true, content: 'create: path required' }
  if (input.file_text == null) return { is_error: true, content: 'create: file_text required' }

  const abs = await safePath(input.path)
  // Refuse to overwrite an existing file. The model should str_replace
  // or insert into an existing memory, not silently clobber it.
  try {
    await fs.access(abs)
    return {
      is_error: true,
      content: `create: ${input.path} already exists — use str_replace or insert to modify, or delete first`
    }
  } catch {
    // ENOENT → ok to create
  }

  const bytes = Buffer.byteLength(input.file_text, 'utf-8')
  if (bytes > MAX_FILE_BYTES) {
    return {
      is_error: true,
      content: `create: file too large (${bytes} > ${MAX_FILE_BYTES} bytes)`
    }
  }
  const total = await getTotalSize()
  if (total + bytes > MAX_TOTAL_BYTES) {
    return {
      is_error: true,
      content: `create: total memory size would exceed ${MAX_TOTAL_BYTES} bytes`
    }
  }

  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, input.file_text, 'utf-8')
  return { content: `Created ${input.path} (${bytes} bytes)` }
}

async function cmd_str_replace(input: MemoryInput): Promise<MemoryResult> {
  if (!input.path) return { is_error: true, content: 'str_replace: path required' }
  if (input.old_str == null || input.new_str == null) {
    return { is_error: true, content: 'str_replace: old_str and new_str required' }
  }
  const abs = await safePath(input.path)
  let body: string
  try {
    body = await fs.readFile(abs, 'utf-8')
  } catch {
    return { is_error: true, content: `str_replace: not found: ${input.path}` }
  }
  const idx = body.indexOf(input.old_str)
  if (idx === -1) {
    return { is_error: true, content: `str_replace: old_str not found in ${input.path}` }
  }
  // Match exactly once — if multiple, refuse (so Claude provides more context).
  if (body.indexOf(input.old_str, idx + 1) !== -1) {
    return {
      is_error: true,
      content: `str_replace: old_str matches multiple times in ${input.path} — provide more surrounding context to disambiguate`
    }
  }
  const next = body.slice(0, idx) + input.new_str + body.slice(idx + input.old_str.length)
  if (Buffer.byteLength(next, 'utf-8') > MAX_FILE_BYTES) {
    return { is_error: true, content: `str_replace: result exceeds ${MAX_FILE_BYTES} bytes` }
  }
  await fs.writeFile(abs, next, 'utf-8')
  return { content: `Updated ${input.path}` }
}

async function cmd_insert(input: MemoryInput): Promise<MemoryResult> {
  if (!input.path) return { is_error: true, content: 'insert: path required' }
  if (input.insert_line == null || input.insert_text == null) {
    return { is_error: true, content: 'insert: insert_line and insert_text required' }
  }
  const abs = await safePath(input.path)
  let body: string
  try {
    body = await fs.readFile(abs, 'utf-8')
  } catch {
    return { is_error: true, content: `insert: not found: ${input.path}` }
  }
  const lines = body.split('\n')
  const at = Math.max(0, Math.min(lines.length, input.insert_line))
  const insertText = input.insert_text.endsWith('\n')
    ? input.insert_text.slice(0, -1)
    : input.insert_text
  lines.splice(at, 0, insertText)
  const next = lines.join('\n')
  if (Buffer.byteLength(next, 'utf-8') > MAX_FILE_BYTES) {
    return { is_error: true, content: `insert: result exceeds ${MAX_FILE_BYTES} bytes` }
  }
  await fs.writeFile(abs, next, 'utf-8')
  return { content: `Inserted at line ${at} of ${input.path}` }
}

async function cmd_delete(input: MemoryInput): Promise<MemoryResult> {
  if (!input.path) return { is_error: true, content: 'delete: path required' }
  const abs = await safePath(input.path)
  try {
    const stat = await fs.stat(abs)
    if (stat.isDirectory()) {
      await fs.rm(abs, { recursive: true })
      return { content: `Deleted directory ${input.path}` }
    }
    await fs.unlink(abs)
    return { content: `Deleted ${input.path}` }
  } catch {
    return { is_error: true, content: `delete: not found: ${input.path}` }
  }
}

async function cmd_rename(input: MemoryInput): Promise<MemoryResult> {
  if (!input.old_path || !input.new_path) {
    return { is_error: true, content: 'rename: old_path and new_path required' }
  }
  const oldAbs = await safePath(input.old_path)
  const newAbs = await safePath(input.new_path)
  // POSIX `rename` silently overwrites the destination — refuse instead.
  // The model should `delete` the destination first if that's truly intended.
  try {
    await fs.access(newAbs)
    return {
      is_error: true,
      content: `rename: destination ${input.new_path} already exists — delete it first`
    }
  } catch {
    // ENOENT → ok to rename
  }
  try {
    await fs.mkdir(path.dirname(newAbs), { recursive: true })
    await fs.rename(oldAbs, newAbs)
    return { content: `Renamed ${input.old_path} → ${input.new_path}` }
  } catch (err) {
    return { is_error: true, content: `rename: ${(err as Error).message}` }
  }
}

/** Top-level dispatcher — called from runTool when name === 'memory'. */
export async function runMemory(input: unknown): Promise<MemoryResult> {
  if (!input || typeof input !== 'object') {
    return { is_error: true, content: 'memory: input must be an object' }
  }
  const i = input as MemoryInput
  await ensureRoot()
  logger.info(`memory: ${i.command} ${i.path ?? i.old_path ?? ''}`)
  try {
    switch (i.command) {
      case 'view':
        return await cmd_view(i)
      case 'create':
        return await cmd_create(i)
      case 'str_replace':
        return await cmd_str_replace(i)
      case 'insert':
        return await cmd_insert(i)
      case 'delete':
        return await cmd_delete(i)
      case 'rename':
        return await cmd_rename(i)
      default:
        return { is_error: true, content: `memory: unknown command "${i.command}"` }
    }
  } catch (err) {
    logger.error('memory tool error', err)
    return { is_error: true, content: `memory: ${(err as Error).message}` }
  }
}

/** Wipe all of Clawd's memory. Used by the Settings "Clear memory" button. */
export async function clearMemory(): Promise<void> {
  const root = memoryRoot()
  try {
    await fs.rm(root, { recursive: true, force: true })
    await fs.mkdir(root, { recursive: true })
    logger.info('memory: cleared')
  } catch (err) {
    logger.error('memory clear failed', err)
    throw err
  }
}

/** Filesystem path of the memory root, exposed for IPC + Settings UI. */
export function getMemoryRoot(): string {
  return memoryRoot()
}
