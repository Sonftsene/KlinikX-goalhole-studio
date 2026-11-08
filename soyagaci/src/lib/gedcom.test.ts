import { describe, expect, it } from 'vitest'
import { demoSeed } from '../repo/seed'
import { parseGedcom, parseGedcomDate, toGedcom, toGedcomDate } from './gedcom'
import type { Relation } from '../types'

const sig = (r: Relation) => (r.kind === 'parent' ? `P:${r.parentId}>${r.childId}:${r.type}` : `S:${[r.aId, r.bId].sort().join('+')}:${r.type}:${r.startDate ?? ''}:${r.endDate ?? ''}`)

describe('GEDCOM dates', () => {
  it('parses common forms', () => {
    expect(parseGedcomDate('12 MAR 1905')).toBe('1905-03-12')
    expect(parseGedcomDate('MAR 1905')).toBe('1905-03')
    expect(parseGedcomDate('ABT 1910')).toBe('1910')
    expect(parseGedcomDate('BEF 1900')).toBe('1900')
    expect(parseGedcomDate('BET 1900 AND 1905')).toBe('1900')
    expect(parseGedcomDate('1 OCA 1950')).toBe('1950-01-01')
    expect(parseGedcomDate('nonsense')).toBeUndefined()
    expect(toGedcomDate('1905-03-12')).toBe('12 MAR 1905')
    expect(toGedcomDate('1905-03')).toBe('MAR 1905')
  })
})

describe('GEDCOM round trip', () => {
  const data = demoSeed()
  const text = toGedcom(data.persons, data.relations, data.settings.familyName)
  const parsed = parseGedcom(text)

  it('writes a valid header and trailer', () => {
    expect(text.startsWith('0 HEAD')).toBe(true)
    expect(text).toContain('1 CHAR UTF-8')
    expect(text.trim().endsWith('0 TRLR')).toBe(true)
  })

  it('keeps all persons and their fields', () => {
    expect(parsed.warnings).toEqual([])
    expect(parsed.persons).toHaveLength(data.persons.length)
    for (const p of data.persons) {
      const q = parsed.persons.find((x) => x.id === p.id)!
      expect(q, p.id).toBeTruthy()
      expect(q.firstName).toBe(p.firstName)
      expect(q.lastName).toBe(p.lastName)
      expect(q.maidenName).toBe(p.maidenName)
      expect(q.gender).toBe(p.gender)
      expect(q.birthDate).toBe(p.birthDate)
      expect(q.deathDate).toBe(p.deathDate)
      expect(q.isDeceased).toBe(p.isDeceased)
      expect(q.birthPlace).toBe(p.birthPlace)
      expect(q.occupation).toBe(p.occupation)
      expect(q.bio).toBe(p.bio)
      expect(q.tags).toEqual(p.tags)
      if (p.birthGeo) {
        expect(q.birthGeo!.lat).toBeCloseTo(p.birthGeo.lat, 4)
        expect(q.birthGeo!.lng).toBeCloseTo(p.birthGeo.lng, 4)
      }
    }
  })

  it('keeps all relations', () => {
    expect(new Set(parsed.relations.map(sig))).toEqual(new Set(data.relations.map(sig)))
  })

  it('reads files from other programs', () => {
    const ged = [
      '﻿0 HEAD',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Hüseyin /Şahin/',
      '1 SEX M',
      '1 BIRT',
      '2 DATE ABT 1890',
      '2 PLAC Kayseri',
      '1 DEAT Y',
      '1 NOTE Uzun bir',
      '2 CONC  not',
      '2 CONT ikinci satır',
      '1 FAMS @F1@',
      '0 @I2@ INDI',
      '1 NAME Ayşe /Kara/',
      '1 SEX F',
      '1 _MARNM Şahin',
      '0 @I3@ INDI',
      '1 NAME Ömer /Şahin/',
      '1 SEX M',
      '1 FAMC @F1@',
      '2 PEDI adopted',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 MARR',
      '2 DATE 3 JUN 1915',
      '1 CHIL @I3@',
      '0 TRLR',
    ].join('\n')
    const r = parseGedcom(ged)
    expect(r.persons).toHaveLength(3)
    const h = r.persons.find((p) => p.firstName === 'Hüseyin')!
    expect(h.lastName).toBe('Şahin')
    expect(h.birthDate).toBe('1890')
    expect(h.isDeceased).toBe(true)
    expect(h.bio).toBe('Uzun bir not\nikinci satır')
    const a = r.persons.find((p) => p.firstName === 'Ayşe')!
    expect(a.lastName).toBe('Şahin')
    expect(a.maidenName).toBe('Kara')
    expect(r.relations.filter((x) => x.kind === 'partner')).toHaveLength(1)
    const kids = r.relations.filter((x) => x.kind === 'parent')
    expect(kids).toHaveLength(2)
    expect(kids.every((k) => k.kind === 'parent' && k.type === 'adopted')).toBe(true)
  })
})
