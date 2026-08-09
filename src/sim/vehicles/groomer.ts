/**
 * Løypemaskinen. Ingen rytme — bare gass, tomgang og revers.
 *
 * Den har motorkraft nok til å ta enhver bakke grafen kan by på, og den raser
 * ikke nedover: over marsjfarten legger beltet seg imot og holder den der.
 * Alt den kjører over blir preparert, også i revers.
 */

import type { Params } from '../constants'
import { advance, type Chooser } from '../traversal'
import type { GroomerState } from '../types'
import { edgeGradient } from '../world/geometry'
import { edgeOf, type World } from '../world/types'
import { groomSpan } from './grooming'

/** Toppfarten i den retningen maskinen faktisk beveger seg. */
function capFor(v: number, p: Params): number {
  const top = Math.max(p.GROOMER_MAX_SPEED, 0)
  return v >= 0 ? top : top * Math.max(p.GROOMER_REVERSE_FACTOR, 0)
}

export function stepGroomer(
  state: GroomerState,
  throttle: -1 | 0 | 1,
  now: number,
  dt: number,
  world: World,
  p: Params,
  chooser: Chooser,
): GroomerState {
  const edge = edgeOf(world, state.placement.edge)
  const theta = Math.atan(edgeGradient(edge, state.placement.s, state.placement.dir))

  let v = state.v
  const aGravity = -p.G * Math.sin(theta)
  const aDrag = -p.K_DRAG * v * Math.abs(v)
  const aRolling = v === 0 ? 0 : -Math.sign(v) * p.MU_UNGROOMED * p.G * Math.cos(theta)

  v += (throttle * p.GROOMER_POWER + aGravity + aDrag + aRolling) * dt

  // Beltet holder igjen. Over marsjfarten bremses den mot den, aldri under.
  const cap = capFor(v, p)
  if (Math.abs(v) > cap) {
    v = Math.sign(v) * Math.max(cap, Math.abs(v) - p.GROOMER_BRAKE * dt)
  }

  // Uten gass står den stille, også i bakke. En løypemaskin triller ikke.
  if (throttle === 0) {
    const braked = Math.abs(v) - p.GROOMER_BRAKE * dt
    v = braked <= 0 ? 0 : Math.sign(v) * braked
  }

  if (!Number.isFinite(v)) v = 0

  const before = state.placement
  const placement = advance(before, v * dt, world, chooser)

  // Stemple snøen bak seg. En maskin som står stille preparerer ingenting —
  // ellers ville én bøtte holdt seg evig fersk under en parkert maskin.
  if (v === 0) return { placement, v }

  // Ett steg er noen centimeter, så et kryss midt i steget deles i to spenn.
  if (placement.edge === before.edge) {
    groomSpan(world, before.edge, before.s, placement.s, now, p)
  } else {
    const moving = v >= 0 ? 1 : -1
    // Retningen bevegelsen har i hver kants egen s.
    const leftBehind = before.dir * moving === 1 ? edgeOf(world, before.edge).length : 0
    const enteredAt = placement.dir * moving === 1 ? 0 : edgeOf(world, placement.edge).length
    groomSpan(world, before.edge, before.s, leftBehind, now, p)
    groomSpan(world, placement.edge, enteredAt, placement.s, now, p)
  }

  return { placement, v }
}
