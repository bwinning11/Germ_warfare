// ---------------------------------------------------------------------------
// Combat system — attack/range/cooldown, auto-acquire, death removal.
// DOM-free. Fully testable.
// ---------------------------------------------------------------------------

import { World, Entity } from './types';

// ---------------------------------------------------------------------------
// Combat stat definitions
// ---------------------------------------------------------------------------

export interface CombatDef {
  damage: number;    // HP dealt per hit
  range: number;     // attack range in px (radius from centre to target centre)
  cooldown: number;  // seconds between attacks
}

/**
 * Combat stats per unit kind.
 *
 * | Kind     | Damage | Range | Cooldown | Notes                      |
 * |----------|--------|-------|----------|----------------------------|
 * | spreader |    4   |  28   |  0.60 s  | melee swarm — fast attack  |
 * | brute    |   18   |  32   |  1.40 s  | melee tank — heavy hits    |
 * | spitter  |    9   | 180   |  1.10 s  | ranged — medium damage     |
 */
export const COMBAT_DEFS: Record<string, CombatDef> = {
  spreader:  { damage: 4,  range: 28,  cooldown: 0.60 },
  brute:     { damage: 18, range: 32,  cooldown: 1.40 },
  spitter:   { damage: 9,  range: 180, cooldown: 1.10 },
  // Immune enemies
  macrophage:  { damage: 8,  range: 30, cooldown: 1.20 }, // slow tank
  neutrophil:  { damage: 5,  range: 26, cooldown: 0.80 }, // fast harasser
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist(a: Entity, b: Entity): number {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
}

/** Returns true if `a` and `b` are on opposing sides (one is attackable by the other). */
function areEnemies(a: Entity, b: Entity): boolean {
  if (a.owner === b.owner) return false;
  // neutral entities don't fight
  if (a.owner === 'neutral' || b.owner === 'neutral') return false;
  return true;
}

/** Find the nearest enemy entity within `range` px of `attacker`. */
function nearestEnemyInRange(world: World, attacker: Entity, range: number): Entity | null {
  let best: Entity | null = null;
  let bestDist = Infinity;

  for (const e of world.entities) {
    if (!areEnemies(attacker, e)) continue;
    const d = dist(attacker, e);
    if (d <= range && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Attack effects registry (collected each frame, consumed by renderer)
// ---------------------------------------------------------------------------

export interface AttackEffect {
  kind: 'flash' | 'projectile';
  from: { x: number; y: number };
  to:   { x: number; y: number };
  ttl:  number; // seconds until removed
}

/** Mutable list of in-flight visual effects. Renderer drains this each frame. */
export const attackEffects: AttackEffect[] = [];

function addEffect(attacker: Entity, target: Entity, isRanged: boolean): void {
  attackEffects.push({
    kind: isRanged ? 'projectile' : 'flash',
    from: { ...attacker.pos },
    to:   { ...target.pos },
    ttl:  isRanged ? 0.25 : 0.10,
  });
}

/** Advance effect timers and prune expired ones. Call once per sim step. */
export function updateEffects(dt: number): void {
  for (const fx of attackEffects) {
    fx.ttl -= dt;
  }
  // Splice in reverse so indices remain stable
  for (let i = attackEffects.length - 1; i >= 0; i--) {
    if (attackEffects[i].ttl <= 0) attackEffects.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Core combat tick — call once per sim step from world update
// ---------------------------------------------------------------------------

/**
 * Process one combat step for all entities.
 *
 * For each unit that has combat stats:
 *   1. If it has an explicit attackTarget, pursue it (set moveTo) or attack if in range.
 *   2. Otherwise auto-acquire the nearest enemy in range.
 *   3. Deal damage when cooldown expires.
 *
 * Mutates entities in place. Does NOT remove dead entities — call
 * removeDeadEntities() separately (so tests can inspect the corpse).
 */
export function tickCombat(world: World, dt: number): void {
  for (const attacker of world.entities) {
    const def = COMBAT_DEFS[attacker.kind as string];
    if (!def) continue; // structures (base, organ) don't fight

    // --- Ensure cooldown counter exists ---
    if (typeof attacker.data.attackCooldownLeft !== 'number') {
      attacker.data.attackCooldownLeft = 0;
    }
    // Drain cooldown
    const cdLeft = attacker.data.attackCooldownLeft as number;
    const newCd  = Math.max(0, cdLeft - dt);
    attacker.data.attackCooldownLeft = newCd;

    // --- Resolve target ---
    let target: Entity | null = null;

    const explicitId = attacker.data.attackTarget as string | undefined;
    if (explicitId) {
      // Explicit command target
      const found = world.entities.find((e) => e.id === explicitId);
      if (found && areEnemies(attacker, found)) {
        target = found;
      } else {
        // Target gone or invalid — clear
        attacker.data.attackTarget = undefined;
      }
    }

    // Auto-acquire if no target yet
    if (!target) {
      target = nearestEnemyInRange(world, attacker, def.range);
      if (target) {
        // Record auto-acquired target so other systems can see it
        attacker.data.attackTarget = target.id;
      }
    }

    if (!target) continue;

    // --- Pursue target if out of range ---
    const d = dist(attacker, target);
    if (d > def.range) {
      // Set moveTo to close in; stop just inside range
      const dx = target.pos.x - attacker.pos.x;
      const dy = target.pos.y - attacker.pos.y;
      const norm = d > 0 ? 1 / d : 0;
      const stopDist = Math.max(def.range * 0.8, 10);
      attacker.data.moveTo = {
        x: attacker.pos.x + dx * norm * (d - stopDist),
        y: attacker.pos.y + dy * norm * (d - stopDist),
      };
      continue; // can't attack yet — still moving
    }

    // --- Within range: stop moving toward target while attacking ---
    // Clear moveTo so the unit holds position while engaged
    if (attacker.data.moveTo !== null && target) {
      const mt = attacker.data.moveTo as { x: number; y: number } | null;
      if (mt) {
        // Only clear if the moveTo is very close to the target (i.e., we were pursuing it)
        const mtd = Math.hypot(mt.x - target.pos.x, mt.y - target.pos.y);
        if (mtd < def.range) {
          attacker.data.moveTo = null;
        }
      }
    }

    // --- Attack if cooldown is ready ---
    if (newCd === 0) {
      target.hp -= def.damage;
      attacker.data.attackCooldownLeft = def.cooldown;

      const isRanged = def.range > 60;
      addEffect(attacker, target, isRanged);
    }
  }
}

// ---------------------------------------------------------------------------
// Remove dead entities from the world
// ---------------------------------------------------------------------------

/**
 * Remove all entities whose hp has dropped to 0 or below.
 * Mutates world.entities in place.
 */
export function removeDeadEntities(world: World): void {
  world.entities = world.entities.filter((e) => e.hp > 0);
}
