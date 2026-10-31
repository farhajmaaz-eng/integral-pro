import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { HttpError, asyncRoute } from './http.js'
import { MAX_FILE_BYTES, IGNORED_DIRS, IGNORED_FILES, WORKSPACE } from './config.js'
import { assertNotIgnored, isProbablyBinary, relativePath, resolvePath, toPosix, walkFiles } from './paths.js'

export const filesRouter = Router()

type TreeNode = {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  truncated?: boolean
  children?: TreeNode[]
}

filesRouter.get('/tree', asyncRoute(async (_req, res) => {
  let budget = 8000
  let truncated = false

  const build = (dir: string, rel: string, depth: number): TreeNode[] => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const nodes: TreeNode[] = []
    for (const entry of entries) {
      if (budget <= 0) {
        truncated = true
        break
      }
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
      if (entry.isFile() && IGNORED_FILES.has(entry.name)) continue
      const abs = path.join(dir, entry.name)
      const nodePath = toPosix(path.join(rel, entry.name))
      if (entry.isDirectory()) {
        budget--
        const node: TreeNode = { name: entry.name, path: nodePath, type: 'dir' }
        if (depth < 7) node.children = build(abs, nodePath, depth + 1)
        else {
          node.truncated = true
          truncated = true
        }
        nodes.push(node)
      } else if (entry.isFile()) {
        budget--
        try {
          const stat = fs.statSync(abs)
          nodes.push({ name: entry.name, path: nodePath, type: 'file', size: stat.size })
        } catch {
          /* skip */
        }
      }
    }
    return nodes
  }

  res.json({
    root: WORKSPACE,
    name: path.basename(WORKSPACE),
    children: build(WORKSPACE, '', 0),
    truncated,
  })
}))

filesRouter.get('/flat', asyncRoute(async (_req, res) => {
  const { files, truncated } = walkFiles(WORKSPACE, { maxFiles: 5000 })
  res.json({
    files: files.map((f) => ({ path: toPosix(path.relative(WORKSPACE, f.path)), size: f.size })),
    truncated,
  })
}))

filesRouter.get('/read', asyncRoute(async (req, res) => {
  const rel = String(req.query.path || '')
  if (!rel) throw new HttpError(400, 'Missing path')
  assertNotIgnored(rel)
  const abs = resolvePath(rel)
  const optional = String(req.query.optional || '') === '1'
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    if (optional) {
      res.json({ path: toPosix(rel), content: '', size: 0, mtime: 0, exists: false })
      return
    }
    throw new HttpError(404, `File not found: ${rel}`)
  }
  if (!stat.isFile()) throw new HttpError(400, 'Not a file')
  if (stat.size > MAX_FILE_BYTES) throw new HttpError(413, 'File is larger than 2 MB')
  const buffer = fs.readFileSync(abs)
  if (isProbablyBinary(buffer)) throw new HttpError(415, 'Binary files cannot be opened in the editor')
  res.json({
    path: toPosix(path.relative(WORKSPACE, abs)),
    content: buffer.toString('utf8'),
    size: stat.size,
    mtime: stat.mtimeMs,
    exists: true,
  })
}))

filesRouter.post('/write', asyncRoute(async (req, res) => {
  const rel = String(req.body?.path || '')
  const content = req.body?.content
  if (!rel) throw new HttpError(400, 'Missing path')
  if (typeof content !== 'string') throw new HttpError(400, 'Missing content')
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw new HttpError(413, 'File is larger than 2 MB')
  assertNotIgnored(rel)
  const abs = resolvePath(rel)
  try {
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) throw new HttpError(400, 'Path is a directory')
  } catch (err) {
    if (err instanceof HttpError) throw err
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
  res.json({ path: toPosix(path.relative(WORKSPACE, abs)), size: Buffer.byteLength(content, 'utf8'), mtime: Date.now() })
}))

filesRouter.post('/create', asyncRoute(async (req, res) => {
  const rel = String(req.body?.path || '')
  const type = req.body?.type === 'dir' ? 'dir' : 'file'
  if (!rel) throw new HttpError(400, 'Missing path')
  assertNotIgnored(rel)
  const abs = resolvePath(rel)
  if (fs.existsSync(abs)) throw new HttpError(409, 'Path already exists')
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  if (type === 'dir') fs.mkdirSync(abs)
  else fs.writeFileSync(abs, '', { encoding: 'utf8', flag: 'wx' })
  res.json({ path: toPosix(path.relative(WORKSPACE, abs)), type })
}))

filesRouter.post('/rename', asyncRoute(async (req, res) => {
  const from = String(req.body?.from || '')
  const to = String(req.body?.to || '')
  if (!from || !to) throw new HttpError(400, 'Missing from/to')
  assertNotIgnored(from)
  assertNotIgnored(to)
  const src = resolvePath(from)
  const dest = resolvePath(to)
  if (!fs.existsSync(src)) throw new HttpError(404, 'Source not found')
  if (fs.existsSync(dest)) throw new HttpError(409, 'Destination already exists')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(src, dest)
  res.json({ from: toPosix(path.relative(WORKSPACE, src)), to: toPosix(path.relative(WORKSPACE, dest)) })
}))

filesRouter.delete('/file', asyncRoute(async (req, res) => {
  const rel = String(req.query.path || '')
  if (!rel) throw new HttpError(400, 'Missing path')
  assertNotIgnored(rel)
  const abs = resolvePath(rel)
  if (abs === WORKSPACE) throw new HttpError(400, 'Cannot delete workspace root')
  if (!fs.existsSync(abs)) throw new HttpError(404, 'Path not found')
  const stat = fs.lstatSync(abs)
  if (stat.isDirectory()) fs.rmSync(abs, { recursive: true, force: false })
  else fs.unlinkSync(abs)
  res.json({ ok: true, path: toPosix(path.relative(WORKSPACE, abs)) })
}))

export { relativePath }
