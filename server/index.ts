import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import express from 'express'
import { ACCESS_TOKEN, PORT, ROOT, VERSION, WORKSPACE } from './config.js'
import { isAuthorized, requireAuth } from './auth.js'
import { errorHandler } from './http.js'
import { filesRouter } from './files.js'
import { gitRouter } from './git.js'
import { indexRouter, indexStatus } from './indexer.js'
import { aiRouter } from './ai.js'
import { execRouter } from './exec.js'
import { attachTerminal } from './terminal.js'

const app = express()
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  next()
})
app.use(express.json({ limit: '12mb' }))

app.get('/api/health', (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized', authRequired: true })
    return
  }
  res.json({
    ok: true,
    version: VERSION,
    authRequired: Boolean(ACCESS_TOKEN),
    workspace: { name: path.basename(WORKSPACE), path: WORKSPACE },
    index: indexStatus(),
    node: process.version,
  })
})

app.use('/api', requireAuth)
app.use('/api/files', filesRouter)
app.use('/api/git', gitRouter)
app.use('/api/index', indexRouter)
app.use('/api/ai', aiRouter)
app.use('/api', execRouter)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' })
})

const dist = path.join(ROOT, 'dist')
const indexHtml = path.join(dist, 'index.html')

if (fs.existsSync(indexHtml)) {
  app.use(express.static(dist, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
    },
  }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/terminal')) {
      next()
      return
    }
    res.sendFile(indexHtml)
  })
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'Integral Pro API',
      version: VERSION,
      note: 'The frontend is served by Vite in development. Run `npm run dev` and open http://localhost:5173.',
      workspace: WORKSPACE,
    })
  })
}

app.use(errorHandler)

const server = http.createServer(app)
attachTerminal(server)

server.listen(PORT, '0.0.0.0', () => {
  console.log('')
  console.log('   ∫  INTEGRAL PRO')
  console.log(`      version    ${VERSION}`)
  console.log(`      workspace  ${WORKSPACE}`)
  console.log(`      api        http://localhost:${PORT}/api`)
  console.log(`      auth       ${ACCESS_TOKEN ? 'access token required' : 'open (no ACCESS_TOKEN set)'}`)
  console.log('')
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2500).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
