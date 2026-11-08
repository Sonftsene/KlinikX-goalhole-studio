import type { Gender, Person } from '../types'
import { type FamilyGraph, childIds, parentIds, partnerIds, partnerLink } from './graph'
import { genitive, genitiveWord } from './format'

export type Step = 'U' | 'D' | 'S'

export type KinCategory =
  | 'self'
  | 'parent'
  | 'grandparent'
  | 'sibling'
  | 'uncle_aunt'
  | 'cousin'
  | 'nephew'
  | 'child'
  | 'grandchild'
  | 'spouse'
  | 'inlaw'
  | 'step'
  | 'other'

export interface RelationResult {
  /** Kinship word from the point of view of `from`, e.g. "amcası" / "uncle". */
  term: string
  /** Second-person form for "Sizin …" sentences: "amcanız", "babanızın amcası", "hala kızınız". */
  termYour: string
  /** Full sentence, e.g. "Ahmet, Zehra'nın büyük dedesi". */
  sentence: string
  /** Person ids from `from` to `to` (inclusive). */
  path: string[]
  steps: Step[]
  /** For pure blood relations: the closest common ancestor. */
  commonAncestorId?: string
  category: KinCategory
}

type Lang = 'tr' | 'en'

// ─────────────────────────── shortest path ───────────────────────────

const BLOOD_COST = 1
// Slightly more expensive so blood paths win when lengths are equal.
const SPOUSE_COST = 1.001

interface PathTree {
  prev: Map<string, { from: string; step: Step }>
  dist: Map<string, number>
}

/** Dijkstra from one person over parent/child/spouse links. */
export function shortestPaths(g: FamilyGraph, fromId: string): PathTree {
  const prev = new Map<string, { from: string; step: Step }>()
  const dist = new Map<string, number>([[fromId, 0]])
  // Tiny binary heap.
  const heap: [number, string][] = [[0, fromId]]
  const pushHeap = (item: [number, string]) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const popHeap = (): [number, string] => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, cur] = popHeap()
    if (d > (dist.get(cur) ?? Infinity)) continue
    const edges: [string, Step, number][] = [
      ...parentIds(g, cur).map((id): [string, Step, number] => [id, 'U', BLOOD_COST]),
      ...childIds(g, cur).map((id): [string, Step, number] => [id, 'D', BLOOD_COST]),
      ...partnerIds(g, cur).map((id): [string, Step, number] => [id, 'S', SPOUSE_COST]),
    ]
    for (const [next, step, cost] of edges) {
      const nd = d + cost
      if (nd < (dist.get(next) ?? Infinity) - 1e-9) {
        dist.set(next, nd)
        prev.set(next, { from: cur, step })
        pushHeap([nd, next])
      }
    }
  }
  return { prev, dist }
}

function tracePath(tree: PathTree, fromId: string, toId: string): { path: string[]; steps: Step[] } | null {
  if (fromId === toId) return { path: [fromId], steps: [] }
  if (!tree.prev.has(toId)) return null
  const path = [toId]
  const steps: Step[] = []
  let cur = toId
  while (cur !== fromId) {
    const p = tree.prev.get(cur)
    if (!p) return null
    steps.unshift(p.step)
    path.unshift(p.from)
    cur = p.from
  }
  return { path, steps }
}

// ─────────────────────────── helpers ───────────────────────────

const ORDINAL_TR = ['', 'birinci', 'ikinci', 'üçüncü', 'dördüncü', 'beşinci', 'altıncı', 'yedinci', 'sekizinci', 'dokuzuncu', 'onuncu']
const ORDINAL_EN = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const TIMES_EN = ['', 'once', 'twice', 'three times', 'four times', 'five times']

const ordTr = (n: number) => ORDINAL_TR[n] ?? `${n}.`
const ordEn = (n: number) => ORDINAL_EN[n] ?? `${n}th`

function gw(gender: Gender | undefined, m: string, f: string, o: string) {
  return gender === 'male' ? m : gender === 'female' ? f : o
}

/** Matches U^a D^b exactly; returns [a, b] or null. */
function blood(s: string): [number, number] | null {
  const m = /^(U*)(D*)$/.exec(s)
  return m ? [m[1].length, m[2].length] : null
}

interface Ctx {
  g: FamilyGraph
  ids: string[]
  p: (i: number) => Person | undefined
}

/** Parent link type between parent ids[i+1] and child ids[i] (for U) or reverse (for D). */
function linkType(ctx: Ctx, childIdx: number, parentIdx: number) {
  const child = ctx.ids[childIdx]
  const parent = ctx.ids[parentIdx]
  return (ctx.g.parents.get(child) ?? []).find((l) => l.parentId === parent)?.type ?? 'biological'
}

function sharedParents(g: FamilyGraph, a: string, b: string) {
  const pa = parentIds(g, a)
  const pb = parentIds(g, b)
  const shared = pa.filter((x) => pb.includes(x))
  return { shared, full: shared.length >= 2 || (shared.length === pa.length && shared.length === pb.length && shared.length > 0 && pa.length >= 2) }
}

// ─────────────────────────── Turkish segments ───────────────────────────

interface SegResult {
  term: string
  category: KinCategory
}

function segTr(s: string, ctx: Ctx): SegResult | null {
  const last = ctx.ids.length - 1
  const target = ctx.p(last)
  const tg = target?.gender
  const from = ctx.p(0)

  // Pure blood lines.
  const b = blood(s)
  if (b) {
    const [a, d] = b
    if (a === 1 && d === 0) {
      const t = linkType(ctx, 0, 1)
      const base = gw(tg, 'babası', 'annesi', 'ebeveyni')
      if (t === 'step') return { term: `üvey ${base}`, category: 'step' }
      if (t === 'foster') return { term: `koruyucu ${base}`, category: 'step' }
      if (t === 'adopted') return { term: `manevi ${base}`, category: 'parent' }
      return { term: base, category: 'parent' }
    }
    if (a === 0 && d === 1) {
      const t = linkType(ctx, 1, 0)
      const base = gw(tg, 'oğlu', 'kızı', 'çocuğu')
      if (t === 'step') return { term: `üvey ${base}`, category: 'step' }
      if (t === 'adopted' || t === 'foster') return { term: `evlatlık ${base}`, category: 'child' }
      return { term: base, category: 'child' }
    }
    if (a === 2 && d === 0) {
      const side = ctx.p(1)?.gender
      if (tg === 'female') return { term: side === 'male' ? 'babaannesi' : side === 'female' ? 'anneannesi' : 'büyükannesi', category: 'grandparent' }
      return { term: tg === 'male' ? 'dedesi' : 'büyük ebeveyni', category: 'grandparent' }
    }
    if (a >= 3 && d === 0) {
      const prefix = 'büyük '.repeat(a - 2)
      return { term: prefix + gw(tg, 'dedesi', 'ninesi', 'atası'), category: 'grandparent' }
    }
    if (a === 0 && d === 2) return { term: 'torunu', category: 'grandchild' }
    if (a === 0 && d === 3) return { term: 'torununun çocuğu', category: 'grandchild' }
    if (a === 0 && d === 4) return { term: 'torununun torunu', category: 'grandchild' }
    if (a === 0 && d >= 5) return { term: `${d - 1}. kuşaktan torunu`, category: 'grandchild' }
    if (a === 1 && d === 1) {
      const { shared, full } = sharedParents(ctx.g, ctx.ids[0], ctx.ids[last])
      const bd = target?.birthDate
      const fd = from?.birthDate
      let term: string
      if (bd && fd && bd !== fd) {
        const older = bd < fd
        term = older ? gw(tg, 'ağabeyi', 'ablası', 'kardeşi') : gw(tg, 'erkek kardeşi', 'kız kardeşi', 'kardeşi')
      } else term = gw(tg, 'erkek kardeşi', 'kız kardeşi', 'kardeşi')
      if (!full && shared.length === 1) {
        const sp = ctx.g.persons.get(shared[0])
        const prefix = sp?.gender === 'male' ? 'baba bir' : sp?.gender === 'female' ? 'anne bir' : 'yarım'
        term = `${prefix} ${term}`
      }
      return { term, category: 'sibling' }
    }
    if (a === 2 && d === 1) {
      const side = ctx.p(1)?.gender
      if (side === 'male') return { term: gw(tg, 'amcası', 'halası', 'amcası/halası'), category: 'uncle_aunt' }
      if (side === 'female') return { term: gw(tg, 'dayısı', 'teyzesi', 'dayısı/teyzesi'), category: 'uncle_aunt' }
      return null
    }
    if (a === 1 && d === 2) return { term: 'yeğeni', category: 'nephew' }
    if (a === 2 && d === 2) {
      const side = ctx.p(1)?.gender
      const auntUncle = ctx.p(3)?.gender
      let base: string | null = null
      if (side === 'male') base = auntUncle === 'male' ? 'amca' : auntUncle === 'female' ? 'hala' : null
      else if (side === 'female') base = auntUncle === 'male' ? 'dayı' : auntUncle === 'female' ? 'teyze' : null
      const child = gw(tg, 'oğlu', 'kızı', 'çocuğu')
      return { term: base ? `${base} ${child}` : 'kuzeni', category: 'cousin' }
    }
    if (a >= 3 && a === d) return { term: `${ordTr(a - 1)} dereceden kuzeni`, category: 'cousin' }
    return null
  }

  // Marriage-based patterns.
  const linkTypeLast = () => {
    const l = partnerLink(ctx.g, ctx.ids[last - 1], ctx.ids[last])
    return l?.type
  }
  const ex = () => (linkTypeLast() === 'divorced' ? 'eski ' : '')
  switch (s) {
    case 'S': {
      const t = linkTypeLast()
      if (t === 'divorced') return { term: 'eski eşi', category: 'spouse' }
      if (t === 'engaged') return { term: 'nişanlısı', category: 'spouse' }
      if (t === 'partner') return { term: 'hayat arkadaşı', category: 'spouse' }
      return { term: 'eşi', category: 'spouse' }
    }
    case 'SU':
      return { term: gw(tg, 'kayınpederi', 'kayınvalidesi', 'kayın ebeveyni'), category: 'inlaw' }
    case 'DS':
      return { term: ex() + gw(tg, 'damadı', 'gelini', 'çocuğunun eşi'), category: 'inlaw' }
    case 'UDS':
      return { term: ex() + gw(tg, 'eniştesi', 'yengesi', 'kardeşinin eşi'), category: 'inlaw' }
    case 'UUDS':
      return { term: ex() + gw(tg, 'eniştesi', 'yengesi', 'amcasının/halasının eşi'), category: 'inlaw' }
    case 'SUD': {
      if (tg === 'male') return { term: 'kayınbiraderi', category: 'inlaw' }
      if (tg === 'female') return { term: from?.gender === 'male' ? 'baldızı' : from?.gender === 'female' ? 'görümcesi' : 'eşinin kız kardeşi', category: 'inlaw' }
      return null
    }
    case 'SUDS': {
      if (from?.gender === 'male' && tg === 'male' && ctx.p(3)?.gender === 'female') return { term: 'bacanağı', category: 'inlaw' }
      if (from?.gender === 'female' && tg === 'female' && ctx.p(3)?.gender === 'male') return { term: 'eltisi', category: 'inlaw' }
      return null
    }
    case 'DSU':
      return { term: 'dünürü', category: 'inlaw' }
    case 'SD':
      return { term: `üvey ${gw(tg, 'oğlu', 'kızı', 'çocuğu')}`, category: 'step' }
    case 'US':
      return { term: `üvey ${gw(tg, 'babası', 'annesi', 'ebeveyni')}`, category: 'step' }
  }
  return null
}

// ─────────────────────────── English segments ───────────────────────────

function greatPrefix(n: number) {
  if (n <= 0) return ''
  if (n === 1) return 'great-'
  return n <= 3 ? 'great-'.repeat(n) : `${n}× great-`
}

function segEn(s: string, ctx: Ctx): SegResult | null {
  const last = ctx.ids.length - 1
  const tg = ctx.p(last)?.gender
  const from = ctx.p(0)
  const b = blood(s)
  if (b) {
    const [a, d] = b
    if (a === 1 && d === 0) {
      const t = linkType(ctx, 0, 1)
      const base = gw(tg, 'father', 'mother', 'parent')
      if (t === 'step') return { term: `step${base}`, category: 'step' }
      if (t === 'foster') return { term: `foster ${base}`, category: 'step' }
      if (t === 'adopted') return { term: `adoptive ${base}`, category: 'parent' }
      return { term: base, category: 'parent' }
    }
    if (a === 0 && d === 1) {
      const t = linkType(ctx, 1, 0)
      const base = gw(tg, 'son', 'daughter', 'child')
      if (t === 'step') return { term: `step${base}`, category: 'step' }
      if (t === 'adopted') return { term: `adopted ${base}`, category: 'child' }
      if (t === 'foster') return { term: `foster ${base}`, category: 'child' }
      return { term: base, category: 'child' }
    }
    if (d === 0) return { term: greatPrefix(a - 2) + gw(tg, 'grandfather', 'grandmother', 'grandparent'), category: 'grandparent' }
    if (a === 0) return { term: greatPrefix(d - 2) + gw(tg, 'grandson', 'granddaughter', 'grandchild'), category: 'grandchild' }
    if (a === 1 && d === 1) {
      const { shared, full } = sharedParents(ctx.g, ctx.ids[0], ctx.ids[last])
      const base = gw(tg, 'brother', 'sister', 'sibling')
      return { term: !full && shared.length === 1 ? `half-${base}` : base, category: 'sibling' }
    }
    if (d === 1) {
      const n = a - 2
      return { term: (n === 0 ? '' : n === 1 ? 'great-' : greatPrefix(n - 1) + 'great-') + gw(tg, 'uncle', 'aunt', 'aunt/uncle'), category: 'uncle_aunt' }
    }
    if (a === 1) {
      const n = d - 2
      return { term: (n === 0 ? '' : greatPrefix(n - 1) + 'grand') + gw(tg, 'nephew', 'niece', 'nibling'), category: 'nephew' }
    }
    const degree = Math.min(a, d) - 1
    const removed = Math.abs(a - d)
    const term = `${ordEn(degree)} cousin${removed ? ` ${TIMES_EN[removed] ?? `${removed} times`} removed` : ''}`
    return { term, category: 'cousin' }
  }
  const t = partnerLink(ctx.g, ctx.ids[last - 1], ctx.ids[last])?.type
  const ex = t === 'divorced' ? 'former ' : ''
  switch (s) {
    case 'S':
      if (t === 'engaged') return { term: gw(tg, 'fiancé', 'fiancée', 'fiancé(e)'), category: 'spouse' }
      if (t === 'partner') return { term: 'partner', category: 'spouse' }
      return { term: ex + gw(tg, 'husband', 'wife', 'spouse'), category: 'spouse' }
    case 'SU':
      return { term: gw(tg, 'father-in-law', 'mother-in-law', 'parent-in-law'), category: 'inlaw' }
    case 'DS':
      return { term: ex + gw(tg, 'son-in-law', 'daughter-in-law', 'child-in-law'), category: 'inlaw' }
    case 'UDS':
    case 'SUD':
      return { term: ex + gw(tg, 'brother-in-law', 'sister-in-law', 'sibling-in-law'), category: 'inlaw' }
    case 'UUDS':
      return { term: ex + gw(tg, 'uncle (by marriage)', 'aunt (by marriage)', 'aunt/uncle (by marriage)'), category: 'inlaw' }
    case 'SUDS':
      return { term: gw(tg, 'brother-in-law', 'sister-in-law', 'sibling-in-law'), category: 'inlaw' }
    case 'DSU':
      return { term: 'co-parent-in-law', category: 'inlaw' }
    case 'SD':
      return { term: `step${gw(tg, 'son', 'daughter', 'child')}`, category: 'step' }
    case 'US':
      return { term: `step${gw(tg, 'father', 'mother', 'parent')}`, category: 'step' }
  }
  void from
  return null
}

// ─────────────────────────── 2nd person ("your") ───────────────────────────

const V = 'aeıioöuü'

function harmony2(vowel: string) {
  return vowel === 'a' || vowel === 'ı' ? 'ız' : vowel === 'e' || vowel === 'i' ? 'iz' : vowel === 'o' || vowel === 'u' ? 'uz' : 'üz'
}

function lastVowelOf(w: string) {
  for (let i = w.length - 1; i >= 0; i--) if (V.includes(w[i])) return w[i]
  return 'e'
}

/** "babası" → "babanız", "oğlu" → "oğlunuz", "eşi" → "eşiniz". */
export function yourWord(w: string): string {
  if (w === 'kendisi') return 'kendiniz'
  const m = /^(.*[aeıioöuü])s[ıiuü]$/.exec(w)
  if (m) return `${m[1]}n${harmony2(lastVowelOf(m[1]))}`
  if (/[ıiuü]$/.test(w)) return `${w}n${harmony2(w.slice(-1))}`
  return w
}

/** Applies the 2nd person possessive to the last word of a term (handles "a/b" variants). */
function yourTerm(term: string): string {
  return term
    .split('/')
    .map((part) => {
      const words = part.split(' ')
      words[words.length - 1] = yourWord(words[words.length - 1])
      return words.join(' ')
    })
    .join('/')
}

// ─────────────────────────── segmentation ───────────────────────────

const MAX_SEG = 8

/**
 * Splits the path into the fewest known segments (ties → the longest last segment)
 * and joins them as a possessive chain: "babasının amcası", "father's uncle".
 */
function describeSteps(g: FamilyGraph, ids: string[], steps: Step[], lang: Lang): SegResult & { termYour: string } {
  const s = steps.join('')
  const n = s.length
  const segFn = lang === 'en' ? segEn : segTr
  const classify = (i: number, j: number): SegResult | null => {
    const sub = ids.slice(i, j + 1)
    return segFn(s.slice(i, j), { g, ids: sub, p: (k) => g.persons.get(sub[k]) })
  }
  // best[j] = [segment count, segments] for steps[0..j)
  const best: ({ count: number; segs: { i: number; j: number; r: SegResult }[] } | null)[] = Array(n + 1).fill(null)
  best[0] = { count: 0, segs: [] }
  for (let j = 1; j <= n; j++) {
    for (let i = Math.max(0, j - MAX_SEG); i < j; i++) {
      // i ascending → longer last segment wins ties.
      const prevBest = best[i]
      if (!prevBest) continue
      const r = classify(i, j)
      if (!r) continue
      const count = prevBest.count + 1
      if (!best[j] || count < best[j]!.count) best[j] = { count, segs: [...prevBest.segs, { i, j, r }] }
    }
  }
  const result = best[n]
  if (!result) return lang === 'en' ? { term: 'relative', termYour: 'relative', category: 'other' } : { term: 'akrabası', termYour: 'akrabanız', category: 'other' }
  const segs = result.segs
  if (segs.length === 1) return { ...segs[0].r, termYour: lang === 'en' ? segs[0].r.term : yourTerm(segs[0].r.term) }
  const words = segs.map((x) => x.r.term)
  let term: string
  let termYour: string
  if (lang === 'en') {
    term = words.map((w, k) => (k < words.length - 1 ? `${w}'s` : w)).join(' ')
    termYour = term
  } else {
    term = words.map((w, k) => (k < words.length - 1 ? genitiveWord(w) : w)).join(' ')
    // Only the first word refers to the viewer: "babanızın amcası".
    termYour = words.map((w, k) => (k === 0 ? genitiveWord(yourTerm(w)) : k < words.length - 1 ? genitiveWord(w) : w)).join(' ')
  }
  // Category of a chain: blood-only chains stay "other"; any spouse step makes it in-law.
  const category: KinCategory = steps.includes('S') ? 'inlaw' : 'other'
  return { term, termYour, category }
}

function commonAncestor(path: string[], steps: Step[]): string | undefined {
  const s = steps.join('')
  const b = blood(s)
  if (!b) return undefined
  return path[b[0]]
}

function firstName(p?: Person) {
  return p?.firstName?.trim() || p?.lastName || '?'
}

function sentenceFor(from: Person | undefined, to: Person | undefined, term: string, lang: Lang) {
  if (lang === 'en') return `${firstName(to)} is ${firstName(from)}'s ${term}`
  return `${firstName(to)}, ${genitive(firstName(from))} ${term}`
}

function resultFrom(g: FamilyGraph, path: string[], steps: Step[], lang: Lang): RelationResult {
  const from = g.persons.get(path[0])
  const to = g.persons.get(path[path.length - 1])
  if (!steps.length) {
    const term = lang === 'en' ? 'self' : 'kendisi'
    return { term, termYour: lang === 'en' ? 'yourself' : 'kendiniz', sentence: lang === 'en' ? `This is ${firstName(from)}` : `Bu kişi ${firstName(from)}`, path, steps, category: 'self', commonAncestorId: path[0] }
  }
  const { term, termYour, category } = describeSteps(g, path, steps, lang)
  return { term, termYour, sentence: sentenceFor(from, to, term, lang), path, steps, category, commonAncestorId: commonAncestor(path, steps) }
}

/** How `toId` is related to `fromId`. Returns null when they are not connected. */
export function describeRelation(g: FamilyGraph, fromId: string, toId: string, lang: Lang = 'tr'): RelationResult | null {
  if (!g.persons.has(fromId) || !g.persons.has(toId)) return null
  const tree = shortestPaths(g, fromId)
  const t = tracePath(tree, fromId, toId)
  if (!t) return null
  return resultFrom(g, t.path, t.steps, lang)
}

/** Relation of every connected person to `fromId` (one shortest-path run). */
export function relationsFrom(g: FamilyGraph, fromId: string, lang: Lang = 'tr', maxSteps = 6): Map<string, RelationResult> {
  const out = new Map<string, RelationResult>()
  if (!g.persons.has(fromId)) return out
  const tree = shortestPaths(g, fromId)
  for (const id of tree.dist.keys()) {
    if (id === fromId) continue
    const t = tracePath(tree, fromId, id)
    if (!t || t.steps.length > maxSteps) continue
    out.set(id, resultFrom(g, t.path, t.steps, lang))
  }
  return out
}

/** Label for a single step, used when drawing the path chain. */
export function stepLabel(step: Step, target: Person | undefined, lang: Lang = 'tr'): string {
  const tg = target?.gender
  if (lang === 'en') return step === 'U' ? gw(tg, 'father', 'mother', 'parent') : step === 'D' ? gw(tg, 'son', 'daughter', 'child') : gw(tg, 'husband', 'wife', 'spouse')
  return step === 'U' ? gw(tg, 'babası', 'annesi', 'ebeveyni') : step === 'D' ? gw(tg, 'oğlu', 'kızı', 'çocuğu') : 'eşi'
}

export const CATEGORY_ORDER: KinCategory[] = ['spouse', 'parent', 'sibling', 'child', 'grandparent', 'grandchild', 'uncle_aunt', 'cousin', 'nephew', 'inlaw', 'step', 'other']

export function categoryLabel(c: KinCategory, lang: Lang = 'tr'): string {
  const tr: Record<KinCategory, string> = {
    self: 'Kendim',
    spouse: 'Eşim',
    parent: 'Annem & babam',
    sibling: 'Kardeşlerim',
    child: 'Çocuklarım',
    grandparent: 'Büyükannelerim & dedelerim',
    grandchild: 'Torunlarım',
    uncle_aunt: 'Amca, hala, dayı, teyzelerim',
    cousin: 'Kuzenlerim',
    nephew: 'Yeğenlerim',
    inlaw: 'Evlilik yoluyla akrabalarım',
    step: 'Üvey akrabalarım',
    other: 'Diğer akrabalarım',
  }
  const en: Record<KinCategory, string> = {
    self: 'Me',
    spouse: 'Spouse',
    parent: 'Parents',
    sibling: 'Siblings',
    child: 'Children',
    grandparent: 'Grandparents',
    grandchild: 'Grandchildren',
    uncle_aunt: 'Aunts & uncles',
    cousin: 'Cousins',
    nephew: 'Nieces & nephews',
    inlaw: 'In-laws',
    step: 'Step relatives',
    other: 'Other relatives',
  }
  return (lang === 'en' ? en : tr)[c]
}
