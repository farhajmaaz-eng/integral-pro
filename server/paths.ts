import fs from 'node:fs'
import path from 'node:path'
import { HttpError } from './http.js'
import { IGNORED_DIRS, IGNORED_FILES, WORKSPACE } from './config.js'

/** Resolve a workspace-relative path and refuse anything that escapes the root. */
export function resolvePath(relative = ''): string {
  const cleaned = String(relative || '').replace(/^[/\\]+/, '')
  const abs = path.resolve(WORKSPACE, cleaned)
  const rel = path.relative(WORKSPACE, abs)
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new HttpError(400, 'Path escapes the workspace')
  }
  assertNoSymlinkEscape(abs)
  return abs
}

/**
 * Reject every symlink component, including dangling links. Following a link
 * would let a write land outside the workspace even when its final target does
 * not exist yet.
 */
function assertNoSymlinkEscape(abs: string) {
  const rel = path.relative(WORKSPACE, abs)
  const parts = rel.split(path.sep).filter(Boolean)
  let current = WORKSPACE
  for (const part of parts) {
    current = path.join(current, part)
    let stat: fs.Stats
    try {
      stat = fs.lstatSync(current)
    } catch {
      return
    }
    if (stat.isSymbolicLink()) {
      throw new HttpError(400, 'Symlinks are not allowed inside the workspace')
    }
  }
}

export function relativePath(abs: string): string {
  const rel = path.relative(WORKSPACE, abs)
  return rel === '' ? '.' : rel.split(path.sep).join('/')
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

export function assertNotIgnored(relative: string) {
  const parts = relative.split(/[/\\]/)
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) throw new HttpError(400, `Path is inside ignored directory: ${part}`)
  }
}

export function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000)
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true
  }
  return false
}

export function walkFiles(
  dir: string,
  opts: { maxFiles?: number; maxBytes?: number } = {},
): { files: Array<{ path: string; size: number }>; truncated: boolean } {
  const maxFiles = opts.maxFiles ?? 5000
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024
  const files: Array<{ path: string; size: number }> = []
  let truncated = false

  const visit = (current: string) => {
    if (files.length >= maxFiles) {
      truncated = true
      return
    }
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true
        return
      }
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        visit(path.join(current, entry.name))
      } else if (entry.isFile()) {
        if (IGNORED_FILES.has(entry.name)) continue
        try {
          const stat = fs.statSync(path.join(current, entry.name))
          if (stat.size > maxBytes) continue
          files.push({ path: path.join(current, entry.name), size: stat.size })
        } catch {
          /* skip unreadable */
        }
      }
    }
  }

  visit(dir)
  return { files, truncated }
}
