import { useNavigate } from 'react-router-dom'
import { GitFork, HeartHandshake, MapPin, Briefcase, UserPlus, UserRound, Users, Baby, Network } from 'lucide-react'
import type { Person } from '../../types'
import { Sheet, Button } from '../../components/ui'
import { Avatar } from '../../components/person/Avatar'
import { TAG_INFO } from '../../lib/colors'
import { ageOf, displayName, formatDate } from '../../lib/format'
import { useLang, useT } from '../../lib/i18n'

/** Bottom sheet with the essentials of a tapped person. */
export function PersonSheet({
  person,
  onClose,
  onReroot,
  isMe,
  canAdd,
  meId,
  isRoot,
}: {
  person?: Person
  onClose: () => void
  onReroot: (id: string) => void
  isMe: boolean
  canAdd: boolean
  meId?: string
  isRoot: boolean
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const nav = useNavigate()
  if (!person) return null
  const age = ageOf(person)
  const go = (to: string) => {
    onClose()
    nav(to)
  }
  const facts: { icon: typeof MapPin; text: string }[] = []
  if (person.birthDate || person.birthPlace)
    facts.push({ icon: Baby, text: [t('Doğum', 'Born'), formatDate(person.birthDate, lang), person.birthPlace].filter(Boolean).join(' · ') })
  if (person.isDeceased)
    facts.push({ icon: UserRound, text: ['🕊 ' + t('Vefat', 'Died'), formatDate(person.deathDate, lang), person.deathPlace].filter(Boolean).join(' · ') })
  if (person.occupation) facts.push({ icon: Briefcase, text: person.occupation })
  if (person.residence && !person.isDeceased) facts.push({ icon: MapPin, text: person.residence })

  return (
    <Sheet open={!!person} onClose={onClose} title={t('Kişi', 'Person')}>
      <div className="flex items-center gap-4">
        <Avatar person={person} size={72} ring={isMe} />
        <div className="min-w-0">
          <h3 className="text-xl leading-tight font-bold">{displayName(person)}</h3>
          {person.nickname && <p className="text-sm text-slate-500">“{person.nickname}”</p>}
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {age !== undefined && (person.isDeceased ? t(`${age} yaşında vefat etti`, `Died aged ${age}`) : t(`${age} yaşında`, `${age} years old`))}
          </p>
          {!!person.tags?.length && (
            <div className="mt-1 flex flex-wrap gap-1">
              {person.tags.map(
                (tag) =>
                  TAG_INFO[tag] && (
                    <span key={tag} className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {TAG_INFO[tag].emoji} {lang === 'en' ? TAG_INFO[tag].en : TAG_INFO[tag].tr}
                    </span>
                  ),
              )}
            </div>
          )}
        </div>
      </div>

      {!!facts.length && (
        <ul className="mt-4 space-y-2 text-sm">
          {facts.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
              <f.icon size={16} className="mt-0.5 shrink-0 text-slate-400" />
              {f.text}
            </li>
          ))}
        </ul>
      )}
      {person.bio && <p className="mt-3 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">{person.bio}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button icon={<UserRound size={18} />} onClick={() => go(`/kisi/${person.id}`)}>
          {t('Profili aç', 'Open profile')}
        </Button>
        <Button
          variant="secondary"
          icon={<GitFork size={18} />}
          disabled={isRoot}
          onClick={() => {
            onReroot(person.id)
            onClose()
          }}
        >
          {t('Buradan ağaç', 'Tree from here')}
        </Button>
        {meId && !isMe && (
          <Button variant="outline" className="col-span-2" icon={<Network size={18} />} onClick={() => go(`/akrabalik?a=${meId}&b=${person.id}`)}>
            {t('Bu kişi benim neyim?', 'How are we related?')}
          </Button>
        )}
      </div>

      {canAdd && (
        <>
          <p className="section-title mt-5">{t('Akraba ekle', 'Add relative')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" icon={<Users size={16} />} onClick={() => go(`/yeni?to=${person.id}&as=parent`)}>
              {t('Ebeveyn', 'Parent')}
            </Button>
            <Button variant="outline" size="sm" icon={<Baby size={16} />} onClick={() => go(`/yeni?to=${person.id}&as=child`)}>
              {t('Çocuk', 'Child')}
            </Button>
            <Button variant="outline" size="sm" icon={<HeartHandshake size={16} />} onClick={() => go(`/yeni?to=${person.id}&as=partner`)}>
              {t('Eş', 'Spouse')}
            </Button>
            <Button variant="outline" size="sm" icon={<UserPlus size={16} />} onClick={() => go(`/yeni?to=${person.id}&as=sibling`)}>
              {t('Kardeş', 'Sibling')}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}
