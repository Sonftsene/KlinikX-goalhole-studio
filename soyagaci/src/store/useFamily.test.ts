import { describe, expect, it } from 'vitest'
import { useFamily } from './useFamily'
import { DEMO_PASSWORD } from '../repo/local'

// Runs against the demo (in-memory) backend.
describe('approval workflow', () => {
  it('member edits to relatives go to the queue and apply after admin approval', async () => {
    const s = useFamily.getState()
    await s.init()
    await useFamily.getState().signInWithPassword('zehra@ornek.com', DEMO_PASSWORD)
    let st = useFamily.getState()
    expect(st.user?.id).toBe('u_zehra')

    // Own profile: saved directly.
    const me = st.graph.persons.get('p_zehra')!
    expect(await st.savePerson({ ...me, occupation: 'Müdür' })).toBe('saved')
    expect(useFamily.getState().graph.persons.get('p_zehra')!.occupation).toBe('Müdür')

    // Father's profile: becomes a change request.
    const dad = st.graph.persons.get('p_murat')!
    expect(await st.savePerson({ ...dad, occupation: 'Emekli mühendis' })).toBe('requested')
    st = useFamily.getState()
    expect(st.graph.persons.get('p_murat')!.occupation).toBe('Mühendis')
    const req = st.data.changeRequests.find((r) => r.personId === 'p_murat' && r.status === 'pending')!
    expect(req.payload).toEqual({ occupation: 'Emekli mühendis' })

    // Admin approves.
    await st.signOut()
    await useFamily.getState().signInWithPassword('sonft1249@gmail.com', DEMO_PASSWORD)
    await useFamily.getState().reviewChange(req.id, true, 'Tamam')
    st = useFamily.getState()
    expect(st.graph.persons.get('p_murat')!.occupation).toBe('Emekli mühendis')
    expect(st.data.changeRequests.find((r) => r.id === req.id)!.status).toBe('approved')
    expect(st.data.notifications.some((n) => n.userId === 'u_zehra')).toBe(true)
  })

  it('access requests create grants that widen visibility', async () => {
    let st = useFamily.getState()
    const ar = st.data.accessRequests.find((r) => r.userId === 'u_zehra' && r.status === 'pending')!
    await st.reviewAccess(ar.id, true)
    st = useFamily.getState()
    expect(st.data.grants.some((g) => g.userId === 'u_zehra' && g.personId === 'p_ece')).toBe(true)
    await st.signOut()
    await useFamily.getState().signInWithPassword('zehra@ornek.com', DEMO_PASSWORD)
    expect(useFamily.getState().visible!.has('p_ece')).toBe(true)
  })

  it('rejects relations that would create a cycle', async () => {
    await useFamily.getState().signOut()
    await useFamily.getState().signInWithPassword('sonft1249@gmail.com', DEMO_PASSWORD)
    await expect(
      useFamily.getState().addRelation({ id: 'x', kind: 'parent', parentId: 'p_naz', childId: 'p_mehmet', type: 'biological' }),
    ).rejects.toThrow(/döngü/)
  })
})
