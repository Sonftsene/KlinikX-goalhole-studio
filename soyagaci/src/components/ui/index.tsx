import { type ButtonHTMLAttributes, type ReactNode, forwardRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { create } from 'zustand'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/50',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  outline: 'border border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  const sizes = {
    sm: 'h-8 px-3 text-sm gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-5 text-base gap-2',
    icon: 'h-10 w-10 justify-center',
  }
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition select-none disabled:cursor-not-allowed',
        VARIANTS[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  )
})

export function Field({ label, hint, children, className }: { label?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'animate-slide-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="pb-safe flex gap-2 border-t border-slate-200 px-5 pt-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  )
}

// ── toasts ──
interface Toast {
  id: number
  text: string
  kind: 'success' | 'error' | 'info'
}
const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  list: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    set((s) => ({ list: [...s.list, { ...t, id }] }))
    setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), 3800)
  },
  drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (text: string) => useToasts.getState().push({ text, kind: 'success' }),
  error: (text: string) => useToasts.getState().push({ text, kind: 'error' }),
  info: (text: string) => useToasts.getState().push({ text, kind: 'info' }),
}

/** Runs an async action and shows its error as a toast. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn()
    if (success) toast.success(success)
    return r
  } catch (e) {
    toast.error((e as Error).message || 'Bir hata oluştu')
    return undefined
  }
}

export function Toaster() {
  const list = useToasts((s) => s.list)
  const drop = useToasts((s) => s.drop)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <button
          key={t.id}
          onClick={() => drop(t.id)}
          className={cx(
            'animate-fade-in pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-lg',
            t.kind === 'success' && 'bg-emerald-600 text-white',
            t.kind === 'error' && 'bg-red-600 text-white',
            t.kind === 'info' && 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {back}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div className={cx('no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
            value === o.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: 'slate' | 'brand' | 'amber' | 'red' | 'blue' | 'pink' | 'green' }) {
  const map = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200',
    pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-200',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  }
  return <span className={cx('chip', map[color])}>{children}</span>
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
      <span className="text-sm">{label}</span>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  )
}

export function confirmAction(text: string): boolean {
  return window.confirm(text)
}
