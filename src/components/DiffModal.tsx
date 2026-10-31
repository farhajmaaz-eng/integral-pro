import { DiffEditor } from '@monaco-editor/react'
import { ExternalLink } from 'lucide-react'
import { useAppStore } from '../store'
import { Modal } from './Modal'

export function DiffModal() {
  const diffView = useAppStore((state) => state.diffView)
  const setDiffView = useAppStore((state) => state.setDiffView)
  const openFile = useAppStore((state) => state.openFile)
  const isMobile = useAppStore((state) => state.isMobile)

  if (!diffView) return null

  return (
    <Modal
      title="DIFF"
      meta={diffView.path}
      size="full"
      onClose={() => setDiffView(null)}
      footer={
        <>
          <span style={{ fontSize: 8.5, color: 'var(--dim)', letterSpacing: '0.08em' }}>
            {diffView.language?.toUpperCase() || 'PLAINTEXT'} · READ ONLY
          </span>
          <span className="spacer" />
          <button
            className="btn"
            onClick={() => {
              setDiffView(null)
              void openFile(diffView.path)
            }}
          >
            <ExternalLink size={11} /> OPEN FILE
          </button>
          <button className="btn btn-primary" onClick={() => setDiffView(null)}>
            CLOSE
          </button>
        </>
      }
    >
      <div className="diff-meta">
        <span className="path">{diffView.path}</span>
        <span>HEAD → WORKING TREE</span>
      </div>
      <div className="diff-wrap">
        <DiffEditor
          original={diffView.original}
          modified={diffView.modified}
          language={diffView.language || 'plaintext'}
          theme="integral"
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          options={{
            readOnly: true,
            originalEditable: false,
            renderSideBySide: !isMobile,
            useInlineViewWhenSpaceIsLimited: true,
            minimap: { enabled: false },
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 12,
            lineHeight: 19,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            diffWordWrap: 'on',
            ignoreTrimWhitespace: false,
            renderOverviewRuler: false,
            scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9, useShadows: false },
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </Modal>
  )
}
