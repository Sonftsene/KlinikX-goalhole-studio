import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Briefcase,
  Camera,
  ChevronLeft,
  ChevronRight,
  Cross,
  GitFork,
  GraduationCap,
  Home,
  ImagePlus,
  Link2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useFamily } from '../store/useFamily'
import type { Person, Relation } from '../types'
import { canEditDirectly, canManage, canProposeChange, canView, maskPerson } from '../lib/permissions'
import { ageOf, displayName, formatDate, fullName } from '../lib/format'
import { orderedParents, partnerIds, partnerLink, siblingIds } from '../lib/graph'
import { TAG_INFO, personPalette } from '../lib/colors'
import { describeRelation } from '../lib/kinship'
import { useLang, useT } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { Avatar } from '../components/person/Avatar'
import { PersonRow } from '../components/person/PersonRow'
import { PersonPicker } from '../components/person/PersonPicker'
import { PhotoCropper } from '../components/photo/PhotoCropper'
import { Badge, Button, EmptyState, Sheet, attempt, confirmAction, cx, toast } from '../components/ui'
import { compressImage, fileToDataUrl } from '../lib/image'

const PARENT_TYPE: Record<string, [string, string]> = {
  adopted: ['evlat edinilmiş', 'adopted'],
  step: ['üvey', 'step'],
  foster: ['koruyucu aile', 'foster'],
}
const PARTNER_TYPE: Record<string, [string, string]> = {
  married: ['Evli', 'Married'],
  divorced: ['Boşanmış', 'Divorced'],
  widowed: ['Eşi vefat etti', 'Widowed'],
  partner: ['Birlikte', 'Partner'],
  engaged: ['Nişanlı', 'Engaged'],
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value?: ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-sm break-words">{value}</div>
      </div>
    </div>
  )
}

export default function PersonPage() {
  const { id = '' } = useParams()
  const t = useT()
  const lang = useLang((s) => s.lang)
  const nav = useNavigate()
  const dark = useTheme((s) => s.dark)
  const s = useFamily()
  const { user, graph, visible, ownLine, data } = s
  const raw = graph.persons.get(id)
  const [pickFor, setPickFor] = useState<null | 'parent' | 'child' | 'partner'>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [viewer, setViewer] = useState<number | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)

  const relation = useMemo(() => {
    if (!user?.personId || !raw || user.personId === raw.id) return null
    try {
      return describeRelation(graph, user.personId, raw.id, lang)
    } catch {
      return null
    }
  }, [graph, user?.personId, raw, lang])

  if (!raw) return <EmptyState title={t('Kişi bulunamadı', 'Person not found')} action={<Button onClick={() => nav(-1)}>{t('Geri', 'Back')}</Button>} />
  if (!canView(visible, id))
    return (
      <EmptyState
        icon={<Lock size={36} />}
        title={t('Bu kişiyi görme izniniz yok', 'You cannot view this person')}
        text={t('Kendi soyunuz dışındaki akrabalar için yöneticiden erişim isteyebilirsiniz.', 'Ask the admin for access to relatives outside your line.')}
        action={
          <Link to={`/taleplerim?kisi=${id}`}>
            <Button>{t('Erişim iste', 'Request access')}</Button>
          </Link>
        }
      />
    )

  const p = maskPerson(raw, user, data.settings, ownLine)
  const pal = personPalette(p, dark)
  const isMe = user?.personId === p.id
  const direct = canEditDirectly(user, p.id)
  const canPropose = canProposeChange(user, visible, p.id)
  const manager = canManage(user)
  const show = (ids: string[]) => ids.map((x) => graph.persons.get(x)).filter((x): x is Person => !!x && canView(visible, x.id))

  const parents = show(orderedParents(graph, p.id))
  const partners = show(partnerIds(graph, p.id))
  const siblings = show(siblingIds(graph, p.id))
  const childLinks = (graph.children.get(p.id) ?? []).filter((l) => canView(visible, l.childId))
  const myPending = data.changeRequests.filter((r) => r.personId === p.id && r.status === 'pending' && (r.userId === user?.id || manager))
  const age = ageOf(p)
  const photos = p.photos ?? []

  // Children grouped by the other parent.
  const groups = new Map<string, Person[]>()
  for (const l of childLinks) {
    const child = graph.persons.get(l.childId)
    if (!child) continue
    const other = (graph.parents.get(child.id) ?? []).find((x) => x.parentId !== p.id)?.parentId ?? ''
    groups.set(other, [...(groups.get(other) ?? []), child])
  }

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    setCropSrc(await fileToDataUrl(file))
  }

  const onCropped = async (blob: Blob) => {
    const r = await attempt(() => s.setProfilePhoto(p.id, blob))
    if (r === 'saved') toast.success(t('Fotoğraf güncellendi', 'Photo updated'))
    if (r === 'requested') toast.info(t('Fotoğraf değişikliği yönetici onayına gönderildi', 'Photo change sent for approval'))
    if (r) setCropSrc(null)
  }

  const onAlbum = async (files: FileList | null) => {
    if (!files?.length) return
    for (const f of Array.from(files)) {
      const blob = await compressImage(f)
      const r = await attempt(() => s.addPhoto(p.id, blob))
      if (r === 'requested') toast.info(t('Fotoğraf onaya gönderildi', 'Photo sent for approval'))
    }
    toast.success(t('Albüm güncellendi', 'Album updated'))
  }

  const linkExisting = async (other: Person) => {
    if (!pickFor) return
    const rel: Relation =
      pickFor === 'partner'
        ? { id: crypto.randomUUID(), kind: 'partner', aId: p.id, bId: other.id, type: 'married' }
        : pickFor === 'parent'
          ? { id: crypto.randomUUID(), kind: 'parent', parentId: other.id, childId: p.id, type: 'biological' }
          : { id: crypto.randomUUID(), kind: 'parent', parentId: p.id, childId: other.id, type: 'biological' }
    const r = await attempt(() => s.addRelation(rel))
    if (r === 'saved') toast.success(t('Bağlantı eklendi', 'Link added'))
    if (r === 'requested') toast.info(t('Bağlantı onaya gönderildi', 'Link sent for approval'))
  }

  const unlink = async (relId?: string) => {
    if (!relId || !confirmAction(t('Bu bağlantı kaldırılsın mı?', 'Remove this link?'))) return
    const r = await attempt(() => s.removeRelation(relId))
    if (r === 'requested') toast.info(t('Talep onaya gönderildi', 'Sent for approval'))
  }

  const parentRelId = (parentId: string) => (graph.parents.get(p.id) ?? []).find((l) => l.parentId === parentId)
  const childRel = (childId: string) => (graph.children.get(p.id) ?? []).find((l) => l.childId === childId)

  const canEditFamily = manager || canPropose
  const removeBtn = (relId?: string) =>
    canEditFamily && relId ? (
      <button onClick={(e) => (e.preventDefault(), e.stopPropagation(), unlink(relId))} className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700" aria-label={t('Bağlantıyı kaldır', 'Unlink')}>
        <X size={16} />
      </button>
    ) : null

  const familyBlock = (title: string, list: ReactNode, empty?: string) => (
    <div>
      <h3 className="section-title mt-4">{title}</h3>
      {list || <p className="px-1 text-sm text-slate-400">{empty ?? '—'}</p>}
    </div>
  )

  return (
    <div className="pb-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => (onPickFile(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={albumRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (onAlbum(e.target.files), (e.target.value = ''))} />

      <button onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft size={16} /> {t('Geri', 'Back')}
      </button>

      {/* Header */}
      <section className="card overflow-hidden">
        <div className="h-24 sm:h-28" style={{ background: `linear-gradient(135deg, ${pal.border}, ${pal.accent}55)` }} />
        <div className="-mt-14 px-5 pb-5">
          <div className="flex items-end gap-4">
            <button onClick={() => (photos.length ? setViewer(Math.max(0, photos.findIndex((x) => x.url === p.photoUrl))) : undefined)} className="rounded-full bg-white p-1 shadow-lg dark:bg-slate-900">
              <Avatar person={p} size={104} ring={isMe} />
            </button>
            {(direct || canPropose) && (
              <Button variant="secondary" size="sm" icon={<Camera size={16} />} onClick={() => fileRef.current?.click()} className="mb-2">
                {t('Fotoğraf', 'Photo')}
              </Button>
            )}
          </div>
          <h1 className={cx('mt-3 text-2xl font-bold', p.isDeceased && 'text-slate-700 dark:text-slate-200')}>
            {fullName(p)} {p.isDeceased && <span title={t('Vefat etti', 'Deceased')}>🕊</span>}
          </h1>
          <div className="mt-0.5 text-sm text-slate-500">
            {[p.maidenName && `${t('Kızlık soyadı', 'Née')}: ${p.maidenName}`, p.nickname && `“${p.nickname}”`].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isMe && <Badge color="amber">{t('Bu sizsiniz', 'This is you')}</Badge>}
            {relation && <Badge color="brand">{t('Sizin', 'Your')} {relation.term}</Badge>}
            <Badge color={p.gender === 'male' ? 'blue' : p.gender === 'female' ? 'pink' : 'slate'}>
              {p.gender === 'male' ? t('Erkek', 'Male') : p.gender === 'female' ? t('Kadın', 'Female') : t('Diğer', 'Other')}
            </Badge>
            {age !== undefined && <Badge>{p.isDeceased ? t(`${age} yaşında vefat etti`, `died aged ${age}`) : t(`${age} yaşında`, `${age} years old`)}</Badge>}
            {p.tags?.map((tag) => TAG_INFO[tag] && <Badge key={tag} color={tag === 'sehit' ? 'red' : 'amber'}>{TAG_INFO[tag].emoji} {lang === 'en' ? TAG_INFO[tag].en : TAG_INFO[tag].tr}</Badge>)}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
            {(direct || canPropose) && (
              <Button icon={<Pencil size={16} />} onClick={() => nav(`/kisi/${p.id}/duzenle`)}>
                {direct ? t('Düzenle', 'Edit') : t('Düzenleme öner', 'Suggest edit')}
              </Button>
            )}
            <Button variant="secondary" icon={<GitFork size={16} />} onClick={() => nav(`/agac?kisi=${p.id}`)}>
              {t('Ağaçta göster', 'Show in tree')}
            </Button>
            {!isMe && user?.personId && (
              <Button variant="secondary" icon={<Users size={16} />} onClick={() => nav(`/akrabalik?a=${user.personId}&b=${p.id}`)}>
                {t('Akrabalığımız', 'Our relation')}
              </Button>
            )}
          </div>
          {!direct && canPropose && (
            <p className="mt-3 text-xs text-slate-500">
              <Lock size={12} className="mr-1 inline" />
              {t('Bu kişide yaptığınız değişiklikler yönetici onayından sonra yayınlanır.', 'Changes to this person are published after admin approval.')}
            </p>
          )}
        </div>
      </section>

      {myPending.length > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          {t(`${myPending.length} değişiklik onay bekliyor.`, `${myPending.length} change(s) awaiting approval.`)}{' '}
          <Link className="font-semibold underline" to={manager ? '/admin/onaylar' : '/taleplerim'}>
            {t('Görüntüle', 'View')}
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Info */}
        <section className="card px-5 py-2">
          <InfoRow icon={<span>🎂</span>} label={t('Doğum', 'Born')} value={[formatDate(p.birthDate, lang), p.birthPlace].filter(Boolean).join(' · ')} />
          {p.isDeceased && (
            <InfoRow icon={<span>🕊</span>} label={t('Vefat', 'Died')} value={[formatDate(p.deathDate, lang) || t('Tarih bilinmiyor', 'Date unknown'), p.deathPlace].filter(Boolean).join(' · ')} />
          )}
          {p.isDeceased && manager && <InfoRow icon={<Cross size={16} />} label={t('Vefat nedeni', 'Cause of death')} value={p.causeOfDeath} />}
          <InfoRow icon={<Briefcase size={16} />} label={t('Meslek', 'Occupation')} value={p.occupation} />
          <InfoRow icon={<GraduationCap size={16} />} label={t('Eğitim', 'Education')} value={p.education} />
          <InfoRow icon={<Home size={16} />} label={t('Memleket', 'Hometown')} value={p.hometown} />
          <InfoRow icon={<MapPin size={16} />} label={t('Yaşadığı yer', 'Lives in')} value={p.residence} />
          <InfoRow icon={<Phone size={16} />} label={t('Telefon', 'Phone')} value={p.phone && <a className="text-brand-700 dark:text-brand-300" href={`tel:${p.phone}`}>{p.phone}</a>} />
          <InfoRow icon={<Mail size={16} />} label={t('E-posta', 'Email')} value={p.email && <a className="text-brand-700 dark:text-brand-300" href={`mailto:${p.email}`}>{p.email}</a>} />
          <InfoRow
            icon={<span>🪦</span>}
            label={t('Kabir yeri', 'Burial place')}
            value={
              p.burialPlace &&
              (p.burialGeo ? (
                <a className="text-brand-700 dark:text-brand-300" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${p.burialGeo.lat},${p.burialGeo.lng}`}>
                  {p.burialPlace} ↗
                </a>
              ) : (
                p.burialPlace
              ))
            }
          />
          {!p.birthDate && !p.occupation && !p.birthPlace && !p.isDeceased && <p className="py-3 text-sm text-slate-400">{t('Henüz bilgi eklenmemiş.', 'No details yet.')}</p>}
        </section>

        {/* Family */}
        <section className="card px-4 pt-1 pb-4">
          <div className="flex items-center justify-between pt-3">
            <h2 className="font-semibold">{t('Ailesi', 'Family')}</h2>
            {canEditFamily && (
              <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => setAddMenu(true)}>
                {t('Ekle', 'Add')}
              </Button>
            )}
          </div>
          {familyBlock(
            t('Anne & baba', 'Parents'),
            parents.length > 0 &&
              parents.map((x) => {
                const l = parentRelId(x.id)
                const tp = l && PARENT_TYPE[l.type]
                return <PersonRow key={x.id} person={x} to={`/kisi/${x.id}`} right={removeBtn(l?.id)} subtitle={tp ? `${lang === 'en' ? tp[1] : tp[0]} · ${x.gender === 'male' ? t('baba', 'father') : t('anne', 'mother')}` : undefined} />
              }),
            t('Ebeveyn eklenmemiş', 'No parents added'),
          )}
          {familyBlock(
            t('Eşleri', 'Partners'),
            partners.length > 0 &&
              partners.map((x) => {
                const l = partnerLink(graph, p.id, x.id)
                const label = l ? (lang === 'en' ? PARTNER_TYPE[l.type][1] : PARTNER_TYPE[l.type][0]) : ''
                const dates = l?.startDate ? ` · ${formatDate(l.startDate, lang)}${l.endDate ? ' – ' + formatDate(l.endDate, lang) : ''}` : ''
                return <PersonRow key={x.id} person={x} to={`/kisi/${x.id}`} subtitle={`💍 ${label}${dates}`} right={removeBtn(l?.id)} />
              }),
          )}
          {familyBlock(
            t('Çocukları', 'Children'),
            groups.size > 0 &&
              [...groups.entries()].map(([other, kids]) => (
                <div key={other}>
                  {groups.size > 1 && (
                    <div className="mt-1 px-1 text-xs text-slate-500">
                      {other ? t(`${displayName(graph.persons.get(other))} ile`, `with ${displayName(graph.persons.get(other))}`) : t('Diğer ebeveyn bilinmiyor', 'Other parent unknown')}
                    </div>
                  )}
                  {kids.map((k) => (
                    <PersonRow key={k.id} person={k} to={`/kisi/${k.id}`} right={removeBtn(childRel(k.id)?.id)} />
                  ))}
                </div>
              )),
          )}
          {siblings.length > 0 && familyBlock(t('Kardeşleri', 'Siblings'), siblings.map((x) => <PersonRow key={x.id} person={x} to={`/kisi/${x.id}`} />))}
        </section>
      </div>

      {/* Bio */}
      {(p.bio || p.notes) && (
        <section className="card mt-4 p-5">
          <h2 className="mb-2 font-semibold">{t('Hayat hikâyesi', 'Life story')}</h2>
          {p.bio && <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-300">{p.bio}</p>}
          {p.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-600 dark:bg-slate-800 dark:text-slate-300">📝 {p.notes}</p>}
        </section>
      )}

      {/* Album */}
      <section className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            {t('Fotoğraf albümü', 'Photo album')} <span className="text-sm font-normal text-slate-400">({photos.length})</span>
          </h2>
          {(direct || canPropose) && (
            <Button size="sm" variant="secondary" icon={<ImagePlus size={15} />} onClick={() => albumRef.current?.click()}>
              {t('Ekle', 'Add')}
            </Button>
          )}
        </div>
        {photos.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((ph, i) => (
              <button key={ph.id} onClick={() => setViewer(i)} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                <img src={ph.url} alt={ph.caption ?? ''} loading="lazy" className="h-full w-full object-cover" />
                {ph.url === p.photoUrl && <span className="absolute top-1 left-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{t('Profil', 'Profile')}</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t('Henüz fotoğraf yok.', 'No photos yet.')}</p>
        )}
      </section>

      {manager && (
        <div className="mt-6 flex justify-end">
          <Button
            variant="ghost"
            className="text-red-600"
            icon={<Trash2 size={16} />}
            onClick={async () => {
              if (!confirmAction(t(`${fullName(p)} ve tüm bağlantıları silinsin mi? Bu işlem geri alınamaz.`, `Delete ${fullName(p)} and all links?`))) return
              const r = await attempt(() => s.deletePerson(p.id), t('Kişi silindi', 'Person deleted'))
              if (r) nav('/liste')
            }}
          >
            {t('Kişiyi sil', 'Delete person')}
          </Button>
        </div>
      )}

      {/* Add relative menu */}
      <Sheet open={addMenu} onClose={() => setAddMenu(false)} title={t('Aileye ekle', 'Add to family')}>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['parent', t('Anne / baba', 'Parent'), '👪'],
              ['partner', t('Eş', 'Partner'), '💍'],
              ['child', t('Çocuk', 'Child'), '👶'],
              ['sibling', t('Kardeş', 'Sibling'), '🧑‍🤝‍🧑'],
            ] as const
          ).map(([as, label, emoji]) => (
            <Button key={as} variant="secondary" size="lg" onClick={() => nav(`/yeni?to=${p.id}&as=${as}`)}>
              <span className="text-lg">{emoji}</span> {t('Yeni', 'New')} {label.toLocaleLowerCase('tr')}
            </Button>
          ))}
        </div>
        <h3 className="section-title mt-5">{t('Ağaçta zaten var olan biriyle bağla', 'Link someone already in the tree')}</h3>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['parent', t('Ebeveyn', 'Parent')],
              ['partner', t('Eş', 'Partner')],
              ['child', t('Çocuk', 'Child')],
            ] as const
          ).map(([as, label]) => (
            <Button key={as} variant="outline" icon={<Link2 size={15} />} onClick={() => (setAddMenu(false), setPickFor(as))}>
              {label}
            </Button>
          ))}
        </div>
      </Sheet>

      <PersonPicker
        open={!!pickFor}
        onClose={() => setPickFor(null)}
        exclude={[p.id]}
        title={pickFor === 'parent' ? t('Ebeveyn seç', 'Choose parent') : pickFor === 'child' ? t('Çocuk seç', 'Choose child') : t('Eş seç', 'Choose partner')}
        onPick={linkExisting}
      />

      <PhotoCropper src={cropSrc} onClose={() => setCropSrc(null)} onDone={onCropped} title={t('Profil fotoğrafı', 'Profile photo')} />

      {/* Photo viewer */}
      {viewer !== null && photos[viewer] && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" onClick={() => setViewer(null)}>
          <div className="flex items-center justify-between p-3 pt-[calc(var(--safe-top)+0.75rem)]">
            <span className="text-sm opacity-70">
              {viewer + 1} / {photos.length}
            </span>
            <button className="rounded-full p-2 hover:bg-white/10" aria-label={t('Kapat', 'Close')}>
              <X />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img src={photos[viewer].url} alt="" className="max-h-full max-w-full object-contain" />
            {viewer > 0 && (
              <button className="absolute left-2 rounded-full bg-white/10 p-2" onClick={() => setViewer(viewer - 1)} aria-label="Önceki">
                <ChevronLeft />
              </button>
            )}
            {viewer < photos.length - 1 && (
              <button className="absolute right-2 rounded-full bg-white/10 p-2" onClick={() => setViewer(viewer + 1)} aria-label="Sonraki">
                <ChevronRight />
              </button>
            )}
          </div>
          {(direct || manager) && (
            <div className="pb-safe flex justify-center gap-2 p-3" onClick={(e) => e.stopPropagation()}>
              {photos[viewer].url !== p.photoUrl && direct && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await attempt(() => s.savePerson({ ...raw, photoUrl: photos[viewer].url }), t('Profil fotoğrafı yapıldı', 'Set as profile photo'))
                  }}
                >
                  {t('Profil fotoğrafı yap', 'Set as profile')}
                </Button>
              )}
              <Button
                variant="danger"
                icon={<Trash2 size={16} />}
                onClick={async () => {
                  if (!confirmAction(t('Fotoğraf silinsin mi?', 'Delete photo?'))) return
                  await attempt(() => s.removePhoto(p.id, photos[viewer].id))
                  setViewer(null)
                }}
              >
                {t('Sil', 'Delete')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
