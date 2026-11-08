import type { TreeLayout } from '../tree/layout'

export type Paper = 'A4' | 'A3'
export type Orientation = 'portrait' | 'landscape'

export const PAPER_MM: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420] }

/** How many pages a tiled print would need. */
export function tilePlan(layout: TreeLayout, opts: { paper: Paper; orientation: Orientation; cardMm?: number }) {
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

