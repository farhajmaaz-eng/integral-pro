import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, ApiError } from './lib/api'
import { ACCENTS } from './lib/appearance'
import { DEFAULT_SETTINGS, resolveRoute } from './lib/providers'
import type {
  ApprovalRequest,
  ChatMessage,
  ChatMode,
  DiffView,
  EditorTab,
  FileNode,
  GitCommit,
  GitStatus,
  Health,
  MobileTab,
  ModelRoute,
  Provider,
  RouteKind,
  Settings,
  SidebarView,
  Toast,
  ToolCall,
} from './lib/types'

type FileDialog = { mode: 'file' | 'dir' | 'rename'; target?: string } | null

type AppState = {
  settings: Settings
  health: Health | null
  authRequired: boolean
  authChecked: boolean
  connected: boolean
  connectionError: string

  tree: FileNode[]
  treeLoading: boolean
  expanded: Record<string, boolean>

  tabs: EditorTab[]
  activePath: string | null
  cursor: { line: number; column: number }
  reveal: { path: string; line: number; column?: number; nonce: number } | null

  mobileTab: MobileTab
  isMobile: boolean
  sidebarView: SidebarView
  sidebarCollapsed: boolean
  terminalOpen: boolean
  settingsOpen: boolean
  exportOpen: boolean
  palette: 'files' | 'commands' | null
  fileDialog: FileDialog
  diffView: DiffView | null
  approval: ApprovalRequest | null

  messages: ChatMessage[]
  chatMode: ChatMode
  chatModel: ModelRoute
  running: boolean

  git: GitStatus | null
  gitCommits: GitCommit[]
  gitLoading: boolean

  indexStatus: { indexed: number; indexing: boolean; indexedAt: string | null } | null
  toasts: Toast[]
  saveAllBusy: boolean

  loadHealth: () => Promise<boolean>
  setAuthRequired: (value: boolean) => void
  updateSettings: (patch: Partial<Settings>) => void
  updateProvider: (id: string, patch: Partial<Provider>) => void
  addProvider: (provider: Provider) => void
  removeProvider: (id: string) => void
  setRoute: (kind: RouteKind, route: ModelRoute) => void
  setChatModel: (route: ModelRoute) => void
  setChatMode: (mode: ChatMode) => void

  loadTree: () => Promise<void>
  toggleDir: (path: string) => void
  setExpanded: (path: string, open: boolean) => void
  openFile: (path: string, line?: number, column?: number) => Promise<void>
  setActivePath: (path: string | null) => void
  setTabContent: (path: string, content: string) => void
  saveTab: (path: string) => Promise<void>
  saveAll: () => Promise<void>
  closeTab: (path: string, force?: boolean) => void
  dropPath: (path: string) => void
  renamePath: (from: string, to: string) => void
  refreshTabs: () => Promise<void>
  setCursor: (line: number, column: number) => void
  setReveal: (path: string, line: number, column?: number) => void

  setMobileTab: (tab: MobileTab) => void
  setIsMobile: (value: boolean) => void
  setSidebarView: (view: SidebarView) => void
  toggleSidebar: () => void
  setTerminalOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setExportOpen: (open: boolean) => void
  setPalette: (palette: 'files' | 'commands' | null) => void
  setFileDialog: (dialog: FileDialog) => void
  setDiffView: (view: DiffView | null) => void
  setApproval: (approval: ApprovalRequest | null) => void

  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, patch: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage)) => void
  appendToMessage: (id: string, field: 'content' | 'reasoning', delta: string) => void
  upsertToolCall: (messageId: string, call: ToolCall) => void
  clearChat: () => void
  setRunning: (running: boolean) => void

  loadGit: () => Promise<void>
  loadIndexStatus: () => Promise<void>

  pushToast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
}

const emptyHealth: Health | null = null
const savingTabs = new Set<string>()

const CHAT_MODES: ChatMode[] = ['chat', 'agent', 'plan', 'debug', 'docs']
const SIDEBAR_VIEWS: SidebarView[] = ['files', 'search', 'git']

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function storedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function storedBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function storedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Persisted state is user-editable and survives version changes, so never trust
 * its shape. A malformed provider or message should fall back to a default, not
 * crash the whole application on boot.
 */
function normalizeSettings(value: unknown): Settings {
  const saved = record(value)
  if (!saved) return DEFAULT_SETTINGS

  const providers: Provider[] = []
  const seen = new Set<string>()
  if (Array.isArray(saved.providers)) {
    for (const item of saved.providers) {
      const provider = record(item)
      if (!provider) continue
      const id = storedString(provider.id).trim()
      const baseUrl = storedString(provider.baseUrl).trim()
      if (!id || !baseUrl || seen.has(id)) continue
      seen.add(id)
      providers.push({
        id,
        name: storedString(provider.name, id).trim() || id,
        baseUrl,
        apiKey: storedString(provider.apiKey),
        models: Array.isArray(provider.models)
          ? provider.models.filter((model): model is string => typeof model === 'string')
          : [],
      })
    }
  }

  const routes = { ...DEFAULT_SETTINGS.routes }
  const savedRoutes = record(saved.routes)
  if (savedRoutes) {
    for (const kind of ['chat', 'agent', 'plan', 'debug', 'docs'] as RouteKind[]) {
      const route = savedRoutes[kind]
      if (route === null) {
        routes[kind] = null
        continue
      }
      const value = record(route)
      const providerId = storedString(value?.providerId).trim()
      const model = storedString(value?.model).trim()
      if (providerId && model) routes[kind] = { providerId, model }
    }
  }

  const finalProviders = providers.length > 0 ? providers : DEFAULT_SETTINGS.providers
  const activeProviderId =
    finalProviders.find((provider) => provider.id === saved.activeProviderId)?.id || finalProviders[0]?.id || ''
  const activeProvider = finalProviders.find((provider) => provider.id === activeProviderId)
  const savedModel = storedString(saved.activeModel)
  const activeModel =
    activeProvider?.models.includes(savedModel) && savedModel ? savedModel : activeProvider?.models[0] || ''

  return {
    providers: finalProviders,
    activeProviderId,
    activeModel,
    routes,
    autoApply: storedBool(saved.autoApply, DEFAULT_SETTINGS.autoApply),
    autoCommands: storedBool(saved.autoCommands, DEFAULT_SETTINGS.autoCommands),
    agentInstructions: storedString(saved.agentInstructions, DEFAULT_SETTINGS.agentInstructions).slice(0, 8000),
    contextOpenFile: storedBool(saved.contextOpenFile, DEFAULT_SETTINGS.contextOpenFile),
    fontSize: storedNumber(saved.fontSize, DEFAULT_SETTINGS.fontSize, 10, 22),
    wordWrap: storedBool(saved.wordWrap, DEFAULT_SETTINGS.wordWrap),
    accent: ACCENTS.some((preset) => preset.id === saved.accent)
      ? (saved.accent as Settings['accent'])
      : DEFAULT_SETTINGS.accent,
    density: saved.density === 'compact' || saved.density === 'comfortable' ? saved.density : DEFAULT_SETTINGS.density,
    reducedMotion: storedBool(saved.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    terminalFontSize: storedNumber(saved.terminalFontSize, DEFAULT_SETTINGS.terminalFontSize, 10, 18),
    sidebarWidth: storedNumber(saved.sidebarWidth, DEFAULT_SETTINGS.sidebarWidth, 190, 430),
    agentWidth: storedNumber(saved.agentWidth, DEFAULT_SETTINGS.agentWidth, 300, 680),
    terminalHeight: storedNumber(saved.terminalHeight, DEFAULT_SETTINGS.terminalHeight, 120, 520),
  }
}

const TOOL_STATUSES = new Set<ToolCall['status']>(['pending', 'running', 'awaiting', 'done', 'error', 'rejected'])

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  const messages: ChatMessage[] = []
  for (const item of value) {
    const saved = record(item)
    if (!saved) continue
    const role = saved.role === 'user' || saved.role === 'assistant' ? saved.role : null
    if (!role) continue
    const content = storedString(saved.content)
    const toolCalls: ToolCall[] = []
    if (Array.isArray(saved.toolCalls)) {
      for (const rawCall of saved.toolCalls) {
        const call = record(rawCall)
        if (!call) continue
        const id = storedString(call.id)
        const name = storedString(call.name)
        if (!id || !name) continue
        const status = TOOL_STATUSES.has(call.status as ToolCall['status'])
          ? (call.status as ToolCall['status'])
          : 'error'
        const interrupted = status === 'running' || status === 'awaiting' || status === 'pending'
        toolCalls.push({
          id,
          name,
          arguments: storedString(call.arguments),
          status: interrupted ? 'error' : status,
          ...(storedString(call.result) ? { result: storedString(call.result) } : {}),
          ...(interrupted
            ? { error: 'Interrupted' }
            : storedString(call.error)
              ? { error: storedString(call.error) }
              : {}),
          ...(typeof call.startedAt === 'number' ? { startedAt: call.startedAt } : {}),
          ...(typeof call.finishedAt === 'number' ? { finishedAt: call.finishedAt } : {}),
        })
      }
    }
    const message: ChatMessage = {
      id: storedString(saved.id) || crypto.randomUUID(),
      role,
      content,
      createdAt:
        typeof saved.createdAt === 'number' && Number.isFinite(saved.createdAt) ? saved.createdAt : Date.now(),
      streaming: false,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(storedString(saved.reasoning) ? { reasoning: storedString(saved.reasoning) } : {}),
      ...(storedString(saved.model) ? { model: storedString(saved.model) } : {}),
      ...(storedString(saved.provider) ? { provider: storedString(saved.provider) } : {}),
      ...(storedString(saved.error) ? { error: storedString(saved.error) } : {}),
      ...(saved.stopped === true ? { stopped: true } : {}),
    }
    messages.push(message)
  }
  return messages.slice(-60)
}

function trimForStorage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    streaming: false,
    content: message.content.slice(0, 20000),
    reasoning: message.reasoning ? message.reasoning.slice(0, 8000) : undefined,
    toolCalls: message.toolCalls?.map((call) => ({
      ...call,
      arguments: call.arguments.slice(0, 4000),
      result: call.result ? call.result.slice(0, 4000) : undefined,
      error: call.error ? call.error.slice(0, 2000) : undefined,
    })),
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      health: emptyHealth,
      authRequired: false,
      authChecked: false,
      connected: false,
      connectionError: '',

      tree: [],
      treeLoading: false,
      expanded: {},

      tabs: [],
      activePath: null,
      cursor: { line: 1, column: 1 },
      reveal: null,

      mobileTab: 'files',
      isMobile: false,
      sidebarView: 'files',
      sidebarCollapsed: false,
      terminalOpen: true,
      settingsOpen: false,
      exportOpen: false,
      palette: null,
      fileDialog: null,
      diffView: null,
      approval: null,

      messages: [],
      chatMode: 'agent',
      chatModel: null,
      running: false,

      git: null,
      gitCommits: [],
      gitLoading: false,

      indexStatus: null,
      toasts: [],
      saveAllBusy: false,

      loadHealth: async () => {
        try {
          const health = await api.health()
          set({
            health,
            authRequired: false,
            authChecked: true,
            connected: true,
            connectionError: '',
            indexStatus: health.index,
          })
          void get().loadTree()
          void get().loadGit()
          return true
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Cannot reach the Integral server'
          if (err instanceof ApiError && err.status === 401) {
            set({ authRequired: true, authChecked: true, connected: false, connectionError: '' })
          } else {
            set({ authChecked: true, connected: false, connectionError: message })
            get().pushToast(message, 'error')
          }
          return false
        }
      },

      setAuthRequired: (value) => set({ authRequired: value }),

      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

      updateProvider: (id, patch) =>
        set((state) => {
          const providers = state.settings.providers.map((provider) =>
            provider.id === id ? { ...provider, ...patch } : provider,
          )
          const target = providers.find((provider) => provider.id === id)
          const routes = { ...state.settings.routes }
          let activeModel = state.settings.activeModel
          if (target) {
            for (const kind of Object.keys(routes) as RouteKind[]) {
              const route = routes[kind]
              if (route?.providerId === id && !target.models.includes(route.model)) routes[kind] = null
            }
            if (state.settings.activeProviderId === id && !target.models.includes(activeModel)) {
              activeModel = target.models[0] || ''
            }
          }
          return {
            settings: { ...state.settings, providers, routes, activeModel },
            ...(state.chatModel?.providerId === id && !target?.models.includes(state.chatModel.model)
              ? { chatModel: null }
              : {}),
          }
        }),

      addProvider: (provider) =>
        set((state) => {
          const providers = [...state.settings.providers, provider]
          return {
            settings: {
              ...state.settings,
              providers,
              activeProviderId: state.settings.activeProviderId || provider.id,
              activeModel: state.settings.activeModel || provider.models[0] || '',
            },
          }
        }),

      removeProvider: (id) =>
        set((state) => {
          const providers = state.settings.providers.filter((provider) => provider.id !== id)
          const fallback = providers[0]
          const routes = { ...state.settings.routes }
          for (const key of Object.keys(routes) as RouteKind[]) {
            if (routes[key]?.providerId === id) routes[key] = null
          }
          return {
            settings: {
              ...state.settings,
              providers,
              activeProviderId: state.settings.activeProviderId === id ? fallback?.id || '' : state.settings.activeProviderId,
              activeModel:
                state.settings.activeProviderId === id ? fallback?.models[0] || '' : state.settings.activeModel,
              routes,
            },
            chatModel: state.chatModel?.providerId === id ? null : state.chatModel,
          }
        }),

      setRoute: (kind, route) =>
        set((state) => ({
          settings: { ...state.settings, routes: { ...state.settings.routes, [kind]: route } },
        })),

      setChatModel: (route) => set({ chatModel: route }),
      setChatMode: (mode) => set({ chatMode: mode }),

      loadTree: async () => {
        set({ treeLoading: true })
        try {
          const result = await api.tree()
          set((state) => {
            const expanded = { ...state.expanded }
            if (Object.keys(expanded).length === 0) {
              for (const node of result.children) if (node.type === 'dir') expanded[node.path] = true
            }
            return { tree: result.children, treeLoading: false, expanded }
          })
        } catch (err) {
          set({ treeLoading: false })
          get().pushToast(err instanceof Error ? err.message : 'Could not load files', 'error')
        }
      },

      toggleDir: (path) =>
        set((state) => ({ expanded: { ...state.expanded, [path]: !state.expanded[path] } })),

      setExpanded: (path, open) =>
        set((state) => ({ expanded: { ...state.expanded, [path]: open } })),

      openFile: async (path, line, column) => {
        const state = get()
        const existing = state.tabs.find((tab) => tab.path === path)
        if (existing) {
          set({ activePath: path })
          if (line) set({ reveal: { path, line, column, nonce: Date.now() } })
          if (state.isMobile) set({ mobileTab: 'editor' })
          return
        }
        try {
          const file = await api.readFile(path)
          const tab: EditorTab = {
            path: file.path,
            content: file.content,
            savedContent: file.content,
            dirty: false,
          }
          set((current) => ({
            tabs: [...current.tabs.filter((item) => item.path !== file.path), tab],
            activePath: file.path,
            ...(current.isMobile ? { mobileTab: 'editor' as MobileTab } : {}),
          }))
          if (line) set({ reveal: { path: file.path, line, column, nonce: Date.now() } })
        } catch (err) {
          get().pushToast(err instanceof Error ? err.message : `Could not open ${path}`, 'error')
        }
      },

      setActivePath: (path) => set({ activePath: path }),

      setTabContent: (path, content) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.path === path ? { ...tab, content, dirty: content !== tab.savedContent } : tab,
          ),
        })),

      saveTab: async (path) => {
        if (savingTabs.has(path)) return
        const tab = get().tabs.find((item) => item.path === path)
        if (!tab || !tab.dirty) return
        const content = tab.content
        savingTabs.add(path)
        try {
          await api.writeFile(path, content)
          set((state) => ({
            tabs: state.tabs.map((item) =>
              item.path === path
                ? { ...item, savedContent: content, dirty: item.content !== content }
                : item,
            ),
          }))
          get().pushToast(`saved ${path}`, 'success')
        } catch (err) {
          get().pushToast(err instanceof Error ? err.message : `Could not save ${path}`, 'error')
        } finally {
          savingTabs.delete(path)
        }
      },

      saveAll: async () => {
        const dirty = get().tabs.filter((tab) => tab.dirty && !savingTabs.has(tab.path))
        if (dirty.length === 0) return
        set({ saveAllBusy: true })
        let saved = 0
        for (const tab of dirty) {
          const content = tab.content
          savingTabs.add(tab.path)
          try {
            await api.writeFile(tab.path, content)
            saved++
            set((state) => ({
              tabs: state.tabs.map((item) =>
                item.path === tab.path
                  ? { ...item, savedContent: content, dirty: item.content !== content }
                  : item,
              ),
            }))
          } catch (err) {
            get().pushToast(err instanceof Error ? err.message : `Could not save ${tab.path}`, 'error')
          } finally {
            savingTabs.delete(tab.path)
          }
        }
        set({ saveAllBusy: false })
        if (saved > 0) get().pushToast(`saved ${saved} file${saved === 1 ? '' : 's'}`, 'success')
      },

      closeTab: (path, force = false) => {
        const state = get()
        const index = state.tabs.findIndex((tab) => tab.path === path)
        if (index === -1) return
        const tab = state.tabs[index]
        if (tab.dirty && !force) {
          const ok = window.confirm(`${path} has unsaved changes. Close it anyway?`)
          if (!ok) return
        }
        const tabs = state.tabs.filter((item) => item.path !== path)
        let activePath = state.activePath
        if (activePath === path) {
          activePath = tabs[Math.min(index, tabs.length - 1)]?.path || null
        }
        set({
          tabs,
          activePath,
          reveal: state.reveal?.path === path ? null : state.reveal,
        })
      },

      dropPath: (path) => {
        const state = get()
        const affected = state.tabs.filter((tab) => tab.path === path || tab.path.startsWith(`${path}/`))
        if (affected.length === 0) return
        const tabs = state.tabs.filter((tab) => !affected.includes(tab))
        const activePath = tabs.some((tab) => tab.path === state.activePath) ? state.activePath : tabs[0]?.path || null
        const revealGone =
          state.reveal && (state.reveal.path === path || state.reveal.path.startsWith(`${path}/`))
        set({ tabs, activePath, reveal: revealGone ? null : state.reveal })
      },

      renamePath: (from, to) =>
        set((state) => {
          const mapPath = (path: string) => {
            if (path === from) return to
            if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`
            return path
          }
          return {
            tabs: state.tabs.map((tab) => {
              const next = mapPath(tab.path)
              return next === tab.path ? tab : { ...tab, path: next }
            }),
            activePath: state.activePath ? mapPath(state.activePath) : null,
            expanded: Object.fromEntries(Object.entries(state.expanded).map(([key, value]) => [mapPath(key), value])),
            reveal: state.reveal ? { ...state.reveal, path: mapPath(state.reveal.path) } : null,
          }
        }),

      refreshTabs: async () => {
        const tabs = get().tabs.filter((tab) => !tab.dirty)
        for (const tab of tabs) {
          try {
            const file = await api.readFile(tab.path)
            set((state) => ({
              tabs: state.tabs.map((item) =>
                item.path === tab.path && !item.dirty
                  ? { ...item, content: file.content, savedContent: file.content }
                  : item,
              ),
            }))
          } catch {
            /* file may have been deleted or renamed */
          }
        }
      },

      setCursor: (line, column) => set({ cursor: { line, column } }),
      setReveal: (path, line, column) => set({ reveal: { path, line, column, nonce: Date.now() } }),

      setMobileTab: (tab) => set({ mobileTab: tab }),
      setIsMobile: (value) => set({ isMobile: value }),
      setSidebarView: (view) => set({ sidebarView: view, sidebarCollapsed: false }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setTerminalOpen: (open) => set({ terminalOpen: open }),
      setSettingsOpen: (open) =>
        set(open ? { settingsOpen: true, exportOpen: false, palette: null } : { settingsOpen: false }),
      setExportOpen: (open) =>
        set(open ? { exportOpen: true, settingsOpen: false, palette: null } : { exportOpen: false }),
      setPalette: (palette) =>
        set(palette ? { palette, exportOpen: false, settingsOpen: false } : { palette }),
      setFileDialog: (dialog) => set({ fileDialog: dialog }),
      setDiffView: (view) => set({ diffView: view }),
      setApproval: (approval) => set({ approval }),

      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

      updateMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === id
              ? typeof patch === 'function'
                ? patch(message)
                : { ...message, ...patch }
              : message,
          ),
        })),

      appendToMessage: (id, field, delta) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === id ? { ...message, [field]: (message[field] || '') + delta } : message,
          ),
        })),

      upsertToolCall: (messageId, call) =>
        set((state) => ({
          messages: state.messages.map((message) => {
            if (message.id !== messageId) return message
            const toolCalls = message.toolCalls || []
            const index = toolCalls.findIndex((item) => item.id === call.id)
            if (index === -1) return { ...message, toolCalls: [...toolCalls, call] }
            const next = [...toolCalls]
            next[index] = { ...next[index], ...call }
            return { ...message, toolCalls: next }
          }),
        })),

      clearChat: () => {
        if (get().running) return
        set({ messages: [] })
      },
      setRunning: (running) => set({ running }),

      loadGit: async () => {
        set({ gitLoading: true })
        try {
          const [status, log] = await Promise.all([api.gitStatus(), api.gitLog()])
          set({ git: status, gitCommits: log.commits, gitLoading: false })
        } catch {
          set({ gitLoading: false })
        }
      },

      loadIndexStatus: async () => {
        try {
          const status = await api.indexStatus()
          set({ indexStatus: status })
        } catch {
          /* ignore */
        }
      },

      pushToast: (message, kind = 'info') => {
        const id = crypto.randomUUID()
        set((state) => ({ toasts: [...state.toasts.slice(-3), { id, kind, message }] }))
        window.setTimeout(() => get().dismissToast(id), 4800)
      },

      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
    }),
    {
      name: 'integral.state.v1',
      version: 1,
      partialize: (state) => ({
        settings: state.settings,
        messages: state.messages.slice(-60).map(trimForStorage),
        chatMode: state.chatMode,
        chatModel: state.chatModel,
        sidebarView: state.sidebarView,
        terminalOpen: state.terminalOpen,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      merge: (persisted, current) => {
        const saved = record(persisted) || {}
        const savedMode = storedString(saved.chatMode) as ChatMode
        const savedView = storedString(saved.sidebarView) as SidebarView
        const savedModel = record(saved.chatModel)
        const chatModel: ModelRoute =
          saved.chatModel === null
            ? null
            : savedModel &&
                typeof savedModel.providerId === 'string' &&
                typeof savedModel.model === 'string' &&
                savedModel.providerId &&
                savedModel.model
              ? { providerId: savedModel.providerId, model: savedModel.model }
              : null

        return {
          ...current,
          settings: normalizeSettings(saved.settings),
          messages: normalizeMessages(saved.messages),
          chatMode: CHAT_MODES.includes(savedMode) ? savedMode : current.chatMode,
          chatModel,
          sidebarView: SIDEBAR_VIEWS.includes(savedView) ? savedView : current.sidebarView,
          terminalOpen: storedBool(saved.terminalOpen, current.terminalOpen),
          sidebarCollapsed: storedBool(saved.sidebarCollapsed, current.sidebarCollapsed),
          running: false,
          tree: [],
          tabs: [],
          activePath: null,
          approval: null,
          diffView: null,
          settingsOpen: false,
          exportOpen: false,
          palette: null,
          fileDialog: null,
          health: null,
          authChecked: false,
          connected: false,
          connectionError: '',
        }
      },
    },
  ),
)

export function effectiveModel(settings: Settings, mode: ChatMode, override: ModelRoute) {
  const kind: RouteKind =
    mode === 'chat' ? 'chat' : mode === 'plan' ? 'plan' : mode === 'debug' ? 'debug' : mode === 'docs' ? 'docs' : 'agent'
  return resolveRoute(settings, kind, override)
}
