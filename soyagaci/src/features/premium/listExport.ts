import type { Person } from '../../types'
import { type FamilyGraph, father, mother, partnerIds } from '../../lib/graph'
import { ageOf, displayName, fullName } from '../../lib/format'
import { personPalette } from '../../lib/colors'
import { downloadBlob, downloadText, slug } from './download'

type Lang = 'tr' | 'en'

export interface ListGroup {
  title?: string
  persons: Person[]
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Excel-friendly CSV (UTF-8 BOM, semicolon separated — what Turkish Excel expects). */
export function exportCsv(groups: ListGroup[], g: FamilyGraph, familyName: string, lang: Lang) {
  const tr = lang === 'tr'
  const head = tr
    ? ['Grup', 'Ad', 'Soyad', 'Kızlık soyadı', 'Lakap', 'Cinsiyet', 'Doğum tarihi', 'Doğum yeri', 'Durum', 'Vefat tarihi', 'Vefat yeri', 'Yaş', 'Meslek', 'Eğitim', 'Memleket', 'İkamet', 'Baba', 'Anne', 'Eş(ler)', 'Telefon', 'E-posta']
    : ['Group', 'First name', 'Last name', 'Maiden name', 'Nickname', 'Gender', 'Birth date', 'Birth place', 'Status', 'Death date', 'Death place', 'Age', 'Occupation', 'Education', 'Hometown', 'Residence', 'Father', 'Mother', 'Spouse(s)', 'Phone', 'Email']
  const gender = (p: Person) => (p.gender === 'male' ? (tr ? 'Erkek' : 'Male') : p.gender === 'female' ? (tr ? 'Kadın' : 'Female') : tr ? 'Diğer' : 'Other')
  const rows = [head.join(';')]
  for (const grp of groups)
    for (const p of grp.persons) {
      const spouses = partnerIds(g, p.id)
        .map((id) => fullName(g.persons.get(id)))
        .filter(Boolean)
        .join(', ')
      rows.push(
        [
          grp.title ?? '',
          p.firstName,
          p.lastName,
          p.maidenName,
          p.nickname,
          gender(p),
          p.birthDate,
          p.birthPlace,
          p.isDeceased ? (tr ? 'Vefat' : 'Deceased') : tr ? 'Hayatta' : 'Living',
          p.deathDate,
          p.deathPlace,
          ageOf(p),
          p.occupation,
          p.education,
          p.hometown,
          p.residence,
          fullName(father(g, p.id)),
          fullName(mother(g, p.id)),
          spouses,
          p.phone,
          p.email,
        ]
          .map(csvCell)
          .join(';'),
      )
    }
  downloadText(`${slug(familyName)}-liste.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8')
}

// ───────────────────────── PDF (rendered on canvas) ─────────────────────────
// jsPDF's built-in fonts cannot draw ş, ğ, ı, İ. Drawing the table on a canvas
// uses the device's own fonts, works offline and keeps Turkish text correct.

const PAGE_W = 1240 // A4 at 150 dpi
const PAGE_H = 1754
const M = 70
const ROW_H = 52
const GROUP_H = 60
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif"

/** Compact date for tables: 12.03.1905, 03.1905 or 1905. */
function shortDate(d?: string) {
  if (!d) return ''
  return d.split('-').reverse().join('.')
}

type Item = { kind: 'group'; title: string } | { kind: 'row'; p: Person; n: number }

function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > width) s = s.slice(0, -1)
  return s + '…'
}

export async function exportPdf(groups: ListGroup[], familyName: string, subtitle: string, lang: Lang) {
  const tr = lang === 'tr'
  const cols = [
    { key: '#', w: 60 },
    { key: tr ? 'Ad Soyad' : 'Name', w: 380 },
    { key: tr ? 'Doğum' : 'Born', w: 170 },
    { key: tr ? 'Doğum yeri' : 'Birthplace', w: 200 },
    { key: tr ? 'Vefat' : 'Died', w: 150 },
    { key: tr ? 'Meslek' : 'Occupation', w: PAGE_W - 2 * M - 60 - 380 - 170 - 200 - 150 },
  ]
  const items: Item[] = []
  let n = 0
  for (const g of groups) {
    if (g.title) items.push({ kind: 'group', title: `${g.title} (${g.persons.length})` })
    for (const p of g.persons) items.push({ kind: 'row', p, n: ++n })
  }

  // Lay items out into pages first so the footer can show "page x / y".
  const pages: Item[][] = []
  let cur: Item[] = []
  let y = 0
  const firstTop = M + 150
  const top = M + 50
  const bottom = PAGE_H - M - 40
  let limit = bottom - firstTop
  for (const it of items) {
    const h = it.kind === 'group' ? GROUP_H : ROW_H
    // Keep a group heading together with at least one row.
    const need = it.kind === 'group' ? h + ROW_H : h
    if (y + need > limit && cur.length) {
      pages.push(cur)
      cur = []
      y = 0
      limit = bottom - top
    }
    cur.push(it)
    y += h
  }
  if (cur.length || !pages.length) pages.push(cur)

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')!
  const date = new Date().toLocaleDateString(tr ? 'tr-TR' : 'en-GB')

  pages.forEach((page, pi) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PAGE_W, PAGE_H)
    let yy = M
    if (pi === 0) {
      ctx.fillStyle = '#0f766e'
      ctx.font = `bold 40px ${FONT}`
      ctx.textBaseline = 'top'
      ctx.fillText(fit(ctx, familyName, PAGE_W - 2 * M), M, yy)
      ctx.fillStyle = '#475569'
      ctx.font = `22px ${FONT}`
      ctx.fillText(fit(ctx, subtitle, PAGE_W - 2 * M), M, yy + 54)
      yy = firstTop - 50
    }
    // Column headings.
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(M, yy, PAGE_W - 2 * M, 44)
    ctx.fillStyle = '#334155'
    ctx.font = `bold 19px ${FONT}`
    ctx.textBaseline = 'middle'
    let x = M
    for (const c of cols) {
      ctx.fillText(c.key, x + 12, yy + 22)
      x += c.w
    }
    yy += 50
    for (const it of page) {
      if (it.kind === 'group') {
        ctx.fillStyle = '#0f172a'
        ctx.font = `bold 24px ${FONT}`
        ctx.fillText(fit(ctx, it.title, PAGE_W - 2 * M), M + 4, yy + GROUP_H / 2 + 6)
        ctx.fillStyle = '#0f766e'
        ctx.fillRect(M, yy + GROUP_H - 6, PAGE_W - 2 * M, 2)
        yy += GROUP_H
        continue
      }
      const p = it.p
      const pal = personPalette(p, false)
      ctx.fillStyle = it.n % 2 ? '#ffffff' : '#f8fafc'
      ctx.fillRect(M, yy, PAGE_W - 2 * M, ROW_H)
      ctx.fillStyle = pal.border
      ctx.fillRect(M + cols[0].w, yy + 6, 6, ROW_H - 12)
      const cells = [
        String(it.n),
        displayName(p) + (p.isDeceased ? ' 🕊' : ''),
        shortDate(p.birthDate),
        p.birthPlace ?? '',
        p.isDeceased ? (p.deathDate ? shortDate(p.deathDate) : '?') : '',
        p.occupation ?? '',
      ]
      x = M
      cells.forEach((text, ci) => {
        ctx.fillStyle = ci === 1 ? (p.isDeceased ? '#475569' : '#0f172a') : '#334155'
        ctx.font = `${ci === 1 ? '600 ' : ''}20px ${FONT}`
        const pad = ci === 1 ? 20 : 12
        ctx.fillText(fit(ctx, text, cols[ci].w - pad - 8), x + pad, yy + ROW_H / 2)
        x += cols[ci].w
      })
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(M, yy + ROW_H)
      ctx.lineTo(PAGE_W - M, yy + ROW_H)
      ctx.stroke()
      yy += ROW_H
    }
    // Footer.
    ctx.fillStyle = '#94a3b8'
    ctx.font = `18px ${FONT}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`${familyName} · ${date}`, M, PAGE_H - M + 10)
    const label = `${pi + 1} / ${pages.length}`
    ctx.fillText(label, PAGE_W - M - ctx.measureText(label).width, PAGE_H - M + 10)
    if (pi > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  })
  downloadBlob(`${slug(familyName)}-liste.pdf`, pdf.output('blob'))
}
