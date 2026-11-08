import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useFamily } from '../store/useFamily'
import { EmptyState, PageHeader, cx } from '../components/ui'
import { useT } from '../lib/i18n'

function ago(iso: string, en: boolean) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return en ? 'now' : 'şimdi'
  if (m < 60) return en ? `${m} min ago` : `${m} dk önce`
  const h = Math.round(m / 60)
  if (h < 24) return en ? `${h} h ago` : `${h} sa önce`
  const d = Math.round(h / 24)
  return en ? `${d} d ago` : `${d} gün önce`
}

export default function NotificationsPage() {
  const t = useT()
  const en = t('tr', 'en') === 'en'
  const user = useFamily((s) => s.user)
  const all = useFamily((s) => s.data.notifications)
  const markRead = useFamily((s) => s.markNotificationsRead)
  const list = all.filter((n) => n.userId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const unreadIds = new Set(list.filter((n) => !n.read).map((n) => n.id))

  useEffect(() => {
    // Mark as read shortly after opening so the unread dots are still visible.
    const id = setTimeout(() => void markRead(), 1500)
    return () => clearTimeout(id)
  }, [markRead])

  return (
    <div>
      <PageHeader title={t('Bildirimler', 'Notifications')} />
      {list.length ? (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((n) => {
            const body = (
              <div className={cx('flex gap-3 p-4', unreadIds.has(n.id) && 'bg-brand-50/60 dark:bg-brand-900/20')}>
                <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', unreadIds.has(n.id) ? 'bg-brand-600' : 'bg-transparent')} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="text-sm text-slate-600 dark:text-slate-300">{n.body}</div>}
                  <div className="mt-1 text-xs text-slate-400">{ago(n.createdAt, en)}</div>
                </div>
              </div>
            )
            return n.link ? (
              <Link key={n.id} to={n.link} className="block hover:bg-slate-50 dark:hover:bg-slate-800/50">
                {body}
              </Link>
            ) : (
              <div key={n.id}>{body}</div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={<Bell size={36} />} title={t('Bildirim yok', 'No notifications')} text={t('Onaylar ve aile güncellemeleri burada görünür.', 'Approvals and family updates appear here.')} />
      )}
    </div>
  )
}
