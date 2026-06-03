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
// plenty of runway to react before 'active' (50).
//
// Heat now rises only from HOT (non-dormant) owned zones. Fully dorming all nodes
// gives zero rise; the natural slow decay then visibly pulls the bar back down.
// There is no longer a global dormant-vs-active binary — each node contributes
// independently.

/** Heat added per tick per HOT (non-dormant) you-owned zone (base pressure). */
export const HEAT_RISE_PER_OWNED_ZONE = 1

/** Extra heat added per tick when at least one colonize order is active. */
export const HEAT_RISE_ACTIVE_COLONIZE = 2

/**
 * Natural heat decay per tick when no owned zones are hot (or always applied
 * as a floor drag). A small passive bleed so Heat never freezes.
 */
export const HEAT_NATURAL_DECAY = 1

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
 * Heat rises from HOT owned zones only. Dormant nodes contribute 0 rise.
 * When hotCount === 0 and no heatBump, heat naturally decays by HEAT_NATURAL_DECAY.
 *
 * @param currentHeat  heat at the start of this tick
 * @param hotCount     number of HOT (non-dormant) zones owned by 'you' this tick
 * @param isColonizing whether at least one valid colonize order was applied this tick
 * @param heatBump     extra heat to add this tick (e.g. from zone losses)
 */
export function updateHeat(
  currentHeat: number,
  hotCount: number,
  isColonizing: boolean,
  heatBump: number,
): number {
  const rise =
    hotCount * HEAT_RISE_PER_OWNED_ZONE +
    (isColonizing ? HEAT_RISE_ACTIVE_COLONIZE : 0) +
    heatBump

  if (rise <= 0 && heatBump === 0) {
    // No hot zones contributing — apply natural decay
    return Math.max(0, currentHeat - HEAT_NATURAL_DECAY + rise)
  }

  return Math.max(0, currentHeat + rise)
}
