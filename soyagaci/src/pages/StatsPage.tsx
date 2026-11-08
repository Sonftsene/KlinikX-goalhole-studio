import { useMemo, type ReactNode } from 'react'
import { BarChart3 } from 'lucide-react'
import { useFamily } from '../store/useFamily'
import { useT } from '../lib/i18n'
import { type Counted, computeStats } from '../lib/stats'
import { EmptyState, PageHeader } from '../components/ui'
import { PersonRow } from '../components/person/PersonRow'
import { useVisibleGraph } from '../features/premium/useVisibleGraph'

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

/** Horizontal bars with the value written at the end of each bar. */
function Bars({ title, data }: { title: string; data: Counted[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  if (!data.length) return null
  return (
    <section className="card p-4">
      <h2 className="section-title">{title}</h2>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
            <span className="truncate text-slate-700 dark:text-slate-300" title={d.label}>
              {d.label}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block h-3 rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${Math.max(4, (d.count / max) * 100)}%` }} />
              </span>
              <span className="w-6 shrink-0 text-right text-xs text-slate-500 tabular-nums">{d.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Vertical bars for births per decade. */
function Columns({ title, data }: { title: string; data: Counted[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  if (!data.length) return null
  return (
    <section className="card min-w-0 p-4">
      <h2 className="section-title">{title}</h2>
      <div className="no-scrollbar overflow-x-auto">
        <div className="flex h-44 items-end gap-1.5" style={{ minWidth: data.length * 34 }}>
          {data.map((d) => (
            <div key={d.label} className="flex h-full min-w-7 flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.count}`}>
              <span className="text-[11px] text-slate-500 tabular-nums">{d.count || ''}</span>
              <div className="w-full rounded-t-md bg-brand-600 dark:bg-brand-400" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }} />
              <span className="text-[10px] whitespace-nowrap text-slate-500">{d.label.slice(0, 4)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function StatsPage() {
  const t = useT()
  const { persons } = useVisibleGraph()
  const relations = useFamily((s) => s.data.relations)
  const s = useMemo(() => computeStats(persons, relations), [persons, relations])

  if (!persons.length) return <EmptyState icon={<BarChart3 size={40} />} title={t('Henüz istatistik yok', 'No statistics yet')} />

  const malePct = s.total ? Math.round((s.male / s.total) * 100) : 0
  const femalePct = s.total ? Math.round((s.female / s.total) * 100) : 0

  return (
    <div>
      <PageHeader title={t('Aile istatistikleri', 'Family statistics')} subtitle={s.earliestYear ? t(`${s.earliestYear}'den ${s.latestYear}'e`, `${s.earliestYear} to ${s.latestYear}`) : undefined} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Tile label={t('Toplam kişi', 'People')} value={s.total} />
        <Tile label={t('Kuşak', 'Generations')} value={s.generations} />
        <Tile label={t('Hayatta', 'Living')} value={s.living} hint={`🕊 ${s.deceased} ${t('vefat', 'deceased')}`} />
        <Tile label={t('Evlilik', 'Marriages')} value={s.marriages} hint={s.divorces ? `${s.divorces} ${t('boşanma', 'divorces')}` : undefined} />
        {s.averageLifespan !== undefined && <Tile label={t('Ortalama ömür', 'Average lifespan')} value={`${s.averageLifespan}`} hint={t('yıl (vefat edenler)', 'years (deceased)')} />}
        {s.averageChildren !== undefined && <Tile label={t('Aile başına çocuk', 'Children per parent')} value={s.averageChildren} />}
      </div>

      <section className="card mt-3 p-4">
        <h2 className="section-title">{t('Cinsiyet dağılımı', 'Gender split')}</h2>
        <div className="flex h-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="img" aria-label={`${malePct}% / ${femalePct}%`}>
          <div className="bg-male" style={{ width: `${malePct}%` }} />
          <div className="bg-female" style={{ width: `${femalePct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-male" /> {t('Erkek', 'Male')} {s.male} ({malePct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-female" /> {t('Kadın', 'Female')} {s.female} ({femalePct}%)
          </span>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {(s.oldestLiving || s.longestLived || s.mostChildren || s.youngest) && (
          <section className="card p-4 md:col-span-2">
            <h2 className="section-title">{t('Öne çıkanlar', 'Highlights')}</h2>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2 [&>*]:min-w-0">
              {s.oldestLiving && <PersonRow person={s.oldestLiving.person} to={`/kisi/${s.oldestLiving.person.id}`} subtitle={`👑 ${t('En yaşlı yaşayan', 'Oldest living')} · ${s.oldestLiving.age} ${t('yaş', 'years')}`} />}
              {s.longestLived && <PersonRow person={s.longestLived.person} to={`/kisi/${s.longestLived.person.id}`} subtitle={`⏳ ${t('En uzun yaşayan', 'Longest lived')} · ${s.longestLived.age} ${t('yıl', 'years')}`} />}
              {s.mostChildren && <PersonRow person={s.mostChildren.person} to={`/kisi/${s.mostChildren.person.id}`} subtitle={`👨‍👩‍👧‍👦 ${t('En çok çocuk', 'Most children')} · ${s.mostChildren.count}`} />}
              {s.youngest && <PersonRow person={s.youngest} to={`/kisi/${s.youngest.id}`} subtitle={`🍼 ${t('Ailenin en küçüğü', 'Youngest')}`} />}
            </div>
          </section>
        )}
        <div className="md:col-span-2">
          <Columns title={t('On yıllara göre doğumlar', 'Births per decade')} data={s.birthsPerDecade} />
        </div>
        <Bars title={t('En yaygın adlar', 'Most common first names')} data={s.firstNames} />
        <Bars title={t('Soyadları (doğum)', 'Surnames (birth)')} data={s.surnames} />
        <Bars title={t('Doğum yerleri', 'Birthplaces')} data={s.birthplaces} />
        <Bars title={t('Meslekler', 'Occupations')} data={s.occupations} />
      </div>
    </div>
  )
}
