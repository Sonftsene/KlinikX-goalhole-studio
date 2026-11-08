import { describe, expect, it } from 'vitest'
import { demoSeed } from '../repo/seed'
import { buildGraph } from './graph'
import { canEditDirectly, canManage, isSuperAdminEmail, visiblePersonIds } from './permissions'
import type { AccessGrant } from '../types'

const data = demoSeed()
const g = buildGraph(data.persons, data.relations)
const user = (id: string) => data.users.find((u) => u.id === id)!

describe('permissions', () => {
  it('treats the configured email as super admin', () => {
    expect(isSuperAdminEmail('SonFT1249@gmail.com')).toBe(true)
    expect(canManage(user('u_admin'))).toBe(true)
  })

  it('admins and editors see everyone', () => {
    expect(visiblePersonIds(user('u_admin'), g, [])).toBeNull()
    expect(visiblePersonIds(user('u_murat'), g, [])).toBeNull()
  })

  it('members see only their own ancestors, descendants and partners', () => {
    const v = visiblePersonIds(user('u_zehra'), g, [])!
    for (const id of ['p_zehra', 'p_murat', 'p_elif', 'p_ali', 'p_zeynep', 'p_mehmet', 'p_fatma', 'p_hasan', 'p_hatice']) expect(v.has(id)).toBe(true)
    // Uncle, aunt, cousins and even siblings need permission.
    for (const id of ['p_selin', 'p_ece', 'p_kemal', 'p_ahmet', 'p_emre', 'p_defne']) expect(v.has(id)).toBe(false)
  })

  it('pending users see nothing', () => {
    expect(visiblePersonIds(user('u_yeni'), g, [])!.size).toBe(0)
  })

  it('branch grants add that relative’s family', () => {
    const grant: AccessGrant = { id: 'g1', userId: 'u_zehra', scope: 'branch', personId: 'p_ece', grantedBy: 'u_admin', createdAt: '' }
    const v = visiblePersonIds(user('u_zehra'), g, [grant])!
    expect(v.has('p_ece')).toBe(true)
    expect(v.has('p_selin')).toBe(true)
    expect(v.has('p_burak')).toBe(true)
  })

  it('expired grants are ignored', () => {
    const grant: AccessGrant = { id: 'g2', userId: 'u_zehra', scope: 'all', grantedBy: 'u_admin', createdAt: '', expiresAt: '2000-01-01T00:00:00Z' }
    expect(visiblePersonIds(user('u_zehra'), g, [grant])).not.toBeNull()
  })

  it('members edit only themselves directly', () => {
    expect(canEditDirectly(user('u_zehra'), 'p_zehra')).toBe(true)
    expect(canEditDirectly(user('u_zehra'), 'p_murat')).toBe(false)
    expect(canEditDirectly(user('u_admin'), 'p_murat')).toBe(true)
  })
})
