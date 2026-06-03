// ---------------------------------------------------------------------------
// Core types for the RTS entity/world model.
// This file is intentionally DOM-free — logic only.
// ---------------------------------------------------------------------------

/** The owner of an entity — player-controlled, immune system, or unclaimed. */
export type Owner = 'you' | 'immune' | 'neutral';

/**
 * The kind of entity in the game world.
 * Extend this union as new entity classes are added in later tasks.
 */
export type EntityKind =
  | 'placeholder'     // task-1 proof-of-concept mover
  | 'spreader'        // player germ unit (future)
  | 'brute'           // player germ unit (future)
  | 'spitter'         // player germ unit (future)
  | 'base'            // player production structure (future)
  | 'macrophage'      // INNATE — slow, tanky roamer; generic first-responder
  | 'neutrophil'      // INNATE — fast, weak harasser; rapid-response scout
  | 'dendritic_cell'  // ADAPTIVE — anti-swarm; counters Spreader (pattern recognition)
  | 'nk_cell'         // ADAPTIVE — heavy melee; counters Brute
  | 't_cell'          // ADAPTIVE — ranged interceptor; counters Spitter
  | 'antibody'        // immune projectile (future)
  | 'organ';          // capture objective (future)

/**
 * High-level state of the match.
 *  - 'onboarding' : start-paused tutorial overlay; sim frozen until the player clicks BEGIN.
 *  - 'playing'    : the match is live.
 *  - 'won'        : the player captured the organ.
 *  - 'lost'       : the player's base was destroyed.
 */
export type GameState = 'onboarding' | 'playing' | 'won' | 'lost';

/** 2D position or velocity vector. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A single entity in the world.
 * All fields are value-typed so the world can be stepped as an immutable
 * snapshot (or mutated in place — both patterns are supported by the shape).
 */
export interface Entity {
  readonly id: string;
  kind: EntityKind;
  pos: Vec2;
  vel: Vec2;
  /** Current hit points. */
  hp: number;
  /** Max hit points — useful for health-bar rendering later. */
  maxHp: number;
  owner: Owner;
  /**
   * Arbitrary extra data for kind-specific state (attack cooldown, state machine, etc.).
   *
   * Movement fields used by the vessel-lane system:
   *   moveTo      : final destination (Vec2 | null)
   *   waypoints   : intermediate chamber waypoints still to traverse (Vec2[])
   *   speed       : movement speed in px/s (number)
   */
  data: Record<string, unknown>;
}

/**
 * The three producible unit kinds.  Used as a key in ProductionMix.
 */
export type GermKind = 'spreader' | 'brute' | 'spitter';

// ---------------------------------------------------------------------------
// Capturable control points
// ---------------------------------------------------------------------------

/**
 * The four kinds of capturable control points on the map.
 *
 * - 'organ'           : the existing win-condition objective (hold to win).
 * - 'nutrient_node'   : increases passive biomass income while held.
 * - 'forward_colony'  : auto-produced units can spawn/rally here (closer to front).
 * - 'choke_fortress'  : buffs nearby player units' damage while held.
 */
export type CapturePointKind = 'organ' | 'nutrient_node' | 'forward_colony' | 'choke_fortress';

/**
 * A control point on the map that can be captured and held.
 * Distinct from Entity — it's a static map object, not a mobile unit.
 */
export interface CapturePoint {
  /** Unique id — stable across the match. */
  id: string;
  kind: CapturePointKind;
  /** World-space position (chamber centre). */
  pos: { x: number; y: number };
  /** Current owner. Starts 'neutral'. */
  owner: Owner;
  /**
   * Capture timer in seconds.  Climbs toward POINT_CAPTURE_TIME while held
   * uncontested; stalls while contested; decays while not held.
   */
  captureProgress: number;
  /** True when both player and immune units are present simultaneously. */
  contested: boolean;
  /** Display radius (px) used for hold-zone and rendering. */
  radius: number;
}

/**
 * Production mix — the relative weights the auto-builder uses to decide which
 * unit type to produce next.  A weight of 0 means that type is disabled.
 *
 * Example: { spreader: 3, brute: 1, spitter: 2 } means the builder will target
 * roughly 50 % spreaders, 17 % brutes, and 33 % spitters.
 */
export interface ProductionMix {
  spreader: number;
  brute: number;
  spitter: number;
}

/**
 * The entire game world — one record passed through every simulation step.
 * The arena dimensions are stored here so the update function can use them
 * without touching the DOM.
 */
export interface World {
  /** All entities currently alive in the simulation. */
  entities: Entity[];
  /** Arena width in pixels (logical). */
  width: number;
  /** Arena height in pixels (logical). */
  height: number;
  /** Simulation wall-clock time in seconds since start (increments with each step). */
  elapsed: number;
  /** Whether the simulation is currently paused. */
  paused: boolean;
  /** Player's current biomass (resource for producing units). */
  biomass: number;
  /** Rally point: newly produced units move here after spawning. */
  rallyPoint: Vec2 | null;
  /** High-level match state (onboarding / playing / won / lost). */
  gameState: GameState;
  /**
   * Capture progress on the organ, in seconds held (0 .. CAPTURE_TIME).
   * Climbs while you hold the organ uncontested; decays when you don't.
   */
  captureProgress: number;
  /** True when an immune unit is contesting the organ (capture stalled). */
  organContested: boolean;
  /**
   * Auto-production mix: relative weights for Spreader / Brute / Spitter.
   * A weight of 0 disables that type.  The builder continuously spends biomass
   * per this mix — the player sets it and lets the tide flow automatically.
   */
  productionMix: ProductionMix;
  /**
   * Accumulated build progress (biomass-equivalent units).
   * Carries partial progress across ticks so expensive units complete correctly.
   * Managed by autoBuildStep — do not set directly.
   */
  buildAccumulator: number;
  /**
   * Current adaptive immune threat level (0..∞).
   * Computed from elapsed time + player army size. Shown in the HUD.
   * Higher = heavier adaptive pushes incoming.
   */
  threatLevel: number;

  /**
   * All capturable control points on the map (excluding the organ, which is
   * still tracked as an Entity for historical reasons).
   *
   * Includes: nutrient_node, forward_colony, choke_fortress.
   * The organ win-condition logic remains in captureProgress / organContested.
   */
  capturePoints: CapturePoint[];
}
