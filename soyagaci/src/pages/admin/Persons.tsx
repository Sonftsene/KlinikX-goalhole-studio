import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Merge, Pencil, Plus, Search, Trash2, UserX } from 'lucide-react'
import type { Person } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { Badge, Button, EmptyState, PageHeader, Segmented, attempt, confirmAction, cx, toast } from '../../components/ui'
import { Avatar } from '../../components/person/Avatar'
import { Legend } from '../../components/person/Legend'
import { displayName, lifeSpan, normalizeTr } from '../../lib/format'
import { parentIds } from '../../lib/graph'
import { findDuplicates } from '../../lib/duplicates'

type Sort = 'name' | 'surname' | 'birth' | 'updated'
type Gender = 'all' | 'male' | 'female'
type Life = 'all' | 'living' | 'deceased'
type Missing = 'none' | 'photo' | 'birth' | 'parents'

interface DupPair {
  a: Person
  b: Person
  score: number
  reasons: string[]
}

const dupes = (persons: Person[]): DupPair[] => findDuplicates(persons)

const DISMISS_KEY = 'soyagaci-dup-dismissed'

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}

export default function Persons() {
  const t = useT()
  const [view, setView] = useState<'list' | 'dups'>('list')
  const persons = useFamily((s) => s.data.persons)
  const dupCount = useMemo(() => {
    const dismissed = readDismissed()
    return dupes(persons).filter((d) => !dismissed.has([d.a.id, d.b.id].sort().join('|'))).length
  }, [persons])
  return (
    <div>
      <PageHeader
        title={t('Kişiler', 'Persons')}
        subtitle={t(`${persons.length} kişi kayıtlı`, `${persons.length} people`)}
        actions={
          <Link to="/yeni">
            <Button icon={<Plus size={18} />}>{t('Yeni kişi', 'New person')}</Button>
          </Link>
        }
      />
      <Segmented
        className="mb-4"
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: t('Tüm kişiler', 'All persons') },
          { value: 'dups', label: `${t('Mükerrer kayıtlar', 'Duplicates')}${dupCount ? ` (${dupCount})` : ''}` },
        ]}
      />
      {view === 'list' ? <PersonList persons={persons} /> : <Duplicates persons={persons} />}
    </div>
  )
}

function PersonList({ persons }: { persons: Person[] }) {
  const t = useT()
  const graph = useFamily((s) => s.graph)
  const deletePerson = useFamily((s) => s.deletePerson)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('surname')
  const [gender, setGender] = useState<Gender>('all')
  const [life, setLife] = useState<Life>('all')
  const [missing, setMissing] = useState<Missing>('none')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => {
    const nq = normalizeTr(q)
    const out = persons.filter((p) => {
      if (nq && !normalizeTr(`${p.firstName} ${p.lastName} ${p.maidenName ?? ''} ${p.nickname ?? ''} ${p.birthDate?.slice(0, 4) ?? ''}`).includes(nq)) return false
      if (gender !== 'all' && p.gender !== gender) return false
      if (life === 'living' && p.isDeceased) return false
      if (life === 'deceased' && !p.isDeceased) return false
      if (missing === 'photo' && p.photoUrl) return false
      if (missing === 'birth' && p.birthDate) return false
      if (missing === 'parents' && parentIds(graph, p.id).length) return false
      return true
    })
    const cmp: Record<Sort, (a: Person, b: Person) => number> = {
      name: (a, b) => a.firstName.localeCompare(b.firstName, 'tr'),
      surname: (a, b) => a.lastName.localeCompare(b.lastName, 'tr') || a.firstName.localeCompare(b.firstName, 'tr'),
      birth: (a, b) => (a.birthDate || '9999').localeCompare(b.birthDate || '9999'),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    }
    return out.sort(cmp[sort])
  }, [persons, q, sort, gender, life, missing, graph])

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allSelected = list.length > 0 && list.every((p) => selected.has(p.id))

  const bulkDelete = async () => {
    if (!confirmAction(t(`${selected.size} kişi ve tüm bağlantıları silinsin mi? Bu işlem geri alınamaz.`, `Delete ${selected.size} people and all their links? This cannot be undone.`))) return
    setBusy(true)
    let ok = 0
    for (const id of selected) if (await attempt(() => deletePerson(id))) ok++
    setBusy(false)
    setSelected(new Set())
    if (ok) toast.success(t(`${ok} kişi silindi`, `${ok} people deleted`))
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search size={18} className="absolute top-3 left-3 text-slate-400" />
        <input className="input pl-10" placeholder={t('İsim, soyisim, doğum yılı…', 'Name, surname, birth year…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <select className="input w-auto shrink-0 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('Sırala', 'Sort')}>
          <option value="surname">{t('Sırala: Soyad', 'Sort: Surname')}</option>
          <option value="name">{t('Sırala: Ad', 'Sort: First name')}</option>
          <option value="birth">{t('Sırala: Doğum', 'Sort: Birth')}</option>
          <option value="updated">{t('Sırala: Son güncellenen', 'Sort: Recently updated')}</option>
        </select>
        <select className="input w-auto shrink-0 py-2 text-sm" value={gender} onChange={(e) => setGender(e.target.value as Gender)} aria-label={t('Cinsiyet', 'Gender')}>
          <option value="all">{t('Tüm cinsiyetler', 'All genders')}</option>
          <option value="male">{t('Erkek', 'Male')}</option>
          <option value="female">{t('Kadın', 'Female')}</option>
        </select>
        <select className="input w-auto shrink-0 py-2 text-sm" value={life} onChange={(e) => setLife(e.target.value as Life)} aria-label={t('Durum', 'Status')}>
          <option value="all">{t('Hayatta + vefat', 'Living + deceased')}</option>
          <option value="living">{t('Hayatta', 'Living')}</option>
          <option value="deceased">{t('Vefat etmiş', 'Deceased')}</option>
        </select>
        <select className="input w-auto shrink-0 py-2 text-sm" value={missing} onChange={(e) => setMissing(e.target.value as Missing)} aria-label={t('Eksik bilgi', 'Missing info')}>
          <option value="none">{t('Eksik bilgi: hepsi', 'Missing: any')}</option>
          <option value="photo">{t('Fotoğrafı yok', 'No photo')}</option>
          <option value="birth">{t('Doğum tarihi yok', 'No birth date')}</option>
          <option value="parents">{t('Ebeveyni yok', 'No parents')}</option>
        </select>
      </div>
      <Legend compact className="mb-3" />

      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((p) => p.id)))} />
          {t(`${list.length} sonuç`, `${list.length} results`)}
        </label>
        {selected.size > 0 && (
          <Button size="sm" variant="danger" icon={<Trash2 size={15} />} loading={busy} onClick={bulkDelete}>
            {t(`Seçilenleri sil (${selected.size})`, `Delete selected (${selected.size})`)}
          </Button>
        )}
      </div>

      {list.length ? (
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
          {/* Desktop header */}
          <div className="hidden grid-cols-[28px_1fr_120px_160px_140px_80px] items-center gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 uppercase md:grid dark:bg-slate-800/50">
            <span />
            <span>{t('Kişi', 'Person')}</span>
            <span>{t('Yaşam', 'Life')}</span>
            <span>{t('Doğum yeri', 'Birth place')}</span>
            <span>{t('Meslek', 'Occupation')}</span>
            <span />
          </div>
          {list.map((p) => {
            const noParents = !parentIds(graph, p.id).length
            return (
              <div key={p.id} className={cx('grid grid-cols-[28px_1fr_auto] items-center gap-3 px-3 py-2.5 md:grid-cols-[28px_1fr_120px_160px_140px_80px]', selected.has(p.id) && 'bg-brand-50/60 dark:bg-brand-900/20')}>
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={displayName(p)} />
                <Link to={`/kisi/${p.id}`} className="flex min-w-0 items-center gap-3">
                  <Avatar person={p} size={38} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{displayName(p)}</div>
                    <div className="flex flex-wrap gap-1 md:hidden">
                      <span className="text-xs text-slate-500">{lifeSpan(p)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {!p.photoUrl && <Badge>{t('foto yok', 'no photo')}</Badge>}
                      {!p.birthDate && <Badge color="amber">{t('tarih yok', 'no date')}</Badge>}
                      {noParents && <Badge color="slate">{t('ebeveyn yok', 'no parents')}</Badge>}
                    </div>
                  </div>
                </Link>
                <span className="hidden text-sm text-slate-600 md:block dark:text-slate-300">{lifeSpan(p) || '—'}</span>
                <span className="hidden truncate text-sm text-slate-600 md:block dark:text-slate-300">{p.birthPlace || '—'}</span>
                <span className="hidden truncate text-sm text-slate-600 md:block dark:text-slate-300">{p.occupation || '—'}</span>
                <Link to={`/kisi/${p.id}/duzenle`} className="justify-self-end rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('Düzenle', 'Edit')}>
                  <Pencil size={17} />
                </Link>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={<UserX size={40} />} title={t('Eşleşen kişi yok', 'No matching people')} />
      )}
    </div>
  )
}

function Duplicates({ persons }: { persons: Person[] }) {
  const t = useT()
  const mergePersons = useFamily((s) => s.mergePersons)
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed)
  const [busy, setBusy] = useState<string | null>(null)
  const pairs = useMemo(() => dupes(persons).filter((d) => !dismissed.has([d.a.id, d.b.id].sort().join('|'))), [persons, dismissed])

  const dismiss = (a: string, b: string) => {
    const next = new Set(dismissed)
    next.add([a, b].sort().join('|'))
    setDismissed(next)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  }

  const merge = async (keep: Person, drop: Person) => {
    if (!confirmAction(t(`"${displayName(drop)}" kaydı "${displayName(keep)}" ile birleştirilsin mi? Boş alanlar, fotoğraflar ve bağlantılar aktarılır.`, `Merge "${displayName(drop)}" into "${displayName(keep)}"? Empty fields, photos and links are transferred.`))) return
    setBusy(keep.id + drop.id)
    await attempt(() => mergePersons(keep.id, drop.id), t('Kayıtlar birleştirildi', 'Records merged'))
    setBusy(null)
  }

  if (!pairs.length)
    return <EmptyState icon={<Copy size={40} />} title={t('Mükerrer kayıt bulunamadı', 'No duplicates found')} text={t('Benzer isim ve tarihlere sahip kayıtlar burada listelenir.', 'Records with similar names and dates appear here.')} />

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t('Aynı kişi iki kez eklenmiş olabilir. Hangisini korumak istediğinizi seçin.', 'The same person may have been added twice. Choose which record to keep.')}</p>
      {pairs.map(({ a, b, score, reasons }) => {
        const pct = Math.round(score > 1 ? score : score * 100)
        return (
        <article key={a.id + b.id} className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge color={pct >= 80 ? 'red' : 'amber'}>{t(`Benzerlik %${pct}`, `Similarity ${pct}%`)}</Badge>
            {reasons.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [a, b],
              [b, a],
            ].map(([keep, drop]) => (
              <div key={keep.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <Link to={`/kisi/${keep.id}`} className="flex items-center gap-3">
                  <Avatar person={keep} size={44} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{displayName(keep)}</div>
                    <div className="truncate text-xs text-slate-500">{[lifeSpan(keep), keep.birthPlace].filter(Boolean).join(' · ')}</div>
                  </div>
                </Link>
                <Button size="sm" variant="outline" className="mt-3 w-full" icon={<Merge size={15} />} loading={busy === keep.id + drop.id} onClick={() => merge(keep, drop)}>
                  {t('Bunu koru, diğerini birleştir', 'Keep this, merge other')}
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => dismiss(a.id, b.id)}>
            {t('Farklı kişiler, gösterme', 'Different people, hide')}
          </Button>
        </article>
        )
      })}
    </div>
  )
}
