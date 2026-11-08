// Tree export: SVG, high-resolution PNG, A4/A3 PDF (single page or poster tiles) and print.
// Text is always rasterized by the browser (never by jsPDF) so Turkish letters render correctly.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Person } from '../../types'
import type { TreeLayout } from '../tree/layout'
import { TreeDefs, TreeSvgContent } from '../tree/TreeSvg'

export type Paper = 'A4' | 'A3'
export type Orientation = 'portrait' | 'landscape'

export interface ExportInput {
  layout: TreeLayout
  persons: Map<string, Person>
  meId?: string
  /** Big heading, e.g. the family name. */
  title?: string
  /** Second line, e.g. date and chart type. */
  subtitle?: string
  legend?: boolean
  lang?: 'tr' | 'en'
  blood?: Set<string>
}

const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif"
const PAPER_MM: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420] }
const MAX_PIXELS = 16_000_000
const MAX_SIDE = 16_000

// ───────────── helpers ─────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Fetch every photo once and return data URLs (null = fall back to initials). */
export async function inlinePhotos(layout: TreeLayout, persons: Map<string, Person>): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const ids = [...new Set(layout.nodes.map((n) => n.personId))]
  await Promise.all(
    ids.map(async (id) => {
      const url = persons.get(id)?.photoUrl
      if (!url) return out.set(id, null)
      if (url.startsWith('data:')) return out.set(id, url)
      try {
        const res = await fetch(url, { mode: 'cors', cache: 'force-cache' })
        if (!res.ok) throw new Error(String(res.status))
        out.set(id, await blobToDataUrl(await res.blob()))
      } catch {
        out.set(id, null)
      }
    }),
  )
  return out
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function legendItems(lang: 'tr' | 'en') {
  const t = (tr: string, en: string) => (lang === 'en' ? en : tr)
  return [
    { fill: '#eff6ff', stroke: '#3b82f6', label: t('Erkek', 'Male') },
    { fill: '#fdf2f8', stroke: '#ec4899', label: t('Kadın', 'Female') },
    { fill: '#f1f5f9', stroke: '#64748b', label: t('Vefat 🕊', 'Deceased 🕊') },
    { fill: '#ffffff', stroke: '#f59e0b', label: t('Siz', 'You') },
    { fill: '#22c55e', stroke: '#22c55e', label: t('Hayatta', 'Living'), dot: true },
    { fill: 'none', stroke: '#64748b', label: t('Boşanmış / üvey', 'Divorced / step'), dash: true },
  ]
}

/** Markup of the tree only, in layout coordinates. */
function treeMarkup(input: ExportInput, photos: Map<string, string | null>) {
  return renderToStaticMarkup(
    createElement(
      'g',
      null,
      createElement(TreeDefs),
      createElement(TreeSvgContent, {
        layout: input.layout,
        persons: input.persons,
        dark: false,
        meId: input.meId,
        blood: input.blood,
        photos,
        lang: input.lang,
        static: true,
      }),
    ),
  )
}

export interface BuiltSvg {
  svg: string
  width: number
  height: number
}

/**
 * Standalone SVG document: optional header (title, subtitle, legend) above the tree.
 * `outScale` sets the width/height attributes (for sharp rasterization).
 */
export function buildTreeSvg(input: ExportInput, photos: Map<string, string | null>, outScale = 1): BuiltSvg {
  const b = input.layout.bounds
  const pad = 36
  const hasHeader = !!(input.title || input.subtitle || input.legend)
  const headerH = hasHeader ? (input.title ? 42 : 0) + (input.subtitle ? 24 : 0) + (input.legend ? 30 : 0) + 12 : 0
  const width = Math.max(b.width + pad * 2, input.legend ? 720 : 300)
  const height = b.height + pad * 2 + headerH
  const tx = (width - b.width) / 2 - b.minX
  const ty = pad + headerH - b.minY

  let header = ''
  let y = pad
  if (input.title) {
    y += 28
    header += `<text x="${pad}" y="${y}" font-family="${FONT}" font-size="28" font-weight="700" fill="#0f172a">${esc(input.title)}</text>`
    y += 14
  }
  if (input.subtitle) {
    y += 18
    header += `<text x="${pad}" y="${y}" font-family="${FONT}" font-size="15" fill="#475569">${esc(input.subtitle)}</text>`
    y += 6
  }
  if (input.legend) {
    y += 22
    let x = pad
    for (const it of legendItems(input.lang ?? 'tr')) {
      if (it.dot) header += `<circle cx="${x + 7}" cy="${y - 5}" r="6" fill="${it.fill}"/>`
      else if (it.dash) header += `<line x1="${x}" y1="${y - 5}" x2="${x + 18}" y2="${y - 5}" stroke="${it.stroke}" stroke-width="2.5" stroke-dasharray="5 4"/>`
      else header += `<rect x="${x}" y="${y - 13}" width="16" height="16" rx="4" fill="${it.fill}" stroke="${it.stroke}" stroke-width="2.5"/>`
      header += `<text x="${x + 24}" y="${y}" font-family="${FONT}" font-size="14" fill="#334155">${esc(it.label)}</text>`
      x += 24 + it.label.length * 8 + 22
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(width * outScale)}" height="${Math.round(height * outScale)}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    header +
    `<g transform="translate(${tx},${ty})">${treeMarkup(input, photos)}</g>` +
    `</svg>`
  return { svg, width, height }
}

/** Tree-only SVG for an arbitrary window of the layout (used for PDF pages/tiles). */
function windowSvg(markup: string, vx: number, vy: number, vw: number, vh: number, pxW: number, pxH: number) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(pxW)}" height="${Math.round(pxH)}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#ffffff"/>${markup}</svg>`
  )
}

async function svgToImage(svg: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  try {
    await img.decode()
  } catch {
    await new Promise<void>((resolve, reject) => {
      if (img.complete && img.naturalWidth) return resolve()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG görseli oluşturulamadı'))
    })
  }
  return img
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Tuval oluşturulamadı (cihaz belleği yetersiz olabilir).')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  return { c, ctx }
}

function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel kaydedilemedi'))), type, quality))
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Opens the native share sheet (phones). Returns false when not supported. */
export async function shareBlob(blob: Blob, filename: string, title?: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false
  try {
    await nav.share({ files: [file], title })
    return true
  } catch {
    return false
  }
}

export function safeFileName(s: string) {
  return (
    s
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'soyagaci'
  )
}

// ───────────── public exports ─────────────

export async function exportTreeSvg(input: ExportInput): Promise<Blob> {
  const photos = await inlinePhotos(input.layout, input.persons)
  const { svg } = buildTreeSvg(input, photos)
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
}

/** PNG at up to `scale`× resolution, capped so phones can still allocate the canvas. */
export async function exportTreePng(input: ExportInput, scale = 2.5): Promise<Blob> {
  const photos = await inlinePhotos(input.layout, input.persons)
  const base = buildTreeSvg(input, photos)
  const s = Math.max(0.25, Math.min(scale, Math.sqrt(MAX_PIXELS / (base.width * base.height)), MAX_SIDE / base.width, MAX_SIDE / base.height))
  const { svg, width, height } = buildTreeSvg(input, photos, s)
  const img = await svgToImage(svg)
  const { c, ctx } = makeCanvas(width * s, height * s)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return canvasToBlob(c)
}

export interface PdfOptions {
  paper: Paper
  orientation: Orientation
  /** 'fit' = whole tree on one page; 'tiles' = poster split across pages. */
  layoutMode: 'fit' | 'tiles'
  /** Tiles only: printed card width in mm. */
  cardMm?: number
  /** Called with (done, total) while pages render. */
  onProgress?: (done: number, total: number) => void
}

const DPI = 180
const PX_PER_MM = DPI / 25.4

/** How many pages a tiled print would need. */
export function tilePlan(layout: TreeLayout, opts: Pick<PdfOptions, 'paper' | 'orientation' | 'cardMm'>) {
  const [a, b] = PAPER_MM[opts.paper]
  const [pw, ph] = opts.orientation === 'portrait' ? [a, b] : [b, a]
  const margin = 10
  const footer = 9
  const overlap = 8
  const printW = pw - margin * 2
  const printH = ph - margin * 2 - footer
  const mmPerUnit = (opts.cardMm ?? 38) / 172
  const treeWmm = layout.bounds.width * mmPerUnit
  const treeHmm = layout.bounds.height * mmPerUnit
  const stepW = printW - overlap
  const stepH = printH - overlap
  const cols = Math.max(1, Math.ceil((treeWmm - overlap) / stepW))
  const rows = Math.max(1, Math.ceil((treeHmm - overlap) / stepH))
  return { pw, ph, margin, footer, overlap, printW, printH, mmPerUnit, cols, rows, stepW, stepH, treeWmm, treeHmm }
}

function drawFooter(ctx: CanvasRenderingContext2D, pw: number, ph: number, margin: number, left: string, right: string) {
  const px = PX_PER_MM
  ctx.fillStyle = '#64748b'
  ctx.font = `500 ${Math.round(3.2 * px)}px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText(left, margin * px, (ph - margin + 1) * px)
  ctx.textAlign = 'right'
  ctx.fillText(right, (pw - margin) * px, (ph - margin + 1) * px)
  ctx.textAlign = 'left'
}

function drawLegendCanvas(ctx: CanvasRenderingContext2D, xMm: number, yMm: number, lang: 'tr' | 'en') {
  const px = PX_PER_MM
  let x = xMm * px
  const y = yMm * px
  ctx.font = `${Math.round(3 * px)}px ${FONT}`
  for (const it of legendItems(lang)) {
    ctx.lineWidth = 0.5 * px
    ctx.strokeStyle = it.stroke
    if (it.dot) {
      ctx.fillStyle = it.fill
      ctx.beginPath()
      ctx.arc(x + 1.5 * px, y - 1.1 * px, 1.3 * px, 0, Math.PI * 2)
      ctx.fill()
    } else if (it.dash) {
      ctx.setLineDash([1.2 * px, 1 * px])
      ctx.beginPath()
      ctx.moveTo(x, y - 1.1 * px)
      ctx.lineTo(x + 4 * px, y - 1.1 * px)
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      ctx.fillStyle = it.fill
      ctx.fillRect(x, y - 2.8 * px, 3.4 * px, 3.4 * px)
      ctx.strokeRect(x, y - 2.8 * px, 3.4 * px, 3.4 * px)
    }
    ctx.fillStyle = '#334155'
    ctx.fillText(it.label, x + 5 * px, y)
    x += 5 * px + ctx.measureText(it.label).width + 4 * px
  }
}

function cropMark(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number) {
  const len = 4 * PX_PER_MM
  ctx.beginPath()
  ctx.moveTo(x - dx * len, y)
  ctx.lineTo(x - dx * 1.2 * PX_PER_MM, y)
  ctx.moveTo(x, y - dy * len)
  ctx.lineTo(x, y - dy * 1.2 * PX_PER_MM)
  ctx.stroke()
}

export async function exportTreePdf(input: ExportInput, opts: PdfOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const photos = await inlinePhotos(input.layout, input.persons)
  const markup = treeMarkup(input, photos)
  const lang = input.lang ?? 'tr'
  const b = input.layout.bounds
  const pad = 20
  const vb = { x: b.minX - pad, y: b.minY - pad, w: b.width + pad * 2, h: b.height + pad * 2 }
  const plan = tilePlan(input.layout, opts)
  const { pw, ph, margin } = plan
  const px = PX_PER_MM
  const pdf = new jsPDF({ orientation: opts.orientation, unit: 'mm', format: opts.paper.toLowerCase() as 'a4' | 'a3', compress: true })
  const dateStr = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'tr-TR')
  const titleLine = [input.title, dateStr].filter(Boolean).join(' · ')

  if (opts.layoutMode === 'fit') {
    opts.onProgress?.(0, 1)
    const { c, ctx } = makeCanvas(pw * px, ph * px)
    let top = margin
    if (input.title) {
      ctx.fillStyle = '#0f172a'
      ctx.font = `700 ${Math.round(7 * px)}px ${FONT}`
      ctx.fillText(input.title, margin * px, (top + 6.5) * px)
      top += 9
    }
    if (input.subtitle) {
      ctx.fillStyle = '#475569'
      ctx.font = `${Math.round(3.8 * px)}px ${FONT}`
      ctx.fillText(input.subtitle, margin * px, (top + 4) * px)
      top += 6
    }
    if (input.legend) {
      drawLegendCanvas(ctx, margin, top + 4.5, lang)
      top += 8
    }
    const areaW = pw - margin * 2
    const areaH = ph - top - margin - 6
    const k = Math.min(areaW / vb.w, areaH / vb.h)
    const wMm = vb.w * k
    const hMm = vb.h * k
    const img = await svgToImage(windowSvg(markup, vb.x, vb.y, vb.w, vb.h, wMm * px, hMm * px))
    ctx.drawImage(img, (margin + (areaW - wMm) / 2) * px, (top + 2) * px, wMm * px, hMm * px)
    drawFooter(ctx, pw, ph, margin, titleLine, lang === 'en' ? 'Family tree' : 'Soyağacı')
    pdf.addImage(c.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pw, ph, undefined, 'FAST')
    opts.onProgress?.(1, 1)
    return pdf.output('blob')
  }

  // Poster tiling.
  const { cols, rows, printW, printH, stepW, stepH, mmPerUnit } = plan
  const total = cols * rows
  const offX = b.minX - (Math.max(plan.treeWmm, printW) - plan.treeWmm) / 2 / mmPerUnit
  const offY = b.minY
  let page = 0
  for (let r = 0; r < rows; r++)
    for (let col = 0; col < cols; col++) {
      opts.onProgress?.(page, total)
      if (page > 0) pdf.addPage(opts.paper.toLowerCase(), opts.orientation)
      const { c, ctx } = makeCanvas(pw * px, ph * px)
      const vx = offX + (col * stepW) / mmPerUnit
      const vy = offY + (r * stepH) / mmPerUnit
      const img = await svgToImage(windowSvg(markup, vx, vy, printW / mmPerUnit, printH / mmPerUnit, printW * px, printH * px))
      ctx.drawImage(img, margin * px, margin * px, printW * px, printH * px)

      // Crop marks at the printable corners.
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 0.25 * px
      const L = margin * px
      const T = margin * px
      const R = (margin + printW) * px
      const B = (margin + printH) * px
      cropMark(ctx, L, T, 1, 1)
      cropMark(ctx, R, T, -1, 1)
      cropMark(ctx, L, B, 1, -1)
      cropMark(ctx, R, B, -1, -1)

      // Glue lines: the next page's edge lines up with these dashed lines.
      ctx.setLineDash([2 * px, 1.5 * px])
      ctx.strokeStyle = '#0d9488'
      ctx.fillStyle = '#0d9488'
      ctx.font = `${Math.round(2.6 * px)}px ${FONT}`
      if (col < cols - 1) {
        const x = (margin + stepW) * px
        ctx.beginPath()
        ctx.moveTo(x, T)
        ctx.lineTo(x, B)
        ctx.stroke()
        ctx.save()
        ctx.translate(x + 1.2 * px, T + 3 * px)
        ctx.rotate(Math.PI / 2)
        ctx.fillText(lang === 'en' ? `glue page ${page + 2} here →` : `${page + 2}. sayfayı buraya yapıştırın →`, 0, 0)
        ctx.restore()
      }
      if (r < rows - 1) {
        const y = (margin + stepH) * px
        ctx.beginPath()
        ctx.moveTo(L, y)
        ctx.lineTo(R, y)
        ctx.stroke()
        ctx.fillText(lang === 'en' ? `glue page ${page + cols + 1} here ↓` : `${page + cols + 1}. sayfayı buraya yapıştırın ↓`, L + 2 * px, y - 1.2 * px)
      }
      ctx.setLineDash([])

      const label = lang === 'en' ? `Page ${page + 1}/${total} · row ${r + 1}, col ${col + 1}` : `Sayfa ${page + 1}/${total} · satır ${r + 1}, sütun ${col + 1}`
      drawFooter(ctx, pw, ph, margin, titleLine, label)
      // Mini map of the page grid, left of the page label.
      ctx.font = `500 ${Math.round(3.2 * px)}px ${FONT}`
      const labelW = ctx.measureText(label).width
      const cell = Math.min(2.4, 7.5 / Math.max(rows, cols / 3)) * px
      const gx = (pw - margin) * px - labelW - 3 * px - cols * cell
      const gy = (ph - margin + 1.2) * px - rows * cell
      for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++) {
          ctx.fillStyle = rr === r && cc === col ? '#0d9488' : '#cbd5e1'
          ctx.fillRect(gx + cc * cell, gy + rr * cell, cell - 0.4 * px, cell - 0.4 * px)
        }
      if (input.legend) drawLegendCanvas(ctx, margin, ph - margin - 3, lang)
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph, undefined, 'FAST')
      page++
      // Let the UI breathe between pages.
      await new Promise((res) => setTimeout(res, 0))
    }
  opts.onProgress?.(total, total)
  return pdf.output('blob')
}

/** Prints the tree through a hidden iframe (light palette, title and legend included). */
export async function printTree(input: ExportInput, orientation: Orientation = 'landscape'): Promise<void> {
  const photos = await inlinePhotos(input.layout, input.persons)
  const { svg } = buildTreeSvg(input, photos)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(input.title ?? 'Soyağacı')}</title>` +
      `<style>@page{size:${orientation};margin:8mm}html,body{margin:0;background:#fff}svg{width:100%;height:auto;display:block}</style></head><body>${svg}</body></html>`,
  )
  doc.close()
  await new Promise((r) => setTimeout(r, 400))
  iframe.contentWindow?.focus()
  iframe.contentWindow?.print()
  setTimeout(() => iframe.remove(), 60_000)
}
