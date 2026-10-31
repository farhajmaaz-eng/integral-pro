import { DiffEditor } from '@monaco-editor/react'
import { AlertTriangle, Play, ShieldCheck } from 'lucide-react'
import { resolveApproval } from '../lib/approval'
import { languageFor } from '../lib/language'
import { useAppStore } from '../store'
import { Modal } from './Modal'

export function ApprovalModal() {
  const approval = useAppStore((state) => state.approval)
  const isMobile = useAppStore((state) => state.isMobile)

  if (!approval) return null

  if (approval.kind === 'command') {
    return (
      <Modal
        title="PENDING COMMAND"
        meta="approval required"
        size="md"
        onClose={() => resolveApproval(false)}
        footer={
          <>
            <span style={{ fontSize: 8.5, color: 'var(--dim)', letterSpacing: '0.06em' }}>
              RUNS IN THE WORKSPACE AS THE SERVER USER
            </span>
            <span className="spacer" />
            <button className="btn" onClick={() => resolveApproval(false)}>
              REJECT
            </button>
            <button className="btn btn-primary" onClick={() => resolveApproval(true)}>
              <Play size={11} /> RUN
            </button>
          </>
        }
      >
        <div className="command-preview">
          <div className="cmd-head">
            <ShieldCheck size={11} /> {approval.title}
          </div>
          <pre>{approval.command}</pre>
        </div>
        <div className="warning-line">
          <AlertTriangle size={12} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            The agent is asking for permission to execute this command. It can modify or delete files in the
            workspace. {approval.detail || ''}
          </span>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="PENDING EDIT"
      meta={approval.path}
      size="full"
      onClose={() => resolveApproval(false)}
      footer={
        <>
          <span style={{ fontSize: 8.5, color: 'var(--dim)', letterSpacing: '0.06em' }}>
            REVIEW THE DIFF · NOTHING IS WRITTEN UNTIL YOU APPLY
          </span>
          <span className="spacer" />
          <button className="btn" onClick={() => resolveApproval(false)}>
            REJECT
          </button>
          <button className="btn btn-primary" onClick={() => resolveApproval(true)}>
            APPLY
          </button>
        </>
      }
    >
      <div className="diff-meta">
        <span className="path">{approval.path}</span>
        <span>{approval.detail || 'agent edit'}</span>
      </div>
      <div className="diff-wrap">
        <DiffEditor
          original={approval.before || ''}
          modified={approval.after || ''}
          language={languageFor(approval.path || '')}
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
