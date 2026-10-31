import type { IncomingMessage, Server } from 'node:http'
import type { Request } from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import * as pty from '@lydell/node-pty'
import { WORKSPACE } from './config.js'
import { isAuthorized } from './auth.js'

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.INTEGRAL = '1'
  return env
}

function send(ws: WebSocket, message: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

export function attachTerminal(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    let url: URL
    try {
      url = new URL(req.url || '/', 'http://localhost')
    } catch {
      socket.destroy()
      return
    }
    if (url.pathname !== '/terminal') {
      socket.destroy()
      return
    }
    if (!isAuthorized(req as unknown as Request, url)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: WebSocket) => {
    const shell = process.env.SHELL || '/bin/bash'
    let term: pty.IPty
    try {
      term = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: WORKSPACE,
        env: cleanEnv(),
      })
    } catch (err) {
      send(ws, { type: 'error', message: err instanceof Error ? err.message : 'Could not start shell' })
      ws.close()
      return
    }

    send(ws, { type: 'ready', shell, cwd: WORKSPACE })
    const onData = term.onData((data) => send(ws, { type: 'output', data }))
    const onExit = term.onExit(({ exitCode, signal }) => {
      send(ws, { type: 'exit', code: exitCode, signal })
      ws.close()
    })

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping()
    }, 30000)

    ws.on('pong', () => { /* alive */ })
    ws.on('message', (raw) => {
      let message: { type?: string; data?: string; cols?: number; rows?: number }
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (message.type === 'input' && typeof message.data === 'string') {
        term.write(message.data.slice(0, 100_000))
      } else if (message.type === 'resize') {
        const cols = Math.max(2, Math.min(500, Math.floor(Number(message.cols) || 0)))
        const rows = Math.max(1, Math.min(300, Math.floor(Number(message.rows) || 0)))
        if (cols > 1 && rows > 0) {
          try { term.resize(cols, rows) } catch { /* pty gone */ }
        }
      }
    })

    const cleanup = () => {
      clearInterval(heartbeat)
      try { onData.dispose() } catch { /* ignore */ }
      try { onExit.dispose() } catch { /* ignore */ }
      try { term.kill() } catch { /* ignore */ }
    }

    ws.on('close', cleanup)
    ws.on('error', cleanup)
  })

  return wss
}
