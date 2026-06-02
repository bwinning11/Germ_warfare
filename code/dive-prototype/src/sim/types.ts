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

/**
 * The complete, serialisable state of the simulation at a single tick.
 */
export interface GameState {
  tick: number
  map: GameMap
  biomass: number
  /** In-progress colonize operations: zone id → ticks invested so far */
  colonizeProgress: Record<ZoneId, number>
}

/** Colonize order: direct your infection toward an adjacent non-barrier zone. */
export interface ColonizeOrder {
  type: 'colonize'
  target: ZoneId
}

/**
 * A player or AI instruction applied at the start of each tick.
 */
export type Order = ColonizeOrder
