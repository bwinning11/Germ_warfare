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
