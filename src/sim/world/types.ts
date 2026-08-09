/**
 * Verdenen som data. Ren TS — importerer aldri three eller react.
 *
 * Grafen er noder i xz-planet og kanter som er polylinjer mellom dem. Høyden
 * kommer fra det samme høydefeltet render/ tegner terrenget fra, og samples
 * ved generering slik at oppslag underveis er billige.
 */

export type NodeId = string
export type EdgeId = string

export type PoiKind = 'hytte' | 'topp' | 'vann' | 'kryss' | 'stadion'

export type Difficulty = 'lett' | 'middels' | 'krevende'

export type Poi = { name: string; kind: PoiKind }

export interface WorldNode {
  id: NodeId
  /** [x, z] i meter. */
  pos: [number, number]
  /** Mangler på rene kryssnoder som bare deler opp en lang kant. */
  poi?: Poi
}

export interface WorldEdge {
  id: EdgeId
  from: NodeId
  to: NodeId
  /** Polyline i xz, inkludert begge endepunkter. Minst to punkter. */
  points: [number, number][]
  /** Buelengde fram til hvert punkt. Strengt voksende, `cumulative[0] === 0`. */
  cumulative: Float64Array
  /** Terrenghøyde i hvert punkt, samplet ved generering. */
  elevation: Float64Array
  /** Total buelengde i meter. Lik `cumulative[cumulative.length - 1]`. */
  length: number
  name?: string
  difficulty: Difficulty
  /** Brattest |dy/ds| langs kanten. difficulty utledes av denne. */
  maxGradient: number
  /**
   * Sim-tiden hver bøtte sist ble preparert, én bøtte per
   * GROOM_BUCKET_LENGTH meter. Negativ verdi betyr aldri preparert —
   * NaN skal aldri finnes i sim.
   */
  groomedAt: Float64Array
}

export interface World {
  seed: number
  nodes: Map<NodeId, WorldNode>
  edges: Map<EdgeId, WorldEdge>
  /** Kantene som rører hver node, sortert på ID. Determinisme. */
  outgoing: Map<NodeId, EdgeId[]>
  /** Startpunktet. Alltid en node med `poi.kind === 'stadion'`. */
  stadion: NodeId
}

/** Verdien i `groomedAt` som betyr «aldri preparert». */
export const NEVER_GROOMED = -1

export function nodeOf(world: World, id: NodeId): WorldNode {
  const n = world.nodes.get(id)
  if (!n) throw new Error(`ukjent node: ${id}`)
  return n
}

export function edgeOf(world: World, id: EdgeId): WorldEdge {
  const e = world.edges.get(id)
  if (!e) throw new Error(`ukjent kant: ${id}`)
  return e
}

/** Kantene ut fra en node. Tom liste for en node uten kanter. */
export function edgesAt(world: World, id: NodeId): EdgeId[] {
  return world.outgoing.get(id) ?? []
}

/** Noden i andre enden av kanten. */
export function otherEnd(edge: WorldEdge, from: NodeId): NodeId {
  return edge.from === from ? edge.to : edge.from
}
