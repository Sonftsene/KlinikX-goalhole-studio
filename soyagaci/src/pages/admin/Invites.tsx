import { useState } from 'react'
import { Copy, MessageCircle, Plus, Share2, Ticket, Trash2, UserPlus } from 'lucide-react'
import type { Invite, Person, Role } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { Badge, Button, EmptyState, Field, PageHeader, attempt, confirmAction, cx, toast } from '../../components/ui'
import { PersonPicker } from '../../components/person/PersonPicker'
import { PersonRow } from '../../components/person/PersonRow'
import { isAdmin } from '../../lib/permissions'
import { timeAgo, usePersonName, useUserName } from './shared'

function inviteLink(code: string) {
  return `${location.origin}${import.meta.env.BASE_URL}giris?davet=${code}`
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    window.prompt('', text)
  }
}

export default function Invites() {
  const t = useT()
  const me = useFamily((s) => s.user)
  const invites = useFamily((s) => s.data.invites)
  const persons = useFamily((s) => s.data.persons)
  const familyName = useFamily((s) => s.data.settings.familyName)
  const { createInvite, deleteInvite } = useFamily.getState()
  const [role, setRole] = useState<Role>('member')
  const [person, setPerson] = useState<Person | null>(null)
  const [days, setDays] = useState(14)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Invite | null>(null)

  const sorted = [...invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const active = sorted.filter((i) => !i.usedBy && (!i.expiresAt || new Date(i.expiresAt).getTime() > Date.now()))
  const inactive = sorted.filter((i) => !active.includes(i))

  const create = async () => {
    setBusy(true)
    const inv = await attempt(() => createInvite(role, person?.id, days), t('Davet oluşturuldu', 'Invite created'))
    setBusy(false)
    if (inv) {
      setCreated(inv)
      setPerson(null)
    }
  }

  return (
    <div>
      <PageHeader title={t('Davetler', 'Invites')} subtitle={t('Akrabalarınızı bir bağlantı veya kodla davet edin', 'Invite relatives with a link or code')} />

      <section className="card mb-6 p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <UserPlus size={18} /> {t('Yeni davet', 'New invite')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Rol', 'Role')}>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">{t('Üye', 'Member')}</option>
              <option value="guest">{t('Misafir (salt okunur)', 'Guest (read only)')}</option>
              <option value="editor">{t('Aile Editörü', 'Editor')}</option>
              {isAdmin(me) && <option value="admin">{t('Yönetici', 'Admin')}</option>}
            </select>
          </Field>
          <Field label={t('Geçerlilik süresi', 'Valid for')}>
            <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 3, 7, 14, 30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  {t(`${d} gün`, `${d} days`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <span className="label">{t('Ağaçtaki kişi (isteğe bağlı)', 'Person in tree (optional)')}</span>
          {person ? (
            <PersonRow person={person} onClick={() => setPicker(true)} right={<span className="text-xs text-brand-700">{t('Değiştir', 'Change')}</span>} />
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setPicker(true)}>
              {t('Kişi seç — kayıt olunca otomatik eşleşir', 'Choose person — auto-linked on signup')}
            </Button>
          )}
        </div>
        <Button className="mt-4 w-full sm:w-auto" icon={<Plus size={18} />} loading={busy} onClick={create}>
          {t('Davet oluştur', 'Create invite')}
        </Button>

        {created && <InviteShare invite={created} familyName={familyName} highlight />}
      </section>

      <h2 className="section-title">{t(`Aktif davetler (${active.length})`, `Active invites (${active.length})`)}</h2>
      {active.length ? (
        <div className="mb-6 space-y-3">
          {active.map((i) => (
            <InviteCard key={i.id} invite={i} onDelete={() => confirmAction(t('Davet silinsin mi?', 'Delete invite?')).then((ok): unknown => ok && attempt(() => deleteInvite(i.id), t('Davet silindi', 'Invite deleted')))} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Ticket size={36} />} title={t('Aktif davet yok', 'No active invites')} />
      )}

      {inactive.length > 0 && (
        <>
          <h2 className="section-title mt-6">{t('Kullanılmış / süresi dolmuş', 'Used / expired')}</h2>
          <div className="space-y-3 opacity-80">
            {inactive.map((i) => (
              <InviteCard key={i.id} invite={i} onDelete={() => attempt(() => deleteInvite(i.id))} />
            ))}
          </div>
        </>
      )}

      <PersonPicker open={picker} onClose={() => setPicker(false)} persons={persons} onPick={setPerson} title={t('Davet edilen kişi kim?', 'Who is being invited?')} />
    </div>
  )
}

function InviteShare({ invite, familyName, highlight }: { invite: Invite; familyName: string; highlight?: boolean }) {
  const t = useT()
  const link = inviteLink(invite.code)
  const message = t(
    `${familyName} soyağacına davetlisin! Katılmak için: ${link} (Davet kodu: ${invite.code})`,
    `You're invited to the ${familyName} family tree! Join here: ${link} (Invite code: ${invite.code})`,
  )
  return (
    <div className={cx('mt-4 rounded-xl p-3', highlight ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-800' : 'bg-slate-50 dark:bg-slate-800/50')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xl font-bold tracking-[0.2em]">{invite.code}</span>
        <Button size="sm" variant="ghost" icon={<Copy size={15} />} onClick={() => copy(invite.code, t('Kod kopyalandı', 'Code copied'))}>
          {t('Kod', 'Code')}
        </Button>
      </div>
      <div className="mt-1 truncate text-xs text-slate-500">{link}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" icon={<Copy size={15} />} onClick={() => copy(link, t('Bağlantı kopyalandı', 'Link copied'))}>
          {t('Bağlantıyı kopyala', 'Copy link')}
        </Button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button size="sm" variant="outline" icon={<Share2 size={15} />} onClick={() => navigator.share({ title: familyName, text: message, url: link }).catch(() => undefined)}>
            {t('Paylaş', 'Share')}
          </Button>
        )}
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" icon={<MessageCircle size={15} />} className="text-emerald-700 dark:text-emerald-400">
            WhatsApp
          </Button>
        </a>
      </div>
    </div>
  )
}

function InviteCard({ invite, onDelete }: { invite: Invite; onDelete: () => void }) {
  const t = useT()
  const personName = usePersonName()
  const userName = useUserName()
  const familyName = useFamily((s) => s.data.settings.familyName)
  const [open, setOpen] = useState(false)
  const expired = !!invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()
  const roleLabel: Record<Role, string> = { admin: t('Yönetici', 'Admin'), editor: t('Editör', 'Editor'), member: t('Üye', 'Member'), guest: t('Misafir', 'Guest') }
  return (
    <article className="card p-3">
      <div className="flex items-center gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-bold tracking-widest">{invite.code}</span>
            <Badge color="brand">{roleLabel[invite.role]}</Badge>
            {invite.usedBy ? <Badge color="green">{t('Kullanıldı', 'Used')}</Badge> : expired ? <Badge color="red">{t('Süresi doldu', 'Expired')}</Badge> : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {invite.personId ? `${personName(invite.personId)} · ` : ''}
            {invite.usedBy
              ? `${userName(invite.usedBy)} · ${invite.usedAt ? timeAgo(invite.usedAt, t) : ''}`
              : invite.expiresAt
                ? `${t('Bitiş', 'Expires')}: ${new Date(invite.expiresAt).toLocaleDateString('tr-TR')}`
                : ''}
          </div>
        </button>
        <button onClick={onDelete} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" aria-label={t('Sil', 'Delete')}>
          <Trash2 size={17} />
        </button>
      </div>
      {open && !invite.usedBy && !expired && <InviteShare invite={invite} familyName={familyName} />}
    </article>
  )
}
