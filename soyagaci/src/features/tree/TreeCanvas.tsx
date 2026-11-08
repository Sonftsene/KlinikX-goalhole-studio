import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { TreeDefs, TreeSvgContent, type TreeSvgProps } from './TreeSvg'
import { personPalette } from '../../lib/colors'

export interface TreeCanvasHandle {
  fit(animate?: boolean): void
  zoomBy(factor: number): void
  centerOn(personId: string, animate?: boolean): boolean
}

interface Transform {
  x: number
  y: number
  k: number
}

const MIN_K = 0.06
const MAX_K = 3
const clampK = (k: number) => Math.max(MIN_K, Math.min(MAX_K, k))
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

export interface TreeCanvasProps extends TreeSvgProps {
  /** When this changes the view re-focuses (new root / mode). */
  focusKey: string
  /** Person to centre on when focusing. */
  focusPersonId?: string
  showMinimap?: boolean
}

export const TreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(function TreeCanvas(props, ref) {
  const { layout, focusKey, focusPersonId, showMinimap = true, ...svgProps } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const miniViewRef = useRef<SVGRectElement>(null)
  const t = useRef<Transform>({ x: 0, y: 0, k: 1 })
  const anim = useRef<number | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const size = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    return { w: r?.width ?? 0, h: r?.height ?? 0, left: r?.left ?? 0, top: r?.top ?? 0 }
  }

  const apply = useCallback(() => {
    const { x, y, k } = t.current
    gRef.current?.setAttribute('transform', `translate(${x},${y}) scale(${k})`)
    const mv = miniViewRef.current
    if (mv) {
      const { w, h } = size()
      mv.setAttribute('x', String(-x / k))
      mv.setAttribute('y', String(-y / k))
      mv.setAttribute('width', String(w / k))
      mv.setAttribute('height', String(h / k))
    }
  }, [])

  const stopAnim = () => {
    if (anim.current) cancelAnimationFrame(anim.current)
    anim.current = null
  }

  const animateTo = useCallback(
    (target: Transform, ms = 300) => {
      stopAnim()
      const from = { ...t.current }
      const start = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / ms)
        const e = ease(p)
        t.current = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e }
        apply()
        anim.current = p < 1 ? requestAnimationFrame(step) : null
      }
      anim.current = requestAnimationFrame(step)
    },
    [apply],
  )

  const setT = (next: Transform, animate: boolean) => {
    if (animate) animateTo(next)
    else {
      stopAnim()
      t.current = next
      apply()
    }
  }

  const fitTransform = (): Transform => {
    const { w, h } = size()
    const b = layoutRef.current.bounds
    const pad = 28
    const k = clampK(Math.min((w - pad * 2) / Math.max(b.width, 1), (h - pad * 2) / Math.max(b.height, 1), 1.1))
    return { k, x: w / 2 - (b.minX + b.width / 2) * k, y: h / 2 - (b.minY + b.height / 2) * k }
  }

  const zoomAt = (factor: number, px: number, py: number, animate = false) => {
    const cur = t.current
    const k = clampK(cur.k * factor)
    const wx = (px - cur.x) / cur.k
    const wy = (py - cur.y) / cur.k
    setT({ k, x: px - wx * k, y: py - wy * k }, animate)
  }

  const centerOn = (personId: string, animate = true, minK = 0.8) => {
    const n = layoutRef.current.nodes.find((x) => x.personId === personId)
    if (!n) return false
    const { w, h } = size()
    const k = Math.max(t.current.k, minK)
    setT({ k, x: w / 2 - (n.x + n.w / 2) * k, y: h / 2 - (n.y + n.h / 2) * k }, animate)
    return true
  }

  useImperativeHandle(ref, () => ({
    fit: (animate = true) => setT(fitTransform(), animate),
    zoomBy: (f) => {
      const { w, h } = size()
      zoomAt(f, w / 2, h / 2, true)
    },
    centerOn: (id, animate = true) => centerOn(id, animate),
  }))

  // Re-focus when the root or mode changes.
  useLayoutEffect(() => {
    const fit = fitTransform()
    if (fit.k >= 0.55 || !focusPersonId) setT(fit, false)
    else {
      t.current = { ...t.current, k: 0.85 }
      if (!centerOn(focusPersonId, false, 0.85)) setT(fit, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  useEffect(() => {
    const onResize = () => apply()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [apply])

  // ── gestures ──
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    mode: 'none' | 'drag' | 'pinch'
    sx: number
    sy: number
    t0: Transform
    dist0: number
    mid0: { x: number; y: number }
    moved: boolean
  }>({ mode: 'none', sx: 0, sy: 0, t0: t.current, dist0: 1, mid0: { x: 0, y: 0 }, moved: false })
  const lastTap = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 })
  const suppressClick = useRef(false)

  const local = (e: { clientX: number; clientY: number }) => {
    const s = size()
    return { x: e.clientX - s.left, y: e.clientY - s.top }
  }

  const startGesture = () => {
    const pts = [...pointers.current.values()]
    const gs = gesture.current
    gs.t0 = { ...t.current }
    if (pts.length >= 2) {
      gs.mode = 'pinch'
      gs.dist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      gs.mid0 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      gs.moved = true
    } else if (pts.length === 1) {
      gs.mode = 'drag'
      gs.sx = pts[0].x
      gs.sy = pts[0].y
    } else gs.mode = 'none'
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stopAnim()
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size === 1) gesture.current.moved = false
    startGesture()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, local(e))
    const gs = gesture.current
    const pts = [...pointers.current.values()]
    if (gs.mode === 'pinch' && pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const k = clampK(gs.t0.k * (dist / gs.dist0))
      const wx = (gs.mid0.x - gs.t0.x) / gs.t0.k
      const wy = (gs.mid0.y - gs.t0.y) / gs.t0.k
      t.current = { k, x: mid.x - wx * k, y: mid.y - wy * k }
      apply()
    } else if (gs.mode === 'drag') {
      const dx = pts[0].x - gs.sx
      const dy = pts[0].y - gs.sy
      if (!gs.moved && Math.hypot(dx, dy) > 6) {
        gs.moved = true
        try {
          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      if (gs.moved) {
        t.current = { ...gs.t0, x: gs.t0.x + dx, y: gs.t0.y + dy }
        apply()
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    pointers.current.delete(e.pointerId)
    const gs = gesture.current
    const wasMoved = gs.moved
    if (pointers.current.size > 0) {
      startGesture()
      gs.moved = true
      return
    }
    gs.mode = 'none'
    if (wasMoved) {
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 50)
      return
    }
    // Double tap on empty space → zoom in.
    const onCard = (e.target as Element).closest?.('[data-person]')
    const now = performance.now()
    const lt = lastTap.current
    if (!onCard && now - lt.time < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 30) {
      zoomAt(1.8, p.x, p.y, true)
      lastTap.current = { time: 0, x: 0, y: 0 }
    } else lastTap.current = { time: now, x: p.x, y: p.y }
  }

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = size()
      const px = e.clientX - s.left
      const py = e.clientY - s.top
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)
      if (e.ctrlKey || mouseWheel) {
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)), px, py)
      } else {
        stopAnim()
        t.current = { ...t.current, x: t.current.x - e.deltaX, y: t.current.y - e.deltaY }
        apply()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    // Safari pinch gestures.
    const prevent = (e: Event) => e.preventDefault()
    el.addEventListener('gesturestart', prevent)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', prevent)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const b = layout.bounds
  const pal = (id: string) => {
    const p = svgProps.persons.get(id)
    return p ? personPalette(p, !!svgProps.dark).border : '#94a3b8'
  }

  return (
    <div
      ref={wrapRef}
      className="touch-none-all relative h-full w-full overflow-hidden select-none"
      style={{ touchAction: 'none', cursor: 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
    >
      <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <TreeDefs />
        <g ref={gRef}>
          <TreeSvgContent layout={layout} {...svgProps} />
        </g>
      </svg>
      {showMinimap && layout.nodes.length > 12 && (
        <div
          className="absolute bottom-3 left-3 hidden overflow-hidden rounded-xl border border-slate-200 bg-white/85 shadow-sm backdrop-blur sm:block dark:border-slate-700 dark:bg-slate-900/85"
          style={{ width: 150, height: 96 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const scale = Math.max(b.width / 150, b.height / 96)
            const ox = (150 * scale - b.width) / 2
            const oy = (96 * scale - b.height) / 2
            const wx = b.minX - ox + (e.clientX - r.left) * scale
            const wy = b.minY - oy + (e.clientY - r.top) * scale
            const s = size()
            const k = t.current.k
            setT({ k, x: s.w / 2 - wx * k, y: s.h / 2 - wy * k }, true)
          }}
        >
          <svg width="150" height="96" viewBox={`${b.minX} ${b.minY} ${b.width} ${b.height}`} preserveAspectRatio="xMidYMid meet">
            {layout.nodes.map((n) => (
              <rect key={n.key} x={n.x} y={n.y} width={n.w} height={n.h} rx={12} fill={pal(n.personId)} opacity={0.7} />
            ))}
            <rect ref={miniViewRef} fill="rgba(20,184,166,0.12)" stroke="#0d9488" strokeWidth={Math.max(b.width, b.height) / 120} rx={8} />
          </svg>
        </div>
      )}
    </div>
  )
})
