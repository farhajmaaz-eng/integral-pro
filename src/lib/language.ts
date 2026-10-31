const LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
}

export function languageFor(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() || ''
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  if (name.startsWith('.env')) return 'ini'
  const ext = name.includes('.') ? name.split('.').pop() || '' : ''
  return LANGUAGES[ext] || 'plaintext'
}

export function isMarkdown(path: string): boolean {
  return ['md', 'mdx', 'markdown'].includes(path.split('.').pop()?.toLowerCase() || '')
}
