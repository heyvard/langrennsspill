/**
 * Løypene: to skispor presset ned i snøen, pluss et bredere skøytefelt til
 * side. Ett bånd per kant i grafen, og bare de kantene som er inne.
 *
 * Båndet er ikke statisk. Prepareringen leses ut av kantens bøtter og
 * skrives inn i geometrien: upreparert er flatt, ujevnt og matt, preparert
 * har skisporene presset ned og cordfløyel på tvers, og ferskt preparert er
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
import { bucketIndex, edgeLateral, edgePoint, freshnessOfBucket } from '../sim/world/geometry'
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
/** Hvilken side skøytefeltet ligger på, relativt til skisporparet. */
const LANE_SIDE = 1
/** Snøstripe mellom ytterste skispor og skøytefeltet, meter. */
const LANE_GAP = 0.12
/** Bredden på skøytefeltet, meter. */
const LANE_WIDTH = 2.6
/** Meter mellom tverrsnitt. Cordfløyelen må lese som et mønster. */
const SEGMENT = 1.0
/** Rifleamplitude i ferskt preparert skøytefelt, meter. */
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

const LANE_INNER = LANE_SIDE * (GAUGE + RAIL_WIDTH / 2 + LANE_GAP)

/** Sideveis avstand fra midtlinja for hver kolonne i tverrsnittet. */
const COLUMNS = [
  -GAUGE - RAIL_WIDTH / 2,
  -GAUGE - RAIL_FLOOR_WIDTH / 2,
  -GAUGE + RAIL_FLOOR_WIDTH / 2,
  -GAUGE + RAIL_WIDTH / 2,
  GAUGE - RAIL_WIDTH / 2,
  GAUGE - RAIL_FLOOR_WIDTH / 2,
  GAUGE + RAIL_FLOOR_WIDTH / 2,
  GAUGE + RAIL_WIDTH / 2,
  LANE_INNER,
  LANE_INNER + LANE_SIDE * LANE_WIDTH,
]

/** 0 = sporkant, 1 = sporbunn, 2 = skøytefelt. */
const COLUMN_KIND = [0, 1, 1, 0, 0, 1, 1, 0, 2, 2]
/** Kolonnepar som skal trianguleres. Hullene er mellom spor og skøytefelt. */
const BRIDGES = [0, 1, 2, 4, 5, 6, 8]

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
  /** Terrenghøyde pluss LIFT, per verteks. Grunnlinja høydene regnes fra. */
  baseY: Float32Array
  /** Prepareringsbøtta hvert tverrsnitt hører til. */
  bucket: Int32Array
}

function buildRibbon(edge: WorldEdge, height: HeightField, p: Params): Ribbon {
  const n = Math.max(8, Math.round(edge.length / SEGMENT))
  const cols = COLUMNS.length
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
      const off = COLUMNS[col]
      const x = centre.x + lat.x * off
      const z = centre.z + lat.z * off
      const v = i * cols + col
      positions[v * 3] = x
      positions[v * 3 + 2] = z
      baseY[v] = height.heightAt(x, z) + bench + LIFT
    }
  }

  const indices = new Uint32Array(n * BRIDGES.length * 6)
  let k = 0
  for (let i = 0; i < n; i++) {
    for (const col of BRIDGES) {
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

  return { geometry, sections: n, baseY, bucket }
}

const railColour = new Color()
const laneColour = new Color()

/** Skriver preparering inn i høyder og farger. Ingen normaler å regne om. */
function refresh(ribbon: Ribbon, edge: WorldEdge, now: number, p: Params): void {
  const cols = COLUMNS.length
  const position = ribbon.geometry.getAttribute('position') as BufferAttribute
  const colour = ribbon.geometry.getAttribute('color') as BufferAttribute
  const pos = position.array as Float32Array
  const col = colour.array as Float32Array

  for (let i = 0; i <= ribbon.sections; i++) {
    const f = freshnessOfBucket(edge, ribbon.bucket[i], now, p)
    const ridge = (i % 2 === 0 ? 1 : -1) * RIDGE_HEIGHT
    const rough = jitter(i) * ROUGH_HEIGHT
    const laneOffset = rough + (ridge - rough) * f

    // Skisporet finnes ikke før noen har satt det. Det trykkes gradvis ned.
    railColour.copy(UNGROOMED).lerp(GROOVE, f)
    laneColour.copy(UNGROOMED).lerp(LANE, Math.min(f * 2, 1)).lerp(LANE_FRESH, f)

    for (let c = 0; c < cols; c++) {
      const v = i * cols + c
      const kind = COLUMN_KIND[c]
      pos[v * 3 + 1] =
        kind === 1
          ? ribbon.baseY[v] - RAIL_DEPTH * f
          : kind === 2
            ? ribbon.baseY[v] + laneOffset
            : ribbon.baseY[v]

      const source = kind === 2 ? laneColour : railColour
      col[v * 3] = source.r
      col[v * 3 + 1] = source.g
      col[v * 3 + 2] = source.b
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
