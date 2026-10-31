import type { FileNode } from './types'

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatClock(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || path
}

export function dirname(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function flattenTree(nodes: FileNode[], out: string[] = [], limit = 500): string[] {
  for (const node of nodes) {
    if (out.length >= limit) break
    if (node.type === 'file') out.push(node.path)
    else if (node.children) flattenTree(node.children, out, limit)
  }
  return out
}

export function treePaths(nodes: FileNode[], out: string[] = [], limit = 500): string[] {
  for (const node of nodes) {
    if (out.length >= limit) break
    out.push(`${node.path}${node.type === 'dir' ? '/' : ''}`)
    if (node.type === 'dir' && node.children) treePaths(node.children, out, limit)
  }
  return out
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function shortPath(path: string, max = 34): string {
  if (path.length <= max) return path
  const parts = path.split('/')
  if (parts.length < 2) return `…${path.slice(-max + 1)}`
  return `…/${parts.slice(-2).join('/')}`
}

export function parseUnifiedDiff(diff: string): { original: string; modified: string } {
  const original: string[] = []
  const modified: string[] = []
  let inHunk = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) modified.push(line.slice(1))
    else if (line.startsWith('-')) original.push(line.slice(1))
    else if (line.startsWith(' ')) {
      original.push(line.slice(1))
      modified.push(line.slice(1))
    }
  }
  return { original: original.join('\n'), modified: modified.join('\n') }
}
