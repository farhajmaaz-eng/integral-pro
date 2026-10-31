import fs from 'node:fs'
import path from 'node:path'
import { HttpError } from './http.js'
import { IGNORED_DIRS, WORKSPACE } from './config.js'

const REAL_ROOT = fs.realpathSync(WORKSPACE)

/** Resolve a workspace-relative path and refuse anything that escapes the root. */
export function resolvePath(relative = ''): string {
  const cleaned = String(relative || '').replace(/^[/\\]+/, '')
  const abs = path.resolve(WORKSPACE, cleaned)
  const rel = path.relative(WORKSPACE, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new HttpError(400, 'Path escapes the workspace')
  }
  assertNoSymlinkEscape(abs)
  return abs
}

/** Make sure a path (or its nearest existing parent) does not traverse a symlink outside. */
function assertNoSymlinkEscape(abs: string) {
  let probe = abs
  for (let i = 0; i < 64; i++) {
    try {
      const real = fs.realpathSync(probe)
      if (real !== REAL_ROOT && !real.startsWith(REAL_ROOT + path.sep)) {
        throw new HttpError(400, 'Path escapes the workspace through a symlink')
      }
      return
    } catch (err) {
      if (err instanceof HttpError) throw err
      const parent = path.dirname(probe)
      if (parent === probe) return
      probe = parent
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
