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
  | 'placeholder'   // task-1 proof-of-concept mover
  | 'spreader'      // player germ unit (future)
  | 'brute'         // player germ unit (future)
  | 'spitter'       // player germ unit (future)
  | 'base'          // player production structure (future)
  | 'macrophage'    // immune enemy — tank, slower
  | 'neutrophil'    // immune enemy — fast harasser (wave 3+)
  | 'antibody'      // immune projectile (future)
  | 'organ';        // capture objective (future)

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
  /** Arbitrary extra data for kind-specific state (attack cooldown, state machine, etc.). */
  data: Record<string, unknown>;
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
}
