import type { Person, Relation } from '../types'
import { ageOf, yearOf } from './format'

export interface Counted {
  label: string
  count: number
}

export interface FamilyStats {
  total: number
  living: number
  deceased: number
  male: number
  female: number
  other: number
  generations: number
  marriages: number
  divorces: number
  averageLifespan?: number
  averageChildren?: number
  oldestLiving?: { person: Person; age: number }
  longestLived?: { person: Person; age: number }
  youngest?: Person
  mostChildren?: { person: Person; count: number }
  firstNames: Counted[]
  surnames: Counted[]
  birthplaces: Counted[]
  occupations: Counted[]
  birthsPerDecade: Counted[]
  earliestYear?: number
  latestYear?: number
}

function top(map: Map<string, number>, n: number): Counted[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'))
    .slice(0, n)
}

function inc(map: Map<string, number>, key?: string) {
  const k = key?.trim()
  if (!k) return
  map.set(k, (map.get(k) ?? 0) + 1)
}

/** Statistics over the given persons; relations outside the set are ignored. */
export function computeStats(persons: Person[], relations: Relation[]): FamilyStats {
  const ids = new Set(persons.map((p) => p.id))
  const parents = new Map<string, string[]>()
  const childCount = new Map<string, number>()
  let marriages = 0
  let divorces = 0
  for (const r of relations) {
    if (r.kind === 'parent') {
      if (!ids.has(r.parentId) || !ids.has(r.childId)) continue
      parents.set(r.childId, [...(parents.get(r.childId) ?? []), r.parentId])
      childCount.set(r.parentId, (childCount.get(r.parentId) ?? 0) + 1)
    } else if (ids.has(r.aId) && ids.has(r.bId)) {
      if (r.type !== 'engaged' && r.type !== 'partner') marriages++
      if (r.type === 'divorced') divorces++
    }
  }

  // Longest ancestor chain = number of generations.
  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (id: string): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 1
    visiting.add(id)
    const d = 1 + Math.max(0, ...(parents.get(id) ?? []).map(depthOf))
    visiting.delete(id)
    depth.set(id, d)
    return d
  }

  const firstNames = new Map<string, number>()
  const surnames = new Map<string, number>()
  const places = new Map<string, number>()
  const jobs = new Map<string, number>()
  const decades = new Map<number, number>()
  let living = 0
  let male = 0
  let female = 0
  let lifeSum = 0
  let lifeN = 0
  let oldestLiving: FamilyStats['oldestLiving']
  let longestLived: FamilyStats['longestLived']
  let youngest: Person | undefined
  let generations = 0
  let earliest: number | undefined
  let latest: number | undefined

  for (const p of persons) {
    if (!p.isDeceased) living++
    if (p.gender === 'male') male++
    else if (p.gender === 'female') female++
    generations = Math.max(generations, depthOf(p.id))
    inc(firstNames, p.firstName.split(' ')[0])
    inc(surnames, p.maidenName || p.lastName)
    inc(places, p.birthPlace?.split(',')[0])
    inc(jobs, p.occupation)
    const by = yearOf(p.birthDate)
    if (by !== undefined) {
      const dec = Math.floor(by / 10) * 10
      decades.set(dec, (decades.get(dec) ?? 0) + 1)
      earliest = earliest === undefined ? by : Math.min(earliest, by)
      latest = latest === undefined ? by : Math.max(latest, by)
      if (!youngest || (p.birthDate ?? '') > (youngest.birthDate ?? '')) youngest = p
    }
    const age = ageOf(p)
    if (age === undefined) continue
    if (p.isDeceased) {
      lifeSum += age
      lifeN++
      if (!longestLived || age > longestLived.age) longestLived = { person: p, age }
    } else if (age <= 120 && (!oldestLiving || age > oldestLiving.age)) oldestLiving = { person: p, age }
  }

  let mostChildren: FamilyStats['mostChildren']
  for (const [id, count] of childCount) {
    if (!mostChildren || count > mostChildren.count) mostChildren = { person: persons.find((p) => p.id === id)!, count }
  }
  const parentsWithKids = childCount.size

  // Every decade between the first and last birth, so gaps are visible.
  const birthsPerDecade: Counted[] = []
  if (earliest !== undefined && latest !== undefined)
    for (let d = Math.floor(earliest / 10) * 10; d <= latest; d += 10) birthsPerDecade.push({ label: `${d}'ler`, count: decades.get(d) ?? 0 })

  return {
    total: persons.length,
    living,
    deceased: persons.length - living,
    male,
    female,
    other: persons.length - male - female,
    generations,
    marriages,
    divorces,
    averageLifespan: lifeN ? Math.round((lifeSum / lifeN) * 10) / 10 : undefined,
    averageChildren: parentsWithKids ? Math.round(([...childCount.values()].reduce((a, b) => a + b, 0) / parentsWithKids) * 10) / 10 : undefined,
    oldestLiving,
    longestLived,
    youngest,
    mostChildren,
    firstNames: top(firstNames, 8),
    surnames: top(surnames, 8),
    birthplaces: top(places, 8),
    occupations: top(jobs, 8),
    birthsPerDecade,
    earliestYear: earliest,
    latestYear: latest,
  }
}
