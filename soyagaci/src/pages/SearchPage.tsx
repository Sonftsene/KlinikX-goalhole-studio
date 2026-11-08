import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Crosshair, GitFork, Search, X } from 'lucide-react'
import { useFamily, useVisiblePersons } from '../store/useFamily'
import { createPersonSearch } from '../lib/search'
import { PersonRow } from '../components/person/PersonRow'
import { Button, EmptyState, PageHeader, cx } from '../components/ui'
import { useT } from '../lib/i18n'
import { canManage } from '../lib/permissions'

type Filter = 'all' | 'living' | 'deceased' | 'male' | 'female'

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem('soyagaci-recent-search') || '[]')
  } catch {
    return []
  }
}

export default function SearchPage() {
  const t = useT()
  const nav = useNavigate()
  const user = useFamily((s) => s.user)
  const persons = useVisiblePersons()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const search = useMemo(() => createPersonSearch(persons), [persons])

  const results = (q.trim() ? search(q, 80) : []).filter((p) =>
    filter === 'all' ? true : filter === 'living' ? !p.isDeceased : filter === 'deceased' ? p.isDeceased : p.gender === filter,
  )

  const remember = (term: string) => {
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 8)
    setRecent(next)
    try {
      localStorage.setItem('soyagaci-recent-search', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const filters: { v: Filter; l: string }[] = [
    { v: 'all', l: t('Tümü', 'All') },
    { v: 'living', l: t('Hayatta', 'Living') },
    { v: 'deceased', l: t('Vefat', 'Deceased') },
    { v: 'male', l: t('Erkek', 'Male') },
    { v: 'female', l: t('Kadın', 'Female') },
  ]

  return (
    <div>
      <PageHeader title={t('Ara', 'Search')} subtitle={t(`${persons.length} kişi içinde`, `Among ${persons.length} people`)} />
      <div className="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 pb-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 dark:bg-slate-950/95">
        <div className="relative">
          <Search size={20} className="absolute top-3.5 left-3.5 text-slate-400" />
          <input
            autoFocus
            type="search"
            className="input h-12 rounded-2xl pr-10 pl-11 text-base"
            placeholder={t('İsim, soyisim, kızlık soyadı, lakap, yıl, şehir…', 'Name, maiden name, nickname, year, city…')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && q.trim() && remember(q.trim())}
          />
          {q && (
            <button className="absolute top-3 right-3 rounded-full p-1 text-slate-400" onClick={() => setQ('')} aria-label="Temizle">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={cx(
                'chip shrink-0 border px-3 py-1 text-sm',
                filter === f.v ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {!q.trim() ? (
        <div className="mt-4 space-y-5">
          {user?.personId && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" size="lg" icon={<Crosshair size={18} />} onClick={() => nav(`/kisi/${user.personId}`)}>
                {t('Beni bul', 'Find me')}
              </Button>
              <Button variant="secondary" size="lg" icon={<GitFork size={18} />} onClick={() => nav(`/agac?kisi=${user.personId}`)}>
                {t('Ağacımda göster', 'Show in tree')}
              </Button>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <h2 className="section-title">{t('Son aramalar', 'Recent searches')}</h2>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} className="chip bg-slate-200 px-3 py-1 text-sm dark:bg-slate-800" onClick={() => setQ(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm text-slate-500">
            {t('İpucu: Türkçe karakter yazmanıza gerek yok — "sukru" yazınca "Şükrü" de bulunur. Küçük yazım hataları da tolere edilir.', 'Tip: accents are optional and small typos are tolerated.')}
          </p>
        </div>
      ) : results.length ? (
        <div className="mt-3 space-y-1">
          <p className="mb-2 text-xs text-slate-500">{t(`${results.length} sonuç`, `${results.length} results`)}</p>
          {results.map((p) => (
            <div key={p.id} onClick={() => remember(q.trim())}>
              <PersonRow person={p} to={`/kisi/${p.id}`} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={36} />}
          title={t('Kimse bulunamadı', 'No one found')}
          text={
            canManage(user)
              ? t('Bu kişi henüz ağaçta yok. Hemen ekleyebilirsiniz.', 'This person is not in the tree yet.')
              : t('Aradığınız kişi görme izniniz olmayan bir dalda olabilir.', 'The person may be in a branch you cannot see yet.')
          }
          action={
            canManage(user) ? (
              <Link to="/yeni">
                <Button>{t('Yeni kişi ekle', 'Add person')}</Button>
              </Link>
            ) : (
              <Link to="/taleplerim">
                <Button variant="outline">{t('Erişim iste', 'Request access')}</Button>
              </Link>
            )
          }
        />
      )}
    </div>
  )
}
