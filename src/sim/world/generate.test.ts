import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../constants'
import { generate } from './generate'
import { generateSigns } from './signs'
import { edgesAt, type World } from './types'

/** Alt som definerer verdenen, i en form som kan sammenlignes eksakt. */
function serialise(world: World) {
  return {
    seed: world.seed,
    stadion: world.stadion,
    nodes: [...world.nodes.values()].map((n) => ({ ...n, pos: [...n.pos] })),
    edges: [...world.edges.values()].map((e) => ({
      ...e,
      points: e.points.map((q) => [...q]),
      cumulative: [...e.cumulative],
      elevation: [...e.elevation],
      groomedAt: [...e.groomedAt],
    })),
    outgoing: [...world.outgoing.entries()],
  }
}

describe('generate', () => {
  it('gir bitidentisk resultat to ganger for samme seed', () => {
    expect(serialise(generate(42, DEFAULTS))).toEqual(serialise(generate(42, DEFAULTS)))
  })

  it('gir forskjellige verdener for forskjellige seeds', () => {
    expect(serialise(generate(42, DEFAULTS))).not.toEqual(serialise(generate(43, DEFAULTS)))
  })

  it('bruker aldri Math.random', () => {
    const real = Math.random
    Math.random = () => {
      throw new Error('sim/ skal ikke kalle Math.random')
    }
    try {
      expect(() => generate(7, DEFAULTS)).not.toThrow()
    } finally {
      Math.random = real
    }
  })

  it('lar ingen kant gå i rett strek', () => {
    const world = generate(42, DEFAULTS)
    for (const edge of world.edges.values()) {
      const a = edge.points[0]
      const b = edge.points[edge.points.length - 1]
      const chord = Math.hypot(b[0] - a[0], b[1] - a[1])
      // Slingring og serpentiner gjør løypa lengre enn luftlinja.
      expect(edge.length).toBeGreaterThan(chord * 1.001)
    }
  })

  it('gir hver kant en cachet høydeprofil som stemmer med punktene', () => {
    const world = generate(42, DEFAULTS)
    for (const edge of world.edges.values()) {
      expect(edge.elevation.length).toBe(edge.points.length)
      expect(edge.cumulative[0]).toBe(0)
      for (let i = 1; i < edge.cumulative.length; i++) {
        expect(edge.cumulative[i]).toBeGreaterThan(edge.cumulative[i - 1])
      }
      expect(edge.cumulative[edge.cumulative.length - 1]).toBeCloseTo(edge.length, 9)
    }
  })
})

describe('skilt', () => {
  it('settes opp i hvert kryss, og bare der', () => {
    const world = generate(42, DEFAULTS)
    const signs = generateSigns(world, DEFAULTS)
    const junctions = [...world.nodes.keys()].filter((id) => edgesAt(world, id).length >= 3)

    expect(signs.length).toBeGreaterThan(0)
    for (const sign of signs) {
      expect(junctions).toContain(sign.nodeId)
      expect(edgesAt(world, sign.nodeId)).toContain(sign.edgeId)
    }
    // Ett skilt per utgående kant i hvert kryss.
    const expected = junctions.reduce((sum, id) => sum + edgesAt(world, id).length, 0)
    expect(signs.length).toBe(expected)
  })

  it('lister nærmeste steder først, avrundet til én desimal', () => {
    const signs = generateSigns(generate(42, DEFAULTS), DEFAULTS)
    for (const sign of signs) {
      expect(sign.entries.length).toBeLessThanOrEqual(DEFAULTS.SIGN_ENTRY_COUNT)
      for (let i = 1; i < sign.entries.length; i++) {
        expect(sign.entries[i].distanceKm).toBeGreaterThanOrEqual(sign.entries[i - 1].distanceKm)
      }
      for (const entry of sign.entries) {
        expect(entry.distanceKm).toBe(Math.round(entry.distanceKm * 10) / 10)
      }
    }
  })

  it('peker ulike veier fra samme kryss til ulike steder', () => {
    const world = generate(42, DEFAULTS)
    const signs = generateSigns(world, DEFAULTS)
    const byNode = new Map<string, string[]>()
    for (const sign of signs) {
      if (sign.entries.length === 0) continue
      const list = byNode.get(sign.nodeId) ?? []
      list.push(sign.entries[0].name)
      byNode.set(sign.nodeId, list)
    }
    // Minst ett kryss der de utgående kantene fører til forskjellige steder.
    // Hvis alle skiltene i alle kryss sa det samme, ville de vært verdiløse.
    const informative = [...byNode.values()].filter((names) => new Set(names).size > 1)
    expect(informative.length).toBeGreaterThan(0)
  })
})
