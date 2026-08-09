/**
 * Prepareringen. Dette er hele koblingen mellom de to modusene: løypemaskinen
 * skriver et tidsstempel i snøen, og skiløperen leser det som friksjon.
 *
 * Det eneste stedet i sim/ som muterer verdenen. Alt annet i world/ er lesing.
 */

import type { Params } from '../constants'
import { clamp } from '../rng'
import type { Placement } from '../traversal'
import { bucketIndex, freshnessAt } from '../world/geometry'
import { edgeOf, type EdgeId, type World } from '../world/types'

/**
 * Glidefriksjonen der man står. Ferskt preparert spor er nesten dobbelt så
 * raskt som upreparert snø, og fordelen visner jevnt over GROOM_DECAY_TIME.
 */
export function muAt(world: World, placement: Placement, now: number, p: Params): number {
  const edge = edgeOf(world, placement.edge)
  const freshness = freshnessAt(edge, placement.s, now, p)
  return p.MU_UNGROOMED + (p.MU_GROOMED - p.MU_UNGROOMED) * freshness
}

/**
 * Stempler strekningen mellom `from` og `to` som preparert nå. Rekkefølgen
 * på argumentene spiller ingen rolle — løypemaskinen preparerer like godt
 * i revers.
 */
export function groomSpan(
  world: World,
  edgeId: EdgeId,
  from: number,
  to: number,
  now: number,
  p: Params,
): void {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(now)) return
  const edge = edgeOf(world, edgeId)
  const lo = bucketIndex(edge, Math.min(from, to), p)
  const hi = bucketIndex(edge, Math.max(from, to), p)
  for (let i = lo; i <= hi; i++) edge.groomedAt[i] = now
}

/** Hvor stor andel av en kant som er preparert akkurat nå. Til minikartet. */
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
