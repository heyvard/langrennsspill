import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './constants'
import { makeRng } from './rng'
import {
  advance,
  nextNodeDistance,
  startPlacement,
  straightest,
  turning,
  type Chooser,
  type Placement,
} from './traversal'
import { generate } from './world/generate'
import { edgeOf, edgesAt } from './world/types'

const world = generate(2024, DEFAULTS)

function expectOnGraph(p: Placement) {
  expect(world.edges.has(p.edge)).toBe(true)
  const edge = edgeOf(world, p.edge)
  expect(Number.isFinite(p.s)).toBe(true)
  expect(p.s).toBeGreaterThanOrEqual(0)
  expect(p.s).toBeLessThanOrEqual(edge.length)
  expect(p.dir === 1 || p.dir === -1).toBe(true)
}

describe('advance', () => {
  it('forlater aldri grafen, uansett avstand og valg', () => {
    const rng = makeRng(9)
    const choosers: Chooser[] = [straightest, turning('L'), turning('R')]
    let placement = startPlacement(world)

    for (let i = 0; i < 20000; i++) {
      // Blandingen skal treffe alt: småsteg, kjempesprang og revers.
      const roll = rng()
      const distance =
        roll < 0.4
          ? rng() * 2
          : roll < 0.7
            ? -rng() * 2
            : roll < 0.9
              ? (rng() - 0.5) * 400
              : (rng() - 0.5) * 100000
      placement = advance(placement, distance, world, choosers[Math.floor(rng() * 3)])
      expectOnGraph(placement)
    }
  })

  it('tåler ugyldige avstander uten å flytte seg', () => {
    const start = startPlacement(world)
    for (const distance of [0, NaN, Infinity, -Infinity]) {
      expect(advance(start, distance, world)).toEqual(start)
    }
  })

  it('går like langt i to halve steg som i ett helt', () => {
    const start = startPlacement(world)
    // 40 m ligger godt innenfor korteste kant, så ingen kryss forstyrrer.
    const once = advance(start, 40, world)
    const twice = advance(advance(start, 20, world), 20, world)
    expect(twice.edge).toBe(once.edge)
    expect(twice.s).toBeCloseTo(once.s, 9)
  })

  it('kommer tilbake til utgangspunktet når man rygger like langt', () => {
    const start = advance(startPlacement(world), 150, world)
    const there = advance(start, 60, world)
    const back = advance(there, -60, world)
    expect(back.edge).toBe(start.edge)
    expect(back.s).toBeCloseTo(start.s, 6)
    expect(back.dir).toBe(start.dir)
  })

  it('velger et gyldig alternativ når chooseren finner på noe rart', () => {
    const rogue: Chooser = () => 'finnes-ikke'
    let placement = startPlacement(world)
    for (let i = 0; i < 500; i++) {
      placement = advance(placement, 97, world, rogue)
      expectOnGraph(placement)
    }
  })

  it('snur av seg selv i en blindvei', () => {
    const deadEnd = [...world.nodes.keys()].find((id) => edgesAt(world, id).length === 1)
    // Grafen er ikke garantert å ha blindveier, men denne seeden har dem.
    expect(deadEnd).toBeDefined()

    const edgeId = edgesAt(world, deadEnd!)[0]
    const edge = edgeOf(world, edgeId)
    const towards: Placement =
      edge.to === deadEnd
        ? { edge: edgeId, s: edge.length - 5, dir: 1 }
        : { edge: edgeId, s: 5, dir: -1 }

    const after = advance(towards, 20, world)
    expect(after.edge).toBe(edgeId)
    expect(after.dir).toBe(towards.dir === 1 ? -1 : 1)
  })
})

describe('valg i kryss', () => {
  it('fortsetter rett fram uten at man gjør noe', () => {
    // Standardvalget skal aldri velge en skarpere sving enn nødvendig.
    let placement = startPlacement(world)
    for (let i = 0; i < 200; i++) {
      const before = placement
      placement = advance(placement, 250, world, straightest)
      if (placement.edge === before.edge) continue
      expectOnGraph(placement)
    }
  })

  it('svinger til hver sin side på L og R der krysset gir valget', () => {
    const junction = [...world.nodes.keys()].find((id) => edgesAt(world, id).length >= 3)
    expect(junction).toBeDefined()

    const incoming = edgesAt(world, junction!)[0]
    const edge = edgeOf(world, incoming)
    const towards: Placement =
      edge.to === junction
        ? { edge: incoming, s: edge.length - 10, dir: 1 }
        : { edge: incoming, s: 10, dir: -1 }

    const left = advance(towards, 30, world, turning('L'))
    const right = advance(towards, 30, world, turning('R'))
    expectOnGraph(left)
    expectOnGraph(right)
    expect(left.edge).not.toBe(right.edge)
  })
})

describe('nextNodeDistance', () => {
  it('teller ned mot noden man er på vei mot', () => {
    let placement = startPlacement(world)
    let previous = nextNodeDistance(placement, world)
    for (let i = 0; i < 50; i++) {
      placement = advance(placement, 3, world, straightest)
      const remaining = nextNodeDistance(placement, world)
      expect(remaining).toBeGreaterThanOrEqual(0)
      // Enten kom vi nærmere, eller så passerte vi noden og fikk en ny.
      if (remaining <= previous) expect(previous - remaining).toBeCloseTo(3, 6)
      previous = remaining
    }
  })
})
