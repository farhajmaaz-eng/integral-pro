import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export const ROOT = process.cwd()
const CUSTOM_WORKSPACE = Boolean(process.env.WORKSPACE_DIR && process.env.WORKSPACE_DIR.trim())
export const WORKSPACE = path.resolve(
  CUSTOM_WORKSPACE ? process.env.WORKSPACE_DIR! : path.join(ROOT, 'data', 'workspace'),
)
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'))
export const PORT = Number(process.env.PORT || 8787)
export const ACCESS_TOKEN = (process.env.ACCESS_TOKEN || '').trim()
export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const VERSION = '0.1.0'

export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.turbo',
  'coverage',
  '.integral',
  'data',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
])

export const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])

export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'mdx', 'markdown', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc',
  'css', 'scss', 'sass', 'less', 'html', 'htm', 'svg', 'xml', 'yml', 'yaml', 'toml', 'ini',
  'env', 'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h',
  'cpp', 'hpp', 'cc', 'cs', 'php', 'lua', 'sql', 'graphql', 'gql', 'vue', 'svelte', 'astro',
  'dockerfile', 'makefile', 'gitignore', 'editorconfig', 'lock', 'conf', 'cfg', 'properties',
])

fs.mkdirSync(WORKSPACE, { recursive: true })
fs.mkdirSync(DATA_DIR, { recursive: true })

/**
 * On a fresh self-hosted install, open something real instead of an empty tree.
 * This only applies to the default workspace (no WORKSPACE_DIR set), so pointing
 * Integral Pro at an existing project never copies files or creates commits there.
 */
function bootstrapDefaultWorkspace() {
  if (CUSTOM_WORKSPACE) return
  const template = path.join(ROOT, 'example-project')
  const isEmpty = fs.readdirSync(WORKSPACE).length === 0
  if (isEmpty && fs.existsSync(template)) {
    fs.cpSync(template, WORKSPACE, { recursive: true })
  }

  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: WORKSPACE,
      stdio: 'ignore',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    })

  let isRepo = false
  try {
    git(['rev-parse', '--is-inside-work-tree'])
    isRepo = true
  } catch {
    isRepo = false
  }

  if (!isRepo) {
    try {
      git(['init', '-b', 'main'])
    } catch {
      try {
        git(['init'])
      } catch {
        return
      }
    }
  }

  try {
    git(['rev-parse', 'HEAD'])
    return
  } catch {
    /* no commits yet */
  }

  try {
    git(['config', 'user.name', 'Integral Pro'])
    git(['config', 'user.email', 'integral@local'])
    git(['add', '-A'])
    git(['commit', '-m', 'Initial workspace'])
  } catch {
    /* git is optional; the IDE still works without it */
  }
}

try {
  bootstrapDefaultWorkspace()
} catch (err) {
  console.error('[integral] workspace bootstrap skipped:', err instanceof Error ? err.message : err)
}

export function isTextFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase()
  if (base === 'dockerfile' || base === 'makefile' || base.startsWith('.env')) return true
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}
