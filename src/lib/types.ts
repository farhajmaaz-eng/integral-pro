export type FileNode = {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  truncated?: boolean
  children?: FileNode[]
}

export type Health = {
  ok: boolean
  version: string
  authRequired: boolean
  workspace: { name: string; path: string }
  index: { indexed: number; indexing: boolean; indexedAt: string | null }
  node: string
}

export type GitChange = {
  path: string
  status: string
  staged: boolean
  raw: string
}

export type GitStatus = {
  isRepo: boolean
  branch: string | null
  ahead: number
  behind: number
  changes: GitChange[]
  workspace?: string
}

export type GitCommit = {
  hash: string
  author: string
  when: string
  subject: string
}

export type SearchHit = {
  path: string
  line: number
  column: number
  text: string
}

export type Provider = {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

export type RouteKind = 'chat' | 'agent' | 'plan' | 'debug' | 'docs'

export type ModelRoute = { providerId: string; model: string } | null

export type Settings = {
  providers: Provider[]
  activeProviderId: string
  activeModel: string
  routes: Record<RouteKind, ModelRoute>
  autoApply: boolean
  autoCommands: boolean
  agentInstructions: string
  contextOpenFile: boolean
  fontSize: number
  wordWrap: boolean
  sidebarWidth: number
  agentWidth: number
  terminalHeight: number
}

export type ChatMode = 'chat' | 'agent' | 'plan' | 'debug' | 'docs'

export type ToolStatus = 'pending' | 'running' | 'awaiting' | 'done' | 'error' | 'rejected'

export type ToolCall = {
  id: string
  name: string
  arguments: string
  status: ToolStatus
  result?: string
  error?: string
  startedAt?: number
  finishedAt?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  toolCalls?: ToolCall[]
  createdAt: number
  model?: string
  provider?: string
  error?: string
  streaming?: boolean
  stopped?: boolean
}

export type EditorTab = {
  path: string
  content: string
  savedContent: string
  dirty: boolean
}

export type ApprovalRequest = {
  id: string
  kind: 'write' | 'command'
  title: string
  detail?: string
  path?: string
  before?: string
  after?: string
  command?: string
}

export type DiffView = {
  title: string
  path: string
  original: string
  modified: string
  language?: string
}

export type Toast = {
  id: string
  kind: 'info' | 'success' | 'error'
  message: string
}

export type MobileTab = 'files' | 'editor' | 'agent' | 'terminal' | 'git'

export type SidebarView = 'files' | 'search' | 'git'
