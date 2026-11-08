import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Download, Inbox, Languages, LogOut, Monitor, Moon, Pencil, Shield, Smartphone, Sun, Trash2, Type, UserRound } from 'lucide-react'
import { useFamily } from '../store/useFamily'
import { ROLE_LABEL, canManage, isAdmin } from '../lib/permissions'
import { useLang, useT } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { Avatar } from '../components/person/Avatar'
import { PersonPicker } from '../components/person/PersonPicker'
import { Badge, Button, PageHeader, Segmented, Switch, attempt, confirmAction } from '../components/ui'
import { displayName } from '../lib/format'

interface InstallEvent extends Event {
  prompt(): Promise<void>
}

function Row({ icon, label, to, onClick, right }: { icon: React.ReactNode; label: string; to?: string; onClick?: () => void; right?: React.ReactNode }) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-slate-500">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {right ?? <ChevronRight size={18} className="text-slate-400" />}
    </div>
  )
  if (to)
    return (
      <Link to={to} className="block hover:bg-slate-50 dark:hover:bg-slate-800/60">
        {inner}
      </Link>
    )
  return (
    <button onClick={onClick} className="block w-full text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
      {inner}
    </button>
  )
}

export default function AccountPage() {
  const t = useT()
  const nav = useNavigate()
  const s = useFamily()
  const { user, graph, data, mode } = s
  const { lang, setLang } = useLang()
  const theme = useTheme()
  const me = user?.personId ? graph.persons.get(user.personId) : undefined
  const [name, setName] = useState(user?.displayName ?? '')
  const [editName, setEditName] = useState(false)
  const [pick, setPick] = useState(false)
  const [install, setInstall] = useState<InstallEvent | null>(null)

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault()
      setInstall(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  if (!user) return null

  const downloadMyData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: user,
      person: me,
      requests: {
        access: data.accessRequests.filter((r) => r.userId === user.id),
        changes: data.changeRequests.filter((r) => r.userId === user.id),
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'verilerim.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const requestDeletion = async () => {
    if (!confirmAction(t('Hesabınızın ve kişisel verilerinizin silinmesi için yöneticiye talep gönderilsin mi?', 'Send a request to delete your account and data?'))) return
    if (me) await attempt(() => s.deletePerson(me.id, t('KVKK kapsamında verilerimin silinmesini talep ediyorum.', 'I request deletion of my data.')), t('Silme talebiniz yöneticiye iletildi', 'Deletion request sent'))
    else await attempt(() => s.requestAccess('branch', undefined, t('KVKK: hesabımın silinmesini talep ediyorum.', 'Please delete my account.')), t('Talebiniz iletildi', 'Request sent'))
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('Hesabım', 'My account')} />

      <section className="card p-5">
        <div className="flex items-center gap-4">
          <Avatar person={me} size={64} ring />
          <div className="min-w-0 flex-1">
            {editName ? (
              <div className="flex gap-2">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <Button
                  onClick={async () => {
                    await attempt(() => s.updateUser(user.id, { displayName: name.trim() || user.displayName }), t('Kaydedildi', 'Saved'))
                    setEditName(false)
                  }}
                >
                  {t('Kaydet', 'Save')}
                </Button>
              </div>
            ) : (
              <button onClick={() => setEditName(true)} className="flex items-center gap-2 text-left text-lg font-semibold">
                {user.displayName} <Pencil size={14} className="text-slate-400" />
              </button>
            )}
            <div className="truncate text-sm text-slate-500">{user.email}</div>
            <div className="mt-1 flex gap-1.5">
              <Badge color={isAdmin(user) ? 'amber' : 'brand'}>{ROLE_LABEL[user.role]}</Badge>
              {user.provider === 'google' && <Badge>Google</Badge>}
            </div>
          </div>
        </div>
        {me ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={<UserRound size={16} />} onClick={() => nav(`/kisi/${me.id}`)}>
              {t('Profilim', 'My profile')}
            </Button>
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => nav(`/kisi/${me.id}/duzenle`)}>
              {t('Bilgilerimi düzenle', 'Edit my details')}
            </Button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {t('Hesabınız henüz ağaçtaki bir kişiyle eşleşmedi.', 'Your account is not linked to a person yet.')}
          </p>
        )}
        {canManage(user) && (
          <Button variant="outline" className="mt-2 w-full" onClick={() => setPick(true)}>
            {me ? t(`Eşleşen kişi: ${displayName(me)} — değiştir`, `Linked: ${displayName(me)} — change`) : t('Ağaçta kendimi seç', 'Choose myself in the tree')}
          </Button>
        )}
      </section>

      <section className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
        {canManage(user) && <Row icon={<Shield size={19} />} label={t('Yönetim paneli', 'Admin panel')} to="/admin" />}
        <Row icon={<Bell size={19} />} label={t('Bildirimler', 'Notifications')} to="/bildirimler" />
        <Row icon={<Inbox size={19} />} label={t('Taleplerim & erişim izni iste', 'My requests & access')} to="/taleplerim" />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">{t('Görünüm', 'Appearance')}</h2>
        <Segmented
          value={theme.pref}
          onChange={theme.setPref}
          options={[
            { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={15} />{t('Açık', 'Light')}</span> },
            { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={15} />{t('Koyu', 'Dark')}</span> },
            { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor size={15} />{t('Sistem', 'System')}</span> },
          ]}
        />
        <div className="flex items-center gap-3">
          <Languages size={18} className="text-slate-500" />
          <Segmented
            className="flex-1"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'tr', label: 'Türkçe' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <Type size={18} className="text-slate-500" />
          <div className="flex-1">
            <Switch checked={theme.largeText} onChange={theme.setLargeText} label={t('Büyük yazı (büyüklerimiz için)', 'Large text')} />
          </div>
        </div>
      </section>

      <section className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
        {install && <Row icon={<Smartphone size={19} />} label={t('Uygulamayı telefona yükle', 'Install the app')} onClick={() => install.prompt()} />}
        {!install && (
          <div className="px-4 py-3.5 text-xs text-slate-500">
            <Smartphone size={15} className="mr-1 inline" />
            {t('Telefona yüklemek için: tarayıcı menüsünden "Ana ekrana ekle"yi seçin.', 'To install: choose "Add to Home Screen" in your browser menu.')}
          </div>
        )}
        <Row icon={<Download size={19} />} label={t('Verilerimi indir (KVKK)', 'Download my data')} onClick={downloadMyData} />
        {!isAdmin(user) && <Row icon={<Trash2 size={19} />} label={t('Verilerimin silinmesini iste', 'Request data deletion')} onClick={requestDeletion} />}
      </section>

      <Button variant="ghost" className="w-full text-red-600" icon={<LogOut size={18} />} onClick={() => s.signOut().then(() => nav('/giris'))}>
        {t('Çıkış yap', 'Sign out')}
      </Button>
      <p className="text-center text-xs text-slate-400">
        Soyağacı v1.0 · {mode === 'demo' ? t('Demo modu', 'Demo mode') : t('Bulut senkronizasyonu açık', 'Cloud sync on')}
      </p>

      <PersonPicker open={pick} onClose={() => setPick(false)} title={t('Ağaçta siz kimsiniz?', 'Who are you in the tree?')} onPick={(p) => attempt(() => s.updateUser(user.id, { personId: p.id }), t('Eşleştirildi', 'Linked'))} />
    </div>
  )
}
