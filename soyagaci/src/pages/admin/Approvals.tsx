import { type ReactNode, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, Check, Inbox, ShieldCheck, Trash2, X } from 'lucide-react'
import type { AccessRequest, ChangeRequest, Person, Relation } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { Badge, Button, EmptyState, PageHeader, Segmented, attempt, cx } from '../../components/ui'
import { PersonRow } from '../../components/person/PersonRow'
import { Avatar } from '../../components/person/Avatar'
import { displayName, formatDate, lifeSpan } from '../../lib/format'
import { type TFn, changeKindLabel, fieldLabel, formatValue, isImageUrl, timeAgo, usePersonName, useUserName } from './shared'

type Tab = 'degisiklik' | 'erisim' | 'gecmis'

export default function Approvals() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('sekme') as Tab) || 'degisiklik'
  const changes = useFamily((s) => s.data.changeRequests)
  const access = useFamily((s) => s.data.accessRequests)
  const pendingChanges = changes.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const pendingAccess = access.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <div>
      <PageHeader title={t('Onay kuyruğu', 'Approval queue')} subtitle={t('Üyelerin gönderdiği değişiklik ve erişim talepleri', 'Change and access requests from members')} />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => setParams(v === 'degisiklik' ? {} : { sekme: v }, { replace: true })}
        options={[
          { value: 'degisiklik', label: `${t('Değişiklikler', 'Changes')} (${pendingChanges.length})` },
          { value: 'erisim', label: `${t('Erişim', 'Access')} (${pendingAccess.length})` },
          { value: 'gecmis', label: t('Geçmiş', 'History') },
        ]}
      />
      {tab === 'degisiklik' &&
        (pendingChanges.length ? (
          <div className="space-y-4">
            {pendingChanges.map((r) => (
              <ChangeCard key={r.id} req={r} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Inbox size={40} />} title={t('Bekleyen değişiklik yok', 'No pending changes')} text={t('Üyeler bir bilgiyi düzenlediğinde burada görünür.', 'Edits from members will appear here.')} />
        ))}
      {tab === 'erisim' &&
        (pendingAccess.length ? (
          <div className="space-y-4">
            {pendingAccess.map((r) => (
              <AccessCard key={r.id} req={r} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<ShieldCheck size={40} />} title={t('Bekleyen erişim talebi yok', 'No pending access requests')} />
        ))}
      {tab === 'gecmis' && <History changes={changes} access={access} />}
    </div>
  )
}

function Requester({ userId, createdAt }: { userId: string; createdAt: string }) {
  const t = useT()
  const user = useFamily((s) => s.data.users.find((u) => u.id === userId))
  const person = useFamily((s) => (user?.personId ? s.graph.persons.get(user.personId) : undefined))
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar person={person} size={34} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{user?.displayName ?? t('Silinmiş kullanıcı', 'Deleted user')}</div>
        <div className="truncate text-xs text-slate-500">
          {user?.email} · {timeAgo(createdAt, t)}
        </div>
      </div>
    </div>
  )
}

function ReviewBar({ onApprove, onReject, approveLabel, extra }: { onApprove: (note: string) => Promise<void>; onReject: (note: string) => Promise<void>; approveLabel?: string; extra?: ReactNode }) {
  const t = useT()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'a' | 'r' | null>(null)
  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      {extra}
      <input className="input" placeholder={t('Not (isteğe bağlı) — talep sahibine iletilir', 'Note (optional) — sent to requester')} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 text-red-600 dark:text-red-400"
          icon={<X size={18} />}
          loading={busy === 'r'}
          disabled={!!busy}
          onClick={async () => {
            setBusy('r')
            await onReject(note)
            setBusy(null)
          }}
        >
          {t('Reddet', 'Reject')}
        </Button>
        <Button
          className="flex-1"
          icon={<Check size={18} />}
          loading={busy === 'a'}
          disabled={!!busy}
          onClick={async () => {
            setBusy('a')
            await onApprove(note)
            setBusy(null)
          }}
        >
          {approveLabel ?? t('Onayla', 'Approve')}
        </Button>
      </div>
    </div>
  )
}

function ChangeCard({ req }: { req: ChangeRequest }) {
  const t = useT()
  const reviewChange = useFamily((s) => s.reviewChange)
  const target = useFamily((s) => (req.personId ? s.graph.persons.get(req.personId) : undefined))
  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <Requester userId={req.userId} createdAt={req.createdAt} />
        <span className="shrink-0 whitespace-nowrap">
          <Badge color={req.kind === 'delete_person' || req.kind === 'remove_relation' ? 'red' : 'amber'}>{changeKindLabel(req.kind, t)}</Badge>
        </span>
      </div>
      {req.message && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 italic dark:bg-slate-800/60 dark:text-slate-200">“{req.message}”</p>}
      {target && req.kind !== 'create_person' && (
        <div className="mt-3">
          <PersonRow person={target} to={`/kisi/${target.id}`} />
        </div>
      )}
      {!target && req.personId && req.kind !== 'create_person' && <p className="mt-3 text-sm text-red-600">{t('Hedef kişi artık mevcut değil.', 'Target person no longer exists.')}</p>}
      <div className="mt-3">
        <ChangeBody req={req} t={t} />
      </div>
      <ReviewBar
        onApprove={async (note) => {
          await attempt(() => reviewChange(req.id, true, note || undefined), t('Değişiklik uygulandı', 'Change applied'))
        }}
        onReject={async (note) => {
          await attempt(() => reviewChange(req.id, false, note || undefined), t('Talep reddedildi', 'Request rejected'))
        }}
      />
    </article>
  )
}

function DiffRow({ field, before, after, t }: { field: string; before: unknown; after: unknown; t: TFn }) {
  const imgs = field === 'photoUrl' && (isImageUrl(before) || isImageUrl(after))
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{fieldLabel(field, t)}</div>
      {imgs ? (
        <div className="flex items-center gap-3">
          <PhotoBox url={before} label={t('Eski', 'Old')} />
          <span className="text-slate-400">→</span>
          <PhotoBox url={after} label={t('Yeni', 'New')} highlight />
        </div>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
          <div className="rounded-lg bg-red-50 px-2.5 py-1.5 text-sm break-words text-red-800 line-through decoration-red-400/60 dark:bg-red-950/40 dark:text-red-200">
            {formatValue(field, before, t)}
          </div>
          <ArrowDown size={14} className="mx-auto text-slate-400 sm:hidden" />
          <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-medium break-words text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {formatValue(field, after, t)}
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoBox({ url, label, highlight }: { url: unknown; label: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      {isImageUrl(url) ? (
        <img src={url} alt="" className={cx('h-24 w-24 rounded-2xl object-cover', highlight && 'ring-4 ring-emerald-400')} />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 text-xs text-slate-400 dark:bg-slate-800">—</div>
      )}
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  )
}

function RelationText({ rel }: { rel?: Relation }) {
  const t = useT()
  const name = usePersonName()
  if (!rel) return <span>—</span>
  if (rel.kind === 'parent')
    return (
      <span>
        <b>{name(rel.parentId)}</b> → <b>{name(rel.childId)}</b> {t('kişisinin ebeveyni', "'s parent")} ({rel.type})
      </span>
    )
  return (
    <span>
      <b>{name(rel.aId)}</b> ♥ <b>{name(rel.bId)}</b> ({rel.type})
    </span>
  )
}

function ChangeBody({ req, t }: { req: ChangeRequest; t: TFn }) {
  const target = useFamily((s) => (req.personId ? s.graph.persons.get(req.personId) : undefined))
  const name = usePersonName()
  const p = req.payload as Record<string, unknown>
  switch (req.kind) {
    case 'update_person': {
      const before = req.before ?? {}
      const keys = Object.keys(p)
      return (
        <div className="space-y-2">
          {keys.map((k) => (
            <DiffRow key={k} field={k} before={k in before ? before[k] : (target as unknown as Record<string, unknown> | undefined)?.[k]} after={p[k]} t={t} />
          ))}
        </div>
      )
    }
    case 'set_photo':
    case 'add_photo': {
      const photo = p.photo as { url?: string; caption?: string } | undefined
      return (
        <div className="flex items-center gap-3">
          {req.kind === 'set_photo' && (
            <>
              <PhotoBox url={req.before?.photoUrl ?? target?.photoUrl} label={t('Mevcut', 'Current')} />
              <span className="text-slate-400">→</span>
            </>
          )}
          <PhotoBox url={photo?.url} label={photo?.caption || t('Yeni fotoğraf', 'New photo')} highlight />
        </div>
      )
    }
    case 'create_person': {
      const person = p.person as Person | undefined
      const attach = p.attach as { to?: string; as?: string } | undefined
      const asLabel: Record<string, string> = {
        child: t('çocuğu', 'child'),
        parent: t('ebeveyni', 'parent'),
        partner: t('eşi', 'partner'),
        sibling: t('kardeşi', 'sibling'),
      }
      if (!person) return null
      const rows: [string, unknown][] = [
        ['gender', person.gender],
        ['birthDate', person.birthDate],
        ['birthPlace', person.birthPlace],
        ['isDeceased', person.isDeceased],
        ['deathDate', person.deathDate],
        ['occupation', person.occupation],
        ['residence', person.residence],
      ]
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <Avatar person={person} size={48} />
            <div>
              <div className="font-semibold">{displayName(person)}</div>
              <div className="text-xs text-slate-500">{lifeSpan(person)}</div>
            </div>
          </div>
          {attach?.to && (
            <p className="mt-2 text-sm">
              {t('Bağlantı:', 'Link:')} <b>{name(attach.to)}</b> {t('kişisinin', '—')} {asLabel[attach.as ?? ''] ?? attach.as}
            </p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {rows
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-slate-500">{fieldLabel(k, t)}</dt>
                  <dd className="truncate">{formatValue(k, v, t)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )
    }
    case 'delete_person':
      return (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <Trash2 size={18} />
          {t('Bu kişi ve tüm bağlantıları silinecek.', 'This person and all their links will be deleted.')}
        </div>
      )
    case 'add_relation':
      return (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
          + <RelationText rel={p.relation as Relation} />
        </p>
      )
    case 'remove_relation':
      return (
        <p className="rounded-xl bg-red-50 p-3 text-sm dark:bg-red-950/30">
          − <RelationText rel={(req.before?.relation as Relation) ?? undefined} />
        </p>
      )
    default:
      return <pre className="overflow-x-auto text-xs">{JSON.stringify(p, null, 2)}</pre>
  }
}

function AccessCard({ req }: { req: AccessRequest }) {
  const t = useT()
  const reviewAccess = useFamily((s) => s.reviewAccess)
  const person = useFamily((s) => (req.personId ? s.graph.persons.get(req.personId) : undefined))
  const [expires, setExpires] = useState('')
  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <Requester userId={req.userId} createdAt={req.createdAt} />
        <span className="shrink-0 whitespace-nowrap"><Badge color="brand">{req.scope === 'all' ? t('Tüm ağaç', 'Whole tree') : t('Dal erişimi', 'Branch access')}</Badge></span>
      </div>
      {req.message && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm italic dark:bg-slate-800/60">“{req.message}”</p>}
      {req.scope === 'branch' && person && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">{t('Görmek istediği dal (üst/alt soy ve kardeş aileleri):', 'Requested branch (ancestors, descendants and sibling families):')}</p>
          <PersonRow person={person} to={`/kisi/${person.id}`} />
        </div>
      )}
      {req.scope === 'all' && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t('Tüm soyağacını görmek istiyor.', 'Wants to see the entire tree.')}</p>}
      <ReviewBar
        extra={
          <label className="block">
            <span className="label">{t('Erişim bitiş tarihi (boş = süresiz)', 'Expiry date (empty = no expiry)')}</span>
            <input type="date" className="input" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
        }
        onApprove={async (note) => {
          await attempt(
            () => reviewAccess(req.id, true, note || undefined, expires ? new Date(expires + 'T23:59:59').toISOString() : undefined),
            t('Erişim verildi', 'Access granted'),
          )
        }}
        onReject={async (note) => {
          await attempt(() => reviewAccess(req.id, false, note || undefined), t('Talep reddedildi', 'Request rejected'))
        }}
      />
    </article>
  )
}

function History({ changes, access }: { changes: ChangeRequest[]; access: AccessRequest[] }) {
  const t = useT()
  const userName = useUserName()
  const personName = usePersonName()
  const items = [
    ...changes.filter((r) => r.status !== 'pending').map((r) => ({ type: 'change' as const, r })),
    ...access.filter((r) => r.status !== 'pending').map((r) => ({ type: 'access' as const, r })),
  ].sort((a, b) => (b.r.reviewedAt ?? b.r.createdAt).localeCompare(a.r.reviewedAt ?? a.r.createdAt))
  if (!items.length) return <EmptyState title={t('Henüz sonuçlanan talep yok', 'No resolved requests yet')} />
  return (
    <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
      {items.map(({ type, r }) => (
        <li key={r.id} className="flex items-start gap-3 p-3">
          <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', r.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300')}>
            {r.status === 'approved' ? <Check size={15} /> : <X size={15} />}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div>
              <b>{userName(r.userId)}</b> ·{' '}
              {type === 'change'
                ? `${changeKindLabel((r as ChangeRequest).kind, t)}${r.personId ? ' — ' + personName(r.personId) : ''}`
                : `${t('Erişim', 'Access')} — ${(r as AccessRequest).scope === 'all' ? t('tüm ağaç', 'whole tree') : personName(r.personId)}`}
            </div>
            <div className="text-xs text-slate-500">
              {r.status === 'approved' ? t('Onaylayan', 'Approved by') : t('Reddeden', 'Rejected by')}: {userName(r.reviewedBy)} ·{' '}
              {r.reviewedAt ? formatDate(r.reviewedAt.slice(0, 10)) : ''}
            </div>
            {r.reviewNote && <div className="mt-1 text-xs text-slate-600 italic dark:text-slate-300">“{r.reviewNote}”</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
