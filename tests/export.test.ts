import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-export-'))
const workspace = path.join(sandbox, 'workspace')

fs.mkdirSync(path.join(workspace, 'src'), { recursive: true })
fs.mkdirSync(path.join(workspace, 'node_modules', 'left-pad'), { recursive: true })
fs.mkdirSync(path.join(workspace, '.git'), { recursive: true })
fs.writeFileSync(path.join(workspace, 'README.md'), '# demo\n')
fs.writeFileSync(path.join(workspace, 'src', 'app.ts'), 'export const ok = true\n')
fs.writeFileSync(path.join(workspace, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
fs.writeFileSync(path.join(workspace, '.git', 'config'), '[core]\n')
fs.writeFileSync(path.join(workspace, '.env'), 'SECRET=1\n')
fs.writeFileSync(path.join(workspace, '.env.example'), 'SECRET=\n')
fs.writeFileSync(path.join(workspace, '.npmrc'), 'token=secret\n')
fs.writeFileSync(path.join(workspace, '.DS_Store'), 'junk\n')
fs.writeFileSync(path.join(workspace, 'package-lock.json'), '{}\n')
fs.symlinkSync(path.join(workspace, 'README.md'), path.join(workspace, 'linked.md'))

process.env.WORKSPACE_DIR = workspace
process.env.DATA_DIR = path.join(sandbox, 'data')

const serverExport = await import('../server/export.js')
const clientExport = await import('../src/lib/export.js')
const { DEFAULT_SETTINGS } = await import('../src/lib/providers.js')

after(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

test('workspace export collects regular files and skips generated, sensitive and linked paths', () => {
  const names = serverExport.collectExportEntries().map((entry) => entry.name).sort()
  assert.deepEqual(names, ['.env.example', 'README.md', 'package-lock.json', 'src/app.ts'])
})

test('settings export strips every API key', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    providers: [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'secret-key',
        models: ['a'],
      },
    ],
    activeProviderId: 'openrouter',
    activeModel: 'a',
    accent: 'moss' as const,
  }
  const bundle = clientExport.settingsExport(settings)
  assert.equal(bundle.settings.providers.every((provider) => provider.apiKey === ''), true)
  assert.equal(bundle.settings.accent, 'moss')
  assert.match(bundle.note, /API keys are intentionally omitted/)
})

test('settings import validates providers and only keeps keys for unchanged endpoints', () => {
  const current = {
    ...DEFAULT_SETTINGS,
    providers: [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'secret-key',
        models: ['a'],
      },
      {
        id: 'local',
        name: 'Local',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'local-secret',
        models: ['b'],
      },
    ],
    activeProviderId: 'openrouter',
    activeModel: 'a',
  }

  const imported = clientExport.importSettings(current, {
    format: 'integral-pro/settings',
    settings: {
      providers: [
        { id: 'openrouter', name: 'Renamed', baseUrl: 'https://openrouter.ai/api/v1/', models: ['x'] },
        { id: 'local', name: 'Local', baseUrl: 'https://evil.example/v1', models: ['b'] },
        { id: 'bad id', name: 'Bad', baseUrl: 'https://example.com/v1', models: [] },
        { id: 'nourl', name: 'Bad', baseUrl: 'javascript:alert(1)', models: [] },
        { id: 'openrouter', name: 'Duplicate', baseUrl: 'https://openrouter.ai/api/v1', models: [] },
      ],
      activeProviderId: 'openrouter',
      activeModel: 'x',
      accent: 'rust',
      density: 'compact',
      fontSize: 99,
      terminalFontSize: 1,
      routes: {
        agent: { providerId: 'openrouter', model: 'x' },
        chat: { providerId: 'missing', model: 'x' },
      },
    },
  })

  assert.equal(imported.providers.length, 2)
  assert.equal(imported.providers[0].apiKey, 'secret-key')
  assert.equal(imported.providers[1].apiKey, '')
  assert.equal(imported.activeProviderId, 'openrouter')
  assert.equal(imported.activeModel, 'x')
  assert.equal(imported.fontSize, 22)
  assert.equal(imported.terminalFontSize, 10)
  assert.equal(imported.accent, 'rust')
  assert.equal(imported.density, 'compact')
  assert.deepEqual(imported.routes.agent, { providerId: 'openrouter', model: 'x' })
  assert.equal(imported.routes.chat, null)
})

test('settings import rejects malformed bundles', () => {
  assert.throws(() => clientExport.importSettings(DEFAULT_SETTINGS, null), /JSON object/)
  assert.throws(
    () => clientExport.importSettings(DEFAULT_SETTINGS, { format: 'something-else' }),
    /not an Integral Pro settings file/,
  )
})

test('settings import keeps keys across host case but not path case', () => {
  const current = {
    ...DEFAULT_SETTINGS,
    providers: [
      {
        id: 'cased',
        name: 'Cased',
        baseUrl: 'https://example.com/v1',
        apiKey: 'secret-key',
        models: ['a'],
      },
    ],
    activeProviderId: 'cased',
    activeModel: 'a',
  }

  const hostOnly = clientExport.importSettings(current, {
    format: 'integral-pro/settings',
    settings: { providers: [{ id: 'cased', name: 'Cased', baseUrl: 'https://EXAMPLE.com/v1', models: ['a'] }] },
  })
  assert.equal(hostOnly.providers[0].apiKey, 'secret-key')

  const pathChanged = clientExport.importSettings(current, {
    format: 'integral-pro/settings',
    settings: { providers: [{ id: 'cased', name: 'Cased', baseUrl: 'https://example.com/V1', models: ['a'] }] },
  })
  assert.equal(pathChanged.providers[0].apiKey, '')
})

test('partial settings import keeps the current provider, model and routes', () => {
  const current = {
    ...DEFAULT_SETTINGS,
    providers: [
      { id: 'first', name: 'First', baseUrl: 'https://first.example/v1', apiKey: '', models: ['a'] },
      { id: 'second', name: 'Second', baseUrl: 'https://second.example/v1', apiKey: 'secret', models: ['b'] },
    ],
    activeProviderId: 'second',
    activeModel: 'b',
    routes: { ...DEFAULT_SETTINGS.routes, chat: { providerId: 'second', model: 'b' } },
  }

  const imported = clientExport.importSettings(current, {
    format: 'integral-pro/settings',
    settings: { accent: 'moss', density: 'compact' },
  })

  assert.equal(imported.activeProviderId, 'second')
  assert.equal(imported.activeModel, 'b')
  assert.deepEqual(imported.routes.chat, { providerId: 'second', model: 'b' })
  assert.equal(imported.providers[1].apiKey, 'secret')
})

test('safeFilename and chat markdown handle awkward content', () => {
  assert.equal(clientExport.safeFilename('My Workspace / 2026'), 'My-Workspace-2026')
  assert.equal(clientExport.safeFilename('***', 'fallback'), 'fallback')

  const markdown = clientExport.chatMarkdown(
    [
      { id: '1', role: 'user', content: 'hello', createdAt: 0 },
      {
        id: '2',
        role: 'assistant',
        content: 'done',
        createdAt: 0,
        toolCalls: [
          {
            id: 't',
            name: 'read_file',
            arguments: '{"path":"a"}',
            status: 'done',
            result: '```\nx\n```',
          },
        ],
      },
    ],
    { workspace: 'demo', mode: 'AGENT', model: 'test-model', provider: 'Test' },
  )

  assert.match(markdown, /# Integral Pro conversation/)
  assert.match(markdown, /## YOU/)
  assert.match(markdown, /## AGENT/)
  assert.match(markdown, /````/)
  assert.match(markdown, /### Tool: `read_file`/)
})
