import type { FileNode, GitCommit, GitStatus, Health, SearchHit } from './types'

const TOKEN_KEY = 'integral.token'

export class ApiError extends Error {
  status: number
  payload: unknown
  constructor(status: number, message: string, payload?: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) }
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Cannot reach the Integral server')
  }
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('integral:unauthorized'))
    throw new ApiError(401, 'Unauthorized', await safeJson(response))
  }
  if (!response.ok) {
    const payload = await safeJson(response)
    let message = `Request failed (${response.status})`
    if (payload && typeof payload === 'object' && 'error' in payload) {
      message = String((payload as { error: unknown }).error)
    }
    throw new ApiError(response.status, message, payload)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  health: () => request<Health>('/api/health'),

  tree: () => request<{ root: string; name: string; children: FileNode[]; truncated: boolean }>('/api/files/tree'),
  flatFiles: () => request<{ files: Array<{ path: string; size: number }>; truncated: boolean }>('/api/files/flat'),
  readFile: (path: string) =>
    request<{ path: string; content: string; size: number; mtime: number; exists: boolean }>(
      `/api/files/read${query({ path })}`,
    ),
  readFileOptional: (path: string) =>
    request<{ path: string; content: string; size: number; mtime: number; exists: boolean }>(
      `/api/files/read${query({ path, optional: 1 })}`,
    ),
  writeFile: (path: string, content: string) =>
    request<{ path: string; size: number; mtime: number }>('/api/files/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    }),
  createEntry: (path: string, type: 'file' | 'dir') =>
    request<{ path: string; type: string }>('/api/files/create', {
      method: 'POST',
      body: JSON.stringify({ path, type }),
    }),
  renameEntry: (from: string, to: string) =>
    request<{ from: string; to: string }>('/api/files/rename', {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),
  deleteEntry: (path: string) =>
    request<{ ok: boolean; path: string }>(`/api/files/file${query({ path })}`, { method: 'DELETE' }),

  search: (q: string) => request<{ query: string; hits: SearchHit[]; indexed: boolean }>(`/api/index/search${query({ q })}`),
  indexStatus: () => request<{ indexed: number; indexing: boolean; indexedAt: string | null }>('/api/index/status'),
  rebuildIndex: () =>
    request<{ files: number; skipped: number; durationMs: number; indexed: number; indexedAt: string | null }>(
      '/api/index/rebuild',
      { method: 'POST' },
    ),

  gitStatus: () => request<GitStatus>('/api/git/status'),
  gitLog: () => request<{ commits: GitCommit[] }>('/api/git/log'),
  gitDiff: (path: string) =>
    request<{ path: string; diff: string; original: string; modified: string }>(`/api/git/diff${query({ path })}`),
  gitCommit: (message: string) =>
    request<{ ok: boolean; commit: string; output: string }>('/api/git/commit', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  gitInit: () => request<{ ok: boolean; already: boolean }>('/api/git/init', { method: 'POST' }),

  models: (baseUrl: string, apiKey: string) =>
    request<{ models: string[] }>('/api/ai/models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl, apiKey }),
    }),

  exec: (command: string, cwd = '') =>
    request<{
      command: string
      cwd: string
      exitCode: number
      killed: boolean
      timedOut: boolean
      durationMs: number
      stdout: string
      stderr: string
    }>('/api/exec', {
      method: 'POST',
      body: JSON.stringify({ command, cwd }),
    }),
}
