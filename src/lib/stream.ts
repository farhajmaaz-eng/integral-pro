import { authHeaders } from './api'
import type { Provider } from './types'

export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: 'finish'; reason: string }
  | { type: 'usage'; usage: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' }

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text ?? '')
        return ''
      })
      .join('')
  }
  return ''
}

function normalizeChunk(json: unknown): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = []
  if (!json || typeof json !== 'object') return events
  const obj = json as Record<string, unknown>
  if (obj.error) {
    const error = obj.error
    const message =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Provider stream error'
    events.push({ type: 'error', message })
    return events
  }
  if (obj.usage) events.push({ type: 'usage', usage: obj.usage })

  const choices = Array.isArray(obj.choices) ? obj.choices : []
  const choice = choices[0] as Record<string, unknown> | undefined
  if (!choice) return events
  const delta = (choice.delta || {}) as Record<string, unknown>

  const content = textOf(delta.content)
  if (content) events.push({ type: 'text', text: content })
  const reasoning = textOf(delta.reasoning) || textOf(delta.reasoning_content)
  if (reasoning) events.push({ type: 'reasoning', text: reasoning })

  const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : []
  for (const item of toolCalls) {
    if (!item || typeof item !== 'object') continue
    const tc = item as Record<string, unknown>
    const fn = (tc.function || {}) as Record<string, unknown>
    const args = fn.arguments
    events.push({
      type: 'tool',
      index: Number(tc.index ?? 0),
      id: typeof tc.id === 'string' ? tc.id : undefined,
      name: typeof fn.name === 'string' ? fn.name : undefined,
      argumentsDelta:
        typeof args === 'string' ? args : args && typeof args === 'object' ? JSON.stringify(args) : undefined,
    })
  }

  const finish = choice.finish_reason
  if (typeof finish === 'string' && finish) events.push({ type: 'finish', reason: finish })
  return events
}

function parseBlock(block: string, emit: (event: ChatStreamEvent) => void) {
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (dataLines.length === 0) return
  const data = dataLines.join('\n').trim()
  if (!data) return
  if (data === '[DONE]') {
    emit({ type: 'done' })
    return
  }
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return
  }
  for (const event of normalizeChunk(json)) emit(event)
}

export function createSSEParser(emit: (event: ChatStreamEvent) => void) {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      for (const block of blocks) parseBlock(block, emit)
    },
    flush() {
      if (buffer.trim()) parseBlock(buffer, emit)
      buffer = ''
    },
  }
}

export type StreamChatOptions = {
  provider: Provider
  model: string
  messages: Array<Record<string, unknown>>
  tools?: Array<Record<string, unknown>>
  signal: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
  temperature?: number
  maxTokens?: number
}

export async function streamChat(options: StreamChatOptions): Promise<void> {
  const { provider, model, messages, tools, signal, onEvent } = options
  let response: Response
  try {
    response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model,
        messages,
        tools,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      signal,
    })
  } catch (err) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error(err instanceof Error ? err.message : 'Could not reach the AI proxy')
  }

  if (!response.ok) {
    let message = `Provider request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) message = payload.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  if (!response.body) throw new Error('Provider returned an empty response')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSSEParser(onEvent)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.flush()
  } catch (err) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    throw err
  } finally {
    reader.releaseLock()
  }
}
