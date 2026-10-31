import { api, ApiError } from './api'
import { requestApproval } from './approval'
import { modelShort } from './providers'
import { streamChat } from './stream'
import type {
  ChatMessage,
  ChatMode,
  FileNode,
  Provider,
  Settings,
  ToolCall,
} from './types'

const MAX_STEPS = 16
const MAX_TOOL_RESULT = 30000

type ApiMessage = Record<string, unknown>

export type AgentCallbacks = {
  onText: (delta: string) => void
  onReasoning: (delta: string) => void
  onToolUpdate: (call: ToolCall) => void
}

export type RunAgentOptions = {
  mode: ChatMode
  history: ChatMessage[]
  settings: Settings
  provider: Provider
  model: string
  signal: AbortSignal
  workspace: { name: string; path: string }
  treeSummary: string[]
  openFile: { path: string; content: string } | null
  callbacks: AgentCallbacks
}

const READ_TOOLS = new Set(['list_files', 'read_file', 'search_code', 'git_status', 'git_diff'])
const DOC_TOOLS = new Set([
  'list_files',
  'read_file',
  'search_code',
  'write_file',
  'edit_file',
  'git_status',
  'git_diff',
])

const TOOL_DEFINITIONS: Array<Record<string, unknown>> = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in the workspace. Use this to understand project structure.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to the workspace root. Use "." for the root.' },
          depth: { type: 'number', description: 'How many directory levels to include, 1-4. Default 2.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file. Returns line-numbered content. Read files before editing them.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace root.' },
          start_line: { type: 'number', description: 'Optional first line (1-based).' },
          end_line: { type: 'number', description: 'Optional last line (inclusive).' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search the indexed workspace for a string or identifier. Returns matching file paths and lines.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text or identifier to search for.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with complete content. Prefer edit_file for existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace root.' },
          content: { type: 'string', description: 'Complete new file content.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Replace exactly one occurrence of old_string in an existing file. old_string must be unique. Include enough surrounding context.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace root.' },
          old_string: { type: 'string', description: 'Exact text to replace, including whitespace.' },
          new_string: { type: 'string', description: 'Replacement text.' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace. Use for tests, builds, formatters and inspection. The user must approve it.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show the current git branch and changed files.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show the git diff for one file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace root.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stage all changes and create a git commit. The user must approve it.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message.' },
        },
        required: ['message'],
      },
    },
  },
]

export function toolsForMode(mode: ChatMode): Array<Record<string, unknown>> {
  if (mode === 'chat') return []
  if (mode === 'plan') {
    return TOOL_DEFINITIONS.filter((tool) => READ_TOOLS.has(String((tool.function as { name: string }).name)))
  }
  if (mode === 'docs') {
    return TOOL_DEFINITIONS.filter((tool) => DOC_TOOLS.has(String((tool.function as { name: string }).name)))
  }
  return TOOL_DEFINITIONS
}

function truncate(text: string, limit = MAX_TOOL_RESULT): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} characters]`
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') return ''
  return value
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = Number(args[key])
  return Number.isFinite(value) ? value : undefined
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Tool arguments were not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Tool arguments must be an object')
  return parsed as Record<string, unknown>
}

function formatTree(nodes: FileNode[], depth = 0, maxDepth = 3, out: string[] = []): string[] {
  for (const node of nodes) {
    if (out.length >= 400) {
      out.push('… tree truncated')
      break
    }
    out.push(`${'  '.repeat(depth)}${node.name}${node.type === 'dir' ? '/' : ''}`)
    if (node.type === 'dir' && node.children && depth + 1 < maxDepth) {
      formatTree(node.children, depth + 1, maxDepth, out)
    }
  }
  return out
}

function buildSystemPrompt(options: RunAgentOptions): string {
  const { mode, settings, workspace, treeSummary, openFile } = options
  const modeInstructions: Record<ChatMode, string> = {
    chat: 'Answer questions about the code. No tools are available.',
    agent:
      'You are in AGENT mode. Inspect before editing, make focused changes, and verify your work when practical. Use tools instead of guessing.',
    plan:
      'You are in PLAN mode. You only have read-only tools. Produce a concrete implementation plan with files, functions and risks. Do not claim to have changed anything.',
    debug:
      'You are in DEBUG mode. Find the root cause before proposing edits. Read the relevant code and logs, state the likely cause, then apply a minimal fix.',
    docs:
      'You are in DOCS mode. Keep documentation accurate and grounded in the actual code. Read the source before writing about it. Prefer updating existing docs over creating new files.',
  }

  const tree = treeSummary.slice(0, 220).join('\n')
  const open = openFile
    ? `\n<open_file path="${openFile.path}">\n${openFile.content.slice(0, 40000)}\n</open_file>`
    : ''

  return `You are Integral Pro, a coding agent inside a self-hosted browser IDE. The user brings their own model provider.

Workspace: ${workspace.name}
Root: ${workspace.path}
Model: ${modelShort(options.model)}
Mode: ${mode.toUpperCase()}

${modeInstructions[mode]}

Operating rules:
- Use tools to inspect the workspace. Never invent file contents, APIs or command output.
- Make the smallest correct change. Match the existing style.
- Read a file before editing it. For edit_file, old_string must be an exact, unique match.
- Do not create documentation or tests unless they are useful for the task.
- Prefer plain, direct language. No filler, no marketing tone.
- After making changes, give a short summary and how to verify them.
- If a tool is rejected by the user, stop and ask what they want instead.
- Paths are relative to the workspace root. Never use absolute paths.
- Do not attempt to access files outside the workspace.

User's standing instructions:
${settings.agentInstructions || '(none)'}

Project tree (partial):
<tree>
${tree}
</tree>${open}`
}

function buildApiHistory(history: ChatMessage[], systemPrompt: string): ApiMessage[] {
  const messages: ApiMessage[] = [{ role: 'system', content: systemPrompt }]
  for (const message of history.slice(-40)) {
    if (message.role === 'user') {
      messages.push({ role: 'user', content: message.content.slice(0, 24000) })
      continue
    }
    const completed = (message.toolCalls || []).filter(
      (call) => call.status === 'done' || call.status === 'error' || call.status === 'rejected',
    )
    if (message.content.trim() || completed.length > 0) {
      messages.push({
        role: 'assistant',
        content: message.content.trim() ? message.content.slice(0, 24000) : null,
        ...(completed.length > 0
          ? {
              tool_calls: completed.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments || '{}' },
              })),
            }
          : {}),
      })
    }
    for (const call of completed) {
      const content =
        call.status === 'done'
          ? truncate(call.result || '(no output)', 20000)
          : call.status === 'rejected'
            ? 'The user rejected this action.'
            : `Error: ${call.error || 'tool failed'}`
      messages.push({ role: 'tool', tool_call_id: call.id, content })
    }
  }
  return messages
}

type ToolContext = {
  mode: ChatMode
  settings: Settings
  signal: AbortSignal
  update: (patch: Partial<ToolCall>) => void
  treeCache: { value: FileNode[] | null }
}

type ToolResult = { text: string; mutated?: boolean; rejected?: boolean }

async function readBefore(path: string): Promise<string> {
  try {
    const file = await api.readFileOptional(path)
    return file.content
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return ''
    throw err
  }
}

async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult> {
  const args = parseArgs(rawArgs)

  if (name === 'list_files') {
    if (!ctx.treeCache.value) {
      const tree = await api.tree()
      ctx.treeCache.value = tree.children
    }
    const dir = str(args, 'path') || '.'
    const depth = Math.max(1, Math.min(4, num(args, 'depth') || 2))
    let nodes = ctx.treeCache.value
    if (dir !== '.' && dir !== '') {
      const parts = dir.replace(/^\/+|\/+$/g, '').split('/')
      for (const part of parts) {
        const found = nodes.find((node) => node.name === part && node.type === 'dir')
        if (!found) return { text: `Directory not found: ${dir}` }
        nodes = found.children || []
      }
    }
    return { text: `${dir}/\n${formatTree(nodes, 0, depth).join('\n')}` }
  }

  if (name === 'read_file') {
    const path = str(args, 'path')
    if (!path) return { text: 'Error: path is required' }
    const file = await api.readFile(path)
    const lines = file.content.split(/\r?\n/)
    const start = Math.max(1, Math.floor(num(args, 'start_line') || 1))
    const end = Math.min(lines.length, Math.floor(num(args, 'end_line') || lines.length))
    const slice = lines.slice(start - 1, end)
    const numbered = slice.map((line, i) => `${String(start + i).padStart(5, ' ')} │ ${line}`).join('\n')
    return { text: `${file.path} (lines ${start}-${end} of ${lines.length})\n${numbered}` }
  }

  if (name === 'search_code') {
    const query = str(args, 'query')
    if (!query.trim()) return { text: 'Error: query is required' }
    const result = await api.search(query)
    if (result.hits.length === 0) return { text: `No matches for "${query}".` }
    return {
      text: result.hits.map((hit) => `${hit.path}:${hit.line}: ${hit.text}`).join('\n'),
    }
  }

  if (name === 'write_file') {
    if (ctx.mode === 'plan') return { text: 'Write tools are disabled in PLAN mode.' }
    const path = str(args, 'path')
    const content = args.content
    if (!path) return { text: 'Error: path is required' }
    if (typeof content !== 'string') return { text: 'Error: content must be a string' }
    const before = await readBefore(path)
    if (!ctx.settings.autoApply) {
      ctx.update({ status: 'awaiting' })
      const ok = await requestApproval(
        {
          kind: 'write',
          title: before ? `overwrite ${path}` : `create ${path}`,
          detail: `${content.split('\n').length} lines`,
          path,
          before,
          after: content,
        },
        ctx.signal,
      )
      ctx.update({ status: 'running' })
      if (!ok) return { text: 'The user rejected this file change. No file was written.', rejected: true }
    }
    await api.writeFile(path, content)
    return { text: `Wrote ${path} (${content.length} characters).`, mutated: true }
  }

  if (name === 'edit_file') {
    if (ctx.mode === 'plan') return { text: 'Edit tools are disabled in PLAN mode.' }
    const path = str(args, 'path')
    const oldString = str(args, 'old_string')
    const newString = str(args, 'new_string')
    if (!path) return { text: 'Error: path is required' }
    if (!oldString) return { text: 'Error: old_string cannot be empty. Use write_file to create a file.' }
    const before = await readBefore(path)
    if (!before) return { text: `File not found: ${path}` }
    const first = before.indexOf(oldString)
    if (first === -1) return { text: `old_string was not found in ${path}. Read the file again and copy the exact text.` }
    if (before.indexOf(oldString, first + oldString.length) !== -1) {
      return { text: `old_string appears more than once in ${path}. Include more surrounding context so it is unique.` }
    }
    const after = before.slice(0, first) + newString + before.slice(first + oldString.length)
    if (!ctx.settings.autoApply) {
      ctx.update({ status: 'awaiting' })
      const ok = await requestApproval(
        {
          kind: 'write',
          title: `edit ${path}`,
          detail: '1 replacement',
          path,
          before,
          after,
        },
        ctx.signal,
      )
      ctx.update({ status: 'running' })
      if (!ok) return { text: 'The user rejected this edit. No file was written.', rejected: true }
    }
    await api.writeFile(path, after)
    return { text: `Edited ${path}: replaced 1 occurrence.`, mutated: true }
  }

  if (name === 'run_command') {
    if (ctx.mode === 'plan') return { text: 'Commands are disabled in PLAN mode.' }
    const command = str(args, 'command')
    if (!command.trim()) return { text: 'Error: command is required' }
    if (!ctx.settings.autoCommands) {
      ctx.update({ status: 'awaiting' })
      const ok = await requestApproval(
        {
          kind: 'command',
          title: 'run command',
          detail: 'Runs in the workspace with the server user\'s permissions.',
          command,
        },
        ctx.signal,
      )
      ctx.update({ status: 'running' })
      if (!ok) return { text: 'The user rejected this command. It was not run.', rejected: true }
    }
    const result = await api.exec(command)
    const parts = [
      `$ ${command}`,
      `exit: ${result.exitCode}${result.timedOut ? ' (timed out)' : ''} · ${result.durationMs}ms`,
    ]
    if (result.stdout) parts.push(`--- stdout ---\n${result.stdout.trimEnd()}`)
    if (result.stderr) parts.push(`--- stderr ---\n${result.stderr.trimEnd()}`)
    return { text: truncate(parts.join('\n')) }
  }

  if (name === 'git_status') {
    const status = await api.gitStatus()
    if (!status.isRepo) return { text: 'This workspace is not a git repository.' }
    const changes = status.changes.map((change) => `${change.raw} ${change.path}`).join('\n')
    return {
      text: `branch: ${status.branch}${status.ahead ? ` (ahead ${status.ahead})` : ''}${status.behind ? ` (behind ${status.behind})` : ''}\n${changes || '(working tree clean)'}`,
    }
  }

  if (name === 'git_diff') {
    const path = str(args, 'path')
    if (!path) return { text: 'Error: path is required' }
    const result = await api.gitDiff(path)
    return { text: truncate(result.diff || '(no diff)') }
  }

  if (name === 'git_commit') {
    const message = str(args, 'message')
    if (!message.trim()) return { text: 'Error: commit message is required' }
    ctx.update({ status: 'awaiting' })
    const ok = await requestApproval(
      {
        kind: 'command',
        title: 'git commit',
        detail: 'Stages every change and creates a commit.',
        command: `git add -A && git commit -m ${JSON.stringify(message)}`,
      },
      ctx.signal,
    )
    ctx.update({ status: 'running' })
    if (!ok) return { text: 'The user rejected the commit.', rejected: true }
    const result = await api.gitCommit(message)
    return { text: result.commit || 'Commit created.' }
  }

  return { text: `Unknown tool: ${name}` }
}

export async function runAgent(options: RunAgentOptions): Promise<{ mutated: boolean }> {
  const { mode, history, provider, model, signal, callbacks } = options
  const tools = toolsForMode(mode)
  const systemPrompt = buildSystemPrompt(options)
  const messages = buildApiHistory(history, systemPrompt)
  const treeCache: { value: FileNode[] | null } = { value: null }
  let mutated = false

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    let content = ''
    let streamError: string | null = null
    let finishReason = ''
    const pendingCalls = new Map<number, { id: string; name: string; args: string; startedAt: number }>()

    const emitTool = (index: number) => {
      const call = pendingCalls.get(index)
      if (!call) return
      callbacks.onToolUpdate({
        id: call.id,
        name: call.name || 'tool',
        arguments: call.args,
        status: 'pending',
        startedAt: call.startedAt,
      })
    }

    await streamChat({
      provider,
      model,
      messages,
      tools,
      signal,
      onEvent: (event) => {
        if (event.type === 'text') {
          content += event.text
          callbacks.onText(event.text)
        } else if (event.type === 'reasoning') {
          callbacks.onReasoning(event.text)
        } else if (event.type === 'tool') {
          let call = pendingCalls.get(event.index)
          if (!call) {
            call = {
              id: `call_${step}_${event.index}_${Math.random().toString(36).slice(2, 8)}`,
              name: '',
              args: '',
              startedAt: Date.now(),
            }
            pendingCalls.set(event.index, call)
          }
          if (event.name) call.name = event.name
          if (event.argumentsDelta) call.args += event.argumentsDelta
          emitTool(event.index)
        } else if (event.type === 'finish') {
          finishReason = event.reason
        } else if (event.type === 'error') {
          streamError = event.message
        }
      },
    })

    if (streamError) throw new Error(streamError)
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const calls = Array.from(pendingCalls.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, call]) => call)

    if (calls.length === 0) {
      if (finishReason === 'length') {
        callbacks.onText('\n\n[output stopped: model hit its token limit]')
      }
      return { mutated }
    }

    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.args || '{}' },
      })),
    })

    for (const call of calls) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const base: ToolCall = {
        id: call.id,
        name: call.name || 'tool',
        arguments: call.args,
        status: 'running',
        startedAt: call.startedAt,
      }
      callbacks.onToolUpdate(base)

      let resultText = ''
      let rejected = false
      try {
        const result = await executeTool(call.name, call.args, {
          mode,
          settings: options.settings,
          signal,
          treeCache,
          update: (patch) => callbacks.onToolUpdate({ ...base, ...patch }),
        })
        resultText = truncate(result.text)
        rejected = Boolean(result.rejected)
        mutated = mutated || Boolean(result.mutated)
        callbacks.onToolUpdate({
          ...base,
          status: rejected ? 'rejected' : 'done',
          result: resultText,
          finishedAt: Date.now(),
        })
      } catch (err) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const message = err instanceof Error ? err.message : 'Tool failed'
        resultText = `Error: ${message}`
        callbacks.onToolUpdate({
          ...base,
          status: 'error',
          error: message,
          finishedAt: Date.now(),
        })
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: resultText })
    }
  }

  callbacks.onText('\n\n[stopped: reached the 16-step tool limit]')
  return { mutated }
}
