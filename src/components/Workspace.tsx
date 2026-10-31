import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAppStore } from '../store'
import { Window } from './Chrome'
import { Sidebar } from './Sidebar'
import { EditorPane } from './EditorPane'
import { ChatPanel } from './ChatPanel'
import { TerminalPanel } from './TerminalPanel'
import { GitPanel } from './GitPanel'
import { clamp } from '../lib/format'

type DragKind = 'sidebar' | 'agent' | 'terminal'

export function Workspace() {
  const isMobile = useAppStore((state) => state.isMobile)
  return isMobile ? <MobileWorkspace /> : <DesktopWorkspace />
}

function DesktopWorkspace() {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const terminalOpen = useAppStore((state) => state.terminalOpen)
  const [sidebarWidth, setSidebarWidth] = useState(settings.sidebarWidth)
  const [agentWidth, setAgentWidth] = useState(settings.agentWidth)
  const [terminalHeight, setTerminalHeight] = useState(settings.terminalHeight)
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; start: number; last: number } | null>(null)

  function startDrag(kind: DragKind, event: React.PointerEvent) {
    event.preventDefault()
    const start = kind === 'sidebar' ? sidebarWidth : kind === 'agent' ? agentWidth : terminalHeight
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, start, last: start }
    document.body.style.cursor = kind === 'terminal' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      if (drag.kind === 'sidebar') {
        const width = clamp(drag.start + (moveEvent.clientX - drag.startX), 190, 430)
        drag.last = width
        setSidebarWidth(width)
      } else if (drag.kind === 'agent') {
        const width = clamp(drag.start - (moveEvent.clientX - drag.startX), 300, Math.min(680, window.innerWidth - 520))
        drag.last = width
        setAgentWidth(width)
      } else {
        const height = clamp(drag.start - (moveEvent.clientY - drag.startY), 120, Math.min(520, window.innerHeight - 260))
        drag.last = height
        setTerminalHeight(height)
      }
    }

    const onUp = () => {
      const drag = dragRef.current
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      if (drag) {
        updateSettings({
          sidebarWidth: drag.kind === 'sidebar' ? drag.last : settings.sidebarWidth,
          agentWidth: drag.kind === 'agent' ? drag.last : settings.agentWidth,
          terminalHeight: drag.kind === 'terminal' ? drag.last : settings.terminalHeight,
        })
      }
      dragRef.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const columns = sidebarCollapsed
    ? `0px 0px minmax(0, 1fr) 5px min(${agentWidth}px, 42vw)`
    : `${sidebarWidth}px 5px minmax(0, 1fr) 5px min(${agentWidth}px, 42vw)`
  const rows = terminalOpen ? `minmax(0, 1fr) 5px ${terminalHeight}px` : 'minmax(0, 1fr) 0px 0px'

  return (
    <div className="workspace" style={{ gridTemplateColumns: columns, gridTemplateRows: rows }}>
      {!sidebarCollapsed ? (
        <div style={{ gridColumn: 1, gridRow: '1 / 4', display: 'flex', minHeight: 0 }}>
          <Sidebar />
        </div>
      ) : null}
      {!sidebarCollapsed ? (
        <div
          className="splitter-v"
          style={{ gridColumn: 2, gridRow: '1 / 4' }}
          onPointerDown={(event) => startDrag('sidebar', event)}
          onDoubleClick={() => {
            setSidebarWidth(244)
            updateSettings({ sidebarWidth: 244 })
          }}
          title="Drag to resize · double-click to reset"
        />
      ) : null}

      <div style={{ gridColumn: 3, gridRow: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        <EditorPane />
      </div>

      {terminalOpen ? (
        <>
          <div
            className="splitter-h"
            style={{ gridColumn: 3, gridRow: 2 }}
            onPointerDown={(event) => startDrag('terminal', event)}
            onDoubleClick={() => {
              setTerminalHeight(232)
              updateSettings({ terminalHeight: 232 })
            }}
            title="Drag to resize terminal"
          />
          <div style={{ gridColumn: 3, gridRow: 3, display: 'flex', minHeight: 0, minWidth: 0 }}>
            <TerminalPanel visible />
          </div>
        </>
      ) : null}

      <div
        className="splitter-v"
        style={{ gridColumn: 4, gridRow: '1 / 4' }}
        onPointerDown={(event) => startDrag('agent', event)}
        onDoubleClick={() => {
          setAgentWidth(392)
          updateSettings({ agentWidth: 392 })
        }}
        title="Drag to resize · double-click to reset"
      />
      <div style={{ gridColumn: 5, gridRow: '1 / 4', display: 'flex', minHeight: 0, minWidth: 0 }}>
        <ChatPanel />
      </div>
    </div>
  )
}

function MobileWorkspace() {
  const mobileTab = useAppStore((state) => state.mobileTab)
  const git = useAppStore((state) => state.git)
  const loadGit = useAppStore((state) => state.loadGit)

  return (
    <div className="workspace mobile-workspace">
      <div className={`mobile-panel ${mobileTab === 'files' ? 'active' : ''}`}>
        <Sidebar mobile />
      </div>
      <div className={`mobile-panel ${mobileTab === 'editor' ? 'active' : ''}`}>
        <EditorPane />
      </div>
      <div className={`mobile-panel ${mobileTab === 'agent' ? 'active' : ''}`}>
        <ChatPanel />
      </div>
      <div className={`mobile-panel ${mobileTab === 'terminal' ? 'active' : ''}`}>
        <TerminalPanel visible={mobileTab === 'terminal'} />
      </div>
      <div className={`mobile-panel ${mobileTab === 'git' ? 'active' : ''}`}>
        <Window
          title="GIT"
          meta={git?.isRepo ? git.branch || 'repo' : 'no repository'}
          actions={
            <button className="win-btn" title="Refresh git status" onClick={() => void loadGit()}>
              <RefreshCw size={11} />
            </button>
          }
        >
          <GitPanel embedded />
        </Window>
      </div>
    </div>
  )
}
