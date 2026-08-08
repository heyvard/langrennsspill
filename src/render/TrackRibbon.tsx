/**
 * Sporet: to skispor presset ned i snøen, pluss et bredere skøytefelt med
 * corduroy-riller til side. Skisporas gulv ligger under terrenget, resten
 * løftes så vidt over snøen — fargene gjør resten av jobben.
 */

import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { Track } from '../sim/track'
import { GROOVE, LANE } from './palette'

/** Avstand fra midten av sporet ut til hvert skispor, meter. */
const GAUGE = 0.44
/** Bredden på toppåpningen av ett skispor, meter. */
const RAIL_WIDTH = 0.17
/** Bredden på den flate bunnen i skisporet — skisålen er flat. */
const RAIL_FLOOR_WIDTH = 0.08
/** Hvor dypt skisporet presses ned under terrengsamplet, meter. */
const RAIL_DEPTH = 0.045
/** Meter mellom tverrsnitt langs skisporene. */
const SEGMENT = 1.5
/** Løftes så vidt over snøen. Fargen gjør resten av jobben. */
const LIFT = 0.035

/** Hvilken side skøytefeltet ligger på, relativt til skisporparet. */
const LANE_SIDE = 1
/** Snøstripe mellom ytterste skispor og skøytefeltet, meter. */
const LANE_GAP = 0.12
/** Bredden på skøytefeltet, meter. */
const LANE_WIDTH = 2.6
/** Meter mellom tverrsnitt langs skøytefeltet — egen, finere oppløsning
 *  fordi corduroy-riflene trenger å lese som et mønster. */
const LANE_SEGMENT = 1.0
/** Rifleamplitude i skøytefeltet, meter. */
const RIDGE_HEIGHT = 0.02

type Geo = { verts: Float32Array; indices: Uint32Array }

/**
 * Bygger en flerkolonners quad-strip-mesh langs hele sløyfa. Hvert
 * tverrsnitt har samme sett kolonner (lateral avstand fra senterlinja),
 * og nabokolonner trianguleres til striper. Siste tverrsnitt gjentar det
 * første så sløyfa lukkes.
 */
function buildStrip(
  track: Track,
  segments: number,
  columnOffsets: number[],
  heightAt: (terrain: number, col: number, i: number) => number,
): Geo {
  const cols = columnOffsets.length
  const verts = new Float32Array((segments + 1) * cols * 3)
  const indices = new Uint32Array(segments * (cols - 1) * 6)

  let vo = 0
  for (let i = 0; i <= segments; i++) {
    const s = (i / segments) * track.loopLength
    const c = track.positionAt(s)
    const lat = track.lateralAt(s)
    for (let col = 0; col < cols; col++) {
      const off = columnOffsets[col]
      const x = c.x + lat.x * off
      const z = c.z + lat.z * off
      verts[vo++] = x
      verts[vo++] = heightAt(track.terrainHeightAt(x, z), col, i)
      verts[vo++] = z
    }
  }

  let io = 0
  for (let i = 0; i < segments; i++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = i * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      // Vindingen må gi normaler oppover: lateral × tangent peker opp,
      // motsatt rekkefølge ville lagt flaten med ansiktet ned i bakken.
      indices[io++] = a
      indices[io++] = b
      indices[io++] = c
      indices[io++] = b
      indices[io++] = d
      indices[io++] = c
    }
  }

  return { verts, indices }
}

/** Slår sammen flere striper til én geometri-payload, med riktig forskjøvne indekser. */
function combine(geos: Geo[]): Geo {
  const vertCount = geos.reduce((sum, g) => sum + g.verts.length, 0)
  const idxCount = geos.reduce((sum, g) => sum + g.indices.length, 0)
  const verts = new Float32Array(vertCount)
  const indices = new Uint32Array(idxCount)

  let vo = 0
  let io = 0
  let vertBase = 0
  for (const g of geos) {
    verts.set(g.verts, vo)
    for (let i = 0; i < g.indices.length; i++) indices[io + i] = g.indices[i] + vertBase
    vo += g.verts.length
    io += g.indices.length
    vertBase += g.verts.length / 3
  }
  return { verts, indices }
}

function toBufferGeometry({ verts, indices }: Geo): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(verts, 3))
  g.setIndex(new BufferAttribute(indices, 1))
  g.computeVertexNormals()
  return g
}

export function TrackRibbon({ track }: { track: Track }) {
  const railGeometry = useMemo(() => {
    const segments = Math.max(8, Math.round(track.loopLength / SEGMENT))
    const rails = [-1, 1].map((sign) => {
      const center = sign * GAUGE
      // topp-venstre → bunn-venstre → bunn-høyre → topp-høyre: et trau med
      // flat bunn, siden skisålen er flat.
      const columnOffsets = [
        center - RAIL_WIDTH / 2,
        center - RAIL_FLOOR_WIDTH / 2,
        center + RAIL_FLOOR_WIDTH / 2,
        center + RAIL_WIDTH / 2,
      ]
      return buildStrip(track, segments, columnOffsets, (terrain, col) =>
        col === 0 || col === 3 ? terrain + LIFT : terrain - RAIL_DEPTH + LIFT,
      )
    })
    return toBufferGeometry(combine(rails))
  }, [track])

  const laneGeometry = useMemo(() => {
    // Partall sikrer at riflefortegnet ved sløyfas slutt matcher starten,
    // ellers får sømmen der loopen lukker seg et høydesprang.
    let segments = Math.max(8, Math.round(track.loopLength / LANE_SEGMENT))
    if (segments % 2 !== 0) segments += 1

    const inner = LANE_SIDE * (GAUGE + RAIL_WIDTH / 2 + LANE_GAP)
    const outer = inner + LANE_SIDE * LANE_WIDTH
    const geo = buildStrip(track, segments, [inner, outer], (terrain, _col, i) => {
      const ridge = i % 2 === 0 ? RIDGE_HEIGHT : -RIDGE_HEIGHT
      return terrain + LIFT + ridge
    })
    return toBufferGeometry(geo)
  }, [track])

  return (
    <>
      <mesh geometry={railGeometry}>
        <meshStandardMaterial
          color={GROOVE}
          flatShading
          roughness={0.9}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh geometry={laneGeometry}>
        <meshStandardMaterial
          color={LANE}
          flatShading
          roughness={0.9}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </>
  )
}
