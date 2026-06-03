// ---------------------------------------------------------------------------
// Economy: unit type definitions, biomass income, and production.
// DOM-free — fully testable in Vitest.
// ---------------------------------------------------------------------------

import { World, Entity, ProductionMix, GermKind } from './types';
import { nextId } from './world';

// ---------------------------------------------------------------------------
// Unit type definitions
// ---------------------------------------------------------------------------

export interface UnitDef {
  cost: number;   // biomass cost to produce
  hp: number;     // starting (and max) hit points
  speed: number;  // movement speed in px/s
  // Combat stats (added T4) — mirrors CombatDef in combat.ts for reference
  damage: number;
  range: number;
  cooldown: number;
}

/**
 * The three producible unit types with their stats.
 *
 * | Kind     | Cost | HP  | Speed | Role                  |
 * |----------|------|-----|-------|-----------------------|
 * | spreader |  20  |  15 |  130  | cheap fast swarm unit |
 * | brute    |  60  |  80 |   65  | slow tanky frontline  |
 * | spitter  |  40  |  35 |   95  | ranged attacker (T4)  |
 */
export const UNIT_DEFS: Record<'spreader' | 'brute' | 'spitter', UnitDef> = {
  spreader: { cost: 20, hp: 15,  speed: 130, damage: 4,  range: 28,  cooldown: 0.60 },
  brute:    { cost: 60, hp: 80,  speed: 65,  damage: 18, range: 32,  cooldown: 1.40 },
  spitter:  { cost: 40, hp: 35,  speed: 95,  damage: 9,  range: 180, cooldown: 1.10 },
};

// ---------------------------------------------------------------------------
// Passive trickle income
// ---------------------------------------------------------------------------

/** Biomass generated per second (passive trickle). */
export const INCOME_RATE = 12; // biomass/s

/**
 * Advance the economy by `dt` seconds.
 * Adds passive trickle income to `world.biomass`.
 * Mutates world in place.
 */
export function tickIncome(world: World, dt: number): void {
  world.biomass += INCOME_RATE * dt;
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

export type ProductionResult =
  | { success: true;  unit: Entity }
  | { success: false; reason: 'insufficient_biomass' | 'no_base' };

/**
 * Attempt to produce a unit of `kind` from the player's base.
 *
 * On success:
 *  - Deducts the cost from world.biomass.
 *  - Spawns the unit adjacent to the base (or world centre if no base found).
 *  - Sets the unit's moveTo to world.rallyPoint if one is set.
 *  - Appends the unit to world.entities.
 *
 * On failure:
 *  - Returns a failure result with a reason code.
 *  - Does NOT mutate the world.
 */
export function produce(
  world: World,
  kind: 'spreader' | 'brute' | 'spitter',
): ProductionResult {
  const def = UNIT_DEFS[kind];

  if (world.biomass < def.cost) {
    return { success: false, reason: 'insufficient_biomass' };
  }

  // Find the player's base to spawn near it.
  const base = world.entities.find((e) => e.kind === 'base' && e.owner === 'you');
  const spawnPos = base
    ? { x: base.pos.x + 30 + Math.random() * 20, y: base.pos.y + (Math.random() - 0.5) * 40 }
    : { x: world.width * 0.15, y: world.height * 0.5 };

  const moveTo = world.rallyPoint ? { ...world.rallyPoint } : null;

  const unit: Entity = {
    id: nextId(),
    kind,
    pos: { ...spawnPos },
    vel: { x: 0, y: 0 },
    hp: def.hp,
    maxHp: def.hp,
    owner: 'you',
    data: { moveTo, speed: def.speed },
  };

  world.biomass -= def.cost;
  world.entities.push(unit);

  return { success: true, unit };
}

// ---------------------------------------------------------------------------
// Production mix — auto-builder
// ---------------------------------------------------------------------------

/**
 * Update the world's production mix.
 * Weights are relative — 0 disables that type, any positive value enables it.
 */
export function setMix(world: World, mix: ProductionMix): void {
  world.productionMix = { ...mix };
}

/**
 * The kinds in the order we consider them when picking the next unit to build.
 */
const GERM_KINDS: GermKind[] = ['spreader', 'brute', 'spitter'];

/**
 * Production rate: how many biomass/s of "build progress" the base accumulates.
 *
 * Rate-limiting works via world.buildAccumulator (persisted across ticks).
 * Each tick adds (dt * BUILD_RATE) to the accumulator.  A unit is produced
 * when the accumulator reaches the unit's cost AND biomass is on hand.
 * This means expensive units (brute: 60) require ~1.5 s of accumulation at
 * the default rate, so proportions converge correctly across many ticks.
 */
export const BUILD_RATE = 40; // biomass/s of build-progress accumulation

/**
 * Pick the next unit kind to produce given the current mix and the existing
 * count of each type already produced in this auto-build session.
 *
 * Uses a deficit-based scheduler: produces the type that is most
 * under-represented relative to its target fraction.
 *
 * Returns null when no type has a non-zero weight.
 */
export function pickNextKind(
  mix: ProductionMix,
  produced: Record<GermKind, number>,
): GermKind | null {
  const totalWeight = mix.spreader + mix.brute + mix.spitter;
  if (totalWeight <= 0) return null;

  const totalProduced = produced.spreader + produced.brute + produced.spitter;

  let bestKind: GermKind | null = null;
  let bestDeficit = -Infinity;

  for (const kind of GERM_KINDS) {
    const weight = mix[kind];
    if (weight <= 0) continue;
    const targetFrac = weight / totalWeight;
    const actualFrac = totalProduced === 0 ? 0 : produced[kind] / totalProduced;
    const deficit = targetFrac - actualFrac;
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestKind = kind;
    }
  }

  return bestKind;
}

/**
 * Auto-build step — called once per sim tick.
 *
 * Accumulates build progress in world.buildAccumulator across ticks.  When
 * accumulator >= next unit's cost AND biomass >= cost, the unit is produced
 * and both the accumulator and biomass are debited.
 *
 * - Never overspends: only produces when both accumulator and biomass cover cost.
 * - Naturally rate-limited by income when biomass is tight.
 * - Proportions converge via deficit-based scheduling (pickNextKind).
 *
 * Mutates world (biomass, entities, buildAccumulator).
 */
export function autoBuildStep(world: World, dt: number): void {
  const mix = world.productionMix;
  if (mix.spreader + mix.brute + mix.spitter <= 0) return;

  // Carry build progress across ticks
  if (typeof world.buildAccumulator !== 'number') world.buildAccumulator = 0;
  world.buildAccumulator += BUILD_RATE * dt;

  // Cap accumulator so it doesn't stockpile indefinitely during pauses/biomass drought
  const maxAccum = Math.max(UNIT_DEFS.spreader.cost, UNIT_DEFS.brute.cost, UNIT_DEFS.spitter.cost) * 3;
  if (world.buildAccumulator > maxAccum) world.buildAccumulator = maxAccum;

  // Track proportions produced within this call for the scheduler
  const produced: Record<GermKind, number> = { spreader: 0, brute: 0, spitter: 0 };

  // Produce units as long as accumulator covers costs
  for (;;) {
    const kind = pickNextKind(mix, produced);
    if (!kind) break;

    const cost = UNIT_DEFS[kind].cost;

    // Accumulator must have enough progress to start this unit
    if (world.buildAccumulator < cost) break;

    // If we can't afford this specific kind from biomass, try a cheaper enabled kind
    if (world.biomass < cost) {
      // Find the cheapest affordable enabled kind
      const fallback = GERM_KINDS
        .filter((k) => mix[k] > 0 && world.biomass >= UNIT_DEFS[k].cost && world.buildAccumulator >= UNIT_DEFS[k].cost)
        .sort((a, b) => UNIT_DEFS[a].cost - UNIT_DEFS[b].cost)[0] as GermKind | undefined;

      if (!fallback) break; // nothing affordable — stop until biomass recovers

      produce(world, fallback);
      produced[fallback]++;
      world.buildAccumulator -= UNIT_DEFS[fallback].cost;
      continue;
    }

    produce(world, kind);
    produced[kind]++;
    world.buildAccumulator -= cost;
  }
}
