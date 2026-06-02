import { buildMap } from './map'
import { income } from './economy'
import { applyColonize, COLONIZE_TICKS } from './spread'
import { applyBreach } from './breach'
import { updateHeat, heatStage } from './heat'
import { applyImmune } from './immune'
import type { GameState, Order } from './types'

// Re-export so tests can import COLONIZE_TICKS from './dive'
export { COLONIZE_TICKS }

// ─── Virality constants (tunable) ─────────────────────────────────────────────

/** Virality points earned per zone held at the moment of escape. */
export const VIRALITY_PER_ZONE = 10

/** Virality points earned per tick survived at the moment of escape. */
export const VIRALITY_PER_TICK = 2

/**
 * Computes the virality (reward) banked at the end of a successful escape.
 * Monotonically increases with both zonesHeld and ticksSurvived.
 */
export function virality(zonesHeld: number, ticksSurvived: number): number {
  return zonesHeld * VIRALITY_PER_ZONE + ticksSurvived * VIRALITY_PER_TICK
}

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
    breachProgress: {},
    heat: 0,
    dormant: false,
    responders: [],
    result: 'ongoing',
    banked: 0,
  }
}

/**
 * Advances the simulation by one tick. Pure — never mutates state.
 *
 * Order of operations each tick:
 *   1. Apply dormancy order (toggle dormant flag) if present.
 *   2. Apply colonize orders — skipped if dormant.
 *   3. Update heat: rises (owned zones + colonize activity) or decays (dormant).
 *      Heat bump from zone losses (step 4) is folded in here.
 *   4. Compute heat stage; spawn/act responders if alerted+.
 *      Zone losses from responders contribute a heat bump (applied retroactively to heat).
 *   5. Add biomass income (+1 per you-owned zone after all changes).
 */
export function step(state: GameState, orders: Order[]): GameState {
  // Guard: terminal states do not advance.
  if (state.result !== 'ongoing') return state

  // Check for a valid escape order: named portal must be kind:'portal' AND owner:'you'
  const escapeOrder = orders.find(o => o.type === 'escape') as Extract<Order, { type: 'escape' }> | undefined
  if (escapeOrder) {
    const portal = state.map.zones.find(z => z.id === escapeOrder.portal)
    if (portal && portal.kind === 'portal' && portal.owner === 'you') {
      const zonesHeld = state.map.zones.filter(z => z.owner === 'you').length
      return {
        ...state,
        result: 'escape',
        banked: virality(zonesHeld, state.tick),
      }
    }
    // Invalid escape order — fall through to normal tick processing
  }

  // 1. Handle dormancy toggle
  const hasDormancyOrder = orders.some(o => o.type === 'dormancy')
  const dormant = hasDormancyOrder ? !state.dormant : state.dormant

  // 2. Apply colonize and breach orders (both skipped while dormant)
  const colonizeOrders = orders.filter(o => o.type === 'colonize') as Extract<Order, { type: 'colonize' }>[]
  const breachOrders = orders.filter(o => o.type === 'breach') as Extract<Order, { type: 'breach' }>[]

  const stateWithDormancy = { ...state, dormant }

  const afterColonize = dormant
    ? stateWithDormancy
    : applyColonize(stateWithDormancy, colonizeOrders)

  const afterBreach = dormant
    ? afterColonize
    : applyBreach(afterColonize, breachOrders)

  // Track whether colonizing was actively happening (for heat rise bonus)
  const isColonizing = !dormant && colonizeOrders.length > 0 && colonizeOrders.some(o => {
    // Check if the order was valid (i.e. progress actually moved)
    const before = state.colonizeProgress[o.target] ?? 0
    const after = afterColonize.colonizeProgress[o.target] ?? 0
    // If after > before, progress moved; or if after < before, zone was captured
    return after !== before || afterColonize.map.zones.find(z => z.id === o.target)?.owner === 'you'
  })

  const ownedCount = afterBreach.map.zones.filter(z => z.owner === 'you').length

  // 3. Compute stage BEFORE immune (to determine if responders act this tick)
  const stage = heatStage(state.heat)

  // 4. Apply immune (responders act; accumulate zone-loss heat bump)
  const { zones: afterImmune, responders, heatBump } = applyImmune(
    afterBreach.map.zones,
    afterBreach.responders ?? state.responders,
    stage,
  )

  // 5. Update heat (incorporates zone-loss bump from this tick)
  const newHeat = updateHeat(state.heat, ownedCount, dormant, isColonizing, heatBump)

  // 6. Biomass income (based on zones after all changes)
  const afterImmuneState: GameState = {
    ...afterBreach,
    map: { ...afterBreach.map, zones: afterImmune },
    responders,
  }
  const gained = income(afterImmuneState)

  // 7. Check if heat has hit overwhelming → caught
  if (heatStage(newHeat) === 'overwhelming') {
    return {
      ...afterImmuneState,
      tick: afterImmuneState.tick + 1,
      heat: newHeat,
      biomass: afterImmuneState.biomass + gained,
      result: 'caught',
      banked: 0,
    }
  }

  return {
    ...afterImmuneState,
    tick: afterImmuneState.tick + 1,
    heat: newHeat,
    biomass: afterImmuneState.biomass + gained,
  }
}
