import type { AccessGrant, AppUser, FamilySettings, Person } from '../types'
import { type FamilyGraph, ancestorIds, descendantIds, directLineIds, partnerIds } from './graph'

export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) || 'sonft1249@gmail.com'

export function isSuperAdminEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

export function isAdmin(user?: AppUser | null): boolean {
  return !!user && user.status === 'active' && (user.role === 'admin' || isSuperAdminEmail(user.email))
}

/** Admins and editors may change the tree directly. */
export function canManage(user?: AppUser | null): boolean {
  return !!user && user.status === 'active' && (isAdmin(user) || user.role === 'editor')
}

export function isActive(user?: AppUser | null): boolean {
  return !!user && (user.status === 'active' || isSuperAdminEmail(user.email))
}

function grantValid(gr: AccessGrant): boolean {
  return !gr.expiresAt || new Date(gr.expiresAt).getTime() > Date.now()
}

/**
 * Which persons a user may see.
 * - Admin / editor: everyone.
 * - Member / guest: their own direct line (ancestors + descendants + partners),
 *   plus any branches an admin granted.
 * Returns `null` when the user can see everything.
 */
export function visiblePersonIds(
  user: AppUser | null | undefined,
  g: FamilyGraph,
  grants: AccessGrant[],
): Set<string> | null {
  if (!user || !isActive(user)) return new Set()
  if (canManage(user)) return null
  const mine = grants.filter((gr) => gr.userId === user.id && grantValid(gr))
  if (mine.some((gr) => gr.scope === 'all')) return null
  const out = new Set<string>()
  if (user.personId && g.persons.has(user.personId)) {
    for (const id of directLineIds(g, user.personId)) out.add(id)
  }
  for (const gr of mine) {
    if (gr.scope === 'branch' && gr.personId && g.persons.has(gr.personId)) {
      for (const id of directLineIds(g, gr.personId)) out.add(id)
      // A branch grant also shows siblings' families of the granted person.
      for (const a of ancestorIds(g, gr.personId, 1))
        for (const d of descendantIds(g, a)) {
          out.add(d)
          for (const sp of partnerIds(g, d)) out.add(sp)
        }
    }
  }
  return out
}

export function canView(visible: Set<string> | null, personId: string): boolean {
  return visible === null || visible.has(personId)
}

/** Can the user edit this person directly (without admin approval)? */
export function canEditDirectly(user: AppUser | null | undefined, personId: string): boolean {
  if (!user || !isActive(user)) return false
  if (canManage(user)) return true
  return user.role !== 'guest' && user.personId === personId
}

/** Can the user at least propose a change (goes to the approval queue)? */
export function canProposeChange(user: AppUser | null | undefined, visible: Set<string> | null, personId: string): boolean {
  if (!user || !isActive(user) || user.role === 'guest') return false
  return canView(visible, personId)
}

/** Hide sensitive details of living people from users who are not on their direct line. */
export function maskPerson(
  p: Person,
  user: AppUser | null | undefined,
  settings: FamilySettings,
  ownLine: Set<string> | null,
): Person {
  if (!settings.hideLivingDetails || p.isDeceased || canManage(user)) return p
  if (ownLine && ownLine.has(p.id)) return p
  if (user?.personId === p.id) return p
  const { phone: _phone, email: _email, residence: _residence, residenceGeo: _rg, notes: _notes, ...rest } = p
  return rest as Person
}

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Yönetici',
  editor: 'Aile Editörü',
  member: 'Üye',
  guest: 'Misafir',
}
