import type { PartialDate, Person } from '../types'

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}_${rnd}` : rnd
}

export const nowIso = () => new Date().toISOString()

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatDate(d?: PartialDate, lang: 'tr' | 'en' = 'tr'): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = lang === 'en' ? MONTHS_EN : MONTHS_TR
  if (day) return `${Number(day)} ${months[Number(m) - 1] ?? ''} ${y}`
  if (m) return `${months[Number(m) - 1] ?? ''} ${y}`
  return y
}

export function yearOf(d?: PartialDate): number | undefined {
  if (!d) return undefined
  const y = parseInt(d.slice(0, 4), 10)
  return Number.isFinite(y) ? y : undefined
}

export function isValidPartialDate(d: string): boolean {
  return /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/.test(d)
}

/** Age today (living) or age at death. */
export function ageOf(p: Person): number | undefined {
  const by = yearOf(p.birthDate)
  if (by === undefined) return undefined
  const end = p.isDeceased ? p.deathDate : new Date().toISOString().slice(0, 10)
  const ey = yearOf(end)
  if (ey === undefined) return undefined
  let age = ey - by
  const bm = p.birthDate?.slice(5)
  const em = end?.slice(5)
  if (bm && em && bm.length === 5 && em.length === 5 && em < bm) age--
  return age >= 0 ? age : undefined
}

export function fullName(p?: Pick<Person, 'firstName' | 'lastName'> | null): string {
  if (!p) return ''
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
}

export function displayName(p?: Person | null): string {
  if (!p) return '?'
  let s = fullName(p)
  if (p.maidenName && p.maidenName !== p.lastName) s += ` (${p.maidenName})`
  return s || '?'
}

export function initials(p?: Pick<Person, 'firstName' | 'lastName'> | null): string {
  if (!p) return '?'
  return ((p.firstName?.[0] ?? '') + (p.lastName?.[0] ?? '')).toLocaleUpperCase('tr') || '?'
}

export function lifeSpan(p: Person): string {
  const b = yearOf(p.birthDate)
  const d = yearOf(p.deathDate)
  if (p.isDeceased) return `${b ?? '?'} – ${d ?? '?'}`
  return b ? `${b}` : ''
}

/** Lower-case, Turkish-aware, accent-free text for searching. */
export function normalizeTr(s?: string): string {
  if (!s) return ''
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const BACK_VOWELS = 'aıou'
const VOWELS = 'aeıioöuü'

function lastVowel(word: string): string | undefined {
  const w = word.toLocaleLowerCase('tr')
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i])) return w[i]
  return undefined
}

/** Turkish genitive suffix for a name: Ahmet → Ahmet'in, Ayşe → Ayşe'nin. */
export function genitive(name: string, apostrophe = true): string {
  const v = lastVowel(name) ?? 'e'
  const suffix = v === 'a' || v === 'ı' ? 'ın' : v === 'e' || v === 'i' ? 'in' : v === 'o' || v === 'u' ? 'un' : 'ün'
  const endsWithVowel = VOWELS.includes(name.slice(-1).toLocaleLowerCase('tr'))
  return `${name}${apostrophe ? "'" : ''}${endsWithVowel ? 'n' : ''}${suffix}`
}

/** Genitive for a possessive kinship word: "babası" → "babasının". */
export function genitiveWord(word: string): string {
  return genitive(word, false)
}

export function isBackVowelWord(word: string): boolean {
  const v = lastVowel(word)
  return !!v && BACK_VOWELS.includes(v)
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function daysUntilAnniversary(d?: PartialDate, from = new Date()): number | undefined {
  if (!d || d.length < 10) return undefined
  const m = Number(d.slice(5, 7)) - 1
  const day = Number(d.slice(8, 10))
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let next = new Date(from.getFullYear(), m, day)
  if (next < start) next = new Date(from.getFullYear() + 1, m, day)
  return Math.round((next.getTime() - start.getTime()) / 86400000)
}
