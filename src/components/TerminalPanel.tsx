import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ClipboardPaste, RotateCcw, Trash2, X } from 'lucide-react'
import { getToken } from '../lib/api'
import { terminalTheme } from '../lib/appearance'
import { readClipboardText } from '../lib/clipboard'
import { basename } from '../lib/format'
import { useAppStore } from '../store'
import { Window } from './Chrome'
import { Modal } from './Modal'

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
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteDraft, setPasteDraft] = useState('')
  const [pasteNote, setPasteNote] = useState('')
  const setTerminalOpen = useAppStore((state) => state.setTerminalOpen)
  const isMobile = useAppStore((state) => state.isMobile)
  const accent = useAppStore((state) => state.settings.accent)
  const terminalFontSize = useAppStore((state) => state.settings.terminalFontSize)
  const reducedMotion = useAppStore((state) => state.settings.reducedMotion)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const initial = useAppStore.getState().settings
    const term = new XTerm({
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: initial.terminalFontSize,
      lineHeight: 1.25,
      cursorBlink: !initial.reducedMotion,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: false,
      allowTransparency: true,
      macOptionIsMeta: true,
      theme: terminalTheme(initial.accent),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)

    // xterm sends Ctrl/Cmd+V as a control byte by default. Let the browser
    // paste into the hidden textarea instead, like a normal IDE terminal.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || event.altKey) return true
      if (!(event.ctrlKey || event.metaKey)) return true
      return event.key.toLowerCase() !== 'v'
    })

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
    const term = termRef.current
    if (!term) return
    term.options.theme = terminalTheme(accent)
    term.options.fontSize = terminalFontSize
    term.options.cursorBlink = !reducedMotion
    const timer = window.setTimeout(() => {
      try {
        fitRef.current?.fit()
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      } catch {
        /* hidden or zero size */
      }
    }, 30)
    return () => window.clearTimeout(timer)
  }, [accent, terminalFontSize, reducedMotion])

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

  async function pasteFromClipboard() {
    const result = await readClipboardText()
    if (result.ok && result.text) {
      termRef.current?.paste(result.text)
      termRef.current?.focus()
      return
    }
    setPasteDraft('')
    setPasteNote(
      result.ok
        ? 'Your clipboard is empty. Paste the text below, then insert it.'
        : result.reason === 'unavailable'
          ? 'This browser does not expose the clipboard here. Paste the text below, then insert it.'
          : 'Clipboard access was blocked. Paste the text below, then insert it.',
    )
    setPasteOpen(true)
  }

  function insertPastedText() {
    const text = pasteDraft
    if (!text) return
    setPasteOpen(false)
    setPasteDraft('')
    termRef.current?.paste(text)
    window.setTimeout(() => termRef.current?.focus(), 0)
  }

  return (
    <Window
      className="terminal-win"
      title="TERMINAL"
      meta={status === 'open' ? `${shell} · ${cwd}` : status}
      actions={
        <>
          <button
            className={`win-btn${isMobile ? ' text' : ''}`}
            title="Paste from clipboard"
            aria-label="Paste from clipboard"
            onClick={() => void pasteFromClipboard()}
            disabled={status !== 'open'}
          >
            {isMobile ? 'PASTE' : <ClipboardPaste size={11} />}
          </button>
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

      {pasteOpen ? (
        <Modal
          title="PASTE INTO TERMINAL"
          meta={shell}
          size="sm"
          onClose={() => setPasteOpen(false)}
          footer={
            <>
              <span style={{ fontSize: 8.5, color: 'var(--dim)', letterSpacing: '0.06em' }}>
                SENT TO THE SHELL
              </span>
              <span className="spacer" />
              <button className="btn btn-sm" onClick={() => setPasteOpen(false)}>
                CANCEL
              </button>
              <button className="btn btn-sm btn-primary" onClick={insertPastedText} disabled={!pasteDraft}>
                INSERT
              </button>
            </>
          }
        >
          <div className="form-stack">
            <div className="note">{pasteNote}</div>
            <textarea
              className="textarea terminal-paste-input"
              autoFocus
              value={pasteDraft}
              onChange={(event) => setPasteDraft(event.target.value)}
              placeholder="Long-press here and paste, then choose INSERT."
              aria-label="Text to paste into the terminal"
              spellCheck={false}
            />
          </div>
        </Modal>
      ) : null}
    </Window>
  )
}
