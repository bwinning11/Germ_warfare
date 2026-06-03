// ---------------------------------------------------------------------------
// Tests for combat: attack/range/cooldown, auto-acquire, death, no-friendly-fire.
// Written BEFORE implementation (fail → pass).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { tickCombat, removeDeadEntities } from '../world/combat';
import { Entity, World } from '../world/types';
import { COMBAT_DEFS } from '../world/combat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorld(entities: Entity[]): World {
  return {
    entities,
    width: 1100,
    height: 740,
    elapsed: 0,
    paused: false,
    biomass: 50,
    rallyPoint: null,
    gameState: 'playing',
    captureProgress: 0,
    organContested: false,
    productionMix: { spreader: 1, brute: 1, spitter: 1 },
    buildAccumulator: 0,
  };
}

function makeUnit(
  id: string,
  kind: Entity['kind'],
  owner: Entity['owner'],
  x: number,
  y: number,
  hp = 50,
): Entity {
  return {
    id,
    kind,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    hp,
    maxHp: hp,
    owner,
    data: { moveTo: null, speed: 100, attackCooldownLeft: 0 },
  };
}

// ---------------------------------------------------------------------------
// (a) A unit in range deals its damage on cooldown
// ---------------------------------------------------------------------------
describe('tickCombat() — damage on cooldown', () => {
  it('a spreader in range deals damage to an enemy after one cooldown period', () => {
    const attacker = makeUnit('a1', 'spreader', 'you',   200, 200, 50);
    const target   = makeUnit('t1', 'macrophage', 'immune', 210, 200, 50); // within melee range

    const world = makeWorld([attacker, target]);

    // Advance by exactly one cooldown — should deal one hit
    const cd = COMBAT_DEFS.spreader.cooldown;
    tickCombat(world, cd);

    expect(target.hp).toBeLessThan(50);
    expect(target.hp).toBeCloseTo(50 - COMBAT_DEFS.spreader.damage, 5);
  });

  it('does NOT deal damage again before the next cooldown expires', () => {
    const attacker = makeUnit('a1', 'spreader', 'you',   200, 200, 50);
    const target   = makeUnit('t1', 'macrophage', 'immune', 210, 200, 50);

    const world = makeWorld([attacker, target]);

    // First full cooldown → 1 hit
    tickCombat(world, COMBAT_DEFS.spreader.cooldown);
    const hpAfterFirst = target.hp;

    // Half a cooldown more → should NOT deal another hit yet
    tickCombat(world, COMBAT_DEFS.spreader.cooldown * 0.4);
    expect(target.hp).toBe(hpAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// (b) Entity at 0 HP is removed
// ---------------------------------------------------------------------------
describe('removeDeadEntities()', () => {
  it('removes entities with hp ≤ 0', () => {
    const alive = makeUnit('alive', 'spreader', 'you', 100, 100, 10);
    const dead  = makeUnit('dead',  'macrophage', 'immune', 200, 200, 0);
    const world = makeWorld([alive, dead]);

    removeDeadEntities(world);

    expect(world.entities).toHaveLength(1);
    expect(world.entities[0].id).toBe('alive');
  });

  it('also removes entities with negative hp', () => {
    const neg = makeUnit('neg', 'macrophage', 'immune', 200, 200, -5);
    const world = makeWorld([neg]);

    removeDeadEntities(world);

    expect(world.entities).toHaveLength(0);
  });

  it('leaves entities with hp > 0 untouched', () => {
    const e = makeUnit('fine', 'spreader', 'you', 100, 100, 1);
    const world = makeWorld([e]);

    removeDeadEntities(world);

    expect(world.entities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (c) Spitter hits at range; melee must be close
// ---------------------------------------------------------------------------
describe('range constraints', () => {
  it('melee spreader does NOT attack an enemy outside melee range', () => {
    const attacker = makeUnit('a1', 'spreader', 'you', 200, 200, 50);
    // Put enemy well beyond melee range (use spitter range as reference — should still be too far for spreader)
    const farEnemy = makeUnit('t1', 'macrophage', 'immune',
      200 + COMBAT_DEFS.spreader.range + 50, 200, 50);

    const world = makeWorld([attacker, farEnemy]);
    tickCombat(world, COMBAT_DEFS.spreader.cooldown * 3); // plenty of time

    // No damage — out of range
    expect(farEnemy.hp).toBe(50);
  });

  it('spitter hits an enemy at spitter range (which is beyond melee range)', () => {
    const spitterRange = COMBAT_DEFS.spitter.range;
    const meleeRange   = COMBAT_DEFS.spreader.range;

    // Confirm the setup makes sense: spitter range must be larger
    expect(spitterRange).toBeGreaterThan(meleeRange);

    const attacker = makeUnit('s1', 'spitter', 'you', 200, 200, 50);
    // Place enemy between melee range and spitter range
    const midEnemy = makeUnit('t1', 'macrophage', 'immune',
      200 + meleeRange + 10, 200, 50); // too far for melee, within spitter range

    const world = makeWorld([attacker, midEnemy]);
    tickCombat(world, COMBAT_DEFS.spitter.cooldown);

    expect(midEnemy.hp).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// (d) Units don't damage friendly entities
// ---------------------------------------------------------------------------
describe('no friendly fire', () => {
  it('a unit with only same-owner neighbours deals no damage', () => {
    const friendly1 = makeUnit('f1', 'spreader', 'you', 200, 200, 50);
    const friendly2 = makeUnit('f2', 'spreader', 'you', 210, 200, 50);

    const world = makeWorld([friendly1, friendly2]);
    tickCombat(world, COMBAT_DEFS.spreader.cooldown * 5);

    expect(friendly2.hp).toBe(50);
    expect(friendly1.hp).toBe(50);
  });

  it('immune units do not damage other immune units', () => {
    const m1 = makeUnit('m1', 'macrophage', 'immune', 200, 200, 80);
    const m2 = makeUnit('m2', 'macrophage', 'immune', 210, 200, 80);

    const world = makeWorld([m1, m2]);
    tickCombat(world, 5); // large dt

    expect(m1.hp).toBe(80);
    expect(m2.hp).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// (e) Auto-acquire: unit pursues enemy when in range
// ---------------------------------------------------------------------------
describe('auto-acquire', () => {
  it('a unit with no moveTo auto-sets an attack target when an enemy enters range', () => {
    const attacker = makeUnit('a1', 'spreader', 'you', 200, 200, 50);
    const enemy    = makeUnit('t1', 'macrophage', 'immune', 210, 200, 50);

    const world = makeWorld([attacker, enemy]);
    tickCombat(world, 0.001); // tiny tick — just enough to trigger target acquisition

    // attackTarget should now point to the enemy id
    expect(attacker.data.attackTarget).toBe('t1');
  });

  it('unit does not auto-acquire friendly units', () => {
    const u1 = makeUnit('u1', 'spreader', 'you', 200, 200, 50);
    const u2 = makeUnit('u2', 'spreader', 'you', 210, 200, 50);

    const world = makeWorld([u1, u2]);
    tickCombat(world, 0.001);

    expect(u1.data.attackTarget).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (f) Explicit attack-target command: targeting an enemy leads to approach + attack
// ---------------------------------------------------------------------------
describe('explicit attack target', () => {
  it('a unit with an attack target outside range moves toward it', () => {
    const attacker = makeUnit('a1', 'brute', 'you', 200, 200, 80);
    const enemy    = makeUnit('t1', 'macrophage', 'immune',
      200 + COMBAT_DEFS.brute.range + 100, 200, 80); // outside brute range

    // Command attack
    attacker.data.attackTarget = 't1';

    const world = makeWorld([attacker, enemy]);

    // After a tick the unit's moveTo should be set toward the enemy
    tickCombat(world, 1 / 60);
    const moveTo = attacker.data.moveTo as { x: number; y: number } | null;
    expect(moveTo).not.toBeNull();
    // moveTo x should be closer to enemy than attacker's own x
    if (moveTo) {
      expect(moveTo.x).toBeGreaterThan(attacker.pos.x);
    }
  });
});
