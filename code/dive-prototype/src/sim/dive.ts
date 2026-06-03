import { buildMap } from './map'
import { income } from './economy'
import { applyColonize, COLONIZE_TICKS } from './spread'
import { applyBreach } from './breach'
import { updateHeat, heatStage } from './heat'
import { applyImmune, BRUTE_COST, CYST_COST } from './immune'
import { toggleDormant } from './network'
import { spend } from './economy'
import type { GameState, Order, ZoneId } from './types'

// Re-export so tests can import COLONIZE_TICKS from './dive'
export { COLONIZE_TICKS }
// Re-export defense constants so callers can see costs from './dive'
export { BRUTE_COST, CYST_COST }

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
    dormant: new Set<ZoneId>(),
    responders: [],
    result: 'ongoing',
    banked: 0,
    brutes: new Set<ZoneId>(),
    cysts: new Set<ZoneId>(),
  }
}

/**
 * Pure helper: deploy a Brute to an owned zone.
 * Spends BRUTE_COST biomass. Returns null if insufficient biomass or zone
 * is not owned by 'you'. Already-bruteified zones are treated as valid (idempotent spend).
 */
export function deployBrute(state: GameState, zoneId: ZoneId): GameState | null {
  const zone = state.map.zones.find(z => z.id === zoneId)
  if (!zone || zone.owner !== 'you') return null
  const after = spend(state, BRUTE_COST)
  if (!after) return null
  const newBrutes = new Set(after.brutes)
  newBrutes.add(zoneId)
  return { ...after, brutes: newBrutes }
}

/**
 * Pure helper: build a Cyst on an owned zone.
 * Spends CYST_COST biomass. Returns null if insufficient biomass or zone
 * is not owned by 'you'.
 */
export function buildCyst(state: GameState, zoneId: ZoneId): GameState | null {
  const zone = state.map.zones.find(z => z.id === zoneId)
  if (!zone || zone.owner !== 'you') return null
  const after = spend(state, CYST_COST)
  if (!after) return null
  const newCysts = new Set(after.cysts)
  newCysts.add(zoneId)
  return { ...after, cysts: newCysts }
}

/**
 * Advances the simulation by one tick. Pure — never mutates state.
 *
 * Order of operations each tick:
 *   1. Apply escape order (checked first — instant resolution).
 *   2. Apply dormancy orders (per-node toggle).
 *   3. Apply deployBrute / buildCyst orders (spend biomass, place defense).
 *   4. Apply colonize and breach orders.
 *   5. Compute heat stage (from previous tick's heat); spawn/act responders.
 *      Responders deprioritize dormant nodes; damage is reduced by Brute/Cyst.
 *      Zone losses from responders contribute a heat bump.
 *   6. Update heat: rises from HOT owned zones; decays naturally when none are hot.
 *   7. Add biomass income (only from HOT connected zones after all changes).
 *   8. Check for overwhelming heat → caught.
 */
export function step(state: GameState, orders: Order[]): GameState {
  // Guard: terminal states do not advance.
  if (state.result !== 'ongoing') return state

  // 1. Check for a valid escape order: named portal must be kind:'portal' AND owner:'you'
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

  // 2. Handle per-node dormancy toggle orders
  const dormancyOrders = orders.filter(o => o.type === 'dormancy') as Extract<Order, { type: 'dormancy' }>[]
  let stateAfterDormancy: GameState = state
  for (const o of dormancyOrders) {
    stateAfterDormancy = toggleDormant(stateAfterDormancy, o.zoneId)
  }

  // 3. Handle defense deployment orders (spend biomass; place Brute/Cyst)
  const bruteOrders = orders.filter(o => o.type === 'deployBrute') as Extract<Order, { type: 'deployBrute' }>[]
  const cystOrders  = orders.filter(o => o.type === 'buildCyst')  as Extract<Order, { type: 'buildCyst' }>[]

  let stateAfterDefense: GameState = stateAfterDormancy
  for (const o of bruteOrders) {
    const result = deployBrute(stateAfterDefense, o.zoneId)
    if (result) stateAfterDefense = result
  }
  for (const o of cystOrders) {
    const result = buildCyst(stateAfterDefense, o.zoneId)
    if (result) stateAfterDefense = result
  }

  // 4. Apply colonize and breach orders
  const colonizeOrders = orders.filter(o => o.type === 'colonize') as Extract<Order, { type: 'colonize' }>[]
  const breachOrders   = orders.filter(o => o.type === 'breach')   as Extract<Order, { type: 'breach' }>[]

  const afterColonize = applyColonize(stateAfterDefense, colonizeOrders)
  const afterBreach   = applyBreach(afterColonize, breachOrders)

  // Track whether colonizing was actively happening (for heat rise bonus)
  const isColonizing = colonizeOrders.length > 0 && colonizeOrders.some(o => {
    const before = state.colonizeProgress[o.target] ?? 0
    const after  = afterColonize.colonizeProgress[o.target] ?? 0
    return after !== before || afterColonize.map.zones.find(z => z.id === o.target)?.owner === 'you'
  })

  // Count HOT owned zones (dormant nodes excluded) — used for heat calculation
  const hotCount = afterBreach.map.zones.filter(
    z => z.owner === 'you' && !afterBreach.dormant.has(z.id),
  ).length

  // 5. Compute stage BEFORE immune (to determine if responders act this tick)
  const stage = heatStage(state.heat)

  // 5b. Apply immune (responders deprioritize dormant; Brute/Cyst reduce damage)
  const { zones: afterImmune, responders, heatBump } = applyImmune(
    afterBreach.map.zones,
    afterBreach.responders ?? state.responders,
    stage,
    afterBreach.dormant,
    afterBreach.brutes,
    afterBreach.cysts,
  )

  // 6. Update heat (incorporates zone-loss bump from this tick)
  const newHeat = updateHeat(state.heat, hotCount, isColonizing, heatBump)

  // 7. Biomass income (based on HOT connected zones after all changes)
  const afterImmuneState: GameState = {
    ...afterBreach,
    map: { ...afterBreach.map, zones: afterImmune },
    responders,
  }
  const gained = income(afterImmuneState)

  // 8. Check if heat has hit overwhelming → caught
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
