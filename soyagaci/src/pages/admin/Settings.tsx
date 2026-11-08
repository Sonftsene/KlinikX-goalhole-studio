import { useEffect, useState } from 'react'
import { RotateCcw, Save, ShieldCheck } from 'lucide-react'
import type { FamilySettings, Person } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { Button, Field, PageHeader, Switch, attempt, confirmAction } from '../../components/ui'
import { PersonPicker } from '../../components/person/PersonPicker'
import { PersonRow } from '../../components/person/PersonRow'
import { ADMIN_EMAIL } from '../../lib/permissions'

export default function Settings() {
  const t = useT()
  const settings = useFamily((s) => s.data.settings)
  const persons = useFamily((s) => s.data.persons)
  const graph = useFamily((s) => s.graph)
  const mode = useFamily((s) => s.mode)
  const { saveSettings, resetDemo } = useFamily.getState()
  const [form, setForm] = useState<FamilySettings>(settings)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm(settings), [settings])

  const root: Person | undefined = form.rootPersonId ? graph.persons.get(form.rootPersonId) : undefined
  const dirty = JSON.stringify(form) !== JSON.stringify(settings)
  const set = <K extends keyof FamilySettings>(k: K, v: FamilySettings[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader title={t('Aile ayarları', 'Family settings')} />
      <div className="space-y-5">
        <section className="card space-y-4 p-4">
          <Field label={t('Aile adı', 'Family name')} hint={t('Uygulamanın başlığında ve çıktılarda görünür.', 'Shown in the header and exports.')}>
            <input className="input" value={form.familyName} onChange={(e) => set('familyName', e.target.value)} />
          </Field>
          <Field label={t('Karşılama metni', 'Welcome text')} hint={t('Giriş ve ana sayfada gösterilir.', 'Shown on the login and home pages.')}>
            <textarea className="input min-h-20" value={form.welcomeText ?? ''} onChange={(e) => set('welcomeText', e.target.value)} />
          </Field>
          <div>
            <span className="label">{t('Ağacın başlangıç kişisi', 'Tree start person')}</span>
            {root ? (
              <PersonRow person={root} onClick={() => setPicker(true)} right={<span className="text-xs text-brand-700">{t('Değiştir', 'Change')}</span>} />
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setPicker(true)}>
                {t('Kişi seç', 'Choose person')}
              </Button>
            )}
            <p className="mt-1 text-xs text-slate-500">{t('Ağaç bir kişiyle eşleşmemiş yöneticiler için bu kişiden açılır.', 'The tree opens here for admins not linked to a person.')}</p>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <ShieldCheck size={18} className="text-brand-600" /> {t('Gizlilik ve üyelik', 'Privacy & membership')}
          </h2>
          <Switch checked={form.allowSignup} onChange={(v) => set('allowSignup', v)} label={t('Herkes kayıt olabilir (yönetici onayıyla)', 'Anyone can sign up (with admin approval)')} />
          <p className="-mt-1 mb-2 text-xs text-slate-500">{t('Kapalıysa yalnızca davet koduyla kayıt olunabilir.', 'If off, signup requires an invite code.')}</p>
          <Switch checked={form.hideLivingDetails} onChange={(v) => set('hideLivingDetails', v)} label={t('Hayattaki kişilerin iletişim bilgilerini gizle (KVKK)', 'Hide contact details of living people (GDPR)')} />
          <p className="-mt-1 text-xs text-slate-500">
            {t('Telefon, e-posta, adres ve notlar yalnızca kişinin kendi soyundakilere ve yöneticilere görünür.', 'Phone, email, address and notes are visible only to their own line and admins.')}
          </p>
        </section>

        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-semibold">{t('Süper yönetici', 'Super admin')}</h2>
          <p className="text-slate-600 dark:text-slate-300">
            👑 <b>{ADMIN_EMAIL}</b> — {t('bu e-postayla giriş yapan hesap her zaman tam yetkili yöneticidir ve silinemez.', 'the account signing in with this email is always a full admin and cannot be removed.')}
          </p>
        </section>

        {mode === 'demo' && (
          <section className="card border-amber-300 p-4 dark:border-amber-800">
            <h2 className="mb-1 font-semibold">{t('Demo verisi', 'Demo data')}</h2>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t('Tüm değişiklikleri silip örnek aileyi baştan yükler.', 'Deletes all changes and reloads the sample family.')}</p>
            <Button
              variant="outline"
              icon={<RotateCcw size={16} />}
              onClick={() => confirmAction(t('Demo verisi sıfırlansın mı? Bu tarayıcıdaki tüm değişiklikler silinir.', 'Reset demo data? All changes in this browser are lost.')).then((ok): unknown => ok && attempt(() => resetDemo(), t('Demo verisi sıfırlandı', 'Demo data reset')))}
            >
              {t('Demo verisini sıfırla', 'Reset demo data')}
            </Button>
          </section>
        )}
      </div>

      <div className="sticky bottom-20 z-10 mt-6 md:bottom-4">
        <Button
          size="lg"
          className="w-full shadow-lg"
          icon={<Save size={18} />}
          disabled={!dirty}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            await attempt(() => saveSettings(form), t('Ayarlar kaydedildi', 'Settings saved'))
            setBusy(false)
          }}
        >
          {dirty ? t('Değişiklikleri kaydet', 'Save changes') : t('Kaydedildi', 'Saved')}
        </Button>
      </div>

      <PersonPicker open={picker} onClose={() => setPicker(false)} persons={persons} onPick={(p) => set('rootPersonId', p.id)} />
    </div>
  )
}
