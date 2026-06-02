/**
 * immune.ts — Innate immune responders.
 *
 * Responders are simple agents the body sends into infected zones.
 * They reduce infection each tick. When a zone's infection hits 0,
 * the infection is cleared: the zone flips back to 'none'.
 *
 * All constants are tunable dials.
 */

import type { Zone, ZoneId, Responder } from './types'
import type { HeatStage } from './heat'

// Re-export so callers can import Responder from here if they prefer
export type { Responder }

// ─── Constants ────────────────────────────────────────────────────────────────

/** Infection points a responder removes from its zone each tick. */
export const RESPONDER_DAMAGE_PER_TICK = 15

/** Heat bump applied when a you-owned zone is lost (infection cleared by immune). */
export const HEAT_BUMP_ON_ZONE_LOSS = 10

// ─── Core immune logic ────────────────────────────────────────────────────────

/**
 * Returns the id of the you-owned zone with the highest infection,
 * or null if there are no you-owned zones.
 */
export function highestInfectionOwnedZone(zones: Zone[]): ZoneId | null {
  const owned = zones.filter(z => z.owner === 'you')
  if (owned.length === 0) return null
  return owned.reduce((best, z) => (z.infection > best.infection ? z : best)).id
}

/**
 * Applies innate immune logic for one tick.
 *
 * When stage is 'alerted' or higher:
 * 1. Ensure exactly one responder exists in the highest-infection you-owned zone.
 *    (If a responder already covers the right zone, keep it; otherwise repoint it.)
 * 2. Each responder reduces its zone's infection by RESPONDER_DAMAGE_PER_TICK.
 * 3. Any zone whose infection hits ≤ 0 AND had positive infection before flips to
 *    owner:'none', infection:0. Each such zone loss contributes HEAT_BUMP_ON_ZONE_LOSS.
 *
 * When stage is 'calm':
 * - Responders are removed (the immune system stands down).
 *
 * Returns the updated zones array, the updated responders array, and
 * the total heat bump from zone losses this tick.
 */
export function applyImmune(
  zones: Zone[],
  responders: Responder[],
  stage: HeatStage,
): { zones: Zone[]; responders: Responder[]; heatBump: number } {
  if (stage === 'calm') {
    return { zones, responders: [], heatBump: 0 }
  }

  // 1. Spawn / maintain responder in the highest-infection owned zone
  const targetZone = highestInfectionOwnedZone(zones)
  let updatedResponders: Responder[]

  if (targetZone === null) {
    updatedResponders = []
  } else if (responders.some(r => r.zone === targetZone)) {
    // Already have one there — keep existing responders
    updatedResponders = responders
  } else {
    // Spawn / repoint: one responder on the hottest zone
    // (prototype keeps it simple: at most 1 responder total)
    updatedResponders = [{ zone: targetZone }]
  }

  // 2. Apply responder damage
  const preInfections = new Map(zones.map(z => [z.id, z.infection]))
  let updatedZones = zones.map(z => {
    const hasResponder = updatedResponders.some(r => r.zone === z.id)
    if (!hasResponder) return z
    const newInfection = z.infection - RESPONDER_DAMAGE_PER_TICK
    return { ...z, infection: Math.max(0, newInfection) }
  })

  // 3. Flip cleared zones and accumulate heat bump
  let heatBump = 0
  updatedZones = updatedZones.map(z => {
    if (z.owner === 'you' && z.infection <= 0) {
      const originalInfection = preInfections.get(z.id) ?? 0
      if (originalInfection > 0) {
        // Zone was wiped clean — lose it
        heatBump += HEAT_BUMP_ON_ZONE_LOSS
        updatedResponders = updatedResponders.filter(r => r.zone !== z.id)
        return { ...z, owner: 'none' as const, infection: 0 }
      }
    }
    return z
  })

  return { zones: updatedZones, responders: updatedResponders, heatBump }
}
