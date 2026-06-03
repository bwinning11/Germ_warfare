import type { GameMap, NeighborRef } from './types'

/**
 * Builds the multi-region prototype map.
 *
 * Zones (10 total):
 *   entry      — portal  : spawn / exit for the player
 *   vessel_a   — connective : CHOKEPOINT — the only path to the upper lobe (organ, vessel_c)
 *   vessel_b   — connective : second arm out of entry, leads to lower lobe
 *   vessel_c   — connective : upper lobe branch off vessel_a
 *   vessel_d   — connective : deep junction — connects lower lobe to the loop
 *   vessel_e   — connective : loop back to entry (entry→vessel_e→vessel_d creates a cycle)
 *   organ      — portal  : first exit portal, reachable via vessel_a (two sub-routes)
 *   organ_b    — portal  : second exit portal, reachable via vessel_d (different route)
 *   gland      — gland   : barrier-gated off vessel_b (original barrier)
 *   pickup     — pickup  : deep reward node, barrier-gated off vessel_d (second barrier)
 *
 * Adjacency (undirected):
 *   entry    <-> vessel_a  (open)       ← upper arm
 *   entry    <-> vessel_b  (open)       ← lower arm
 *   entry    <-> vessel_e  (open)       ← loop back-edge
 *   vessel_a <-> vessel_c  (open)       ← upper lobe branch
 *   vessel_a <-> organ     (open)       ← direct route to organ from chokepoint
 *   vessel_b <-> vessel_d  (open)       ← lower to deep junction
 *   vessel_b <-> organ     (open)       ← second route to organ (creates loop with vessel_a)
 *   vessel_b <-> gland     (barrier)    ← original barrier
 *   vessel_c <-> organ     (open)       ← organ reachable from upper lobe too
 *   vessel_d <-> organ_b   (open)       ← second organ
 *   vessel_d <-> vessel_e  (open)       ← completes entry→vessel_e→vessel_d→vessel_b→entry loop
 *   vessel_d <-> pickup    (barrier)    ← second barrier, deep reward
 *
 * Loops / multiple paths:
 *   entry → vessel_a → organ           (upper route to organ)
 *   entry → vessel_b → organ           (lower route to organ — loop with upper)
 *   entry → vessel_a → vessel_c → organ (third sub-path through upper lobe)
 *   entry → vessel_b → vessel_d → vessel_e → entry  (back-loop)
 *
 * Chokepoint: vessel_a — removing it disconnects organ, vessel_c from entry
 *   (only path to the upper lobe).
 */
export function buildMap(): GameMap {
  const zones = [
    { id: 'entry',    kind: 'portal'     as const, owner: 'none' as const, infection: 0 },
    { id: 'vessel_a', kind: 'connective' as const, owner: 'none' as const, infection: 0 },
    { id: 'vessel_b', kind: 'connective' as const, owner: 'none' as const, infection: 0 },
    { id: 'vessel_c', kind: 'connective' as const, owner: 'none' as const, infection: 0 },
    { id: 'vessel_d', kind: 'connective' as const, owner: 'none' as const, infection: 0 },
    { id: 'vessel_e', kind: 'connective' as const, owner: 'none' as const, infection: 0 },
    { id: 'organ',    kind: 'portal'     as const, owner: 'none' as const, infection: 0 },
    { id: 'organ_b',  kind: 'portal'     as const, owner: 'none' as const, infection: 0 },
    { id: 'gland',    kind: 'gland'      as const, owner: 'none' as const, infection: 0 },
    { id: 'pickup',   kind: 'pickup'     as const, owner: 'none' as const, infection: 0 },
  ]

  // Each undirected edge is stored as two directed entries so adjacency look-ups are simple.
  const edgePairs: Array<{ from: string; to: string; barrier: boolean }> = [
    // Upper arm from entry
    { from: 'entry',    to: 'vessel_a', barrier: false },
    // Lower arm from entry
    { from: 'entry',    to: 'vessel_b', barrier: false },
    // Loop back-edge from entry
    { from: 'entry',    to: 'vessel_e', barrier: false },
    // Upper lobe: chokepoint vessel_a branches to vessel_c and directly to organ
    { from: 'vessel_a', to: 'vessel_c', barrier: false },
    { from: 'vessel_a', to: 'organ',    barrier: false },
    // Lower arm: vessel_b reaches organ (second route) and leads deep
    { from: 'vessel_b', to: 'organ',    barrier: false },
    { from: 'vessel_b', to: 'vessel_d', barrier: false },
    // Original barrier: gland gated off vessel_b
    { from: 'vessel_b', to: 'gland',    barrier: true  },
    // Upper lobe: vessel_c also connects to organ
    { from: 'vessel_c', to: 'organ',    barrier: false },
    // Deep junction: vessel_d → second organ and loop completion
    { from: 'vessel_d', to: 'organ_b',  barrier: false },
    { from: 'vessel_d', to: 'vessel_e', barrier: false },
    // Second barrier: pickup is deep behind a barrier off vessel_d
    { from: 'vessel_d', to: 'pickup',   barrier: true  },
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
