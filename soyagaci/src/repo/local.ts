import { get, set } from 'idb-keyval'
import type { AppUser, FamilyData } from '../types'
import type { AuthListener, Repo, SignUpInput, TableName } from './types'
import { demoSeed } from './seed'
import { isSuperAdminEmail } from '../lib/permissions'
import { nowIso, uid } from '../lib/format'

const DB_KEY = 'soyagaci-demo-db-v1'
const SESSION_KEY = 'soyagaci-demo-session'
// Demo accounts all use this password so anyone can try every role.
export const DEMO_PASSWORD = 'demo1234'

function readSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeSession(userId: string | null) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* private mode: session lasts only for this tab */
  }
}

/** Demo backend: one shared dataset stored in this browser's IndexedDB. */
export class LocalRepo implements Repo {
  readonly mode = 'demo' as const
  private data: FamilyData | null = null
  private listeners = new Set<AuthListener>()
  private memorySession: string | null = null

  private async db(): Promise<FamilyData> {
    if (this.data) return this.data
    let stored: FamilyData | undefined
    try {
      stored = await get<FamilyData>(DB_KEY)
    } catch {
      stored = undefined
    }
    this.data = stored ?? demoSeed()
    if (!stored) await this.persist()
    return this.data
  }

  private async persist() {
    try {
      await set(DB_KEY, this.data)
    } catch {
      /* storage unavailable; keep data in memory */
    }
  }

  private sessionId() {
    return readSession() ?? this.memorySession
  }

  private emit(user: AppUser | null) {
    for (const l of this.listeners) l(user)
  }

  async currentUser(): Promise<AppUser | null> {
    const id = this.sessionId()
    if (!id) return null
    const db = await this.db()
    return db.users.find((u) => u.id === id) ?? null
  }

  private async loginAs(user: AppUser) {
    const db = await this.db()
    user.lastSeenAt = nowIso()
    await this.persist()
    this.memorySession = user.id
    writeSession(user.id)
    this.emit(db.users.find((u) => u.id === user.id) ?? user)
    return user
  }

  /** In demo mode Google sign-in logs into the admin account so the full app can be explored. */
  async signInWithGoogle(): Promise<void> {
    const db = await this.db()
    const admin = db.users.find((u) => isSuperAdminEmail(u.email))
    if (admin) await this.loginAs(admin)
  }

  async signInWithPassword(email: string, password: string): Promise<AppUser> {
    const db = await this.db()
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!user) throw new Error('Bu e-posta ile kayıtlı hesap bulunamadı.')
    if (password !== DEMO_PASSWORD && password !== (user as AppUser & { _pw?: string })._pw)
      throw new Error(`Şifre hatalı. Demo hesaplarının şifresi: ${DEMO_PASSWORD}`)
    if (user.status === 'blocked') throw new Error('Bu hesap engellenmiş. Lütfen yöneticiyle iletişime geçin.')
    return this.loginAs(user)
  }

  async signUp(input: SignUpInput): Promise<AppUser> {
    const db = await this.db()
    const email = input.email.trim().toLowerCase()
    if (db.users.some((u) => u.email.toLowerCase() === email)) throw new Error('Bu e-posta zaten kayıtlı.')
    const invite = input.inviteCode
      ? db.invites.find((i) => i.code.toUpperCase() === input.inviteCode!.trim().toUpperCase() && !i.usedBy)
      : undefined
    if (input.inviteCode && !invite) throw new Error('Davet kodu geçersiz veya kullanılmış.')
    const admin = isSuperAdminEmail(email)
    const user: AppUser & { _pw?: string } = {
      id: uid('u'),
      email,
      displayName: input.displayName || email.split('@')[0],
      role: admin ? 'admin' : invite?.role ?? 'member',
      status: admin || invite ? 'active' : 'pending',
      personId: invite?.personId,
      provider: 'email',
      createdAt: nowIso(),
      consentAt: nowIso(),
      _pw: input.password,
    }
    db.users.push(user)
    if (invite) {
      invite.usedBy = user.id
      invite.usedAt = nowIso()
    }
    await this.persist()
    return this.loginAs(user)
  }

  async sendMagicLink(): Promise<void> {
    throw new Error('Demo modunda e-posta gönderilemez. Demo hesaplarından biriyle giriş yapın.')
  }

  async resetPassword(): Promise<void> {
    throw new Error(`Demo modunda tüm hesapların şifresi: ${DEMO_PASSWORD}`)
  }

  async signOut(): Promise<void> {
    this.memorySession = null
    writeSession(null)
    this.emit(null)
  }

  onAuthChange(cb: AuthListener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  async load(): Promise<FamilyData> {
    return structuredClone(await this.db())
  }

  async upsert<T extends { id: string }>(table: TableName, row: T): Promise<void> {
    await this.upsertMany(table, [row])
  }

  async upsertMany<T extends { id: string }>(table: TableName, rows: T[]): Promise<void> {
    const db = await this.db()
    if (table === 'settings') {
      db.settings = { ...db.settings, ...(rows[0] as unknown as FamilyData['settings']) }
      delete (db.settings as unknown as { id?: string }).id
    } else {
      const list = db[table] as unknown as T[]
      for (const row of rows) {
        const i = list.findIndex((r) => r.id === row.id)
        const copy = structuredClone(row)
        if (i >= 0) list[i] = copy
        else list.push(copy)
      }
    }
    await this.persist()
  }

  async remove(table: TableName, id: string): Promise<void> {
    if (table === 'settings') return
    const db = await this.db()
    const list = db[table] as unknown as { id: string }[]
    const i = list.findIndex((r) => r.id === id)
    if (i >= 0) list.splice(i, 1)
    await this.persist()
  }

  async uploadFile(file: Blob): Promise<string> {
    // Demo: keep the (already compressed) image inline as a data URL.
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  async reset(data: FamilyData): Promise<void> {
    this.data = structuredClone(data)
    await this.persist()
  }
}
