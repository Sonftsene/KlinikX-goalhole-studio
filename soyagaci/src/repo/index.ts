import type { Repo } from './types'
import { LocalRepo } from './local'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''
export const isDemoMode = !SUPABASE_URL || !SUPABASE_ANON_KEY

let repo: Repo | null = null

export async function getRepo(): Promise<Repo> {
  if (repo) return repo
  if (isDemoMode) {
    repo = new LocalRepo()
  } else {
    const { SupabaseRepo } = await import('./supabase')
    repo = new SupabaseRepo(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return repo
}
