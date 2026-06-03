import type { GameState } from './types'
import { coreConnected, connectedMultiplier } from './network'

/**
 * Calculates the biomass income for the current state.
 *
 * Each you-owned zone contributes a base of 1 biomass.
 * Zones that are core-connected (reachable from 'entry' through a
 * contiguous chain of you-owned open-edge nodes) share a multiplier:
 *
 *   multiplier(n) = 1 + MULT_PER_CONNECTED_NODE × (n − 1)
 *
 * where n is the size of the core-connected set.
 * Owned zones NOT in the core-connected set earn only the base (1).
 *
 * Severing falls out automatically: recomputing coreConnected() after
 * the immune system clears a node drops its dependents from multiplied
 * to base with no special-case logic.
 */
export function income(state: GameState): number {
  const owned = state.map.zones.filter(z => z.owner === 'you')
  if (owned.length === 0) return 0

  const cc = coreConnected(state)
  const mult = connectedMultiplier(cc.size)

  // Core-connected zones earn the multiplier; isolated zones earn base (1)
  let total = 0
  for (const z of owned) {
    total += cc.has(z.id) ? mult : 1
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
