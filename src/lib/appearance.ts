import type { AccentId, Settings } from './types'

export type AccentPreset = {
  id: AccentId
  label: string
  accent: string
  dim: string
  soft: string
}

export const ACCENTS: AccentPreset[] = [
  { id: 'amber', label: 'AMBER', accent: '#e8b15a', dim: '#b8863f', soft: 'rgba(232, 177, 90, 0.13)' },
  { id: 'moss', label: 'MOSS', accent: '#9bbf72', dim: '#6e8f4f', soft: 'rgba(155, 191, 114, 0.14)' },
  { id: 'rust', label: 'RUST', accent: '#e07a5f', dim: '#b25a45', soft: 'rgba(224, 122, 95, 0.14)' },
  { id: 'ice', label: 'ICE', accent: '#83b6c9', dim: '#5a8a9c', soft: 'rgba(131, 182, 201, 0.14)' },
  { id: 'bone', label: 'BONE', accent: '#d8cfbd', dim: '#a89f8d', soft: 'rgba(216, 207, 189, 0.12)' },
]

export function accentPreset(id: string | undefined): AccentPreset {
  return ACCENTS.find((preset) => preset.id === id) || ACCENTS[0]
}

export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(clean)) return hex
  const channel = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${clean}${channel}`
}

type Appearance = Pick<Settings, 'accent' | 'density' | 'reducedMotion'>

export function applyAppearance(settings: Appearance) {
  if (typeof document === 'undefined') return
  const preset = accentPreset(settings.accent)
  const root = document.documentElement
  root.style.setProperty('--accent', preset.accent)
  root.style.setProperty('--accent-dim', preset.dim)
  root.style.setProperty('--accent-soft', preset.soft)
  root.dataset.density = settings.density === 'compact' ? 'compact' : 'comfortable'
  root.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'
}

export function terminalTheme(id: string | undefined) {
  const preset = accentPreset(id)
  return {
    background: '#121214',
    foreground: '#e7e3d9',
    cursor: preset.accent,
    cursorAccent: '#121214',
    selectionBackground: withAlpha(preset.accent, 0.2),
    black: '#1c1c20',
    red: '#d96c5f',
    green: '#8fb573',
    yellow: preset.accent,
    blue: '#7fa6c9',
    magenta: '#b07aa1',
    cyan: '#7fb3a8',
    white: '#e7e3d9',
    brightBlack: '#5f5d58',
    brightRed: '#e88577',
    brightGreen: '#a6c98c',
    brightYellow: preset.accent,
    brightBlue: '#9bbbd8',
    brightMagenta: '#c795b8',
    brightCyan: '#9bcbc0',
    brightWhite: '#ffffff',
  }
}
