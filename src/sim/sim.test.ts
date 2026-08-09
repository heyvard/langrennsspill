import { describe, expect, it } from 'vitest'
import { targetInterval } from './cadence'
import { DEFAULTS, DEFAULT_SEED, type Params } from './constants'
import { activeSpeed, initialState, step } from './physics'
import { straightest, type Placement } from './traversal'
import type { GroomerState, Side, State, StepInput, Tap } from './types'
import { lateralLimit, stepGroomer } from './vehicles/groomer'
import { groomedShare, groomSpan } from './vehicles/grooming'
import { generate } from './world/generate'
import { clampS } from './world/geometry'
import { edgeOf, edgesAt, type World } from './world/types'

/** Kalles én gang per steg og returnerer tappene som hører til steget. */
type Tapper = (state: State, p: Params) => Tap[]

type Run = { averageSpeed: number; finalState: State; samples: State[] }

function idle(taps: Tap[]): StepInput {
  return { taps, throttle: 0, steer: 0, turn: null, modeToggles: 0 }
}

function simulate(seconds: number, tapper: Tapper, p: Params = DEFAULTS, world?: World): Run {
  const w = world ?? generate(DEFAULT_SEED, p)
  const steps = Math.round(seconds / p.FIXED_DT)
  let state = initialState(w)
  const samples: State[] = [state]
  let speedSum = 0

  for (let i = 0; i < steps; i++) {
    state = step(state, idle(tapper(state, p)), p.FIXED_DT, w, p)
    speedSum += state.skier.v
    samples.push(state)
  }

  return { averageSpeed: speedSum / steps, finalState: state, samples }
}

const noTaps: Tapper = () => []

/**
 * Tapper nøyaktig på targetInterval. `alternate: false` gir samme side
 * hver gang, men ellers identisk timing.
 */
function metronome(alternate: boolean): Tapper {
  let next: number | null = null
  let side: Side = 'L'
  return (state, p) => {
    if (next === null) next = state.t
    const out: Tap[] = []
    const tEnd = state.t + p.FIXED_DT
    while (next < tEnd) {
      out.push({ t: next, side })
      if (alternate) side = side === 'L' ? 'R' : 'L'
      next += targetInterval(state.skier.v, p)
    }
    return out
  }
}

/** Tapper hvert eneste steg — rå mashing. */
const masher: Tapper = (state, p) => [
  { t: state.t, side: Math.floor(state.t / p.FIXED_DT) % 2 === 0 ? 'L' : 'R' },
]

/** Deterministisk «tilfeldig» tapping. */
function chaotic(): Tapper {
  let seed = 12345
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  return (state, p) => {
    if (rand() > 0.02) return []
    return [{ t: state.t + rand() * p.FIXED_DT, side: rand() < 0.5 ? 'L' : 'R' }]
  }
}

describe('takt driver farten', () => {
  it('perfekt takt i 60 sekunder gir høyere snittfart enn ingen tapp', () => {
    const tapping = simulate(60, metronome(true))
    const drifting = simulate(60, noTaps)

    expect(tapping.averageSpeed).toBeGreaterThan(drifting.averageSpeed)
    // Ikke bare så vidt over — takten skal være hele forskjellen.
    expect(tapping.averageSpeed).toBeGreaterThan(drifting.averageSpeed + 3)
  })

  it('gjentatte tapp på samme side gir lavere snittfart enn vekselvis', () => {
    const alternating = simulate(60, metronome(true))
    const sameSide = simulate(60, metronome(false))

    expect(sameSide.averageSpeed).toBeLessThan(alternating.averageSpeed)
  })

  it('rå mashing slår ikke takten — MIN_INTERVAL gjør jobben sin', () => {
    const rhythm = simulate(60, metronome(true))
    const mashing = simulate(60, masher)

    expect(mashing.averageSpeed).toBeLessThan(rhythm.averageSpeed)
  })
})

describe('simuleringen holder seg innenfor', () => {
  const cases: [string, Tapper][] = [
    ['ingen tapp', noTaps],
    ['perfekt takt', metronome(true)],
    ['samme side', metronome(false)],
    ['mashing', masher],
    ['kaos', chaotic()],
  ]

  for (const [name, tapper] of cases) {
    it(`gir aldri NaN eller Infinity, og v i [0, MAX_SPEED] — ${name}`, () => {
      const world = generate(DEFAULT_SEED, DEFAULTS)
      const { samples } = simulate(60, tapper, DEFAULTS, world)

      for (const state of samples) {
        const { placement, v } = state.skier
        expect(Number.isFinite(v)).toBe(true)
        expect(Number.isFinite(placement.s)).toBe(true)
        expect(Number.isFinite(state.t)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(DEFAULTS.MAX_SPEED)
        expect(placement.s).toBeGreaterThanOrEqual(0)
        expect(placement.s).toBeLessThanOrEqual(edgeOf(world, placement.edge).length)
      }
    })
  }

  it('overlever absurde parametre uten å produsere NaN', () => {
    const brutal: Params = {
      ...DEFAULTS,
      MU_GROOMED: 0,
      MU_UNGROOMED: 0,
      K_DRAG: 0,
      TAP_IMPULSE: 3,
      TIMING_WINDOW: 0,
      TUCK_RANGE: 0,
      MIN_INTERVAL: 0.9,
      MAX_INTERVAL: 0.2,
    }
    const { samples } = simulate(30, masher, brutal)

    for (const state of samples) {
      expect(Number.isFinite(state.skier.v)).toBe(true)
      expect(Number.isFinite(state.skier.placement.s)).toBe(true)
      expect(state.skier.v).toBeGreaterThanOrEqual(0)
      expect(state.skier.v).toBeLessThanOrEqual(brutal.MAX_SPEED)
    }
  })
})

describe('preparering', () => {
  /** Kjører samme rute to ganger, én gang med hele grafen nypreparert. */
  function averageSpeedOn(groomedAt: number | null, seconds = 45): number {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    if (groomedAt !== null) {
      for (const edge of world.edges.values()) {
        groomSpan(world, edge.id, 0, edge.length, 0, groomedAt, DEFAULTS)
      }
    }
    return simulate(seconds, metronome(true), DEFAULTS, world).averageSpeed
  }

  it('preparert løype gir høyere snittfart enn upreparert på samme rute', () => {
    // Preparert i det simuleringen starter — full ferskhet hele veien.
    expect(averageSpeedOn(0)).toBeGreaterThan(averageSpeedOn(null))
  })

  it('fordelen avtar når prepareringen forfaller', () => {
    const fresh = averageSpeedOn(0)
    // Preparert et helt forfallsintervall før start: ferskheten er brukt opp.
    const stale = averageSpeedOn(-DEFAULTS.GROOM_DECAY_TIME)
    const ungroomed = averageSpeedOn(null)

    expect(stale).toBeLessThan(fresh)
    expect(stale).toBeCloseTo(ungroomed, 3)
  })
})

describe('løypemaskinen', () => {
  it('preparerer det den kjører over, og bare det', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    let state = initialState(world)
    state = { ...state, mode: 'groomer' }

    const startEdge = state.groomer.placement.edge
    const input: StepInput = { taps: [], throttle: 1, steer: 0, turn: null, modeToggles: 0 }
    for (let i = 0; i < Math.round(20 / p.FIXED_DT); i++) {
      state = step(state, input, p.FIXED_DT, world, p)
    }

    const edge = edgeOf(world, startEdge)
    const groomed = [...edge.groomedAt].filter((t) => t >= 0).length
    expect(groomed).toBeGreaterThan(0)
    expect(groomed).toBeLessThan(edge.groomedAt.length)
    expect(state.groomer.v).toBeGreaterThan(0)
    expect(state.groomer.v).toBeLessThanOrEqual(p.GROOMER_MAX_SPEED)
    // Skiløperen har ikke rørt seg mens maskinen kjørte.
    expect(state.skier.v).toBe(0)
  })

  it('rygger på revers og holder seg innenfor reversfarten', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    let state: State = { ...initialState(world), mode: 'groomer' }
    const input: StepInput = { taps: [], throttle: -1, steer: 0, turn: null, modeToggles: 0 }

    for (let i = 0; i < Math.round(15 / p.FIXED_DT); i++) {
      state = step(state, input, p.FIXED_DT, world, p)
      expect(Number.isFinite(state.groomer.v)).toBe(true)
      expect(state.groomer.v).toBeGreaterThanOrEqual(
        -p.GROOMER_MAX_SPEED * p.GROOMER_REVERSE_FACTOR - 1e-9,
      )
    }
    expect(state.groomer.v).toBeLessThan(0)
  })

  it('M bytter hvilket kjøretøy som beveger seg', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    let state = initialState(world)
    expect(state.mode).toBe('skier')

    state = step(
      state,
      { taps: [], throttle: 1, steer: 0, turn: null, modeToggles: 1 },
      p.FIXED_DT,
      world,
      p,
    )
    expect(state.mode).toBe('groomer')
    expect(activeSpeed(state)).toBe(state.groomer.v)
  })
})

describe('løypemaskinens styring', () => {
  it('lat og yaw holder seg innenfor grensene under vilkårlig styring', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    const limit = lateralLimit(p)
    let state: State = { ...initialState(world), mode: 'groomer' }

    let seed = 4242
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    for (let i = 0; i < 20000; i++) {
      const throttle = (Math.floor(rand() * 3) - 1) as -1 | 0 | 1
      const steer = (Math.floor(rand() * 3) - 1) as -1 | 0 | 1
      const input: StepInput = { taps: [], throttle, steer, turn: null, modeToggles: 0 }
      state = step(state, input, p.FIXED_DT, world, p)

      expect(Number.isFinite(state.groomer.lat)).toBe(true)
      expect(Number.isFinite(state.groomer.yaw)).toBe(true)
      expect(Math.abs(state.groomer.lat)).toBeLessThanOrEqual(limit + 1e-9)
      expect(Math.abs(state.groomer.yaw)).toBeLessThanOrEqual(p.GROOMER_MAX_YAW + 1e-9)
    }
  })

  it('styrer mot riktig side, og speilvendt i revers', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    // `dir` er valgt eksplisitt her: hvilken vei den tilfeldig genererte
    // kanten peker er vilkårlig, og fysisk lat = q bare når dir === 1.
    const longest = [...world.edges.values()].reduce((a, b) => (a.length > b.length ? a : b))
    let state: GroomerState = {
      placement: { edge: longest.id, s: longest.length / 2, dir: 1 },
      v: 0,
      lat: 0,
      yaw: 0,
    }

    // Kjør opp i fart før vi styrer, ellers er det ingenting å style med.
    for (let i = 0; i < Math.round(3 / p.FIXED_DT); i++) {
      state = stepGroomer(state, 1, 0, 0, p.FIXED_DT, world, p, straightest)
    }
    expect(state.v).toBeGreaterThan(0)

    let right = state
    for (let i = 0; i < Math.round(1 / p.FIXED_DT); i++) {
      right = stepGroomer(right, 1, 1, 0, p.FIXED_DT, world, p, straightest)
    }
    expect(right.lat).toBeGreaterThan(state.lat)

    // Samme rattutslag i revers driver den andre veien.
    let reversing: GroomerState = { ...state, v: -1 }
    for (let i = 0; i < Math.round(1 / p.FIXED_DT); i++) {
      reversing = stepGroomer(reversing, -1, 1, 0, p.FIXED_DT, world, p, straightest)
    }
    expect(reversing.lat).toBeLessThan(state.lat)
  })

  it('bevarer fysisk sideposisjon gjennom en blindveisnuing', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    const deadEnd = [...world.nodes.keys()].find((id) => edgesAt(world, id).length === 1)
    // Grafen er ikke garantert å ha blindveier, men denne seeden har dem.
    expect(deadEnd).toBeDefined()

    const edgeId = edgesAt(world, deadEnd!)[0]
    const edge = edgeOf(world, edgeId)
    const towards: Placement =
      edge.to === deadEnd
        ? { edge: edgeId, s: edge.length - 5, dir: 1 }
        : { edge: edgeId, s: 5, dir: -1 }

    let state: GroomerState = { placement: towards, v: p.GROOMER_MAX_SPEED, lat: 1.1, yaw: 0 }
    let flipped = false
    for (let i = 0; i < 200 && !flipped; i++) {
      const dirBefore = state.placement.dir
      state = stepGroomer(state, 1, 0, 0, p.FIXED_DT, world, p, straightest)
      if (state.placement.dir !== dirBefore) flipped = true
    }

    expect(flipped).toBe(true)
    // Maskinen snudde på stedet — den fysiske posisjonen er uendret, selv om
    // den førerrelative siden byttet.
    expect(state.lat).toBeCloseTo(1.1, 6)
  })

  it('ett midtpass dekker bare de midterste banene, ikke hele bredden', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    const edge = [...world.edges.values()][0]

    groomSpan(world, edge.id, 0, edge.length, 0, 0, p)
    const share = groomedShare(world, edge.id, 0, p)

    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThan(1)
  })

  it('to pass i hver sin ytterstilling dekker hele bredden', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const p = DEFAULTS
    const edge = [...world.edges.values()][0]
    const limit = lateralLimit(p)

    groomSpan(world, edge.id, 0, edge.length, -limit, 0, p)
    groomSpan(world, edge.id, 0, edge.length, limit, 0, p)

    expect(groomedShare(world, edge.id, 0, p)).toBeCloseTo(1, 6)
  })
})

describe('sim-tilstanden', () => {
  it('holder s innenfor kanten sin gjennom hele kjøringen', () => {
    const world = generate(DEFAULT_SEED, DEFAULTS)
    const { samples } = simulate(60, metronome(true), DEFAULTS, world)
    for (const state of samples) {
      const edge = edgeOf(world, state.skier.placement.edge)
      expect(clampS(edge, state.skier.placement.s)).toBe(state.skier.placement.s)
    }
  })
})
