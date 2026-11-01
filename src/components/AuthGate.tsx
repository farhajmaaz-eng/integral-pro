import { useState } from 'react'
import { KeyRound, ArrowRight } from 'lucide-react'
import { setToken } from '../lib/api'
import { useAppStore } from '../store'
import { Logo } from './Chrome'

export function AuthGate() {
  const loadHealth = useAppStore((state) => state.loadHealth)
  const [token, setTokenValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!token.trim() || busy) return
    setBusy(true)
    setError('')
    setToken(token.trim())
    const ok = await loadHealth()
    setBusy(false)
    if (!ok) {
      const state = useAppStore.getState()
      if (state.connectionError) {
        setError(state.connectionError)
      } else {
        setToken('')
        setError('Token rejected. Check ACCESS_TOKEN on the server.')
      }
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-win">
        <div className="float-bar">
          <span className="win-dot" />
          <span className="float-title">INTEGRAL PRO</span>
          <span className="float-meta">auth gate</span>
          <span className="win-bar-spacer" />
          <span className="float-meta">v0.2</span>
        </div>
        <div className="auth-body">
          <div className="auth-brand">
            <Logo size={30} />
            <div>
              <div className="auth-title">ACCESS TOKEN REQUIRED</div>
              <div className="auth-sub">this server is locked down</div>
            </div>
          </div>
          <div className="note">
            The server was started with <b>ACCESS_TOKEN</b> set. Enter that token to open the workspace.
            It is stored in this browser only.
          </div>
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="access-token">ACCESS TOKEN</label>
              <div className="search-input-wrap">
                <KeyRound size={13} />
                <input
                  id="access-token"
                  type="password"
                  value={token}
                  onChange={(event) => setTokenValue(event.target.value)}
                  placeholder="paste token"
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
            </div>
            {error ? <div className="auth-error">{error}</div> : null}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy || !token.trim()}>
              {busy ? 'CONNECTING' : 'CONNECT'}
              <ArrowRight size={12} />
            </button>
          </form>
          <div className="auth-sub" style={{ lineHeight: 1.8 }}>
            SELF-HOSTED · BYOK · NO ACCOUNT
            <br />
            Unset ACCESS_TOKEN to disable this gate.
          </div>
        </div>
      </div>
    </div>
  )
}

export function ConnectionError() {
  const loadHealth = useAppStore((state) => state.loadHealth)
  const message = useAppStore((state) => state.connectionError)
  const [busy, setBusy] = useState(false)

  async function retry() {
    if (busy) return
    setBusy(true)
    await loadHealth()
    setBusy(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-win">
        <div className="float-bar">
          <span className="win-dot" />
          <span className="float-title">INTEGRAL PRO</span>
          <span className="float-meta">offline</span>
          <span className="win-bar-spacer" />
          <span className="float-meta">v0.2</span>
        </div>
        <div className="auth-body">
          <div className="auth-brand">
            <Logo size={30} />
            <div>
              <div className="auth-title">SERVER UNREACHABLE</div>
              <div className="auth-sub">no connection to the workspace</div>
            </div>
          </div>
          <div className="auth-error">{message || 'The Integral server did not respond.'}</div>
          <div className="note">
            Start the server with <b>npm start</b> or <b>npm run dev</b>, then retry. If you changed
            <b> PORT</b>, make sure this page is using the same port.
          </div>
          <button className="btn btn-primary btn-block" onClick={() => void retry()} disabled={busy}>
            {busy ? 'RETRYING' : 'RETRY CONNECTION'}
            <ArrowRight size={12} />
          </button>
          <div className="auth-sub" style={{ lineHeight: 1.8 }}>
            SELF-HOSTED · LOOPBACK BY DEFAULT
            <br />
            Check the server terminal for startup errors.
          </div>
        </div>
      </div>
    </div>
  )
}

export function BootScreen() {
  return (
    <div className="boot-screen">
      <Logo size={34} />
      <div className="boot-text">
        <span className="blink-square" />
        CONNECTING TO WORKSPACE
      </div>
    </div>
  )
}
