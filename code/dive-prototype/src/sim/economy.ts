import type { GameState } from './types'
import { hotConnected, connectedMultiplier } from './network'

/**
 * Calculates the biomass income for the current state.
 *
 * Only HOT (non-dormant) zones produce income. Dormant nodes are excluded from
 * both the multiplier count and the income total — they produce nothing.
 *
 * HOT zones that are core-connected share a multiplier:
 *
 *   multiplier(n) = 1 + MULT_PER_CONNECTED_NODE × (n − 1)
 *
 * where n is the number of HOT core-connected nodes.
 * HOT zones NOT in the core-connected set earn only the base (1).
 * DORMANT zones earn 0 (they neither contribute base nor multiplier income).
 *
 * Severing falls out automatically: recomputing hotConnected() after
 * the immune system clears a node drops its dependents from multiplied
 * to base with no special-case logic.
 */
export function income(state: GameState): number {
  const owned = state.map.zones.filter(z => z.owner === 'you')
  if (owned.length === 0) return 0

  const hc = hotConnected(state)
  const mult = connectedMultiplier(hc.size)

  // Hot core-connected zones earn the multiplier; hot isolated zones earn base (1)
  // Dormant zones earn nothing
  let total = 0
  for (const z of owned) {
    if (state.dormant.has(z.id)) continue  // dormant: no income
    total += hc.has(z.id) ? mult : 1
  }
  return total
}

/**
 * Returns a new state with `n` biomass deducted.
 * Returns null if state.biomass < n (insufficient funds).
 * Pure — never mutates state.
 */
export function spend(state: GameState, n: number): GameState | null {
  if (state.biomass < n) return null
  return { ...state, biomass: state.biomass - n }
}
