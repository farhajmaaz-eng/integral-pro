import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { FilePlus, FolderOpen, Save, X } from 'lucide-react'
import { languageFor } from '../lib/language'
import { useAppStore } from '../store'
import { Window } from './Chrome'

export function EditorPane() {
  const tabs = useAppStore((state) => state.tabs)
  const activePath = useAppStore((state) => state.activePath)
  const settings = useAppStore((state) => state.settings)
  const isMobile = useAppStore((state) => state.isMobile)
  const reveal = useAppStore((state) => state.reveal)
  const saveTab = useAppStore((state) => state.saveTab)
  const closeTab = useAppStore((state) => state.closeTab)
  const setTabContent = useAppStore((state) => state.setTabContent)
  const setActivePath = useAppStore((state) => state.setActivePath)
  const setCursor = useAppStore((state) => state.setCursor)
  const setFileDialog = useAppStore((state) => state.setFileDialog)
  const setMobileTab = useAppStore((state) => state.setMobileTab)
  const setSidebarView = useAppStore((state) => state.setSidebarView)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const activeTab = tabs.find((tab) => tab.path === activePath) || null

  useEffect(() => {
    if (!activePath || !reveal || reveal.path !== activePath || !editorRef.current) return
    const editor = editorRef.current
    const line = Math.max(1, reveal.line)
    const column = Math.max(1, reveal.column || 1)
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column })
    editor.focus()
  }, [reveal, activePath])

  useEffect(() => {
    setCursor(1, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath])

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const state = useAppStore.getState()
      if (state.activePath) void state.saveTab(state.activePath)
    })
    editor.onDidChangeCursorPosition((event) => {
      setCursor(event.position.lineNumber, event.position.column)
    })
  }

  const crumbs = activeTab ? activeTab.path.split('/') : []

  return (
    <Window
      className="editor-win"
      title="EDITOR"
      meta={activeTab ? languageFor(activeTab.path).toUpperCase() : 'no buffer'}
      actions={
        activeTab ? (
          <>
            <button
              className="win-btn"
              title="Save (Ctrl+S)"
              onClick={() => void saveTab(activeTab.path)}
              disabled={!activeTab.dirty}
            >
              <Save size={12} />
            </button>
            <button className="win-btn close" title="Close file" onClick={() => closeTab(activeTab.path)}>
              <X size={12} />
            </button>
          </>
        ) : null
      }
    >
      {tabs.length > 0 ? (
        <div className="tab-strip" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.path}
              role="tab"
              tabIndex={0}
              aria-selected={tab.path === activePath}
              className={`editor-tab ${tab.path === activePath ? 'active' : ''}`}
              onClick={() => setActivePath(tab.path)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setActivePath(tab.path)
              }}
              onAuxClick={(event) => {
                if (event.button === 1) closeTab(tab.path)
              }}
              title={tab.path}
            >
              {tab.dirty ? <span className="tab-dirty" /> : null}
              <span className="tab-name">{tab.path.split('/').pop()}</span>
              <button
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation()
                  closeTab(tab.path)
                }}
                aria-label={`Close ${tab.path}`}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab ? (
        <>
          <div className="editor-crumbs">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} style={{ display: 'inline-flex', gap: 4 }}>
                {index > 0 ? <span className="crumb-sep">/</span> : null}
                <span className="crumb">{crumb}</span>
              </span>
            ))}
            <span className="win-bar-spacer" />
            <span className="editor-status-inline">
              {activeTab.dirty ? 'MODIFIED' : 'SAVED'}
              <span>·</span>
              {activeTab.content.length} CHARS
            </span>
          </div>
          <div className="editor-surface">
            <Editor
              key={activeTab.path}
              path={activeTab.path}
              language={languageFor(activeTab.path)}
              value={activeTab.content}
              theme="integral"
              keepCurrentModel
              onMount={onMount}
              onChange={(value) => setTabContent(activeTab.path, value ?? '')}
              loading={<div className="side-empty">LOADING EDITOR</div>}
              options={{
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontSize: isMobile ? Math.max(12, settings.fontSize - 1) : settings.fontSize,
                lineHeight: Math.round((isMobile ? Math.max(12, settings.fontSize - 1) : settings.fontSize) * 1.6),
                minimap: { enabled: false },
                wordWrap: settings.wordWrap ? 'on' : 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 10, bottom: 10 },
                renderLineHighlight: 'all',
                cursorBlinking: settings.reducedMotion ? 'solid' : 'blink',
                smoothScrolling: false,
                fontLigatures: false,
                tabSize: 2,
                insertSpaces: true,
                glyphMargin: false,
                folding: true,
                lineNumbersMinChars: 3,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9, useShadows: false },
                stickyScroll: { enabled: false },
                bracketPairColorization: { enabled: true },
                guides: { indentation: true, bracketPairs: false },
                contextmenu: true,
                mouseWheelZoom: true,
                renderWhitespace: 'selection',
                quickSuggestions: { other: true, comments: false, strings: false },
                fixedOverflowWidgets: true,
              }}
            />
          </div>
        </>
      ) : (
        <div className="empty-editor">
          <div className="glyph-box">∫</div>
          <div className="empty-title">NO FILE OPEN</div>
          <div className="empty-sub">
            A workspace in the browser. Bring your own model, keep your keys local, and let the agent work
            against real files.
          </div>
          <div className="empty-actions">
            <button
              className="btn"
              onClick={() => {
                setSidebarView('files')
                if (isMobile) setMobileTab('files')
              }}
            >
              <FolderOpen size={11} /> OPEN FILES
            </button>
            <button className="btn btn-primary" onClick={() => setFileDialog({ mode: 'file' })}>
              <FilePlus size={11} /> NEW FILE
            </button>
          </div>
          <div className="shortcut-grid">
            <b>CTRL P</b><span>quick open</span>
            <b>CTRL K</b><span>commands</span>
            <b>CTRL J</b><span>terminal</span>
            <b>CTRL S</b><span>save file</span>
          </div>
        </div>
      )}
    </Window>
  )
}
