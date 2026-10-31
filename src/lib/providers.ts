import type { ModelRoute, Provider, RouteKind, Settings } from './types'

export const PROVIDER_PRESETS: Array<Omit<Provider, 'apiKey' | 'id'> & { key: string }> = [
  {
    key: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openrouter/auto', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5.1', 'google/gemini-2.5-pro'],
  },
  {
    key: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  },
  {
    key: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
  },
  {
    key: 'ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5-coder:7b'],
  },
  {
    key: 'lmstudio',
    name: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    models: ['local-model'],
  },
]

export const DEFAULT_SETTINGS: Settings = {
  providers: [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      models: ['openrouter/auto', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5.1', 'google/gemini-2.5-pro'],
    },
    {
      id: 'ollama',
      name: 'Ollama (local)',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      models: ['qwen2.5-coder:7b'],
    },
  ],
  activeProviderId: 'openrouter',
  activeModel: 'openrouter/auto',
  routes: { chat: null, agent: null, plan: null, debug: null, docs: null },
  autoApply: false,
  autoCommands: false,
  agentInstructions:
    'Be concise and direct. Inspect the code before changing it. Prefer small, surgical edits over rewrites. Never invent APIs or file contents.',
  contextOpenFile: true,
  fontSize: 13,
  wordWrap: true,
  sidebarWidth: 244,
  agentWidth: 392,
  terminalHeight: 232,
}

export function isLocalProvider(provider: Provider): boolean {
  try {
    const url = new URL(provider.baseUrl)
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

export function providerReady(provider: Provider | null | undefined): provider is Provider {
  if (!provider) return false
  return Boolean(provider.apiKey.trim()) || isLocalProvider(provider)
}

export function findProvider(settings: Settings, id: string | null | undefined): Provider | null {
  if (!id) return null
  return settings.providers.find((p) => p.id === id) ?? null
}

export function resolveRoute(
  settings: Settings,
  kind: RouteKind,
  override?: ModelRoute,
): { provider: Provider; model: string } | null {
  const candidates: ModelRoute[] = []
  if (override) candidates.push(override)
  candidates.push(settings.routes[kind])
  if (kind === 'agent' || kind === 'chat') {
    candidates.push({ providerId: settings.activeProviderId, model: settings.activeModel })
  } else {
    candidates.push({ providerId: settings.activeProviderId, model: settings.activeModel })
  }
  for (const route of candidates) {
    if (!route) continue
    const provider = findProvider(settings, route.providerId)
    if (provider && route.model) return { provider, model: route.model }
  }
  return null
}

export function routeValue(route: ModelRoute): string {
  return route ? `${route.providerId}::${route.model}` : ''
}

export function parseRouteValue(value: string): ModelRoute {
  if (!value) return null
  const idx = value.indexOf('::')
  if (idx === -1) return null
  return { providerId: value.slice(0, idx), model: value.slice(idx + 2) }
}

export function providerLabel(provider: Provider | null | undefined): string {
  return provider?.name || 'no provider'
}

export function modelShort(model: string): string {
  const parts = model.split('/')
  return parts[parts.length - 1] || model
}

export function newProviderFromPreset(key: string): Provider {
  const preset = PROVIDER_PRESETS.find((p) => p.key === key) ?? PROVIDER_PRESETS[0]
  return {
    id: `${preset.key}-${Math.random().toString(36).slice(2, 7)}`,
    name: preset.name,
    baseUrl: preset.baseUrl,
    apiKey: '',
    models: [...preset.models],
  }
}
