import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Person } from '../../types'
import { Avatar } from './Avatar'
import { displayName, lifeSpan } from '../../lib/format'
import { TAG_INFO, personPalette } from '../../lib/colors'
import { useTheme } from '../../lib/theme'
import { useFamily } from '../../store/useFamily'
import { cx } from '../ui'

/** Compact person line used in lists, search results and pickers. */
export function PersonRow({
  person,
  to,
  onClick,
  right,
  subtitle,
  active,
}: {
  person: Person
  to?: string
  onClick?: () => void
  right?: ReactNode
  subtitle?: ReactNode
  active?: boolean
}) {
  const dark = useTheme((s) => s.dark)
  const meId = useFamily((s) => s.user?.personId)
  const pal = personPalette(person, dark)
  const isMe = meId === person.id
  const content = (
    <>
      <Avatar person={person} size={44} ring={isMe} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cx('truncate font-medium', person.isDeceased && 'text-slate-600 dark:text-slate-300')}>{displayName(person)}</span>
          {isMe && <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Ben</span>}
          {person.tags?.map((t) => TAG_INFO[t] && <span key={t} title={TAG_INFO[t].tr}>{TAG_INFO[t].emoji}</span>)}
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
          {subtitle ?? [lifeSpan(person), person.occupation, person.birthPlace].filter(Boolean).join(' · ')}
        </div>
      </div>
      {right}
    </>
  )
  const cls = cx(
    'flex w-full items-center gap-3 rounded-2xl border-l-4 px-3 py-2.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800/70',
    active && 'bg-brand-50 dark:bg-brand-900/30',
  )
  const style = { borderLeftColor: pal.border }
  if (to)
    return (
      <Link to={to} className={cls} style={style}>
        {content}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {content}
    </button>
  )
}
