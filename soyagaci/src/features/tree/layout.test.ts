import { describe, expect, it } from 'vitest'
import { demoSeed } from '../../repo/seed'
import { buildGraph } from '../../lib/graph'
import { bloodPath, layoutTree, type TreeLayout, type TreeMode } from './layout'

const data = demoSeed()
const g = buildGraph(data.persons, data.relations)
const modes: TreeMode[] = ['hourglass', 'ancestors', 'descendants', 'family']

function overlaps(layout: TreeLayout): string[] {
  const out: string[] = []
  const ns = layout.nodes
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i]
      const b = ns[j]
      const sep = a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5
      if (!sep) out.push(`${a.personId}@(${a.x},${a.y}) × ${b.personId}@(${b.x},${b.y})`)
    }
  return out
}

describe('tree layout', () => {
  for (const mode of modes)
    for (const depth of [1, 3, 99])
      it(`never overlaps — ${mode}, depth ${depth}, every root`, () => {
        for (const p of data.persons) {
          const layout = layoutTree(g, { mode, rootId: p.id, maxUp: depth, maxDown: depth })
          expect(overlaps(layout), `${mode} root=${p.id}`).toEqual([])
          expect(layout.nodes.length).toBeGreaterThan(0)
        }
      })

  it('places ancestors above and descendants below in hourglass', () => {
    const l = layoutTree(g, { mode: 'hourglass', rootId: 'p_murat', maxUp: 9, maxDown: 9 })
    const y = (id: string) => l.nodes.find((n) => n.personId === id)!.y
    expect(y('p_ali')).toBeLessThan(y('p_murat'))
    expect(y('p_mehmet')).toBeLessThan(y('p_ali'))
    expect(y('p_emre')).toBeGreaterThan(y('p_murat'))
    expect(y('p_kaan')).toBeGreaterThan(y('p_emre'))
    // Father left, mother right.
    const x = (id: string) => l.nodes.find((n) => n.personId === id)!.x
    expect(x('p_ali')).toBeLessThan(x('p_zeynep'))
  })

  it('shows every descendant of the top ancestor in family mode', () => {
    const l = layoutTree(g, { mode: 'family', rootId: 'p_kaan' })
    expect(l.topId).toBe('p_mehmet')
    const ids = new Set(l.nodes.map((n) => n.personId))
    for (const id of ['p_ahmet', 'p_hacer', 'p_nuriye', 'p_ibrahim', 'p_gul', 'p_kaan', 'p_naz', 'p_deniz']) expect(ids.has(id)).toBe(true)
  })

  it('groups children under the right marriage', () => {
    const l = layoutTree(g, { mode: 'descendants', rootId: 'p_ahmet', maxDown: 3 })
    const x = (id: string) => l.nodes.find((n) => n.personId === id)!.x
    // Hacer (1st wife) is left of Nuriye (2nd wife); İbrahim under Hacer side, Gül under Nuriye side.
    expect(x('p_hacer')).toBeLessThan(x('p_nuriye'))
    expect(x('p_ibrahim')).toBeLessThan(x('p_gul'))
  })

  it('respects visibility', () => {
    const visible = new Set(['p_defne', 'p_can', 'p_sevgi'])
    const l = layoutTree(g, { mode: 'hourglass', rootId: 'p_defne', visible, maxUp: 9, maxDown: 9 })
    expect(new Set(l.nodes.map((n) => n.personId))).toEqual(visible)
  })

  it('respects collapse toggles', () => {
    const toggles = new Map([['d:p_murat', 'closed' as const]])
    const l = layoutTree(g, { mode: 'descendants', rootId: 'p_murat', toggles })
    expect(l.nodes.some((n) => n.personId === 'p_emre')).toBe(false)
    expect(l.nodes.find((n) => n.personId === 'p_murat')!.down).toBe('expand')
  })

  it('finds blood paths', () => {
    expect(bloodPath(g, 'p_zehra', 'p_ece')).toEqual(['p_zehra', 'p_murat', 'p_ali', 'p_selin', 'p_ece'])
    expect(bloodPath(g, 'p_zehra', 'p_merve').at(-1)).toBe('p_merve')
  })
})
