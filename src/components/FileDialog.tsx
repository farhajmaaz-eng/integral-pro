import { useEffect, useRef, useState } from 'react'
import { FilePlus, FolderPlus, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store'
import { Modal } from './Modal'

export function FileDialog() {
  const dialog = useAppStore((state) => state.fileDialog)
  const setDialog = useAppStore((state) => state.setFileDialog)
  const loadTree = useAppStore((state) => state.loadTree)
  const openFile = useAppStore((state) => state.openFile)
  const renamePath = useAppStore((state) => state.renamePath)
  const pushToast = useAppStore((state) => state.pushToast)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!dialog) return
    if (dialog.mode === 'rename') setValue(dialog.target || '')
    else if (dialog.mode === 'file') setValue(dialog.target ? `${dialog.target}/untitled.ts` : 'untitled.ts')
    else setValue(dialog.target ? `${dialog.target}/new-folder` : 'new-folder')
    setError('')
    window.setTimeout(() => {
      inputRef.current?.focus()
      if (dialog.mode === 'rename') {
        const dot = inputRef.current?.value.lastIndexOf('.') ?? -1
        if (dot > 0) inputRef.current?.setSelectionRange(0, dot)
        else inputRef.current?.select()
      } else {
        inputRef.current?.select()
      }
    }, 30)
  }, [dialog])

  if (!dialog) return null

  const title = dialog.mode === 'rename' ? 'RENAME' : dialog.mode === 'file' ? 'NEW FILE' : 'NEW FOLDER'

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (!dialog) return
    const path = value.trim().replace(/^\/+/, '')
    if (!path) {
      setError('A path is required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (dialog.mode === 'rename') {
        if (!dialog.target) return
        if (path === dialog.target) {
          setDialog(null)
          return
        }
        await api.renameEntry(dialog.target, path)
        renamePath(dialog.target, path)
        await loadTree()
        pushToast(`renamed to ${path}`, 'success')
      } else {
        await api.createEntry(path, dialog.mode === 'dir' ? 'dir' : 'file')
        await loadTree()
        if (dialog.mode === 'file') await openFile(path)
        pushToast(`created ${path}`, 'success')
      }
      setDialog(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      meta={dialog.mode === 'rename' ? dialog.target : 'workspace'}
      size="sm"
      onClose={() => setDialog(null)}
      footer={
        <>
          <span style={{ fontSize: 8.5, color: 'var(--dim)' }}>RELATIVE TO WORKSPACE ROOT</span>
          <span className="spacer" />
          <button className="btn" onClick={() => setDialog(null)}>
            CANCEL
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'WORKING' : dialog.mode === 'rename' ? 'RENAME' : 'CREATE'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="form-stack">
        <div className="field">
          <label htmlFor="file-dialog-path">
            {dialog.mode === 'rename' ? 'NEW PATH' : dialog.mode === 'file' ? 'FILE PATH' : 'FOLDER PATH'}
          </label>
          <input
            id="file-dialog-path"
            ref={inputRef}
            className="input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="hint">
            {dialog.mode === 'file'
              ? 'Parent folders are created automatically. Use forward slashes.'
              : dialog.mode === 'dir'
                ? 'Parent folders are created automatically.'
                : 'Changing the extension is allowed. Open tabs are updated.'}
          </span>
        </div>
        {error ? <div className="auth-error">[ERR] {error}</div> : null}
        <div style={{ display: 'flex', gap: 6, color: 'var(--dim)', fontSize: 9 }}>
          {dialog.mode === 'file' ? <FilePlus size={12} /> : dialog.mode === 'dir' ? <FolderPlus size={12} /> : <Pencil size={12} />}
          <span>{title.toLowerCase()}</span>
        </div>
      </form>
    </Modal>
  )
}
