/**
 * Skilt. De skrives aldri for hånd — de leses ut av grafen, akkurat som de
 * ekte skiltene i Marka er en påstand om hva som faktisk ligger den veien.
 *
 * For hver utgående kant i et kryss kjøres Dijkstra tvunget til å starte med
 * nettopp den kanten. Da svarer skiltet på det eneste spørsmålet som betyr
 * noe når man står der: hvor kommer jeg hvis jeg tar denne?
 */

import type { Params } from '../constants'
import { edgeOf, edgesAt, otherEnd, type EdgeId, type NodeId, type World } from './types'

/** Grensa for at en node regnes som et kryss verdt et skilt. */
const MIN_DEGREE = 3

export interface SignEntry {
  name: string
  /** Avstand i kilometer, avrundet til én desimal. */
  distanceKm: number
}

export interface Sign {
  nodeId: NodeId
  /** Kanten skiltet peker langs. */
  edgeId: EdgeId
  /** Nærmeste steder først. Tom liste betyr ingenting verdt å skilte til. */
  entries: SignEntry[]
}

/**
 * Korteste avstand fra `start` til hver node, når første steg er tvunget til
 * å være `firstEdge`. Kanten man kom fra er ikke sperret videre — en løype
 * kan gå i ring tilbake, og da er den ringen det korteste svaret.
 */
function distancesVia(world: World, start: NodeId, firstEdge: EdgeId): Map<NodeId, number> {
  const edge = edgeOf(world, firstEdge)
  const entry = otherEnd(edge, start)

  const best = new Map<NodeId, number>([[entry, edge.length]])
  // Grafen har titalls noder, så en usortert kø er raskere enn en heap og
  // langt lettere å lese.
  const pending = new Set<NodeId>([entry])

  while (pending.size > 0) {
    let current: NodeId | null = null
    let currentDistance = Infinity
    for (const id of pending) {
      const d = best.get(id)!
      if (d < currentDistance) {
        currentDistance = d
        current = id
      }
    }
    if (current === null) break
    pending.delete(current)

    for (const id of edgesAt(world, current)) {
      const e = edgeOf(world, id)
      const next = otherEnd(e, current)
      const candidate = currentDistance + e.length
      const known = best.get(next)
      if (known !== undefined && known <= candidate) continue
      best.set(next, candidate)
      pending.add(next)
    }
  }

  return best
}

/** Alle skilt i verdenen. Kjøres én gang ved lasting. */
export function generateSigns(world: World, p: Params): Sign[] {
  const limit = Math.max(1, Math.round(p.SIGN_ENTRY_COUNT))
  const maxDistance = Math.max(0, p.SIGN_MAX_DISTANCE)
  const signs: Sign[] = []

  for (const node of world.nodes.values()) {
    const outgoing = edgesAt(world, node.id)
    if (outgoing.length < MIN_DEGREE) continue

    for (const edgeId of outgoing) {
      const distances = distancesVia(world, node.id, edgeId)
      const entries: SignEntry[] = []

      for (const [id, metres] of distances) {
        if (id === node.id) continue
        const poi = world.nodes.get(id)?.poi
        if (!poi) continue
        if (metres > maxDistance) continue
        entries.push({ name: poi.name, distanceKm: Math.round(metres / 100) / 10 })
      }

      // Nærmest først. Navnet er tie-break, så rekkefølgen er deterministisk.
      entries.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, 'nb'))
      signs.push({ nodeId: node.id, edgeId, entries: entries.slice(0, limit) })
    }
  }

  return signs
}

/** Skiltene gruppert på node, som render/ trenger dem. */
export function signsByNode(signs: Sign[]): Map<NodeId, Sign[]> {
  const out = new Map<NodeId, Sign[]>()
  for (const sign of signs) {
    const list = out.get(sign.nodeId)
    if (list) list.push(sign)
    else out.set(sign.nodeId, [sign])
  }
  return out
}

/** Avstanden slik den står på skiltet: én desimal, norsk komma. */
export function formatDistance(km: number): string {
  return km.toFixed(1).replace('.', ',')
}
