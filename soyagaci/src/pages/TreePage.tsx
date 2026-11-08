import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Crosshair, Download, Info, Lock, Maximize, Minus, Plus, Search, GitFork, X } from 'lucide-react'
import { useFamily, useVisiblePersons } from '../store/useFamily'
import { canManage, canView } from '../lib/permissions'
import { createPersonSearch } from '../lib/search'
import { displayName, lifeSpan } from '../lib/format'
import { useLang, useT } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { Button, EmptyState, Segmented, cx } from '../components/ui'
import { Legend } from '../components/person/Legend'
import { Avatar } from '../components/person/Avatar'
import { type TreeMode, type TreeNode, bloodPath, hasHiddenRelatives, layoutTree, pathPairs } from '../features/tree/layout'
import { TreeCanvas, type TreeCanvasHandle } from '../features/tree/TreeCanvas'
import { PersonSheet } from '../features/tree/PersonSheet'
import { ExportSheet } from '../features/export/ExportSheet'

const MODES: TreeMode[] = ['hourglass', 'ancestors', 'descendants', 'family']
const DEPTHS = [1, 2, 3, 4, 5, 6, 99]

export default function TreePage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const nav = useNavigate()
  const dark = useTheme((s) => s.dark)
  const [params, setParams] = useSearchParams()
  const user = useFamily((s) => s.user)
  const graph = useFamily((s) => s.graph)
  const visible = useFamily((s) => s.visible)
  const settings = useFamily((s) => s.data.settings)
  const visiblePersons = useVisiblePersons()
  const canvas = useRef<TreeCanvasHandle>(null)

  const modeParam = params.get('mod') as TreeMode | null
  const mode: TreeMode = modeParam && MODES.includes(modeParam) ? modeParam : 'hourglass'
  const depthParam = Number(params.get('derinlik'))
  const depth = DEPTHS.includes(depthParam) ? depthParam : mode === 'family' ? 99 : 3
  const side = params.get('taraf') === 'anne' ? 'mother' : 'father'

  const can = (id?: string): id is string => !!id && graph.persons.has(id) && canView(visible, id)
  const rootParam = params.get('kisi') ?? undefined
  const rootId = can(rootParam)
    ? rootParam
    : can(user?.personId)
      ? user!.personId!
      : can(settings.rootPersonId)
        ? settings.rootPersonId!
        : visiblePersons[0]?.id
  const blockedRoot = !!rootParam && graph.persons.has(rootParam) && !canView(visible, rootParam)

  const focusKey = `${rootId}|${mode}|${side}|${depth}`
  const [toggleState, setToggleState] = useState<{ key: string; map: Map<string, 'open' | 'closed'> }>({ key: focusKey, map: new Map() })
  const toggles = toggleState.key === focusKey ? toggleState.map : new Map<string, 'open' | 'closed'>()
  const [selected, setSelected] = useState<string>()
  const [showLegend, setShowLegend] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [q, setQ] = useState('')

  const layout = useMemo(
    () => (rootId ? layoutTree(graph, { mode, rootId, maxUp: depth, maxDown: depth, toggles, visible, side }) : null),
    [graph, mode, rootId, depth, toggles, visible, side],
  )
  const blood = useMemo(() => pathPairs(bloodPath(graph, user?.personId, selected ?? rootId)), [graph, user?.personId, selected, rootId])
  const hidden = useMemo(() => (layout ? hasHiddenRelatives(graph, layout, visible) : false), [graph, layout, visible])
  const search = useMemo(() => createPersonSearch(visiblePersons), [visiblePersons])
  const results = q ? search(q, 8) : []

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params)
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) next.delete(k)
        else next.set(k, v)
      }
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const reroot = (id: string, nextMode?: TreeMode) => {
    setSelected(undefined)
    update({ kisi: id, mod: nextMode ?? (mode === 'family' ? 'hourglass' : mode) })
  }

  const onAction = (node: TreeNode, dir: 'up' | 'down') => {
    const action = dir === 'up' ? node.up : node.down
    if (!action) return
    if (action === 'reroot') {
      reroot(node.upTarget ?? node.personId, 'hourglass')
      return
    }
    const key = `${dir === 'up' ? 'u' : 'd'}:${node.personId}`
    const map = new Map(toggles)
    map.set(key, action === 'expand' ? 'open' : 'closed')
    setToggleState({ key: focusKey, map })
  }

  const jumpTo = (id: string) => {
    setQ('')
    if (layout?.nodes.some((n) => n.personId === id)) {
      setSelected(id)
      canvas.current?.centerOn(id)
    } else reroot(id)
  }

  const modeLabel: Record<TreeMode, string> = {
    hourglass: t('Kum saati', 'Hourglass'),
    ancestors: t('Atalar', 'Ancestors'),
    descendants: t('Torunlar', 'Descendants'),
    family: t('Tüm aile', 'Whole family'),
  }

  if (!rootId || !layout) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        {canManage(user) ? (
          <EmptyState
            icon={<GitFork size={44} />}
            title={t('Ağaç henüz boş', 'The tree is empty')}
            text={t('İlk kişiyi ekleyerek soyağacınızı oluşturmaya başlayın.', 'Add the first person to start your family tree.')}
            action={<Button onClick={() => nav('/yeni')}>{t('İlk kişiyi ekle', 'Add first person')}</Button>}
          />
        ) : (
          <EmptyState
            icon={<Lock size={44} />}
            title={t('Görüntülenecek kişi yok', 'Nothing to show yet')}
            text={t(
              'Hesabınız henüz ağaçtaki bir kişiyle eşleştirilmedi. Yönetici eşleştirdiğinde kendi üst ve alt soyunuzu burada göreceksiniz.',
              'Your account is not linked to a person yet. Once an admin links it you will see your ancestors and descendants here.',
            )}
            action={
              <Link to="/taleplerim" className="text-sm font-medium text-brand-700 dark:text-brand-300">
                {t('Erişim iste', 'Request access')}
              </Link>
            }
          />
        )}
      </div>
    )
  }

  const root = graph.persons.get(rootId)!
  const top = graph.persons.get(layout.topId)
  const selectedPerson = selected ? graph.persons.get(selected) : undefined
  const subtitle = [modeLabel[mode], mode === 'family' && top ? displayName(top) : displayName(root), new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'tr-TR')].join(' · ')
  const fullLayout = () => layoutTree(graph, { mode, rootId, maxUp: 99, maxDown: 99, visible, side })

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="no-print z-20 space-y-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={17} className="pointer-events-none absolute top-2.5 left-3 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Ağaçta kişi bul…', 'Find in tree…')}
              className="input h-10 py-0 pr-9 pl-9 text-sm"
              aria-label={t('Ağaçta ara', 'Search tree')}
            />
            {q && (
              <button className="absolute top-2.5 right-2.5 text-slate-400" onClick={() => setQ('')} aria-label={t('Temizle', 'Clear')}>
                <X size={17} />
              </button>
            )}
            {!!q && (
              <div className="absolute inset-x-0 top-11 z-30 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {results.map((p) => (
                  <button key={p.id} onClick={() => jumpTo(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Avatar person={p} size={34} ring={p.id === user?.personId} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{displayName(p)}</div>
                      <div className="truncate text-xs text-slate-500">{[lifeSpan(p), p.birthPlace].filter(Boolean).join(' · ')}</div>
                    </div>
                  </button>
                ))}
                {!results.length && <p className="px-3 py-4 text-center text-sm text-slate-500">{t('Sonuç yok', 'No results')}</p>}
              </div>
            )}
          </div>
          <Button variant="secondary" size="icon" onClick={() => setShowLegend((v) => !v)} aria-label={t('Renk açıklaması', 'Legend')} className="md:hidden">
            <Info size={19} />
          </Button>
          <Button variant="secondary" onClick={() => setExportOpen(true)} icon={<Download size={18} />} className="px-3">
            <span className="hidden sm:inline">{t('Dışa aktar', 'Export')}</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            className="min-w-0 flex-1"
            value={mode}
            onChange={(m) => update({ mod: m, derinlik: undefined })}
            options={MODES.map((m) => ({ value: m, label: modeLabel[m] }))}
          />
          <select
            value={depth}
            onChange={(e) => update({ derinlik: e.target.value })}
            className="h-9 shrink-0 rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            aria-label={t('Kuşak sayısı', 'Generations')}
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {d === 99 ? t('Tüm kuşaklar', 'All generations') : t(`${d} kuşak`, `${d} gen.`)}
              </option>
            ))}
          </select>
        </div>
        {mode === 'family' && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">{t('Kök:', 'Root:')}</span>
            <Segmented
              value={side}
              onChange={(s) => update({ taraf: s === 'mother' ? 'anne' : undefined })}
              options={[
                { value: 'father', label: t('Baba tarafı', "Father's side") },
                { value: 'mother', label: t('Anne tarafı', "Mother's side") },
              ]}
            />
            {top && <span className="truncate text-xs text-slate-500">{displayName(top)}</span>}
          </div>
        )}
        <Legend compact className={cx('pb-0.5', showLegend ? 'flex' : 'hidden md:flex')} />
      </div>

      {/* Canvas */}
      <div className={cx('relative min-h-0 flex-1', dark ? 'bg-slate-950' : 'bg-slate-50')}>
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: `radial-gradient(${dark ? '#1e293b' : '#cbd5e1'} 1px, transparent 1px)`,
            backgroundSize: '22px 22px',
          }}
        />
        <TreeCanvas
          ref={canvas}
          layout={layout}
          persons={graph.persons}
          dark={dark}
          meId={user?.personId}
          selectedId={selected}
          blood={blood}
          lang={lang}
          focusKey={focusKey}
          focusPersonId={rootId}
          onSelect={(id) => setSelected(id)}
          onAction={onAction}
        />

        {(hidden || blockedRoot) && (
          <Link
            to="/taleplerim"
            className="no-print absolute top-3 left-1/2 z-10 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-slate-700 shadow-md ring-1 ring-slate-200 dark:bg-slate-900/95 dark:text-slate-200 dark:ring-slate-700"
          >
            <Lock size={14} className="shrink-0 text-amber-500" />
            <span className="truncate">{t('Diğer akrabaları görmek için erişim isteyin', 'Request access to see other relatives')}</span>
          </Link>
        )}

        {/* Zoom controls */}
        <div className="no-print absolute right-3 bottom-4 z-10 flex flex-col gap-2">
          {user?.personId && can(user.personId) && (
            <button
              onClick={() => {
                if (!canvas.current?.centerOn(user.personId!)) reroot(user.personId!)
              }}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-brand-700 px-3 text-sm font-semibold text-white shadow-lg active:bg-brand-800"
              aria-label={t('Beni bul', 'Find me')}
            >
              <Crosshair size={18} />
              <span className="hidden sm:inline">{t('Beni bul', 'Find me')}</span>
            </button>
          )}
          <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            {[
              { icon: Plus, label: t('Yakınlaştır', 'Zoom in'), fn: () => canvas.current?.zoomBy(1.35) },
              { icon: Minus, label: t('Uzaklaştır', 'Zoom out'), fn: () => canvas.current?.zoomBy(1 / 1.35) },
              { icon: Maximize, label: t('Ekrana sığdır', 'Fit to screen'), fn: () => canvas.current?.fit() },
            ].map((b) => (
              <button key={b.label} onClick={b.fn} aria-label={b.label} title={b.label} className="flex h-11 w-11 items-center justify-center text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <b.icon size={19} />
              </button>
            ))}
          </div>
        </div>

        <div className="no-print pointer-events-none absolute bottom-4 left-3 z-0 text-[11px] text-slate-400 sm:hidden">
          {t(`${new Set(layout.nodes.map((n) => n.personId)).size} kişi`, `${new Set(layout.nodes.map((n) => n.personId)).size} people`)}
        </div>
      </div>

      <PersonSheet
        person={selectedPerson}
        onClose={() => setSelected(undefined)}
        onReroot={(id) => reroot(id)}
        isMe={selected === user?.personId}
        canAdd={!!user && user.role !== 'guest'}
        meId={user?.personId}
        isRoot={selected === rootId && mode !== 'family'}
      />

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        layout={layout}
        fullLayout={fullLayout}
        persons={graph.persons}
        meId={user?.personId}
        title={settings.familyName || t('Soyağacı', 'Family tree')}
        subtitle={subtitle}
        blood={blood}
      />
    </div>
  )
}
