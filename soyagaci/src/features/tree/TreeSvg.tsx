// Pure SVG drawing of a laid-out tree. Used both on screen and for exports,
// so it must not use foreignObject or CSS variables.

import { memo } from 'react'
import type { Person } from '../../types'
import { BLOOD_LINE, LINE_COLOR, SELF_RING, TAG_INFO, avatarColor, personPalette } from '../../lib/colors'
import { ageOf, initials, yearOf } from '../../lib/format'
import type { TreeEdge, TreeLayout, TreeNode } from './layout'

export interface TreeSvgProps {
  layout: TreeLayout
  persons: Map<string, Person>
  dark?: boolean
  meId?: string
  selectedId?: string
  /** "a|b" pairs on the highlighted blood line. */
  blood?: Set<string>
  /** personId → data URL (used by exports to inline photos). */
  photos?: Map<string, string | null>
  lang?: 'tr' | 'en'
  /** Hide +/− buttons (exports). */
  static?: boolean
  onSelect?: (personId: string, node: TreeNode) => void
  onAction?: (node: TreeNode, dir: 'up' | 'down') => void
}

const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif"

/** Rounded orthogonal polyline. */
export function edgePath(points: [number, number][], r = 10): string {
  if (points.length < 2) return ''
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const l1 = Math.hypot(x1 - x0, y1 - y0)
    const l2 = Math.hypot(x2 - x1, y2 - y1)
    const rr = Math.min(r, l1 / 2, l2 / 2)
    if (rr < 0.5) {
      d += ` L${x1},${y1}`
      continue
    }
    const ax = x1 - ((x1 - x0) / l1) * rr
    const ay = y1 - ((y1 - y0) / l1) * rr
    const bx = x1 + ((x2 - x1) / l2) * rr
    const by = y1 + ((y2 - y1) / l2) * rr
    d += ` L${ax},${ay} Q${x1},${y1} ${bx},${by}`
  }
  const last = points[points.length - 1]
  return d + ` L${last[0]},${last[1]}`
}

function truncate(s: string, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

function lifeLine(p: Person, lang: 'tr' | 'en'): string {
  const b = yearOf(p.birthDate)
  const d = yearOf(p.deathDate)
  if (p.isDeceased) return `${b ?? '?'} – ${d ?? '?'}`
  if (!b) return ''
  const age = ageOf(p)
  return age !== undefined ? `${b} · ${age} ${lang === 'en' ? 'yrs' : 'yaş'}` : `${b}`
}

const Card = memo(function Card({
  node,
  person,
  dark,
  isMe,
  selected,
  photo,
  lang,
  isStatic,
  onSelect,
  onAction,
}: {
  node: TreeNode
  person: Person
  dark: boolean
  isMe: boolean
  selected: boolean
  photo?: string | null
  lang: 'tr' | 'en'
  isStatic?: boolean
  onSelect?: TreeSvgProps['onSelect']
  onAction?: TreeSvgProps['onAction']
}) {
  const pal = personPalette(person, dark)
  const { w, h } = node
  const r = 25
  const cx = 12 + r
  const cy = h / 2
  const src = photo === undefined ? person.photoUrl : photo ?? undefined
  const tags = (person.tags ?? []).map((t) => TAG_INFO[t]?.emoji).filter(Boolean).join('')
  const first = truncate(person.firstName || '?', 13)
  const last = truncate(person.lastName + (person.maidenName && person.maidenName !== person.lastName ? ` (${person.maidenName})` : ''), 15)
  const life = lifeLine(person, lang)
  const tx = cx + r + 10
  const btn = (dir: 'up' | 'down', action: TreeNode['up']) => {
    if (!action || isStatic) return null
    const y = dir === 'up' ? 0 : h
    const label = action === 'collapse' ? '−' : action === 'reroot' ? '↑' : '+'
    return (
      <g
        data-action={dir}
        transform={`translate(${w / 2},${y})`}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onAction?.(node, dir)
        }}
      >
        <circle r={18} fill="transparent" />
        <circle r={11} fill={dark ? '#0f172a' : '#ffffff'} stroke={pal.border} strokeWidth={2} />
        <text y={4.5} textAnchor="middle" fontSize={15} fontWeight={700} fill={pal.border} fontFamily={FONT}>
          {label}
        </text>
      </g>
    )
  }
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      data-person={person.id}
      style={{ cursor: onSelect ? 'pointer' : undefined }}
      onClick={onSelect ? () => onSelect(person.id, node) : undefined}
    >
      {selected && <rect x={-5} y={-5} width={w + 10} height={h + 10} rx={18} fill="none" stroke="#14b8a6" strokeWidth={3} />}
      {isMe && <rect x={-3} y={-3} width={w + 6} height={h + 6} rx={17} fill="none" stroke={SELF_RING} strokeWidth={3.5} />}
      <rect
        width={w}
        height={h}
        rx={14}
        fill={pal.bg}
        stroke={pal.border}
        strokeWidth={node.kind === 'root' ? 2.5 : 1.6}
        strokeDasharray={node.duplicate ? '5 4' : undefined}
      />
      {/* gender stripe */}
      <rect x={0} y={10} width={4} height={h - 20} rx={2} fill={pal.accent} />
      {src ? (
        <image
          href={src}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#tree-avatar-clip)"
          filter={person.isDeceased ? 'url(#tree-gray)' : undefined}
        />
      ) : (
        <>
          <circle cx={cx} cy={cy} r={r} fill={person.isDeceased ? '#94a3b8' : avatarColor(person.id)} />
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize={17} fontWeight={600} fill="#ffffff" fontFamily={FONT}>
            {initials(person)}
          </text>
        </>
      )}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={pal.border} strokeWidth={2} />
      {person.isDeceased ? (
        <text x={cx + r - 6} y={cy + r + 2} fontSize={14} textAnchor="middle" fontFamily={FONT}>
          🕊
        </text>
      ) : (
        <circle cx={cx + r * 0.72} cy={cy + r * 0.72} r={5.5} fill="#22c55e" stroke={dark ? '#0f172a' : '#ffffff'} strokeWidth={2} />
      )}
      <text x={tx} y={life ? 27 : 33} fontSize={13.5} fontWeight={700} fill={pal.text} fontFamily={FONT}>
        {first}
      </text>
      <text x={tx} y={life ? 44 : 50} fontSize={12.5} fontWeight={500} fill={pal.text} fontFamily={FONT}>
        {last}
      </text>
      {life && (
        <text x={tx} y={61} fontSize={11} fill={pal.sub} fontFamily={FONT}>
          {life}
        </text>
      )}
      {tags && (
        <text x={w - 8} y={17} fontSize={12} textAnchor="end" fontFamily={FONT}>
          {tags}
        </text>
      )}
      {node.duplicate && (
        <text x={w - 8} y={h - 8} fontSize={11} textAnchor="end" fill={pal.sub} fontFamily={FONT}>
          ↺
        </text>
      )}
      {btn('up', node.up)}
      {btn('down', node.down)}
    </g>
  )
})

function Edge({ e, color, blood }: { e: TreeEdge; color: string; blood: boolean }) {
  return (
    <path
      d={edgePath(e.points)}
      fill="none"
      stroke={blood ? BLOOD_LINE : color}
      strokeWidth={blood ? 3.5 : e.kind === 'partner' ? 2.2 : 1.8}
      strokeDasharray={e.dashed ? '6 5' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/** Shared <defs> (clip path + grayscale filter). */
export function TreeDefs() {
  return (
    <defs>
      <clipPath id="tree-avatar-clip" clipPathUnits="objectBoundingBox">
        <circle cx={0.5} cy={0.5} r={0.5} />
      </clipPath>
      <filter id="tree-gray">
        <feColorMatrix type="saturate" values="0" />
      </filter>
    </defs>
  )
}

/** The tree contents in layout coordinates (wrap in your own <svg>/<g>). */
export function TreeSvgContent(props: TreeSvgProps) {
  const { layout, persons, dark = false, meId, selectedId, blood, photos, lang = 'tr' } = props
  const color = dark ? LINE_COLOR.dark : LINE_COLOR.light
  const isBlood = (e: TreeEdge) => !!blood?.has(`${e.from}|${e.to}`)
  const normal = layout.edges.filter((e) => !isBlood(e))
  const highlighted = layout.edges.filter(isBlood)
  return (
    <g>
      <g>
        {normal.map((e) => (
          <Edge key={e.key} e={e} color={color} blood={false} />
        ))}
        {highlighted.map((e) => (
          <Edge key={e.key} e={e} color={color} blood />
        ))}
      </g>
      <g>
        {layout.nodes.map((n) => {
          const p = persons.get(n.personId)
          if (!p) return null
          return (
            <Card
              key={n.key}
              node={n}
              person={p}
              dark={dark}
              isMe={meId === p.id}
              selected={selectedId === p.id}
              photo={photos ? photos.get(p.id) ?? null : undefined}
              lang={lang}
              isStatic={props.static}
              onSelect={props.onSelect}
              onAction={props.onAction}
            />
          )
        })}
      </g>
    </g>
  )
}
