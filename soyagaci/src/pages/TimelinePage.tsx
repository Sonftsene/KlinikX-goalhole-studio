import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownUp, CalendarClock } from 'lucide-react'
import type { Person } from '../types'
import { useLang, useT } from '../lib/i18n'
import { ageOf, displayName, formatDate, yearOf } from '../lib/format'
import { Button, EmptyState, PageHeader, Segmented, Switch, cx } from '../components/ui'
import { Avatar } from '../components/person/Avatar'
import { useVisibleGraph } from '../features/premium/useVisibleGraph'
import { useFamily } from '../store/useFamily'

type Kind = 'birth' | 'marriage' | 'divorce' | 'death' | 'history'
type Filter = 'all' | 'birth' | 'marriage' | 'death'

interface Event {
  key: string
  kind: Kind
  date: string
  year: number
  title: string
  place?: string
  people: Person[]
}

// Historical context shown between family events.
const HISTORY: { year: number; end?: number; tr: string; en: string }[] = [
  { year: 1914, end: 1918, tr: 'I. Dünya Savaşı', en: 'World War I' },
  { year: 1919, end: 1922, tr: 'Kurtuluş Savaşı', en: 'Turkish War of Independence' },
  { year: 1923, tr: 'Türkiye Cumhuriyeti’nin ilanı', en: 'Republic of Türkiye proclaimed' },
  { year: 1928, tr: 'Harf Devrimi', en: 'Alphabet reform' },
  { year: 1934, tr: 'Soyadı Kanunu — ailelere soyadı verildi', en: 'Surname Law — families take surnames' },
  { year: 1939, tr: 'Erzincan depremi', en: 'Erzincan earthquake' },
  { year: 1939, end: 1945, tr: 'II. Dünya Savaşı', en: 'World War II' },
  { year: 1950, end: 1953, tr: 'Kore Savaşı', en: 'Korean War' },
  { year: 1961, tr: 'Almanya ile işgücü anlaşması — yurt dışına göç başladı', en: 'Labour agreement with Germany — emigration begins' },
  { year: 1969, tr: 'Ay’a ilk insan ayak bastı', en: 'First Moon landing' },
  { year: 1974, tr: 'Kıbrıs Barış Harekâtı', en: 'Cyprus operation' },
  { year: 1999, tr: 'Marmara depremi', en: 'Marmara earthquake' },
  { year: 2020, tr: 'COVID-19 pandemisi', en: 'COVID-19 pandemic' },
  { year: 2023, tr: 'Kahramanmaraş depremleri', en: 'Kahramanmaraş earthquakes' },
]

const ICON: Record<Kind, string> = { birth: '👶', marriage: '💍', divorce: '💔', death: '🕊', history: '📜' }

export default function TimelinePage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { persons, graph } = useVisibleGraph()
  const relations = useFamily((s) => s.data.relations)
  const [filter, setFilter] = useState<Filter>('all')
  const [showHistory, setShowHistory] = useState(true)
  const [newestFirst, setNewestFirst] = useState(false)

  const events = useMemo(() => {
    const out: Event[] = []
    for (const p of persons) {
      const by = yearOf(p.birthDate)
      if (by !== undefined) out.push({ key: `b${p.id}`, kind: 'birth', date: p.birthDate!, year: by, title: t(`${displayName(p)} doğdu`, `${displayName(p)} was born`), place: p.birthPlace, people: [p] })
      const dy = yearOf(p.deathDate)
      if (p.isDeceased && dy !== undefined) {
        const age = ageOf(p)
        out.push({
          key: `d${p.id}`,
          kind: 'death',
          date: p.deathDate!,
          year: dy,
          title: t(`${displayName(p)} vefat etti${age !== undefined ? ` (${age} yaşında)` : ''}`, `${displayName(p)} passed away${age !== undefined ? ` (aged ${age})` : ''}`),
          place: p.deathPlace,
          people: [p],
        })
      }
    }
    for (const r of relations) {
      if (r.kind !== 'partner') continue
      const a = graph.persons.get(r.aId)
      const b = graph.persons.get(r.bId)
      if (!a || !b) continue // only couples the user can see
      const names = `${a.firstName} & ${b.firstName}`
      const sy = yearOf(r.startDate)
      if (sy !== undefined && r.type !== 'partner')
        out.push({
          key: `m${r.id}`,
          kind: 'marriage',
          date: r.startDate!,
          year: sy,
          title: r.type === 'engaged' ? t(`${names} nişanlandı`, `${names} got engaged`) : t(`${names} evlendi`, `${names} got married`),
          place: r.place,
          people: [a, b],
        })
      const ey = yearOf(r.endDate)
      if (r.type === 'divorced' && ey !== undefined) out.push({ key: `v${r.id}`, kind: 'divorce', date: r.endDate!, year: ey, title: t(`${names} boşandı`, `${names} divorced`), people: [a, b] })
    }
    const years = out.map((e) => e.year)
    if (showHistory && years.length) {
      const min = Math.min(...years)
      const max = Math.max(...years, new Date().getFullYear())
      for (const h of HISTORY)
        if ((h.end ?? h.year) >= min && h.year <= max)
          out.push({ key: `h${h.year}${h.tr}`, kind: 'history', date: String(h.year), year: h.year, title: `${lang === 'en' ? h.en : h.tr}${h.end ? ` (${h.year}–${h.end})` : ''}`, people: [] })
    }
    const filtered = out.filter((e) => e.kind === 'history' || filter === 'all' || e.kind === filter || (filter === 'marriage' && e.kind === 'divorce'))
    filtered.sort((x, y) => x.date.localeCompare(y.date) || (x.kind === 'history' ? -1 : 1))
    if (newestFirst) filtered.reverse()
    return filtered
  }, [persons, relations, graph, filter, showHistory, newestFirst, t, lang])

  const decades = useMemo(() => {
    const map = new Map<number, Event[]>()
    for (const e of events) {
      const d = Math.floor(e.year / 10) * 10
      map.set(d, [...(map.get(d) ?? []), e])
    }
    return [...map.entries()]
  }, [events])

  const familyEvents = events.filter((e) => e.kind !== 'history').length

  return (
    <div>
      <PageHeader
        title={t('Zaman çizelgesi', 'Timeline')}
        subtitle={t(`Ailenin tarihindeki ${familyEvents} olay`, `${familyEvents} events in the family history`)}
        actions={
          <Button variant="secondary" size="icon" onClick={() => setNewestFirst((v) => !v)} aria-label={t('Sırayı çevir', 'Reverse order')}>
            <ArrowDownUp size={18} />
          </Button>
        }
      />
      <div className="mb-4 space-y-2">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('Tümü', 'All') },
            { value: 'birth', label: `👶 ${t('Doğum', 'Births')}` },
            { value: 'marriage', label: `💍 ${t('Evlilik', 'Marriages')}` },
            { value: 'death', label: `🕊 ${t('Vefat', 'Deaths')}` },
          ]}
        />
        <div className="card px-4 py-1">
          <Switch checked={showHistory} onChange={setShowHistory} label={t('Tarihî olayları göster', 'Show historical events')} />
        </div>
      </div>

      {!familyEvents ? (
        <EmptyState icon={<CalendarClock size={40} />} title={t('Tarihli olay yok', 'No dated events')} text={t('Kişilere doğum, evlilik ve vefat tarihi ekledikçe çizelge dolacak.', 'Add birth, marriage and death dates to fill the timeline.')} />
      ) : (
        <div className="space-y-6">
          {decades.map(([decade, list]) => (
            <section key={decade}>
              <div className="sticky top-0 z-10 -mx-1 mb-2 bg-slate-50/95 px-1 py-1 backdrop-blur dark:bg-slate-950/95">
                <h2 className="text-lg font-bold text-brand-800 dark:text-brand-300">{t(`${decade}'ler`, `${decade}s`)}</h2>
              </div>
              <ol className="relative ml-4 border-l-2 border-slate-200 dark:border-slate-800">
                {list.map((e) => (
                  <li key={e.key} className="relative mb-3 pl-6">
                    <span
                      className={cx(
                        'absolute top-2 -left-[13px] flex h-6 w-6 items-center justify-center rounded-full text-xs ring-4 ring-slate-50 dark:ring-slate-950',
                        e.kind === 'history' ? 'bg-amber-100 dark:bg-amber-900' : e.kind === 'death' ? 'bg-slate-200 dark:bg-slate-700' : e.kind === 'birth' ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-pink-100 dark:bg-pink-900',
                      )}
                    >
                      {ICON[e.kind]}
                    </span>
                    {e.kind === 'history' ? (
                      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                        <span className="font-semibold">{e.year}</span> · {e.title}
                      </div>
                    ) : (
                      <Link to={`/kisi/${e.people[0].id}`} className="card flex items-center gap-3 p-3 transition hover:shadow-md">
                        <div className="flex -space-x-3">
                          {e.people.map((p) => (
                            <Avatar key={p.id} person={p} size={40} />
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-slate-500">{formatDate(e.date, lang)}</div>
                          <div className="text-sm leading-snug font-medium">{e.title}</div>
                          {e.place && <div className="truncate text-xs text-slate-500">📍 {e.place}</div>}
                        </div>
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
