import type { GameState, ColonizeOrder, Zone } from './types'
import { neighbors } from './map'

/**
 * Number of consecutive ticks a colonize order must be applied to flip a zone.
 * At ~800ms/tick this makes a spread land in ~1.6s, so a click feels responsive.
 */
export const COLONIZE_TICKS = 2

/**
 * Standing infection a freshly colonized zone holds once captured (tunable dial).
 *
 * This is the "health" of a hold: it is the reserve the innate immune system must
 * grind through (RESPONDER_DAMAGE_PER_TICK per tick, reduced by Brute/Cyst) before
 * the zone is cleared and flips back to neutral. With this > 0, the immune system
 * can genuinely *sever* the network in real play by eating an interior chokepoint —
 * which is the central tension of the dive.
 *
 * NOTE: the 'entry' core is deliberately seeded at infection 0 (see initialState),
 * so it is never the highest-infection target while any colonized frontier node
 * exists. The immune system therefore erodes your frontier first and only reaches
 * your home portal last — a fair, legible threat. At 15 damage/tick an undefended
 * captured node clears in ~7 ticks; a Brute (−8) ~15 ticks; a Cyst (−12) ~34 ticks.
 */
export const OWNED_INFECTION = 100

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
      // Flip ownership. The new hold carries OWNED_INFECTION standing infection —
      // the reserve the immune system must grind through to reclaim it.
      zones = zones.map(z =>
        z.id === target ? { ...z, owner: 'you' as const, infection: OWNED_INFECTION } : z,
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
