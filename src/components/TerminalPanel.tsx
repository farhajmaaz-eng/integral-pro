import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { getToken } from '../lib/api'
import { basename } from '../lib/format'
import { useAppStore } from '../store'
import { Window } from './Chrome'

type Status = 'connecting' | 'open' | 'closed'

export function TerminalPanel({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [shell, setShell] = useState('shell')
  const [cwd, setCwd] = useState('workspace')
  const [generation, setGeneration] = useState(0)
  const setTerminalOpen = useAppStore((state) => state.setTerminalOpen)
  const isMobile = useAppStore((state) => state.isMobile)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: false,
      allowTransparency: true,
      macOptionIsMeta: true,
      theme: {
        background: '#121214',
        foreground: '#e7e3d9',
        cursor: '#e8b15a',
        cursorAccent: '#121214',
        selectionBackground: '#e8b15a33',
        black: '#1c1c20',
        red: '#d96c5f',
        green: '#8fb573',
        yellow: '#e8b15a',
        blue: '#7fa6c9',
        magenta: '#b07aa1',
        cyan: '#7fb3a8',
        white: '#e7e3d9',
        brightBlack: '#5f5d58',
        brightRed: '#e88577',
        brightGreen: '#a6c98c',
        brightYellow: '#f0c47a',
        brightBlue: '#9bbbd8',
        brightMagenta: '#c795b8',
        brightCyan: '#9bcbc0',
        brightWhite: '#ffffff',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term
    fitRef.current = fit

    const sendResize = () => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    const doFit = () => {
      try {
        fit.fit()
        sendResize()
      } catch {
        /* hidden or zero size */
      }
    }

    requestAnimationFrame(doFit)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    const url = `${protocol}//${window.location.host}/terminal${token ? `?token=${encodeURIComponent(token)}` : ''}`
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      setStatus('closed')
      return
    }
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      setStatus('open')
      doFit()
    }
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          type?: string
          data?: string
          message?: string
          shell?: string
          cwd?: string
          code?: number
        }
        if (message.type === 'output' && typeof message.data === 'string') term.write(message.data)
        else if (message.type === 'ready') {
          if (message.shell) setShell(basename(message.shell))
          if (message.cwd) setCwd(basename(message.cwd))
        } else if (message.type === 'exit') {
          term.write(`\r\n\x1b[38;5;95m[process exited ${message.code ?? ''}]\x1b[0m\r\n`)
          setStatus('closed')
        } else if (message.type === 'error') {
          term.write(`\r\n\x1b[38;5;131m[${message.message || message.data || 'terminal error'}]\x1b[0m\r\n`)
          setStatus('closed')
        }
      } catch {
        /* ignore malformed */
      }
    }
    ws.onclose = () => setStatus('closed')
    ws.onerror = () => setStatus('closed')

    const disposeData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
    })

    const observer = new ResizeObserver(() => doFit())
    observer.observe(container)
    const onWindowResize = () => doFit()
    window.addEventListener('resize', onWindowResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onWindowResize)
      disposeData.dispose()
      try { ws.close() } catch { /* ignore */ }
      term.dispose()
      termRef.current = null
      fitRef.current = null
      wsRef.current = null
    }
  }, [generation])

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => {
      try {
        fitRef.current?.fit()
        const term = termRef.current
        const ws = wsRef.current
        if (term && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
        term?.focus()
      } catch {
        /* ignore */
      }
    }, 80)
    return () => window.clearTimeout(timer)
  }, [visible])

  function reconnect() {
    setGeneration((value) => value + 1)
  }

  return (
    <Window
      className="terminal-win"
      title="TERMINAL"
      meta={status === 'open' ? `${shell} · ${cwd}` : status}
      actions={
        <>
          <button className="win-btn" title="Clear terminal" onClick={() => termRef.current?.clear()}>
            <Trash2 size={11} />
          </button>
          <button className="win-btn" title="Reconnect shell" onClick={reconnect}>
            <RotateCcw size={11} />
          </button>
          {!isMobile ? (
            <button className="win-btn close" title="Close terminal" onClick={() => setTerminalOpen(false)}>
              <X size={12} />
            </button>
          ) : null}
        </>
      }
    >
      <div className="terminal-wrap">
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {status !== 'open' ? (
          <div className="terminal-overlay">
            <span className="blink-square" />
            {status === 'connecting' ? 'OPENING PTY' : 'SHELL SESSION CLOSED'}
            {status === 'closed' ? (
              <button className="btn btn-sm" onClick={reconnect}>
                RECONNECT
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Window>
  )
}
