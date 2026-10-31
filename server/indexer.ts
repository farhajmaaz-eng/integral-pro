import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Router } from 'express'
import { asyncRoute, HttpError } from './http.js'
import { DATA_DIR, WORKSPACE, isTextFile } from './config.js'
import { isProbablyBinary, toPosix, walkFiles } from './paths.js'

const dbPath = path.join(DATA_DIR, 'integral.db')
const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS file_meta (path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime INTEGER NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(path UNINDEXED, content, tokenize = 'unicode61');
`)

type IndexResult = { files: number; skipped: number; truncated: boolean; durationMs: number }
let indexing: Promise<IndexResult> | null = null

function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function indexStatus() {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM file_meta').get() as { n: number }).n
  return {
    indexed: count,
    indexing: Boolean(indexing),
    indexedAt: getMeta('indexed_at'),
    dbPath,
  }
}

export async function rebuildIndex(): Promise<IndexResult> {
  if (indexing) return indexing
  indexing = (async () => {
    const started = Date.now()
    const { files, truncated } = walkFiles(WORKSPACE, { maxFiles: 8000, maxBytes: 512 * 1024 })
    let indexed = 0
    let skipped = 0
    const insertFts = db.prepare('INSERT INTO file_fts(path, content) VALUES(?, ?)')
    const insertMeta = db.prepare('INSERT INTO file_meta(path, size, mtime) VALUES(?, ?, ?)')
    try {
      db.exec('BEGIN')
      db.exec('DELETE FROM file_fts; DELETE FROM file_meta;')
      for (const file of files) {
        if (!isTextFile(file.path)) {
          skipped++
          continue
        }
        let content: string
        try {
          const buffer = fs.readFileSync(file.path)
          if (isProbablyBinary(buffer)) {
            skipped++
            continue
          }
          content = buffer.toString('utf8')
        } catch {
          skipped++
          continue
        }
        const rel = toPosix(path.relative(WORKSPACE, file.path))
        insertFts.run(rel, content)
        insertMeta.run(rel, file.size, Date.now())
        indexed++
      }
      setMeta('indexed_at', new Date().toISOString())
      db.exec('COMMIT')
    } catch (err) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw err
    }
    return { files: indexed, skipped, truncated, durationMs: Date.now() - started }
  })().finally(() => {
    indexing = null
  })
  return indexing
}

export type SearchHit = {
  path: string
  line: number
  column: number
  text: string
}

export function searchIndex(query: string, limit = 40): { hits: SearchHit[]; indexed: boolean } {
  const q = query.trim()
  const count = (db.prepare('SELECT COUNT(*) AS n FROM file_meta').get() as { n: number }).n
  if (!q || count === 0) return { hits: [], indexed: count > 0 }

  const tokens = Array.from(new Set((q.toLowerCase().match(/[a-z0-9_]{2,}/g) || []).slice(0, 8)))
  if (tokens.length === 0) return { hits: [], indexed: true }

  const ftsQuery = tokens.map((t) => `${t}*`).join(' AND ')
  let rows: Array<{ path: string; content: string }> = []
  try {
    rows = db
      .prepare('SELECT path, content FROM file_fts WHERE file_fts MATCH ? LIMIT 80')
      .all(ftsQuery) as Array<{ path: string; content: string }>
  } catch {
    return { hits: [], indexed: true }
  }

  const hits: SearchHit[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const lines = row.content.split(/\r?\n/)
    for (let i = 0; i < lines.length && hits.length < limit; i++) {
      const lower = lines[i].toLowerCase()
      let best = -1
      for (const token of tokens) {
        const at = lower.indexOf(token)
        if (at !== -1 && (best === -1 || at < best)) best = at
      }
      if (best === -1) continue
      const key = `${row.path}:${i}`
      if (seen.has(key)) continue
      seen.add(key)
      const raw = lines[i]
      const start = Math.max(0, best - 60)
      const text = (start > 0 ? '…' : '') + raw.slice(start, start + 200).trimEnd()
      hits.push({ path: row.path, line: i + 1, column: best + 1, text })
    }
    if (hits.length >= limit) break
  }
  return { hits, indexed: true }
}

export const indexRouter = Router()

indexRouter.get('/status', asyncRoute(async (_req, res) => {
  res.json(indexStatus())
}))

indexRouter.post('/rebuild', asyncRoute(async (_req, res) => {
  const result = await rebuildIndex()
  res.json({ ...result, ...indexStatus() })
}))

indexRouter.get('/search', asyncRoute(async (req, res) => {
  const q = String(req.query.q || '')
  if (!q.trim()) throw new HttpError(400, 'Missing query')
  if (!indexStatus().indexed) await rebuildIndex()
  const result = searchIndex(q, 60)
  res.json({ query: q, ...result })
}))

// Warm the index in the background on boot so the first search is instant.
setTimeout(() => {
  if (indexStatus().indexed === 0) {
    rebuildIndex().catch((err) => console.error('[integral] index failed', err))
  }
}, 1200)
