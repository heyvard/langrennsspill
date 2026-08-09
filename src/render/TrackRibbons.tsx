/**
 * Løypene: to skispor presset ned i snøen midt i løypa, med et bredt
 * groomet felt på hver side ut til løypekanten. Ett bånd per kant i grafen,
 * og bare de kantene som er inne.
 *
 * Feltet er ikke ett stykke — det er delt i GROOM_LANE_COUNT baner på tvers,
 * samme baner løypemaskinen preparerer én om gangen. Grensa mellom to baner
 * er hard: hver bane får sin egen fargede stripe, ikke en jevn overgang, så
 * det synes akkurat hvor et pass sluttet og et annet begynte.
 *
 * Båndet er ikke statisk. Prepareringen leses ut av rutenettet og skrives
 * inn i geometrien: upreparert er flatt, ujevnt og matt, preparert har
 * skisporene presset ned og cordfløyel på tvers, og ferskt preparert er
 * tydelig lysere enn alt annet. Det er den eneste tilbakemeldingen spilleren
 * får på at løypemaskinen gjorde noe.
 *
 * Høyden oppdateres uten å regne normaler på nytt — `flatShading` utleder dem
 * i fragmentshaderen, så geometrien kan bevege seg gratis.
 */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color } from 'three'
import { sampleTime, type SimStore } from '../engine/simStore'
import type { Params } from '../sim/constants'
import {
  bucketIndex,
  edgeLateral,
  edgePoint,
  freshnessOfCell,
  halfWidth,
  laneCount,
  laneIndex,
  laneWidth,
} from '../sim/world/geometry'
import type { HeightField } from '../sim/world/terrain'
import { edgeOf, type WorldEdge, type World } from '../sim/world/types'
import { GROOVE, LANE, LANE_FRESH, UNGROOMED } from './palette'

/** Avstand fra midten av sporet ut til hvert skispor, meter. */
const GAUGE = 0.44
/** Bredden på toppåpningen av ett skispor, meter. */
const RAIL_WIDTH = 0.17
/** Bredden på den flate bunnen i skisporet — skisålen er flat. */
const RAIL_FLOOR_WIDTH = 0.08
/** Hvor dypt skisporet presses ned i ferskt preparert spor, meter. */
const RAIL_DEPTH = 0.045
/** Løftes så vidt over snøen. Fargen gjør resten av jobben. */
const LIFT = 0.035
/** Snøstripe mellom ytterste skispor og feltet utenfor, meter. */
const RAIL_GAP = 0.12
/** Meter mellom tverrsnitt. Cordfløyelen må lese som et mønster. */
const SEGMENT = 1.0
/** Rifleamplitude i ferskt preparert felt. */
const RIDGE_HEIGHT = 0.02
/**
 * Ujevnheten i upreparert snø, meter. Holdt lav og lavfrekvent med vilje:
 * blir den stor og skifter fortegn for hvert tverrsnitt, leser løypa som
 * løse plater i stedet for en sammenhengende trasé.
 */
const ROUGH_HEIGHT = 0.022
/** Hvor mange tverrsnitt én ujevnhet strekker seg over. */
const ROUGH_WAVELENGTH = 5

/** Hvor ofte prepareringen leses av på nytt. Den forfaller over minutter. */
const UPDATE_HZ = 8

/** 0 = sporkant, 1 = sporbunn, 2 = flatt felt. */
type ColumnKind = 0 | 1 | 2

/**
 * Tverrsnittet, bygget fra Params i stedet for hardkodet: sideveis avstand
 * per kolonne, hvilken art kolonnen er, hvilken bane den leser preparering
 * fra, og hvilke nabopar som skal trianguleres.
 */
type CrossSection = {
  offsets: Float64Array
  kind: ColumnKind[]
  lane: Int32Array
  /** Strip-indekser som skal trianguleres. Resten er hull — ekte mellomrom. */
  bridges: number[]
}

/** Alle banegrenser fra -halvbredde til +halvbredde, strengt stigende. */
function laneBoundaries(p: Params): number[] {
  const half = halfWidth(p)
  const n = laneCount(p)
  const w = laneWidth(p)
  const out: number[] = []
  for (let k = 0; k <= n; k++) out.push(-half + k * w)
  return out
}

/**
 * Det flate feltet på én side av sporet, fra sporkanten og ut til
 * løypekanten. Delt opp ved hver banegrense: hvert segment får to kolonner i
 * sin egen ende, farget likt, så grensa mot naboen blir skarp i stedet for
 * å smøres — akkurat slik et enkelt maskinpass ser ut mot et upreparert nabofelt.
 */
function buildField(
  p: Params,
  sign: 1 | -1,
  railOuter: number,
): { offsets: number[]; lane: number[] } {
  const half = halfWidth(p)
  const boundaries = laneBoundaries(p)
  const inField =
    sign === 1 ? boundaries.filter((b) => b > railOuter) : boundaries.filter((b) => b < -railOuter)
  // `boundaries` er strengt stigende, og filteret bevarer rekkefølgen, så
  // `edges` blir stigende uansett side — det er nettopp den rekkefølgen
  // kolonnene i tverrsnittet skal ligge i.
  const edges = sign === 1 ? [railOuter, ...inField] : [...inField, -railOuter]
  // Ingen banegrenser utenfor sporet i det hele tatt: feltet uteblir heller
  // enn å strekke seg feil vei (bladet er bredere enn løypa).
  if (edges.length < 2) {
    return { offsets: [], lane: [] }
  }

  const offsets: number[] = []
  const lane: number[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i]
    const b = edges[i + 1]
    const l = laneIndex((a + b) / 2, p)
    offsets.push(a, b)
    lane.push(l, l)
  }
  // Siste kant skal treffe løypekanten nøyaktig, selv om avrunding i
  // banegrensene skulle avvike med en brøkdel av en millimeter.
  offsets[offsets.length - 1] = sign * half
  return { offsets, lane }
}

function buildCrossSection(p: Params): CrossSection {
  const railOuter = GAUGE + RAIL_WIDTH / 2 + RAIL_GAP
  const left = buildField(p, -1, railOuter)
  const right = buildField(p, 1, railOuter)

  const railLeft = [
    -GAUGE - RAIL_WIDTH / 2,
    -GAUGE - RAIL_FLOOR_WIDTH / 2,
    -GAUGE + RAIL_FLOOR_WIDTH / 2,
    -GAUGE + RAIL_WIDTH / 2,
  ]
  const railRight = [
    GAUGE - RAIL_WIDTH / 2,
    GAUGE - RAIL_FLOOR_WIDTH / 2,
    GAUGE + RAIL_FLOOR_WIDTH / 2,
    GAUGE + RAIL_WIDTH / 2,
  ]
  const railKind: ColumnKind[] = [0, 1, 1, 0]

  const offsets = [...left.offsets, ...railLeft, ...railRight, ...right.offsets]
  const kind: ColumnKind[] = [
    ...left.offsets.map((): ColumnKind => 2),
    ...railKind,
    ...railKind,
    ...right.offsets.map((): ColumnKind => 2),
  ]
  const lane = [
    ...left.lane,
    ...railLeft.map((o) => laneIndex(o, p)),
    ...railRight.map((o) => laneIndex(o, p)),
    ...right.lane,
  ]

  // Trianguler hvert par innad i et segment/spor, aldri mellom to segmenter
  // eller mellom sporet og feltet utenfor — det er der hullene skal være.
  const bridges: number[] = []
  let i = 0
  for (let s = 0; s < left.offsets.length / 2; s++, i += 2) bridges.push(i)
  // i peker nå på venstre spors første kolonne. Hull: felt -> venstre spor.
  bridges.push(i, i + 1, i + 2)
  i += 4 // hull: venstre spor -> høyre spor
  bridges.push(i, i + 1, i + 2)
  i += 4 // hull: høyre spor -> felt
  for (let s = 0; s < right.offsets.length / 2; s++, i += 2) bridges.push(i)

  return { offsets: new Float64Array(offsets), kind, lane: new Int32Array(lane), bridges }
}

/** Deterministisk verdi i [-1, 1] fra et heltall. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * Ujevnhet som varierer over flere meter, ikke fra tverrsnitt til tverrsnitt.
 * Interpolerer mellom to hashverdier så snøen bølger i stedet for å flimre.
 */
function jitter(i: number): number {
  const t = i / ROUGH_WAVELENGTH
  const a = Math.floor(t)
  const f = t - a
  // Smoothstep mellom nabopunktene gir en myk, men fortsatt tilfeldig, flate.
  return hash(a) + (hash(a + 1) - hash(a)) * (f * f * (3 - 2 * f))
}

type Ribbon = {
  geometry: BufferGeometry
  sections: number
  cross: CrossSection
  /** Terrenghøyde pluss LIFT, per verteks. Grunnlinja høydene regnes fra. */
  baseY: Float32Array
  /** Prepareringsbøtta hvert tverrsnitt hører til. */
  bucket: Int32Array
}

function buildRibbon(edge: WorldEdge, height: HeightField, p: Params): Ribbon {
  const cross = buildCrossSection(p)
  const cols = cross.offsets.length
  const n = Math.max(8, Math.round(edge.length / SEGMENT))
  const count = (n + 1) * cols

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const baseY = new Float32Array(count)
  const bucket = new Int32Array(n + 1)

  for (let i = 0; i <= n; i++) {
    const s = (i / n) * edge.length
    const centre = edgePoint(edge, s)
    const lat = edgeLateral(edge, s, 1)
    bucket[i] = bucketIndex(edge, s, p)
    // Løypa er planert: midtlinja følger kantens egen profil, ikke hver knaus
    // i terrenget. Tverrsnittet beholder likevel sidefallet, ved at hele
    // snittet forskyves like mye som midten er planert.
    const bench = centre.y - height.heightAt(centre.x, centre.z)
    for (let col = 0; col < cols; col++) {
      const off = cross.offsets[col]
      const x = centre.x + lat.x * off
      const z = centre.z + lat.z * off
      const v = i * cols + col
      positions[v * 3] = x
      positions[v * 3 + 2] = z
      baseY[v] = height.heightAt(x, z) + bench + LIFT
    }
  }

  const indices = new Uint32Array(n * cross.bridges.length * 6)
  let k = 0
  for (let i = 0; i < n; i++) {
    for (const col of cross.bridges) {
      const a = i * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      // Vindingen må gi normaler oppover: lateral × tangent peker opp,
      // motsatt rekkefølge ville lagt flaten med ansiktet ned i bakken.
      indices[k++] = a
      indices[k++] = b
      indices[k++] = c
      indices[k++] = b
      indices[k++] = d
      indices[k++] = c
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))

  return { geometry, sections: n, cross, baseY, bucket }
}

const railColour = new Color()
const laneColour = new Color()

/** Skriver preparering inn i høyder og farger. Ingen normaler å regne om. */
function refresh(ribbon: Ribbon, edge: WorldEdge, now: number, p: Params): void {
  const { cross } = ribbon
  const cols = cross.offsets.length
  const position = ribbon.geometry.getAttribute('position') as BufferAttribute
  const colour = ribbon.geometry.getAttribute('color') as BufferAttribute
  const pos = position.array as Float32Array
  const col = colour.array as Float32Array

  for (let i = 0; i <= ribbon.sections; i++) {
    const bucket = ribbon.bucket[i]
    const ridge = (i % 2 === 0 ? 1 : -1) * RIDGE_HEIGHT
    const rough = jitter(i) * ROUGH_HEIGHT

    for (let c = 0; c < cols; c++) {
      const v = i * cols + c
      const kind = cross.kind[c]
      const f = freshnessOfCell(edge, cross.lane[c] * edge.buckets + bucket, now, p)

      pos[v * 3 + 1] =
        kind === 1
          ? ribbon.baseY[v] - RAIL_DEPTH * f
          : kind === 2
            ? ribbon.baseY[v] + rough + (ridge - rough) * f
            : ribbon.baseY[v]

      if (kind === 2) {
        laneColour.copy(UNGROOMED).lerp(LANE, Math.min(f * 2, 1)).lerp(LANE_FRESH, f)
        col[v * 3] = laneColour.r
        col[v * 3 + 1] = laneColour.g
        col[v * 3 + 2] = laneColour.b
      } else {
        // Skisporet finnes ikke før noen har satt det. Det trykkes gradvis ned.
        railColour.copy(UNGROOMED).lerp(GROOVE, f)
        col[v * 3] = railColour.r
        col[v * 3 + 1] = railColour.g
        col[v * 3 + 2] = railColour.b
      }
    }
  }

  position.needsUpdate = true
  colour.needsUpdate = true
  ribbon.geometry.computeBoundingSphere()
}

function EdgeRibbon({
  edge,
  store,
  height,
  paramsRef,
}: {
  edge: WorldEdge
  store: SimStore
  height: HeightField
  paramsRef: { current: Params }
}) {
  const ribbon = useMemo(
    () => buildRibbon(edge, height, paramsRef.current),
    // paramsRef er en ref — den utløser bevisst ingen ombygging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edge, height],
  )

  useEffect(() => {
    refresh(ribbon, edge, 0, paramsRef.current)
    return () => ribbon.geometry.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ribbon, edge])

  const nextUpdate = useRef(0)
  useFrame(() => {
    const now = sampleTime(store)
    if (now < nextUpdate.current) return
    nextUpdate.current = now + 1 / UPDATE_HZ
    refresh(ribbon, edge, now, paramsRef.current)
  })

  return (
    <mesh geometry={ribbon.geometry}>
      <meshStandardMaterial
        vertexColors
        flatShading
        roughness={0.9}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  )
}

export function TrackRibbons({
  edgeIds,
  world,
  store,
  height,
  paramsRef,
}: {
  edgeIds: string[]
  world: World
  store: SimStore
  height: HeightField
  paramsRef: { current: Params }
}) {
  return (
    <>
      {edgeIds.map((id) => (
        <EdgeRibbon
          key={id}
          edge={edgeOf(world, id)}
          store={store}
          height={height}
          paramsRef={paramsRef}
        />
      ))}
    </>
  )
}
