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
 * Returns the Set of ALL zone ids reachable under those constraints (hot or dormant).
 * Dormant nodes still conduct connectivity — they just don't count toward income/multiplier.
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

/**
 * Returns the subset of coreConnected zones that are HOT (not dormant).
 * This is the set used to compute the income multiplier: dormant nodes conduct
 * connectivity but do NOT count toward the multiplier or generate income.
 */
export function hotConnected(state: GameState): Set<ZoneId> {
  const cc = coreConnected(state)
  const dormant = state.dormant
  const hot = new Set<ZoneId>()
  for (const id of cc) {
    if (!dormant.has(id)) hot.add(id)
  }
  return hot
}

/**
 * Pure helper: toggle a node's dormancy state.
 * If the node is currently hot, makes it dormant (and vice versa).
 * Only valid for you-owned zones — returns state unchanged if zone is not owned.
 */
export function toggleDormant(state: GameState, zoneId: ZoneId): GameState {
  const zone = state.map.zones.find(z => z.id === zoneId)
  if (!zone || zone.owner !== 'you') return state

  const newDormant = new Set(state.dormant)
  if (newDormant.has(zoneId)) {
    newDormant.delete(zoneId)
  } else {
    newDormant.add(zoneId)
  }
  return { ...state, dormant: newDormant }
}
