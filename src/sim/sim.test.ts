import { describe, expect, it } from 'vitest'
import { targetInterval } from './cadence'
import { DEFAULTS, DEFAULT_SEED, type Params } from './constants'
import { initialState, step } from './physics'
import { createTrack, type Track } from './track'
import type { Side, State, Tap } from './types'

/** Kalles én gang per steg og returnerer tappene som hører til steget. */
type Tapper = (state: State, p: Params) => Tap[]

type Run = { averageSpeed: number; finalState: State; samples: State[] }

function simulate(seconds: number, tapper: Tapper, p: Params = DEFAULTS, track?: Track): Run {
  const t = track ?? createTrack(DEFAULT_SEED, p)
  const steps = Math.round(seconds / p.FIXED_DT)
  let state = initialState()
  const samples: State[] = [state]
  let speedSum = 0

  for (let i = 0; i < steps; i++) {
    state = step(state, tapper(state, p), p.FIXED_DT, t, p)
    speedSum += state.v
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
      next += targetInterval(state.v, p)
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
      const track = createTrack(DEFAULT_SEED, DEFAULTS)
      const { samples } = simulate(60, tapper)

      for (const s of samples) {
        expect(Number.isFinite(s.v)).toBe(true)
        expect(Number.isFinite(s.s)).toBe(true)
        expect(Number.isFinite(s.t)).toBe(true)
        expect(s.v).toBeGreaterThanOrEqual(0)
        expect(s.v).toBeLessThanOrEqual(DEFAULTS.MAX_SPEED)
        expect(s.s).toBeGreaterThanOrEqual(0)
        expect(s.s).toBeLessThan(track.loopLength)
      }
    })
  }

  it('overlever absurde parametre uten å produsere NaN', () => {
    const brutal: Params = {
      ...DEFAULTS,
      MU: 0,
      K_DRAG: 0,
      TAP_IMPULSE: 3,
      TIMING_WINDOW: 0,
      TUCK_RANGE: 0,
      MIN_INTERVAL: 0.9,
      MAX_INTERVAL: 0.2,
      TERRAIN_AMPLITUDE: 20,
    }
    const { samples } = simulate(30, masher, brutal)

    for (const s of samples) {
      expect(Number.isFinite(s.v)).toBe(true)
      expect(Number.isFinite(s.s)).toBe(true)
      expect(s.v).toBeGreaterThanOrEqual(0)
      expect(s.v).toBeLessThanOrEqual(brutal.MAX_SPEED)
    }
  })
})

describe('sporet', () => {
  it('er en lukket sløyfe — høyde og posisjon er periodisk', () => {
    const track = createTrack(DEFAULT_SEED, DEFAULTS)
    const a = track.positionAt(0)
    const b = track.positionAt(track.loopLength)

    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.01)
    expect(track.loopLength).toBeCloseTo(DEFAULTS.LOOP_LENGTH, 0)
  })

  it('er deterministisk for samme seed', () => {
    const a = createTrack(DEFAULT_SEED, DEFAULTS)
    const b = createTrack(DEFAULT_SEED, DEFAULTS)

    for (let s = 0; s < a.loopLength; s += 37) {
      expect(a.elevationAt(s)).toBe(b.elevationAt(s))
    }
  })
})
