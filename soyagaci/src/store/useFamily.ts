import { create } from 'zustand'
import type {
  AccessGrant,
  AccessRequest,
  AppUser,
  AuditEntry,
  ChangeRequest,
  FamilyData,
  FamilySettings,
  Invite,
  Notification,
  ParentType,
  PartnerType,
  Person,
  PersonPhoto,
  Relation,
  Role,
} from '../types'
import type { Repo, SignUpInput, TableName } from '../repo/types'
import { getRepo } from '../repo'
import { emptyData } from '../repo/seed'
import { type FamilyGraph, buildGraph, directLineIds, wouldCreateCycle } from '../lib/graph'
import { canEditDirectly, canManage, isAdmin, isSuperAdminEmail, visiblePersonIds } from '../lib/permissions'
import { fullName, nowIso, uid } from '../lib/format'

export type SaveResult = 'saved' | 'requested'

/** How a new person is attached to an existing one. */
export interface AttachSpec {
  to: string
  as: 'parent' | 'child' | 'partner' | 'sibling'
  parentType?: ParentType
  partnerType?: PartnerType
  /** When adding a child: the other parent (partner of `to`). */
  otherParentId?: string
}

interface FamilyState {
  ready: boolean
  loading: boolean
  error?: string
  mode: 'demo' | 'supabase'
  user: AppUser | null
  data: FamilyData
  graph: FamilyGraph
  /** null = can see everyone. */
  visible: Set<string> | null
  /** The user's own direct line (used for privacy masking). */
  ownLine: Set<string> | null

  init(): Promise<void>
  reload(): Promise<void>

  // auth
  signInWithGoogle(): Promise<void>
  signInWithPassword(email: string, password: string): Promise<void>
  signUp(input: SignUpInput): Promise<AppUser | 'check-email'>
  sendMagicLink(email: string): Promise<void>
  resetPassword(email: string): Promise<void>
  signOut(): Promise<void>
  claimPerson(personId: string | undefined, note: string): Promise<void>
  redeemInvite(code: string): Promise<void>
  giveConsent(): Promise<void>

  // persons & relations
  savePerson(next: Person, message?: string): Promise<SaveResult>
  addPerson(person: Person, attach?: AttachSpec, message?: string): Promise<SaveResult>
  deletePerson(id: string, message?: string): Promise<SaveResult>
  addRelation(rel: Relation, message?: string): Promise<SaveResult>
  removeRelation(id: string, message?: string): Promise<SaveResult>
  setProfilePhoto(personId: string, file: Blob, message?: string): Promise<SaveResult>
  addPhoto(personId: string, file: Blob, caption?: string): Promise<SaveResult>
  removePhoto(personId: string, photoId: string): Promise<SaveResult>
  mergePersons(keepId: string, dropId: string): Promise<void>
  importData(persons: Person[], relations: Relation[], mode: 'merge' | 'replace'): Promise<void>
  resetDemo(): Promise<void>

  // permissions & requests
  requestAccess(scope: 'all' | 'branch', personId?: string, message?: string): Promise<void>
  reviewAccess(id: string, approve: boolean, note?: string, expiresAt?: string): Promise<void>
  grantAccess(userId: string, scope: 'all' | 'branch', personId?: string, expiresAt?: string): Promise<void>
  revokeGrant(id: string): Promise<void>
  reviewChange(id: string, approve: boolean, note?: string): Promise<void>
  cancelRequest(kind: 'access' | 'change', id: string): Promise<void>

  // users & admin
  updateUser(id: string, patch: Partial<AppUser>): Promise<void>
  deleteUser(id: string): Promise<void>
  createInvite(role: Role, personId?: string, days?: number): Promise<Invite>
  deleteInvite(id: string): Promise<void>
  saveSettings(patch: Partial<FamilySettings>): Promise<void>
  markNotificationsRead(): Promise<void>
}

function derive(data: FamilyData, user: AppUser | null) {
  const graph = buildGraph(data.persons, data.relations)
  const visible = visiblePersonIds(user, graph, data.grants)
  const ownLine = user?.personId && graph.persons.has(user.personId) ? directLineIds(graph, user.personId) : null
  return { graph, visible, ownLine }
}

/** Fields that changed between two person objects. */
export function personDiff(before: Person, after: Person) {
  const changed: Record<string, unknown> = {}
  const old: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'updatedBy' || k === 'createdAt') continue
    const a = (before as unknown as Record<string, unknown>)[k]
    const b = (after as unknown as Record<string, unknown>)[k]
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      changed[k] = b ?? null
      old[k] = a ?? null
    }
  }
  return { changed, old }
}

let repoRef: Repo | null = null
const repo = () => {
  if (!repoRef) throw new Error('Repo not ready')
  return repoRef
}

export const useFamily = create<FamilyState>((set, get) => {
  // ── internal helpers ──
  const patchData = (fn: (d: FamilyData) => FamilyData) => {
    const data = fn(get().data)
    set({ data, ...derive(data, get().user) })
  }

  const upsertLocal = <T extends { id: string }>(table: Exclude<TableName, 'settings'>, row: T) => {
    patchData((d) => {
      const list = d[table] as unknown as T[]
      const i = list.findIndex((r) => r.id === row.id)
      const next = i >= 0 ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row]
      return { ...d, [table]: next }
    })
  }

  const removeLocal = (table: Exclude<TableName, 'settings'>, id: string) => {
    patchData((d) => ({ ...d, [table]: (d[table] as unknown as { id: string }[]).filter((r) => r.id !== id) }))
  }

  const write = async <T extends { id: string }>(table: Exclude<TableName, 'settings'>, row: T) => {
    await repo().upsert(table, row)
    upsertLocal(table, row)
  }

  const erase = async (table: Exclude<TableName, 'settings'>, id: string) => {
    await repo().remove(table, id)
    removeLocal(table, id)
  }

  const me = () => {
    const u = get().user
    if (!u) throw new Error('Lütfen önce giriş yapın.')
    return u
  }

  const audit = async (action: string, entity: AuditEntry['entity'], entityId?: string, before?: unknown, after?: unknown) => {
    const entry: AuditEntry = { id: uid('a'), userId: get().user?.id ?? 'system', action, entity, entityId, before, after, createdAt: nowIso() }
    try {
      await write('audit', entry)
    } catch {
      /* audit must never block the real action */
    }
  }

  const notify = async (userIds: string[], title: string, body?: string, link?: string) => {
    for (const userId of new Set(userIds)) {
      const n: Notification = { id: uid('n'), userId, title, body, link, read: false, createdAt: nowIso() }
      try {
        await write('notifications', n)
      } catch {
        /* notifications are best-effort */
      }
    }
  }

  const managers = () => get().data.users.filter((u) => canManage(u)).map((u) => u.id)

  /** Notify every admin/editor. Members can't list them, so the backend fans out when possible. */
  const notifyManagers = async (title: string, body?: string, link?: string) => {
    const r = repoRef
    if (r?.notifyManagers && !canManage(get().user)) {
      try {
        await r.notifyManagers(title, body, link)
        await get().reload()
      } catch {
        /* best-effort */
      }
      return
    }
    await notify(managers(), title, body, link)
  }

  const personName = (id?: string) => (id ? fullName(get().graph.persons.get(id)) || 'Bilinmeyen kişi' : '')

  const createRequest = async (req: Omit<ChangeRequest, 'id' | 'userId' | 'status' | 'createdAt'>) => {
    const user = me()
    const full: ChangeRequest = { ...req, id: uid('cr'), userId: user.id, status: 'pending', createdAt: nowIso() }
    await write('changeRequests', full)
    await notifyManagers('Yeni değişiklik talebi', `${user.displayName}: ${personName(req.personId) || 'yeni kişi'}`, '/admin/onaylar')
    return 'requested' as const
  }

  // ── direct (already authorised) operations ──
  const applyPersonUpdate = async (next: Person) => {
    const before = get().graph.persons.get(next.id)
    const row = { ...next, updatedAt: nowIso(), updatedBy: get().user?.id }
    await write('persons', row)
    await audit(before ? 'update_person' : 'create_person', 'person', row.id, before, row)
  }

  const relationsFor = (person: Person, attach?: AttachSpec): Relation[] => {
    if (!attach) return []
    const { graph } = get()
    const rels: Relation[] = []
    const pType = attach.parentType ?? 'biological'
    if (attach.as === 'child') {
      rels.push({ id: uid('r'), kind: 'parent', parentId: attach.to, childId: person.id, type: pType })
      if (attach.otherParentId) rels.push({ id: uid('r'), kind: 'parent', parentId: attach.otherParentId, childId: person.id, type: pType })
    } else if (attach.as === 'parent') {
      rels.push({ id: uid('r'), kind: 'parent', parentId: person.id, childId: attach.to, type: pType })
      // Auto-pair with the existing other parent.
      for (const l of graph.parents.get(attach.to) ?? []) {
        if (l.parentId !== person.id) rels.push({ id: uid('r'), kind: 'partner', aId: l.parentId, bId: person.id, type: attach.partnerType ?? 'married' })
      }
    } else if (attach.as === 'partner') {
      rels.push({ id: uid('r'), kind: 'partner', aId: attach.to, bId: person.id, type: attach.partnerType ?? 'married' })
    } else if (attach.as === 'sibling') {
      for (const l of graph.parents.get(attach.to) ?? [])
        rels.push({ id: uid('r'), kind: 'parent', parentId: l.parentId, childId: person.id, type: l.type })
    }
    return rels
  }

  const validateRelation = (rel: Relation) => {
    const { graph } = get()
    if (rel.kind === 'parent') {
      if (wouldCreateCycle(graph, rel.parentId, rel.childId)) throw new Error('Bu bağlantı döngü oluşturur (kişi kendi atası olamaz).')
      const existing = graph.parents.get(rel.childId) ?? []
      if (existing.some((l) => l.parentId === rel.parentId)) throw new Error('Bu ebeveyn bağlantısı zaten var.')
      if (existing.filter((l) => l.type === 'biological').length >= 2 && rel.type === 'biological')
        throw new Error('Bir kişinin en fazla iki biyolojik ebeveyni olabilir.')
    } else {
      if (rel.aId === rel.bId) throw new Error('Kişi kendisiyle eşleştirilemez.')
      const existing = graph.partners.get(rel.aId) ?? []
      if (existing.some((l) => l.aId === rel.bId || l.bId === rel.bId)) throw new Error('Bu eş bağlantısı zaten var.')
    }
  }

  const applyAddRelation = async (rel: Relation) => {
    validateRelation(rel)
    await write('relations', rel)
    await audit('add_relation', 'relation', rel.id, undefined, rel)
  }

  const applyRemoveRelation = async (id: string) => {
    const before = get().data.relations.find((r) => r.id === id)
    await erase('relations', id)
    await audit('remove_relation', 'relation', id, before)
  }

  const applyDeletePerson = async (id: string) => {
    const before = get().graph.persons.get(id)
    const rels = get().data.relations.filter((r) => (r.kind === 'parent' ? r.parentId === id || r.childId === id : r.aId === id || r.bId === id))
    for (const r of rels) await erase('relations', r.id)
    await erase('persons', id)
    // Unlink any account that pointed at this person.
    for (const u of get().data.users.filter((x) => x.personId === id)) await write('users', { ...u, personId: undefined })
    await audit('delete_person', 'person', id, { person: before, relations: rels })
  }

  const applyChange = async (cr: ChangeRequest) => {
    const p = cr.payload as Record<string, unknown>
    switch (cr.kind) {
      case 'update_person': {
        const cur = get().graph.persons.get(cr.personId!)
        if (!cur) throw new Error('Kişi artık mevcut değil.')
        await applyPersonUpdate({ ...cur, ...(p as Partial<Person>) })
        break
      }
      case 'create_person': {
        const person = p.person as Person
        await applyPersonUpdate(person)
        for (const r of (p.relations as Relation[]) ?? []) await applyAddRelation(r)
        break
      }
      case 'delete_person':
        await applyDeletePerson(cr.personId!)
        break
      case 'add_relation':
        await applyAddRelation(p.relation as Relation)
        break
      case 'remove_relation':
        await applyRemoveRelation(p.relationId as string)
        break
      case 'set_photo':
      case 'add_photo': {
        const cur = get().graph.persons.get(cr.personId!)
        if (!cur) throw new Error('Kişi artık mevcut değil.')
        const photo = p.photo as PersonPhoto
        const photos = [...(cur.photos ?? []).filter((x) => x.id !== photo.id), photo]
        await applyPersonUpdate({ ...cur, photos, photoUrl: cr.kind === 'set_photo' ? photo.url : cur.photoUrl || photo.url })
        break
      }
    }
  }

  const upload = async (file: Blob, personId: string, caption?: string): Promise<PersonPhoto> => {
    const url = await repo().uploadFile(file, `persons/${personId}`)
    return { id: uid('ph'), url, caption, addedBy: get().user?.id, addedAt: nowIso() }
  }

  return {
    ready: false,
    loading: false,
    mode: 'demo',
    user: null,
    data: emptyData(),
    ...derive(emptyData(), null),

    async init() {
      if (get().ready || get().loading) return
      set({ loading: true })
      try {
        repoRef = await getRepo()
        set({ mode: repoRef.mode })
        repoRef.onAuthChange(async (user) => {
          set({ user })
          await get().reload()
        })
        const user = await repoRef.currentUser()
        set({ user })
        await get().reload()
      } catch (e) {
        set({ error: (e as Error).message })
      } finally {
        set({ ready: true, loading: false })
      }
    },

    async reload() {
      if (!repoRef) return
      try {
        const user = await repoRef.currentUser()
        const data = user ? await repoRef.load() : emptyData()
        // Use the freshest copy of the signed-in user from the data set.
        const fresh = user ? data.users.find((u) => u.id === user.id) ?? user : null
        set({ data, user: fresh, error: undefined, ...derive(data, fresh) })
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    // ── auth ──
    async signInWithGoogle() {
      await repo().signInWithGoogle()
    },
    async signInWithPassword(email, password) {
      await repo().signInWithPassword(email, password)
      await get().reload()
    },
    async signUp(input) {
      const r = await repo().signUp(input)
      if (r !== 'check-email') {
        await get().reload()
        await notifyManagers('Yeni üye kaydı', `${r.displayName} (${r.email}) onay bekliyor.`, '/admin/kullanicilar')
      }
      return r
    },
    async sendMagicLink(email) {
      await repo().sendMagicLink(email)
    },
    async resetPassword(email) {
      await repo().resetPassword(email)
    },
    async signOut() {
      await repo().signOut()
      set({ user: null, data: emptyData(), ...derive(emptyData(), null) })
    },
    async claimPerson(personId, note) {
      const u = me()
      const next = { ...u, claimedPersonId: personId, claimNote: note }
      await write('users', next)
      set({ user: next })
      await notifyManagers('Kimlik eşleştirme talebi', `${u.displayName}: ${personName(personId) || note}`, '/admin/kullanicilar')
    },
    async redeemInvite(code) {
      const r = repo()
      if (!r.redeemInvite) throw new Error('Davet kodu bu sürümde desteklenmiyor.')
      await r.redeemInvite(code)
      try {
        localStorage.removeItem('soyagaci-invite')
      } catch {
        /* ignore */
      }
      await get().reload()
    },
    async giveConsent() {
      const u = me()
      const next = { ...u, consentAt: nowIso() }
      await write('users', next)
      set({ user: next })
    },

    // ── persons ──
    async savePerson(next, message) {
      const user = me()
      const before = get().graph.persons.get(next.id)
      if (!before) return get().addPerson(next, undefined, message)
      if (canEditDirectly(user, next.id)) {
        await applyPersonUpdate(next)
        return 'saved'
      }
      const { changed, old } = personDiff(before, next)
      if (!Object.keys(changed).length) return 'saved'
      return createRequest({ kind: 'update_person', personId: next.id, payload: changed, before: old, message })
    },

    async addPerson(person, attach, message) {
      const user = me()
      const row: Person = { ...person, id: person.id || uid('p'), createdAt: nowIso(), updatedAt: nowIso(), createdBy: user.id }
      const relations = relationsFor(row, attach)
      if (canManage(user)) {
        for (const r of relations) {
          // Validate against the graph including the new person.
          if (r.kind === 'parent' && r.parentId !== row.id && r.childId !== row.id) validateRelation(r)
        }
        await applyPersonUpdate(row)
        for (const r of relations) await write('relations', r)
        if (relations.length) await audit('add_relation', 'relation', row.id, undefined, relations)
        return 'saved'
      }
      return createRequest({ kind: 'create_person', personId: attach?.to, payload: { person: row, relations, attach }, message })
    },

    async deletePerson(id, message) {
      const user = me()
      if (canManage(user)) {
        await applyDeletePerson(id)
        return 'saved'
      }
      return createRequest({ kind: 'delete_person', personId: id, payload: {}, before: { name: personName(id) }, message })
    },

    async addRelation(rel, message) {
      const user = me()
      if (canManage(user)) {
        await applyAddRelation(rel)
        return 'saved'
      }
      validateRelation(rel)
      const pid = rel.kind === 'parent' ? rel.childId : rel.aId
      return createRequest({ kind: 'add_relation', personId: pid, payload: { relation: rel }, message })
    },

    async removeRelation(id, message) {
      const user = me()
      if (canManage(user)) {
        await applyRemoveRelation(id)
        return 'saved'
      }
      const rel = get().data.relations.find((r) => r.id === id)
      const pid = rel ? (rel.kind === 'parent' ? rel.childId : rel.aId) : undefined
      return createRequest({ kind: 'remove_relation', personId: pid, payload: { relationId: id }, before: { relation: rel }, message })
    },

    async setProfilePhoto(personId, file, message) {
      const user = me()
      const photo = await upload(file, personId)
      const cur = get().graph.persons.get(personId)
      if (!cur) throw new Error('Kişi bulunamadı.')
      if (canEditDirectly(user, personId)) {
        await applyPersonUpdate({ ...cur, photoUrl: photo.url, photos: [...(cur.photos ?? []), photo] })
        return 'saved'
      }
      return createRequest({ kind: 'set_photo', personId, payload: { photo }, before: { photoUrl: cur.photoUrl ?? null }, message })
    },

    async addPhoto(personId, file, caption) {
      const user = me()
      const photo = await upload(file, personId, caption)
      const cur = get().graph.persons.get(personId)
      if (!cur) throw new Error('Kişi bulunamadı.')
      if (canEditDirectly(user, personId)) {
        await applyPersonUpdate({ ...cur, photos: [...(cur.photos ?? []), photo], photoUrl: cur.photoUrl || photo.url })
        return 'saved'
      }
      return createRequest({ kind: 'add_photo', personId, payload: { photo } })
    },

    async removePhoto(personId, photoId) {
      const user = me()
      const cur = get().graph.persons.get(personId)
      if (!cur) throw new Error('Kişi bulunamadı.')
      const photo = cur.photos?.find((p) => p.id === photoId)
      const next: Person = {
        ...cur,
        photos: (cur.photos ?? []).filter((p) => p.id !== photoId),
        photoUrl: cur.photoUrl === photo?.url ? undefined : cur.photoUrl,
      }
      if (canEditDirectly(user, personId)) {
        await applyPersonUpdate(next)
        return 'saved'
      }
      return createRequest({ kind: 'update_person', personId, payload: { photos: next.photos, photoUrl: next.photoUrl ?? null }, before: { photos: cur.photos, photoUrl: cur.photoUrl } })
    },

    async mergePersons(keepId, dropId) {
      if (!canManage(get().user)) throw new Error('Yetkiniz yok.')
      if (keepId === dropId) return
      const { data, graph } = get()
      const keep = graph.persons.get(keepId)
      const drop = graph.persons.get(dropId)
      if (!keep || !drop) throw new Error('Kişi bulunamadı.')
      // Fill empty fields of the kept person with the dropped person's data.
      const merged: Person = { ...keep }
      for (const [k, v] of Object.entries(drop)) {
        const cur = (merged as unknown as Record<string, unknown>)[k]
        if ((cur === undefined || cur === '' || cur === null) && v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v
      }
      merged.photos = [...(keep.photos ?? []), ...(drop.photos ?? [])]
      merged.id = keepId
      await applyPersonUpdate(merged)
      for (const r of data.relations) {
        let next: Relation | null = null
        if (r.kind === 'parent' && (r.parentId === dropId || r.childId === dropId))
          next = { ...r, parentId: r.parentId === dropId ? keepId : r.parentId, childId: r.childId === dropId ? keepId : r.childId }
        if (r.kind === 'partner' && (r.aId === dropId || r.bId === dropId))
          next = { ...r, aId: r.aId === dropId ? keepId : r.aId, bId: r.bId === dropId ? keepId : r.bId }
        if (!next) continue
        const dup = get().data.relations.some(
          (o) =>
            o.id !== r.id &&
            o.kind === next!.kind &&
            (o.kind === 'parent'
              ? o.parentId === (next as typeof o).parentId && o.childId === (next as typeof o).childId
              : (o.aId === (next as typeof o).aId && o.bId === (next as typeof o).bId) ||
                (o.aId === (next as typeof o).bId && o.bId === (next as typeof o).aId)),
        )
        const selfLoop = next.kind === 'parent' ? next.parentId === next.childId : next.aId === next.bId
        if (dup || selfLoop) await erase('relations', r.id)
        else await write('relations', next)
      }
      for (const u of data.users.filter((x) => x.personId === dropId)) await write('users', { ...u, personId: keepId })
      await erase('persons', dropId)
      await audit('merge_persons', 'person', keepId, drop, merged)
    },

    async importData(persons, relations, mode) {
      if (!canManage(get().user)) throw new Error('Yetkiniz yok.')
      if (mode === 'replace') {
        for (const r of get().data.relations) await erase('relations', r.id)
        for (const p of get().data.persons) await erase('persons', p.id)
      }
      await repo().upsertMany('persons', persons)
      await repo().upsertMany('relations', relations)
      patchData((d) => {
        const pm = new Map(d.persons.map((p) => [p.id, p]))
        for (const p of persons) pm.set(p.id, p)
        const rm = new Map(d.relations.map((r) => [r.id, r]))
        for (const r of relations) rm.set(r.id, r)
        return { ...d, persons: [...pm.values()], relations: [...rm.values()] }
      })
      await audit('import', 'import', undefined, undefined, { persons: persons.length, relations: relations.length, mode })
    },

    async resetDemo() {
      const r = repo()
      if (r.mode !== 'demo' || !r.reset) return
      const { demoSeed } = await import('../repo/seed')
      await r.reset(demoSeed())
      await get().reload()
    },

    // ── access ──
    async requestAccess(scope, personId, message) {
      const user = me()
      const req: AccessRequest = { id: uid('ar'), userId: user.id, scope, personId, message, status: 'pending', createdAt: nowIso() }
      await write('accessRequests', req)
      await notifyManagers('Yeni erişim talebi', `${user.displayName}: ${scope === 'all' ? 'tüm ağaç' : personName(personId) + ' dalı'}`, '/admin/onaylar')
    },

    async reviewAccess(id, approve, note, expiresAt) {
      const admin = me()
      if (!canManage(admin)) throw new Error('Yetkiniz yok.')
      const req = get().data.accessRequests.find((r) => r.id === id)
      if (!req) return
      const next: AccessRequest = { ...req, status: approve ? 'approved' : 'rejected', reviewedBy: admin.id, reviewedAt: nowIso(), reviewNote: note }
      await write('accessRequests', next)
      if (approve) await get().grantAccess(req.userId, req.scope, req.personId, expiresAt)
      await notify([req.userId], approve ? 'Erişim talebiniz onaylandı' : 'Erişim talebiniz reddedildi', note, '/agac')
      await audit(approve ? 'approve_access' : 'reject_access', 'request', id, req, next)
    },

    async grantAccess(userId, scope, personId, expiresAt) {
      const admin = me()
      if (!canManage(admin)) throw new Error('Yetkiniz yok.')
      const gr: AccessGrant = { id: uid('g'), userId, scope, personId, grantedBy: admin.id, createdAt: nowIso(), expiresAt }
      await write('grants', gr)
      await audit('grant_access', 'grant', gr.id, undefined, gr)
    },

    async revokeGrant(id) {
      if (!canManage(get().user)) throw new Error('Yetkiniz yok.')
      const before = get().data.grants.find((g) => g.id === id)
      await erase('grants', id)
      await audit('revoke_access', 'grant', id, before)
    },

    async reviewChange(id, approve, note) {
      const admin = me()
      if (!canManage(admin)) throw new Error('Yetkiniz yok.')
      const req = get().data.changeRequests.find((r) => r.id === id)
      if (!req || req.status !== 'pending') return
      if (approve) await applyChange(req)
      const next: ChangeRequest = { ...req, status: approve ? 'approved' : 'rejected', reviewedBy: admin.id, reviewedAt: nowIso(), reviewNote: note }
      await write('changeRequests', next)
      await notify([req.userId], approve ? 'Değişiklik talebiniz onaylandı' : 'Değişiklik talebiniz reddedildi', note || personName(req.personId), req.personId ? `/kisi/${req.personId}` : '/')
      await audit(approve ? 'approve_change' : 'reject_change', 'request', id, req, next)
    },

    async cancelRequest(kind, id) {
      const user = me()
      const table = kind === 'access' ? 'accessRequests' : 'changeRequests'
      const req = (get().data[table] as { id: string; userId: string; status: string }[]).find((r) => r.id === id)
      if (!req || (req.userId !== user.id && !canManage(user))) return
      await erase(table, id)
    },

    // ── users ──
    async updateUser(id, patch) {
      const admin = me()
      const cur = get().data.users.find((u) => u.id === id)
      if (!cur) return
      const self = id === admin.id
      if (!canManage(admin) && !self) throw new Error('Yetkiniz yok.')
      // Only admins may change roles; nobody can demote the super admin.
      let safe: Partial<AppUser> = patch
      if (!isAdmin(admin)) {
        const { role: _r, status, personId, ...rest } = patch
        if (self) safe = { displayName: rest.displayName, avatarUrl: rest.avatarUrl }
        // Editors may approve and link regular members, but never touch admins or roles.
        else if (cur.role === 'admin') throw new Error('Yöneticiler yalnızca yönetici tarafından düzenlenebilir.')
        else safe = { ...rest, ...(status !== undefined && { status }), ...('personId' in patch && { personId }) }
      }
      if (isSuperAdminEmail(cur.email)) safe = { ...safe, role: 'admin', status: 'active' }
      const next = { ...cur, ...safe }
      await write('users', next)
      if (self) set({ user: next, ...derive(get().data, next) })
      else set(derive(get().data, get().user))
      if (patch.status === 'active' && cur.status !== 'active') await notify([id], 'Hesabınız onaylandı', 'Artık soyağacını görüntüleyebilirsiniz.', '/agac')
      await audit('update_user', 'user', id, cur, next)
    },

    async deleteUser(id) {
      const admin = me()
      if (!isAdmin(admin)) throw new Error('Yetkiniz yok.')
      const cur = get().data.users.find((u) => u.id === id)
      if (!cur || isSuperAdminEmail(cur.email)) throw new Error('Süper yönetici silinemez.')
      for (const g of get().data.grants.filter((x) => x.userId === id)) await erase('grants', g.id)
      await erase('users', id)
      await audit('delete_user', 'user', id, cur)
    },

    async createInvite(role, personId, days = 14) {
      const admin = me()
      if (!canManage(admin)) throw new Error('Yetkiniz yok.')
      const code = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
      const inv: Invite = {
        id: uid('i'),
        code,
        role: isAdmin(admin) ? role : role === 'admin' ? 'member' : role,
        personId,
        createdBy: admin.id,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
      }
      await write('invites', inv)
      await audit('create_invite', 'invite', inv.id, undefined, inv)
      return inv
    },

    async deleteInvite(id) {
      if (!canManage(get().user)) throw new Error('Yetkiniz yok.')
      await erase('invites', id)
    },

    async saveSettings(patch) {
      if (!isAdmin(get().user)) throw new Error('Yetkiniz yok.')
      const before = get().data.settings
      const next = { ...before, ...patch }
      await repo().upsert('settings', { id: 'main', ...next })
      patchData((d) => ({ ...d, settings: next }))
      await audit('update_settings', 'settings', 'main', before, next)
    },

    async markNotificationsRead() {
      const user = get().user
      if (!user) return
      for (const n of get().data.notifications.filter((x) => x.userId === user.id && !x.read)) await write('notifications', { ...n, read: true })
    },
  }
})

/** Persons the current user may see, as an array. */
export function useVisiblePersons(): Person[] {
  const persons = useFamily((s) => s.data.persons)
  const visible = useFamily((s) => s.visible)
  return visible === null ? persons : persons.filter((p) => visible.has(p.id))
}
