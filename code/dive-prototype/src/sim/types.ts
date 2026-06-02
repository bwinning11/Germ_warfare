export type ZoneKind = 'portal' | 'connective' | 'organ' | 'gland'
export type Owner = 'none' | 'you'

export interface Zone {
  id: string
  kind: ZoneKind
  owner: Owner
  infection: number
}

export interface Edge {
  from: string
  to: string
  barrier: boolean
}

export interface GameMap {
  zones: Zone[]
  edges: Edge[]
}

/** What neighbors() returns for each adjacent zone */
export interface NeighborRef {
  id: string
  barrier: boolean
}

/**
 * The complete, serialisable state of the simulation at a single tick.
 * Intentionally minimal — future tasks will add biomass, heat, etc. as
 * additional optional fields on this same interface.
 */
export interface GameState {
  tick: number
  map: GameMap
  // Future fields (biomass, heat, spread, …) will be added here.
}

/**
 * A player or AI instruction applied at the start of each tick.
 * Starts as an empty union — later tasks will add real variants
 * (e.g. { kind: 'spread'; from: string; to: string }).
 */
export type Order = never
