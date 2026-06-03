import { describe, it, expect } from 'vitest'
import { initialState, step } from './dive'
import { PICKUP_BIOMASS_AMOUNT, PICKUP_HEAT_PURGE_AMOUNT, applyPickupBoon } from './pickup'
import type { GameState } from './types'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns a state where the player has breached through to vessel_d and the
 * pickup barrier has been opened, so the next colonize order on 'pickup' is valid.
 * We do this by directly patching map zones and edges rather than replaying
 * ticks — we only need a valid predecessor state for pickup testing.
 */
function stateWithPickupReachable(): GameState {
  const s = initialState()
  // Give the player a chunk of biomass so income/spend don't interfere.
  const baseState: GameState = { ...s, biomass: 200 }

  // Own all vessels along the path to pickup, open the barrier
  const ownedIds = new Set(['entry', 'vessel_a', 'vessel_b', 'vessel_d'])
  const zones = baseState.map.zones.map(z =>
    ownedIds.has(z.id)
      ? { ...z, owner: 'you' as const, infection: 100 }
      : z,
  )

  // Open the vessel_d → pickup barrier so colonize is valid
  const edges = baseState.map.edges.map(e =>
    (e.from === 'vessel_d' && e.to === 'pickup') ||
    (e.from === 'pickup'   && e.to === 'vessel_d')
      ? { ...e, barrier: false }
      : e,
  )

  return {
    ...baseState,
    map: { zones, edges },
  }
}

/**
 * Drive colonize on 'pickup' for COLONIZE_TICKS to flip it to owner:'you'.
 * Returns the state after the pickup zone is captured.
 */
function capturePickup(base: GameState): GameState {
  // COLONIZE_TICKS = 2; apply the order twice
  let s = base
  for (let i = 0; i < 5; i++) {
    s = step(s, [{ type: 'colonize', target: 'pickup' }])
    if (s.map.zones.find(z => z.id === 'pickup')?.owner === 'you') break
  }
  return s
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pickups — biomass boon', () => {
  it('(a) capturing the pickup node adds PICKUP_BIOMASS_AMOUNT biomass', () => {
    const base = stateWithPickupReachable()
    const biomassBeforeCapture = base.biomass

    const captured = capturePickup(base)
    expect(captured.map.zones.find(z => z.id === 'pickup')?.owner).toBe('you')

    // The pickup boon must have been applied: biomass went up by at least the boon
    // (income also accrues each tick so we just check it's ≥ the boon amount)
    expect(captured.biomass).toBeGreaterThanOrEqual(biomassBeforeCapture + PICKUP_BIOMASS_AMOUNT)
  })

  it('(a) biomass boon is NOT granted again on subsequent ticks', () => {
    const base = stateWithPickupReachable()
    const captured = capturePickup(base)
    const biomassAtCapture = captured.biomass

    // Advance several ticks without any orders
    let s = captured
    for (let i = 0; i < 3; i++) {
      s = step(s, [])
    }

    // Income still accrues, but the lump boon should only appear once.
    // The most robust check: biomass never jumps by PICKUP_BIOMASS_AMOUNT in a single tick.
    // We reconstruct tick-by-tick from captured and verify no single tick adds the boon again.
    let prev = captured
    for (let i = 0; i < 3; i++) {
      const next = step(prev, [])
      const deltaBiomass = next.biomass - prev.biomass
      expect(deltaBiomass).toBeLessThan(PICKUP_BIOMASS_AMOUNT)
      prev = next
    }
  })
})

describe('pickups — heatPurge boon', () => {
  it('(b) capturing a heatPurge pickup reduces heat by PICKUP_HEAT_PURGE_AMOUNT', () => {
    // Patch the pickup zone to be a heatPurge boon and set heat to a known value.
    const base = stateWithPickupReachable()
    const highHeat = 60  // well above zero so purge is visible
    const stateWithHeat: GameState = { ...base, heat: highHeat }

    const after = applyPickupBoon(stateWithHeat, 'heatPurge')
    expect(after.heat).toBe(Math.max(0, highHeat - PICKUP_HEAT_PURGE_AMOUNT))
  })

  it('(b) heatPurge does not reduce heat below zero', () => {
    const base = stateWithPickupReachable()
    const lowHeatState: GameState = { ...base, heat: 5 }  // less than purge amount

    const after = applyPickupBoon(lowHeatState, 'heatPurge')
    expect(after.heat).toBe(0)
  })
})

describe('pickups — uncaptured pickup grants nothing', () => {
  it('(c) an uncaptured pickup zone does NOT modify biomass or heat in step()', () => {
    const base = stateWithPickupReachable()
    const biomassBefore = base.biomass
    const heatBefore = base.heat

    // Advance one tick with no orders — pickup stays uncaptured
    const after = step(base, [])

    // Heat may rise from owned zones, but should NOT include a purge.
    // Biomass may increase from income, but should NOT include the boon amount.
    const deltaB = after.biomass - biomassBefore
    expect(deltaB).toBeLessThan(PICKUP_BIOMASS_AMOUNT)

    // No purge: heat should be >= heatBefore - 1 (natural decay only)
    // i.e. it can only rise or decay slowly — not drop by PICKUP_HEAT_PURGE_AMOUNT
    expect(after.heat).toBeGreaterThanOrEqual(heatBefore - 1)
  })
})

describe('pickups — mutagen boon (direct applyPickupBoon)', () => {
  it('mutagen boon instantly fortifies the zone (adds it to cysts)', () => {
    const base = stateWithPickupReachable()

    // Capture pickup first, then apply mutagen boon directly
    const captured = capturePickup(base)
    const after = applyPickupBoon(captured, 'mutagen', 'pickup')
    expect(after.cysts.has('pickup')).toBe(true)
  })
})
