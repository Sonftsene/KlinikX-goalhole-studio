import type { Person } from '../../types'
import { avatarColor, personPalette } from '../../lib/colors'
import { initials } from '../../lib/format'
import { cx } from '../ui'
import { useTheme } from '../../lib/theme'

export function Avatar({ person, size = 44, ring, className }: { person?: Person | null; size?: number; ring?: boolean; className?: string }) {
  const dark = useTheme((s) => s.dark)
  if (!person) return <div className={cx('rounded-full bg-slate-200 dark:bg-slate-700', className)} style={{ width: size, height: size }} />
  const pal = personPalette(person, dark)
  const style = {
    width: size,
    height: size,
    borderColor: ring ? '#f59e0b' : pal.border,
    borderWidth: Math.max(2, Math.round(size / 18)),
  }
  return (
    <div className={cx('relative shrink-0', className)} style={{ width: size, height: size }}>
      {person.photoUrl ? (
        <img
          src={person.photoUrl}
          alt=""
          loading="lazy"
          className={cx('h-full w-full rounded-full border-solid object-cover', person.isDeceased && 'grayscale')}
          style={style}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full border-solid font-semibold text-white"
          style={{ ...style, background: person.isDeceased ? '#94a3b8' : avatarColor(person.id), fontSize: size * 0.36 }}
        >
          {initials(person)}
        </div>
      )}
      {person.isDeceased ? (
        <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-white text-[10px] leading-none shadow dark:bg-slate-900" style={{ fontSize: Math.max(10, size * 0.28) }}>
          🕊
        </span>
      ) : (
        size >= 32 && <span className="absolute right-0 bottom-0 rounded-full border-2 border-white bg-green-500 dark:border-slate-900" style={{ width: size * 0.26, height: size * 0.26 }} />
      )}
    </div>
  )
}
