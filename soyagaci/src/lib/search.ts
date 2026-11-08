import Fuse from 'fuse.js'
import type { Person } from '../types'
import { normalizeTr } from './format'

interface Indexed {
  p: Person
  full: string
  first: string
  last: string
  maiden: string
  nick: string
  place: string
  year: string
}

/** Turkish-aware, typo-tolerant search over persons. */
export function createPersonSearch(persons: Person[]) {
  const docs: Indexed[] = persons.map((p) => ({
    p,
    full: normalizeTr(`${p.firstName} ${p.lastName} ${p.maidenName ?? ''}`),
    first: normalizeTr(p.firstName),
    last: normalizeTr(p.lastName),
    maiden: normalizeTr(p.maidenName),
    nick: normalizeTr(p.nickname),
    place: normalizeTr(`${p.birthPlace ?? ''} ${p.residence ?? ''} ${p.hometown ?? ''}`),
    year: p.birthDate?.slice(0, 4) ?? '',
  }))
  const fuse = new Fuse(docs, {
    keys: [
      { name: 'full', weight: 3 },
      { name: 'first', weight: 2 },
      { name: 'last', weight: 2 },
      { name: 'maiden', weight: 1.5 },
      { name: 'nick', weight: 1.5 },
      { name: 'place', weight: 0.6 },
      { name: 'year', weight: 0.6 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
  })
  return (query: string, limit = 50): Person[] => {
    const q = normalizeTr(query)
    if (!q) return []
    // Exact prefix matches first (fast path), then fuzzy.
    const tokens = q.split(/\s+/).filter(Boolean)
    const exact = docs.filter((d) => tokens.every((t) => d.full.includes(t) || d.nick.includes(t) || d.year === t))
    const seen = new Set(exact.map((d) => d.p.id))
    const fuzzy = fuse
      .search(q, { limit })
      .map((r) => r.item)
      .filter((d) => !seen.has(d.p.id))
    return [...exact, ...fuzzy].slice(0, limit).map((d) => d.p)
  }
}
