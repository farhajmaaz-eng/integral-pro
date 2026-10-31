import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSSEParser, type ChatStreamEvent } from '../src/lib/stream.js'

function collect(chunks: string[], flush = true) {
  const events: ChatStreamEvent[] = []
  const parser = createSSEParser((event) => events.push(event))
  for (const chunk of chunks) parser.push(chunk)
  if (flush) parser.flush()
  return events
}

function data(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

test('SSE parser reassembles events split across chunks', () => {
  const events = collect([
    'data: {"choices":[{"delta":{"content":"Hel',
    'lo"}}]}\n\n',
    data({ choices: [{ delta: { content: ' world' } }] }),
    'data: [DONE]\n\n',
  ])
  assert.deepEqual(events, [
    { type: 'text', text: 'Hello' },
    { type: 'text', text: ' world' },
    { type: 'done' },
  ])
})

test('SSE parser emits reasoning, tool deltas and finish reasons', () => {
  const events = collect([
    data({ choices: [{ delta: { reasoning_content: 'thinking' } }] }),
    data({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'read_file', arguments: '{"path":' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    }),
    data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.ts"}' } }] } }] }),
  ])
  assert.deepEqual(events, [
    { type: 'reasoning', text: 'thinking' },
    {
      type: 'tool',
      index: 0,
      id: 'call_1',
      name: 'read_file',
      argumentsDelta: '{"path":',
    },
    { type: 'finish', reason: 'tool_calls' },
    { type: 'tool', index: 0, id: undefined, name: undefined, argumentsDelta: '"a.ts"}' },
  ])
})

test('SSE parser surfaces provider errors and usage', () => {
  const events = collect([
    data({ usage: { prompt_tokens: 10, completion_tokens: 2 } }),
    data({ error: { message: 'quota exceeded' } }),
  ])
  assert.deepEqual(events, [
    { type: 'usage', usage: { prompt_tokens: 10, completion_tokens: 2 } },
    { type: 'error', message: 'quota exceeded' },
  ])
})

test('SSE parser flushes a trailing event without a blank line', () => {
  const events = collect([data({ choices: [{ delta: { content: 'tail' } }] }).trimEnd()])
  assert.deepEqual(events, [{ type: 'text', text: 'tail' }])
})

test('SSE parser ignores malformed JSON and non-data lines', () => {
  const events = collect([': keep-alive\n\n', 'data: {not json}\n\n', 'event: ping\n\n'])
  assert.deepEqual(events, [])
})

test('SSE parser handles multiple data lines in one event', () => {
  const events = collect([
    'data: {"choices":\ndata: [{"delta":{"content":"joined"}}]}\n\n',
  ])
  assert.deepEqual(events, [{ type: 'text', text: 'joined' }])
})
