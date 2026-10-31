import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUp,
  FileText,
  Folder,
  GitBranch,
  Plus,
  Search,
  Settings,
  Square,
  Terminal,
} from 'lucide-react'
import { useAppStore, effectiveModel } from '../store'
import { modelShort, parseRouteValue, providerReady, routeValue } from '../lib/providers'
import { runAgent } from '../lib/agent'
import { basename, flattenTree, formatTime } from '../lib/format'
import type { ChatMessage, ChatMode, ToolCall } from '../lib/types'
import { Window } from './Chrome'
import { Markdown } from './Markdown'

let activeController: AbortController | null = null

const MODES: Array<{ id: ChatMode; label: string; hint: string }> = [
  { id: 'chat', label: 'CHAT', hint: 'Talk about the code. No tools.' },
  { id: 'agent', label: 'AGENT', hint: 'Read, edit and run with approval.' },
  { id: 'plan', label: 'PLAN', hint: 'Read-only implementation planning.' },
  { id: 'debug', label: 'DEBUG', hint: 'Diagnose before patching.' },
  { id: 'docs', label: 'DOCS', hint: 'Read code and update documentation.' },
]

const SUGGESTIONS: Record<ChatMode, string[]> = {
  chat: [
    'Explain the architecture of this workspace.',
    'Where is the main entry point and what does it do?',
    'What would you test first in this project?',
  ],
  agent: [
    'Read this project and tell me where to start.',
    'Find the largest source file and suggest one focused improvement.',
    'Add a short section to the README explaining how to run the project.',
  ],
  plan: [
    'Plan a refactor of the largest source file.',
    'Plan how to add tests to this project.',
    'Plan a small feature and list every file it touches.',
  ],
  debug: [
    'Find the most likely source of a build failure here.',
    'Inspect error handling and point out weak spots.',
    'Trace how data flows through the app.',
  ],
  docs: [
    'Update the README to match the current code.',
    'Write a short architecture note for this project.',
    'Find documentation that is out of date and fix it.',
  ],
}

function prettyArgs(raw: string): string {
  if (!raw.trim()) return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const clone = { ...(parsed as Record<string, unknown>) }
      if (typeof clone.content === 'string' && clone.content.length > 3000) {
        clone.content = `${clone.content.slice(0, 3000)}\n… (${clone.content.length} chars)`
      }
      return JSON.stringify(clone, null, 2)
    }
  } catch {
    /* raw */
  }
  return raw.slice(0, 3000)
}

function toolTarget(call: ToolCall): string {
  try {
    const args = JSON.parse(call.arguments || '{}') as Record<string, unknown>
    const value = args.path || args.command || args.query || args.message || ''
    return String(value || '')
  } catch {
    return ''
  }
}

function ToolIcon({ name }: { name: string }) {
  if (name === 'run_command' || name === 'git_commit') return <Terminal size={11} />
  if (name === 'search_code') return <Search size={11} />
  if (name.startsWith('git_')) return <GitBranch size={11} />
  if (name === 'list_files') return <Folder size={11} />
  return <FileText size={11} />
}

const STATUS_LABEL: Record<ToolCall['status'], string> = {
  pending: 'QUEUED',
  running: 'RUNNING',
  awaiting: 'APPROVAL',
  done: 'OK',
  error: 'ERR',
  rejected: 'REJECTED',
}

function ToolCallCard({ call }: { call: ToolCall }) {
  const args = prettyArgs(call.arguments)
  const target = toolTarget(call)
  return (
    <div className="toolcall">
      <div className="toolcall-bar">
        <ToolIcon name={call.name} />
        <span className="tool-name">{call.name}</span>
        {target ? <span className="tool-target">{target}</span> : null}
        <span className={`tool-status ${call.status}`}>{STATUS_LABEL[call.status]}</span>
      </div>
      {args ? (
        <details>
          <summary className="tool-expand">ARGS</summary>
          <pre className="toolcall-body">{args}</pre>
        </details>
      ) : null}
      {call.error ? <pre className="toolcall-body" style={{ color: 'var(--red)' }}>{call.error}</pre> : null}
      {call.result ? (
        <details open={call.status === 'error' || call.result.length <= 1400}>
          <summary className="tool-expand">RESULT</summary>
          <pre className="toolcall-body">{call.result.slice(0, 6000)}</pre>
        </details>
      ) : null}
    </div>
  )
}

function MessageView({ message }: { message: ChatMessage }) {
  const waiting =
    message.streaming &&
    !message.content &&
    !message.reasoning &&
    (!message.toolCalls || message.toolCalls.length === 0)

  return (
    <div className={`msg ${message.role}`}>
      <div className="msg-gutter">
        <span className="msg-role">{message.role === 'user' ? 'YOU' : 'AGENT'}</span>
        <span className="msg-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="msg-body">
        {message.reasoning ? (
          <details className="reasoning">
            <summary>THINKING · {message.reasoning.length} CHARS</summary>
            <pre>{message.reasoning}</pre>
          </details>
        ) : null}
        {message.content ? <Markdown content={message.content} /> : null}
        {waiting ? (
          <div className="msg-wait">
            <span className="stream-cursor" /> WAITING FOR FIRST TOKEN
          </div>
        ) : null}
        {message.toolCalls?.map((call) => <ToolCallCard key={call.id} call={call} />)}
        {message.error ? <div className="msg-error">[ERR] {message.error}</div> : null}
        {message.stopped ? <div className="stopped-note">STOPPED BY USER</div> : null}
        {message.streaming && (message.content || message.reasoning) ? <span className="stream-cursor" /> : null}
        {!message.streaming && !message.error && message.model ? (
          <div className="msg-model">{message.provider ? `${message.provider} · ` : ''}{modelShort(message.model)}</div>
        ) : null}
      </div>
    </div>
  )
}

export function ChatPanel() {
  const messages = useAppStore((state) => state.messages)
  const running = useAppStore((state) => state.running)
  const chatMode = useAppStore((state) => state.chatMode)
  const chatModel = useAppStore((state) => state.chatModel)
  const settings = useAppStore((state) => state.settings)
  const health = useAppStore((state) => state.health)
  const tree = useAppStore((state) => state.tree)
  const tabs = useAppStore((state) => state.tabs)
  const activePath = useAppStore((state) => state.activePath)
  const setChatModel = useAppStore((state) => state.setChatModel)
  const setChatMode = useAppStore((state) => state.setChatMode)
  const addMessage = useAppStore((state) => state.addMessage)
  const updateMessage = useAppStore((state) => state.updateMessage)
  const appendToMessage = useAppStore((state) => state.appendToMessage)
  const upsertToolCall = useAppStore((state) => state.upsertToolCall)
  const setRunning = useAppStore((state) => state.setRunning)
  const clearChat = useAppStore((state) => state.clearChat)
  const pushToast = useAppStore((state) => state.pushToast)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const loadTree = useAppStore((state) => state.loadTree)
  const refreshTabs = useAppStore((state) => state.refreshTabs)
  const loadGit = useAppStore((state) => state.loadGit)

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stickRef = useRef(true)

  const resolved = effectiveModel(settings, chatMode, chatModel)
  const ready = providerReady(resolved?.provider)
  const activeTab = tabs.find((tab) => tab.path === activePath)
  const modeHint = MODES.find((mode) => mode.id === chatMode)?.hint || ''

  const modelGroups = useMemo(
    () =>
      settings.providers
        .filter((provider) => provider.models.length > 0)
        .map((provider) => ({ provider, models: provider.models })),
    [settings.providers],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(180, Math.max(58, el.scrollHeight))}px`
  }, [input])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
  }

  async function send() {
    const text = input.trim()
    if (!text || running) return
    const state = useAppStore.getState()
    const mode = state.chatMode
    const target = effectiveModel(state.settings, mode, state.chatModel)
    if (!target || !providerReady(target.provider)) {
      pushToast('Add an API key for your provider in settings.', 'error')
      setSettingsOpen(true)
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    const assistantId = crypto.randomUUID()
    addMessage(userMessage)
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      model: target.model,
      provider: target.provider.name,
      streaming: true,
    })
    setInput('')
    stickRef.current = true
    setRunning(true)

    const controller = new AbortController()
    activeController = controller
    const history = useAppStore.getState().messages.filter((message) => message.id !== assistantId)
    const openTab = state.tabs.find((tab) => tab.path === state.activePath)
    const openFile =
      openTab && state.settings.contextOpenFile
        ? { path: openTab.path, content: openTab.content.slice(0, 40000) }
        : null
    const treeSummary = flattenTree(state.tree)

    try {
      const result = await runAgent({
        mode,
        history,
        settings: state.settings,
        provider: target.provider,
        model: target.model,
        signal: controller.signal,
        workspace: state.health?.workspace || { name: 'workspace', path: '' },
        treeSummary,
        openFile,
        callbacks: {
          onText: (delta) => appendToMessage(assistantId, 'content', delta),
          onReasoning: (delta) => appendToMessage(assistantId, 'reasoning', delta),
          onToolUpdate: (call) => upsertToolCall(assistantId, call),
        },
      })
      updateMessage(assistantId, (message) => ({
        ...message,
        streaming: false,
        content:
          message.content ||
          (message.toolCalls && message.toolCalls.length > 0 ? '' : '(empty response from model)'),
      }))
      if (result.mutated) {
        await Promise.all([loadTree(), refreshTabs(), loadGit()])
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      if (aborted) {
        updateMessage(assistantId, (message) => ({
          ...message,
          streaming: false,
          stopped: true,
          content: message.content || '[stopped]',
        }))
      } else {
        const message = err instanceof Error ? err.message : 'Agent failed'
        updateMessage(assistantId, (current) => ({ ...current, streaming: false, error: message }))
        pushToast(message, 'error')
      }
    } finally {
      if (activeController === controller) activeController = null
      setRunning(false)
      stickRef.current = true
    }
  }

  function stop() {
    activeController?.abort()
  }

  function newChat() {
    if (running) return
    if (messages.length > 0 && !window.confirm('Clear this conversation?')) return
    clearChat()
  }

  return (
    <Window
      className="agent-win"
      title="AGENT"
      meta={`${chatMode.toUpperCase()} · ${resolved ? modelShort(resolved.model) : 'NO MODEL'}`}
      actions={
        <>
          <button className="win-btn" title="New conversation" onClick={newChat} disabled={running}>
            <Plus size={12} />
          </button>
          <button className="win-btn" title="Agent settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={12} />
          </button>
        </>
      }
    >
      <div className="agent-top">
        <div className="mode-tabs" role="tablist" aria-label="Agent mode">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              role="tab"
              aria-selected={chatMode === mode.id}
              className={`mode-tab ${chatMode === mode.id ? 'active' : ''}`}
              onClick={() => setChatMode(mode.id)}
              title={mode.hint}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <select
          className="agent-model"
          value={chatModel ? routeValue(chatModel) : ''}
          onChange={(event) => setChatModel(parseRouteValue(event.target.value))}
          title="Model for this conversation"
          aria-label="Model"
        >
          <option value="">
            AUTO — {resolved ? `${resolved.provider.name} / ${modelShort(resolved.model)}` : 'NO MODEL'}
          </option>
          {modelGroups.map((group) => (
            <optgroup key={group.provider.id} label={group.provider.name}>
              {group.models.map((model) => (
                <option key={`${group.provider.id}::${model}`} value={`${group.provider.id}::${model}`}>
                  {model}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {!ready ? (
        <div className="agent-banner">
          <AlertTriangle size={11} />
          <span>
            NO API KEY FOR {resolved?.provider.name?.toUpperCase() || 'A PROVIDER'} — ADD ONE TO USE THE AGENT
          </span>
          <button className="btn btn-sm" onClick={() => setSettingsOpen(true)}>
            CONFIGURE
          </button>
        </div>
      ) : null}

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="glyph-box sm">∫</div>
            <div className="chat-empty-head">AGENT READY · {chatMode.toUpperCase()}</div>
            <div className="empty-sub" style={{ textAlign: 'left', maxWidth: 'none' }}>
              {modeHint} Workspace: <b style={{ color: 'var(--muted)' }}>{health?.workspace.name || 'workspace'}</b>.
              {activeTab ? ` Open file: ${basename(activeTab.path)}.` : ' No file open.'}
            </div>
            <div className="prompt-list">
              {SUGGESTIONS[chatMode].map((prompt) => (
                <button
                  key={prompt}
                  className="prompt-item"
                  onClick={() => {
                    setInput(prompt)
                    textareaRef.current?.focus()
                  }}
                >
                  <span className="caret">&gt;</span>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
            <div className="note">
              Keys stay in this browser. Requests are proxied through your self-hosted server. Writes and
              commands wait for approval by default.
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageView key={message.id} message={message} />)
        )}
      </div>

      <div className="composer">
        <div className="composer-meta">
          <span className="ctx">
            CTX <b>{activeTab && settings.contextOpenFile ? activeTab.path : 'none'}</b>
          </span>
          <span className="win-bar-spacer" />
          <span>{resolved ? `${resolved.provider.name} / ${modelShort(resolved.model)}` : 'NO MODEL'}</span>
        </div>
        <div className="composer-box">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder={ready ? `message the ${chatMode} · enter to send` : 'configure a provider to begin'}
            aria-label="Message the agent"
            spellCheck={false}
          />
          <div className="composer-actions">
            <span className="composer-hint">
              {running ? 'AGENT WORKING · ESC DOES NOT STOP' : 'ENTER SEND · SHIFT+ENTER NEWLINE'}
            </span>
            {running ? (
              <button className="stop-btn" onClick={stop}>
                <Square size={9} /> STOP
              </button>
            ) : (
              <button className="send-btn" onClick={() => void send()} disabled={!input.trim() || !ready} title="Send">
                <ArrowUp size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </Window>
  )
}
