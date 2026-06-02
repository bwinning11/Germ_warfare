import type { GameState, BreachOrder, ZoneId } from './types'
import { neighbors } from './map'

/** Number of consecutive ticks a breach order must be applied to open a barrier edge. */
export const BREACH_TICKS = 3

/**
 * Checks whether a breach order is valid:
 * - Target must be a real zone.
 * - At least one 'you'-owned zone must share a *barrier* edge with the target.
 *   (If the barrier is already gone there is nothing to breach.)
 */
function isValidBreach(state: GameState, order: BreachOrder): boolean {
  const target = state.map.zones.find(z => z.id === order.target)
  if (!target) return false

  const ownedZones = state.map.zones.filter(z => z.owner === 'you')
  return ownedZones.some(owned => {
    const ns = neighbors(state.map, owned.id)
    return ns.some(n => n.id === order.target && n.barrier)
  })
}

/**
 * Applies all breach orders to advance barrier-opening progress.
 * Returns an updated state (pure — no mutation).
 *
 * Logic per valid breach order:
 * - Increment breachProgress[target] by 1.
 * - If progress reaches BREACH_TICKS, set both directed edges (from→target and
 *   target→from) to barrier:false and clear the progress entry.
 * - Invalid orders are ignored (no owned zone on barrier edge to target).
 */
export function applyBreach(state: GameState, orders: BreachOrder[]): GameState {
  let progress = { ...state.breachProgress }
  let edges = state.map.edges.map(e => ({ ...e }))

  const validTargets = new Set(
    orders
      .filter(o => isValidBreach({ ...state, map: { ...state.map, edges } }, o))
      .map(o => o.target),
  )

  for (const target of validTargets) {
    progress[target] = (progress[target] ?? 0) + 1

    if (progress[target] >= BREACH_TICKS) {
      // Open both directed edges that form the undirected barrier pair.
      // We identify the "from" zone: the you-owned zone adjacent via a barrier edge.
      const ownerZone = findBarrierOwnerZone(state, target as ZoneId)
      if (ownerZone) {
        edges = edges.map(e => {
          if ((e.from === ownerZone && e.to === target) ||
              (e.from === target && e.to === ownerZone)) {
            return { ...e, barrier: false }
          }
          return e
        })
      }
      // Clear progress
      const { [target]: _done, ...rest } = progress
      progress = rest
    }
  }

  return {
    ...state,
    breachProgress: progress,
    map: { ...state.map, edges },
  }
}

/**
 * Finds the 'you'-owned zone that has a barrier edge to `target`.
 * Returns its id, or null if none found.
 */
function findBarrierOwnerZone(state: GameState, target: ZoneId): ZoneId | null {
  const ownedZones = state.map.zones.filter(z => z.owner === 'you')
  for (const owned of ownedZones) {
    const ns = neighbors(state.map, owned.id)
    if (ns.some(n => n.id === target && n.barrier)) {
      return owned.id
    }
  }
  return null
}
