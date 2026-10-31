import { Readable } from 'node:stream'
import { Router } from 'express'
import { asyncRoute, HttpError } from './http.js'

export const aiRouter = Router()

function validateBaseUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'Provider base URL is required')
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new HttpError(400, 'Provider base URL is not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Provider base URL must use http or https')
  }
  return url
}

function chatUrl(baseUrl: string): string {
  const url = validateBaseUrl(baseUrl)
  const pathname = url.pathname.replace(/\/+$/, '')
  url.pathname = pathname.endsWith('/chat/completions') ? pathname : `${pathname}/chat/completions`
  return url.toString()
}

function modelsUrl(baseUrl: string): string {
  const url = validateBaseUrl(baseUrl)
  const pathname = url.pathname.replace(/\/+$/, '')
  url.pathname = pathname.endsWith('/chat/completions')
    ? pathname.replace(/\/chat\/completions$/, '/models')
    : `${pathname}/models`
  return url.toString()
}

function providerHeaders(apiKey: string | undefined, extra?: Record<string, string>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
    'HTTP-Referer': 'https://github.com/integral-pro',
    'X-Title': 'Integral Pro',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (extra && typeof extra === 'object') {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(key) && key.toLowerCase() !== 'authorization') {
        headers[key] = value.slice(0, 2048)
      }
    }
  }
  return headers
}

async function readError(response: Response): Promise<string> {
  try {
    const text = await response.text()
    try {
      const parsed = JSON.parse(text)
      const message = parsed?.error?.message || parsed?.message || parsed?.error
      if (typeof message === 'string') return message
    } catch {
      /* not JSON */
    }
    return text.slice(0, 1200) || `Upstream returned ${response.status}`
  } catch {
    return `Upstream returned ${response.status}`
  }
}

aiRouter.post('/chat', asyncRoute(async (req, res) => {
  const { baseUrl, apiKey, model, messages, tools, tool_choice, temperature, max_tokens, top_p, extraHeaders } = req.body || {}
  if (typeof model !== 'string' || !model.trim()) throw new HttpError(400, 'Model is required')
  if (!Array.isArray(messages) || messages.length === 0) throw new HttpError(400, 'Messages are required')

  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  }
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools
    if (tool_choice) payload.tool_choice = tool_choice
  }
  if (typeof temperature === 'number' && Number.isFinite(temperature)) payload.temperature = Math.max(0, Math.min(2, temperature))
  if (typeof max_tokens === 'number' && Number.isFinite(max_tokens)) payload.max_tokens = Math.max(1, Math.floor(max_tokens))
  if (typeof top_p === 'number' && Number.isFinite(top_p)) payload.top_p = Math.max(0, Math.min(1, top_p))

  const controller = new AbortController()
  let finished = false
  res.on('finish', () => { finished = true })
  res.on('close', () => {
    if (!finished) controller.abort()
  })

  let upstream: Response
  try {
    upstream = await fetch(chatUrl(baseUrl), {
      method: 'POST',
      headers: providerHeaders(apiKey, extraHeaders),
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err) {
    if (controller.signal.aborted) return
    const message = err instanceof Error ? err.message : 'Could not reach provider'
    throw new HttpError(502, `Could not reach provider: ${message}`)
  }

  if (!upstream.ok) {
    const message = await readError(upstream)
    throw new HttpError(502, `Provider error (${upstream.status}): ${message}`)
  }
  if (!upstream.body) throw new HttpError(502, 'Provider returned an empty response')

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0])
  stream.on('error', () => {
    if (!res.writableEnded) res.end()
  })
  stream.pipe(res)
}))

aiRouter.post('/models', asyncRoute(async (req, res) => {
  const { baseUrl, apiKey, extraHeaders } = req.body || {}
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(modelsUrl(baseUrl), {
      headers: providerHeaders(apiKey, extraHeaders),
      signal: controller.signal,
    })
    if (!response.ok) {
      const message = await readError(response)
      throw new HttpError(502, `Provider error (${response.status}): ${message}`)
    }
    const json = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>
      models?: Array<{ id?: string; name?: string }>
    }
    const list = (json.data || json.models || [])
      .map((item) => item.id || item.name || '')
      .filter((id): id is string => Boolean(id))
    res.json({ models: Array.from(new Set(list)).sort((a, b) => a.localeCompare(b)) })
  } catch (err) {
    if (err instanceof HttpError) throw err
    const message = controller.signal.aborted ? 'Provider timed out' : err instanceof Error ? err.message : 'Request failed'
    throw new HttpError(502, `Could not list models: ${message}`)
  } finally {
    clearTimeout(timeout)
  }
}))
