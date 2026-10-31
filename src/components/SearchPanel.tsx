import { useEffect, useRef, useState } from 'react'
import { Database, RefreshCw, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store'
import type { SearchHit } from '../lib/types'
import { escapeRegExp } from '../lib/format'

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = Array.from(new Set(query.toLowerCase().match(/[a-z0-9_]{2,}/g) || []))
  if (tokens.length === 0) return <>{text}</>
  const regex = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'ig')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, index) =>
        tokens.includes(part.toLowerCase()) ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>,
      )}
    </>
  )
}

export function SearchPanel() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const openFile = useAppStore((state) => state.openFile)
  const indexStatus = useAppStore((state) => state.indexStatus)
  const loadIndexStatus = useAppStore((state) => state.loadIndexStatus)
  const pushToast = useAppStore((state) => state.pushToast)

  async function run(value: string) {
    if (!value.trim()) {
      setHits([])
      setSearched(false)
      setError('')
      return
    }
    const id = ++sequence.current
    setBusy(true)
    setError('')
    try {
      const result = await api.search(value)
      if (id !== sequence.current) return
      setHits(result.hits)
      setSearched(true)
    } catch (err) {
      if (id !== sequence.current) return
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      if (id === sequence.current) setBusy(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void run(query), 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    void loadIndexStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reindex() {
    setBusy(true)
    try {
      const result = await api.rebuildIndex()
      await loadIndexStatus()
      pushToast(`indexed ${result.files} files in ${result.durationMs}ms`, 'success')
      if (query.trim()) await run(query)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Indexing failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="win-body">
      <div className="search-box">
        <div className="search-input-wrap">
          <Search size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void run(query)
            }}
            placeholder="search the workspace"
            aria-label="Search workspace"
            spellCheck={false}
          />
          {busy ? <span className="blink-square" style={{ width: 5, height: 5, background: 'var(--accent)' }} /> : null}
        </div>
        <div className="search-meta">
          <Database size={9} />
          <span>
            {indexStatus?.indexed ?? 0} FILES
            {indexStatus?.indexedAt
              ? ` · ${new Date(indexStatus.indexedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ' · NOT INDEXED'}
          </span>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => void reindex()} disabled={busy}>
            <RefreshCw size={9} /> REINDEX
          </button>
        </div>
      </div>
      <div className="side-scroll">
        {error ? <div className="side-empty" style={{ color: 'var(--red)' }}>[ERR] {error}</div> : null}
        {!error && searched && hits.length === 0 && !busy ? (
          <div className="side-empty">NO MATCHES<br />Try a shorter identifier.</div>
        ) : null}
        {!error && !searched && !busy ? (
          <div className="side-empty">
            SEARCH THE WORKSPACE
            <div style={{ marginTop: 10 }}>
              The index stores text files, not node_modules. Results include the file and line number.
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="kbd-line"><span>run search</span><b>ENTER</b></div>
              <div className="kbd-line"><span>quick open</span><b>CTRL P</b></div>
            </div>
          </div>
        ) : null}
        {hits.map((hit) => (
          <button
            key={`${hit.path}:${hit.line}:${hit.column}`}
            className="search-hit"
            onClick={() => void openFile(hit.path, hit.line, hit.column)}
            title={`${hit.path}:${hit.line}`}
          >
            <div className="search-hit-path">
              {hit.path} <span className="ln">:{hit.line}</span>
            </div>
            <div className="search-hit-text">
              <Highlight text={hit.text} query={query} />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
