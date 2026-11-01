import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-safety-'))
const workspace = path.join(sandbox, 'workspace')
const outside = path.join(sandbox, 'outside')

fs.mkdirSync(path.join(workspace, 'src'), { recursive: true })
fs.mkdirSync(path.join(workspace, 'node_modules', 'left-pad'), { recursive: true })
fs.mkdirSync(outside, { recursive: true })
fs.writeFileSync(path.join(workspace, 'README.md'), '# test\n')
fs.writeFileSync(path.join(workspace, 'src', 'app.ts'), 'export const ok = true\n')
fs.writeFileSync(path.join(workspace, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
fs.writeFileSync(path.join(outside, 'secret.txt'), 'do not read me\n')
fs.symlinkSync(outside, path.join(workspace, 'escape'))
fs.symlinkSync(path.join(outside, 'missing.txt'), path.join(workspace, 'dangling'))

process.env.WORKSPACE_DIR = workspace
process.env.DATA_DIR = path.join(sandbox, 'data')

const paths = await import('../server/paths.js')
const config = await import('../server/config.js')

after(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

test('resolvePath keeps normal workspace paths inside the root', () => {
  assert.equal(paths.resolvePath('src/app.ts'), path.join(workspace, 'src', 'app.ts'))
  assert.equal(paths.resolvePath('./README.md'), path.join(workspace, 'README.md'))
  assert.equal(paths.resolvePath('..notes.md'), path.join(workspace, '..notes.md'))
  assert.equal(paths.resolvePath(''), workspace)
})

test('resolvePath treats a leading slash as workspace-relative', () => {
  assert.equal(paths.resolvePath('/src/app.ts'), path.join(workspace, 'src', 'app.ts'))
})

test('resolvePath rejects parent-directory traversal', () => {
  assert.throws(() => paths.resolvePath('../outside/secret.txt'), /escapes the workspace/)
  assert.throws(() => paths.resolvePath('src/../../outside/secret.txt'), /escapes the workspace/)
  assert.throws(() => paths.resolvePath('..'), /escapes the workspace/)
})

test('resolvePath rejects symlinks, including dangling links', () => {
  assert.throws(() => paths.resolvePath('escape/secret.txt'), /Symlinks are not allowed/)
  assert.throws(() => paths.resolvePath('escape'), /Symlinks are not allowed/)
  assert.throws(() => paths.resolvePath('dangling'), /Symlinks are not allowed/)
  assert.throws(() => paths.resolvePath('dangling/child.txt'), /Symlinks are not allowed/)
})

test('assertNotIgnored blocks generated and VCS directories at any depth', () => {
  assert.doesNotThrow(() => paths.assertNotIgnored('src/app.ts'))
  assert.throws(() => paths.assertNotIgnored('node_modules/left-pad/index.js'), /ignored directory/)
  assert.throws(() => paths.assertNotIgnored('.git/config'), /ignored directory/)
  assert.throws(() => paths.assertNotIgnored('src/dist/app.js'), /ignored directory/)
  assert.throws(() => paths.assertNotIgnored('packages/thing/node_modules/x.js'), /ignored directory/)
})

test('isProbablyBinary detects NUL bytes and accepts plain text', () => {
  assert.equal(paths.isProbablyBinary(Buffer.from('plain text\n')), false)
  assert.equal(paths.isProbablyBinary(Buffer.from([])), false)
  assert.equal(paths.isProbablyBinary(Buffer.from([0x68, 0x00, 0x69])), true)
})

test('isTextFile recognizes common source files and dotfiles', () => {
  assert.equal(config.isTextFile('README.md'), true)
  assert.equal(config.isTextFile('src/app.tsx'), true)
  assert.equal(config.isTextFile('Dockerfile'), true)
  assert.equal(config.isTextFile('Makefile'), true)
  assert.equal(config.isTextFile('.env.local'), true)
  assert.equal(config.isTextFile('.gitignore'), true)
  assert.equal(config.isTextFile('LICENSE'), true)
  assert.equal(config.isTextFile('photo.png'), false)
  assert.equal(config.isTextFile('archive.zip'), false)
})

test('walkFiles skips ignored directories and symlinks', () => {
  const { files, truncated } = paths.walkFiles(workspace)
  const found = files.map((file) => paths.relativePath(file.path)).sort()
  assert.deepEqual(found, ['README.md', 'src/app.ts'])
  assert.equal(truncated, false)
})

test('relativePath and toPosix always return forward slashes', () => {
  assert.equal(paths.relativePath(workspace), '.')
  assert.equal(paths.relativePath(path.join(workspace, 'src', 'app.ts')), 'src/app.ts')
  assert.equal(paths.toPosix('a/b/c'), 'a/b/c')
})
