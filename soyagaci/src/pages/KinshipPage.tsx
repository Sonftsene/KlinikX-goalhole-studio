import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUpDown, Crown, Heart, Network, UserPlus } from 'lucide-react'
import type { Person } from '../types'
import { useFamily } from '../store/useFamily'
import { useLang, useT } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { CATEGORY_ORDER, type KinCategory, type RelationResult, categoryLabel, describeRelation, relationsFrom, stepLabel } from '../lib/kinship'
import { displayName, genitive, lifeSpan } from '../lib/format'
import { personPalette } from '../lib/colors'
import { Badge, Button, EmptyState, PageHeader, cx } from '../components/ui'
import { Avatar } from '../components/person/Avatar'
import { PersonPicker } from '../components/person/PersonPicker'
import { PersonRow } from '../components/person/PersonRow'
import { useVisibleGraph } from '../features/premium/useVisibleGraph'

const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s)

function PersonSlot({ person, label, onPick, isMe }: { person?: Person; label: string; onPick: () => void; isMe?: boolean }) {
  const t = useT()
  const dark = useTheme((s) => s.dark)
  const pal = person ? personPalette(person, dark) : undefined
  return (
    <button onClick={onPick} className="card flex w-full items-center gap-3 border-l-4 p-3 text-left transition hover:shadow-md" style={{ borderLeftColor: pal?.border ?? '#cbd5e1' }}>
      {person ? (
        <Avatar person={person} size={48} ring={isMe} />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 dark:border-slate-700">
          <UserPlus size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</span>
        <span className="block truncate font-semibold">{person ? displayName(person) : t('Kişi seçin', 'Choose a person')}</span>
        {person && <span className="block truncate text-xs text-slate-500">{lifeSpan(person)}</span>}
      </span>
      <span className="text-xs font-medium text-brand-700 dark:text-brand-300">{t('Değiştir', 'Change')}</span>
    </button>
  )
}

function PathChain({ result, graphPersons }: { result: RelationResult; graphPersons: Map<string, Person> }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const meId = useFamily((s) => s.user?.personId)
  return (
    <ol className="relative">
      {result.path.map((id, i) => {
        const p = graphPersons.get(id)
        if (!p) return null
        const step = i > 0 ? result.steps[i - 1] : undefined
        const prev = i > 0 ? graphPersons.get(result.path[i - 1]) : undefined
        const isCommon = result.commonAncestorId === id && result.steps.length > 1 && i > 0 && i < result.path.length - 1
        return (
          <li key={id}>
            {step && (
              <div className="flex items-center gap-2 py-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex h-6 w-6 items-center justify-center">
                  {step === 'S' ? <Heart size={14} className="text-pink-500" /> : <ArrowDown size={14} className={cx(step === 'U' && 'rotate-180')} />}
                </span>
                <span>
                  {prev ? (
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {lang === 'en' ? `${prev.firstName}'s ${stepLabel(step, p, 'en')}` : `${genitive(prev.firstName)} ${stepLabel(step, p, 'tr')}`}
                    </span>
                  ) : null}
                </span>
              </div>
            )}
            <Link
              to={`/kisi/${id}`}
              className={cx(
                'flex items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800',
                isCommon && 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700',
                (i === 0 || i === result.path.length - 1) && 'bg-brand-50 dark:bg-brand-900/20',
              )}
            >
              <Avatar person={p} size={44} ring={meId === id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{displayName(p)}</span>
                <span className="block truncate text-xs text-slate-500">{lifeSpan(p)}</span>
              </span>
              {isCommon && (
                <Badge color="amber">
                  <Crown size={12} /> {t('Ortak ata', 'Common ancestor')}
                </Badge>
              )}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

export default function KinshipPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { persons, graph } = useVisibleGraph()
  const meId = useFamily((s) => s.user?.personId)
  const [params, setParams] = useSearchParams()
  const myId = meId && graph.persons.has(meId) ? meId : undefined
  const fromId = params.get('a') && graph.persons.has(params.get('a')!) ? params.get('a')! : myId
  const toId = params.get('b') && graph.persons.has(params.get('b')!) ? params.get('b')! : undefined
  const [picking, setPicking] = useState<'a' | 'b' | null>(null)

  const setPair = (a?: string, b?: string) => {
    const next = new URLSearchParams()
    if (a) next.set('a', a)
    if (b) next.set('b', b)
    setParams(next, { replace: true })
  }

  const result = useMemo(() => (fromId && toId ? describeRelation(graph, fromId, toId, lang) : null), [graph, fromId, toId, lang])
  const reverse = useMemo(() => (fromId && toId ? describeRelation(graph, toId, fromId, lang) : null), [graph, fromId, toId, lang])

  const relatives = useMemo(() => {
    if (!myId) return []
    const all = relationsFrom(graph, myId, lang, 6)
    const groups = new Map<KinCategory, { person: Person; r: RelationResult }[]>()
    for (const [id, r] of all) {
      const p = graph.persons.get(id)
      if (!p) continue
      const list = groups.get(r.category) ?? []
      list.push({ person: p, r })
      groups.set(r.category, list)
    }
    for (const list of groups.values()) list.sort((a, b) => a.r.steps.length - b.r.steps.length || (a.person.birthDate ?? '9999').localeCompare(b.person.birthDate ?? '9999'))
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }))
  }, [graph, myId, lang])

  const from = fromId ? graph.persons.get(fromId) : undefined
  const to = toId ? graph.persons.get(toId) : undefined
  const isMeFrom = !!myId && fromId === myId
  const headline = result ? cap(isMeFrom && lang === 'tr' ? result.termYour : result.term) : ''

  return (
    <div>
      <PageHeader title={t('Akrabalık hesapla', 'Relationship calculator')} subtitle={t('İki kişi arasındaki bağı Türkçe akrabalık adlarıyla bulun', 'Find how two people are related')} />

      <div className="relative space-y-2">
        <PersonSlot person={from} isMe={isMeFrom} label={t('Kimden', 'From')} onPick={() => setPicking('a')} />
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowUpDown size={15} />}
            onClick={() => setPair(toId, fromId)}
            disabled={!fromId && !toId}
            aria-label={t('Yer değiştir', 'Swap')}
          >
            {t('Yer değiştir', 'Swap')}
          </Button>
        </div>
        <PersonSlot person={to} isMe={!!myId && toId === myId} label={t('Kime', 'To')} onPick={() => setPicking('b')} />
      </div>

      {from && to && (
        <div className="mt-5">
          {result ? (
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-6 text-center text-white">
                <div className="text-xs font-medium tracking-wider uppercase opacity-80">
                  {isMeFrom ? t('Bu kişi sizin', 'This person is your') : `${from.firstName} ${t('için', '— relationship')}`}
                </div>
                <div className="mt-1 text-3xl font-bold tracking-tight break-words">{headline}</div>
                <div className="mt-2 text-sm opacity-90">{result.sentence}</div>
                {reverse && reverse.steps.length > 0 && <div className="mt-3 text-xs opacity-75">↔ {reverse.sentence}</div>}
              </div>
              <div className="p-4">
                <div className="section-title flex items-center gap-2">
                  <Network size={14} /> {t('Bağlantı yolu', 'Connection path')} · {result.steps.length} {t('adım', 'steps')}
                </div>
                <PathChain result={result} graphPersons={graph.persons} />
              </div>
            </div>
          ) : (
            <EmptyState icon={<Network size={36} />} title={t('Bağlantı bulunamadı', 'No connection found')} text={t('Bu iki kişi arasında görebildiğiniz ağaçta bir bağ yok.', 'These two people are not connected in the part of the tree you can see.')} />
          )}
        </div>
      )}

      {myId ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t('Benim akrabalarım', 'My relatives')}</h2>
          {!relatives.length && <p className="text-sm text-slate-500">{t('Henüz bağlı akraba yok.', 'No connected relatives yet.')}</p>}
          <div className="space-y-5">
            {relatives.map(({ category, items }) => (
              <div key={category}>
                <div className="mb-1.5 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{categoryLabel(category, lang)}</h3>
                  <Badge>{items.length}</Badge>
                </div>
                <div className="card divide-y divide-slate-100 p-1 dark:divide-slate-800">
                  {items.map(({ person, r }) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      onClick={() => setPair(myId, person.id)}
                      active={toId === person.id}
                      subtitle={<span className="font-medium text-brand-700 dark:text-brand-300">{cap(lang === 'tr' ? r.termYour : r.term)}</span>}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        !persons.length || (
          <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
            {t('Hesabınız henüz ağaçtaki bir kişiyle eşleştirilmemiş. "Kimden" alanından bir kişi seçebilirsiniz.', 'Your account is not linked to a person yet. Choose someone in the "From" field.')}
          </p>
        )
      )}

      <PersonPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        persons={persons}
        title={picking === 'a' ? t('Kimden?', 'From whom?') : t('Kime?', 'To whom?')}
        onPick={(p) => (picking === 'a' ? setPair(p.id, toId) : setPair(fromId, p.id))}
      />
    </div>
  )
}
