import { useMemo, useState } from 'react'
import { Ban, Check, ChevronDown, Globe2, KeyRound, Link2, Search, Trash2, UserCheck, Users as UsersIcon } from 'lucide-react'
import type { AppUser, Role } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { Badge, Button, EmptyState, PageHeader, Segmented, attempt, confirmAction, cx } from '../../components/ui'
import { Avatar } from '../../components/person/Avatar'
import { PersonPicker } from '../../components/person/PersonPicker'
import { PersonRow } from '../../components/person/PersonRow'
import { canManage, isAdmin, isSuperAdminEmail } from '../../lib/permissions'
import { normalizeTr } from '../../lib/format'
import { statusLabel, timeAgo, usePersonName } from './shared'

type Filter = 'all' | 'pending' | 'active' | 'blocked'

export default function Users() {
  const t = useT()
  const users = useFamily((s) => s.data.users)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>(() => (users.some((u) => u.status === 'pending') ? 'pending' : 'all'))
  const [open, setOpen] = useState<string | null>(null)

  const list = useMemo(() => {
    const nq = normalizeTr(q)
    return users
      .filter((u) => filter === 'all' || u.status === filter)
      .filter((u) => !nq || normalizeTr(`${u.displayName} ${u.email}`).includes(nq))
      .sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || a.displayName.localeCompare(b.displayName, 'tr'))
  }, [users, q, filter])

  const count = (s: Filter) => (s === 'all' ? users.length : users.filter((u) => u.status === s).length)

  return (
    <div>
      <PageHeader title={t('Kullanıcılar', 'Users')} subtitle={t('Hesapları onaylayın, rollerini ve erişimlerini yönetin', 'Approve accounts, manage roles and access')} />
      <div className="relative mb-3">
        <Search size={18} className="absolute top-3 left-3 text-slate-400" />
        <input className="input pl-10" placeholder={t('İsim veya e-posta ara', 'Search name or email')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Segmented
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `${t('Tümü', 'All')} (${count('all')})` },
          { value: 'pending', label: `${t('Bekleyen', 'Pending')} (${count('pending')})` },
          { value: 'active', label: `${t('Aktif', 'Active')} (${count('active')})` },
          { value: 'blocked', label: `${t('Engelli', 'Blocked')} (${count('blocked')})` },
        ]}
      />
      {list.length ? (
        <div className="space-y-3">
          {list.map((u) => (
            <UserCard key={u.id} user={u} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<UsersIcon size={40} />} title={t('Kullanıcı bulunamadı', 'No users found')} />
      )}
    </div>
  )
}

function UserCard({ user, open, onToggle }: { user: AppUser; open: boolean; onToggle: () => void }) {
  const t = useT()
  const me = useFamily((s) => s.user)
  const persons = useFamily((s) => s.data.persons)
  const person = useFamily((s) => (user.personId ? s.graph.persons.get(user.personId) : undefined))
  const claimed = useFamily((s) => (user.claimedPersonId ? s.graph.persons.get(user.claimedPersonId) : undefined))
  const allGrants = useFamily((s) => s.data.grants)
  const grants = allGrants.filter((g) => g.userId === user.id)
  const { updateUser, deleteUser, grantAccess, revokeGrant } = useFamily.getState()
  const personName = usePersonName()
  const [picker, setPicker] = useState<'link' | 'grant' | null>(null)
  const [grantExpiry, setGrantExpiry] = useState('')
  const superAdmin = isSuperAdminEmail(user.email)
  const admin = isAdmin(me)
  // Editors may approve, link and block regular members (not admins or roles).
  const canEditUser = admin || (canManage(me) && user.role !== 'admin')
  const roleOptions: { value: Role; label: string }[] = [
    { value: 'admin', label: t('Yönetici', 'Admin') },
    { value: 'editor', label: t('Aile Editörü', 'Editor') },
    { value: 'member', label: t('Üye', 'Member') },
    { value: 'guest', label: t('Misafir (salt okunur)', 'Guest (read only)') },
  ]
  const roleColor = { admin: 'red', editor: 'amber', member: 'brand', guest: 'slate' } as const
  const expiryIso = grantExpiry ? new Date(grantExpiry + 'T23:59:59').toISOString() : undefined

  return (
    <article className={cx('card overflow-hidden', user.status === 'pending' && 'ring-2 ring-amber-300 dark:ring-amber-700')}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left">
        <Avatar person={person} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{user.displayName}</span>
            {superAdmin && <span title={t('Süper yönetici', 'Super admin')}>👑</span>}
          </div>
          <div className="truncate text-xs text-slate-500">{user.email}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge color={roleColor[user.role]}>{roleOptions.find((r) => r.value === user.role)?.label.split(' (')[0]}</Badge>
            <Badge color={user.status === 'active' ? 'green' : user.status === 'pending' ? 'amber' : 'red'}>{statusLabel(user, t)}</Badge>
            {user.provider === 'google' && <Badge color="blue">Google</Badge>}
            {!user.personId && <Badge color="slate">{t('Eşleşmemiş', 'Unlinked')}</Badge>}
          </div>
        </div>
        <ChevronDown size={18} className={cx('shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {user.status === 'pending' && !open && (
        <div className="flex gap-2 px-3 pb-3">
          {claimed ? (
            <Button
              size="sm"
              className="flex-1"
              icon={<UserCheck size={16} />}
              disabled={!canEditUser}
              onClick={() => attempt(() => updateUser(user.id, { personId: claimed.id, status: 'active', claimedPersonId: undefined }), t('Eşleştirildi ve onaylandı', 'Linked and approved'))}
            >
              {t(`${claimed.firstName} ile eşleştir ve onayla`, `Link to ${claimed.firstName} & approve`)}
            </Button>
          ) : (
            <Button size="sm" className="flex-1" icon={<Check size={16} />} disabled={!canEditUser} onClick={() => attempt(() => updateUser(user.id, { status: 'active' }), t('Hesap onaylandı', 'Account approved'))}>
              {t('Onayla', 'Approve')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onToggle}>
            {t('Detay', 'Details')}
          </Button>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-slate-100 p-4 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div>
              {t('Kayıt', 'Joined')}: {timeAgo(user.createdAt, t)}
            </div>
            <div>
              {t('Son giriş', 'Last seen')}: {user.lastSeenAt ? timeAgo(user.lastSeenAt, t) : '—'}
            </div>
            <div className="col-span-2">
              {t('KVKK onayı', 'Consent')}: {user.consentAt ? new Date(user.consentAt).toLocaleString('tr-TR') : t('Yok', 'None')}
            </div>
          </div>

          {(claimed || user.claimNote) && (
            <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
              <div className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-100">{t('Kullanıcının kimlik beyanı', "User's identity claim")}</div>
              {user.claimNote && <p className="mb-2 text-sm italic">“{user.claimNote}”</p>}
              {claimed && (
                <>
                  <PersonRow person={claimed} to={`/kisi/${claimed.id}`} />
                  <Button
                    size="sm"
                    className="mt-2 w-full"
                    icon={<UserCheck size={16} />}
                    disabled={!canEditUser}
                    onClick={() => attempt(() => updateUser(user.id, { personId: claimed.id, status: 'active', claimedPersonId: undefined }), t('Eşleştirildi ve onaylandı', 'Linked and approved'))}
                  >
                    {t('Eşleştir ve onayla', 'Link & approve')}
                  </Button>
                </>
              )}
            </div>
          )}

          <section>
            <h3 className="section-title">{t('Ağaçtaki kişi', 'Person in tree')}</h3>
            {person ? <PersonRow person={person} to={`/kisi/${person.id}`} /> : <p className="text-sm text-slate-500">{t('Bu hesap henüz bir kişiyle eşleşmedi.', 'Not linked to a person yet.')}</p>}
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" icon={<Link2 size={16} />} disabled={!canEditUser} onClick={() => setPicker('link')}>
                {person ? t('Değiştir', 'Change') : t('Kişiyle eşleştir', 'Link person')}
              </Button>
              {person && (
                <Button size="sm" variant="ghost" disabled={!canEditUser} onClick={() => attempt(() => updateUser(user.id, { personId: undefined }), t('Eşleşme kaldırıldı', 'Unlinked'))}>
                  {t('Eşleşmeyi kaldır', 'Unlink')}
                </Button>
              )}
            </div>
          </section>

          <section>
            <h3 className="section-title">{t('Rol', 'Role')}</h3>
            <select
              className="input"
              value={user.role}
              disabled={superAdmin || !admin}
              onChange={(e) => attempt(() => updateUser(user.id, { role: e.target.value as Role }), t('Rol güncellendi', 'Role updated'))}
            >
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {superAdmin
                ? t('Süper yöneticinin rolü değiştirilemez.', 'The super admin role cannot be changed.')
                : t('Yönetici ve editörler tüm ağacı görür ve doğrudan düzenler. Üyeler kendi soyunu görür.', 'Admins and editors see and edit everything. Members see their own line.')}
            </p>
          </section>

          <section>
            <h3 className="section-title">{t('Ek erişim izinleri', 'Extra access grants')}</h3>
            {grants.length ? (
              <ul className="mb-2 space-y-1.5">
                {grants.map((g) => {
                  const expired = g.expiresAt && new Date(g.expiresAt).getTime() < Date.now()
                  return (
                    <li key={g.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                      {g.scope === 'all' ? <Globe2 size={16} className="text-brand-600" /> : <KeyRound size={16} className="text-brand-600" />}
                      <span className="min-w-0 flex-1 truncate">
                        {g.scope === 'all' ? t('Tüm ağaç', 'Whole tree') : `${personName(g.personId)} ${t('dalı', 'branch')}`}
                        <span className={cx('block text-xs', expired ? 'text-red-500' : 'text-slate-500')}>
                          {g.expiresAt ? `${expired ? t('Süresi doldu', 'Expired') : t('Bitiş', 'Until')}: ${new Date(g.expiresAt).toLocaleDateString('tr-TR')}` : t('Süresiz', 'No expiry')}
                        </span>
                      </span>
                      <button className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => attempt(() => revokeGrant(g.id), t('İzin kaldırıldı', 'Grant revoked'))} aria-label={t('Kaldır', 'Revoke')}>
                        <Trash2 size={16} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mb-2 text-sm text-slate-500">{t('Ek izin yok — yalnızca kendi üst/alt soyunu görür.', 'No extra grants — sees only own line.')}</p>
            )}
            <label className="mb-2 block">
              <span className="label">{t('Yeni izin bitiş tarihi (isteğe bağlı)', 'New grant expiry (optional)')}</span>
              <input type="date" className="input" value={grantExpiry} onChange={(e) => setGrantExpiry(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<KeyRound size={16} />} onClick={() => setPicker('grant')}>
                {t('Dal izni ver', 'Grant branch')}
              </Button>
              <Button size="sm" variant="outline" icon={<Globe2 size={16} />} onClick={() => attempt(() => grantAccess(user.id, 'all', undefined, expiryIso), t('Tüm ağaç izni verildi', 'Full access granted'))}>
                {t('Tüm ağaca izin ver', 'Grant whole tree')}
              </Button>
            </div>
          </section>

          <section className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            {user.status !== 'active' && (
              <Button size="sm" icon={<Check size={16} />} disabled={!canEditUser} onClick={() => attempt(() => updateUser(user.id, { status: 'active' }), t('Hesap aktif', 'Account active'))}>
                {user.status === 'blocked' ? t('Engeli kaldır', 'Unblock') : t('Onayla', 'Approve')}
              </Button>
            )}
            {user.status !== 'blocked' && !superAdmin && (
              <Button size="sm" variant="outline" icon={<Ban size={16} />} disabled={!canEditUser} onClick={() => confirmAction(t('Bu hesap engellensin mi?', 'Block this account?')).then((ok): unknown => ok && attempt(() => updateUser(user.id, { status: 'blocked' }), t('Hesap engellendi', 'Account blocked')))}>
                {t('Engelle', 'Block')}
              </Button>
            )}
            {!superAdmin && admin && (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={16} />}
                onClick={() => confirmAction(t(`${user.displayName} hesabı kalıcı olarak silinsin mi? Ağaçtaki kişi silinmez.`, `Delete account ${user.displayName}? The tree person is kept.`)).then((ok): unknown => ok && attempt(() => deleteUser(user.id), t('Hesap silindi', 'Account deleted')))}
              >
                {t('Hesabı sil', 'Delete account')}
              </Button>
            )}
          </section>
          {!admin && <p className="text-xs text-slate-500">{t('Rolleri ve yönetici hesaplarını yalnızca yöneticiler değiştirebilir.', 'Only admins can change roles and admin accounts.')}</p>}
        </div>
      )}

      <PersonPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        persons={persons}
        title={picker === 'link' ? t('Hesabı hangi kişiyle eşleştirelim?', 'Link account to which person?') : t('Hangi dal açılsın?', 'Which branch to open?')}
        onPick={(p) => {
          if (picker === 'link') void attempt(() => updateUser(user.id, { personId: p.id, claimedPersonId: undefined, ...(user.status === 'pending' ? { status: 'active' as const } : {}) }), t('Kişiyle eşleştirildi', 'Linked'))
          else void attempt(() => grantAccess(user.id, 'branch', p.id, expiryIso), t('Dal izni verildi', 'Branch access granted'))
        }}
      />
    </article>
  )
}
