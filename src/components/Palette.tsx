import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Terminal } from 'lucide-react'
import { api } from '../lib/api'
import { formatBytes } from '../lib/format'
import { useAppStore } from '../store'

type PaletteItem = {
  id: string
  label: string
  hint?: string
  kind: string
  action: () => void | Promise<void>
}

export function Palette() {
  const mode = useAppStore((state) => state.palette)
  const setPalette = useAppStore((state) => state.setPalette)
  const openFile = useAppStore((state) => state.openFile)
  const setFileDialog = useAppStore((state) => state.setFileDialog)
  const saveTab = useAppStore((state) => state.saveTab)
  const saveAll = useAppStore((state) => state.saveAll)
  const setTerminalOpen = useAppStore((state) => state.setTerminalOpen)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const setSidebarView = useAppStore((state) => state.setSidebarView)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setExportOpen = useAppStore((state) => state.setExportOpen)
  const loadIndexStatus = useAppStore((state) => state.loadIndexStatus)
  const pushToast = useAppStore((state) => state.pushToast)
  const clearChat = useAppStore((state) => state.clearChat)
  const closeTab = useAppStore((state) => state.closeTab)
  const running = useAppStore((state) => state.running)
  const activePath = useAppStore((state) => state.activePath)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [files, setFiles] = useState<Array<{ path: string; size: number }>>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery('')
    setActive(0)
  }, [mode])

  useEffect(() => {
    if (mode !== 'files') return
    let cancelled = false
    void api
      .flatFiles()
      .then((result) => {
        if (!cancelled) setFiles(result.files)
      })
      .catch((err) => {
        if (!cancelled) pushToast(err instanceof Error ? err.message : 'Could not list files', 'error')
      })
    return () => {
      cancelled = true
    }
  }, [mode, pushToast])

  const close = () => setPalette(null)

  const commands = useMemo<PaletteItem[]>(
    () => [
      {
        id: 'new-file',
        label: 'New file',
        hint: 'create in workspace',
        kind: 'CMD',
        action: () => setFileDialog({ mode: 'file' }),
      },
      {
        id: 'new-folder',
        label: 'New folder',
        hint: 'create in workspace',
        kind: 'CMD',
        action: () => setFileDialog({ mode: 'dir' }),
      },
      {
        id: 'save',
        label: 'Save current file',
        hint: 'Ctrl S',
        kind: 'CMD',
        action: () => {
          if (activePath) void saveTab(activePath)
        },
      },
      {
        id: 'save-all',
        label: 'Save all files',
        hint: 'Ctrl Shift S',
        kind: 'CMD',
        action: () => void saveAll(),
      },
      {
        id: 'terminal',
        label: 'Toggle terminal',
        hint: 'Ctrl J',
        kind: 'CMD',
        action: () => setTerminalOpen(!useAppStore.getState().terminalOpen),
      },
      {
        id: 'sidebar',
        label: 'Toggle sidebar',
        hint: 'Ctrl B',
        kind: 'CMD',
        action: () => toggleSidebar(),
      },
      {
        id: 'explorer',
        label: 'Show explorer',
        hint: 'files',
        kind: 'VIEW',
        action: () => setSidebarView('files'),
      },
      {
        id: 'search',
        label: 'Search workspace',
        hint: 'indexed grep',
        kind: 'VIEW',
        action: () => setSidebarView('search'),
      },
      {
        id: 'git',
        label: 'Show git panel',
        hint: 'status and commits',
        kind: 'VIEW',
        action: () => setSidebarView('git'),
      },
      {
        id: 'export',
        label: 'Export workspace, chat or settings',
        hint: 'Ctrl Shift E',
        kind: 'CMD',
        action: () => setExportOpen(true),
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'providers, routing, appearance',
        kind: 'CMD',
        action: () => setSettingsOpen(true),
      },
      {
        id: 'reindex',
        label: 'Reindex workspace',
        hint: 'rebuild FTS index',
        kind: 'TASK',
        action: async () => {
          try {
            const result = await api.rebuildIndex()
            await loadIndexStatus()
            pushToast(`indexed ${result.files} files in ${result.durationMs}ms`, 'success')
          } catch (err) {
            pushToast(err instanceof Error ? err.message : 'Indexing failed', 'error')
          }
        },
      },
      {
        id: 'new-chat',
        label: 'New conversation',
        hint: 'clear agent transcript',
        kind: 'CMD',
        action: () => {
          if (running) {
            pushToast('Stop the agent before clearing the conversation', 'error')
            return
          }
          clearChat()
        },
      },
      {
        id: 'close-tab',
        label: 'Close current file',
        hint: 'active tab',
        kind: 'CMD',
        action: () => {
          if (activePath) closeTab(activePath)
        },
      },
    ],
    [activePath, clearChat, closeTab, loadIndexStatus, pushToast, running, saveAll, saveTab, setExportOpen, setFileDialog, setSettingsOpen, setSidebarView, setTerminalOpen, toggleSidebar],
  )

  const items = useMemo<PaletteItem[]>(() => {
    if (!mode) return []
    const source: PaletteItem[] =
      mode === 'commands'
        ? commands
        : files.map((file) => ({
            id: `file:${file.path}`,
            label: file.path,
            hint: formatBytes(file.size),
            kind: 'FILE',
            action: () => void openFile(file.path),
          }))
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return source.slice(0, 200)
    return source
      .filter((item) => tokens.every((token) => item.label.toLowerCase().includes(token)))
      .slice(0, 200)
  }, [commands, files, mode, openFile, query])

  useEffect(() => {
    setActive(0)
  }, [query, mode])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(() => {
    if (!mode) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (items.length > 0) setActive((value) => Math.min(items.length - 1, value + 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (items.length > 0) setActive((value) => Math.max(0, value - 1))
      } else if (event.key === 'Enter') {
        const item = items[active]
        if (item) {
          event.preventDefault()
          close()
          void item.action()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items, mode])

  if (!mode) return null

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="palette-win" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          {mode === 'commands' ? <Terminal size={14} /> : <Search size={14} />}
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === 'commands' ? 'run a command…' : 'open a file…'}
            spellCheck={false}
          />
          <span style={{ fontSize: 8, color: 'var(--dim)', letterSpacing: '0.1em' }}>
            {mode === 'commands' ? 'COMMANDS' : 'FILES'}
          </span>
        </div>
        <div className="palette-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="palette-empty">NO MATCHES</div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                data-index={index}
                className={`palette-item ${index === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  close()
                  void item.action()
                }}
              >
                <span className="p-kind">{item.kind}</span>
                <span className="p-label">{item.label}</span>
                {item.hint ? <span className="p-hint">{item.hint}</span> : null}
              </button>
            ))
          )}
        </div>
        <div className="palette-foot">
          <span>↑↓ NAVIGATE</span>
          <span>↵ RUN</span>
          <span>ESC CLOSE</span>
          <span style={{ marginLeft: 'auto' }}>{items.length} ITEMS</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
