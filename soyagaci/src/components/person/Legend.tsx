import { useT } from '../../lib/i18n'
import { cx } from '../ui'

/** Colour legend shown next to trees and lists. */
export function Legend({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT()
  const items = [
    { c: 'bg-blue-100 border-blue-500 dark:bg-blue-950', label: t('Erkek', 'Male') },
    { c: 'bg-pink-100 border-pink-500 dark:bg-pink-950', label: t('Kadın', 'Female') },
    { c: 'bg-slate-200 border-slate-500 dark:bg-slate-800', label: t('Vefat 🕊', 'Deceased 🕊') },
    { c: 'bg-white border-amber-500 ring-2 ring-amber-400 dark:bg-slate-900', label: t('Siz', 'You') },
  ]
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300', className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cx('inline-block h-3 w-3 rounded border-2', i.c)} />
          {i.label}
        </span>
      ))}
      {!compact && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> {t('Hayatta', 'Living')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-slate-500" /> {t('Boşanmış / üvey', 'Divorced / step')}
          </span>
        </>
      )}
    </div>
  )
}
