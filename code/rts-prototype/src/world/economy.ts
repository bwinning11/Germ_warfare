// ---------------------------------------------------------------------------
// Economy: unit type definitions, biomass income, and production.
// DOM-free — fully testable in Vitest.
// ---------------------------------------------------------------------------

import { World, Entity } from './types';
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
export const INCOME_RATE = 10; // biomass/s

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
