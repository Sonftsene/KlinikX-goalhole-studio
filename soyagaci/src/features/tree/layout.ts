// Pure tree layout engine. No React, no DOM — easy to test and reuse for export.
//
// Every subtree owns a vertical "column" [0, width] and siblings are placed in
// disjoint columns, so nodes can never overlap. Generations sit on fixed rows.

import type { ParentLink, PartnerLink } from '../../types'
import { type FamilyGraph, partnerLink } from '../../lib/graph'

export type TreeMode = 'hourglass' | 'ancestors' | 'descendants' | 'family'

export const CARD_W = 172
export const CARD_H = 76
export const PARTNER_GAP = 26
export const SIBLING_GAP = 26
export const ROW_GAP = 72
export const ROW_H = CARD_H + ROW_GAP

/** What the small round button above/below a card does. */
export type NodeAction = 'expand' | 'collapse' | 'reroot'

export interface TreeNode {
  /** Unique per node (a person can appear twice, e.g. cousin marriages). */
  key: string
  personId: string
  x: number
  y: number
  w: number
  h: number
  /** Generation relative to the root (negative = ancestors). */
  gen: number
  kind: 'root' | 'line' | 'partner' | 'ancestor'
  up?: NodeAction
  /** Person to re-root on when `up` is 'reroot'. */
  upTarget?: string
  down?: NodeAction
  /** Shown again elsewhere in the tree; not expanded here. */
  duplicate?: boolean
}

export interface TreeEdge {
  key: string
  kind: 'child' | 'partner'
  /** child edge: parent → child; partner edge: a ↔ b. */
  from: string
  to: string
  points: [number, number][]
  dashed?: boolean
}

export interface TreeLayout {
  nodes: TreeNode[]
  edges: TreeEdge[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }
  rootId: string
  /** Person the chart actually starts from (differs from root in 'family' mode). */
  topId: string
}

export interface LayoutOptions {
  mode: TreeMode
  rootId: string
  /** Generations to show above / below the root. */
  maxUp?: number
  maxDown?: number
  /**
   * Manual open/close overrides: key `u:<id>` (parents) or `d:<id>` (children)
   * → 'open' | 'closed'. Overrides the depth limit.
   */
  toggles?: Map<string, 'open' | 'closed'>
  /** null/undefined = everyone visible. */
  visible?: Set<string> | null
  /** 'family' mode: follow father or mother line up to the oldest ancestor. */
  side?: 'father' | 'mother'
}

interface Sub {
  w: number
  nodes: TreeNode[]
  edges: TreeEdge[]
  /** Centre x of the subtree's main card. */
  anchor: number
}

interface Ctx {
  g: FamilyGraph
  vis: (id: string) => boolean
  toggles: Map<string, 'open' | 'closed'>
  placed: Set<string>
  seq: number
}

const shiftSub = (s: Sub, dx: number): Sub => {
  if (!dx) return s
  for (const n of s.nodes) n.x += dx
  for (const e of s.edges) for (const p of e.points) p[0] += dx
  s.anchor += dx
  return s
}

const rowY = (gen: number) => gen * ROW_H

const isOpen = (ctx: Ctx, key: string, remaining: number) => {
  const t = ctx.toggles.get(key)
  if (t === 'open') return true
  if (t === 'closed') return false
  return remaining > 0
}

const partnerDashed = (l?: PartnerLink) => !!l && (l.type === 'divorced' || l.type === 'partner' || l.type === 'engaged')
const childDashed = (l?: ParentLink) => !!l && l.type !== 'biological'

function visibleParents(ctx: Ctx, id: string): string[] {
  const links = (ctx.g.parents.get(id) ?? []).filter((l) => ctx.vis(l.parentId))
  const rank = (l: ParentLink) => {
    const gender = ctx.g.persons.get(l.parentId)?.gender
    return (l.type === 'biological' ? 0 : 10) + (gender === 'male' ? 0 : gender === 'female' ? 1 : 2)
  }
  const sorted = [...links].sort((a, b) => rank(a) - rank(b))
  // At most one father-figure and one mother-figure, biological first.
  const out: string[] = []
  for (const l of sorted) {
    if (out.length >= 2) break
    const gender = ctx.g.persons.get(l.parentId)?.gender
    if (out.length === 1 && gender !== 'other' && ctx.g.persons.get(out[0])?.gender === gender) continue
    out.push(l.parentId)
  }
  // Father on the left, mother on the right.
  return out.sort((a, b) => (ctx.g.persons.get(a)?.gender === 'female' ? 1 : 0) - (ctx.g.persons.get(b)?.gender === 'female' ? 1 : 0))
}

function visibleChildren(ctx: Ctx, id: string): string[] {
  return (ctx.g.children.get(id) ?? []).map((l) => l.childId).filter(ctx.vis)
}

function visiblePartners(ctx: Ctx, id: string): string[] {
  const links = (ctx.g.partners.get(id) ?? []).filter((l) => ctx.vis(l.aId === id ? l.bId : l.aId))
  return [...links]
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'))
    .map((l) => (l.aId === id ? l.bId : l.aId))
}

function makeNode(ctx: Ctx, personId: string, x: number, gen: number, kind: TreeNode['kind']): TreeNode {
  return { key: `n${ctx.seq++}_${personId}`, personId, x, y: rowY(gen), w: CARD_W, h: CARD_H, gen, kind }
}

// ───────────────────────── descendants ─────────────────────────

function descendants(ctx: Ctx, pid: string, remaining: number, gen: number, kind: TreeNode['kind']): Sub {
  const { g } = ctx
  if (ctx.placed.has(pid)) {
    const n = makeNode(ctx, pid, 0, gen, kind)
    n.duplicate = true
    return { w: CARD_W, nodes: [n], edges: [], anchor: CARD_W / 2 }
  }
  ctx.placed.add(pid)

  const partners = visiblePartners(ctx, pid)
  const children = visibleChildren(ctx, pid)

  // Group children by their other parent.
  const groups = new Map<string, string[]>()
  for (const c of children) {
    const others = (g.parents.get(c) ?? []).map((l) => l.parentId).filter((x) => x !== pid && ctx.vis(x))
    const key = others.find((o) => partners.includes(o)) ?? others[0] ?? ''
    if (key && !partners.includes(key)) partners.push(key)
    const list = groups.get(key)
    if (list) list.push(c)
    else groups.set(key, [c])
  }

  // Order the row of cards: single partner by gender (man left), several partners around the person.
  let row: string[]
  if (partners.length === 0) row = [pid]
  else if (partners.length === 1) {
    const meFemale = g.persons.get(pid)?.gender === 'female'
    const pMale = g.persons.get(partners[0])?.gender === 'male'
    row = meFemale || pMale ? [partners[0], pid] : [pid, partners[0]]
  } else row = [partners[0], pid, ...partners.slice(1)]

  const rowW = row.length * CARD_W + (row.length - 1) * PARTNER_GAP
  const open = children.length > 0 && isOpen(ctx, `d:${pid}`, remaining)

  // Lay out children subtrees.
  const pIndex = row.indexOf(pid)
  const cardX = (i: number) => i * (CARD_W + PARTNER_GAP)
  const dropX = (key: string) => {
    if (!key) return cardX(pIndex) + CARD_W / 2
    const i = row.indexOf(key)
    if (Math.abs(i - pIndex) === 1) return (cardX(Math.min(i, pIndex)) + CARD_W + cardX(Math.max(i, pIndex))) / 2
    return cardX(i) + CARD_W / 2
  }
  const groupOrder = [...groups.keys()].sort((a, b) => dropX(a) - dropX(b))

  const childSubs: { sub: Sub; key: string; childId: string }[] = []
  if (open) {
    for (const key of groupOrder)
      for (const c of groups.get(key)!) {
        const sub = descendants(ctx, c, Math.max(remaining - 1, 0), gen + 1, 'line')
        childSubs.push({ sub, key, childId: c })
      }
  }
  const childrenW = childSubs.reduce((s, c) => s + c.sub.w, 0) + Math.max(0, childSubs.length - 1) * SIBLING_GAP
  const w = Math.max(rowW, childrenW)
  const rowOff = (w - rowW) / 2
  const childOff = (w - childrenW) / 2

  const nodes: TreeNode[] = []
  const edges: TreeEdge[] = []
  const y = rowY(gen)
  const midY = y + CARD_H / 2
  const bottom = y + CARD_H

  row.forEach((id, i) => {
    const isMain = id === pid
    const n = makeNode(ctx, id, rowOff + cardX(i), gen, isMain ? kind : 'partner')
    if (!isMain && ctx.placed.has(id)) n.duplicate = true
    if (!isMain) ctx.placed.add(id)
    if (isMain) {
      if (children.length) n.down = open ? 'collapse' : 'expand'
    } else {
      // In-laws: offer to open their own family.
      const ps = visibleParents(ctx, id)
      if (ps.length) {
        n.up = 'reroot'
        n.upTarget = id
      }
    }
    nodes.push(n)
  })

  // Partner lines.
  for (const sp of partners) {
    const i = row.indexOf(sp)
    const link = partnerLink(g, pid, sp)
    const a = rowOff + cardX(Math.min(i, pIndex))
    const b = rowOff + cardX(Math.max(i, pIndex))
    if (Math.abs(i - pIndex) === 1) {
      edges.push({ key: `pl_${pid}_${sp}_${ctx.seq++}`, kind: 'partner', from: pid, to: sp, points: [[a + CARD_W, midY], [b, midY]], dashed: !link || partnerDashed(link) })
    } else {
      const top = y - 12
      const ax = rowOff + cardX(pIndex) + CARD_W / 2 + 14
      const bx = rowOff + cardX(i) + CARD_W / 2 - 14
      edges.push({ key: `pl_${pid}_${sp}_${ctx.seq++}`, kind: 'partner', from: pid, to: sp, points: [[ax, y], [ax, top], [bx, top], [bx, y]], dashed: !link || partnerDashed(link) })
    }
  }

  // Children.
  let cx = childOff
  const groupIdx = new Map(groupOrder.map((k, i) => [k, i]))
  for (const { sub, key, childId } of childSubs) {
    shiftSub(sub, cx)
    cx += sub.w + SIBLING_GAP
    nodes.push(...sub.nodes)
    edges.push(...sub.edges)
    const gi = groupIdx.get(key) ?? 0
    const barY = bottom + ROW_GAP * 0.5 + (gi - (groupOrder.length - 1) / 2) * 8
    const childTop = rowY(gen + 1)
    const dx = rowOff + dropX(key)
    const adjacent = key && Math.abs(row.indexOf(key) - pIndex) === 1
    const tail: [number, number][] = [
      [dx, barY],
      [sub.anchor, barY],
      [sub.anchor, childTop],
    ]
    const linkTo = (parent: string) => (g.parents.get(childId) ?? []).find((l) => l.parentId === parent)
    // One edge per parent so blood-line highlighting can colour the right half.
    const parents = key ? [pid, key] : [pid]
    for (const parent of parents) {
      let pts: [number, number][]
      if (adjacent) {
        // Start on the marriage line, at the edge of this parent's card.
        const pi = row.indexOf(parent)
        const other = row.indexOf(parent === pid ? key : pid)
        const edgeX = rowOff + cardX(pi) + (pi < other ? CARD_W : 0)
        pts = [[edgeX, midY], [dx, midY], ...tail]
      } else {
        pts = [[dx, bottom], ...tail]
      }
      edges.push({ key: `ce_${parent}_${childId}_${ctx.seq++}`, kind: 'child', from: parent, to: childId, points: pts.map((p) => [p[0], p[1]]), dashed: childDashed(linkTo(parent)) })
    }
  }

  return { w, nodes, edges, anchor: rowOff + cardX(pIndex) + CARD_W / 2 }
}

// ───────────────────────── ancestors ─────────────────────────

function ancestors(ctx: Ctx, pid: string, remaining: number, gen: number, kind: TreeNode['kind']): Sub {
  const { g } = ctx
  const node = makeNode(ctx, pid, 0, gen, kind)
  if (ctx.placed.has(pid)) {
    node.duplicate = true
    return { w: CARD_W, nodes: [node], edges: [], anchor: CARD_W / 2 }
  }
  ctx.placed.add(pid)
  const parents = visibleParents(ctx, pid)
  const open = parents.length > 0 && isOpen(ctx, `u:${pid}`, remaining)
  if (parents.length) node.up = open ? 'collapse' : 'expand'
  if (!open) return { w: CARD_W, nodes: [node], edges: [], anchor: CARD_W / 2 }

  const subs = parents.map((p) => ancestors(ctx, p, Math.max(remaining - 1, 0), gen - 1, 'ancestor'))
  let x = 0
  for (const s of subs) {
    shiftSub(s, x)
    x += s.w + SIBLING_GAP
  }
  const total = x - SIBLING_GAP
  const w = Math.max(CARD_W, total)
  const extra = (w - total) / 2
  for (const s of subs) shiftSub(s, extra)

  const nodes = subs.flatMap((s) => s.nodes)
  const edges = subs.flatMap((s) => s.edges)
  const parentY = rowY(gen - 1)
  const pMid = parentY + CARD_H / 2
  const childTop = rowY(gen)
  const mid = subs.length === 2 ? (subs[0].anchor + subs[1].anchor) / 2 : subs[0].anchor
  node.x = mid - CARD_W / 2
  nodes.push(node)

  const linkTo = (parent: string) => (g.parents.get(pid) ?? []).find((l) => l.parentId === parent)
  if (subs.length === 2) {
    const [fa, mo] = parents
    const link = partnerLink(g, fa, mo)
    const left = subs[0].anchor + CARD_W / 2
    const right = subs[1].anchor - CARD_W / 2
    edges.push({ key: `pl_${fa}_${mo}_${ctx.seq++}`, kind: 'partner', from: fa, to: mo, points: [[left, pMid], [right, pMid]], dashed: !link || partnerDashed(link) })
    edges.push({ key: `ce_${fa}_${pid}_${ctx.seq++}`, kind: 'child', from: fa, to: pid, points: [[left, pMid], [mid, pMid], [mid, childTop]], dashed: childDashed(linkTo(fa)) })
    edges.push({ key: `ce_${mo}_${pid}_${ctx.seq++}`, kind: 'child', from: mo, to: pid, points: [[right, pMid], [mid, pMid], [mid, childTop]], dashed: childDashed(linkTo(mo)) })
  } else {
    const p = parents[0]
    edges.push({ key: `ce_${p}_${pid}_${ctx.seq++}`, kind: 'child', from: p, to: pid, points: [[mid, parentY + CARD_H], [mid, childTop]], dashed: childDashed(linkTo(p)) })
  }
  return { w, nodes, edges, anchor: mid }
}

// ───────────────────────── public API ─────────────────────────

/** Oldest ancestor reachable through visible parents, following one side first. */
export function visibleTopAncestor(g: FamilyGraph, id: string, side: 'father' | 'mother', vis: (id: string) => boolean): string {
  let cur = id
  let first = true
  const seen = new Set<string>()
  while (!seen.has(cur)) {
    seen.add(cur)
    const parents = (g.parents.get(cur) ?? []).map((l) => g.persons.get(l.parentId)!).filter((p) => p && vis(p.id))
    if (!parents.length) break
    const want = first && side === 'mother' ? 'female' : 'male'
    cur = (parents.find((p) => p.gender === want) ?? parents[0]).id
    first = false
  }
  return cur
}

function computeBounds(nodes: TreeNode[], edges: TreeEdge[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.w)
    maxY = Math.max(maxY, n.y + n.h)
  }
  for (const e of edges)
    for (const [x, y] of e.points) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  if (!nodes.length) minX = minY = maxX = maxY = 0
  // Room for the expand buttons above/below the cards.
  minY -= 16
  maxY += 16
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function layoutTree(g: FamilyGraph, opts: LayoutOptions): TreeLayout {
  const visible = opts.visible ?? null
  const vis = (id: string) => g.persons.has(id) && (visible === null || visible.has(id))
  const toggles = opts.toggles ?? new Map()
  const maxUp = opts.maxUp ?? 3
  const maxDown = opts.maxDown ?? 3
  const rootId = opts.rootId
  if (!vis(rootId)) return { nodes: [], edges: [], bounds: computeBounds([], []), rootId, topId: rootId }

  const newCtx = (): Ctx => ({ g, vis, toggles, placed: new Set(), seq: 0 })
  let nodes: TreeNode[] = []
  let edges: TreeEdge[] = []
  let topId = rootId

  if (opts.mode === 'descendants' || opts.mode === 'family') {
    if (opts.mode === 'family') topId = visibleTopAncestor(g, rootId, opts.side ?? 'father', vis)
    const ctx = newCtx()
    const d = descendants(ctx, topId, opts.mode === 'family' ? Math.max(maxDown, 99) : maxDown, 0, 'root')
    nodes = d.nodes
    edges = d.edges
    // Let the user climb up from the top of a descendants chart.
    const top = nodes.find((n) => n.kind === 'root')
    if (top) {
      const ps = visibleParents(ctx, topId)
      if (ps.length) {
        top.up = 'reroot'
        top.upTarget = ps[0]
      }
    }
  } else if (opts.mode === 'ancestors') {
    const a = ancestors(newCtx(), rootId, maxUp, 0, 'root')
    nodes = a.nodes
    edges = a.edges
  } else {
    const dctx = newCtx()
    const d = descendants(dctx, rootId, maxDown, 0, 'root')
    const actx = newCtx()
    actx.seq = 100000
    const a = ancestors(actx, rootId, maxUp, 0, 'root')
    shiftSub(a, d.anchor - a.anchor)
    const aRoot = a.nodes.find((n) => n.gen === 0)
    const dRoot = d.nodes.find((n) => n.kind === 'root')
    if (dRoot && aRoot) dRoot.up = aRoot.up
    nodes = [...d.nodes, ...a.nodes.filter((n) => n !== aRoot)]
    edges = [...d.edges, ...a.edges]
  }

  return { nodes, edges, bounds: computeBounds(nodes, edges), rootId, topId }
}

/** Shortest blood path between two people (parent/child steps; a partner may end the path). */
export function bloodPath(g: FamilyGraph, from?: string, to?: string): string[] {
  if (!from || !to || !g.persons.has(from) || !g.persons.has(to)) return []
  if (from === to) return [from]
  const search = (target: string) => {
    const prev = new Map<string, string>([[from, '']])
    const queue = [from]
    while (queue.length) {
      const cur = queue.shift()!
      if (cur === target) break
      const next = [...(g.parents.get(cur) ?? []).map((l) => l.parentId), ...(g.children.get(cur) ?? []).map((l) => l.childId)]
      for (const n of next)
        if (!prev.has(n)) {
          prev.set(n, cur)
          queue.push(n)
        }
    }
    if (!prev.has(target)) return null
    const path: string[] = []
    for (let c = target; c; c = prev.get(c)!) path.unshift(c)
    return path
  }
  const direct = search(to)
  if (direct) return direct
  for (const l of g.partners.get(to) ?? []) {
    const sp = l.aId === to ? l.bId : l.aId
    const p = search(sp)
    if (p) return [...p, to]
  }
  return []
}

/** Pairs "a|b" of consecutive people on a path, for quick edge lookup. */
export function pathPairs(path: string[]): Set<string> {
  const s = new Set<string>()
  for (let i = 1; i < path.length; i++) {
    s.add(`${path[i - 1]}|${path[i]}`)
    s.add(`${path[i]}|${path[i - 1]}`)
  }
  return s
}

/** True if some visible person in the layout has relatives the viewer cannot see. */
export function hasHiddenRelatives(g: FamilyGraph, layout: TreeLayout, visible: Set<string> | null): boolean {
  if (visible === null) return false
  for (const n of layout.nodes) {
    const id = n.personId
    const around = [
      ...(g.parents.get(id) ?? []).map((l) => l.parentId),
      ...(g.children.get(id) ?? []).map((l) => l.childId),
      ...(g.partners.get(id) ?? []).map((l) => (l.aId === id ? l.bId : l.aId)),
    ]
    if (around.some((x) => !visible.has(x))) return true
  }
  return false
}
