import { describe, expect, it } from 'vitest'
import { demoSeed } from '../repo/seed'
import { buildGraph } from './graph'
import { describeRelation, relationsFrom } from './kinship'
import type { Person, Relation } from '../types'

const data = demoSeed()
const g = buildGraph(data.persons, data.relations)
const rel = (a: string, b: string, lang: 'tr' | 'en' = 'tr') => describeRelation(g, `p_${a}`, `p_${b}`, lang)
const term = (a: string, b: string, lang: 'tr' | 'en' = 'tr') => rel(a, b, lang)?.term

describe('Turkish kinship terms', () => {
  it('direct line', () => {
    expect(term('emre', 'murat')).toBe('babası')
    expect(term('emre', 'elif')).toBe('annesi')
    expect(term('emre', 'ali')).toBe('dedesi')
    expect(term('emre', 'zeynep')).toBe('babaannesi')
    expect(term('emre', 'mehmet')).toBe('büyük dedesi')
    expect(term('emre', 'fatma')).toBe('büyük ninesi')
    expect(term('kaan', 'mehmet')).toBe('büyük büyük dedesi')
    expect(term('murat', 'emre')).toBe('oğlu')
    expect(term('murat', 'zehra')).toBe('kızı')
    expect(term('murat', 'kaan')).toBe('torunu')
    expect(term('ali', 'naz')).toBe('torununun çocuğu')
    expect(term('mehmet', 'kaan')).toBe('torununun torunu')
  })

  it('maternal grandmother is anneanne', () => {
    expect(term('can', 'hatice')).toBe('babaannesi')
    expect(term('murat', 'hatice')).toBe('anneannesi')
    expect(term('murat', 'hasan')).toBe('dedesi')
  })

  it('siblings use age and half-sibling words', () => {
    expect(term('zehra', 'emre')).toBe('ağabeyi')
    expect(term('emre', 'zehra')).toBe('kız kardeşi')
    expect(term('murat', 'selin')).toBe('kız kardeşi')
    expect(term('selin', 'murat')).toBe('ağabeyi')
    expect(term('kemal', 'selin')).toBe('ablası')
    // Ahmet's children from two marriages.
    expect(term('gul', 'ibrahim')).toBe('baba bir ağabeyi')
    expect(term('ibrahim', 'gul')).toBe('baba bir kız kardeşi')
  })

  it('aunts, uncles, nephews and cousins', () => {
    expect(term('emre', 'selin')).toBe('halası')
    expect(term('emre', 'kemal')).toBe('amcası')
    expect(term('murat', 'ahmet')).toBe('amcası')
    expect(term('murat', 'ayse')).toBe('halası')
    expect(term('murat', 'mustafa')).toBe('dayısı')
    expect(term('selin', 'emre')).toBe('yeğeni')
    expect(term('emre', 'ece')).toBe('hala kızı')
    expect(rel('emre', 'ece')?.category).toBe('cousin')
    expect(term('ece', 'emre')).toBe('dayı oğlu')
    expect(term('murat', 'can')).toBe('dayı oğlu')
    expect(term('can', 'murat')).toBe('hala oğlu')
    expect(term('murat', 'ibrahim')).toBe('amca oğlu')
    expect(term('murat', 'deniz')).toBe('hala oğlu')
  })

  it('longer blood chains', () => {
    expect(term('zehra', 'ahmet')).toBe('babasının amcası')
    expect(term('defne', 'zeynep')).toBe('babasının halası')
    expect(term('emre', 'ibrahim')).toBe('babasının amca oğlu')
    expect(term('emre', 'onur')).toBe('ikinci dereceden kuzeni')
  })

  it('marriage relations', () => {
    expect(term('emre', 'merve')).toBe('eşi')
    expect(term('selin', 'burak')).toBe('eski eşi')
    expect(term('merve', 'murat')).toBe('kayınpederi')
    expect(term('merve', 'elif')).toBe('kayınvalidesi')
    expect(term('elif', 'merve')).toBe('gelini')
    expect(term('ali', 'elif')).toBe('gelini')
    expect(term('zeynep', 'osman')).toBe('eşinin eniştesi')
    expect(term('emre', 'burak')).toBe('eski eniştesi')
    expect(term('murat', 'osman')).toBe('eniştesi')
    expect(term('murat', 'emine')).toBe('yengesi')
    expect(term('merve', 'zehra')).toBe('görümcesi')
    expect(term('elif', 'kemal')).toBe('kayınbiraderi')
    expect(term('zehra', 'merve')).toBe('yengesi')
    expect(term('selin', 'elif')).toBe('yengesi')
  })

  it('prefers blood paths and sentences use Turkish genitive', () => {
    const r = rel('zehra', 'ahmet')!
    expect(r.sentence).toBe("Ahmet, Zehra'nın babasının amcası")
    expect(['p_mehmet', 'p_fatma']).toContain(r.commonAncestorId)
    expect(r.path[0]).toBe('p_zehra')
    expect(r.path.at(-1)).toBe('p_ahmet')
    expect(rel('emre', 'ece')!.sentence).toBe("Ece, Emre'nin hala kızı")
    expect(rel('kaan', 'emre')!.sentence).toBe("Emre, Ali Kaan'ın babası")
    expect(rel('emre', 'emre')!.term).toBe('kendisi')
  })

  it('bacanak, elti, dünür and step relations on a small family', () => {
    const P = (id: string, gender: Person['gender'], birthDate?: string): Person => ({ id, firstName: id, lastName: 'X', gender, isDeceased: false, createdAt: '', updatedAt: '', birthDate })
    const persons = [
      P('dad', 'male'),
      P('mom', 'female'),
      P('a', 'female', '1990'),
      P('b', 'female', '1992'),
      P('c', 'male', '1994'),
      P('ah', 'male'),
      P('bh', 'male'),
      P('cw', 'female'),
      P('ahDad', 'male'),
      P('kid', 'male'),
      P('step', 'male'),
    ]
    let i = 0
    const pc = (parentId: string, childId: string, type: 'biological' | 'step' = 'biological'): Relation => ({ id: `r${i++}`, kind: 'parent', parentId, childId, type })
    const pt = (aId: string, bId: string): Relation => ({ id: `r${i++}`, kind: 'partner', aId, bId, type: 'married' })
    const relations = [
      pt('dad', 'mom'),
      ...['a', 'b', 'c'].flatMap((k) => [pc('dad', k), pc('mom', k)]),
      pt('a', 'ah'),
      pt('b', 'bh'),
      pt('c', 'cw'),
      pc('ahDad', 'ah'),
      pc('ah', 'kid'),
      pc('a', 'kid'),
      pc('step', 'a', 'step'),
    ]
    const sg = buildGraph(persons, relations)
    const t = (x: string, y: string) => describeRelation(sg, x, y)?.term
    expect(t('ah', 'bh')).toBe('bacanağı')
    expect(t('a', 'b')).toBe('kız kardeşi')
    expect(t('ah', 'b')).toBe('baldızı')
    expect(t('cw', 'a')).toBe('görümcesi')
    expect(t('ah', 'c')).toBe('kayınbiraderi')
    expect(t('dad', 'ahDad')).toBe('dünürü')
    expect(t('a', 'step')).toBe('üvey babası')
    expect(t('ah', 'cw')).toBe('eşinin yengesi')
  })

  it('English terms', () => {
    expect(term('emre', 'murat', 'en')).toBe('father')
    expect(term('emre', 'zeynep', 'en')).toBe('grandmother')
    expect(term('emre', 'mehmet', 'en')).toBe('great-grandfather')
    expect(term('emre', 'selin', 'en')).toBe('aunt')
    expect(term('zehra', 'ahmet', 'en')).toBe('great-uncle')
    expect(term('emre', 'ece', 'en')).toBe('first cousin')
    expect(term('emre', 'ibrahim', 'en')).toBe('first cousin once removed')
    expect(term('emre', 'onur', 'en')).toBe('second cousin')
    expect(term('merve', 'murat', 'en')).toBe('father-in-law')
    expect(term('gul', 'ibrahim', 'en')).toBe('half-brother')
    expect(rel('emre', 'ece', 'en')!.sentence).toBe("Ece is Emre's first cousin")
  })

  it('second person forms for "Sizin …"', () => {
    const y = (a: string, b: string) => rel(a, b)?.termYour
    expect(y('emre', 'murat')).toBe('babanız')
    expect(y('emre', 'elif')).toBe('anneniz')
    expect(y('emre', 'ali')).toBe('dedeniz')
    expect(y('emre', 'zeynep')).toBe('babaanneniz')
    expect(y('emre', 'selin')).toBe('halanız')
    expect(y('emre', 'kemal')).toBe('amcanız')
    expect(y('murat', 'mustafa')).toBe('dayınız')
    expect(y('emre', 'ece')).toBe('hala kızınız')
    expect(y('murat', 'emre')).toBe('oğlunuz')
    expect(y('murat', 'zehra')).toBe('kızınız')
    expect(y('emre', 'merve')).toBe('eşiniz')
    expect(y('selin', 'emre')).toBe('yeğeniniz')
    expect(y('zehra', 'emre')).toBe('ağabeyiniz')
    expect(y('murat', 'kaan')).toBe('torununuz')
    expect(y('emre', 'mehmet')).toBe('büyük dedeniz')
    expect(y('zehra', 'ahmet')).toBe('babanızın amcası')
    expect(y('emre', 'onur')).toBe('ikinci dereceden kuzeniniz')
    expect(y('merve', 'murat')).toBe('kayınpederiniz')
    expect(y('elif', 'merve')).toBe('gelininiz')
    expect(rel('emre', 'emre')?.termYour).toBe('kendiniz')
  })

  it('relationsFrom covers the connected family', () => {
    const all = relationsFrom(g, 'p_emre')
    expect(all.get('p_selin')?.term).toBe('halası')
    expect(all.has('p_emre')).toBe(false)
    expect(all.size).toBeGreaterThan(20)
  })

  it('returns null for unknown or unconnected persons', () => {
    expect(describeRelation(g, 'p_emre', 'nope')).toBeNull()
  })
})
