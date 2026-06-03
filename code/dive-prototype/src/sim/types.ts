export type ZoneKind = 'portal' | 'connective' | 'organ' | 'gland' | 'pickup'
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
  /** Body-wide alarm level. Rises with hot owned zones; decays naturally when little is hot. */
  heat: number
  /**
   * Per-node dormancy: set of owned zone ids currently in dormant mode.
   * Dormant nodes produce no income, add no Heat, and immune responders deprioritize them.
   * They still conduct network connectivity (so dorming a node never severs the graph).
   */
  dormant: Set<ZoneId>
  /** Active innate immune responders (one per targeted zone). */
  responders: Responder[]
  /** Current outcome of the dive. Once not 'ongoing', no further ticks advance. */
  result: DiveResult
  /** Virality points banked when the dive ends. 0 while ongoing; 0 on caught. */
  banked: number
  /**
   * Brutes deployed to owned nodes. A Brute reduces responder damage taken per tick
   * in its zone, letting the player hold chokepoints under immune pressure.
   */
  brutes: Set<ZoneId>
  /**
   * Cysts built on owned nodes. A Cyst fortifies a zone, significantly reducing
   * responder damage taken per tick (more durable than a Brute, but more expensive).
   */
  cysts: Set<ZoneId>
  /**
   * Zone ids whose pickup boon has already been applied. Prevents the boon from
   * firing more than once per zone, even if ownership changes and returns.
   */
  collectedPickups: Set<ZoneId>
}

/** Colonize order: direct your infection toward an adjacent non-barrier zone. */
export interface ColonizeOrder {
  type: 'colonize'
  target: ZoneId
}

/**
 * Dormancy order: toggle a specific zone between hot and dormant.
 * Dormant nodes produce no income and no Heat; hot is the default.
 * Omitting zoneId is deprecated — use a zoneId to target a specific node.
 */
export interface DormancyOrder {
  type: 'dormancy'
  zoneId: ZoneId
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
 * DeployBrute order: spend biomass to place a Brute on an owned zone.
 * The Brute reduces responder damage in that zone each tick.
 */
export interface DeployBruteOrder {
  type: 'deployBrute'
  zoneId: ZoneId
}

/**
 * BuildCyst order: spend biomass to build a Cyst on an owned zone.
 * The Cyst further reduces responder damage (stronger than a Brute; slower immune clearance).
 */
export interface BuildCystOrder {
  type: 'buildCyst'
  zoneId: ZoneId
}

/**
 * A player or AI instruction applied at the start of each tick.
 */
export type Order = ColonizeOrder | DormancyOrder | BreachOrder | EscapeOrder | DeployBruteOrder | BuildCystOrder
