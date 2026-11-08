import type { ParentLink, PartnerLink, Person, Relation } from '../types'

/** Fast lookup tables built from the flat person/relation lists. */
export interface FamilyGraph {
  persons: Map<string, Person>
  parents: Map<string, ParentLink[]> // childId -> links to parents
  children: Map<string, ParentLink[]> // parentId -> links to children
  partners: Map<string, PartnerLink[]> // personId -> partner links
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export function buildGraph(persons: Person[], relations: Relation[]): FamilyGraph {
  const g: FamilyGraph = {
    persons: new Map(persons.map((p) => [p.id, p])),
    parents: new Map(),
    children: new Map(),
    partners: new Map(),
  }
  for (const r of relations) {
    if (r.kind === 'parent') {
      if (!g.persons.has(r.parentId) || !g.persons.has(r.childId)) continue
      push(g.parents, r.childId, r)
      push(g.children, r.parentId, r)
    } else {
      if (!g.persons.has(r.aId) || !g.persons.has(r.bId)) continue
      push(g.partners, r.aId, r)
      push(g.partners, r.bId, r)
    }
  }
  // Children sorted by birth date so trees read oldest → youngest.
  for (const list of g.children.values()) {
    list.sort((a, b) => compareBirth(g.persons.get(a.childId), g.persons.get(b.childId)))
  }
  return g
}

export function compareBirth(a?: Person, b?: Person): number {
  const da = a?.birthDate || '9999'
  const db = b?.birthDate || '9999'
  return da.localeCompare(db)
}

export function parentIds(g: FamilyGraph, id: string): string[] {
  return (g.parents.get(id) || []).map((l) => l.parentId)
}

export function childIds(g: FamilyGraph, id: string): string[] {
  return (g.children.get(id) || []).map((l) => l.childId)
}

export function partnerIds(g: FamilyGraph, id: string): string[] {
  return (g.partners.get(id) || []).map((l) => (l.aId === id ? l.bId : l.aId))
}

export function partnerLink(g: FamilyGraph, a: string, b: string): PartnerLink | undefined {
  return (g.partners.get(a) || []).find((l) => l.aId === b || l.bId === b)
}

export function father(g: FamilyGraph, id: string): Person | undefined {
  return parentIds(g, id)
    .map((pid) => g.persons.get(pid))
    .find((p) => p?.gender === 'male')
}

export function mother(g: FamilyGraph, id: string): Person | undefined {
  return parentIds(g, id)
    .map((pid) => g.persons.get(pid))
    .find((p) => p?.gender === 'female')
}

/** Father first, then mother, then anyone else. */
export function orderedParents(g: FamilyGraph, id: string): string[] {
  const ids = parentIds(g, id)
  const rank = (pid: string) => {
    const gender = g.persons.get(pid)?.gender
    return gender === 'male' ? 0 : gender === 'female' ? 1 : 2
  }
  return [...ids].sort((a, b) => rank(a) - rank(b))
}

export function siblingIds(g: FamilyGraph, id: string): string[] {
  const set = new Set<string>()
  for (const pid of parentIds(g, id)) for (const c of childIds(g, pid)) if (c !== id) set.add(c)
  return [...set].sort((a, b) => compareBirth(g.persons.get(a), g.persons.get(b)))
}

export function ancestorIds(g: FamilyGraph, id: string, maxDepth = Infinity): Set<string> {
  const out = new Set<string>()
  let frontier = [id]
  let depth = 0
  while (frontier.length && depth < maxDepth) {
    const next: string[] = []
    for (const cur of frontier)
      for (const pid of parentIds(g, cur))
        if (!out.has(pid)) {
          out.add(pid)
          next.push(pid)
        }
    frontier = next
    depth++
  }
  return out
}

export function descendantIds(g: FamilyGraph, id: string, maxDepth = Infinity): Set<string> {
  const out = new Set<string>()
  let frontier = [id]
  let depth = 0
  while (frontier.length && depth < maxDepth) {
    const next: string[] = []
    for (const cur of frontier)
      for (const cid of childIds(g, cur))
        if (!out.has(cid)) {
          out.add(cid)
          next.push(cid)
        }
    frontier = next
    depth++
  }
  return out
}

/**
 * The "direct line" of a person: themselves, all ancestors, all descendants,
 * plus the partners of everyone on that line (so couples are shown together).
 */
export function directLineIds(g: FamilyGraph, id: string): Set<string> {
  const line = new Set<string>([id, ...ancestorIds(g, id), ...descendantIds(g, id)])
  for (const pid of [...line]) for (const sp of partnerIds(g, pid)) line.add(sp)
  return line
}

/** Persons that share a blood line with `id` (ancestors, descendants and their branches). */
export function bloodRelatives(g: FamilyGraph, id: string): Set<string> {
  const anc = ancestorIds(g, id)
  const out = new Set<string>([id])
  for (const a of [id, ...anc]) {
    out.add(a)
    for (const d of descendantIds(g, a)) out.add(d)
  }
  return out
}

/** Generation number relative to `rootId` (ancestors negative, descendants positive). */
export function generationMap(g: FamilyGraph, rootId: string): Map<string, number> {
  const gen = new Map<string, number>([[rootId, 0]])
  const queue = [rootId]
  while (queue.length) {
    const cur = queue.shift()!
    const level = gen.get(cur)!
    for (const p of parentIds(g, cur)) if (!gen.has(p)) gen.set(p, level - 1), queue.push(p)
    for (const c of childIds(g, cur)) if (!gen.has(c)) gen.set(c, level + 1), queue.push(c)
    for (const s of partnerIds(g, cur)) if (!gen.has(s)) gen.set(s, level), queue.push(s)
  }
  return gen
}

/** Walks up the father line (or mother line) to the oldest known ancestor. */
export function topAncestor(g: FamilyGraph, id: string, side: 'father' | 'mother' = 'father'): string {
  let cur = id
  const seen = new Set<string>()
  while (!seen.has(cur)) {
    seen.add(cur)
    const first = side === 'father' ? father(g, cur) || mother(g, cur) : mother(g, cur) || father(g, cur)
    if (!first) break
    // After the first step keep following the father line for a classic surname tree.
    cur = first.id
    side = 'father'
  }
  return cur
}

/** Every relative connected to `id` through any link. */
export function connectedIds(g: FamilyGraph, id: string): Set<string> {
  const out = new Set<string>([id])
  const queue = [id]
  while (queue.length) {
    const cur = queue.pop()!
    for (const n of [...parentIds(g, cur), ...childIds(g, cur), ...partnerIds(g, cur)])
      if (!out.has(n)) out.add(n), queue.push(n)
  }
  return out
}

/** True if adding parent→child would create a cycle. */
export function wouldCreateCycle(g: FamilyGraph, parentId: string, childId: string): boolean {
  if (parentId === childId) return true
  return ancestorIds(g, parentId).has(childId)
}
