import { useEffect, useState } from 'react'
import { GitBranch, GitCommitHorizontal, RefreshCw, Play } from 'lucide-react'
import { api } from '../lib/api'
import { languageFor } from '../lib/language'
import { parseUnifiedDiff } from '../lib/format'
import { useAppStore } from '../store'

export function GitPanel({ embedded = false }: { embedded?: boolean }) {
  const git = useAppStore((state) => state.git)
  const commits = useAppStore((state) => state.gitCommits)
  const loading = useAppStore((state) => state.gitLoading)
  const loadGit = useAppStore((state) => state.loadGit)
  const setDiffView = useAppStore((state) => state.setDiffView)
  const pushToast = useAppStore((state) => state.pushToast)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [diffPath, setDiffPath] = useState('')

  useEffect(() => {
    void loadGit()
    const timer = window.setInterval(() => void loadGit(), 20000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openDiff(path: string) {
    setDiffPath(path)
    try {
      const result = await api.gitDiff(path)
      const fallback = parseUnifiedDiff(result.diff)
      setDiffView({
        title: path,
        path,
        original: result.original ?? fallback.original,
        modified: result.modified ?? fallback.modified,
        language: languageFor(path),
      })
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not load diff', 'error')
    } finally {
      setDiffPath('')
    }
  }

  async function commit() {
    if (!message.trim() || busy) return
    setBusy(true)
    try {
      const result = await api.gitCommit(message.trim())
      setMessage('')
      pushToast(result.commit || 'commit created', 'success')
      await loadGit()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Commit failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function init() {
    setBusy(true)
    try {
      await api.gitInit()
      await loadGit()
      pushToast('initialized git repository', 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Git init failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (git && !git.isRepo) {
    return (
      <div className="win-body">
        {!embedded ? (
          <div className="git-head">
            <div className="git-branch">
              <GitBranch size={12} />
              <span>NO REPOSITORY</span>
            </div>
            <span className="win-bar-spacer" />
            <button className="icon-btn" onClick={() => void loadGit()} title="Refresh">
              <RefreshCw size={12} />
            </button>
          </div>
        ) : null}
        <div className="side-empty">
          This workspace is not a git repository.
          <div style={{ marginTop: 10 }}>Initialize one to track changes, review diffs and commit from the IDE.</div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => void init()} disabled={busy}>
            {busy ? 'INITIALIZING' : 'GIT INIT'}
          </button>
        </div>
      </div>
    )
  }

  const changes = git?.changes || []

  return (
    <div className="win-body">
      {!embedded ? (
        <div className="git-head">
          <div className="git-branch" title={git?.branch || ''}>
            <GitBranch size={12} />
            <span>{git?.branch || '—'}</span>
            {git?.ahead ? <span className="muted">↑{git.ahead}</span> : null}
            {git?.behind ? <span className="muted">↓{git.behind}</span> : null}
          </div>
          <span className="win-bar-spacer" />
          <button className="icon-btn" onClick={() => void loadGit()} title="Refresh git status">
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
          </button>
        </div>
      ) : null}
      <div className="git-scroll">
        <div className="git-section-title">
          CHANGES <span className="count">{changes.length}</span>
          {changes.length > 0 ? <span style={{ marginLeft: 'auto' }}>CLICK TO DIFF</span> : null}
        </div>
        {changes.length === 0 ? (
          <div className="side-empty">WORKING TREE CLEAN</div>
        ) : (
          changes.map((change) => (
            <button
              key={`${change.path}:${change.raw}`}
              className="git-change"
              onClick={() => void openDiff(change.path)}
              title={`${change.raw} ${change.path}`}
            >
              <span className={`git-status-letter ${change.status}`}>{change.status}</span>
              <span className="git-path">{change.path}</span>
              {diffPath === change.path ? <span className="blink-square" style={{ width: 5, height: 5, background: 'var(--accent)' }} /> : null}
            </button>
          ))
        )}

        {changes.length > 0 ? (
          <div className="git-commit-box">
            <textarea
              className="textarea"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="commit message"
              rows={2}
              style={{ minHeight: 46 }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void commit()
              }}
            />
            <div className="commit-row">
              <span className="hint">stages all changes</span>
              <button className="btn btn-primary btn-sm" onClick={() => void commit()} disabled={busy || !message.trim()}>
                <GitCommitHorizontal size={11} />
                {busy ? 'COMMITTING' : 'COMMIT'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="git-section-title">
          RECENT <span className="count">{commits.length}</span>
        </div>
        {commits.length === 0 ? (
          <div className="side-empty">NO COMMITS YET</div>
        ) : (
          commits.map((commit) => (
            <div className="git-log-item" key={commit.hash} title={`${commit.author} · ${commit.when}`}>
              <span className="hash">{commit.hash}</span>
              <span className="subject">{commit.subject}</span>
              <span className="meta">{commit.when}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
