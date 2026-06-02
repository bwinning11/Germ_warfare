import { buildMap } from './map'
import type { GameState, Order } from './types'

/**
 * Returns a fresh GameState at tick 0 using the prototype map.
 */
export function initialState(): GameState {
  return {
    tick: 0,
    map: buildMap(),
  }
}

/**
 * Advances the simulation by one tick.
 *
 * Pure — never mutates `state`. Orders are accepted but not yet applied;
 * later tasks will add real order handling here.
 */
export function step(state: GameState, _orders: Order[]): GameState {
  return {
    ...state,
    tick: state.tick + 1,
    // Map is treated as immutable data; spread is safe for this tick increment.
    // When map mutations arrive (Task N+), they will deep-clone the relevant parts.
    map: state.map,
  }
}
