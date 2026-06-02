/**
 * heat.ts — Body-wide heat (alarm level) logic.
 *
 * Heat represents how aware the immune system is of the infection.
 * All constants are tunable dials for game feel.
 */

// ─── Stage thresholds ────────────────────────────────────────────────────────

/** Heat must reach this value to enter the 'alerted' stage (responders spawn). */
export const HEAT_THRESHOLD_ALERTED = 20

/** Heat must reach this value to enter the 'active' stage (responders more aggressive). */
export const HEAT_THRESHOLD_ACTIVE = 50

/** Heat must reach this value to enter the 'overwhelming' stage (near-lethal response). */
export const HEAT_THRESHOLD_OVERWHELMING = 90

// ─── Rise / decay constants ───────────────────────────────────────────────────
//
// Tuned for a *first* dive to be survivable while the player is still learning.
// With the loop at ~800ms/tick, a lone foothold rises 1/tick (~1.25/sec), so the
// player has well over ten seconds of reading the bar before 'alerted' (20) and
// plenty of runway to react before 'active' (50). Dormancy decays faster than a
// small hold rises, so going Dormant always visibly pulls Heat back down.

/** Heat added per tick per you-owned zone (base pressure). */
export const HEAT_RISE_PER_OWNED_ZONE = 1

/** Extra heat added per tick when at least one colonize order is active. */
export const HEAT_RISE_ACTIVE_COLONIZE = 2

/** Heat removed per tick while dormant (replaces rise). */
export const HEAT_DECAY_DORMANT = 5

// ─── Stage classifier ────────────────────────────────────────────────────────

export type HeatStage = 'calm' | 'alerted' | 'active' | 'overwhelming'

/**
 * Maps a numeric heat value to the corresponding named stage.
 */
export function heatStage(heat: number): HeatStage {
  if (heat >= HEAT_THRESHOLD_OVERWHELMING) return 'overwhelming'
  if (heat >= HEAT_THRESHOLD_ACTIVE)        return 'active'
  if (heat >= HEAT_THRESHOLD_ALERTED)       return 'alerted'
  return 'calm'
}

// ─── Per-tick heat update ─────────────────────────────────────────────────────

/**
 * Computes the new heat value for one tick.
 *
 * While dormant: heat decays by HEAT_DECAY_DORMANT (floored at 0).
 * While active:  heat rises by HEAT_RISE_PER_OWNED_ZONE × ownedCount
 *                plus HEAT_RISE_ACTIVE_COLONIZE if colonizing is happening.
 *
 * @param currentHeat  heat at the start of this tick
 * @param ownedCount   number of zones owned by 'you' at the start of this tick
 * @param dormant      whether the player is in dormancy mode
 * @param isColonizing whether at least one valid colonize order was applied this tick
 * @param heatBump     extra heat to add this tick (e.g. from zone losses)
 */
export function updateHeat(
  currentHeat: number,
  ownedCount: number,
  dormant: boolean,
  isColonizing: boolean,
  heatBump: number,
): number {
  if (dormant) {
    return Math.max(0, currentHeat - HEAT_DECAY_DORMANT)
  }

  const rise =
    ownedCount * HEAT_RISE_PER_OWNED_ZONE +
    (isColonizing ? HEAT_RISE_ACTIVE_COLONIZE : 0) +
    heatBump

  return Math.max(0, currentHeat + rise)
}
