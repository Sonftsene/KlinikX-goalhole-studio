import type { Person } from '../types'

/** Colour coding used on cards, tree nodes, lists and exports. */
export interface PersonPalette {
  bg: string
  border: string
  accent: string
  text: string
  sub: string
}

const LIGHT = {
  male: { bg: '#eff6ff', border: '#3b82f6', accent: '#2563eb', text: '#0f172a', sub: '#475569' },
  female: { bg: '#fdf2f8', border: '#ec4899', accent: '#db2777', text: '#0f172a', sub: '#475569' },
  other: { bg: '#f5f3ff', border: '#8b5cf6', accent: '#7c3aed', text: '#0f172a', sub: '#475569' },
  deceased: { bg: '#f1f5f9', border: '#64748b', text: '#334155', sub: '#64748b' },
}

const DARK = {
  male: { bg: '#172554', border: '#60a5fa', accent: '#93c5fd', text: '#f1f5f9', sub: '#cbd5e1' },
  female: { bg: '#3b0a2a', border: '#f472b6', accent: '#f9a8d4', text: '#f1f5f9', sub: '#cbd5e1' },
  other: { bg: '#2e1065', border: '#a78bfa', accent: '#c4b5fd', text: '#f1f5f9', sub: '#cbd5e1' },
  deceased: { bg: '#1e293b', border: '#94a3b8', text: '#e2e8f0', sub: '#94a3b8' },
}

export const SELF_RING = '#f59e0b'
export const LIVING_DOT = '#22c55e'
export const LINE_COLOR = { light: '#94a3b8', dark: '#475569' }
export const BLOOD_LINE = '#f59e0b'

export function personPalette(p: Pick<Person, 'gender' | 'isDeceased'>, dark = false): PersonPalette {
  const set = dark ? DARK : LIGHT
  const g = set[p.gender] ?? set.other
  if (p.isDeceased) return { ...set.deceased, accent: g.border }
  return g
}

export const TAG_INFO: Record<string, { tr: string; en: string; emoji: string; color: string }> = {
  sehit: { tr: 'Şehit', en: 'Martyr', emoji: '🇹🇷', color: '#dc2626' },
  gazi: { tr: 'Gazi', en: 'Veteran', emoji: '🎖️', color: '#b45309' },
  hacı: { tr: 'Hacı', en: 'Hajji', emoji: '🕋', color: '#0f766e' },
  hafiz: { tr: 'Hafız', en: 'Hafiz', emoji: '📖', color: '#0369a1' },
  doktor: { tr: 'Doktor', en: 'Doctor', emoji: '🩺', color: '#0891b2' },
  ogretmen: { tr: 'Öğretmen', en: 'Teacher', emoji: '📚', color: '#7c3aed' },
}

/** Stable pastel colour for avatars without a photo. */
export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h} 55% 55%)`
}
