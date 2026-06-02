import type { GameState, ColonizeOrder, Zone } from './types'
import { neighbors } from './map'

/** Number of consecutive ticks a colonize order must be applied to flip a zone. */
export const COLONIZE_TICKS = 3

/**
 * Checks whether a colonize order is valid:
 * - Target must not already be owned by 'you'.
 * - Target must be adjacent to at least one 'you'-owned zone.
 * - The connecting edge must NOT be a barrier.
 */
function isValidColonize(state: GameState, order: ColonizeOrder): boolean {
  const target = state.map.zones.find(z => z.id === order.target)
  if (!target) return false
  if (target.owner === 'you') return false

  // Find any you-owned zone that has a non-barrier edge to the target
  const ownedZones = state.map.zones.filter(z => z.owner === 'you')
  return ownedZones.some(owned => {
    const ns = neighbors(state.map, owned.id)
    return ns.some(n => n.id === order.target && !n.barrier)
  })
}

/**
 * Applies all colonize orders to advance infection progress.
 * Returns an updated state (pure — no mutation).
 *
 * Logic per valid colonize order:
 * - Increment colonizeProgress[target] by 1.
 * - If progress reaches COLONIZE_TICKS, flip owner to 'you',
 *   reset infection to 0, and remove the progress entry.
 * - Invalid orders (non-adjacent, barrier-gated, already owned) are ignored.
 */
export function applyColonize(state: GameState, orders: ColonizeOrder[]): GameState {
  // Work with mutable copies of progress and zones, then return new state.
  let progress = { ...state.colonizeProgress }
  let zones: Zone[] = state.map.zones.map(z => ({ ...z }))

  // Only keep progress entries for targets that still have valid pending orders
  // (if the player stops sending an order, progress freezes — not reset).
  const validTargets = new Set(
    orders
      .filter(o => isValidColonize({ ...state, map: { ...state.map, zones } }, o))
      .map(o => o.target),
  )

  for (const target of validTargets) {
    progress[target] = (progress[target] ?? 0) + 1

    if (progress[target] >= COLONIZE_TICKS) {
      // Flip ownership
      zones = zones.map(z =>
        z.id === target ? { ...z, owner: 'you' as const, infection: 0 } : z,
      )
      // Clear the progress entry
      const { [target]: _done, ...rest } = progress
      progress = rest
    } else {
      // Ramp infection as visual feedback (progress / K * 100)
      zones = zones.map(z =>
        z.id === target
          ? { ...z, infection: Math.round((progress[target] / COLONIZE_TICKS) * 100) }
          : z,
      )
    }
  }

  return {
    ...state,
    colonizeProgress: progress,
    map: { ...state.map, zones },
  }
}
