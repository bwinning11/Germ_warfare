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

/** Infection points a responder removes from its zone each tick (no defenses). */
export const RESPONDER_DAMAGE_PER_TICK = 15

/** Heat bump applied when a you-owned zone is lost (infection cleared by immune). */
export const HEAT_BUMP_ON_ZONE_LOSS = 10

/**
 * Biomass cost to deploy a Brute to an owned zone.
 * A Brute absorbs some responder damage per tick.
 */
export const BRUTE_COST = 10

/**
 * How much responder damage a Brute absorbs per tick.
 * Net damage to the zone = RESPONDER_DAMAGE_PER_TICK - BRUTE_DAMAGE_REDUCTION.
 * Chosen so a Brute gives meaningful durability without making a zone unlosable.
 */
export const BRUTE_DAMAGE_REDUCTION = 8

/**
 * Biomass cost to build a Cyst on an owned zone.
 * Cysts are more expensive but more durable than Brutes.
 */
export const CYST_COST = 20

/**
 * How much responder damage a Cyst absorbs per tick.
 * Net damage = RESPONDER_DAMAGE_PER_TICK - CYST_DAMAGE_REDUCTION.
 * A Cyst nearly halves the damage rate, making clearing take much longer.
 */
export const CYST_DAMAGE_REDUCTION = 12

// ─── Core immune logic ────────────────────────────────────────────────────────

/**
 * Returns the id of the best immune target among you-owned zones:
 * - Prefers HOT zones over dormant zones.
 * - Among HOT zones, picks the highest infection.
 * - Falls back to dormant zones (highest infection) if no hot zone is available.
 * Returns null if no owned zones.
 */
export function highestInfectionOwnedZone(
  zones: Zone[],
  dormant: Set<ZoneId>,
): ZoneId | null {
  const owned = zones.filter(z => z.owner === 'you')
  if (owned.length === 0) return null

  // Prefer hot zones
  const hot = owned.filter(z => !dormant.has(z.id))
  if (hot.length > 0) {
    return hot.reduce((best, z) => (z.infection > best.infection ? z : best)).id
  }

  // Fall back to dormant zones
  return owned.reduce((best, z) => (z.infection > best.infection ? z : best)).id
}

/**
 * Computes the effective damage a responder deals to a zone this tick,
 * accounting for Brute and Cyst defenses.
 * Brute and Cyst stack additively (both present = sum of reductions, min 1 damage).
 */
export function effectiveDamage(
  zoneId: ZoneId,
  brutes: Set<ZoneId>,
  cysts: Set<ZoneId>,
): number {
  let reduction = 0
  if (brutes.has(zoneId)) reduction += BRUTE_DAMAGE_REDUCTION
  if (cysts.has(zoneId)) reduction += CYST_DAMAGE_REDUCTION
  return Math.max(1, RESPONDER_DAMAGE_PER_TICK - reduction)
}

/**
 * Applies innate immune logic for one tick.
 *
 * When stage is 'alerted' or higher:
 * 1. Target the highest-infection HOT owned zone (deprioritizes dormant nodes).
 *    Falls back to dormant zones only if no hot zones exist.
 * 2. Each responder reduces its zone's infection by effectiveDamage() (reduced by
 *    Brute/Cyst defenses if present).
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
  dormant: Set<ZoneId>,
  brutes: Set<ZoneId>,
  cysts: Set<ZoneId>,
): { zones: Zone[]; responders: Responder[]; heatBump: number } {
  if (stage === 'calm') {
    return { zones, responders: [], heatBump: 0 }
  }

  // 1. Spawn / maintain responder in the preferred target zone
  const targetZone = highestInfectionOwnedZone(zones, dormant)
  let updatedResponders: Responder[]

  if (targetZone === null) {
    updatedResponders = []
  } else if (responders.some(r => r.zone === targetZone)) {
    // Already have one there — keep existing responders
    updatedResponders = responders
  } else {
    // Spawn / repoint: one responder on the best target
    // (prototype keeps it simple: at most 1 responder total)
    updatedResponders = [{ zone: targetZone }]
  }

  // 2. Apply responder damage (reduced by Brute/Cyst if present)
  const preInfections = new Map(zones.map(z => [z.id, z.infection]))
  let updatedZones = zones.map(z => {
    const hasResponder = updatedResponders.some(r => r.zone === z.id)
    if (!hasResponder) return z
    const dmg = effectiveDamage(z.id, brutes, cysts)
    const newInfection = z.infection - dmg
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
