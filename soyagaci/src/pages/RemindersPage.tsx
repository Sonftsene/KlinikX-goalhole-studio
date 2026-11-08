import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CalendarPlus, Cake, Flower2, Heart } from 'lucide-react'
import type { Person } from '../types'
import { useFamily } from '../store/useFamily'
import { useLang, useT } from '../lib/i18n'
import { daysUntilAnniversary, displayName, formatDate, fullName, yearOf } from '../lib/format'
import { Button, EmptyState, PageHeader, Segmented, attempt, cx } from '../components/ui'
import { Avatar } from '../components/person/Avatar'
import { useVisibleGraph } from '../features/premium/useVisibleGraph'
import { downloadText, slug } from '../features/premium/download'

type Kind = 'birthday' | 'memorial' | 'wedding'

interface Reminder {
  key: string
  kind: Kind
  days: number
  date: string
  people: Person[]
  /** Age turning / years since death / years married. */
  years?: number
}

const ICON = { birthday: Cake, memorial: Flower2, wedding: Heart }
const COLOR: Record<Kind, string> = {
  birthday: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200',
  memorial: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  wedding: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
}

function nextYearsCount(date: string, days: number) {
  const y = yearOf(date)
  if (y === undefined) return undefined
  const target = new Date(Date.now() + days * 86400000)
  return target.getFullYear() - y
}

function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export default function RemindersPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { persons, graph } = useVisibleGraph()
  const relations = useFamily((s) => s.data.relations)
  const familyName = useFamily((s) => s.data.settings.familyName) || 'Soyağacı'
  const [range, setRange] = useState<'30' | '90' | '365'>('30')

  const all = useMemo(() => {
    const out: Reminder[] = []
    for (const p of persons) {
      if (!p.isDeceased && p.birthDate?.length === 10) {
        const days = daysUntilAnniversary(p.birthDate)
        if (days !== undefined) out.push({ key: `b${p.id}`, kind: 'birthday', days, date: p.birthDate, people: [p], years: nextYearsCount(p.birthDate, days) })
      }
      if (p.isDeceased && p.deathDate?.length === 10) {
        const days = daysUntilAnniversary(p.deathDate)
        if (days !== undefined) out.push({ key: `d${p.id}`, kind: 'memorial', days, date: p.deathDate, people: [p], years: nextYearsCount(p.deathDate, days) })
      }
    }
    for (const r of relations) {
      if (r.kind !== 'partner' || r.type !== 'married' || r.startDate?.length !== 10) continue
      const a = graph.persons.get(r.aId)
      const b = graph.persons.get(r.bId)
      if (!a || !b || a.isDeceased || b.isDeceased) continue
      const days = daysUntilAnniversary(r.startDate)
      if (days !== undefined) out.push({ key: `w${r.id}`, kind: 'wedding', days, date: r.startDate, people: [a, b], years: nextYearsCount(r.startDate, days) })
    }
    return out.sort((x, y) => x.days - y.days)
  }, [persons, relations, graph])

  const list = all.filter((r) => r.days <= Number(range))
  const month = new Date().getMonth()
  const thisMonth = all.filter((r) => Number(r.date.slice(5, 7)) - 1 === month)
  const monthName = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'tr-TR', { month: 'long' })

  const label = (r: Reminder) => {
    const names = r.people.map((p) => p.firstName).join(' & ')
    if (r.kind === 'birthday') return r.years !== undefined ? t(`${displayName(r.people[0])} ${r.years} yaşına giriyor`, `${displayName(r.people[0])} turns ${r.years}`) : displayName(r.people[0])
    if (r.kind === 'memorial') return r.years !== undefined ? t(`${displayName(r.people[0])} — vefatının ${r.years}. yılı`, `${displayName(r.people[0])} — ${r.years} years since passing`) : displayName(r.people[0])
    return r.years !== undefined ? t(`${names} — ${r.years}. evlilik yıl dönümü`, `${names} — ${r.years}th wedding anniversary`) : names
  }

  const dayText = (d: number) => (d === 0 ? t('Bugün!', 'Today!') : d === 1 ? t('Yarın', 'Tomorrow') : t(`${d} gün`, `${d} days`))

  const downloadIcs = () =>
    attempt(async () => {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Soyagaci//TR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(familyName)}`]
      for (const r of all) {
        if (r.date.slice(5) === '02-29') continue
        const start = r.date.replace(/-/g, '')
        const end = new Date(Date.UTC(+r.date.slice(0, 4), +r.date.slice(5, 7) - 1, +r.date.slice(8, 10) + 1)).toISOString().slice(0, 10).replace(/-/g, '')
        const who = r.people.map(fullName).join(' & ')
        const summary =
          r.kind === 'birthday' ? `🎂 ${who} ${t('doğum günü', 'birthday')}` : r.kind === 'memorial' ? `🕊 ${who} ${t('anma günü', 'memorial day')}` : `💍 ${who} ${t('evlilik yıl dönümü', 'anniversary')}`
        lines.push('BEGIN:VEVENT', `UID:${r.key}@soyagaci`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, 'RRULE:FREQ=YEARLY', `SUMMARY:${icsEscape(summary)}`, 'TRANSP:TRANSPARENT')
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(summary)}`, 'TRIGGER:-PT12H', 'END:VALARM', 'END:VEVENT')
      }
      lines.push('END:VCALENDAR')
      downloadText(`${slug(familyName)}-takvim.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8')
    }, t('Takvim dosyası indirildi — telefonunuzun takvimine ekleyin', 'Calendar file downloaded'))

  return (
    <div>
      <PageHeader
        title={t('Hatırlatıcılar', 'Reminders')}
        subtitle={t('Doğum günleri, anma günleri ve yıl dönümleri', 'Birthdays, memorials and anniversaries')}
        actions={
          <Button variant="secondary" icon={<CalendarPlus size={17} />} onClick={downloadIcs} disabled={!all.length}>
            <span className="hidden sm:inline">{t('Takvime ekle', 'Add to calendar')}</span>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['birthday', 'memorial', 'wedding'] as Kind[]).map((k) => {
          const Icon = ICON[k]
          const n = thisMonth.filter((r) => r.kind === k).length
          return (
            <div key={k} className="card p-3">
              <div className={cx('mb-2 inline-flex rounded-xl p-2', COLOR[k])}>
                <Icon size={18} />
              </div>
              <div className="text-2xl font-bold tabular-nums">{n}</div>
              <div className="text-xs leading-tight text-slate-500">
                {monthName} · {k === 'birthday' ? t('doğum günü', 'birthdays') : k === 'memorial' ? t('anma', 'memorials') : t('yıl dönümü', 'anniversaries')}
              </div>
            </div>
          )
        })}
      </div>

      <Segmented
        className="mb-4"
        value={range}
        onChange={setRange}
        options={[
          { value: '30', label: t('30 gün', '30 days') },
          { value: '90', label: t('3 ay', '3 months') },
          { value: '365', label: t('1 yıl', '1 year') },
        ]}
      />

      {!list.length ? (
        <EmptyState
          icon={<BellRing size={40} />}
          title={t('Bu aralıkta hatırlatıcı yok', 'Nothing coming up')}
          text={all.length ? t('Daha uzun bir aralık seçin.', 'Try a longer range.') : t('Tam doğum ve vefat tarihleri (gün/ay/yıl) eklendiğinde burada görünür.', 'Full birth and death dates will appear here.')}
        />
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const Icon = ICON[r.kind]
            return (
              <li key={r.key}>
                <Link
                  to={`/kisi/${r.people[0].id}`}
                  className={cx('card flex items-center gap-3 p-3 transition hover:shadow-md', r.days === 0 && 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-900/20')}
                >
                  <div className="flex -space-x-3">
                    {r.people.map((p) => (
                      <Avatar key={p.id} person={p} size={44} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug font-medium">{label(r)}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Icon size={12} /> {formatDate(r.date, lang).replace(/\s\d{4}$/, '')}
                    </div>
                  </div>
                  <span className={cx('chip shrink-0', r.days === 0 ? 'bg-amber-400 text-amber-950' : r.days <= 7 ? COLOR[r.kind] : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                    {r.days === 0 && r.kind === 'birthday' ? '🎉 ' : ''}
                    {dayText(r.days)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
