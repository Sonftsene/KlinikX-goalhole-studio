import { useMemo, useState } from 'react'
import { ChevronDown, History } from 'lucide-react'
import type { AuditEntry } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { Button, EmptyState, PageHeader, cx } from '../../components/ui'
import { type TFn, actionLabel, auditSummary, fieldLabel, formatValue, isImageUrl, timeAgo, useUserName } from './shared'

const PAGE = 40

export default function AuditLog() {
  const t = useT()
  const audit = useFamily((s) => s.data.audit)
  const users = useFamily((s) => s.data.users)
  const userName = useUserName()
  const [entity, setEntity] = useState('all')
  const [userId, setUserId] = useState('all')
  const [limit, setLimit] = useState(PAGE)

  const entities: { value: string; label: string }[] = [
    { value: 'all', label: t('Tüm kayıtlar', 'All entries') },
    { value: 'person', label: t('Kişiler', 'Persons') },
    { value: 'relation', label: t('Bağlantılar', 'Relations') },
    { value: 'user', label: t('Kullanıcılar', 'Users') },
    { value: 'grant', label: t('Erişim izinleri', 'Grants') },
    { value: 'request', label: t('Talepler', 'Requests') },
    { value: 'invite', label: t('Davetler', 'Invites') },
    { value: 'settings', label: t('Ayarlar', 'Settings') },
    { value: 'import', label: t('İçe aktarma', 'Imports') },
  ]

  const list = useMemo(
    () =>
      [...audit]
        .filter((e) => entity === 'all' || e.entity === entity)
        .filter((e) => userId === 'all' || e.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [audit, entity, userId],
  )
  const actors = users.filter((u) => audit.some((e) => e.userId === u.id))

  return (
    <div>
      <PageHeader title={t('Değişiklik geçmişi', 'Change history')} subtitle={t('Kim, neyi, ne zaman değiştirdi', 'Who changed what, and when')} />
      <div className="mb-4 grid grid-cols-2 gap-2">
        <select className="input py-2 text-sm" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label={t('Tür', 'Type')}>
          {entities.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
        <select className="input py-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={t('Kullanıcı', 'User')}>
          <option value="all">{t('Tüm kullanıcılar', 'All users')}</option>
          {actors.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
      </div>
      {list.length ? (
        <>
          <ol className="relative space-y-2 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
            {list.slice(0, limit).map((e) => (
              <AuditItem key={e.id} entry={e} who={userName(e.userId)} />
            ))}
          </ol>
          {list.length > limit && (
            <Button variant="outline" className="mt-4 w-full" onClick={() => setLimit(limit + PAGE)}>
              {t(`Daha fazla göster (${list.length - limit})`, `Show more (${list.length - limit})`)}
            </Button>
          )}
        </>
      ) : (
        <EmptyState icon={<History size={40} />} title={t('Kayıt yok', 'No entries')} text={t('Yapılan her değişiklik burada kayıt altına alınır.', 'Every change is recorded here.')} />
      )}
    </div>
  )
}

function AuditItem({ entry, who }: { entry: AuditEntry; who: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const summary = auditSummary(entry)
  const color = entry.action.startsWith('delete') || entry.action.startsWith('reject') || entry.action.startsWith('revoke') || entry.action.startsWith('remove') ? 'bg-red-500' : entry.action.startsWith('create') || entry.action.startsWith('add') || entry.action.startsWith('approve') || entry.action.startsWith('grant') ? 'bg-emerald-500' : 'bg-brand-500'
  return (
    <li className="relative">
      <span className={cx('absolute top-4 -left-[23px] h-3 w-3 rounded-full ring-4 ring-slate-50 dark:ring-slate-950', color)} />
      <button onClick={() => setOpen(!open)} className="card flex w-full items-start gap-2 p-3 text-left">
        <div className="min-w-0 flex-1 text-sm">
          <div>
            <b>{who}</b> {actionLabel(entry.action, t).toLocaleLowerCase('tr')}
            {summary && <span className="text-slate-600 dark:text-slate-300">: {summary}</span>}
          </div>
          <div className="text-xs text-slate-500" title={new Date(entry.createdAt).toLocaleString('tr-TR')}>
            {timeAgo(entry.createdAt, t)} · {new Date(entry.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
        </div>
        {(entry.before !== undefined || entry.after !== undefined) && <ChevronDown size={16} className={cx('mt-1 shrink-0 text-slate-400 transition', open && 'rotate-180')} />}
      </button>
      {open && <AuditDiff entry={entry} t={t} />}
    </li>
  )
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function AuditDiff({ entry, t }: { entry: AuditEntry; t: TFn }) {
  const { before, after } = entry
  if (isPlain(before) && isPlain(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (k) => !['updatedAt', 'createdAt', 'updatedBy', 'id'].includes(k) && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
    )
    if (!keys.length) return <p className="mt-1 px-3 text-xs text-slate-500">{t('Görünür alan değişmedi.', 'No visible field changed.')}</p>
    return (
      <div className="mt-1 space-y-1.5 rounded-xl bg-slate-100/70 p-3 text-xs dark:bg-slate-900/70">
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-[90px_1fr] gap-2 sm:grid-cols-[130px_1fr_1fr]">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{fieldLabel(k, t)}</span>
            <Val k={k} v={before[k]} cls="text-red-700 line-through dark:text-red-300" t={t} />
            <Val k={k} v={after[k]} cls="col-start-2 text-emerald-700 sm:col-start-auto dark:text-emerald-300" t={t} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <pre className="mt-1 max-h-72 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
      {JSON.stringify({ [t('önce', 'before')]: truncate(before), [t('sonra', 'after')]: truncate(after) }, null, 2)}
    </pre>
  )
}

function Val({ k, v, cls, t }: { k: string; v: unknown; cls: string; t: TFn }) {
  if (k === 'photoUrl' && isImageUrl(v)) return <img src={v} alt="" className="h-12 w-12 rounded-lg object-cover" />
  return <span className={cx('break-words', cls)}>{formatValue(k, v, t)}</span>
}

/** Strip huge data URLs so the JSON view stays readable. */
function truncate(v: unknown): unknown {
  if (typeof v === 'string') return v.startsWith('data:') ? v.slice(0, 40) + '…' : v
  if (Array.isArray(v)) return v.map(truncate)
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, truncate(x)]))
  return v
}
