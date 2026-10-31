import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Router } from 'express'
import { HttpError, asyncRoute } from './http.js'
import { WORKSPACE } from './config.js'
import { relativePath, resolvePath } from './paths.js'

const execFileAsync = promisify(execFile)

async function git(args: string[], timeout = 20000): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: WORKSPACE,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
    const detail = (e.stderr || e.stdout || e.message || 'git command failed').trim()
    const error = new HttpError(422, detail)
    throw error
  }
}

async function isRepo(): Promise<boolean> {
  try {
    const { stdout } = await git(['rev-parse', '--is-inside-work-tree'])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

export type GitChange = {
  path: string
  status: string
  staged: boolean
  raw: string
}

function parseStatus(output: string) {
  const lines = output.split(/\r?\n/).filter(Boolean)
  let branch = 'detached'
  let ahead = 0
  let behind = 0
  const changes: GitChange[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const header = line.slice(3)
      const branchPart = header.split('...')[0].split(' ')[0]
      branch = branchPart || 'detached'
      const aheadMatch = header.match(/ahead (\d+)/)
      const behindMatch = header.match(/behind (\d+)/)
      if (aheadMatch) ahead = Number(aheadMatch[1])
      if (behindMatch) behind = Number(behindMatch[1])
      continue
    }
    const raw = line.slice(0, 2)
    let filePath = line.slice(3).trim()
    if (raw.includes('R') && filePath.includes(' -> ')) filePath = filePath.split(' -> ').pop() || filePath
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1).replace(/\\"/g, '"')
    }
    const x = raw[0]
    const y = raw[1]
    let status = 'M'
    if (raw === '??') status = 'U'
    else if (x === 'A' || y === 'A') status = 'A'
    else if (x === 'D' || y === 'D') status = 'D'
    else if (x === 'R') status = 'R'
    else if (x === 'C') status = 'C'
    else if (x === 'U' || y === 'U') status = 'U'
    else if (x === 'M' || y === 'M') status = 'M'
    changes.push({ path: filePath, status, staged: x !== ' ' && x !== '?', raw })
  }
  return { branch, ahead, behind, changes }
}

export const gitRouter = Router()

gitRouter.get('/status', asyncRoute(async (_req, res) => {
  if (!(await isRepo())) {
    res.json({ isRepo: false, branch: null, ahead: 0, behind: 0, changes: [], workspace: WORKSPACE })
    return
  }
  const { stdout } = await git(['status', '--porcelain=v1', '-b'])
  res.json({ isRepo: true, ...parseStatus(stdout), workspace: WORKSPACE })
}))

gitRouter.post('/init', asyncRoute(async (_req, res) => {
  if (await isRepo()) {
    res.json({ ok: true, already: true })
    return
  }
  try {
    await git(['init', '-b', 'main'])
  } catch {
    await git(['init'])
  }
  res.json({ ok: true, already: false })
}))

gitRouter.get('/log', asyncRoute(async (_req, res) => {
  if (!(await isRepo())) {
    res.json({ commits: [] })
    return
  }
  try {
    const { stdout } = await git(['log', '-n', '25', '--pretty=format:%h%x1f%an%x1f%ar%x1f%s'])
    const commits = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, author, when, subject] = line.split('\x1f')
        return { hash, author, when, subject }
      })
    res.json({ commits })
  } catch {
    res.json({ commits: [] })
  }
}))

gitRouter.get('/diff', asyncRoute(async (req, res) => {
  if (!(await isRepo())) throw new HttpError(400, 'Workspace is not a git repository')
  const rel = String(req.query.path || '')
  if (!rel) throw new HttpError(400, 'Missing path')
  const abs = resolvePath(rel)
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) throw new HttpError(400, 'Cannot diff a directory')

  let diff = ''
  try {
    const { stdout } = await git(['diff', '--no-color', 'HEAD', '--', relativePath(abs)])
    diff = stdout
  } catch {
    try {
      const { stdout } = await git(['diff', '--no-color', '--', relativePath(abs)])
      diff = stdout
    } catch {
      diff = ''
    }
  }

  if (!diff.trim()) {
    const content = fs.readFileSync(abs, 'utf8')
    const lines = content.split(/\r?\n/)
    const relPath = relativePath(abs)
    diff = [
      `diff --git a/${relPath} b/${relPath}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${relPath}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((line) => `+${line}`),
    ].join('\n')
  }

  let original = ''
  try {
    const { stdout } = await git(['show', `HEAD:${relativePath(abs)}`])
    original = stdout
  } catch {
    original = ''
  }
  let modified = ''
  try {
    modified = fs.readFileSync(abs, 'utf8')
  } catch {
    modified = ''
  }

  res.json({ path: relativePath(abs), diff, original, modified })
}))

gitRouter.post('/commit', asyncRoute(async (req, res) => {
  if (!(await isRepo())) throw new HttpError(400, 'Workspace is not a git repository')
  const message = String(req.body?.message || '').trim()
  if (!message) throw new HttpError(400, 'Commit message is required')
  if (message.length > 2000) throw new HttpError(400, 'Commit message is too long')

  const status = await git(['status', '--porcelain'])
  if (!status.stdout.trim()) throw new HttpError(409, 'Nothing to commit')

  await git(['add', '-A'])
  try {
    const { stdout } = await git(['commit', '-m', message])
    const { stdout: summary } = await git(['log', '-1', '--oneline'])
    res.json({ ok: true, commit: summary.trim(), output: stdout.trim() })
  } catch (err) {
    if (err instanceof HttpError) {
      throw new HttpError(422, `${err.message}\n\nTip: configure git user.name and user.email in the workspace.`)
    }
    throw err
  }
}))

export { isRepo }
