/**
 * Løypegeneratoren. Helt deterministisk: samme seed gir bitidentisk verden,
 * og `Math.random` finnes ikke i denne mappa.
 *
 * Grepet som bærer hele filen er at kandidatkantene hentes fra en
 * Delaunay-triangulering. Den er planar, så ingen av kantene krysser hverandre
 * allerede før vi begynner. Deretter får hver kant slingre — men bare som en
 * forskyvning vinkelrett på sin egen rette korde, klemt til under halve
 * avstanden til nærmeste nabokorde. To kurver som hver holder seg innenfor
 * halve avstanden til den andres korde kan ikke møtes, så planariteten
 * overlever slingringen.
 *
 * `s` langs en kant er vannrett buelengde, ikke lengde i rommet. Det er samme
 * konvensjon som før, og den som gjør `theta = atan(dy/ds)` riktig.
 */

import type { Params } from '../constants'
import { clamp, makeRng } from '../rng'
import { bucketCount, maxGradientOfProfile } from './geometry'
import { pickName } from './names'
import {
  circumcircle,
  dist2,
  pointSegmentDistance,
  segmentsCross,
  type Point,
} from './planar'
import { createHeightField, type HeightField } from './terrain'
import {
  NEVER_GROOMED,
  type Difficulty,
  type EdgeId,
  type NodeId,
  type PoiKind,
  type World,
  type WorldEdge,
  type WorldNode,
} from './types'

/** Egen strøm for grafen, så terrenget ligger stille når grafen endrer seg. */
const GRAPH_SALT = 0x5f3759df
/** Egen strøm for slingringen. */
const SHAPE_SALT = 0x27d4eb2f
/** Egen strøm for navn. */
const NAME_SALT = 0x165667b1

/** Kast så mange piler før vi gir oss å plassere POI-er. */
const DART_ATTEMPTS = 6000
/** Hvor mye minsteavstanden slakkes hvis det ikke ble plass til nok POI-er. */
const DART_RELAX = 0.75
const DART_RELAX_TRIES = 8

/** Oppløsning på korridorprofilen langs en korde. */
const CORRIDOR_SAMPLES = 96
/**
 * Hvor stor andel av avstanden til nærmeste nabokorde en kant får bruke.
 * Under 0.5 er beviset for at ingen kanter kan krysse — margin under.
 */
const CORRIDOR_FRACTION = 0.45
/** Absolutt tak på hvor langt en løype får svinge ut, meter. */
const MAX_CORRIDOR = 90
/** Tak på korridoren som andel av kordelengden. Korte kanter skal ikke bulke. */
const CORRIDOR_LENGTH_CAP = 0.3

/** Ønsket avstand mellom punkter i polylinen, meter. */
const SAMPLE_SPACING = 5
const MIN_SAMPLES = 12
const MAX_SAMPLES = 3000
/** Punkter per halvbølge. Uten dette kan polylinen ikke tegne tette svinger. */
const SAMPLES_PER_HALFWAVE = 6

/** Grunnfrekvenser i slingringen. Heltall → forskyvningen er null i begge ender. */
const WIGGLE_HARMONICS = [1, 2, 3]

/** Hvor mange ganger vi får dra i polylinen for å komme under MAX_GRADIENT. */
const MAX_SERPENTINE_STEPS = 48
/** Hvor fort amplituden vokser mot korridortaket før vi begynner å svinge tettere. */
const AMPLITUDE_GROWTH = 1.4

/**
 * Løyper dras, de drapes ikke. Høyden langs en kant glattes over så mange
 * meter, slik en løypemaskin fyller søkk og skjærer av kuler. Uten dette
 * arver løypa hver eneste knaus i støyfeltet, og da hjelper ingen serpentin:
 * stigningen fysikken leser er den lokale kula, ikke bakken.
 */
const GRADE_WINDOW = 24
/** Punkter på sirkelen rundt en node når nodehøyden glattes. */
const NODE_RING = 8
/**
 * Siste utvei for en kant som ikke lar seg svinge flat nok: planer hardere.
 * Vinduet dobles til stigningen er innenfor. I grensen blir profilen en rett
 * linje mellom de to nodehøydene, og den er alltid slak nok — så dette
 * terminerer, og MAX_GRADIENT er et løfte og ikke et ønske.
 */
const GRADE_ESCALATIONS = 8

/** Sikkerhetsnett hvis korridorbeviset skulle glippe på en avrunding. */
const REPAIR_ITERATIONS = 6
const REPAIR_SHRINK = 0.55

// --- Punkter -----------------------------------------------------------

/**
 * Poisson-disk ved pilkast: trekk et punkt, behold det hvis det ligger langt
 * nok fra alle de forrige. Jevn spredning over hele området, i motsetning til
 * å vokse utover fra ett frø.
 */
function poissonDisk(rng: () => number, extent: number, minDist: number, count: number): Point[] {
  let radius = minDist
  for (let attempt = 0; attempt < DART_RELAX_TRIES; attempt++) {
    const pts: Point[] = []
    const min2 = radius * radius
    for (let a = 0; a < DART_ATTEMPTS && pts.length < count; a++) {
      const q: Point = [(rng() * 2 - 1) * extent, (rng() * 2 - 1) * extent]
      let ok = true
      for (const other of pts) {
        if (dist2(q, other) < min2) {
          ok = false
          break
        }
      }
      if (ok) pts.push(q)
    }
    // Tre punkter er minimum for at en triangulering skal gi mening.
    if (pts.length >= Math.min(count, 3)) return pts
    radius *= DART_RELAX
  }
  throw new Error('fikk ikke plassert POI-er')
}

// --- Kandidatkanter ----------------------------------------------------

type Pair = [number, number]

function pairKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`
}

/**
 * Delaunay ved rå kraft: en trekant er med hvis omsirkelen er tom. Med under
 * tjue punkter er O(n⁴) gratis, og resultatet er en planar graf uten at vi
 * trenger å stole på en inkrementell algoritme.
 */
function delaunayEdges(pts: Point[]): Pair[] {
  const n = pts.length
  const seen = new Set<string>()
  const out: Pair[] = []

  function add(i: number, j: number) {
    const key = pairKey(i, j)
    if (seen.has(key)) return
    seen.add(key)
    out.push(i < j ? [i, j] : [j, i])
  }

  if (n < 3) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) add(i, j)
    return out
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const cc = circumcircle(pts[i], pts[j], pts[k])
        if (!cc) continue
        let empty = true
        for (let m = 0; m < n; m++) {
          if (m === i || m === j || m === k) continue
          const dx = pts[m][0] - cc.cx
          const dy = pts[m][1] - cc.cy
          // Strengt innenfor. Punkter på sirkelen er ikke inni.
          if (dx * dx + dy * dy < cc.r2 * (1 - 1e-9)) {
            empty = false
            break
          }
        }
        if (empty) {
          add(i, j)
          add(j, k)
          add(i, k)
        }
      }
    }
  }
  return out
}

/**
 * Fire punkter nøyaktig på samme sirkel gir to overlappende trekanter, og da
 * kommer begge diagonalene med. Det skjer aldri med tilfeldige punkter, men
 * planariteten er et løfte vi ikke vil bryte på en avrunding.
 */
function dropCrossings(pts: Point[], edges: Pair[]): Pair[] {
  const len = (e: Pair) => dist2(pts[e[0]], pts[e[1]])
  const sorted = [...edges].sort((a, b) => len(a) - len(b) || a[0] - b[0] || a[1] - b[1])
  const kept: Pair[] = []
  for (const e of sorted) {
    let ok = true
    for (const f of kept) {
      if (e[0] === f[0] || e[0] === f[1] || e[1] === f[0] || e[1] === f[1]) continue
      if (segmentsCross(pts[e[0]], pts[e[1]], pts[f[0]], pts[f[1]])) {
        ok = false
        break
      }
    }
    if (ok) kept.push(e)
  }
  return kept
}

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]]
      i = this.parent[i]
    }
    return i
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return false
    this.parent[ra] = rb
    return true
  }
}

// --- Polylinjer --------------------------------------------------------

type Chord = { a: Point; b: Point; length: number }

/** Hvor langt fra korden kanten får svinge, samplet jevnt over u ∈ [0, 1]. */
function corridorProfile(index: number, chords: Chord[]): Float64Array {
  const self = chords[index]
  const cap = Math.min(MAX_CORRIDOR, CORRIDOR_LENGTH_CAP * self.length)
  const out = new Float64Array(CORRIDOR_SAMPLES + 1)
  for (let s = 0; s <= CORRIDOR_SAMPLES; s++) {
    const u = s / CORRIDOR_SAMPLES
    const q: Point = [
      self.a[0] + (self.b[0] - self.a[0]) * u,
      self.a[1] + (self.b[1] - self.a[1]) * u,
    ]
    let nearest = Infinity
    for (let j = 0; j < chords.length; j++) {
      if (j === index) continue
      const d = pointSegmentDistance(q, chords[j].a, chords[j].b)
      if (d < nearest) nearest = d
    }
    out[s] = Math.min(cap, CORRIDOR_FRACTION * nearest)
  }
  return out
}

/** Konservativt oppslag i profilen: laveste verdi i bøtta u faller i. */
function corridorAt(profile: Float64Array, u: number): number {
  const x = clamp(u, 0, 1) * CORRIDOR_SAMPLES
  const lo = Math.floor(x)
  const hi = Math.min(CORRIDOR_SAMPLES, lo + 1)
  return Math.min(profile[lo], profile[hi])
}

type Shape = { weights: number[]; norm: number }

function makeShape(rng: () => number): Shape {
  const weights = WIGGLE_HARMONICS.map(() => (rng() < 0.5 ? -1 : 1) * (0.4 + rng()))
  const norm = weights.reduce((sum, w) => sum + Math.abs(w), 0) || 1
  return { weights, norm }
}

/**
 * Formen på slingringen, i [-1, 1]. Bare heltallsfrekvenser, så den er
 * nøyaktig null i begge endepunkter uansett hvor tett vi svinger.
 */
function shapeAt(shape: Shape, u: number, k: number): number {
  let sum = 0
  for (let i = 0; i < WIGGLE_HARMONICS.length; i++) {
    sum += shape.weights[i] * Math.sin(Math.PI * WIGGLE_HARMONICS[i] * k * u)
  }
  return sum / shape.norm
}

type Built = {
  points: [number, number][]
  cumulative: Float64Array
  /** Rå terrenghøyde i hvert punkt. Planeres til `elevation`. */
  raw: Float64Array
  elevation: Float64Array
  length: number
  maxGradient: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Terrenghøyde midlet over en liten skive. Nodens høyde, som alle kanter deler. */
function nodeElevation(x: number, z: number, height: HeightField): number {
  let sum = height.heightAt(x, z)
  const r = GRADE_WINDOW / 2
  for (let i = 0; i < NODE_RING; i++) {
    const a = (i / NODE_RING) * Math.PI * 2
    sum += height.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)
  }
  return sum / (NODE_RING + 1)
}

/**
 * Planerer høydeprofilen: glidende gjennomsnitt over GRADE_WINDOW meter,
 * deretter en lineær korreksjon slik at endene treffer nodehøydene eksakt.
 * Korreksjonen er en halv meter fordelt over hundrevis, så den legger ikke
 * merkbar stigning tilbake — men den gjør at to kanter som møtes i en node
 * har nøyaktig samme høyde der.
 */
function gradeProfile(
  cumulative: Float64Array,
  raw: Float64Array,
  startY: number,
  endY: number,
  window: number,
): Float64Array {
  const n = raw.length
  const out = new Float64Array(n)
  const half = window / 2

  let lo = 0
  let hi = 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = cumulative[i] - half
    const b = cumulative[i] + half
    while (hi < n && cumulative[hi] <= b) sum += raw[hi++]
    while (lo < hi && cumulative[lo] < a) sum -= raw[lo++]
    out[i] = hi > lo ? sum / (hi - lo) : raw[i]
  }

  const total = cumulative[n - 1] || 1
  const dStart = startY - out[0]
  const dEnd = endY - out[n - 1]
  for (let i = 0; i < n; i++) {
    const u = cumulative[i] / total
    out[i] += dStart * (1 - u) + dEnd * u
  }
  return out
}

function buildPolyline(
  chord: Chord,
  profile: Float64Array,
  shape: Shape,
  amplitude: number,
  k: number,
  height: HeightField,
  startY: number,
  endY: number,
): Built {
  const dx = chord.b[0] - chord.a[0]
  const dz = chord.b[1] - chord.a[1]
  const len = Math.hypot(dx, dz) || 1
  // Vinkelrett på korden, i xz.
  const nx = -dz / len
  const nz = dx / len

  const maxFreq = WIGGLE_HARMONICS[WIGGLE_HARMONICS.length - 1]
  const n = clamp(
    Math.max(
      MIN_SAMPLES,
      Math.ceil(chord.length / SAMPLE_SPACING),
      SAMPLES_PER_HALFWAVE * maxFreq * k,
    ),
    MIN_SAMPLES,
    MAX_SAMPLES,
  )

  const points: [number, number][] = new Array(n + 1)
  const raw = new Float64Array(n + 1)
  const cumulative = new Float64Array(n + 1)

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (let i = 0; i <= n; i++) {
    const u = i / n
    const off = clamp(amplitude * shapeAt(shape, u, k), -corridorAt(profile, u), corridorAt(profile, u))
    const x = chord.a[0] + dx * u + nx * off
    const z = chord.a[1] + dz * u + nz * off
    points[i] = [x, z]
    raw[i] = height.heightAt(x, z)
    if (i > 0) {
      cumulative[i] =
        cumulative[i - 1] + Math.hypot(x - points[i - 1][0], z - points[i - 1][1])
    }
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }

  const length = cumulative[n]
  const elevation = gradeProfile(cumulative, raw, startY, endY, GRADE_WINDOW)

  return {
    points,
    cumulative,
    raw,
    elevation,
    length,
    maxGradient: maxGradientOfProfile(cumulative, elevation, length),
    minX,
    maxX,
    minZ,
    maxZ,
  }
}

/** Planerer profilen på nytt med et bredere vindu. Bare høydene endres. */
function regrade(built: Built, startY: number, endY: number, window: number): Built {
  const elevation = gradeProfile(built.cumulative, built.raw, startY, endY, window)
  return {
    ...built,
    elevation,
    maxGradient: maxGradientOfProfile(built.cumulative, elevation, built.length),
  }
}

/**
 * Bygger polylinen og drar den sideveis til den er innenfor MAX_GRADIENT.
 * Først vokser amplituden mot korridortaket; er taket nådd, legges det til
 * flere svinger i stedet. Flere svinger gjør veien lengre uten å gjøre den
 * bredere, så stigningen per meter faller.
 *
 * Nær nodene har løypa likevel ingen plass å svinge på — den må treffe et
 * bestemt punkt — og der hjelper ikke serpentiner. Da planeres kanten hardere
 * i stedet, til stigningen er innenfor uansett.
 */
function buildEdgeGeometry(
  chord: Chord,
  profile: Float64Array,
  shape: Shape,
  height: HeightField,
  p: Params,
  amplitudeScale: number,
  startY: number,
  endY: number,
): Built {
  let ceiling = 0
  for (let i = 0; i <= CORRIDOR_SAMPLES; i++) ceiling = Math.max(ceiling, profile[i])
  ceiling *= amplitudeScale

  let amplitude = Math.min(p.WIGGLE_AMPLITUDE * chord.length, ceiling)
  let k = 1
  let built = buildPolyline(chord, profile, shape, amplitude, k, height, startY, endY)
  let best = built

  for (let step = 0; step < MAX_SERPENTINE_STEPS; step++) {
    if (built.maxGradient <= p.MAX_GRADIENT) break
    if (ceiling <= 0) break
    if (amplitude < ceiling * 0.98) {
      amplitude = Math.min(ceiling, amplitude * AMPLITUDE_GROWTH + 1)
    } else {
      k += 1
    }
    built = buildPolyline(chord, profile, shape, amplitude, k, height, startY, endY)
    // Flere svinger gjør veien lengre, men støyfeltet er ikke monotont —
    // hold på det beste vi har sett i stedet for det siste.
    if (built.maxGradient < best.maxGradient) best = built
  }

  if (built.maxGradient > p.MAX_GRADIENT) built = best
  let window = GRADE_WINDOW
  for (let step = 0; step < GRADE_ESCALATIONS && built.maxGradient > p.MAX_GRADIENT; step++) {
    window *= 2
    built = regrade(built, startY, endY, window)
  }

  return built
}

function boxesOverlap(a: Built, b: Built): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ
}

function polylinesCrossFast(a: Built, b: Built): boolean {
  if (!boxesOverlap(a, b)) return false
  for (let i = 0; i < a.points.length - 1; i++) {
    for (let j = 0; j < b.points.length - 1; j++) {
      if (segmentsCross(a.points[i], a.points[i + 1], b.points[j], b.points[j + 1])) return true
    }
  }
  return false
}

// --- Sammensetting -----------------------------------------------------

function pad(n: number): string {
  return n.toString().padStart(4, '0')
}

function difficultyOf(maxGradient: number, p: Params): Difficulty {
  if (maxGradient >= p.DIFFICULTY_HARD_GRADIENT) return 'krevende'
  if (maxGradient >= p.DIFFICULTY_MEDIUM_GRADIENT) return 'middels'
  return 'lett'
}

export function generate(seed: number, p: Params): World {
  const height = createHeightField(seed, p)
  const rng = makeRng(seed ^ GRAPH_SALT)

  // 1. POI-punkter.
  const extent = Math.max(p.WORLD_EXTENT, 100)
  const wanted = clamp(Math.round(p.POI_COUNT), 2, 64)
  const poi = poissonDisk(rng, extent, Math.max(10, p.POI_MIN_DISTANCE), wanted)
  const poiElevation = poi.map((q) => height.heightAt(q[0], q[1]))

  // 2. Planare kandidatkanter.
  const candidates = dropCrossings(poi, delaunayEdges(poi))

  // 3. Spenntre med klatrevekt, så bratte forbindelser unngås allerede her.
  const weightOf = (e: Pair) =>
    Math.hypot(poi[e[0]][0] - poi[e[1]][0], poi[e[0]][1] - poi[e[1]][1]) +
    p.CLIMB_WEIGHT * Math.abs(poiElevation[e[0]] - poiElevation[e[1]])

  const ranked = [...candidates].sort(
    (a, b) => weightOf(a) - weightOf(b) || a[0] - b[0] || a[1] - b[1],
  )
  const uf = new UnionFind(poi.length)
  const tree: Pair[] = []
  const rest: Pair[] = []
  for (const e of ranked) (uf.union(e[0], e[1]) ? tree : rest).push(e)

  // Delaunay er sammenhengende, så dette skal aldri slå til — men en
  // isolert komponent ville vært en verden man ikke kan gå gjennom.
  for (let i = 1; i < poi.length; i++) {
    if (uf.find(i) === uf.find(0)) continue
    let best: Pair | null = null
    let bestW = Infinity
    for (let j = 0; j < poi.length; j++) {
      if (uf.find(j) === uf.find(i)) continue
      const cand: Pair = i < j ? [i, j] : [j, i]
      const w = weightOf(cand)
      if (w < bestW) {
        bestW = w
        best = cand
      }
    }
    if (best) {
      uf.union(best[0], best[1])
      tree.push(best)
    }
  }

  // 4. Ekstra kanter gir sløyfer og reelle valg. Et tre er kjedelig å utforske.
  const extras = clamp(Math.round(p.EXTRA_EDGE_RATIO * tree.length), 0, rest.length)
  const graphEdges: Pair[] = [...tree, ...rest.slice(0, extras)]
  graphEdges.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  // 5. Noder: POI-ene først, så kryssnodene som deler opp lange kanter.
  const positions: Point[] = poi.map((q) => [q[0], q[1]])
  const chords: Chord[] = []
  /** Nodeindeksene i hver ende av korden, i samme rekkefølge som `chords`. */
  const chordEnds: Pair[] = []
  /** Indeks i `graphEdges` som hver korde stammer fra — brukt til navn. */
  const chordOrigin: number[] = []

  const maxLen = Math.max(p.SPLIT_MAX_LENGTH, 1)
  const minLen = clamp(p.SPLIT_MIN_LENGTH, 1, maxLen)

  graphEdges.forEach((e, originIndex) => {
    const a = positions[e[0]]
    const b = positions[e[1]]
    const total = Math.hypot(b[0] - a[0], b[1] - a[1])
    let parts = Math.max(1, Math.ceil(total / maxLen))
    const roomFor = Math.max(1, Math.floor(total / minLen))
    parts = Math.min(parts, roomFor)

    let prev = e[0]
    for (let i = 1; i <= parts; i++) {
      let next: number
      if (i === parts) {
        next = e[1]
      } else {
        const u = i / parts
        positions.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])
        next = positions.length - 1
      }
      const pa = positions[prev]
      const pb = positions[next]
      chords.push({
        a: pa,
        b: pb,
        length: Math.hypot(pb[0] - pa[0], pb[1] - pa[1]),
      })
      chordOrigin.push(originIndex)
      // Endepunktene lagres ved siden av korden.
      chordEnds.push([prev, next])
      prev = next
    }
  })

  // 6. Kinder og navn. Kinden utledes av terreng og grad, ikke av lodd, så
  //    navnet forteller noe sant: «-vann» ligger lavt, «-kollen» høyt.
  const degree = new Array(positions.length).fill(0)
  for (const [a, b] of chordEnds) {
    degree[a]++
    degree[b]++
  }

  const sortedElevation = [...poiElevation].sort((a, b) => a - b)
  const lowMark = sortedElevation[Math.floor(sortedElevation.length / 3)]
  const highMark = sortedElevation[Math.floor((sortedElevation.length * 2) / 3)]

  let centroidX = 0
  let centroidZ = 0
  for (const q of poi) {
    centroidX += q[0]
    centroidZ += q[1]
  }
  centroidX /= poi.length
  centroidZ /= poi.length

  let stadionIndex = 0
  let stadionDist = Infinity
  for (let i = 0; i < poi.length; i++) {
    const d = dist2(poi[i], [centroidX, centroidZ])
    if (d < stadionDist) {
      stadionDist = d
      stadionIndex = i
    }
  }

  const nameRng = makeRng(seed ^ NAME_SALT)
  const taken = new Set<string>()
  const kinds: PoiKind[] = poi.map((_, i) => {
    if (i === stadionIndex) return 'stadion'
    if (degree[i] >= 4) return 'kryss'
    if (poiElevation[i] <= lowMark) return 'vann'
    if (poiElevation[i] >= highMark) return 'topp'
    return 'hytte'
  })
  const poiNames = kinds.map((kind) => pickName(kind, nameRng, taken))

  const nodes = new Map<NodeId, WorldNode>()
  const nodeIds: NodeId[] = positions.map((_, i) => `n${pad(i)}`)
  positions.forEach((pos, i) => {
    const node: WorldNode = { id: nodeIds[i], pos: [pos[0], pos[1]] }
    if (i < poi.length) node.poi = { name: poiNames[i], kind: kinds[i] }
    nodes.set(node.id, node)
  })

  // 7. Geometri per kant: slingring innenfor korridoren, serpentiner til
  //    stigningen er innenfor.
  const shapeRng = makeRng(seed ^ SHAPE_SALT)
  const shapes = chords.map(() => makeShape(shapeRng))
  const profiles = chords.map((_, i) => corridorProfile(i, chords))
  const scales = chords.map(() => 1)
  // Alle kanter som møtes i en node må ha nøyaktig samme høyde der.
  const nodeY = positions.map((q) => nodeElevation(q[0], q[1], height))
  const built = chords.map((chord, i) =>
    buildEdgeGeometry(
      chord,
      profiles[i],
      shapes[i],
      height,
      p,
      scales[i],
      nodeY[chordEnds[i][0]],
      nodeY[chordEnds[i][1]],
    ),
  )

  // Korridorbeviset skal gjøre dette til en no-op. Det står her fordi
  // «ingen kanter krysser» er et løfte, ikke et håp.
  for (let round = 0; round < REPAIR_ITERATIONS; round++) {
    const guilty = new Set<number>()
    for (let i = 0; i < built.length; i++) {
      for (let j = i + 1; j < built.length; j++) {
        const [ai, bi] = chordEnds[i]
        const [aj, bj] = chordEnds[j]
        if (ai === aj || ai === bj || bi === aj || bi === bj) continue
        if (polylinesCrossFast(built[i], built[j])) {
          guilty.add(i)
          guilty.add(j)
        }
      }
    }
    if (guilty.size === 0) break
    for (const i of guilty) {
      scales[i] = round === REPAIR_ITERATIONS - 1 ? 0 : scales[i] * REPAIR_SHRINK
      built[i] = buildEdgeGeometry(
        chords[i],
        profiles[i],
        shapes[i],
        height,
        p,
        scales[i],
        nodeY[chordEnds[i][0]],
        nodeY[chordEnds[i][1]],
      )
    }
  }

  // 8. Kanter.
  const edges = new Map<EdgeId, WorldEdge>()
  const outgoing = new Map<NodeId, EdgeId[]>()
  for (const id of nodeIds) outgoing.set(id, [])

  built.forEach((geo, i) => {
    const id: EdgeId = `e${pad(i)}`
    const [a, b] = chordEnds[i]
    const origin = graphEdges[chordOrigin[i]]
    const edge: WorldEdge = {
      id,
      from: nodeIds[a],
      to: nodeIds[b],
      points: geo.points,
      cumulative: geo.cumulative,
      elevation: geo.elevation,
      length: geo.length,
      name: `${poiNames[origin[0]]}–${poiNames[origin[1]]}`,
      difficulty: difficultyOf(geo.maxGradient, p),
      maxGradient: geo.maxGradient,
      groomedAt: new Float64Array(bucketCount(geo.length, p)).fill(NEVER_GROOMED),
    }
    edges.set(id, edge)
    outgoing.get(edge.from)!.push(id)
    outgoing.get(edge.to)!.push(id)
  })

  for (const list of outgoing.values()) list.sort()

  return { seed, nodes, edges, outgoing, stadion: nodeIds[stadionIndex] }
}
