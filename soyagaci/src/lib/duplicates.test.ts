import { describe, expect, it } from 'vitest'
import { demoSeed } from '../repo/seed'
import { findDuplicates, similarTo } from './duplicates'
import type { Person } from '../types'

const persons = demoSeed().persons
const base = (p: Partial<Person>): Person => ({ id: 'new', firstName: '', lastName: '', gender: 'male', isDeceased: false, createdAt: '', updatedAt: '', ...p })

describe('duplicates', () => {
  it('finds no false duplicates in the demo family', () => {
    expect(findDuplicates(persons)).toEqual([])
  })

  it('detects a re-entered person with Turkish spelling differences', () => {
    const dup = base({ id: 'x', firstName: 'Mehmet', lastName: 'Yilmaz', birthDate: '1905', birthPlace: 'Trabzon' })
    const res = findDuplicates([...persons, dup])
    expect(res[0].score).toBeGreaterThanOrEqual(55)
    expect([res[0].a.id, res[0].b.id]).toContain('p_mehmet')
  })

  it('similarTo matches maiden names and skips the same id', () => {
    const m = similarTo(base({ firstName: 'Zeynep', lastName: 'Demir', gender: 'female', birthDate: '1936' }), persons)
    expect(m[0].person.id).toBe('p_zeynep')
    expect(m[0].reasons).toContain('Kızlık soyadı eşleşiyor')
    expect(similarTo(persons.find((p) => p.id === 'p_zeynep')!, persons).some((x) => x.person.id === 'p_zeynep')).toBe(false)
  })

  it('does not match same name across generations', () => {
    const m = similarTo(base({ firstName: 'Ali', lastName: 'Yılmaz', birthDate: '2019' }), persons)
    expect(m.some((x) => x.person.id === 'p_ali')).toBe(false)
  })
})
