import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ClipboardList, GitFork, History, Inbox, Layers, Settings2, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { PageHeader } from '../../components/ui'
import { parentIds } from '../../lib/graph'
import { StatCard, actionLabel, auditSummary, changeKindLabel, timeAgo, usePersonName, useUserName } from './shared'

export default function Overview() {
  const t = useT()
  const data = useFamily((s) => s.data)
  const graph = useFamily((s) => s.graph)
  const userName = useUserName()
  const personName = usePersonName()

  const generations = useMemo(() => {
    const memo = new Map<string, number>()
    const depth = (id: string, stack: Set<string>): number => {
      if (memo.has(id)) return memo.get(id)!
      if (stack.has(id)) return 1
      stack.add(id)
      const ps = parentIds(graph, id)
      const d = 1 + (ps.length ? Math.max(...ps.map((p) => depth(p, stack))) : 0)
      stack.delete(id)
      memo.set(id, d)
      return d
    }
    let max = 0
    for (const id of graph.persons.keys()) max = Math.max(max, depth(id, new Set()))
    return max
  }, [graph])

  const pendingChanges = data.changeRequests.filter((r) => r.status === 'pending')
  const pendingAccess = data.accessRequests.filter((r) => r.status === 'pending')
  const pendingUsers = data.users.filter((u) => u.status === 'pending')
  const pendingTotal = pendingChanges.length + pendingAccess.length + pendingUsers.length
  const living = data.persons.filter((p) => !p.isDeceased).length
  const recent = [...data.audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)

  const quick = [
    { to: '/admin/onaylar', icon: Inbox, label: t('Onay kuyruğu', 'Approval queue') },
    { to: '/admin/kullanicilar', icon: UsersIcon, label: t('Kullanıcılar', 'Users') },
    { to: '/yeni', icon: UserPlus, label: t('Yeni kişi ekle', 'Add person') },
    { to: '/admin/davetler', icon: ClipboardList, label: t('Davet oluştur', 'Create invite') },
    { to: '/admin/gecmis', icon: History, label: t('Değişiklik geçmişi', 'Change history') },
    { to: '/admin/ayarlar', icon: Settings2, label: t('Aile ayarları', 'Family settings') },
  ]

  return (
    <div>
      <PageHeader title={t('Yönetim paneli', 'Admin panel')} subtitle={data.settings.familyName} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t(`Kişi (${living} hayatta)`, `People (${living} living)`)} value={data.persons.length} icon={<GitFork size={22} />} />
        <StatCard label={t('Kullanıcı', 'Users')} value={data.users.length} icon={<UsersIcon size={22} />} tone="blue" />
        <StatCard label={t('Bekleyen onay', 'Pending')} value={pendingTotal} icon={<Inbox size={22} />} tone="amber" />
        <StatCard label={t('Nesil', 'Generations')} value={generations} icon={<Layers size={22} />} tone="pink" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t('Bekleyenler', 'Pending items')}</h2>
            <Link to="/admin/onaylar" className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {t('Tümü', 'All')} →
            </Link>
          </div>
          {pendingTotal === 0 ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <CheckCircle2 size={18} className="text-emerald-500" /> {t('Bekleyen iş yok. Her şey güncel!', 'Nothing pending. All caught up!')}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingUsers.slice(0, 3).map((u) => (
                <li key={u.id}>
                  <Link to="/admin/kullanicilar" className="flex items-center gap-3 py-2.5">
                    <span className="chip bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">{t('Üyelik', 'Signup')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{u.displayName} · {u.email}</span>
                    <ArrowRight size={16} className="text-slate-400" />
                  </Link>
                </li>
              ))}
              {pendingChanges.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <Link to="/admin/onaylar" className="flex items-center gap-3 py-2.5">
                    <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{changeKindLabel(r.kind, t)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {userName(r.userId)} → {r.kind === 'create_person' ? String((r.payload.person as { firstName?: string })?.firstName ?? '') : personName(r.personId)}
                    </span>
                    <ArrowRight size={16} className="text-slate-400" />
                  </Link>
                </li>
              ))}
              {pendingAccess.slice(0, 3).map((r) => (
                <li key={r.id}>
                  <Link to="/admin/onaylar?sekme=erisim" className="flex items-center gap-3 py-2.5">
                    <span className="chip bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">{t('Erişim', 'Access')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {userName(r.userId)} → {r.scope === 'all' ? t('Tüm ağaç', 'Whole tree') : personName(r.personId)}
                    </span>
                    <ArrowRight size={16} className="text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t('Son hareketler', 'Recent activity')}</h2>
            <Link to="/admin/gecmis" className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {t('Tümü', 'All')} →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">{t('Henüz kayıt yok.', 'No activity yet.')}</p>
          ) : (
            <ul className="space-y-2.5">
              {recent.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{userName(e.userId)}</span> {actionLabel(e.action, t).toLocaleLowerCase('tr')}
                    {auditSummary(e) && <span className="text-slate-600 dark:text-slate-300">: {auditSummary(e)}</span>}
                    <div className="text-xs text-slate-500">{timeAgo(e.createdAt, t)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="section-title">{t('Hızlı erişim', 'Quick links')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {quick.map((q) => (
            <Link key={q.to} to={q.to} className="card flex items-center gap-3 p-4 transition hover:border-brand-400">
              <q.icon size={20} className="text-brand-700 dark:text-brand-300" />
              <span className="text-sm font-medium">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
