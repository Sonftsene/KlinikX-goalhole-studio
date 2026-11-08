import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Crosshair, Save } from 'lucide-react'
import { useFamily, type AttachSpec } from '../store/useFamily'
import type { GeoPoint, Gender, ParentType, PartnerType, Person } from '../types'
import { canEditDirectly, canManage, canProposeChange } from '../lib/permissions'
import { displayName, fullName, uid } from '../lib/format'
import { partnerIds } from '../lib/graph'
import { TAG_INFO } from '../lib/colors'
import { similarTo } from '../lib/duplicates'
import { useLang, useT } from '../lib/i18n'
import { Button, EmptyState, Field, PageHeader, Segmented, Switch, attempt, cx, toast } from '../components/ui'
import { PersonRow } from '../components/person/PersonRow'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Year / month / day picker that allows partial dates (only a year is fine). */
function DateInput({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const lang = useLang((s) => s.lang)
  const [y = '', m = '', d = ''] = (value ?? '').split('-')
  const emit = (ny: string, nm: string, nd: string) => {
    if (!/^\d{4}$/.test(ny)) return onChange(ny ? undefined : undefined)
    onChange(nm ? (nd ? `${ny}-${nm}-${nd}` : `${ny}-${nm}`) : ny)
  }
  const [yearText, setYearText] = useState(y)
  return (
    <div className="grid grid-cols-[1fr_1.4fr_5.5rem] gap-2">
      <select className="input px-2" value={d} disabled={!m} onChange={(e) => emit(y, m, e.target.value)} aria-label="Gün">
        <option value="">{lang === 'en' ? 'Day' : 'Gün'}</option>
        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((x) => (
          <option key={x} value={x}>
            {Number(x)}
          </option>
        ))}
      </select>
      <select className="input px-2" value={m} disabled={!y} onChange={(e) => emit(y, e.target.value, e.target.value ? d : '')} aria-label="Ay">
        <option value="">{lang === 'en' ? 'Month' : 'Ay'}</option>
        {(lang === 'en' ? MONTHS_EN : MONTHS).map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>
            {name}
          </option>
        ))}
      </select>
      <input
        className="input px-2 text-center"
        inputMode="numeric"
        maxLength={4}
        placeholder={lang === 'en' ? 'Year' : 'Yıl'}
        value={yearText}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4)
          setYearText(v)
          if (v.length === 4) emit(v, m, d)
          if (!v) onChange(undefined)
        }}
      />
    </div>
  )
}

/** Text input with a "find on map" button that geocodes the place name. */
function PlaceInput({ value, geo, onChange }: { value?: string; geo?: GeoPoint; onChange: (v: string, geo?: GeoPoint) => void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const locate = async () => {
    if (!value?.trim()) return
    setBusy(true)
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=tr&q=${encodeURIComponent(value)}`)
      const j = (await r.json()) as { lat: string; lon: string }[]
      if (j[0]) {
        onChange(value, { lat: Number(j[0].lat), lng: Number(j[0].lon) })
        toast.success(t('Konum haritaya eklendi', 'Location added to map'))
      } else toast.error(t('Konum bulunamadı', 'Place not found'))
    } catch {
      toast.error(t('Konum servisine ulaşılamadı', 'Location service unavailable'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex gap-2">
      <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value, undefined)} placeholder={t('Şehir, ilçe…', 'City, district…')} />
      <Button type="button" variant={geo ? 'primary' : 'secondary'} size="icon" loading={busy} onClick={locate} title={t('Haritada bul', 'Find on map')}>
        {!busy && <Crosshair size={18} />}
      </Button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const blank = (): Person => ({
  id: uid('p'),
  firstName: '',
  lastName: '',
  gender: 'male',
  isDeceased: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export default function PersonEditPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const t = useT()
  const nav = useNavigate()
  const s = useFamily()
  const { graph, user, visible, data } = s
  const existing = id ? graph.persons.get(id) : undefined
  const attachTo = params.get('to') ?? undefined
  const attachAs = (params.get('as') as AttachSpec['as'] | null) ?? undefined
  const anchor = attachTo ? graph.persons.get(attachTo) : undefined

  const [p, setP] = useState<Person>(() => {
    if (existing) return structuredClone(existing)
    const fresh = blank()
    // Sensible defaults when adding a relative.
    if (anchor && (attachAs === 'child' || attachAs === 'sibling')) fresh.lastName = anchor.gender === 'male' || attachAs === 'sibling' ? anchor.lastName : ''
    if (anchor && attachAs === 'partner') fresh.gender = anchor.gender === 'male' ? 'female' : 'male'
    return fresh
  })
  const partners = anchor ? partnerIds(graph, anchor.id).map((x) => graph.persons.get(x)!).filter(Boolean) : []
  const [otherParent, setOtherParent] = useState<string>(partners[0]?.id ?? '')
  const [parentType, setParentType] = useState<ParentType>('biological')
  const [partnerType, setPartnerType] = useState<PartnerType>('married')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const isNew = !existing
  const direct = isNew ? canManage(user) : canEditDirectly(user, p.id)
  const allowed = isNew ? canManage(user) || (!!anchor && canProposeChange(user, visible, anchor.id)) : direct || canProposeChange(user, visible, p.id)

  const dupes = useMemo(() => (isNew && p.firstName.length > 1 ? similarTo(p, data.persons).slice(0, 3) : []), [isNew, p, data.persons])

  if (!allowed)
    return <EmptyState title={t('Bu işlem için yetkiniz yok', 'You are not allowed to do this')} action={<Button onClick={() => nav(-1)}>{t('Geri', 'Back')}</Button>} />

  const set = <K extends keyof Person>(k: K, v: Person[K]) => setP((cur) => ({ ...cur, [k]: v }))
  const toggleTag = (tag: string) => set('tags', p.tags?.includes(tag) ? p.tags.filter((x) => x !== tag) : [...(p.tags ?? []), tag])

  const attachLabel: Record<string, string> = {
    parent: t('ebeveyni', 'parent of'),
    child: t('çocuğu', 'child of'),
    partner: t('eşi', 'partner of'),
    sibling: t('kardeşi', 'sibling of'),
  }

  const save = async () => {
    if (!p.firstName.trim()) return toast.error(t('Ad zorunludur', 'First name is required'))
    const clean: Person = { ...p, firstName: p.firstName.trim(), lastName: p.lastName.trim() }
    if (!clean.isDeceased) {
      delete clean.deathDate
      delete clean.deathPlace
      delete clean.causeOfDeath
    }
    setBusy(true)
    const r = isNew
      ? await attempt(() =>
          s.addPerson(
            clean,
            anchor && attachAs ? { to: anchor.id, as: attachAs, otherParentId: attachAs === 'child' ? otherParent || undefined : undefined, parentType, partnerType } : undefined,
            message || undefined,
          ),
        )
      : await attempt(() => s.savePerson(clean, message || undefined))
    setBusy(false)
    if (!r) return
    if (r === 'requested') {
      toast.info(t('Değişiklik yönetici onayına gönderildi', 'Sent to the admin for approval'))
      nav(anchor ? `/kisi/${anchor.id}` : existing ? `/kisi/${existing.id}` : '/')
    } else {
      toast.success(t('Kaydedildi', 'Saved'))
      nav(`/kisi/${clean.id}`, { replace: true })
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        back={
          <button onClick={() => nav(-1)} className="mt-1 rounded-full p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={t('Geri', 'Back')}>
            <ArrowLeft size={20} />
          </button>
        }
        title={isNew ? t('Yeni kişi', 'New person') : t('Düzenle', 'Edit')}
        subtitle={
          isNew && anchor && attachAs
            ? `${displayName(anchor)} ${attachLabel[attachAs]}`
            : existing
              ? fullName(existing)
              : undefined
        }
      />

      {!direct && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          {t('Bu değişiklik doğrudan kaydedilmez; yönetici onayladıktan sonra yayınlanır.', 'This change is published after admin approval.')}
        </div>
      )}

      {dupes.length > 0 && (
        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-900 dark:text-orange-100">
            <AlertTriangle size={16} /> {t('Bu kişi zaten ağaçta olabilir:', 'This person may already exist:')}
          </p>
          {dupes.map((d) => (
            <PersonRow key={d.person.id} person={d.person} to={`/kisi/${d.person.id}`} />
          ))}
        </div>
      )}

      <Section title={t('Temel bilgiler', 'Basics')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Ad *', 'First name *')}>
            <input className="input" value={p.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus={isNew} />
          </Field>
          <Field label={t('Soyad', 'Last name')}>
            <input className="input" value={p.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
          <Field label={t('Kızlık soyadı', 'Maiden name')}>
            <input className="input" value={p.maidenName ?? ''} onChange={(e) => set('maidenName', e.target.value || undefined)} />
          </Field>
          <Field label={t('Lakap', 'Nickname')}>
            <input className="input" value={p.nickname ?? ''} onChange={(e) => set('nickname', e.target.value || undefined)} />
          </Field>
        </div>
        <Field label={t('Cinsiyet', 'Gender')}>
          <Segmented<Gender>
            value={p.gender}
            onChange={(v) => set('gender', v)}
            options={[
              { value: 'male', label: `♂ ${t('Erkek', 'Male')}` },
              { value: 'female', label: `♀ ${t('Kadın', 'Female')}` },
              { value: 'other', label: t('Diğer', 'Other') },
            ]}
          />
        </Field>
        <Field label={t('Etiketler', 'Tags')}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TAG_INFO).map(([k, info]) => (
              <button
                type="button"
                key={k}
                onClick={() => toggleTag(k)}
                className={cx(
                  'chip border px-3 py-1 text-sm',
                  p.tags?.includes(k) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-700',
                )}
              >
                {info.emoji} {t(info.tr, info.en)}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {isNew && anchor && attachAs && (
        <Section title={t('Aile bağlantısı', 'Family link')}>
          {attachAs === 'child' && partners.length > 0 && (
            <Field label={t('Diğer ebeveyn', 'Other parent')}>
              <select className="input" value={otherParent} onChange={(e) => setOtherParent(e.target.value)}>
                {partners.map((x) => (
                  <option key={x.id} value={x.id}>
                    {displayName(x)}
                  </option>
                ))}
                <option value="">{t('Bilinmiyor / yok', 'Unknown / none')}</option>
              </select>
            </Field>
          )}
          {(attachAs === 'child' || attachAs === 'parent') && (
            <Field label={t('Bağ türü', 'Link type')}>
              <select className="input" value={parentType} onChange={(e) => setParentType(e.target.value as ParentType)}>
                <option value="biological">{t('Biyolojik', 'Biological')}</option>
                <option value="adopted">{t('Evlat edinilmiş', 'Adopted')}</option>
                <option value="step">{t('Üvey', 'Step')}</option>
                <option value="foster">{t('Koruyucu aile', 'Foster')}</option>
              </select>
            </Field>
          )}
          {attachAs === 'partner' && (
            <Field label={t('Evlilik durumu', 'Relationship')}>
              <select className="input" value={partnerType} onChange={(e) => setPartnerType(e.target.value as PartnerType)}>
                <option value="married">{t('Evli', 'Married')}</option>
                <option value="divorced">{t('Boşanmış', 'Divorced')}</option>
                <option value="widowed">{t('Eşi vefat etti', 'Widowed')}</option>
                <option value="engaged">{t('Nişanlı', 'Engaged')}</option>
                <option value="partner">{t('Birlikte', 'Partner')}</option>
              </select>
            </Field>
          )}
        </Section>
      )}

      <Section title={t('Doğum', 'Birth')}>
        <Field label={t('Doğum tarihi', 'Birth date')} hint={t('Sadece yıl da girebilirsiniz.', 'A year alone is fine.')}>
          <DateInput value={p.birthDate} onChange={(v) => set('birthDate', v)} />
        </Field>
        <Field label={t('Doğum yeri', 'Birth place')}>
          <PlaceInput value={p.birthPlace} geo={p.birthGeo} onChange={(v, g) => setP((c) => ({ ...c, birthPlace: v || undefined, birthGeo: g ?? (v === c.birthPlace ? c.birthGeo : undefined) }))} />
        </Field>
      </Section>

      <Section title={t('Vefat', 'Death')}>
        <Switch checked={p.isDeceased} onChange={(v) => set('isDeceased', v)} label={t('Vefat etti 🕊', 'Deceased 🕊')} />
        {p.isDeceased && (
          <>
            <Field label={t('Vefat tarihi', 'Date of death')}>
              <DateInput value={p.deathDate} onChange={(v) => set('deathDate', v)} />
            </Field>
            <Field label={t('Vefat yeri', 'Place of death')}>
              <input className="input" value={p.deathPlace ?? ''} onChange={(e) => set('deathPlace', e.target.value || undefined)} />
            </Field>
            <Field label={t('Vefat nedeni (sadece yöneticiler görür)', 'Cause (admins only)')}>
              <input className="input" value={p.causeOfDeath ?? ''} onChange={(e) => set('causeOfDeath', e.target.value || undefined)} />
            </Field>
            <Field label={t('Kabir yeri', 'Burial place')}>
              <PlaceInput value={p.burialPlace} geo={p.burialGeo} onChange={(v, g) => setP((c) => ({ ...c, burialPlace: v || undefined, burialGeo: g ?? (v === c.burialPlace ? c.burialGeo : undefined) }))} />
            </Field>
          </>
        )}
      </Section>

      <Section title={t('Hayatı', 'Life')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Meslek', 'Occupation')}>
            <input className="input" value={p.occupation ?? ''} onChange={(e) => set('occupation', e.target.value || undefined)} />
          </Field>
          <Field label={t('Eğitim', 'Education')}>
            <input className="input" value={p.education ?? ''} onChange={(e) => set('education', e.target.value || undefined)} />
          </Field>
          <Field label={t('Memleket', 'Hometown')}>
            <input className="input" value={p.hometown ?? ''} onChange={(e) => set('hometown', e.target.value || undefined)} />
          </Field>
          <Field label={t('Yaşadığı yer', 'Lives in')}>
            <PlaceInput value={p.residence} geo={p.residenceGeo} onChange={(v, g) => setP((c) => ({ ...c, residence: v || undefined, residenceGeo: g ?? (v === c.residence ? c.residenceGeo : undefined) }))} />
          </Field>
        </div>
        <Field label={t('Hayat hikâyesi', 'Life story')}>
          <textarea className="input min-h-28" value={p.bio ?? ''} onChange={(e) => set('bio', e.target.value || undefined)} placeholder={t('Anılar, hikâyeler, önemli olaylar…', 'Memories, stories, milestones…')} />
        </Field>
        <Field label={t('Notlar', 'Notes')}>
          <textarea className="input min-h-20" value={p.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} />
        </Field>
      </Section>

      <Section title={t('İletişim', 'Contact')}>
        <p className="-mt-2 text-xs text-slate-500">{t('Ayarlara göre yalnızca yakın aile ve yöneticiler görür.', 'Visible only to close family and admins (per settings).')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Telefon', 'Phone')}>
            <input className="input" type="tel" value={p.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} />
          </Field>
          <Field label={t('E-posta', 'Email')}>
            <input className="input" type="email" value={p.email ?? ''} onChange={(e) => set('email', e.target.value || undefined)} />
          </Field>
        </div>
      </Section>

      {!direct && (
        <Section title={t('Yöneticiye not', 'Note to admin')}>
          <textarea className="input min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('Bu değişikliğin nedeni…', 'Why this change…')} />
        </Section>
      )}

      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-5xl gap-2">
          <Button variant="secondary" className="flex-1 md:flex-none" onClick={() => nav(-1)}>
            {t('Vazgeç', 'Cancel')}
          </Button>
          <Button className="flex-[2] md:flex-none" size="lg" loading={busy} icon={<Save size={18} />} onClick={save}>
            {direct ? t('Kaydet', 'Save') : t('Onaya gönder', 'Send for approval')}
          </Button>
        </div>
      </div>
    </div>
  )
}
