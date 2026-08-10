/**
 * Prepareringen. Dette er hele koblingen mellom de to modusene: løypemaskinen
 * skriver et tidsstempel i snøen, og skiløperen leser det som friksjon.
 *
 * Det eneste stedet i sim/ som muterer verdenen. Alt annet i world/ er lesing.
 */

import type { Params } from '../constants'
import { clamp } from '../rng'
import type { Placement } from '../traversal'
import { bucketIndex, freshnessAt, laneIndex } from '../world/geometry'
import { edgeOf, type EdgeId, type World } from '../world/types'

/**
 * Glidefriksjonen der man står. Ferskt preparert spor er nesten dobbelt så
 * raskt som upreparert snø, og fordelen visner jevnt over GROOM_DECAY_TIME.
 *
 * Leses alltid i midtbanen: skiløperen holder seg på midtlinja og har ingen
 * sideveis posisjon. Preparerer maskinen bare ytterkantene, blir hun altså
 * ikke raskere — hun må ha midtbanen.
 */
export function muAt(world: World, placement: Placement, now: number, p: Params): number {
  const edge = edgeOf(world, placement.edge)
  const freshness = freshnessAt(edge, placement.s, 0, now, p)
  return p.MU_UNGROOMED + (p.MU_GROOMED - p.MU_UNGROOMED) * freshness
}

/**
 * Stempler strekningen mellom `from` og `to` som preparert nå, i det avtrykket
 * bladet setter rundt `lat` med kursen `yaw`. Rekkefølgen på argumentene
 * spiller ingen rolle — løypemaskinen preparerer like godt i revers.
 *
 * `lat` er meter mot høyre for `from → to`, altså i kantens eget rom, ikke
 * førerens. Bladet er symmetrisk, så fortegnet trenger ingen omregning her.
 *
 * Bladet er en bjelke på tvers av maskinen, og den dreier med kursen: på tvers
 * av løypa dekker den bladbredden ganger |cos ψ|, langs løypa ganger |sin ψ|.
 * Uten den dreiningen ville en maskin som krabbet sidelengs over løypa lagt
 * full bladbredde i hver eneste bane den passerte og preparert hele bredden
 * på ett drag. Med den er prepareringen bladbredde ganger fart uansett kurs,
 * og de tre passene står ved lag.
 */
export function groomSpan(
  world: World,
  edgeId: EdgeId,
  from: number,
  to: number,
  lat: number,
  yaw: number,
  now: number,
  p: Params,
): void {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(now)) return
  const edge = edgeOf(world, edgeId)

  const half = Math.max(p.GROOMER_BLADE_WIDTH, 0) / 2
  const heading = Number.isFinite(yaw) ? yaw : 0
  const across = half * Math.abs(Math.cos(heading))
  const along = half * Math.abs(Math.sin(heading))

  const lo = bucketIndex(edge, Math.min(from, to) - along, p)
  const hi = bucketIndex(edge, Math.max(from, to) + along, p)

  const centre = Number.isFinite(lat) ? lat : 0
  const loLane = laneIndex(centre - across, p)
  const hiLane = laneIndex(centre + across, p)

  for (let lane = loLane; lane <= hiLane; lane++) {
    const base = lane * edge.buckets
    for (let i = lo; i <= hi; i++) edge.groomedAt[base + i] = now
  }
}

/**
 * Hvor stor andel av en kants flate som er preparert akkurat nå. Til
 * minikartet. Midler over hele rutenettet, så én passering ned en femten meter
 * bred løype med fem meter blad gir en tredel — bredden teller like mye som
 * lengden.
 */
export function groomedShare(world: World, edgeId: EdgeId, now: number, p: Params): number {
  const edge = edgeOf(world, edgeId)
  let sum = 0
  for (let i = 0; i < edge.groomedAt.length; i++) {
    const groomed = edge.groomedAt[i]
    if (groomed < 0) continue
    sum += clamp(1 - (now - groomed) / Math.max(p.GROOM_DECAY_TIME, 1e-6), 0, 1)
  }
  return sum / edge.groomedAt.length
}
