import { create } from 'zustand'

export type ThemePref = 'light' | 'dark' | 'system'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function apply(pref: ThemePref, large: boolean) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('text-large', large)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#0f766e')
  return dark
}

interface ThemeState {
  pref: ThemePref
  dark: boolean
  largeText: boolean
  setPref(p: ThemePref): void
  setLargeText(v: boolean): void
}

export const useTheme = create<ThemeState>((set, get) => {
  const pref = (read('soyagaci-theme') as ThemePref) || 'system'
  const largeText = read('soyagaci-large') === '1'
  const dark = typeof document !== 'undefined' ? apply(pref, largeText) : false
  if (typeof window !== 'undefined')
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (get().pref === 'system') set({ dark: apply('system', get().largeText) })
    })
  return {
    pref,
    dark,
    largeText,
    setPref(p) {
      try {
        localStorage.setItem('soyagaci-theme', p)
      } catch {
        /* ignore */
      }
      set({ pref: p, dark: apply(p, get().largeText) })
    },
    setLargeText(v) {
      try {
        localStorage.setItem('soyagaci-large', v ? '1' : '0')
      } catch {
        /* ignore */
      }
      apply(get().pref, v)
      set({ largeText: v })
    },
  }
})
