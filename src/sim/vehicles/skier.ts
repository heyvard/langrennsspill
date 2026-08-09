/**
 * Skiløperen. Takt-modellen er uendret fra før — det eneste nye er at
 * friksjonen ikke lenger er en konstant, men slås opp fra løypa man står i.
 *
 * Fortegn: theta = atan(gradient i kjøreretningen), så positiv theta er
 * motbakke og gravitasjonsleddet er `-G * sin(theta)`.
 */

import { applyTap, evaluateTap, gripFrom } from '../cadence'
import type { Params } from '../constants'
import { clamp } from '../rng'
import { advance, type Chooser } from '../traversal'
import type { SkierState, Tap } from '../types'
import { edgeGradient, freshnessAt } from '../world/geometry'
import { edgeOf, type World } from '../world/types'

/**
 * Ett fast tidssteg. `taps` er tappene som hører til dette steget, allerede
 * sortert på tid av den som kaller.
 */
export function stepSkier(
  state: SkierState,
  taps: Tap[],
  now: number,
  dt: number,
  world: World,
  p: Params,
  chooser: Chooser,
): SkierState {
  const edge = edgeOf(world, state.placement.edge)
  const theta = Math.atan(edgeGradient(edge, state.placement.s, state.placement.dir))
  // Skiløperen ligger i sporet på midtlinja — hun har ingen sideveis posisjon.
  const freshness = freshnessAt(edge, state.placement.s, 0, now, p)
  const mu = p.MU_UNGROOMED + (p.MU_GROOMED - p.MU_UNGROOMED) * freshness
  const grip = gripFrom(freshness, p)

  let v = state.v
  let cadence = state.cadence

  // Impulser først, så de virker gjennom hele steget.
  for (const tap of taps) {
    const evaluated = evaluateTap(tap, cadence, v, theta, grip, p)
    v += evaluated.impulse
    cadence = applyTap(tap, evaluated.quality)
  }

  const aGravity = -p.G * Math.sin(theta)
  // Friksjon virker bare mens løperen faktisk glir — ellers ville den
  // dyttet farten under null.
  const aFriction = v > 0 ? -mu * p.G * Math.cos(theta) : 0
  const aDrag = -p.K_DRAG * v * v

  v += (aGravity + aFriction + aDrag) * dt

  if (!Number.isFinite(v)) v = 0
  v = clamp(v, 0, Math.max(p.MAX_SPEED, 0))

  return { placement: advance(state.placement, v * dt, world, chooser), v, cadence }
}
