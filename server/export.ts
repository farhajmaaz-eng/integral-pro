import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { Zip, ZipDeflate } from 'fflate'
import { asyncRoute, HttpError } from './http.js'
import { IGNORED_DIRS, WORKSPACE } from './config.js'
import { toPosix } from './paths.js'

export const exportRouter = Router()

const MAX_EXPORT_FILES = 5000
const MAX_EXPORT_BYTES = 200 * 1024 * 1024
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db'])

export type ExportEntry = { abs: string; name: string; size: number }

function safeName(value: string, fallback = 'workspace'): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || fallback
}

function isSensitive(name: string): boolean {
  if (name === '.env.example') return false
  return (
    name === '.env' ||
    name.startsWith('.env.') ||
    name === '.envrc' ||
    name === '.npmrc' ||
    name === '.netrc' ||
    name === '.git-credentials' ||
    name === '.pgpass'
  )
}

/** Collect regular files while refusing to follow symlinks out of the workspace. */
export function collectExportEntries(root = WORKSPACE): ExportEntry[] {
  const entries: ExportEntry[] = []
  let total = 0

  const visit = (dir: string, rel: string) => {
    let dirents: fs.Dirent[]
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name))
    for (const dirent of dirents) {
      if (dirent.isSymbolicLink()) continue
      if (dirent.isDirectory()) {
        if (IGNORED_DIRS.has(dirent.name)) continue
        visit(path.join(dir, dirent.name), toPosix(path.join(rel, dirent.name)))
        continue
      }
      if (!dirent.isFile()) continue
      if (SKIP_FILES.has(dirent.name) || isSensitive(dirent.name)) continue
      const abs = path.join(dir, dirent.name)
      let stat: fs.Stats
      try {
        stat = fs.statSync(abs)
      } catch {
        continue
      }
      if (entries.length >= MAX_EXPORT_FILES) {
        throw new HttpError(413, `Workspace export is limited to ${MAX_EXPORT_FILES} files`)
      }
      total += stat.size
      if (total > MAX_EXPORT_BYTES) {
        throw new HttpError(
          413,
          `Workspace export is limited to ${Math.round(MAX_EXPORT_BYTES / 1024 / 1024)} MB`,
        )
      }
      entries.push({ abs, name: toPosix(path.join(rel, dirent.name)), size: stat.size })
    }
  }

  visit(root, '')
  return entries
}

exportRouter.get('/workspace', asyncRoute(async (_req, res) => {
  const entries = collectExportEntries()
  const filename = `${safeName(path.basename(WORKSPACE))}-${new Date().toISOString().slice(0, 10)}.zip`

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Export-Files', String(entries.length))

  await new Promise<void>((resolve, reject) => {
    let done = false
    let finished = false
    let cancelled = false
    let paused = false
    let activeStream: fs.ReadStream | null = null

    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    const fail = (err: unknown) => {
      if (done) return
      done = true
      cancelled = true
      activeStream?.destroy()
      reject(err)
    }

    const zip = new Zip((err, chunk, final) => {
      if (err) {
        fail(err)
        return
      }
      if (cancelled) return
      try {
        if (chunk && chunk.length > 0) {
          const writable = res.write(Buffer.from(chunk))
          if (!writable && activeStream && !paused) {
            paused = true
            activeStream.pause()
            res.once('drain', () => {
              paused = false
              activeStream?.resume()
            })
          }
        }
        if (final) {
          finished = true
          res.end()
          finish()
        }
      } catch (error) {
        fail(error)
      }
    })

    res.on('close', () => {
      if (!finished) {
        cancelled = true
        activeStream?.destroy()
        finish()
      }
    })

    let index = 0
    const next = () => {
      if (cancelled) return
      if (index >= entries.length) {
        zip.end()
        return
      }
      const entry = entries[index++]
      const file = new ZipDeflate(entry.name, { level: 6 })
      try {
        zip.add(file)
      } catch (err) {
        fail(err)
        return
      }
      const stream = fs.createReadStream(entry.abs)
      activeStream = stream
      stream.on('data', (chunk) => {
        if (cancelled) return
        try {
          file.push(new Uint8Array(chunk as Buffer), false)
        } catch (err) {
          fail(err)
          stream.destroy()
        }
      })
      stream.on('end', () => {
        activeStream = null
        if (cancelled) return
        try {
          file.push(new Uint8Array(0), true)
          next()
        } catch (err) {
          fail(err)
        }
      })
      stream.on('error', fail)
    }

    next()
  })
}))
