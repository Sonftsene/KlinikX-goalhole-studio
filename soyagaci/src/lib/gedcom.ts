import type { GeoPoint, Gender, ParentType, PartialDate, PartnerType, Person, PersonPhoto, Relation } from '../types'
import { nowIso, uid } from './format'

// GEDCOM 5.5.1 import / export. Custom tags keep app-specific data on round trips:
// _SOYID (our id), _TAGS, _NOTES, _SOYTYPE (partner type), _FREL/_MREL (child link type).

interface Node {
  level: number
  xref?: string
  tag: string
  value: string
  children: Node[]
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
// Some programs write Turkish or full English month names.
const MONTH_ALIASES: Record<string, number> = {
  OCA: 1, SUB: 2, ŞUB: 2, NIS: 4, HAZ: 6, TEM: 7, AGU: 8, AĞU: 8, EYL: 9, EKI: 10, EKİ: 10, KAS: 11, ARA: 12,
}

function monthIndex(token: string): number | undefined {
  const t = token.toUpperCase().slice(0, 3)
  const i = MONTHS.indexOf(t)
  if (i >= 0) return i + 1
  return MONTH_ALIASES[t]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "12 MAR 1905", "ABT 1910", "BEF 1900", "BET 1900 AND 1905", "1905-03-12" → partial ISO date. */
export function parseGedcomDate(raw?: string): PartialDate | undefined {
  if (!raw) return undefined
  let s = raw.trim().replace(/@#D[A-Z ]+@/g, '').trim()
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return s
  s = s.replace(/\(.*\)/g, '').trim()
  s = s.replace(/^(ABT|ABOUT|EST|CAL|BEF|AFT|INT|CIRCA|C\.)\s+/i, '')
  const range = /^(?:BET|FROM)\s+(.+?)(?:\s+(?:AND|TO)\s+.+)?$/i.exec(s)
  if (range) s = range[1]
  const parts = s.split(/[\s./-]+/).filter(Boolean)
  if (!parts.length) return undefined
  const yearTok = parts[parts.length - 1]
  const year = /^\d{3,4}$/.test(yearTok) ? yearTok.padStart(4, '0') : undefined
  if (!year) return undefined
  if (parts.length >= 3) {
    const day = parseInt(parts[parts.length - 3], 10)
    const month = monthIndex(parts[parts.length - 2]) ?? parseInt(parts[parts.length - 2], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`
  }
  if (parts.length >= 2) {
    const month = monthIndex(parts[parts.length - 2])
    if (month) return `${year}-${pad(month)}`
  }
  return year
}

export function toGedcomDate(d?: PartialDate): string | undefined {
  if (!d) return undefined
  const [y, m, day] = d.split('-')
  if (day) return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`
  if (m) return `${MONTHS[Number(m) - 1]} ${y}`
  return y
}

function parseCoord(v?: string): number | undefined {
  if (!v) return undefined
  const m = /^([NSEW])?\s*(-?\d+(?:\.\d+)?)/i.exec(v.trim())
  if (!m) return undefined
  const n = parseFloat(m[2])
  return m[1] && /[SW]/i.test(m[1]) ? -n : n
}

function formatCoord(n: number, pos: string, neg: string) {
  return `${n < 0 ? neg : pos}${Math.abs(n).toFixed(5).replace(/0+$/, '').replace(/\.$/, '')}`
}

// ───────────────────────────── parsing ─────────────────────────────

function parseLines(text: string): Node[] {
  const roots: Node[] = []
  const stack: Node[] = []
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const m = /^\s*(\d+)\s+(@[^@]+@\s+)?(\S+)(?: (.*))?$/.exec(line)
    if (!m) continue
    const level = parseInt(m[1], 10)
    const node: Node = { level, xref: m[2]?.trim(), tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] }
    if (node.tag === 'CONC' || node.tag === 'CONT') {
      const parent = stack[level - 1]
      if (parent) parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value
      continue
    }
    while (stack.length > level) stack.pop()
    if (level === 0) roots.push(node)
    else stack[level - 1]?.children.push(node)
    stack[level] = node
    stack.length = level + 1
  }
  return roots
}

const child = (n: Node | undefined, tag: string) => n?.children.find((c) => c.tag === tag)
const childrenOf = (n: Node | undefined, tag: string) => n?.children.filter((c) => c.tag === tag) ?? []
const val = (n: Node | undefined, tag: string) => child(n, tag)?.value.trim() || undefined

function geoOf(event?: Node): GeoPoint | undefined {
  const map = child(child(event, 'PLAC'), 'MAP') ?? child(event, 'MAP')
  const lat = parseCoord(val(map, 'LATI'))
  const lng = parseCoord(val(map, 'LONG'))
  return lat !== undefined && lng !== undefined ? { lat, lng } : undefined
}

function relType(v?: string): ParentType | undefined {
  if (!v) return undefined
  const s = v.toLowerCase()
  if (s.startsWith('adopt')) return 'adopted'
  if (s.startsWith('step')) return 'step'
  if (s.startsWith('foster')) return 'foster'
  if (s.startsWith('birth') || s.startsWith('natural') || s.startsWith('biolog')) return 'biological'
  return undefined
}

export interface GedcomResult {
  persons: Person[]
  relations: Relation[]
  warnings: string[]
}

export function parseGedcom(text: string): GedcomResult {
  const warnings: string[] = []
  const roots = parseLines(text)
  if (!roots.some((r) => r.tag === 'HEAD')) warnings.push('GEDCOM başlığı (HEAD) bulunamadı; dosya yine de okunmaya çalışıldı.')
  const notes = new Map<string, string>()
  for (const r of roots) if (r.tag === 'NOTE' && r.xref) notes.set(r.xref, r.value)
  const noteText = (n: Node) => (n.value.startsWith('@') ? notes.get(n.value.trim()) ?? '' : n.value)

  const idByXref = new Map<string, string>()
  const persons: Person[] = []
  const pedigree = new Map<string, ParentType>() // `${childXref}|${famXref}` → type
  const now = nowIso()

  const dateOf = (event: Node | undefined, label: string, who: string) => {
    const raw = val(event, 'DATE')
    const d = parseGedcomDate(raw)
    if (raw && !d) warnings.push(`${who}: "${raw}" ${label} tarihi okunamadı.`)
    return d
  }

  for (const r of roots.filter((x) => x.tag === 'INDI')) {
    if (!r.xref) continue
    const names = childrenOf(r, 'NAME')
    const primary = names.find((n) => !/married/i.test(val(n, 'TYPE') ?? '')) ?? names[0]
    const married = names.find((n) => /married/i.test(val(n, 'TYPE') ?? ''))
    const raw = primary?.value ?? ''
    const sm = /^(.*?)\s*\/([^/]*)\/\s*(.*)$/.exec(raw)
    let given = val(primary, 'GIVN') ?? (sm ? `${sm[1]} ${sm[3]}`.trim() : raw.trim())
    let surname = val(primary, 'SURN') ?? (sm ? sm[2].trim() : '')
    given = given.replace(/\s+/g, ' ').trim()
    surname = surname.trim()
    const marriedName = val(r, '_MARNM') ?? val(primary, '_MARNM') ?? (married ? /\/([^/]*)\//.exec(married.value)?.[1]?.trim() : undefined)
    const sexRaw = (val(r, 'SEX') ?? '').toUpperCase()
    const gender: Gender = sexRaw === 'M' ? 'male' : sexRaw === 'F' ? 'female' : 'other'
    const id = val(r, '_SOYID') ?? uid('p')
    idByXref.set(r.xref, id)
    const who = `${given} ${surname}`.trim() || r.xref
    const birt = child(r, 'BIRT') ?? child(r, 'CHR') ?? child(r, 'BAPM')
    const deat = child(r, 'DEAT')
    const buri = child(r, 'BURI') ?? child(r, 'CREM')
    const resi = child(r, 'RESI')
    const noteNodes = childrenOf(r, 'NOTE')
    const photos: PersonPhoto[] = []
    for (const o of childrenOf(r, 'OBJE')) {
      const file = val(o, 'FILE') ?? (o.value.startsWith('@') ? undefined : o.value)
      if (file && /^(https?:|data:image\/)/i.test(file)) photos.push({ id: uid('ph'), url: file, caption: val(o, 'TITL') ?? val(child(o, 'FILE'), 'TITL'), addedAt: now })
    }
    const p: Person = {
      id,
      firstName: given || '?',
      lastName: marriedName || surname,
      maidenName: marriedName && surname && marriedName !== surname ? surname : undefined,
      nickname: val(primary, 'NICK') ?? val(r, 'NICK'),
      gender,
      birthDate: dateOf(birt, 'doğum', who),
      birthPlace: val(birt, 'PLAC'),
      birthGeo: geoOf(birt),
      isDeceased: !!deat,
      deathDate: dateOf(deat, 'vefat', who),
      deathPlace: val(deat, 'PLAC'),
      causeOfDeath: val(deat, 'CAUS'),
      burialPlace: val(buri, 'PLAC'),
      burialGeo: geoOf(buri),
      residence: val(resi, 'PLAC') ?? val(resi, 'ADDR') ?? (resi?.value || undefined),
      residenceGeo: geoOf(resi),
      occupation: val(r, 'OCCU'),
      education: val(r, 'EDUC'),
      email: val(r, 'EMAIL') ?? val(resi, 'EMAIL'),
      phone: val(r, 'PHON') ?? val(resi, 'PHON'),
      bio: noteNodes.length ? noteNodes.map(noteText).join('\n\n').trim() || undefined : undefined,
      notes: val(r, '_NOTES'),
      tags: val(r, '_TAGS')?.split(',').map((t) => t.trim()).filter(Boolean),
      photos: photos.length ? photos : undefined,
      photoUrl: photos[0]?.url,
      createdAt: now,
      updatedAt: now,
    }
    // Drop undefined keys for clean objects.
    for (const k of Object.keys(p) as (keyof Person)[]) if (p[k] === undefined) delete p[k]
    persons.push(p)
    for (const famc of childrenOf(r, 'FAMC')) {
      const t = relType(val(famc, 'PEDI'))
      if (t) pedigree.set(`${r.xref}|${famc.value.trim()}`, t)
    }
  }

  const relations: Relation[] = []
  const pairSeen = new Set<string>()
  const parentSeen = new Set<string>()
  for (const f of roots.filter((x) => x.tag === 'FAM')) {
    const husb = val(f, 'HUSB')
    const wife = val(f, 'WIFE')
    const h = husb ? idByXref.get(husb) : undefined
    const w = wife ? idByXref.get(wife) : undefined
    if ((husb && !h) || (wife && !w)) warnings.push(`${f.xref ?? 'FAM'}: aile kaydında bilinmeyen kişi var.`)
    const marr = child(f, 'MARR')
    const div = child(f, 'DIV')
    const soyType = val(f, '_SOYTYPE') as PartnerType | 'none' | undefined
    if (h && w && soyType !== 'none') {
      const key = [h, w].sort().join('|')
      if (!pairSeen.has(key)) {
        pairSeen.add(key)
        const type: PartnerType = soyType ?? (div ? 'divorced' : child(f, 'ENGA') && !marr ? 'engaged' : 'married')
        const rel: Relation = {
          id: uid('r'),
          kind: 'partner',
          aId: h,
          bId: w,
          type,
          startDate: parseGedcomDate(val(marr, 'DATE')),
          endDate: parseGedcomDate(val(div, 'DATE')) ?? parseGedcomDate(val(f, '_END')),
          place: val(marr, 'PLAC'),
        }
        for (const k of ['startDate', 'endDate', 'place'] as const) if (rel[k] === undefined) delete rel[k]
        relations.push(rel)
      }
    }
    for (const c of childrenOf(f, 'CHIL')) {
      const cid = idByXref.get(c.value.trim())
      if (!cid) {
        warnings.push(`${f.xref ?? 'FAM'}: bilinmeyen çocuk ${c.value}`)
        continue
      }
      const ped = pedigree.get(`${c.value.trim()}|${f.xref}`)
      const add = (pid: string | undefined, t?: ParentType) => {
        if (!pid || pid === cid) return
        const key = `${pid}>${cid}`
        if (parentSeen.has(key)) return
        parentSeen.add(key)
        relations.push({ id: uid('r'), kind: 'parent', parentId: pid, childId: cid, type: t ?? ped ?? 'biological' })
      }
      add(h, relType(val(c, '_FREL')))
      add(w, relType(val(c, '_MREL')))
    }
  }
  if (!persons.length) warnings.push('Dosyada kişi (INDI) kaydı bulunamadı.')
  return { persons, relations, warnings }
}

// ───────────────────────────── export ─────────────────────────────

function lineSafe(text: string) {
  return text.replace(/\r/g, '')
}

/** Writes "level TAG value" lines, splitting long or multi-line values with CONC/CONT. */
function emit(out: string[], level: number, tag: string, value?: string) {
  if (value === undefined || value === null) return
  const v = lineSafe(String(value))
  const paragraphs = v.split('\n')
  const MAX = 200
  paragraphs.forEach((para, pi) => {
    const chunks: string[] = []
    for (let i = 0; i < para.length; i += MAX) chunks.push(para.slice(i, i + MAX))
    if (!chunks.length) chunks.push('')
    chunks.forEach((chunk, ci) => {
      if (pi === 0 && ci === 0) out.push(`${level} ${tag}${chunk ? ` ${chunk}` : ''}`)
      else out.push(`${level + 1} ${ci === 0 ? 'CONT' : 'CONC'}${chunk ? ` ${chunk}` : ''}`)
    })
  })
}

function emitEvent(out: string[], tag: string, date?: PartialDate, place?: string, geo?: GeoPoint, extra?: [string, string | undefined][]) {
  const gd = toGedcomDate(date)
  if (!gd && !place && !geo && !extra?.some((e) => e[1])) return false
  out.push(`1 ${tag}`)
  emit(out, 2, 'DATE', gd)
  if (place || geo) {
    out.push(`2 PLAC${place ? ` ${lineSafe(place)}` : ''}`)
    if (geo) {
      out.push('3 MAP')
      out.push(`4 LATI ${formatCoord(geo.lat, 'N', 'S')}`)
      out.push(`4 LONG ${formatCoord(geo.lng, 'E', 'W')}`)
    }
  }
  for (const [t, v] of extra ?? []) emit(out, 2, t, v)
  return true
}

const REL_WORD: Record<ParentType, string> = { biological: 'Natural', adopted: 'Adopted', step: 'Step', foster: 'Foster' }
const PEDI_WORD: Record<ParentType, string> = { biological: 'birth', adopted: 'adopted', step: 'step', foster: 'foster' }

export function toGedcom(persons: Person[], relations: Relation[], familyName?: string): string {
  const out: string[] = []
  const now = new Date()
  out.push('0 HEAD')
  out.push('1 SOUR SOYAGACI')
  out.push('2 NAME Soyağacı')
  out.push('2 VERS 1.0')
  out.push(`1 DATE ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`)
  out.push('1 GEDC')
  out.push('2 VERS 5.5.1')
  out.push('2 FORM LINEAGE-LINKED')
  out.push('1 CHAR UTF-8')
  out.push('1 LANG Turkish')
  if (familyName) emit(out, 1, 'NOTE', familyName)

  const byId = new Map(persons.map((p) => [p.id, p]))
  const xref = new Map(persons.map((p, i) => [p.id, `@I${i + 1}@`]))

  // ── Families: one per partner link, plus one per parent set without a partner link. ──
  interface Fam {
    xref: string
    husb?: string
    wife?: string
    partner?: Extract<Relation, { kind: 'partner' }>
    children: { id: string; frel?: ParentType; mrel?: ParentType }[]
  }
  const fams: Fam[] = []
  const famByPair = new Map<string, Fam>()
  const famKey = (ids: string[]) => [...ids].sort().join('|')
  const roleSplit = (a: string, b?: string): [string | undefined, string | undefined] => {
    if (!b) return byId.get(a)?.gender === 'female' ? [undefined, a] : [a, undefined]
    const ga = byId.get(a)?.gender
    const gb = byId.get(b)?.gender
    if (ga === 'female' && gb !== 'female') return [b, a]
    return [a, b]
  }
  const newFam = (ids: string[], partner?: Fam['partner']) => {
    const [husb, wife] = roleSplit(ids[0], ids[1])
    const f: Fam = { xref: `@F${fams.length + 1}@`, husb, wife, partner, children: [] }
    fams.push(f)
    famByPair.set(famKey(ids), f)
    return f
  }
  for (const r of relations) {
    if (r.kind !== 'partner' || !byId.has(r.aId) || !byId.has(r.bId)) continue
    if (!famByPair.has(famKey([r.aId, r.bId]))) newFam([r.aId, r.bId], r)
  }
  const parentLinks = new Map<string, Extract<Relation, { kind: 'parent' }>[]>()
  for (const r of relations) {
    if (r.kind !== 'parent' || !byId.has(r.parentId) || !byId.has(r.childId)) continue
    const list = parentLinks.get(r.childId) ?? []
    list.push(r)
    parentLinks.set(r.childId, list)
  }
  for (const [childId, links] of parentLinks) {
    let rest = [...links]
    // Pair two parents who are partners (or simply the first two) into one family.
    while (rest.length) {
      let pair: typeof rest = [rest[0]]
      for (let i = 0; i < rest.length && pair.length < 2; i++)
        for (let j = i + 1; j < rest.length; j++)
          if (famByPair.has(famKey([rest[i].parentId, rest[j].parentId]))) {
            pair = [rest[i], rest[j]]
            break
          }
      if (pair.length === 1 && rest.length >= 2 && rest[1].type === rest[0].type) pair = [rest[0], rest[1]]
      rest = rest.filter((l) => !pair.includes(l))
      const ids = pair.map((l) => l.parentId)
      const fam = famByPair.get(famKey(ids)) ?? newFam(ids)
      const entry: Fam['children'][number] = { id: childId }
      for (const l of pair) {
        if (l.parentId === fam.husb) entry.frel = l.type
        else entry.mrel = l.type
      }
      fam.children.push(entry)
    }
  }
  const famsOf = new Map<string, string[]>()
  const famcOf = new Map<string, { xref: string; type: ParentType }[]>()
  for (const f of fams) {
    for (const s of [f.husb, f.wife]) if (s) famsOf.set(s, [...(famsOf.get(s) ?? []), f.xref])
    for (const c of f.children) famcOf.set(c.id, [...(famcOf.get(c.id) ?? []), { xref: f.xref, type: c.frel ?? c.mrel ?? 'biological' }])
  }

  for (const p of persons) {
    out.push(`0 ${xref.get(p.id)} INDI`)
    const birthSurname = p.maidenName || p.lastName || ''
    out.push(`1 NAME ${lineSafe(p.firstName)} /${lineSafe(birthSurname)}/`)
    emit(out, 2, 'GIVN', p.firstName)
    if (birthSurname) emit(out, 2, 'SURN', birthSurname)
    if (p.nickname) emit(out, 2, 'NICK', p.nickname)
    if (p.maidenName && p.lastName && p.maidenName !== p.lastName) {
      emit(out, 2, '_MARNM', p.lastName)
      out.push(`1 NAME ${lineSafe(p.firstName)} /${lineSafe(p.lastName)}/`)
      out.push('2 TYPE married')
    }
    out.push(`1 SEX ${p.gender === 'male' ? 'M' : p.gender === 'female' ? 'F' : 'U'}`)
    emitEvent(out, 'BIRT', p.birthDate, p.birthPlace, p.birthGeo)
    if (p.isDeceased && !emitEvent(out, 'DEAT', p.deathDate, p.deathPlace, undefined, [['CAUS', p.causeOfDeath]])) out.push('1 DEAT Y')
    emitEvent(out, 'BURI', undefined, p.burialPlace, p.burialGeo)
    emitEvent(out, 'RESI', undefined, p.residence, p.residenceGeo)
    emit(out, 1, 'OCCU', p.occupation)
    emit(out, 1, 'EDUC', p.education)
    emit(out, 1, 'EMAIL', p.email)
    emit(out, 1, 'PHON', p.phone)
    emit(out, 1, 'NOTE', p.bio)
    emit(out, 1, '_NOTES', p.notes)
    if (p.tags?.length) emit(out, 1, '_TAGS', p.tags.join(','))
    const photos = [...(p.photos ?? [])]
    if (p.photoUrl && !photos.some((x) => x.url === p.photoUrl)) photos.unshift({ id: 'main', url: p.photoUrl, addedAt: '' })
    for (const ph of photos) {
      if (!/^https?:/i.test(ph.url)) continue // data URLs are too large for GEDCOM
      out.push('1 OBJE')
      emit(out, 2, 'FILE', ph.url)
      out.push(`3 FORM ${/\.png($|\?)/i.test(ph.url) ? 'png' : 'jpg'}`)
      if (ph.caption) emit(out, 3, 'TITL', ph.caption)
    }
    emit(out, 1, '_SOYID', p.id)
    for (const f of famcOf.get(p.id) ?? []) {
      out.push(`1 FAMC ${f.xref}`)
      if (f.type !== 'biological') out.push(`2 PEDI ${PEDI_WORD[f.type]}`)
    }
    for (const f of famsOf.get(p.id) ?? []) out.push(`1 FAMS ${f}`)
  }

  for (const f of fams) {
    out.push(`0 ${f.xref} FAM`)
    if (f.husb) out.push(`1 HUSB ${xref.get(f.husb)}`)
    if (f.wife) out.push(`1 WIFE ${xref.get(f.wife)}`)
    const pr = f.partner
    if (pr) {
      if (pr.type !== 'engaged' && pr.type !== 'partner') emitEvent(out, 'MARR', pr.startDate, pr.place) || out.push('1 MARR Y')
      if (pr.type === 'divorced') emitEvent(out, 'DIV', pr.endDate) || out.push('1 DIV Y')
      if (pr.type === 'engaged') emitEvent(out, 'ENGA', pr.startDate, pr.place) || out.push('1 ENGA Y')
      if (pr.type !== 'married' && pr.type !== 'divorced') out.push(`1 _SOYTYPE ${pr.type}`)
      if (pr.type === 'widowed' && pr.endDate) emit(out, 1, '_END', toGedcomDate(pr.endDate))
    } else if (f.husb && f.wife) out.push('1 _SOYTYPE none')
    for (const c of f.children) {
      out.push(`1 CHIL ${xref.get(c.id)}`)
      if (c.frel && c.frel !== 'biological') out.push(`2 _FREL ${REL_WORD[c.frel]}`)
      if (c.mrel && c.mrel !== 'biological') out.push(`2 _MREL ${REL_WORD[c.mrel]}`)
    }
  }
  out.push('0 TRLR')
  return out.join('\r\n') + '\r\n'
}
