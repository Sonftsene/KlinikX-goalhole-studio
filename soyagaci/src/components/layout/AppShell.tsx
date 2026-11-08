import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, GitFork, Home, List, Search, Shield, UserRound } from 'lucide-react'
import { useFamily } from '../../store/useFamily'
import { canManage } from '../../lib/permissions'
import { useT } from '../../lib/i18n'
import { cx } from '../ui'
import { Avatar } from '../person/Avatar'

export function AppShell() {
  const t = useT()
  const user = useFamily((s) => s.user)
  const mode = useFamily((s) => s.mode)
  const settings = useFamily((s) => s.data.settings)
  const notifications = useFamily((s) => s.data.notifications)
  const me = useFamily((s) => (s.user?.personId ? s.graph.persons.get(s.user.personId) : undefined))
  const pendingCount = useFamily(
    (s) =>
      s.data.changeRequests.filter((r) => r.status === 'pending').length +
      s.data.accessRequests.filter((r) => r.status === 'pending').length +
      s.data.users.filter((u) => u.status === 'pending').length,
  )
  const unread = notifications.filter((n) => n.userId === user?.id && !n.read).length
  const manager = canManage(user)
  const loc = useLocation()
  const nav = useNavigate()
  const fullBleed = loc.pathname.startsWith('/agac')

  const tabs = [
    { to: '/', icon: Home, label: t('Ana sayfa', 'Home'), end: true },
    { to: '/agac', icon: GitFork, label: t('Ağaç', 'Tree') },
    { to: '/liste', icon: List, label: t('Liste', 'List') },
    { to: '/ara', icon: Search, label: t('Ara', 'Search') },
    manager
      ? { to: '/admin', icon: Shield, label: t('Yönetim', 'Admin'), badge: pendingCount }
      : { to: '/hesap', icon: UserRound, label: t('Profil', 'Profile') },
  ]

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-9 w-9" alt="" />
          <div className="min-w-0">
            <div className="truncate font-bold">{settings.familyName || 'Soyağacı'}</div>
            <div className="text-xs text-slate-500">{t('Aile soyağacı', 'Family tree')}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {[
            ...tabs.slice(0, 4),
            { to: '/akrabalik', icon: UserRound, label: t('Akrabalık hesapla', 'Relationship') },
            { to: '/hatirlatici', icon: Bell, label: t('Hatırlatıcılar', 'Reminders') },
            ...(manager ? [tabs[4]] : []),
          ].map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={'end' in tab && tab.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <tab.icon size={19} />
              <span className="flex-1">{tab.label}</span>
              {'badge' in tab && !!tab.badge && <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">{tab.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => nav('/hesap')} className="m-3 flex items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
          <Avatar person={me} size={36} ring />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user?.displayName}</div>
            <div className="truncate text-xs text-slate-500">{user?.email}</div>
          </div>
        </button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-4 pt-[var(--safe-top)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex h-14 min-w-0 flex-1 items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} className="h-8 w-8" alt="" />
            <span className="truncate font-bold">{settings.familyName || 'Soyağacı'}</span>
          </div>
          <button onClick={() => nav('/bildirimler')} className="relative rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('Bildirimler', 'Notifications')}>
            <Bell size={21} />
            {!!unread && <span className="absolute top-1 right-1 h-4 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">{unread}</span>}
          </button>
          <button onClick={() => nav('/hesap')} aria-label={t('Hesabım', 'My account')}>
            <Avatar person={me} size={32} ring />
          </button>
        </header>
        {mode === 'demo' && (
          <div className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            {t('Demo modu: veriler yalnızca bu tarayıcıda saklanır.', 'Demo mode: data is stored only in this browser.')}
          </div>
        )}
        <main className={cx('min-h-0 flex-1', fullBleed ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}>
          {fullBleed ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-5xl px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-10">
              <Outlet />
            </div>
          )}
        </main>

        {/* Mobile tab bar */}
        <nav className="no-print pb-safe sticky bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 pt-1 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={'end' in tab && tab.end}
              className={({ isActive }) =>
                cx('relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium', isActive ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400')
              }
            >
              <tab.icon size={22} />
              {tab.label}
              {'badge' in tab && !!tab.badge && <span className="absolute top-0.5 right-[22%] h-4 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">{tab.badge}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
