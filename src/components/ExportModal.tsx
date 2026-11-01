import { useRef, useState } from 'react'
import {
  Download,
  FileArchive,
  FileCode,
  FileJson,
  MessageSquare,
  Upload,
} from 'lucide-react'
import { api } from '../lib/api'
import {
  chatMarkdown,
  downloadBlob,
  downloadText,
  importSettings,
  safeFilename,
  settingsExport,
} from '../lib/export'
import { basename } from '../lib/format'
import { effectiveModel, useAppStore } from '../store'
import { Modal } from './Modal'

const MAX_IMPORT_BYTES = 1024 * 1024

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ExportModal() {
  const open = useAppStore((state) => state.exportOpen)
  const setOpen = useAppStore((state) => state.setExportOpen)
  const settings = useAppStore((state) => state.settings)
  const messages = useAppStore((state) => state.messages)
  const tabs = useAppStore((state) => state.tabs)
  const activePath = useAppStore((state) => state.activePath)
  const health = useAppStore((state) => state.health)
  const chatMode = useAppStore((state) => state.chatMode)
  const chatModel = useAppStore((state) => state.chatModel)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const pushToast = useAppStore((state) => state.pushToast)

  const [zipping, setZipping] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const activeTab = tabs.find((tab) => tab.path === activePath) || null
  const workspace = health?.workspace.name || 'workspace'
  const route = effectiveModel(settings, chatMode, chatModel)

  async function exportWorkspace() {
    if (zipping) return
    setZipping(true)
    try {
      const result = await api.exportWorkspace()
      downloadBlob(result.filename || `${safeFilename(workspace)}-${dateStamp()}.zip`, result.blob)
      pushToast(`exported ${result.files} files as zip`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not export the workspace', 'error')
    } finally {
      setZipping(false)
    }
  }

  function exportConversation() {
    if (messages.length === 0) {
      pushToast('There is no conversation to export yet', 'error')
      return
    }
    const markdown = chatMarkdown(messages, {
      workspace,
      mode: chatMode.toUpperCase(),
      model: route?.model || 'not selected',
      provider: route?.provider.name,
    })
    downloadText(
      `${safeFilename(workspace)}-conversation-${dateStamp()}.md`,
      markdown,
      'text/markdown;charset=utf-8',
    )
    pushToast(`exported ${messages.length} messages as markdown`, 'success')
  }

  function exportSettings() {
    const bundle = settingsExport(settings)
    downloadText(
      'integral-pro-settings.json',
      JSON.stringify(bundle, null, 2),
      'application/json;charset=utf-8',
    )
    pushToast('exported settings without API keys', 'success')
  }

  async function importSettingsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      pushToast('Settings files are limited to 1 MB', 'error')
      return
    }
    try {
      const raw: unknown = JSON.parse(await file.text())
      const next = importSettings(useAppStore.getState().settings, raw)
      updateSettings(next)
      pushToast('settings imported · existing keys kept for unchanged endpoints', 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not import that settings file', 'error')
    }
  }

  function exportActiveFile() {
    if (!activeTab) return
    downloadText(basename(activeTab.path), activeTab.content, 'text/plain;charset=utf-8')
    pushToast(`downloaded ${basename(activeTab.path)}`, 'success')
  }

  return (
    <Modal
      title="EXPORT"
      meta={workspace}
      onClose={() => setOpen(false)}
      size="lg"
      footer={
        <>
          <span style={{ fontSize: 8.5, color: 'var(--dim)', letterSpacing: '0.06em' }}>
            GENERATED LOCALLY · NOTHING LEAVES THIS MACHINE
          </span>
          <span className="spacer" />
          <button className="btn" onClick={() => setOpen(false)}>
            CLOSE
          </button>
        </>
      }
    >
      <div className="pane-head">
        <h2>TAKE YOUR WORK WITH YOU</h2>
        <p>
          Plain files, plain markdown and a portable settings bundle. No lock-in, no cloud account, no
          round-trip through a third party.
        </p>
      </div>

      <div className="export-list">
        <div className="export-row">
          <span className="export-icon">
            <FileArchive size={14} />
          </span>
          <div className="export-copy">
            <div className="export-title">
              WORKSPACE ARCHIVE
              <span className="export-badge">ZIP</span>
            </div>
            <div className="export-desc">
              Every file in <b>{workspace}</b>. Ignored folders, symlinks, dotenv files and known credential
              files are skipped.
            </div>
          </div>
          <div className="export-actions">
            <button className="btn btn-primary" onClick={() => void exportWorkspace()} disabled={zipping}>
              <Download size={11} /> {zipping ? 'BUILDING' : 'DOWNLOAD ZIP'}
            </button>
          </div>
        </div>

        <div className="export-row">
          <span className="export-icon">
            <MessageSquare size={14} />
          </span>
          <div className="export-copy">
            <div className="export-title">
              CONVERSATION
              <span className="export-badge">{messages.length} MSG</span>
            </div>
            <div className="export-desc">
              The current transcript as markdown, including tool calls, results and reasoning.
            </div>
          </div>
          <div className="export-actions">
            <button className="btn" onClick={exportConversation} disabled={messages.length === 0}>
              <Download size={11} /> EXPORT .MD
            </button>
          </div>
        </div>

        <div className="export-row">
          <span className="export-icon">
            <FileJson size={14} />
          </span>
          <div className="export-copy">
            <div className="export-title">
              SETTINGS
              <span className="export-badge">JSON</span>
            </div>
            <div className="export-desc">
              Providers, routes and appearance. API keys are removed before the file is written. Import
              restores the rest and keeps a key only when the provider endpoint is unchanged.
            </div>
          </div>
          <div className="export-actions">
            <button className="btn" onClick={exportSettings}>
              <Download size={11} /> EXPORT
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={11} /> IMPORT
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden-input"
              onChange={(event) => void importSettingsFile(event)}
            />
          </div>
        </div>

        <div className="export-row">
          <span className="export-icon">
            <FileCode size={14} />
          </span>
          <div className="export-copy">
            <div className="export-title">CURRENT FILE</div>
            <div className="export-desc">
              {activeTab ? (
                <>
                  <b>{activeTab.path}</b> · {activeTab.content.length} characters
                  {activeTab.dirty ? ' · unsaved changes included' : ''}
                </>
              ) : (
                'Open a file to download its current buffer.'
              )}
            </div>
          </div>
          <div className="export-actions">
            <button className="btn" onClick={exportActiveFile} disabled={!activeTab}>
              <Download size={11} /> DOWNLOAD
            </button>
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 12 }}>
        <b>KEYS STAY IN THIS BROWSER.</b> Settings exports never contain API keys. Imports are validated
        before they are applied, and unknown or malformed providers are ignored.
      </div>
    </Modal>
  )
}
