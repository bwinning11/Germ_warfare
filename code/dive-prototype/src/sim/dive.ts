import { buildMap } from './map'
import { income } from './economy'
import { applyColonize, COLONIZE_TICKS } from './spread'
import type { GameState, Order } from './types'

// Re-export so tests can import COLONIZE_TICKS from './dive'
export { COLONIZE_TICKS }

/**
 * Returns a fresh GameState at tick 0 using the prototype map.
 * The 'entry' zone starts owned by the player.
 */
export function initialState(): GameState {
  const map = buildMap()

  // Seed the entry zone as the player's starting foothold
  const zones = map.zones.map(z =>
    z.id === 'entry' ? { ...z, owner: 'you' as const } : z,
  )

  return {
    tick: 0,
    map: { ...map, zones },
    biomass: 0,
    colonizeProgress: {},
  }
}

/**
 * Advances the simulation by one tick. Pure — never mutates state.
 *
 * Order of operations each tick:
 *   1. Apply colonize orders (advance infection / flip ownership).
 *   2. Add biomass income (+1 per you-owned zone).
 */
export function step(state: GameState, orders: Order[]): GameState {
  // 1. Apply colonize orders
  const afterOrders = applyColonize(state, orders)

  // 2. Biomass income
  const gained = income(afterOrders)

  return {
    ...afterOrders,
    tick: afterOrders.tick + 1,
    biomass: afterOrders.biomass + gained,
  }
}
