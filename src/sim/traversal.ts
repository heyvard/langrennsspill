/**
 * Å flytte seg langs grafen. Ren funksjon, ingen tilstand — skiløperen og
 * løypemaskinen bruker nøyaktig den samme.
 *
 * En `Placement` er hvilken kant man er på, hvor langt inn på den man har
 * kommet målt fra `edge.from`, og hvilken vei man kjører. `s` snur aldri
 * betydning; det er `dir` som bestemmer hvilken vei `s` beveger seg.
 */

import { clampS, edgeHeading } from './world/geometry'
import { edgeOf, edgesAt, type EdgeId, type NodeId, type World } from './world/types'

export interface Placement {
  edge: EdgeId
  /** Meter fra `edge.from`, alltid i [0, edge.length]. */
  s: number
  /** 1 = mot `edge.to`, -1 = mot `edge.from`. */
  dir: 1 | -1
}

export interface Junction {
  node: NodeId
  /** Kanten man kom inn på. */
  from: EdgeId
  /** Retningen man ankom i, som vinkel i xz. */
  heading: number
  /** Kantene man kan velge, uten den man kom fra. Aldri tom. */
  options: EdgeId[]
}

export type Chooser = (junction: Junction, world: World) => EdgeId

/**
 * Tak på hvor mange kryss ett kall får passere. Uten det ville en graf med
 * en degenerert kortkant kunne spinne i evig løkke.
 */
const MAX_JUNCTIONS = 64

export function startPlacement(world: World, node: NodeId = world.stadion): Placement {
  const first = edgesAt(world, node)[0]
  if (!first) throw new Error(`noden ${node} har ingen kanter`)
  const edge = edgeOf(world, first)
  return edge.from === node
    ? { edge: first, s: 0, dir: 1 }
    : { edge: first, s: edge.length, dir: -1 }
}

/** Noden man er på vei mot. */
export function nextNode(placement: Placement, world: World): NodeId {
  const edge = edgeOf(world, placement.edge)
  return placement.dir === 1 ? edge.to : edge.from
}

/** Meter igjen til neste node. Aldri negativ. */
export function nextNodeDistance(placement: Placement, world: World): number {
  const edge = edgeOf(world, placement.edge)
  const s = clampS(edge, placement.s)
  return placement.dir === 1 ? edge.length - s : s
}

/** Retningen man kjører i akkurat nå, som vinkel i xz. */
export function heading(placement: Placement, world: World): number {
  return edgeHeading(edgeOf(world, placement.edge), placement.s, placement.dir)
}

/** Signert vinkelforskjell i (-π, π]. */
function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d <= -Math.PI) d += Math.PI * 2
  if (d > Math.PI) d -= Math.PI * 2
  return d
}

/** Retningen en kant peker i når man forlater `node`. */
export function departureHeading(world: World, edgeId: EdgeId, node: NodeId): number {
  const edge = edgeOf(world, edgeId)
  return edge.from === node
    ? edgeHeading(edge, 0, 1)
    : edgeHeading(edge, edge.length, -1)
}

/**
 * Standardvalget: minste retningsendring. Gjør man ingenting, fortsetter man
 * rett fram gjennom krysset. Ingen brå stopp, ingen tilfeldige avstikkere.
 */
export function straightest(junction: Junction, world: World): EdgeId {
  let best = junction.options[0]
  let bestTurn = Infinity
  for (const option of junction.options) {
    const turn = Math.abs(
      angleDelta(junction.heading, departureHeading(world, option, junction.node)),
    )
    if (turn < bestTurn) {
      bestTurn = turn
      best = option
    }
  }
  return best
}

/**
 * Velger kanten som ligger lengst til den oppgitte siden, målt fra retningen
 * man ankom i. Dette er det et sveip betyr.
 */
export function turning(side: 'L' | 'R'): Chooser {
  return (junction, world) => {
    // Positiv delta er mot klokka i xz. Med z inn i skjermen leses det som
    // en høyresving, så L og R blir henholdsvis negativ og positiv.
    const want = side === 'R' ? 1 : -1
    let best: EdgeId | null = null
    let bestTurn = -Infinity
    for (const option of junction.options) {
      const delta =
        want * angleDelta(junction.heading, departureHeading(world, option, junction.node))
      if (delta > bestTurn) {
        bestTurn = delta
        best = option
      }
    }
    // Ingen kant på den siden i det hele tatt: fortsett rett fram heller enn
    // å stoppe eller snu.
    return bestTurn > 0 && best !== null ? best : straightest(junction, world)
  }
}

/**
 * Flytter `distance` meter langs grafen. Negativ avstand rygger — man peker
 * fortsatt samme vei, men beveger seg baklengs.
 *
 * Passerer man enden av en kant, ankommer man en node: de utgående kantene
 * hentes, den man kom fra tas bort, og `chooser` velger blant resten. Er
 * noden en blindvei, snus retningen automatisk.
 */
export function advance(
  placement: Placement,
  distance: number,
  world: World,
  chooser: Chooser = straightest,
): Placement {
  let edge = edgeOf(world, placement.edge)
  let s = clampS(edge, placement.s)
  let dir = placement.dir
  if (!Number.isFinite(distance) || distance === 0) return { edge: edge.id, s, dir }

  /** Om man kjører framover eller baklengs i forhold til der man peker. */
  const sign: 1 | -1 = distance > 0 ? 1 : -1
  let left = Math.abs(distance)

  for (let hop = 0; hop <= MAX_JUNCTIONS; hop++) {
    // Den fysiske bevegelsesretningen, uttrykt i kantens s.
    const travel: 1 | -1 = dir === sign ? 1 : -1
    const room = travel === 1 ? edge.length - s : s

    if (left <= room) return { edge: edge.id, s: s + travel * left, dir }
    left -= room

    const node = travel === 1 ? edge.to : edge.from
    const options = edgesAt(world, node).filter((id) => id !== edge.id)

    if (options.length === 0) {
      // Blindvei. Man snur på stedet og bruker resten av strekningen tilbake.
      s = travel === 1 ? edge.length : 0
      dir = dir === 1 ? -1 : 1
      continue
    }

    const junction: Junction = {
      node,
      from: edge.id,
      heading: edgeHeading(edge, travel === 1 ? edge.length : 0, travel),
      options,
    }
    let chosen = chooser(junction, world)
    if (!options.includes(chosen)) chosen = options[0]

    edge = edgeOf(world, chosen)
    // Vi står i `node` og skal ut i den nye kanten derfra.
    const travelOut: 1 | -1 = edge.from === node ? 1 : -1
    s = travelOut === 1 ? 0 : edge.length
    dir = travelOut === sign ? 1 : -1
  }

  // Kom vi hit er grafen degenerert. Stopp heller enn å spinne.
  return { edge: edge.id, s: clampS(edge, s), dir }
}

/** Noden man vil ankomme hvis man fortsetter uten å gjøre noe. */
export function previewJunction(placement: Placement, world: World): Junction | null {
  const edge = edgeOf(world, placement.edge)
  const node = nextNode(placement, world)
  const options = edgesAt(world, node).filter((id) => id !== edge.id)
  if (options.length === 0) return null
  return {
    node,
    from: edge.id,
    heading: edgeHeading(edge, placement.dir === 1 ? edge.length : 0, placement.dir),
    options,
  }
}
