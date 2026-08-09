/**
 * Orkestratoren. Fast timestep, deterministisk, ingen NaN.
 *
 * Selve fysikken bor i vehicles/. Her ligger bare det som er felles for begge
 * kjøretøy: hvilket av dem som er aktivt, og hvordan et sveip blir til et
 * valg i neste kryss.
 */

import type { Params } from './constants'
import { initialCadence } from './cadence'
import { advance, nextNodeDistance, startPlacement, straightest, turning } from './traversal'
import type { State, StepInput, Tap } from './types'
import type { World } from './world/types'
import { stepGroomer } from './vehicles/groomer'
import { stepSkier } from './vehicles/skier'

/** Hvor langt ut på første kant løperen står ved oppstart, meter. */
const START_OFFSET = 30
/** Hvor langt bak løperen løypemaskinen står, meter. */
const GROOMER_OFFSET = 25

export function initialState(world: World): State {
  // Et stykke ut på kanten, ikke oppi skiltstolpen på stadion.
  const start = advance(startPlacement(world), START_OFFSET, world, straightest)
  return {
    t: 0,
    mode: 'skier',
    skier: { placement: start, v: 0, cadence: initialCadence() },
    // Litt bak, så den ikke står oppi løperen i det bildet kommer opp.
    groomer: { placement: advance(start, -GROOMER_OFFSET, world, straightest), v: 0 },
    pendingTurn: null,
  }
}

/**
 * Er tappet forfalt ved slutten av dette steget?
 * Tapp som ligger bak `tEnd` regnes også som forfalt — et input som kom
 * inn litt for sent skal aldri forsvinne, det utføres nå.
 */
export function isDue(tap: Tap, tEnd: number): boolean {
  return tap.t < tEnd
}

/** Deler tapp i de som skal utføres innen tEnd, og de som må vente. */
export function partitionTaps(taps: Tap[], tEnd: number): { due: Tap[]; rest: Tap[] } {
  const due: Tap[] = []
  const rest: Tap[] = []
  for (const tap of taps) (isDue(tap, tEnd) ? due : rest).push(tap)
  due.sort((a, b) => a.t - b.t)
  return { due, rest }
}

/** Placementen til kjøretøyet spilleren styrer akkurat nå. */
export function activePlacement(state: State) {
  return state.mode === 'skier' ? state.skier.placement : state.groomer.placement
}

/** Farten til det aktive kjøretøyet. Kan være negativ i løypemaskinen. */
export function activeSpeed(state: State): number {
  return state.mode === 'skier' ? state.skier.v : state.groomer.v
}

export function step(
  state: State,
  input: StepInput,
  dt: number,
  world: World,
  p: Params,
): State {
  if (!Number.isFinite(dt) || dt <= 0) return state

  const tEnd = state.t + dt

  let mode = state.mode
  for (let i = 0; i < input.modeToggles; i++) mode = mode === 'skier' ? 'groomer' : 'skier'

  const before = mode === 'skier' ? state.skier.placement : state.groomer.placement

  // Et sveip teller bare når krysset er nær nok til at valget gir mening.
  let pendingTurn = state.pendingTurn
  if (
    input.turn !== null &&
    nextNodeDistance(before, world) <= Math.max(p.JUNCTION_PREVIEW_DISTANCE, 0)
  ) {
    pendingTurn = input.turn
  }

  const chooser = pendingTurn === null ? straightest : turning(pendingTurn)

  let skier = state.skier
  let groomer = state.groomer
  if (mode === 'skier') {
    const { due } = partitionTaps(input.taps, tEnd)
    skier = stepSkier(skier, due, state.t, dt, world, p, chooser)
  } else {
    groomer = stepGroomer(groomer, input.throttle, state.t, dt, world, p, chooser)
  }

  // Passerte vi en node, er valget brukt opp — også når vi snudde i en blindvei.
  const after = mode === 'skier' ? skier.placement : groomer.placement
  if (after.edge !== before.edge || after.dir !== before.dir) pendingTurn = null

  return { t: tEnd, mode, skier, groomer, pendingTurn }
}
