import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileSpreadsheet, FileText, LayoutGrid, List as ListIcon, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import type { Person } from '../types'
import { useFamily } from '../store/useFamily'
import { useLang, useT } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { createPersonSearch } from '../lib/search'
import { generationMap } from '../lib/graph'
import { ageOf, displayName, lifeSpan, normalizeTr } from '../lib/format'
import { TAG_INFO, personPalette } from '../lib/colors'
import { Badge, Button, EmptyState, PageHeader, Segmented, Sheet, attempt, cx } from '../components/ui'
import { PersonRow } from '../components/person/PersonRow'
import { Avatar } from '../components/person/Avatar'
import { Legend } from '../components/person/Legend'
import { useVisibleGraph } from '../features/premium/useVisibleGraph'
import { type ListGroup, exportCsv, exportPdf } from '../features/premium/listExport'

type SortKey = 'first' | 'last' | 'birth' | 'age'
type GroupKey = 'none' | 'generation' | 'surname' | 'status'
type GenderF = 'all' | 'male' | 'female'
type StatusF = 'all' | 'living' | 'deceased'

function relGenLabel(n: number, t: (tr: string, en?: string) => string) {
  if (n === 0) return t('Benim kuşağım', 'My generation')
  const map: Record<number, [string, string]> = {
    [-1]: ['Anne-babalar', 'Parents'],
    [-2]: ['Büyükanne-dedeler', 'Grandparents'],
    [-3]: ['Büyük dedeler', 'Great-grandparents'],
    1: ['Çocuklar', 'Children'],
    2: ['Torunlar', 'Grandchildren'],
    3: ['Torun çocukları', 'Great-grandchildren'],
  }
  const m = map[n]
  if (m) return t(m[0], m[1])
  return n < 0 ? t(`${-n} kuşak yukarı`, `${-n} generations up`) : t(`${n} kuşak aşağı`, `${n} generations down`)
}

export default function ListPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const dark = useTheme((s) => s.dark)
  const { persons, graph } = useVisibleGraph()
  const meId = useFamily((s) => s.user?.personId)
  const rootSetting = useFamily((s) => s.data.settings.rootPersonId)
  const familyName = useFamily((s) => s.data.settings.familyName) || 'Soyağacı'

  const [q, setQ] = useState('')
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try {
      return (localStorage.getItem('soyagaci-list-view') as 'list' | 'grid') || 'list'
    } catch {
      return 'list'
    }
  })
  const [sort, setSort] = useState<SortKey>('birth')
  const [group, setGroup] = useState<GroupKey>('generation')
  const [gender, setGender] = useState<GenderF>('all')
  const [status, setStatus] = useState<StatusF>('all')
  const [surname, setSurname] = useState('')
  const [gen, setGen] = useState<string>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState<'' | 'pdf' | 'csv'>('')

  const setViewSaved = (v: 'list' | 'grid') => {
    setView(v)
    try {
      localStorage.setItem('soyagaci-list-view', v)
    } catch {
      /* ignore */
    }
  }

  const search = useMemo(() => createPersonSearch(persons), [persons])

  // Generation numbers relative to me (or the family root).
  const rootId = (meId && graph.persons.has(meId) ? meId : rootSetting && graph.persons.has(rootSetting) ? rootSetting : persons[0]?.id) ?? ''
  const gens = useMemo(() => (rootId ? generationMap(graph, rootId) : new Map<string, number>()), [graph, rootId])
  const minGen = Math.min(0, ...gens.values())
  const genOptions = useMemo(() => [...new Set(gens.values())].sort((a, b) => a - b), [gens])

  const surnames = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of persons) for (const s of new Set([p.lastName, p.maidenName].filter(Boolean) as string[])) m.set(s, (m.get(s) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
  }, [persons])

  const filtered = useMemo(() => {
    let list = q.trim() ? search(q, 500) : [...persons]
    if (gender !== 'all') list = list.filter((p) => p.gender === gender)
    if (status !== 'all') list = list.filter((p) => (status === 'deceased' ? p.isDeceased : !p.isDeceased))
    if (surname) {
      const s = normalizeTr(surname)
      list = list.filter((p) => normalizeTr(p.lastName) === s || normalizeTr(p.maidenName) === s)
    }
    if (gen !== 'all') list = list.filter((p) => String(gens.get(p.id)) === gen)
    // With a search query keep relevance order; otherwise apply the chosen sort.
    if (!q.trim()) {
      const cmp: Record<SortKey, (a: Person, b: Person) => number> = {
        first: (a, b) => a.firstName.localeCompare(b.firstName, 'tr') || a.lastName.localeCompare(b.lastName, 'tr'),
        last: (a, b) => a.lastName.localeCompare(b.lastName, 'tr') || a.firstName.localeCompare(b.firstName, 'tr'),
        birth: (a, b) => (a.birthDate || '9999').localeCompare(b.birthDate || '9999'),
        age: (a, b) => (ageOf(b) ?? -1) - (ageOf(a) ?? -1),
      }
      list.sort(cmp[sort])
    }
    return list
  }, [q, search, persons, gender, status, surname, gen, gens, sort])

  const groups: ListGroup[] = useMemo(() => {
    if (group === 'none') return [{ persons: filtered }]
    const map = new Map<string, Person[]>()
    const order: string[] = []
    const keyOf = (p: Person): [string, number | string] => {
      if (group === 'generation') {
        const g = gens.get(p.id)
        if (g === undefined) return [t('Bağlantısız', 'Unconnected'), 9999]
        const n = g - minGen + 1
        return [`${n}. ${t('kuşak', 'generation')} · ${relGenLabel(g, t)}`, n]
      }
      if (group === 'surname') {
        const s = p.maidenName || p.lastName || '—'
        return [s, s]
      }
      return p.isDeceased ? [t('Vefat edenler', 'Deceased'), 1] : [t('Hayatta olanlar', 'Living'), 0]
    }
    const sortKey = new Map<string, number | string>()
    for (const p of filtered) {
      const [k, s] = keyOf(p)
      if (!map.has(k)) {
        map.set(k, [])
        order.push(k)
        sortKey.set(k, s)
      }
      map.get(k)!.push(p)
    }
    order.sort((a, b) => {
      const x = sortKey.get(a)!
      const y = sortKey.get(b)!
      return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr')
    })
    return order.map((k) => ({ title: k, persons: map.get(k)! }))
  }, [filtered, group, gens, minGen, t])

  const activeFilters = [gender !== 'all', status !== 'all', !!surname, gen !== 'all'].filter(Boolean).length
  const living = filtered.filter((p) => !p.isDeceased).length

  const clearFilters = () => {
    setGender('all')
    setStatus('all')
    setSurname('')
    setGen('all')
  }

  const doExport = async (kind: 'pdf' | 'csv') => {
    setBusy(kind)
    const filters = [
      gender !== 'all' && (gender === 'male' ? t('Erkek', 'Male') : t('Kadın', 'Female')),
      status !== 'all' && (status === 'living' ? t('Hayatta', 'Living') : t('Vefat', 'Deceased')),
      surname,
      gen !== 'all' && relGenLabel(Number(gen), t),
    ].filter(Boolean)
    const subtitle = `${t('Kişi listesi', 'Person list')} · ${filtered.length} ${t('kişi', 'people')}${filters.length ? ` · ${filters.join(', ')}` : ''}`
    await attempt(
      async () => {
        if (kind === 'csv') exportCsv(groups, graph, familyName, lang)
        else await exportPdf(groups, familyName, subtitle, lang)
      },
      kind === 'csv' ? t('Excel dosyası indirildi', 'Spreadsheet downloaded') : t('PDF indirildi', 'PDF downloaded'),
    )
    setBusy('')
    setExportOpen(false)
  }

  const selectCls = 'input py-2 text-sm'

  return (
    <div>
      <PageHeader
        title={t('Liste', 'List')}
        subtitle={`${filtered.length} ${t('kişi', 'people')} · ${living} ${t('hayatta', 'living')} · ${filtered.length - living} ${t('vefat', 'deceased')}`}
        actions={
          <>
            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['list', 'grid'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewSaved(v)}
                  aria-label={v === 'list' ? t('Liste görünümü', 'List view') : t('Kart görünümü', 'Card view')}
                  className={cx('rounded-lg p-1.5', view === v ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500')}
                >
                  {v === 'list' ? <ListIcon size={18} /> : <LayoutGrid size={18} />}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="icon" onClick={() => setExportOpen(true)} aria-label={t('Dışa aktar', 'Export')}>
              <Download size={18} />
            </Button>
          </>
        }
      />

      <div className="sticky top-0 z-10 -mx-4 mb-3 space-y-2 bg-slate-50/95 px-4 pt-1 pb-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 dark:bg-slate-950/95">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute top-3 left-3 text-slate-400" />
            <input className="input pr-9 pl-10" placeholder={t('İsim, soyisim, yer, yıl…', 'Name, surname, place, year…')} value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button onClick={() => setQ('')} className="absolute top-2.5 right-2.5 rounded-full p-0.5 text-slate-400 hover:text-slate-600" aria-label={t('Temizle', 'Clear')}>
                <X size={18} />
              </button>
            )}
          </div>
          <Button variant={activeFilters ? 'primary' : 'outline'} onClick={() => setFiltersOpen((v) => !v)} className="relative" icon={<SlidersHorizontal size={17} />}>
            <span className="hidden sm:inline">{t('Filtre', 'Filter')}</span>
            {!!activeFilters && <span className="rounded-full bg-white/25 px-1.5 text-xs">{activeFilters}</span>}
          </Button>
        </div>

        {filtersOpen && (
          <div className="card animate-fade-in space-y-3 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Segmented<GenderF>
                value={gender}
                onChange={setGender}
                options={[
                  { value: 'all', label: t('Tümü', 'All') },
                  { value: 'male', label: t('Erkek', 'Male') },
                  { value: 'female', label: t('Kadın', 'Female') },
                ]}
              />
              <Segmented<StatusF>
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: t('Tümü', 'All') },
                  { value: 'living', label: t('Hayatta', 'Living') },
                  { value: 'deceased', label: t('Vefat 🕊', 'Deceased 🕊') },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label>
                <span className="label text-xs">{t('Soyadı', 'Surname')}</span>
                <select className={selectCls} value={surname} onChange={(e) => setSurname(e.target.value)}>
                  <option value="">{t('Tümü', 'All')}</option>
                  {surnames.map(([s, c]) => (
                    <option key={s} value={s}>
                      {s} ({c})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label text-xs">{t('Kuşak', 'Generation')}</span>
                <select className={selectCls} value={gen} onChange={(e) => setGen(e.target.value)}>
                  <option value="all">{t('Tümü', 'All')}</option>
                  {genOptions.map((g) => (
                    <option key={g} value={String(g)}>
                      {relGenLabel(g, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label text-xs">{t('Sırala', 'Sort')}</span>
                <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="birth">{t('Doğum tarihi', 'Birth date')}</option>
                  <option value="first">{t('Ad', 'First name')}</option>
                  <option value="last">{t('Soyad', 'Surname')}</option>
                  <option value="age">{t('Yaş (büyükten)', 'Age (oldest)')}</option>
                </select>
              </label>
              <label>
                <span className="label text-xs">{t('Grupla', 'Group by')}</span>
                <select className={selectCls} value={group} onChange={(e) => setGroup(e.target.value as GroupKey)}>
                  <option value="generation">{t('Kuşak', 'Generation')}</option>
                  <option value="surname">{t('Soyadı', 'Surname')}</option>
                  <option value="status">{t('Hayatta / vefat', 'Living / deceased')}</option>
                  <option value="none">{t('Gruplama yok', 'No grouping')}</option>
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Legend compact />
              {!!activeFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  {t('Temizle', 'Clear')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={<Users size={40} />}
          title={persons.length ? t('Eşleşen kişi yok', 'No matching people') : t('Henüz kişi yok', 'No people yet')}
          text={persons.length ? t('Arama veya filtreleri değiştirin.', 'Try another search or filter.') : t('Ağaca ilk kişiyi ekleyerek başlayın.', 'Start by adding the first person.')}
          action={
            activeFilters || q ? (
              <Button
                variant="secondary"
                onClick={() => {
                  clearFilters()
                  setQ('')
                }}
              >
                {t('Filtreleri temizle', 'Clear filters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((grp) => (
            <section key={grp.title ?? 'all'}>
              {grp.title && (
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{grp.title}</h2>
                  <Badge>{grp.persons.length}</Badge>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
              )}
              {view === 'list' ? (
                <div className="card divide-y divide-slate-100 overflow-hidden p-1 dark:divide-slate-800">
                  {grp.persons.map((p) => (
                    <PersonRow key={p.id} person={p} to={`/kisi/${p.id}`} right={ageOf(p) !== undefined && <span className="shrink-0 text-xs text-slate-400 tabular-nums">{ageOf(p)} {t('yaş', 'y')}</span>} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {grp.persons.map((p) => {
                    const pal = personPalette(p, dark)
                    return (
                      <Link
                        key={p.id}
                        to={`/kisi/${p.id}`}
                        className={cx('card flex flex-col items-center border-t-4 px-2 py-3 text-center transition hover:shadow-md', meId === p.id && 'ring-2 ring-amber-400')}
                        style={{ borderTopColor: pal.border, background: pal.bg }}
                      >
                        <Avatar person={p} size={60} ring={meId === p.id} />
                        <div className="mt-2 line-clamp-2 text-sm leading-tight font-semibold" style={{ color: pal.text }}>
                          {displayName(p)}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: pal.sub }}>
                          {lifeSpan(p) || '—'}
                        </div>
                        {(p.occupation || p.tags?.length) && (
                          <div className="mt-1 line-clamp-1 text-[11px]" style={{ color: pal.sub }}>
                            {p.tags?.map((tg) => TAG_INFO[tg]?.emoji).join('')} {p.occupation}
                          </div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title={t('Listeyi dışa aktar', 'Export list')}>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {t(`Şu anki filtre ve gruplamayla ${filtered.length} kişi aktarılır.`, `${filtered.length} people with the current filters and grouping will be exported.`)}
        </p>
        <div className="space-y-2">
          <button onClick={() => doExport('pdf')} disabled={!!busy} className="card flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800">
            <span className="rounded-xl bg-red-100 p-2.5 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              <FileText size={22} />
            </span>
            <span className="flex-1">
              <span className="block font-medium">{t('PDF (A4, yazdırmaya hazır)', 'PDF (A4, print-ready)')}</span>
              <span className="text-xs text-slate-500">{t('Renk kodlu, sayfa numaralı tablo', 'Colour-coded table with page numbers')}</span>
            </span>
            {busy === 'pdf' && <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />}
          </button>
          <button onClick={() => doExport('csv')} disabled={!!busy} className="card flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800">
            <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <FileSpreadsheet size={22} />
            </span>
            <span className="flex-1">
              <span className="block font-medium">{t('Excel / CSV', 'Excel / CSV')}</span>
              <span className="text-xs text-slate-500">{t('Anne, baba, eş bilgileriyle birlikte', 'Includes parents and spouses')}</span>
            </span>
          </button>
        </div>
      </Sheet>
    </div>
  )
}
