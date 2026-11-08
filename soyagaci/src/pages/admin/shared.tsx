import { type ReactNode, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { AppUser, AuditEntry } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { cx } from '../../components/ui'
import { formatDate, fullName } from '../../lib/format'

export type TFn = (tr: string, en?: string) => string

/** Turkish/English labels for person fields shown in diffs. */
export function fieldLabel(key: string, t: TFn): string {
  const map: Record<string, [string, string]> = {
    firstName: ['Ad', 'First name'],
    lastName: ['Soyad', 'Last name'],
    maidenName: ['Kızlık soyadı', 'Maiden name'],
    nickname: ['Lakap', 'Nickname'],
    gender: ['Cinsiyet', 'Gender'],
    birthDate: ['Doğum tarihi', 'Birth date'],
    birthPlace: ['Doğum yeri', 'Birth place'],
    birthGeo: ['Doğum konumu', 'Birth location'],
    isDeceased: ['Vefat etti', 'Deceased'],
    deathDate: ['Vefat tarihi', 'Death date'],
    deathPlace: ['Vefat yeri', 'Death place'],
    causeOfDeath: ['Vefat nedeni', 'Cause of death'],
    burialPlace: ['Defin yeri', 'Burial place'],
    burialGeo: ['Mezar konumu', 'Burial location'],
    residence: ['İkamet', 'Residence'],
    residenceGeo: ['İkamet konumu', 'Residence location'],
    hometown: ['Memleket', 'Hometown'],
    occupation: ['Meslek', 'Occupation'],
    education: ['Eğitim', 'Education'],
    phone: ['Telefon', 'Phone'],
    email: ['E-posta', 'Email'],
    bio: ['Biyografi', 'Biography'],
    notes: ['Notlar', 'Notes'],
    tags: ['Etiketler', 'Tags'],
    photoUrl: ['Profil fotoğrafı', 'Profile photo'],
    photos: ['Fotoğraflar', 'Photos'],
    documents: ['Belgeler', 'Documents'],
  }
  const v = map[key]
  return v ? t(v[0], v[1]) : key
}

export function formatValue(key: string, v: unknown, t: TFn): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? t('Evet', 'Yes') : t('Hayır', 'No')
  if (key === 'gender') return v === 'male' ? t('Erkek', 'Male') : v === 'female' ? t('Kadın', 'Female') : t('Diğer', 'Other')
  if (key.endsWith('Date') && typeof v === 'string') return formatDate(v)
  if (Array.isArray(v)) {
    if (key === 'photos') return t(`${v.length} fotoğraf`, `${v.length} photos`)
    return v.join(', ') || '—'
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('lat' in o && 'lng' in o) return `${Number(o.lat).toFixed(4)}, ${Number(o.lng).toFixed(4)}`
    return JSON.stringify(v)
  }
  return String(v)
}

export function isImageUrl(v: unknown): v is string {
  return typeof v === 'string' && (v.startsWith('data:image') || /^https?:\/\//.test(v))
}

export function useUserName() {
  const users = useFamily((s) => s.data.users)
  return (id?: string) => {
    if (!id) return '—'
    if (id === 'system') return 'Sistem'
    return users.find((u) => u.id === id)?.displayName ?? id
  }
}

export function usePersonName() {
  const persons = useFamily((s) => s.graph.persons)
  return (id?: string) => (id ? fullName(persons.get(id)) || '—' : '—')
}

export function actionLabel(action: string, t: TFn): string {
  const map: Record<string, [string, string]> = {
    create_person: ['Kişi ekledi', 'Added person'],
    update_person: ['Kişiyi güncelledi', 'Updated person'],
    delete_person: ['Kişiyi sildi', 'Deleted person'],
    merge_persons: ['Kişileri birleştirdi', 'Merged persons'],
    add_relation: ['Bağlantı ekledi', 'Added relation'],
    remove_relation: ['Bağlantı kaldırdı', 'Removed relation'],
    approve_access: ['Erişim talebini onayladı', 'Approved access request'],
    reject_access: ['Erişim talebini reddetti', 'Rejected access request'],
    grant_access: ['Erişim izni verdi', 'Granted access'],
    revoke_access: ['Erişim iznini kaldırdı', 'Revoked access'],
    approve_change: ['Değişikliği onayladı', 'Approved change'],
    reject_change: ['Değişikliği reddetti', 'Rejected change'],
    update_user: ['Kullanıcıyı güncelledi', 'Updated user'],
    delete_user: ['Kullanıcıyı sildi', 'Deleted user'],
    create_invite: ['Davet oluşturdu', 'Created invite'],
    update_settings: ['Ayarları değiştirdi', 'Changed settings'],
    import: ['Veri içe aktardı', 'Imported data'],
  }
  const v = map[action]
  return v ? t(v[0], v[1]) : action
}

export function changeKindLabel(kind: string, t: TFn): string {
  const map: Record<string, [string, string]> = {
    update_person: ['Bilgi güncelleme', 'Update details'],
    create_person: ['Yeni kişi ekleme', 'Add new person'],
    delete_person: ['Kişi silme', 'Delete person'],
    add_relation: ['Bağlantı ekleme', 'Add relation'],
    remove_relation: ['Bağlantı kaldırma', 'Remove relation'],
    set_photo: ['Profil fotoğrafı', 'Profile photo'],
    add_photo: ['Fotoğraf ekleme', 'Add photo'],
  }
  const v = map[kind]
  return v ? t(v[0], v[1]) : kind
}

export function statusLabel(u: AppUser, t: TFn) {
  return u.status === 'active' ? t('Aktif', 'Active') : u.status === 'pending' ? t('Onay bekliyor', 'Pending') : t('Engelli', 'Blocked')
}

export function timeAgo(iso: string, t: TFn): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return t('az önce', 'just now')
  if (diff < 3600) return t(`${Math.floor(diff / 60)} dk önce`, `${Math.floor(diff / 60)} min ago`)
  if (diff < 86400) return t(`${Math.floor(diff / 3600)} sa önce`, `${Math.floor(diff / 3600)} h ago`)
  if (diff < 86400 * 30) return t(`${Math.floor(diff / 86400)} gün önce`, `${Math.floor(diff / 86400)} d ago`)
  return new Date(iso).toLocaleDateString('tr-TR')
}

export function auditSummary(e: AuditEntry): string {
  const a = e.after as Record<string, unknown> | undefined
  const b = e.before as Record<string, unknown> | undefined
  const src = (a && typeof a === 'object' ? a : b) as Record<string, unknown> | undefined
  if (!src) return ''
  if (typeof src.firstName === 'string') return `${src.firstName} ${src.lastName ?? ''}`.trim()
  if (src.person && typeof src.person === 'object') {
    const p = src.person as Record<string, unknown>
    return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
  }
  if (typeof src.displayName === 'string') return src.displayName
  if (typeof src.code === 'string') return src.code
  return ''
}

export function AdminNav() {
  const t = useT()
  const pending = useFamily(
    (s) => s.data.changeRequests.filter((r) => r.status === 'pending').length + s.data.accessRequests.filter((r) => r.status === 'pending').length,
  )
  const pendingUsers = useFamily((s) => s.data.users.filter((u) => u.status === 'pending').length)
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    // Keep the active tab visible on narrow screens.
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname])
  const links = [
    { to: '/admin', label: t('Genel bakış', 'Overview'), end: true },
    { to: '/admin/onaylar', label: t('Onaylar', 'Approvals'), badge: pending },
    { to: '/admin/kullanicilar', label: t('Kullanıcılar', 'Users'), badge: pendingUsers },
    { to: '/admin/kisiler', label: t('Kişiler', 'Persons') },
    { to: '/admin/davetler', label: t('Davetler', 'Invites') },
    { to: '/admin/gecmis', label: t('Geçmiş', 'History') },
    { to: '/admin/aktar', label: t('Aktar / Yedek', 'Import / Backup') },
    { to: '/admin/ayarlar', label: t('Ayarlar', 'Settings') },
  ]
  return (
    <nav ref={navRef} className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) =>
            cx(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
              isActive
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800',
            )
          }
        >
          {l.label}
          {!!l.badge && <span className="rounded-full bg-red-500 px-1.5 text-[11px] leading-4 text-white">{l.badge}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

export function StatCard({ label, value, icon, tone = 'brand' }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'brand' | 'amber' | 'blue' | 'pink' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
    pink: 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200',
  }
  return (
    <div className="card flex items-center gap-3 p-4">
      {icon && <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs leading-tight text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  )
}

export function download(filename: string, content: string | Blob, mime = 'application/octet-stream') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
