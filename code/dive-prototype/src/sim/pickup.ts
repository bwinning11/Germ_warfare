/**
 * pickup.ts — In-node boon system.
 *
 * Pickup nodes hold a one-shot boon that fires exactly once when the player
 * captures the zone. After collection the boon is inert — subsequent ticks
 * do nothing.
 *
 * Boon types:
 *   'biomass'   — instant lump of biomass (reward for the risk of reaching the node).
 *   'heatPurge' — immediately reduce body-wide Heat (breathing room under pressure).
 *   'mutagen'   — instantly fortifies the zone (adds it to cysts), no biomass cost.
 */

import type { GameState, ZoneId } from './types'

// ─── Boon type ────────────────────────────────────────────────────────────────

export type PickupBoon = 'biomass' | 'heatPurge' | 'mutagen'

// ─── Constants (tunable) ─────────────────────────────────────────────────────

/** Biomass granted by a 'biomass' pickup. */
export const PICKUP_BIOMASS_AMOUNT = 30

/** Heat removed by a 'heatPurge' pickup. */
export const PICKUP_HEAT_PURGE_AMOUNT = 25

// ─── Zone-to-boon mapping ─────────────────────────────────────────────────────

/**
 * Maps zone ids that carry a pickup boon to their boon type.
 * Only zones listed here are treated as pickup carriers.
 */
export const PICKUP_BOONS: Record<ZoneId, PickupBoon> = {
  pickup: 'biomass',
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Applies the named boon to state, optionally targeting a specific zone (for
 * 'mutagen' which needs to know which zone to fortify). Pure — never mutates.
 */
export function applyPickupBoon(
  state: GameState,
  boon: PickupBoon,
  zoneId?: ZoneId,
): GameState {
  switch (boon) {
    case 'biomass':
      return { ...state, biomass: state.biomass + PICKUP_BIOMASS_AMOUNT }

    case 'heatPurge':
      return { ...state, heat: Math.max(0, state.heat - PICKUP_HEAT_PURGE_AMOUNT) }

    case 'mutagen': {
      if (!zoneId) return state
      const newCysts = new Set(state.cysts)
      newCysts.add(zoneId)
      return { ...state, cysts: newCysts }
    }
  }
}

/**
 * Scans the zone list for newly captured pickup nodes and fires each boon once.
 * A zone is "newly captured" if it is kind:'pickup', owner:'you', and NOT already
 * in state.collectedPickups.
 *
 * Returns updated state with boons applied and collectedPickups extended.
 * Pure — never mutates.
 */
export function applyPickups(state: GameState): GameState {
  const pickupZones = state.map.zones.filter(
    z => z.kind === 'pickup' && z.owner === 'you',
  )

  let s = state
  for (const zone of pickupZones) {
    if (s.collectedPickups.has(zone.id)) continue  // already collected

    const boon = PICKUP_BOONS[zone.id]
    if (!boon) continue  // no boon defined for this zone id

    // Mark collected first (so re-entrant calls are idempotent)
    const newCollected = new Set(s.collectedPickups)
    newCollected.add(zone.id)
    s = { ...s, collectedPickups: newCollected }

    // Apply the boon effect
    s = applyPickupBoon(s, boon, zone.id)
  }

  return s
}
