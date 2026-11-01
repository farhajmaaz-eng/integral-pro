import { ACCENTS } from './appearance'
import type { ChatMessage, Provider, RouteKind, Settings } from './types'

const ROUTE_KINDS: RouteKind[] = ['chat', 'agent', 'plan', 'debug', 'docs']

export function safeFilename(value: string, fallback = 'download'): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || fallback
}

export function downloadBlob(filename: string, blob: Blob) {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeFilename(filename)
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

function codeFence(text: string): string {
  const longest = (text.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 2)
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}\n${text.replace(/\s+$/, '')}\n${ticks}`
}

function clock(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function chatMarkdown(
  messages: ChatMessage[],
  meta: { workspace: string; mode: string; model?: string; provider?: string },
): string {
  const lines: string[] = [
    '# Integral Pro conversation',
    '',
    `- Workspace: \`${meta.workspace || 'workspace'}\``,
    `- Mode: \`${meta.mode}\``,
    `- Model: \`${meta.provider ? `${meta.provider} / ` : ''}${meta.model || 'not selected'}\``,
    `- Exported: ${new Date().toISOString()}`,
    '',
  ]

  if (messages.length === 0) {
    lines.push('_No messages yet._', '')
    return lines.join('\n')
  }

  for (const message of messages) {
    lines.push(`## ${message.role === 'user' ? 'YOU' : 'AGENT'} · ${clock(message.createdAt)}`, '')
    if (message.content.trim()) lines.push(message.content.trim(), '')
    if (message.reasoning?.trim()) {
      lines.push('<details>', '<summary>THINKING</summary>', '', codeFence(message.reasoning), '', '</details>', '')
    }
    for (const call of message.toolCalls || []) {
      lines.push(`### Tool: \`${call.name}\` · ${call.status.toUpperCase()}`, '')
      if (call.arguments.trim()) lines.push(codeFence(call.arguments), '')
      if (call.error) lines.push(`**Error:** ${call.error}`, '')
      if (call.result) lines.push(codeFence(call.result), '')
    }
    if (message.error) lines.push(`**Error:** ${message.error}`, '')
    if (message.stopped) lines.push('_Stopped by user._', '')
    if (message.streaming) lines.push('_Still streaming when exported._', '')
    lines.push('---', '')
  }

  return lines.join('\n')
}

type ExportBundle = {
  format: 'integral-pro/settings'
  version: 1
  exportedAt: string
  note: string
  settings: Settings
}

export function settingsExport(settings: Settings): ExportBundle {
  return {
    format: 'integral-pro/settings',
    version: 1,
    exportedAt: new Date().toISOString(),
    note: 'API keys are intentionally omitted. Importing keeps keys already stored in this browser when the provider endpoint is unchanged.',
    settings: {
      ...settings,
      providers: settings.providers.map((provider) => ({ ...provider, apiKey: '' })),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

function endpointKey(value: string): string {
  try {
    const url = new URL(value.trim())
    url.hash = ''
    // Hosts are case-insensitive; paths and queries are not. Do not lowercase
    // the whole URL or a key could follow a redirect to a differently-cased path.
    url.protocol = url.protocol.toLowerCase()
    url.hostname = url.hostname.toLowerCase()
    return url.toString().replace(/\/+$/, '')
  } catch {
    return value.trim().replace(/\/+$/, '')
  }
}

function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeProvider(value: unknown, existing: Provider[]): Provider | null {
  if (!isRecord(value)) return null
  const id = text(value.id).trim()
  const baseUrl = text(value.baseUrl).trim()
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(id) || !validBaseUrl(baseUrl)) return null
  const previous = existing.find((provider) => provider.id === id)
  const models = Array.isArray(value.models)
    ? Array.from(
        new Set(
          value.models
            .filter((model): model is string => typeof model === 'string')
            .map((model) => model.trim().slice(0, 300))
            .filter(Boolean),
        ),
      ).slice(0, 200)
    : previous?.models || []
  // A matching id is not enough: only keep the browser-held key when the
  // endpoint is unchanged, otherwise an imported file could redirect it.
  const keepKey = previous && endpointKey(previous.baseUrl) === endpointKey(baseUrl)
  return {
    id,
    name: text(value.name, previous?.name || id).trim().slice(0, 120) || id,
    baseUrl: baseUrl.slice(0, 2000),
    apiKey: keepKey ? previous.apiKey : '',
    models,
  }
}

/**
 * Import a settings bundle without trusting its shape. Provider keys are never
 * read from the file; matching local providers keep the key already in this browser.
 */
export function importSettings(current: Settings, raw: unknown): Settings {
  if (!isRecord(raw)) throw new Error('Settings file must contain a JSON object')
  if (raw.format !== undefined && raw.format !== 'integral-pro/settings') {
    throw new Error('This is not an Integral Pro settings file')
  }
  const source = isRecord(raw.settings) ? raw.settings : raw

  const incomingProviders: Provider[] = []
  if (Array.isArray(source.providers)) {
    const seen = new Set<string>()
    for (const value of source.providers) {
      const provider = sanitizeProvider(value, current.providers)
      if (!provider || seen.has(provider.id)) continue
      seen.add(provider.id)
      incomingProviders.push(provider)
    }
  }
  const providers = incomingProviders.length > 0 ? incomingProviders : current.providers
  const providerIds = new Set(providers.map((provider) => provider.id))

  const routes = { ...current.routes }
  if (isRecord(source.routes)) {
    for (const kind of ROUTE_KINDS) {
      if (!(kind in source.routes)) continue
      const route = source.routes[kind]
      if (route === null) {
        routes[kind] = null
        continue
      }
      if (!isRecord(route)) continue
      const providerId = text(route.providerId).trim()
      const model = text(route.model).trim()
      routes[kind] = providerId && model && providerIds.has(providerId) ? { providerId, model } : null
    }
  }

  const requestedProvider = text(source.activeProviderId)
  const activeProviderId = providerIds.has(requestedProvider)
    ? requestedProvider
    : providerIds.has(current.activeProviderId)
      ? current.activeProviderId
      : providers[0]?.id || ''
  const activeProvider = providers.find((provider) => provider.id === activeProviderId)
  const requestedModel = text(source.activeModel)
  const activeModel = activeProvider?.models.includes(requestedModel)
    ? requestedModel
    : activeProvider?.id === current.activeProviderId && activeProvider?.models.includes(current.activeModel)
      ? current.activeModel
      : activeProvider?.models[0] || ''

  // Drop routes that point at a provider removed by this import. Leaving them
  // in place would silently fall back to the active provider later.
  for (const kind of ROUTE_KINDS) {
    const route = routes[kind]
    if (route && !providerIds.has(route.providerId)) routes[kind] = null
  }

  const accent = ACCENTS.some((preset) => preset.id === source.accent)
    ? (source.accent as Settings['accent'])
    : current.accent

  return {
    ...current,
    providers,
    activeProviderId,
    activeModel,
    routes,
    autoApply: bool(source.autoApply, current.autoApply),
    autoCommands: bool(source.autoCommands, current.autoCommands),
    agentInstructions: text(source.agentInstructions, current.agentInstructions).slice(0, 8000),
    contextOpenFile: bool(source.contextOpenFile, current.contextOpenFile),
    fontSize: number(source.fontSize, current.fontSize, 10, 22),
    wordWrap: bool(source.wordWrap, current.wordWrap),
    accent,
    density: source.density === 'compact' || source.density === 'comfortable' ? source.density : current.density,
    reducedMotion: bool(source.reducedMotion, current.reducedMotion),
    terminalFontSize: number(source.terminalFontSize, current.terminalFontSize, 10, 18),
    sidebarWidth: number(source.sidebarWidth, current.sidebarWidth, 190, 430),
    agentWidth: number(source.agentWidth, current.agentWidth, 300, 680),
    terminalHeight: number(source.terminalHeight, current.terminalHeight, 120, 520),
  }
}
