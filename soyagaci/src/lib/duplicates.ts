import type { Person } from '../types'
import { normalizeTr, yearOf } from './format'

export interface DuplicatePair {
  a: Person
  b: Person
  score: number
  reasons: string[]
}

export interface SimilarMatch {
  person: Person
  score: number
  reasons: string[]
}

/** Score above which two records are probably the same person. */
export const DUPLICATE_THRESHOLD = 55

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.startsWith(b) || b.startsWith(a)) return Math.min(a.length, b.length) >= 3
  const max = Math.max(a.length, b.length)
  return levenshtein(a, b) <= (max >= 7 ? 2 : 1)
}

function firstPlace(s?: string) {
  return normalizeTr(s?.split(',')[0])
}

/** Similarity score between two persons (0 = clearly different). */
export function scorePair(a: Partial<Person>, b: Person): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  const fa = normalizeTr(a.firstName)
  const fb = normalizeTr(b.firstName)
  if (!fa || !fb) return { score: 0, reasons }
  if (fa === fb) {
    score += 40
    reasons.push('Aynı ad')
  } else if (similar(fa, fb) || fa.split(' ')[0] === fb.split(' ')[0]) {
    score += 25
    reasons.push('Benzer ad')
  } else return { score: 0, reasons }

  const surA = [a.lastName, a.maidenName].map(normalizeTr).filter(Boolean)
  const surB = [b.lastName, b.maidenName].map(normalizeTr).filter(Boolean)
  if (surA.length && surB.length) {
    if (normalizeTr(a.lastName) === normalizeTr(b.lastName) && normalizeTr(a.lastName)) {
      score += 30
      reasons.push('Aynı soyadı')
    } else if (surA.some((x) => surB.includes(x))) {
      score += 25
      reasons.push('Kızlık soyadı eşleşiyor')
    } else if (surA.some((x) => surB.some((y) => similar(x, y)))) {
      score += 15
      reasons.push('Benzer soyadı')
    } else score -= 25
  }

  if (a.gender && b.gender && a.gender !== 'other' && b.gender !== 'other' && a.gender !== b.gender) score -= 50

  const ya = yearOf(a.birthDate)
  const yb = yearOf(b.birthDate)
  if (ya !== undefined && yb !== undefined) {
    const diff = Math.abs(ya - yb)
    if (diff === 0) {
      score += 20
      reasons.push('Aynı doğum yılı')
      if (a.birthDate && a.birthDate.length === 10 && a.birthDate === b.birthDate) {
        score += 10
        reasons.push('Aynı doğum tarihi')
      }
    } else if (diff <= 2) {
      score += 10
      reasons.push('Yakın doğum yılı')
    } else if (diff > 5) score -= 35
  }

  const da = yearOf(a.deathDate)
  const db = yearOf(b.deathDate)
  if (da !== undefined && db !== undefined) {
    if (Math.abs(da - db) <= 1) {
      score += 10
      reasons.push('Aynı vefat yılı')
    } else score -= 20
  }

  const pa = firstPlace(a.birthPlace)
  const pb = firstPlace(b.birthPlace)
  if (pa && pb && pa === pb) {
    score += 10
    reasons.push('Aynı doğum yeri')
  }
  return { score, reasons }
}

/** Likely duplicate records among all persons, best matches first. */
export function findDuplicates(persons: Person[], threshold = DUPLICATE_THRESHOLD): DuplicatePair[] {
  // Block by the first two letters of the first name to avoid comparing everyone.
  const blocks = new Map<string, Person[]>()
  for (const p of persons) {
    const key = normalizeTr(p.firstName).slice(0, 2)
    if (!key) continue
    const list = blocks.get(key) ?? []
    list.push(p)
    blocks.set(key, list)
  }
  const out: DuplicatePair[] = []
  for (const list of blocks.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const { score, reasons } = scorePair(list[i], list[j])
        if (score >= threshold) out.push({ a: list[i], b: list[j], score, reasons })
      }
  }
  return out.sort((x, y) => y.score - x.score)
}

/** Existing persons that look like `person` (used to warn while adding someone new). */
export function similarTo(person: Person, persons: Person[], threshold = 50): SimilarMatch[] {
  const out: SimilarMatch[] = []
  for (const p of persons) {
    if (p.id === person.id) continue
    const { score, reasons } = scorePair(person, p)
    if (score >= threshold) out.push({ person: p, score, reasons })
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 10)
}
