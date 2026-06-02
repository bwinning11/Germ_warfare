import type { GameMap, NeighborRef } from './types'

/**
 * Builds the one-region prototype map.
 *
 * Zones:
 *   entry      — portal (spawn / exit for the player)
 *   vessel_a   — connective tissue
 *   vessel_b   — connective tissue (bridges to the gland)
 *   organ      — portal (target / exit vector)
 *   gland      — gland, gated behind a barrier edge off vessel_b
 *
 * Edges (undirected — stored once per direction):
 *   entry  <-> vessel_a   (open)
 *   entry  <-> vessel_b   (open)
 *   vessel_a <-> organ    (open)
 *   vessel_b <-> organ    (open)
 *   vessel_b <-> gland    (barrier)
 */
export function buildMap(): GameMap {
  const zones = [
    { id: 'entry',    kind: 'portal'     as const, owner: 'none' as const, infection: 0 },
    { id: 'vessel_a', kind: 'connective' as const, owner: 'none' as const, infection: 0 },
    { id: 'vessel_b', kind: 'connective' as const, owner: 'none' as const, infection: 0 },
    { id: 'organ',    kind: 'portal'     as const, owner: 'none' as const, infection: 0 },
    { id: 'gland',    kind: 'gland'      as const, owner: 'none' as const, infection: 0 },
  ]

  // Each undirected edge is stored as two directed entries so adjacency look-ups are simple.
  const edgePairs: Array<{ from: string; to: string; barrier: boolean }> = [
    { from: 'entry',    to: 'vessel_a', barrier: false },
    { from: 'entry',    to: 'vessel_b', barrier: false },
    { from: 'vessel_a', to: 'organ',    barrier: false },
    { from: 'vessel_b', to: 'organ',    barrier: false },
    { from: 'vessel_b', to: 'gland',    barrier: true  },
  ]

  // Expand to directed edges (both directions)
  const edges = edgePairs.flatMap(e => [
    { from: e.from, to: e.to,   barrier: e.barrier },
    { from: e.to,   to: e.from, barrier: e.barrier },
  ])

  return { zones, edges }
}

/**
 * Returns all zones adjacent to `id`, with each neighbor's barrier flag.
 * Throws if `id` is not a zone in the map.
 */
export function neighbors(map: GameMap, id: string): NeighborRef[] {
  if (!map.zones.some(z => z.id === id)) {
    throw new Error(`Unknown zone id: "${id}"`)
  }
  return map.edges
    .filter(e => e.from === id)
    .map(e => ({ id: e.to, barrier: e.barrier }))
}
