export type ZoneKind = 'portal' | 'connective' | 'organ' | 'gland'
export type Owner = 'none' | 'you'
export type ZoneId = string

export interface Zone {
  id: ZoneId
  kind: ZoneKind
  owner: Owner
  infection: number
}

export interface Edge {
  from: ZoneId
  to: ZoneId
  barrier: boolean
}

export interface GameMap {
  zones: Zone[]
  edges: Edge[]
}

/** What neighbors() returns for each adjacent zone */
export interface NeighborRef {
  id: ZoneId
  barrier: boolean
}

/** A single innate immune responder placed in a zone. */
export interface Responder {
  zone: ZoneId
}

/** Outcome of a dive: still running, successful escape, or caught by immune system. */
export type DiveResult = 'ongoing' | 'escape' | 'caught'

/**
 * The complete, serialisable state of the simulation at a single tick.
 */
export interface GameState {
  tick: number
  map: GameMap
  biomass: number
  /** In-progress colonize operations: zone id → ticks invested so far */
  colonizeProgress: Record<ZoneId, number>
  /** In-progress breach operations: zone id → ticks invested so far */
  breachProgress: Record<ZoneId, number>
  /** Body-wide alarm level. Rises with owned-zone count; decays while dormant. */
  heat: number
  /** Whether the player is hiding (no colonize progress; heat decays). */
  dormant: boolean
  /** Active innate immune responders (one per targeted zone). */
  responders: Responder[]
  /** Current outcome of the dive. Once not 'ongoing', no further ticks advance. */
  result: DiveResult
  /** Virality points banked when the dive ends. 0 while ongoing; 0 on caught. */
  banked: number
}

/** Colonize order: direct your infection toward an adjacent non-barrier zone. */
export interface ColonizeOrder {
  type: 'colonize'
  target: ZoneId
}

/**
 * Dormancy order: toggle stealth mode. While dormant, colonize halts and heat decays.
 * Issue again to resume active spread.
 */
export interface DormancyOrder {
  type: 'dormancy'
}

/**
 * Breach order: work through a barrier edge to open it permanently.
 * Target is the barrier-gated zone (e.g. 'gland'). A you-owned zone must
 * border that zone via a barrier edge. After BREACH_TICKS the edge becomes
 * passable and a subsequent colonize order will be accepted.
 */
export interface BreachOrder {
  type: 'breach'
  target: ZoneId
}

/**
 * Escape order: attempt to exit the body through a portal zone that the player owns.
 * Valid only when the named portal exists, is kind:'portal', and is owner:'you'.
 * On success the dive ends immediately with result:'escape' and virality banked.
 */
export interface EscapeOrder {
  type: 'escape'
  portal: ZoneId
}

/**
 * A player or AI instruction applied at the start of each tick.
 */
export type Order = ColonizeOrder | DormancyOrder | BreachOrder | EscapeOrder
