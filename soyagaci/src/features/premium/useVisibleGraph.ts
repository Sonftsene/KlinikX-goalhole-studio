import { useMemo } from 'react'
import { useFamily, useVisiblePersons } from '../../store/useFamily'
import { buildGraph, type FamilyGraph } from '../../lib/graph'
import { maskPerson } from '../../lib/permissions'
import type { Person } from '../../types'

/**
 * Graph limited to the persons the current user may see, with private
 * details of living relatives masked. Premium pages only use this, so hidden
 * relatives never appear in paths, lists, maps or exports.
 */
export function useVisibleGraph(): { persons: Person[]; graph: FamilyGraph } {
  const raw = useVisiblePersons()
  const relations = useFamily((s) => s.data.relations)
  const user = useFamily((s) => s.user)
  const settings = useFamily((s) => s.data.settings)
  const ownLine = useFamily((s) => s.ownLine)
  const key = raw.map((p) => p.id + p.updatedAt).join(',')
  return useMemo(() => {
    const persons = raw.map((p) => maskPerson(p, user, settings, ownLine))
    return { persons, graph: buildGraph(persons, relations) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, relations, user, settings, ownLine])
}
