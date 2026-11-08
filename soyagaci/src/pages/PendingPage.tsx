import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Clock, LogOut, RefreshCw, Ticket } from 'lucide-react'
import { useFamily } from '../store/useFamily'
import { isActive } from '../lib/permissions'
import { Button, Field, Toaster, attempt } from '../components/ui'
import { useT } from '../lib/i18n'

/** Shown to signed-in users until an admin approves them. */
export default function PendingPage() {
  const t = useT()
  const user = useFamily((s) => s.user)
  const { claimPerson, redeemInvite, signOut, reload } = useFamily()
  const [note, setNote] = useState(user?.claimNote ?? '')
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem('soyagaci-invite') ?? ''
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState('')

  if (!user) return <Navigate to="/giris" replace />
  if (isActive(user)) return <Navigate to="/" replace />
  const blocked = user.status === 'blocked'

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <Toaster />
      <div className="mx-auto max-w-md px-5 pt-[calc(var(--safe-top)+2rem)] pb-10">
        <div className="card p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
            <Clock size={28} />
          </div>
          <h1 className="text-xl font-bold">
            {blocked ? t('Hesabınız engellendi', 'Your account is blocked') : t('Hoş geldiniz, ', 'Welcome, ') + (blocked ? '' : user.displayName)}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {blocked
              ? t('Ayrıntılı bilgi için aile yöneticisiyle iletişime geçin.', 'Please contact the family admin.')
              : t(
                  'Hesabınız yönetici onayı bekliyor. Yönetici sizi soyağacındaki kişinizle eşleştirdiğinde kendi üst ve alt soyunuzu görebileceksiniz.',
                  'Your account is waiting for approval. Once the admin links you to your person in the tree you can see your ancestors and descendants.',
                )}
          </p>
          <Button variant="ghost" size="sm" className="mt-3" icon={<RefreshCw size={15} />} onClick={() => reload()}>
            {t('Durumu yenile', 'Refresh status')}
          </Button>
        </div>

        {!blocked && (
          <>
            <div className="card mt-4 p-5">
              <h2 className="mb-1 font-semibold">{t('Siz kimsiniz?', 'Who are you?')}</h2>
              <p className="mb-3 text-sm text-slate-500">
                {t('Yöneticinin sizi kolayca bulması için kısa bilgi yazın.', 'Help the admin find you in the tree.')}
              </p>
              <Field>
                <textarea
                  className="input min-h-24"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('Örn: Zehra Yılmaz, 1992 İstanbul doğumlu. Babam Murat, annem Elif.', 'E.g. Jane Doe, born 1992. Father John, mother Mary.')}
                />
              </Field>
              <Button
                className="mt-3 w-full"
                loading={busy === 'claim'}
                disabled={!note.trim()}
                onClick={async () => {
                  setBusy('claim')
                  await attempt(() => claimPerson(undefined, note.trim()), t('Bilgileriniz yöneticiye iletildi.', 'Sent to the admin.'))
                  setBusy('')
                }}
              >
                {t('Yöneticiye gönder', 'Send to admin')}
              </Button>
            </div>

            <div className="card mt-4 p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                <Ticket size={18} /> {t('Davet kodunuz var mı?', 'Have an invite code?')}
              </h2>
              <div className="mt-2 flex gap-2">
                <input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD2345" />
                <Button
                  loading={busy === 'code'}
                  disabled={!code.trim()}
                  onClick={async () => {
                    setBusy('code')
                    await attempt(() => redeemInvite(code), t('Hesabınız etkinleştirildi!', 'Your account is active!'))
                    setBusy('')
                  }}
                >
                  {t('Kullan', 'Redeem')}
                </Button>
              </div>
            </div>
          </>
        )}

        <Button variant="ghost" className="mt-4 w-full" icon={<LogOut size={17} />} onClick={() => signOut()}>
          {t('Çıkış yap', 'Sign out')}
        </Button>
      </div>
    </div>
  )
}
