import type { GameState } from './types'

/**
 * Calculates the biomass income for the current state:
 * +1 per zone owned by 'you'.
 */
export function income(state: GameState): number {
  return state.map.zones.filter(z => z.owner === 'you').length
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
