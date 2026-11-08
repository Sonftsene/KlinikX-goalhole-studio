import { type AuthChangeEvent, type SupabaseClient, createClient } from '@supabase/supabase-js'
import type { AppUser, FamilyData, FamilySettings, Relation } from '../types'
import type { AuthListener, Repo, SignUpInput, TableName } from './types'
import { nowIso, uid } from '../lib/format'

/** App collection → database table (see supabase/schema.sql). */
const DB_TABLE: Record<TableName, string> = {
  persons: 'persons',
  relations: 'relations',
  users: 'profiles',
  grants: 'grants',
  accessRequests: 'access_requests',
  changeRequests: 'change_requests',
  audit: 'audit',
  invites: 'invites',
  notifications: 'notifications',
  settings: 'settings',
}

const DEFAULT_SETTINGS: FamilySettings = { familyName: 'Ailemiz', allowSignup: true, hideLivingDetails: true }

const PAGE = 1000
const BULK = 500

type Row = Record<string, unknown> & { id: string; data?: Record<string, unknown> | null }
type Obj = Record<string, unknown> & { id: string }

/** JSON copy without undefined values (jsonb can't store them anyway). */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null)) as T
}

/** App object → database row (key columns + full object in `data`). */
function toRow(table: TableName, obj: Obj): Row {
  const data = clean(obj) as Record<string, unknown>
  switch (table) {
    case 'persons':
      return { id: obj.id, data, updated_at: (obj.updatedAt as string) || nowIso() }
    case 'relations': {
      const r = obj as unknown as Relation
      return r.kind === 'parent'
        ? { id: r.id, kind: 'parent', from_id: r.parentId, to_id: r.childId, data }
        : { id: r.id, kind: 'partner', from_id: r.aId, to_id: r.bId, data }
    }
    case 'users': {
      // _pw is a demo-only field; never store it.
      delete data._pw
      return {
        id: obj.id,
        email: (obj.email as string) ?? '',
        role: (obj.role as string) ?? 'member',
        status: (obj.status as string) ?? 'pending',
        person_id: (obj.personId as string) ?? null,
        data,
      }
    }
    case 'grants':
      return {
        id: obj.id,
        user_id: obj.userId,
        scope: obj.scope,
        person_id: obj.personId ?? null,
        expires_at: obj.expiresAt ?? null,
        data,
      }
    case 'accessRequests':
      return { id: obj.id, user_id: obj.userId, status: obj.status ?? 'pending', data }
    case 'changeRequests':
      return { id: obj.id, user_id: obj.userId, status: obj.status ?? 'pending', person_id: obj.personId ?? null, data }
    case 'audit':
      return { id: obj.id, user_id: obj.userId ?? null, data, created_at: obj.createdAt ?? nowIso() }
    case 'invites':
      return { id: obj.id, code: String(obj.code ?? '').toUpperCase(), used_by: obj.usedBy ?? null, data }
    case 'notifications':
      return { id: obj.id, user_id: obj.userId, read: !!obj.read, data }
    case 'settings': {
      delete data.id
      return { id: 'main', data }
    }
  }
}

/** Database row → app object. Key columns win over the copy inside `data`. */
function fromRow(table: TableName, row: Row): Obj {
  const base = { ...(row.data ?? {}), id: row.id } as Obj
  if (table === 'users') {
    return {
      ...base,
      email: (row.email as string) ?? (base.email as string) ?? '',
      role: row.role ?? base.role ?? 'member',
      status: row.status ?? base.status ?? 'pending',
      personId: (row.person_id as string | null) ?? undefined,
      displayName: (base.displayName as string) || String(row.email ?? '').split('@')[0],
      createdAt: (base.createdAt as string) || (row.created_at as string) || nowIso(),
    }
  }
  if (table === 'notifications') return { ...base, read: !!row.read }
  if (table === 'invites') return { ...base, code: row.code, usedBy: (row.used_by as string | null) ?? undefined }
  if (table === 'accessRequests' || table === 'changeRequests') return { ...base, status: row.status }
  return base
}

/** Supabase auth errors → friendly Turkish text. */
function friendly(err: unknown): Error {
  const msg = String((err as { message?: string })?.message ?? err ?? '')
  const m = msg.toLowerCase()
  const map: [string, string][] = [
    ['invalid login credentials', 'E-posta veya şifre hatalı.'],
    ['email not confirmed', 'E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın.'],
    ['user already registered', 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.'],
    ['already been registered', 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.'],
    ['password should be at least', 'Şifre en az 6 karakter olmalı.'],
    ['weak password', 'Şifre çok zayıf. Daha uzun bir şifre seçin.'],
    ['unable to validate email', 'Geçerli bir e-posta adresi girin.'],
    ['invalid email', 'Geçerli bir e-posta adresi girin.'],
    ['rate limit', 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.'],
    ['security purposes', 'Güvenlik nedeniyle kısa bir süre beklemeniz gerekiyor.'],
    ['provider is not enabled', 'Google ile giriş henüz etkinleştirilmemiş. Yöneticinin Supabase ayarlarından Google’ı açması gerekiyor.'],
    ['unsupported provider', 'Google ile giriş henüz etkinleştirilmemiş.'],
    ['signups not allowed', 'Yeni kayıtlar şu an kapalı.'],
    ['failed to fetch', 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'],
    ['network', 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'],
    ['jwt expired', 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.'],
    ['row-level security', 'Bu işlem için yetkiniz yok.'],
    ['permission denied', 'Bu işlem için yetkiniz yok.'],
    ['violates foreign key', 'İlgili kişi bulunamadı (silinmiş olabilir).'],
    ['duplicate key', 'Bu kayıt zaten mevcut.'],
    ['payload too large', 'Dosya çok büyük.'],
    ['mime type', 'Bu dosya türü desteklenmiyor.'],
  ]
  for (const [k, v] of map) if (m.includes(k)) return new Error(v)
  return new Error(msg || 'Beklenmeyen bir hata oluştu.')
}

function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw friendly(res.error)
  return res
}

function extOf(file: Blob): string {
  const t = file.type
  if (t === 'image/webp') return 'webp'
  if (t === 'image/png') return 'png'
  if (t === 'image/gif') return 'gif'
  if (t === 'application/pdf') return 'pdf'
  if (t.startsWith('image/')) return 'jpg'
  const name = (file as File).name
  const m = name?.match(/\.([a-z0-9]{2,5})$/i)
  return m ? m[1].toLowerCase() : 'bin'
}

/** Multi-user backend: Supabase Postgres + Auth (e-posta, sihirli bağlantı, Google) + Storage. */
export class SupabaseRepo implements Repo {
  readonly mode = 'supabase' as const
  readonly client: SupabaseClient
  private listeners = new Set<AuthListener>()

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
    this.client.auth.onAuthStateChange((event, session) => this.handleAuthEvent(event, !!session))
  }

  private get redirectUrl(): string {
    return `${window.location.origin}${import.meta.env.BASE_URL}`
  }

  private handleAuthEvent(event: AuthChangeEvent, hasSession: boolean) {
    // The store loads the initial session itself; only react to real changes.
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
    // Supabase calls must not run inside this callback (they can deadlock), so defer.
    setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') await this.promptNewPassword()
      const user = hasSession ? await this.currentUser().catch(() => null) : null
      for (const l of this.listeners) l(user)
    }, 0)
  }

  /** After a "forgot password" link the user lands here with a recovery session. */
  private async promptNewPassword() {
    const pw = window.prompt('Yeni şifrenizi girin (en az 6 karakter):')
    if (!pw) return
    const { error } = await this.client.auth.updateUser({ password: pw })
    window.alert(error ? friendly(error).message : 'Şifreniz güncellendi.')
  }

  // ── auth ──

  async currentUser(): Promise<AppUser | null> {
    const { data } = await this.client.auth.getSession()
    const authUser = data.session?.user
    if (!authUser) return null
    const res = check(await this.client.from('profiles').select('*').eq('id', authUser.id).maybeSingle())
    if (res.data) return fromRow('users', res.data as Row) as unknown as AppUser

    // Profile missing (e.g. deleted by an admin or schema installed later): recreate as pending.
    const meta = (authUser.user_metadata ?? {}) as Record<string, string | undefined>
    const user: AppUser = {
      id: authUser.id,
      email: authUser.email ?? '',
      displayName: meta.display_name || meta.full_name || meta.name || (authUser.email ?? '').split('@')[0],
      avatarUrl: meta.avatar_url || meta.picture,
      role: 'member',
      status: 'pending',
      provider: authUser.app_metadata?.provider === 'google' ? 'google' : 'email',
      createdAt: nowIso(),
    }
    const ins = await this.client.from('profiles').insert(toRow('users', user as unknown as Obj)).select('*').maybeSingle()
    if (ins.error) throw friendly(ins.error)
    return ins.data ? (fromRow('users', ins.data as Row) as unknown as AppUser) : user
  }

  async signInWithGoogle(): Promise<void> {
    check(
      await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: this.redirectUrl, queryParams: { prompt: 'select_account' } },
      }),
    )
    // The browser now redirects to Google; the session is picked up on return.
  }

  async signInWithPassword(email: string, password: string): Promise<AppUser> {
    check(await this.client.auth.signInWithPassword({ email: email.trim(), password }))
    const user = await this.currentUser()
    if (!user) throw new Error('Giriş yapılamadı.')
    if (user.status === 'blocked') {
      await this.client.auth.signOut()
      throw new Error('Bu hesap engellenmiş. Lütfen yöneticiyle iletişime geçin.')
    }
    return user
  }

  async signUp(input: SignUpInput): Promise<AppUser | 'check-email'> {
    const code = input.inviteCode?.trim().toUpperCase()
    if (code) {
      const ok = await this.client.rpc('check_invite', { p_code: code })
      if (ok.error) throw friendly(ok.error)
      if (!ok.data) throw new Error('Davet kodu geçersiz, süresi dolmuş veya kullanılmış.')
    }
    const res = check(
      await this.client.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          emailRedirectTo: this.redirectUrl,
          data: { display_name: input.displayName?.trim() || undefined, invite_code: code || undefined },
        },
      }),
    )
    if (!res.data.session) return 'check-email'
    const user = await this.currentUser()
    if (!user) return 'check-email'
    return user
  }

  async sendMagicLink(email: string): Promise<void> {
    check(await this.client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: this.redirectUrl, shouldCreateUser: true } }))
  }

  async resetPassword(email: string): Promise<void> {
    check(await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: this.redirectUrl }))
  }

  async redeemInvite(code: string): Promise<AppUser> {
    const res = await this.client.rpc('redeem_invite', { p_code: code.trim().toUpperCase() })
    if (res.error) {
      // Messages raised by the SQL function are already Turkish.
      const msg = String(res.error.message ?? '')
      throw /davet|giriş|profil|engellen/i.test(msg) ? new Error(msg) : friendly(res.error)
    }
    const user = await this.currentUser()
    if (!user) throw new Error('Giriş yapılamadı.')
    return user
  }

  /** Limited search a pending user can run to say "this is me" (min. 3 letters, max. 10 results). */
  async searchClaimCandidates(q: string): Promise<{ id: string; firstName: string; lastName: string; maidenName?: string; birthYear?: string }[]> {
    const res = check(await this.client.rpc('search_claim_candidates', { q }))
    return ((res.data as Record<string, string | null>[]) ?? []).map((r) => ({
      id: r.id ?? '',
      firstName: r.first_name ?? '',
      lastName: r.last_name ?? '',
      maidenName: r.maiden_name ?? undefined,
      birthYear: r.birth_year || undefined,
    }))
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
    for (const l of this.listeners) l(null)
  }

  onAuthChange(cb: AuthListener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  // ── data ──

  /** Reads a whole table page by page (RLS returns only allowed rows). */
  private async fetchAll(table: TableName): Promise<Obj[]> {
    const out: Obj[] = []
    for (let from = 0; ; from += PAGE) {
      const res = check(
        await this.client
          .from(DB_TABLE[table])
          .select('*')
          .order('id')
          .range(from, from + PAGE - 1),
      )
      const rows = (res.data ?? []) as Row[]
      for (const r of rows) out.push(fromRow(table, r))
      if (rows.length < PAGE) break
    }
    return out
  }

  async load(): Promise<FamilyData> {
    const tables: Exclude<TableName, 'settings'>[] = [
      'persons',
      'relations',
      'users',
      'grants',
      'accessRequests',
      'changeRequests',
      'audit',
      'invites',
      'notifications',
    ]
    const [lists, settingsRes] = await Promise.all([
      Promise.all(tables.map((t) => this.fetchAll(t))),
      this.client.from('settings').select('*').eq('id', 'main').maybeSingle(),
    ])
    const data = Object.fromEntries(tables.map((t, i) => [t, lists[i]])) as unknown as FamilyData
    const stored = (settingsRes.data as Row | null)?.data ?? {}
    data.settings = { ...DEFAULT_SETTINGS, ...(stored as Partial<FamilySettings>) }
    data.audit.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    data.notifications.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    return data
  }

  async upsert<T extends { id: string }>(table: TableName, row: T): Promise<void> {
    const dbRow = toRow(table, row as unknown as Obj)
    const name = DB_TABLE[table]
    if (table === 'settings') {
      check(await this.client.from(name).upsert(dbRow))
      return
    }
    // Update first: members may update rows they can't insert (e.g. their own person),
    // and an INSERT … ON CONFLICT would be rejected by the insert policy.
    const { id: _id, ...changes } = dbRow
    const upd = check(await this.client.from(name).update(changes).eq('id', dbRow.id).select('id'))
    if ((upd.data ?? []).length) return
    const ins = await this.client.from(name).insert(dbRow)
    if (ins.error) {
      // The row may exist but be invisible to this user (RLS) — report it as a permission issue.
      if (String(ins.error.code) === '23505') throw new Error('Bu işlem için yetkiniz yok.')
      throw friendly(ins.error)
    }
  }

  async upsertMany<T extends { id: string }>(table: TableName, rows: T[]): Promise<void> {
    if (!rows.length) return
    // Bulk writes (imports) are manager-only and can use a real upsert.
    if (table === 'persons' || table === 'relations') {
      const dbRows = rows.map((r) => toRow(table, r as unknown as Obj))
      for (let i = 0; i < dbRows.length; i += BULK) check(await this.client.from(DB_TABLE[table]).upsert(dbRows.slice(i, i + BULK)))
      return
    }
    for (const r of rows) await this.upsert(table, r)
  }

  async remove(table: TableName, id: string): Promise<void> {
    if (table === 'settings') return
    check(await this.client.from(DB_TABLE[table]).delete().eq('id', id))
  }

  async uploadFile(file: Blob, folder: string, name?: string): Promise<string> {
    const safeFolder = folder.replace(/^\/+|\/+$/g, '') || 'persons/misc'
    const base = (name || uid()).replace(/[^a-zA-Z0-9_-]/g, '_')
    const path = `${safeFolder}/${base}.${extOf(file)}`
    check(
      await this.client.storage.from('photos').upload(path, file, {
        contentType: file.type || undefined,
        cacheControl: '31536000',
        upsert: false,
      }),
    )
    return this.client.storage.from('photos').getPublicUrl(path).data.publicUrl
  }
}

/** Exposed for tests / debugging. */
export const __test = { toRow, fromRow, friendly }
