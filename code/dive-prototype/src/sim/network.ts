import type { GameState, ZoneId } from './types'

/**
 * Per additional connected node, income is multiplied by this factor.
 * With n nodes in the core-connected set:
 *   multiplier = 1 + MULT_PER_CONNECTED_NODE × (n − 1)
 *
 * Examples:
 *   n=1 → 1.00 (no bonus — lone portal)
 *   n=2 → 1.25
 *   n=4 → 1.75
 *   n=8 → 2.75
 */
export const MULT_PER_CONNECTED_NODE = 0.25

/**
 * Returns the income multiplier for a core-connected set of size n.
 * n=1 → 1.0; each additional node adds MULT_PER_CONNECTED_NODE.
 */
export function connectedMultiplier(n: number): number {
  return 1 + MULT_PER_CONNECTED_NODE * (n - 1)
}

/**
 * BFS from the 'entry' zone across edges that are:
 *   - open (barrier === false), AND
 *   - connect two zones both owned by 'you'
 *
 * Returns the Set of zone ids reachable under those constraints.
 * If 'entry' is not owned by 'you', returns an empty Set.
 */
export function coreConnected(state: GameState): Set<ZoneId> {
  const { map } = state

  // Build a lookup: zone id → owner
  const ownerOf = new Map<ZoneId, string>()
  for (const z of map.zones) ownerOf.set(z.id, z.owner)

  // Build adjacency: for each zone, the open neighbors also owned by 'you'
  // Edge must be open (barrier:false) and both endpoints owned by 'you'
  const adj = new Map<ZoneId, ZoneId[]>()
  for (const z of map.zones) adj.set(z.id, [])

  for (const edge of map.edges) {
    if (edge.barrier) continue
    if (ownerOf.get(edge.from) === 'you' && ownerOf.get(edge.to) === 'you') {
      adj.get(edge.from)!.push(edge.to)
    }
  }

  // BFS from 'entry'
  const visited = new Set<ZoneId>()
  if (ownerOf.get('entry') !== 'you') return visited

  const queue: ZoneId[] = ['entry']
  visited.add('entry')

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return visited
}
