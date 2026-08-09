/**
 * Validatoren. `pnpm world:check` kjører generatoren på 50 seeds og krever at
 * hver eneste verden er brukbar.
 *
 * Den ligger utenfor `pnpm test` med vilje: den er treg, og den svarer på et
 * annet spørsmål enn testene. Testene spør om koden gjør det den sier.
 * Denne spør om verdenene den lager er verdt å gå tur i.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULTS, type Params } from '../constants'
import { generate } from './generate'
import { polylinesCross } from './planar'
import { edgesAt, otherEnd, type World } from './types'

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1)

/** Nodene som er nåbare fra `start`, ved bredde-først over grafen. */
function reachable(world: World, start: string): Set<string> {
  const seen = new Set<string>([start])
  const queue = [start]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const edgeId of edgesAt(world, id)) {
      const next = otherEnd(world.edges.get(edgeId)!, id)
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

function check(world: World, p: Params) {
  const nodeIds = [...world.nodes.keys()]
  const edges = [...world.edges.values()]

  // Ingen duplikate node-ID-er. Map-en ville skjult det, så vi teller.
  expect(new Set(nodeIds).size).toBe(nodeIds.length)

  // Ingen duplikate stedsnavn.
  const names = [...world.nodes.values()].filter((n) => n.poi).map((n) => n.poi!.name)
  expect(new Set(names).size).toBe(names.length)

  // Alle kant-referanser peker på eksisterende noder.
  for (const e of edges) {
    expect(world.nodes.has(e.from)).toBe(true)
    expect(world.nodes.has(e.to)).toBe(true)
    expect(e.from).not.toBe(e.to)
    expect(e.length).toBeGreaterThan(0)
    expect(Number.isFinite(e.length)).toBe(true)
    expect(e.points.length).toBe(e.cumulative.length)
    expect(e.points.length).toBe(e.elevation.length)
    expect(e.groomedAt.length).toBeGreaterThan(0)
  }

  // Sammenhengende: én komponent, ingen isolerte noder.
  const seen = reachable(world, world.stadion)
  expect(seen.size).toBe(nodeIds.length)

  // Alle POI-er nåbare fra stadion.
  for (const node of world.nodes.values()) {
    if (!node.poi) continue
    expect(seen.has(node.id)).toBe(true)
  }
  expect(world.nodes.get(world.stadion)?.poi?.kind).toBe('stadion')

  // Minst én sløyfe: et tre har nøyaktig n-1 kanter.
  expect(edges.length).toBeGreaterThan(nodeIds.length - 1)

  // Ingen kant brattere enn MAX_GRADIENT.
  for (const e of edges) {
    expect(e.maxGradient).toBeLessThanOrEqual(p.MAX_GRADIENT + 1e-9)
  }

  // Ingen to kanter krysser hverandre uten å dele en node.
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i]
      const b = edges[j]
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue
      expect(polylinesCross(a.points, b.points)).toBe(false)
    }
  }
}

describe('genererte verdener', () => {
  it.each(SEEDS)('seed %i holder mål', (seed) => {
    check(generate(seed, DEFAULTS), DEFAULTS)
  })

  it('rapporterer form og størrelse', () => {
    let nodes = 0
    let edges = 0
    let metres = 0
    let loops = 0
    const gradients: number[] = []
    const difficulties = { lett: 0, middels: 0, krevende: 0 }
    for (const seed of SEEDS) {
      const world = generate(seed, DEFAULTS)
      nodes += world.nodes.size
      edges += world.edges.size
      loops += world.edges.size - world.nodes.size + 1
      for (const e of world.edges.values()) {
        metres += e.length
        gradients.push(e.maxGradient)
        difficulties[e.difficulty]++
      }
    }
    gradients.sort((a, b) => a - b)
    const at = (q: number) => gradients[Math.floor(gradients.length * q)].toFixed(3)
    const n = SEEDS.length
    // Ikke en assertion, men tallene jeg trenger for å vurdere genereringen.
    console.log(
      `snitt per verden: ${(nodes / n).toFixed(1)} noder, ${(edges / n).toFixed(1)} kanter, ` +
        `${(loops / n).toFixed(1)} sløyfer, ${(metres / n / 1000).toFixed(1)} km løype.\n` +
        `stigning p10/p50/p90/maks: ${at(0.1)}/${at(0.5)}/${at(0.9)}/${gradients[gradients.length - 1].toFixed(3)}. ` +
        `lett/middels/krevende: ${difficulties.lett}/${difficulties.middels}/${difficulties.krevende}`,
    )
    expect(metres / n).toBeGreaterThan(1000)
  })
})
