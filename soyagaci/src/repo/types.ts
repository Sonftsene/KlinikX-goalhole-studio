import type { AppUser, FamilyData } from '../types'

/** Every collection the app stores. Settings is a single row with id "main". */
export type TableName =
  | 'persons'
  | 'relations'
  | 'users'
  | 'grants'
  | 'accessRequests'
  | 'changeRequests'
  | 'audit'
  | 'invites'
  | 'notifications'
  | 'settings'

export const TABLES: TableName[] = [
  'persons',
  'relations',
  'users',
  'grants',
  'accessRequests',
  'changeRequests',
  'audit',
  'invites',
  'notifications',
  'settings',
]

export interface SignUpInput {
  email: string
  password: string
  displayName: string
  inviteCode?: string
}

export type AuthListener = (user: AppUser | null) => void

/**
 * Storage backend. Two implementations:
 * - LocalRepo: demo mode, everything in this browser (IndexedDB).
 * - SupabaseRepo: real multi-user backend with row level security.
 */
export interface Repo {
  readonly mode: 'demo' | 'supabase'

  // ── auth ──
  currentUser(): Promise<AppUser | null>
  signInWithGoogle(): Promise<void>
  signInWithPassword(email: string, password: string): Promise<AppUser>
  signUp(input: SignUpInput): Promise<AppUser | 'check-email'>
  sendMagicLink(email: string): Promise<void>
  resetPassword(email: string): Promise<void>
  signOut(): Promise<void>
  /** Activates a pending account with an invite code (used after Google sign-in). */
  redeemInvite?(code: string): Promise<AppUser>
  onAuthChange(cb: AuthListener): () => void
  /** Server-side fan-out to all admins/editors (members cannot list them). */
  notifyManagers?(title: string, body?: string, link?: string): Promise<void>

  // ── data ──
  /** Loads everything the signed-in user is allowed to read. */
  load(): Promise<FamilyData>
  upsert<T extends { id: string }>(table: TableName, row: T): Promise<void>
  upsertMany<T extends { id: string }>(table: TableName, rows: T[]): Promise<void>
  remove(table: TableName, id: string): Promise<void>
  /** Uploads a photo/document and returns a URL the app can display. */
  uploadFile(file: Blob, folder: string, name?: string): Promise<string>
  /** Demo only: wipe and replace all data. */
  reset?(data: FamilyData): Promise<void>
}
