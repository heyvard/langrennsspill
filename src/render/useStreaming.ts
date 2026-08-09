/**
 * Strømming. Verden er fire kilometer bred, så bare det som ligger innenfor
 * tåka bygges — resten finnes bare som tall i grafen.
 *
 * Ruta spilleren står i regnes ut i useFrame, men React får bare beskjed når
 * settet faktisk endrer seg, og nye ruter slippes inn noen få per bilde.
 * Uten den grensa hakker bildet hver gang man krysser en rutegrense.
 */

import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { createPose, samplePose, type Pose, type SimStore } from '../engine/simStore'
import type { World } from '../sim/world/types'

/** Bredden på én terrengrute, meter. Må være et helt antall CELL i Terrain. */
export const CHUNK_SIZE = 120
/** Hvor mange nye ruter som får bygges per bilde. */
const CHUNK_BUDGET = 2
/** Så langt må spilleren flytte seg før vi ser på settet igjen, meter. */
const RECOMPUTE_DISTANCE = 15

export type Chunk = { key: string; cx: number; cz: number; x: number; z: number }

export type Streamed = {
  chunks: Chunk[]
  /** Kanter med minst ett endepunkt innenfor radien. */
  edgeIds: string[]
  /** Noder innenfor radien. Skiltene står i de av dem som er kryss. */
  nodeIds: string[]
}

const EMPTY: Streamed = { chunks: [], edgeIds: [], nodeIds: [] }

function chunkKey(cx: number, cz: number): string {
  return `${cx}:${cz}`
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * @param radius Synsvidden i meter. Kommer fra tåka, så tettere dis laster mindre.
 */
export function useStreaming(store: SimStore, world: World, radius: number): Streamed {
  const [streamed, setStreamed] = useState<Streamed>(EMPTY)
  /** Fasit på hvilke ruter som finnes. State speiler den, ett bilde senere. */
  const live = useRef<Streamed>(EMPTY)
  const pose = useRef<Pose>(createPose())
  const lastX = useRef(Infinity)
  const lastZ = useRef(Infinity)
  const lastRadius = useRef(-1)
  /** Sant så lenge det står ruter igjen å bygge innenfor radien. */
  const filling = useRef(true)

  useFrame(() => {
    const p = samplePose(store, world, store.curr.mode, pose.current)
    const moved = Math.hypot(p.x - lastX.current, p.z - lastZ.current)
    const stale = moved >= RECOMPUTE_DISTANCE || radius !== lastRadius.current
    if (!stale && !filling.current) return
    if (stale) {
      lastX.current = p.x
      lastZ.current = p.z
      lastRadius.current = radius
    }

    // Ruter: alt som overlapper sirkelen rundt spilleren.
    const span = Math.ceil(radius / CHUNK_SIZE)
    const cx0 = Math.floor(p.x / CHUNK_SIZE)
    const cz0 = Math.floor(p.z / CHUNK_SIZE)
    const wanted = new Map<string, Chunk>()
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const cx = cx0 + dx
        const cz = cz0 + dz
        // Nærmeste punkt i ruta mot spilleren.
        const nx = Math.max(cx * CHUNK_SIZE, Math.min(p.x, (cx + 1) * CHUNK_SIZE))
        const nz = Math.max(cz * CHUNK_SIZE, Math.min(p.z, (cz + 1) * CHUNK_SIZE))
        if (Math.hypot(nx - p.x, nz - p.z) > radius) continue
        const key = chunkKey(cx, cz)
        wanted.set(key, { key, cx, cz, x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE })
      }
    }

    // Behold ruter som fortsatt er ønsket, slipp inn noen få nye per bilde.
    const chunks = live.current.chunks.filter((c) => wanted.has(c.key))
    const have = new Set(chunks.map((c) => c.key))
    let budget = CHUNK_BUDGET
    for (const chunk of wanted.values()) {
      if (budget <= 0) break
      if (have.has(chunk.key)) continue
      chunks.push(chunk)
      have.add(chunk.key)
      budget--
    }
    chunks.sort((a, b) => a.key.localeCompare(b.key))
    filling.current = have.size < wanted.size

    // Noder og kanter: en kant er med hvis den starter eller ender innenfor.
    const nodeIds: string[] = []
    for (const node of world.nodes.values()) {
      if (Math.hypot(node.pos[0] - p.x, node.pos[1] - p.z) <= radius) nodeIds.push(node.id)
    }
    const near = new Set(nodeIds)
    const edgeIds: string[] = []
    for (const edge of world.edges.values()) {
      if (near.has(edge.from) || near.has(edge.to)) edgeIds.push(edge.id)
    }

    const previous = live.current
    const chunksChanged =
      chunks.length !== previous.chunks.length ||
      chunks.some((c, i) => c.key !== previous.chunks[i].key)
    if (
      !chunksChanged &&
      sameIds(edgeIds, previous.edgeIds) &&
      sameIds(nodeIds, previous.nodeIds)
    ) {
      return
    }

    live.current = { chunks, edgeIds, nodeIds }
    setStreamed(live.current)
  })

  return streamed
}
