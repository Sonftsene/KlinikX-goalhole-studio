import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { useFamily } from '../store/useFamily'
import { isActive } from '../lib/permissions'
import { Button, Field, Segmented, Toaster, attempt, toast } from '../components/ui'
import { useT } from '../lib/i18n'
import { DEMO_PASSWORD } from '../repo/local'

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

const DEMO_ACCOUNTS = [
  { email: 'sonft1249@gmail.com', tr: 'Yönetici', en: 'Admin', icon: ShieldCheck },
  { email: 'murat@ornek.com', tr: 'Aile editörü', en: 'Editor', icon: Sparkles },
  { email: 'zehra@ornek.com', tr: 'Üye (Zehra)', en: 'Member (Zehra)', icon: UserRound },
  { email: 'defne@ornek.com', tr: 'Üye (Defne)', en: 'Member (Defne)', icon: UserRound },
]

export default function LoginPage() {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const user = useFamily((s) => s.user)
  const mode = useFamily((s) => s.mode)
  const s = useFamily()
  const invite = params.get('davet') ?? ''
  const [tab, setTab] = useState<'login' | 'signup'>(invite ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState(invite)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (invite) localStorage.setItem('soyagaci-invite', invite)
  }, [invite])

  const from = (loc.state as { from?: string } | null)?.from || '/'
  if (user) return <Navigate to={isActive(user) ? from : '/bekleme'} replace />

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    await attempt(fn)
    setBusy(null)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (tab === 'login') return run('pw', () => s.signInWithPassword(email, password).then(() => nav(from, { replace: true })))
    if (!consent) return toast.error(t('Lütfen KVKK aydınlatma metnini onaylayın.', 'Please accept the privacy notice.'))
    if (password.length < 6) return toast.error(t('Şifre en az 6 karakter olmalı.', 'Password must be at least 6 characters.'))
    return run('signup', async () => {
      const r = await s.signUp({ email, password, displayName: name, inviteCode: code || undefined })
      if (r === 'check-email') {
        setSent(true)
        toast.success(t('E-postanıza doğrulama bağlantısı gönderdik.', 'We sent you a confirmation email.'))
      }
    })
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-brand-700 via-brand-800 to-slate-950">
      <Toaster />
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pt-[calc(var(--safe-top)+2.5rem)] pb-10">
        <div className="mb-8 text-center text-white">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mx-auto mb-4 h-20 w-20 rounded-3xl shadow-xl ring-4 ring-white/20" />
          <h1 className="text-3xl font-bold tracking-tight">Soyağacı</h1>
          <p className="mt-1 text-brand-100">{t('Ailenizin hikâyesi, kuşaktan kuşağa.', 'Your family story, generation to generation.')}</p>
        </div>

        <div className="card p-5">
          <Button
            variant="outline"
            size="lg"
            className="w-full bg-white text-slate-800 dark:bg-white dark:text-slate-900"
            icon={<GoogleIcon />}
            loading={busy === 'google'}
            onClick={() => run('google', () => s.signInWithGoogle())}
          >
            {t('Google ile devam et', 'Continue with Google')}
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            {t('veya e-posta ile', 'or with email')}
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>

          <Segmented
            className="mb-4"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'login', label: t('Giriş yap', 'Sign in') },
              { value: 'signup', label: t('Kayıt ol', 'Sign up') },
            ]}
          />

          {sent ? (
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              {t('Gelen kutunuzu kontrol edin ve bağlantıya tıklayın. Ardından yönetici hesabınızı onaylayacak.', 'Check your inbox and click the link. An admin will then approve your account.')}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              {tab === 'signup' && (
                <Field label={t('Adınız soyadınız', 'Full name')}>
                  <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </Field>
              )}
              <Field label={t('E-posta', 'Email')}>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
              </Field>
              <Field label={t('Şifre', 'Password')}>
                <input
                  className="input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
              </Field>
              {tab === 'signup' && (
                <>
                  <Field label={t('Davet kodu (varsa)', 'Invite code (optional)')} hint={t('Davet koduyla kayıt olursanız onay beklemeden giriş yaparsınız.', 'With an invite code you skip the approval wait.')}>
                    <input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value)} />
                  </Field>
                  <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-700" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>
                      {t(
                        'Kişisel verilerimin (ad, fotoğraf, doğum bilgileri) aile soyağacında KVKK kapsamında işlenmesine açık rıza veriyorum. Verilerimin silinmesini istediğim zaman talep edebilirim.',
                        'I consent to my personal data (name, photo, birth details) being processed in the family tree. I can request deletion at any time.',
                      )}
                    </span>
                  </label>
                </>
              )}
              <Button type="submit" size="lg" className="w-full" loading={busy === 'pw' || busy === 'signup'} icon={<KeyRound size={18} />}>
                {tab === 'login' ? t('Giriş yap', 'Sign in') : t('Hesap oluştur', 'Create account')}
              </Button>
              {tab === 'login' && (
                <div className="flex justify-between text-sm">
                  <button
                    type="button"
                    className="text-brand-700 dark:text-brand-300"
                    onClick={() => {
                      if (!email) return toast.info(t('Önce e-postanızı yazın.', 'Enter your email first.'))
                      void run('magic', async () => {
                        await s.sendMagicLink(email)
                        toast.success(t('Giriş bağlantısı gönderildi.', 'Sign-in link sent.'))
                      })
                    }}
                  >
                    <Mail size={14} className="mr-1 inline" />
                    {t('Şifresiz bağlantı', 'Email me a link')}
                  </button>
                  <button
                    type="button"
                    className="text-slate-500"
                    onClick={() => {
                      if (!email) return toast.info(t('Önce e-postanızı yazın.', 'Enter your email first.'))
                      void run('reset', async () => {
                        await s.resetPassword(email)
                        toast.success(t('Şifre sıfırlama e-postası gönderildi.', 'Password reset email sent.'))
                      })
                    }}
                  >
                    {t('Şifremi unuttum', 'Forgot password')}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        {mode === 'demo' && (
          <div className="mt-5 rounded-2xl bg-white/10 p-4 text-white backdrop-blur">
            <p className="mb-1 font-semibold">{t('Demo hesaplarıyla deneyin', 'Try the demo accounts')}</p>
            <p className="mb-3 text-xs text-brand-100">
              {t('Şifre:', 'Password:')} <b>{DEMO_PASSWORD}</b> · {t('Google düğmesi demoda yönetici olarak girer.', 'In demo, Google signs in as admin.')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => run(a.email, () => s.signInWithPassword(a.email, DEMO_PASSWORD).then(() => nav(from, { replace: true })))}
                  className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-left text-sm font-medium hover:bg-white/25"
                >
                  <a.icon size={16} />
                  {t(a.tr, a.en)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
