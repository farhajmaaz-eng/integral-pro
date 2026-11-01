import { useEffect, useState } from 'react'
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { api } from '../lib/api'
import { ACCENTS } from '../lib/appearance'
import {
  DEFAULT_SETTINGS,
  PROVIDER_PRESETS,
  isLocalProvider,
  newProviderFromPreset,
  parseRouteValue,
  providerReady,
  routeValue,
} from '../lib/providers'
import { useAppStore } from '../store'
import type { Provider, RouteKind } from '../lib/types'
import { Modal } from './Modal'

type Section = 'providers' | 'routing' | 'agent' | 'appearance' | 'about'

const ROUTES: Array<{ kind: RouteKind; label: string; note: string }> = [
  { kind: 'chat', label: 'CHAT', note: 'Conversation, explanations, questions' },
  { kind: 'agent', label: 'AGENT', note: 'Multi-file edits and tool use' },
  { kind: 'plan', label: 'PLAN', note: 'Read-only implementation plans' },
  { kind: 'debug', label: 'DEBUG', note: 'Diagnosis and fixes' },
  { kind: 'docs', label: 'DOCS', note: 'Cheap model for documentation work' },
]

function ModelOptions({ providers }: { providers: Provider[] }) {
  return (
    <>
      {providers
        .filter((provider) => provider.models.length > 0)
        .map((provider) => (
          <optgroup key={provider.id} label={provider.name}>
            {provider.models.map((model) => (
              <option key={`${provider.id}::${model}`} value={`${provider.id}::${model}`}>
                {model}
              </option>
            ))}
          </optgroup>
        ))}
    </>
  )
}

export function SettingsModal() {
  const open = useAppStore((state) => state.settingsOpen)
  const setOpen = useAppStore((state) => state.setSettingsOpen)
  const settings = useAppStore((state) => state.settings)
  const health = useAppStore((state) => state.health)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const updateProvider = useAppStore((state) => state.updateProvider)
  const addProvider = useAppStore((state) => state.addProvider)
  const removeProvider = useAppStore((state) => state.removeProvider)
  const setRoute = useAppStore((state) => state.setRoute)
  const pushToast = useAppStore((state) => state.pushToast)

  const [section, setSection] = useState<Section>('providers')
  const [editingId, setEditingId] = useState<string | null>(
    settings.activeProviderId || settings.providers[0]?.id || null,
  )
  const [draft, setDraft] = useState<Provider | null>(null)
  const [modelsText, setModelsText] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [preset, setPreset] = useState('openrouter')
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!open) return
    const provider = settings.providers.find((item) => item.id === editingId) || settings.providers[0] || null
    if (provider && provider.id !== editingId) setEditingId(provider.id)
    setDraft(provider ? { ...provider } : null)
    setModelsText(provider ? provider.models.join('\n') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, open])

  if (!open) return null

  const activeProvider = settings.providers.find((provider) => provider.id === settings.activeProviderId) || null

  function patchDraft(patch: Partial<Provider>) {
    if (!draft) return
    const next = { ...draft, ...patch }
    setDraft(next)
    updateProvider(draft.id, patch)
  }

  function add() {
    const provider = newProviderFromPreset(preset)
    addProvider(provider)
    setEditingId(provider.id)
    setDraft(provider)
    setModelsText(provider.models.join('\n'))
    setSection('providers')
    pushToast(`added ${provider.name}`, 'success')
  }

  function remove() {
    if (!draft) return
    const remaining = settings.providers.filter((provider) => provider.id !== draft.id)
    if (!window.confirm(`Remove provider "${draft.name}"? Its API key will be deleted from this browser.`)) return
    removeProvider(draft.id)
    const next = remaining[0] || null
    setEditingId(next?.id || null)
    setDraft(next ? { ...next } : null)
    setModelsText(next ? next.models.join('\n') : '')
  }

  async function fetchModels() {
    if (!draft || fetching) return
    setFetching(true)
    try {
      const result = await api.models(draft.baseUrl, draft.apiKey)
      if (result.models.length === 0) {
        pushToast('Provider returned no models', 'error')
        return
      }
      patchDraft({ models: result.models })
      setModelsText(result.models.join('\n'))
      pushToast(`loaded ${result.models.length} models`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not fetch models', 'error')
    } finally {
      setFetching(false)
    }
  }

  function onModelsChange(value: string) {
    setModelsText(value)
    if (!draft) return
    const models = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    updateProvider(draft.id, { models })
  }

  function resetAppearance() {
    updateSettings({
      accent: DEFAULT_SETTINGS.accent,
      density: DEFAULT_SETTINGS.density,
      reducedMotion: DEFAULT_SETTINGS.reducedMotion,
      fontSize: DEFAULT_SETTINGS.fontSize,
      wordWrap: DEFAULT_SETTINGS.wordWrap,
      terminalFontSize: DEFAULT_SETTINGS.terminalFontSize,
    })
    pushToast('appearance reset', 'success')
  }

  return (
    <Modal
      title="SETTINGS"
      meta={health?.workspace.name}
      onClose={() => setOpen(false)}
      size="xl"
      footer={
        <>
          <span style={{ fontSize: 8.5, color: 'var(--dim)', letterSpacing: '0.06em' }}>
            SAVED IN THIS BROWSER · KEYS ARE PROXIED PER REQUEST
          </span>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => setOpen(false)}>
            CLOSE
          </button>
        </>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button className={section === 'providers' ? 'active' : ''} onClick={() => setSection('providers')}>
            <KeyRound size={12} /> PROVIDERS
          </button>
          <button className={section === 'routing' ? 'active' : ''} onClick={() => setSection('routing')}>
            <RefreshCw size={12} /> ROUTING
          </button>
          <button className={section === 'agent' ? 'active' : ''} onClick={() => setSection('agent')}>
            <Check size={12} /> AGENT
          </button>
          <button className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}>
            <Palette size={12} /> APPEARANCE
          </button>
          <button className={section === 'about' ? 'active' : ''} onClick={() => setSection('about')}>
            <span style={{ width: 12, textAlign: 'center' }}>∫</span> ABOUT
          </button>
        </nav>

        <div className="settings-pane">
          {section === 'providers' ? (
            <>
              <div className="pane-head">
                <h2>MODEL PROVIDERS</h2>
                <p>
                  Any OpenAI-compatible endpoint. OpenRouter, OpenAI, Groq, Ollama, LM Studio or your own
                  gateway. Keys are kept in this browser's localStorage.
                </p>
              </div>

              <div className="provider-list">
                {settings.providers.map((provider) => (
                  <button
                    key={provider.id}
                    className={`provider-row ${provider.id === draft?.id ? 'active' : ''}`}
                    onClick={() => setEditingId(provider.id)}
                  >
                    <span className={`provider-dot ${providerReady(provider) ? 'ready' : ''}`} />
                    <span className="p-name">{provider.name}</span>
                    <span className="p-url">{provider.baseUrl}</span>
                  </button>
                ))}
                {settings.providers.length === 0 ? (
                  <div className="side-empty" style={{ padding: '10px 4px' }}>
                    NO PROVIDERS CONFIGURED
                  </div>
                ) : null}
              </div>

              <div className="provider-add">
                <select className="select" value={preset} onChange={(event) => setPreset(event.target.value)} style={{ flex: 1 }}>
                  {PROVIDER_PRESETS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={add}>
                  <Plus size={11} /> ADD
                </button>
              </div>

              {draft ? (
                <div className="form-stack" style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="provider-name">NAME</label>
                      <input
                        id="provider-name"
                        className="input"
                        value={draft.name}
                        onChange={(event) => patchDraft({ name: event.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="provider-url">BASE URL</label>
                      <input
                        id="provider-url"
                        className="input"
                        value={draft.baseUrl}
                        onChange={(event) => patchDraft({ baseUrl: event.target.value })}
                        spellCheck={false}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="provider-key">API KEY</label>
                    <div className="input-with-btn">
                      <input
                        id="provider-key"
                        className="input"
                        type={showKey ? 'text' : 'password'}
                        value={draft.apiKey}
                        onChange={(event) => patchDraft({ apiKey: event.target.value })}
                        placeholder={isLocalProvider(draft) ? 'not required for local endpoints' : 'sk-…'}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button className="btn btn-square" onClick={() => setShowKey((value) => !value)} title={showKey ? 'Hide key' : 'Show key'}>
                        {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <span className="hint">
                      Sent only to this server, then forwarded to the provider. Never stored server-side.
                    </span>
                  </div>

                  <div className="field">
                    <label htmlFor="provider-models">MODELS · ONE PER LINE</label>
                    <textarea
                      id="provider-models"
                      className="textarea"
                      value={modelsText}
                      onChange={(event) => onModelsChange(event.target.value)}
                      rows={6}
                      spellCheck={false}
                      style={{ minHeight: 110 }}
                    />
                    <div className="input-with-btn" style={{ marginTop: 2 }}>
                      <button className="btn btn-sm" onClick={() => void fetchModels()} disabled={fetching}>
                        <RefreshCw size={10} /> {fetching ? 'FETCHING' : 'FETCH MODELS'}
                      </button>
                      <span className="spacer" style={{ flex: 1 }} />
                      <button className="btn btn-danger btn-sm" onClick={remove}>
                        <Trash2 size={10} /> REMOVE
                      </button>
                    </div>
                  </div>

                  {isLocalProvider(draft) ? (
                    <div className="note">
                      Local endpoint detected. No API key needed. Make sure the server can reach this URL
                      (a container cannot reach <b>localhost</b> on your host — use host networking or a LAN address).
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="note" style={{ marginTop: 14 }}>
                  Add a provider to get started. OpenRouter is the fastest route to many models; Ollama runs
                  locally.
                </div>
              )}
            </>
          ) : null}

          {section === 'routing' ? (
            <>
              <div className="pane-head">
                <h2>MODEL ROUTING</h2>
                <p>
                  Assign a model to each job. AUTO uses the default provider and model below. You can also
                  override the model per conversation in the agent panel.
                </p>
              </div>

              <div className="form-grid" style={{ marginBottom: 16 }}>
                <div className="field">
                  <label htmlFor="active-provider">DEFAULT PROVIDER</label>
                  <select
                    id="active-provider"
                    className="select"
                    value={settings.activeProviderId}
                    onChange={(event) => {
                      const provider = settings.providers.find((item) => item.id === event.target.value)
                      updateSettings({
                        activeProviderId: event.target.value,
                        activeModel: provider?.models[0] || '',
                      })
                    }}
                  >
                    {settings.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="active-model">DEFAULT MODEL</label>
                  <select
                    id="active-model"
                    className="select"
                    value={settings.activeModel}
                    onChange={(event) => updateSettings({ activeModel: event.target.value })}
                  >
                    {(activeProvider?.models || []).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="route-row" style={{ borderTop: '1px solid var(--line)' }}>
                <label>JOB</label>
                <label>MODEL</label>
              </div>
              {ROUTES.map((route) => (
                <div className="route-row" key={route.kind}>
                  <label title={route.note}>{route.label}</label>
                  <select
                    className="select"
                    value={routeValue(settings.routes[route.kind])}
                    onChange={(event) => setRoute(route.kind, parseRouteValue(event.target.value))}
                  >
                    <option value="">AUTO — {activeProvider?.name || 'default'} / {settings.activeModel || 'none'}</option>
                    <ModelOptions providers={settings.providers} />
                  </select>
                </div>
              ))}

              <div className="note" style={{ marginTop: 16 }}>
                Model switching mid-conversation is supported. Changing the model only affects the next
                message; the transcript stays intact.
              </div>
            </>
          ) : null}

          {section === 'agent' ? (
            <>
              <div className="pane-head">
                <h2>AGENT BEHAVIOR</h2>
                <p>Standing instructions are injected into every agent run. Approvals are on by default.</p>
              </div>

              <div className="form-stack">
                <div className="field">
                  <label htmlFor="agent-instructions">STANDING INSTRUCTIONS</label>
                  <textarea
                    id="agent-instructions"
                    className="textarea"
                    value={settings.agentInstructions}
                    onChange={(event) => updateSettings({ agentInstructions: event.target.value })}
                    rows={5}
                    style={{ minHeight: 100 }}
                  />
                  <span className="hint">Applied to chat, agent, plan and debug runs.</span>
                </div>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.autoApply}
                    onChange={(event) => updateSettings({ autoApply: event.target.checked })}
                  />
                  <span>
                    AUTO-APPLY FILE CHANGES
                    <span className="check-sub">Skip the diff approval window. Commands still ask separately.</span>
                  </span>
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.autoCommands}
                    onChange={(event) => updateSettings({ autoCommands: event.target.checked })}
                  />
                  <span>
                    RUN COMMANDS WITHOUT APPROVAL
                    <span className="check-sub">The agent can execute shell commands in the workspace. Use with care.</span>
                  </span>
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.contextOpenFile}
                    onChange={(event) => updateSettings({ contextOpenFile: event.target.checked })}
                  />
                  <span>
                    INCLUDE THE OPEN FILE AS CONTEXT
                    <span className="check-sub">Sends the current buffer (up to 40k characters) with each run.</span>
                  </span>
                </label>

                <div className="note danger">
                  <b>PERMISSIONS.</b> The server can read and write every file in the configured workspace and
                  spawn a shell. Do not expose an unprotected instance to the public internet. Set
                  <b> ACCESS_TOKEN</b> if the host is reachable by others.
                </div>
              </div>
            </>
          ) : null}

          {section === 'appearance' ? (
            <>
              <div className="pane-head">
                <h2>APPEARANCE</h2>
                <p>
                  Adjust the tiled shell without leaving the charcoal base. Everything here is stored in this
                  browser.
                </p>
              </div>

              <div className="form-stack">
                <div className="field">
                  <label>ACCENT</label>
                  <div className="accent-grid">
                    {ACCENTS.map((preset) => {
                      const active = settings.accent === preset.id
                      return (
                        <button
                          key={preset.id}
                          className={`accent-swatch ${active ? 'active' : ''}`}
                          onClick={() => updateSettings({ accent: preset.id })}
                          aria-pressed={active}
                        >
                          <span className="swatch" style={{ background: preset.accent }} />
                          <span>{preset.label}</span>
                          {active ? <Check size={10} /> : null}
                        </button>
                      )
                    })}
                  </div>
                  <span className="hint">
                    Applies to chrome, selection, terminal cursor and syntax keywords. The rest of the palette
                    stays fixed.
                  </span>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>DENSITY</label>
                    <div className="segmented" role="group" aria-label="Interface density">
                      {(['comfortable', 'compact'] as const).map((density) => (
                        <button
                          key={density}
                          className={settings.density === density ? 'active' : ''}
                          onClick={() => updateSettings({ density })}
                          aria-pressed={settings.density === density}
                        >
                          {density.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <span className="hint">Compact tightens gaps, window bars and the status strip.</span>
                  </div>

                  <div className="field">
                    <label>MOTION</label>
                    <label className="check" style={{ paddingTop: 5 }}>
                      <input
                        type="checkbox"
                        checked={settings.reducedMotion}
                        onChange={(event) => updateSettings({ reducedMotion: event.target.checked })}
                      />
                      <span>
                        REDUCE MOTION
                        <span className="check-sub">Stop blinking, spinning and transition animations.</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="editor-font">EDITOR FONT SIZE</label>
                    <input
                      id="editor-font"
                      className="input"
                      type="number"
                      min={10}
                      max={22}
                      value={settings.fontSize}
                      onChange={(event) =>
                        updateSettings({ fontSize: Math.max(10, Math.min(22, Number(event.target.value) || 13)) })
                      }
                    />
                    <span className="hint">10–22 px. Mobile uses one pixel less.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="terminal-font">TERMINAL FONT SIZE</label>
                    <input
                      id="terminal-font"
                      className="input"
                      type="number"
                      min={10}
                      max={18}
                      value={settings.terminalFontSize}
                      onChange={(event) =>
                        updateSettings({
                          terminalFontSize: Math.max(10, Math.min(18, Number(event.target.value) || 12)),
                        })
                      }
                    />
                    <span className="hint">10–18 px. The PTY resizes after the font changes.</span>
                  </div>
                </div>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.wordWrap}
                    onChange={(event) => updateSettings({ wordWrap: event.target.checked })}
                  />
                  <span>
                    WORD WRAP
                    <span className="check-sub">Wrap long lines in the editor instead of scrolling sideways.</span>
                  </span>
                </label>

                <div className="appearance-preview" aria-hidden="true">
                  <div className="appearance-preview-bar">
                    <span className="win-dot" />
                    PREVIEW
                    <span className="win-bar-spacer" />
                    {settings.density.toUpperCase()}
                  </div>
                  <div className="appearance-preview-code">
                    <div>
                      <span className="pv-keyword">const</span> <span className="pv-name">integral</span> ={' '}
                      <span className="pv-string">'local-first'</span>
                    </div>
                    <div>
                      <span className="pv-comment">// accent · density · motion · font size</span>
                    </div>
                  </div>
                </div>

                <div>
                  <button className="btn btn-sm" onClick={resetAppearance}>
                    <RotateCcw size={10} /> RESET APPEARANCE
                  </button>
                </div>

                <div className="note">
                  <b>LOCAL ONLY.</b> Appearance settings are saved in localStorage and never sent to the
                  server. Export them from the EXPORT window if you want a portable copy.
                </div>
              </div>
            </>
          ) : null}

          {section === 'about' ? (
            <>
              <div className="pane-head">
                <h2>INTEGRAL PRO</h2>
                <p>Version {health?.version || '0.2.0'} · self-hosted browser IDE · BYOK.</p>
              </div>
              <div className="form-stack">
                <div className="note">
                  <b>NO ACCOUNT. NO TELEMETRY. NO MODEL LOCK-IN.</b>
                  <br />
                  The frontend talks to a small Node server that owns the workspace, git, PTY and project
                  index. Model requests are proxied through that server so browser CORS is not a problem.
                </div>
                <div className="field">
                  <label>WORKSPACE</label>
                  <div className="input" style={{ display: 'flex', alignItems: 'center', height: 29, color: 'var(--muted)' }}>
                    {health?.workspace.path || 'unknown'}
                  </div>
                  <span className="hint">Set WORKSPACE_DIR to point at any project on the server.</span>
                </div>
                <div className="field">
                  <label>KEYBOARD</label>
                  <div className="shortcut-grid" style={{ borderTop: 0, paddingTop: 0 }}>
                    <b>CTRL P</b><span>quick open file</span>
                    <b>CTRL K</b><span>command palette</span>
                    <b>CTRL S</b><span>save current file</span>
                    <b>CTRL SHIFT S</b><span>save all</span>
                    <b>CTRL J</b><span>toggle terminal</span>
                    <b>CTRL B</b><span>toggle sidebar</span>
                    <b>CTRL SHIFT E</b><span>export workspace, chat or settings</span>
                  </div>
                </div>
                <div className="field">
                  <label>SOURCE</label>
                  <a
                    href="https://github.com/farhajmaaz-eng/integral-pro"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)', fontSize: 10 }}
                  >
                    github.com/farhajmaaz-eng/integral-pro
                  </a>
                  <span className="hint">MIT licensed. Fork it, self-host it, change the accent color.</span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
