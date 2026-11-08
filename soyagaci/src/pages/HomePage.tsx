import { Link } from 'react-router-dom'
import { BarChart3, CalendarHeart, Clock3, GitFork, Inbox, List, Map, Search, Shield, Users } from 'lucide-react'
import { useFamily, useVisiblePersons } from '../store/useFamily'
import { canManage } from '../lib/permissions'
import { useT } from '../lib/i18n'
import { Avatar } from '../components/person/Avatar'
import { PersonRow } from '../components/person/PersonRow'
import { Badge, Button } from '../components/ui'
import { ageOf, daysUntilAnniversary, displayName, lifeSpan } from '../lib/format'
import { ancestorIds, descendantIds } from '../lib/graph'

export default function HomePage() {
  const t = useT()
  const user = useFamily((s) => s.user)
  const graph = useFamily((s) => s.graph)
  const settings = useFamily((s) => s.data.settings)
  const data = useFamily((s) => s.data)
  const persons = useVisiblePersons()
  const me = user?.personId ? graph.persons.get(user.personId) : undefined
  const manager = canManage(user)

  const hour = new Date().getHours()
  const greet = hour < 12 ? t('Günaydın', 'Good morning') : hour < 18 ? t('İyi günler', 'Good afternoon') : t('İyi akşamlar', 'Good evening')

  const upcoming = persons
    .map((p) => ({ p, days: daysUntilAnniversary(p.isDeceased ? p.deathDate : p.birthDate), kind: p.isDeceased ? 'anma' : 'dogum' }))
    .filter((x) => x.days !== undefined && x.days <= 30)
    .sort((a, b) => a.days! - b.days!)
    .slice(0, 4)

  const pending =
    data.changeRequests.filter((r) => r.status === 'pending').length +
    data.accessRequests.filter((r) => r.status === 'pending').length +
    data.users.filter((u) => u.status === 'pending').length

  const recent = [...persons].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  const living = persons.filter((p) => !p.isDeceased).length

  const actions = [
    { to: '/agac', icon: GitFork, label: t('Soyağacım', 'My tree'), color: 'bg-brand-600' },
    { to: '/liste', icon: List, label: t('Liste', 'List'), color: 'bg-sky-600' },
    { to: '/ara', icon: Search, label: t('Kendini bul', 'Find me'), color: 'bg-violet-600' },
    { to: '/akrabalik', icon: Users, label: t('Akrabalık', 'Kinship'), color: 'bg-pink-600' },
    { to: '/zaman', icon: Clock3, label: t('Zaman çizelgesi', 'Timeline'), color: 'bg-amber-600' },
    { to: '/harita', icon: Map, label: t('Harita', 'Map'), color: 'bg-emerald-600' },
    { to: '/hatirlatici', icon: CalendarHeart, label: t('Hatırlatıcı', 'Reminders'), color: 'bg-rose-600' },
    { to: '/istatistik', icon: BarChart3, label: t('İstatistik', 'Statistics'), color: 'bg-indigo-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white shadow-lg">
        <p className="text-sm text-brand-100">{greet},</p>
        <h1 className="text-2xl font-bold">{user?.displayName}</h1>
        {settings.welcomeText && <p className="mt-1 text-sm text-brand-100">{settings.welcomeText}</p>}
        {me ? (
          <Link to={`/kisi/${me.id}`} className="mt-4 flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur transition hover:bg-white/20">
            <Avatar person={me} size={56} ring />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{displayName(me)}</div>
              <div className="text-xs text-brand-100">
                {lifeSpan(me)} · {ancestorIds(graph, me.id).size} {t('ata', 'ancestors')} · {descendantIds(graph, me.id).size} {t('torun/çocuk', 'descendants')}
              </div>
            </div>
            <Badge color="amber">{t('Profilim', 'My profile')}</Badge>
          </Link>
        ) : (
          <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm">
            {manager
              ? t('Hesabınız henüz ağaçtaki bir kişiyle eşleşmedi. Hesap sayfasından kendinizi seçebilirsiniz.', 'Your account is not linked to a person yet. Choose yourself on the account page.')
              : t('Hesabınız henüz ağaçtaki kişinizle eşleştirilmedi. Yönetici eşleştirince kendi soyağacınızı göreceksiniz.', 'Your account is not linked yet. The admin will link you soon.')}
            {manager && (
              <Link to="/hesap" className="mt-2 block font-semibold underline">
                {t('Kendimi seç', 'Choose myself')}
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Manager notice */}
      {manager && pending > 0 && (
        <Link to="/admin/onaylar" className="card flex items-center gap-3 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <Inbox className="text-amber-600" />
          <div className="flex-1">
            <div className="font-semibold">{t(`${pending} onay bekleyen işlem`, `${pending} items waiting for approval`)}</div>
            <div className="text-xs text-slate-500">{t('Kayıtlar, değişiklikler ve erişim talepleri', 'Sign-ups, changes and access requests')}</div>
          </div>
          <Shield size={18} className="text-amber-600" />
        </Link>
      )}

      {/* Quick actions */}
      <section>
        <h2 className="section-title">{t('Hızlı erişim', 'Quick access')}</h2>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition hover:bg-slate-100 dark:hover:bg-slate-800">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow ${a.color}`}>
                <a.icon size={22} />
              </span>
              <span className="text-[11px] leading-tight font-medium sm:text-xs">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats strip */}
      <section className="grid grid-cols-3 gap-3">
        {[
          { v: persons.length, l: t('Kişi', 'People') },
          { v: living, l: t('Hayatta', 'Living') },
          { v: persons.length - living, l: t('Rahmetli', 'Deceased') },
        ].map((s) => (
          <div key={s.l} className="card p-3 text-center">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-300">{s.v}</div>
            <div className="text-xs text-slate-500">{s.l}</div>
          </div>
        ))}
      </section>

      {/* Upcoming */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title mb-0">{t('Yaklaşan günler', 'Coming up')}</h2>
          <Link to="/hatirlatici" className="text-sm text-brand-700 dark:text-brand-300">
            {t('Tümü', 'All')}
          </Link>
        </div>
        <div className="card divide-y divide-slate-100 p-1 dark:divide-slate-800">
          {upcoming.length ? (
            upcoming.map(({ p, days, kind }) => (
              <PersonRow
                key={p.id}
                person={p}
                to={`/kisi/${p.id}`}
                subtitle={
                  kind === 'dogum'
                    ? `🎂 ${t('Doğum günü', 'Birthday')} · ${(ageOf(p) ?? 0) + (days === 0 ? 0 : 1)} ${t('yaş', 'yrs')}`
                    : `🕊 ${t('Anma günü', 'Remembrance')}`
                }
                right={<Badge color={days === 0 ? 'red' : 'slate'}>{days === 0 ? t('Bugün', 'Today') : `${days} ${t('gün', 'd')}`}</Badge>}
              />
            ))
          ) : (
            <p className="p-4 text-center text-sm text-slate-500">{t('Önümüzdeki 30 günde özel gün yok.', 'Nothing in the next 30 days.')}</p>
          )}
        </div>
      </section>

      {/* Recently updated */}
      {recent.length > 0 && (
        <section>
          <h2 className="section-title">{t('Son güncellenenler', 'Recently updated')}</h2>
          <div className="card divide-y divide-slate-100 p-1 dark:divide-slate-800">
            {recent.map((p) => (
              <PersonRow key={p.id} person={p} to={`/kisi/${p.id}`} />
            ))}
          </div>
        </section>
      )}

      {!manager && (
        <Link to="/taleplerim">
          <Button variant="outline" className="w-full">
            {t('Diğer akrabaları görmek için erişim iste', 'Request access to other relatives')}
          </Button>
        </Link>
      )}
    </div>
  )
}
