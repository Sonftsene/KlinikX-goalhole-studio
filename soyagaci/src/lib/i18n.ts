import { create } from 'zustand'

export type Lang = 'tr' | 'en'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('soyagaci-lang')
    if (saved === 'tr' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  return 'tr'
}

if (typeof document !== 'undefined') document.documentElement.lang = initialLang()

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem('soyagaci-lang', lang)
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang
    set({ lang })
  },
}))

/** Inline translation: t('Kaydet', 'Save'). Turkish is the main language. */
export function useT() {
  const lang = useLang((s) => s.lang)
  return (tr: string, en?: string) => (lang === 'en' && en ? en : tr)
}
