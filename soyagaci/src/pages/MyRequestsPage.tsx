import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Inbox, Send, Trash2 } from 'lucide-react'
import { useFamily } from '../store/useFamily'
import type { RequestStatus } from '../types'
import { Badge, Button, Field, PageHeader, Segmented, attempt } from '../components/ui'
import { PersonPicker } from '../components/person/PersonPicker'
import { PersonRow } from '../components/person/PersonRow'
import { displayName, formatDate } from '../lib/format'
import { useLang, useT } from '../lib/i18n'
import { canManage } from '../lib/permissions'

const KIND_LABEL: Record<string, [string, string]> = {
  update_person: ['Bilgi güncelleme', 'Update details'],
  create_person: ['Yeni kişi', 'New person'],
  delete_person: ['Kişi silme', 'Delete person'],
  add_relation: ['Bağlantı ekleme', 'Add link'],
  remove_relation: ['Bağlantı kaldırma', 'Remove link'],
  set_photo: ['Profil fotoğrafı', 'Profile photo'],
  add_photo: ['Albüme fotoğraf', 'Album photo'],
}

function StatusBadge({ s }: { s: RequestStatus }) {
  const t = useT()
  if (s === 'approved') return <Badge color="green">{t('Onaylandı', 'Approved')}</Badge>
  if (s === 'rejected') return <Badge color="red">{t('Reddedildi', 'Rejected')}</Badge>
  return <Badge color="amber">{t('Bekliyor', 'Pending')}</Badge>
}

export default function MyRequestsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [params] = useSearchParams()
  const s = useFamily()
  const { user, data, graph } = s
  const [scope, setScope] = useState<'branch' | 'all'>('branch')
  const [personId, setPersonId] = useState<string | undefined>(params.get('kisi') ?? undefined)
  const [message, setMessage] = useState('')
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)

  const mineAccess = data.accessRequests.filter((r) => r.userId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const mineChanges = data.changeRequests.filter((r) => r.userId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const myGrants = data.grants.filter((g) => g.userId === user?.id)
  const target = personId ? graph.persons.get(personId) : undefined

  const submit = async () => {
    if (scope === 'branch' && !target && !message.trim())
      return void attempt(async () => {
        throw new Error(t('Bir kişi seçin veya kimin ailesini görmek istediğinizi yazın.', 'Pick a person or describe whose family you want to see.'))
      })
    setBusy(true)
    const ok = await attempt(() => s.requestAccess(scope, scope === 'branch' ? personId : undefined, message.trim() || undefined), t('Talebiniz yöneticiye iletildi', 'Request sent'))
    setBusy(false)
    if (ok !== undefined) {
      setMessage('')
      setPersonId(undefined)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('Taleplerim', 'My requests')} subtitle={t('Erişim ve değişiklik talepleriniz', 'Your access and change requests')} />

      {!canManage(user) && (
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="font-semibold">{t('Akraba ağacı görme izni iste', 'Request to view relatives')}</h2>
            <p className="text-sm text-slate-500">
              {t('Varsayılan olarak yalnızca kendi üst ve alt soyunuzu görürsünüz. Diğer dallar için yöneticiden izin isteyin.', 'By default you see only your own ancestors and descendants.')}
            </p>
          </div>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'branch', label: t('Belirli bir dal', 'A branch') },
              { value: 'all', label: t('Tüm ağaç', 'Whole tree') },
            ]}
          />
          {scope === 'branch' && (
            <div>
              {target ? (
                <PersonRow person={target} onClick={() => setPicker(true)} right={<span className="text-xs text-brand-700">{t('Değiştir', 'Change')}</span>} />
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setPicker(true)}>
                  {t('Görebildiğiniz bir akrabayı seçin (isteğe bağlı)', 'Pick a relative you can see (optional)')}
                </Button>
              )}
            </div>
          )}
          <Field label={t('Mesajınız', 'Message')}>
            <textarea className="input min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('Örn: Dayımın torunlarını görmek istiyorum.', 'E.g. I want to see my uncle’s grandchildren.')} />
          </Field>
          <Button className="w-full" icon={<Send size={16} />} loading={busy} onClick={submit}>
            {t('Talep gönder', 'Send request')}
          </Button>
        </section>
      )}

      {myGrants.length > 0 && (
        <section>
          <h2 className="section-title">{t('Verilen izinler', 'Granted access')}</h2>
          <div className="card divide-y divide-slate-100 p-1 dark:divide-slate-800">
            {myGrants.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-3 text-sm">
                <span>{g.scope === 'all' ? t('Tüm ağaç', 'Whole tree') : `${displayName(graph.persons.get(g.personId ?? ''))} ${t('dalı', 'branch')}`}</span>
                {g.expiresAt && <span className="text-xs text-slate-500">{t('Bitiş:', 'Until')} {formatDate(g.expiresAt.slice(0, 10), lang)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">{t('Erişim talepleri', 'Access requests')}</h2>
        {mineAccess.length ? (
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {mineAccess.map((r) => (
              <div key={r.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.scope === 'all' ? t('Tüm ağaç', 'Whole tree') : r.personId ? `${displayName(graph.persons.get(r.personId))} ${t('dalı', 'branch')}` : t('Belirli bir dal', 'A branch')}</div>
                  {r.message && <div className="text-sm text-slate-500">{r.message}</div>}
                  {r.reviewNote && <div className="mt-1 text-sm text-slate-600 italic dark:text-slate-300">“{r.reviewNote}”</div>}
                  <div className="mt-1 text-xs text-slate-400">{formatDate(r.createdAt.slice(0, 10), lang)}</div>
                </div>
                <StatusBadge s={r.status} />
                {r.status === 'pending' && (
                  <button onClick={() => attempt(() => s.cancelRequest('access', r.id))} className="p-1 text-slate-400 hover:text-red-600" aria-label={t('İptal', 'Cancel')}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t('Henüz talep yok.', 'No requests yet.')}</p>
        )}
      </section>

      <section>
        <h2 className="section-title">{t('Değişiklik talepleri', 'Change requests')}</h2>
        {mineChanges.length ? (
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {mineChanges.map((r) => {
              const label = KIND_LABEL[r.kind] ?? [r.kind, r.kind]
              const person = r.personId ? graph.persons.get(r.personId) : undefined
              const created = r.kind === 'create_person' ? (r.payload.person as { firstName?: string; lastName?: string } | undefined) : undefined
              return (
                <div key={r.id} className="flex items-start gap-3 p-4">
                  <Inbox size={18} className="mt-0.5 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{lang === 'en' ? label[1] : label[0]}</div>
                    <div className="text-sm text-slate-500">
                      {created ? `${created.firstName ?? ''} ${created.lastName ?? ''}` : displayName(person)}
                    </div>
                    {r.reviewNote && <div className="mt-1 text-sm italic">“{r.reviewNote}”</div>}
                    <div className="mt-1 text-xs text-slate-400">{formatDate(r.createdAt.slice(0, 10), lang)}</div>
                  </div>
                  <StatusBadge s={r.status} />
                  {r.status === 'pending' && (
                    <button onClick={() => attempt(() => s.cancelRequest('change', r.id))} className="p-1 text-slate-400 hover:text-red-600" aria-label={t('İptal', 'Cancel')}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t('Henüz talep yok.', 'No requests yet.')}</p>
        )}
      </section>

      <PersonPicker open={picker} onClose={() => setPicker(false)} onPick={(p) => setPersonId(p.id)} title={t('Kimin ailesi?', 'Whose family?')} />
    </div>
  )
}
