import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { Person } from '../../types'
import { useVisiblePersons } from '../../store/useFamily'
import { createPersonSearch } from '../../lib/search'
import { PersonRow } from './PersonRow'
import { Sheet } from '../ui'
import { useT } from '../../lib/i18n'

/** Search-and-pick dialog for choosing a person. */
export function PersonPicker({
  open,
  onClose,
  onPick,
  title,
  exclude,
  persons: override,
}: {
  open: boolean
  onClose: () => void
  onPick: (p: Person) => void
  title?: string
  exclude?: string[]
  persons?: Person[]
}) {
  const t = useT()
  const visible = useVisiblePersons()
  const persons = override ?? visible
  const [q, setQ] = useState('')
  const search = useMemo(() => createPersonSearch(persons), [persons])
  const list = (q ? search(q, 40) : persons.slice(0, 40)).filter((p) => !exclude?.includes(p.id))
  return (
    <Sheet open={open} onClose={onClose} title={title ?? t('Kişi seç', 'Choose person')}>
      <div className="relative mb-3">
        <Search size={18} className="absolute top-3 left-3 text-slate-400" />
        <input autoFocus className="input pl-10" placeholder={t('İsim, soyisim, yıl…', 'Name, surname, year…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="space-y-1">
        {list.map((p) => (
          <PersonRow
            key={p.id}
            person={p}
            onClick={() => {
              onPick(p)
              onClose()
              setQ('')
            }}
          />
        ))}
        {!list.length && <p className="py-6 text-center text-sm text-slate-500">{t('Sonuç yok', 'No results')}</p>}
      </div>
    </Sheet>
  )
}
