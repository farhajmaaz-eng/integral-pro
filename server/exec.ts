import { exec } from 'node:child_process'
import fs from 'node:fs'
import { Router } from 'express'
import { asyncRoute, HttpError } from './http.js'
import { WORKSPACE } from './config.js'
import { resolvePath } from './paths.js'

export const execRouter = Router()

execRouter.post('/exec', asyncRoute(async (req, res) => {
  const command = String(req.body?.command || '').trim()
  if (!command) throw new HttpError(400, 'Command is required')
  if (command.length > 10000) throw new HttpError(413, 'Command is too long')

  const cwdRel = String(req.body?.cwd || '')
  const cwd = cwdRel ? resolvePath(cwdRel) : WORKSPACE
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new HttpError(400, 'Working directory does not exist')

  const timeout = Math.max(1000, Math.min(120000, Number(req.body?.timeout) || 60000))
  const started = Date.now()

  await new Promise<void>((resolve) => {
    exec(
      command,
      {
        cwd,
        timeout,
        maxBuffer: 2 * 1024 * 1024,
        shell: '/bin/bash',
        env: { ...process.env, TERM: 'dumb', CI: process.env.CI || '1' },
      },
      (error, stdout, stderr) => {
        const e = error as (Error & { code?: number | string; killed?: boolean; signal?: string }) | null
        res.json({
          command,
          cwd: cwdRel || '.',
          exitCode: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
          killed: Boolean(e?.killed),
          timedOut: Boolean(e?.killed) || e?.signal === 'SIGTERM',
          durationMs: Date.now() - started,
          stdout: stdout.slice(0, 400_000),
          stderr: stderr.slice(0, 200_000),
        })
        resolve()
      },
    )
  })
}))
