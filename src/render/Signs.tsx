/**
 * Skiltstolpene i kryssene. Dette er hele grensesnittet i spillet: står du i
 * et kryss i mørket, er skiltet i hodelyktas kjegle det eneste som forteller
 * deg hvor du er på vei.
 *
 * Derfor er de laget for å leses, ikke for å se ekte ut: hvit plate, mørk
 * tekst, én tavle per utgående løype. Tavla henger ut langs den løypa den
 * gjelder, men vender inn mot krysset — og den henger til siden for stolpen,
 * ellers står stolpen mellom deg og teksten.
 */

import { Text } from '@react-three/drei'
import { useMemo } from 'react'
import { departureHeading } from '../sim/traversal'
import { formatDistance, signsByNode, type Sign } from '../sim/world/signs'
import type { HeightField } from '../sim/world/terrain'
import { nodeOf, type World } from '../sim/world/types'
import { GEAR } from './palette'

/** Høyden på stolpen, meter. */
const POST_HEIGHT = 3.2
const POST_RADIUS = 0.06
/** Hvor langt ut fra krysset tavla henger, meter. */
const ARM = 0.5
/** Tavlemål, meter. */
const BOARD_WIDTH = 2
const BOARD_DEPTH = 0.05
/** Loddrett luft mellom to tavler på samme stolpe. */
const BOARD_GAP = 0.12
/** Tekststørrelse. Stor nok til å leses fra kanten av lyskjegla. */
const FONT_SIZE = 0.15
const LINE_HEIGHT = 1.25
/** Luft rundt teksten inne på tavla, meter. */
const PADDING = 0.11
/** Klaring mellom stolpen og tavlas innerkant, meter. */
const POST_CLEARANCE = 0.1

const BOARD_COLOUR = '#f4f7fd'
const TEXT_COLOUR = '#12171f'

/** Høyden en tavle trenger for linjene sine. */
function boardHeight(lines: number): number {
  return Math.max(lines, 1) * FONT_SIZE * LINE_HEIGHT + PADDING * 2
}

function Board({ sign, world, y }: { sign: Sign; world: World; y: number }) {
  const heading = departureHeading(world, sign.edgeId, sign.nodeId)
  const dx = Math.cos(heading)
  const dz = Math.sin(heading)

  // Tavla vender inn mot stolpen, så den leses av den som står i krysset.
  const rotation = Math.atan2(-dx, -dz)
  const height = boardHeight(sign.entries.length)
  // Skyv hele tavla ut til én side, ellers står stolpen midt i teksten.
  const offset = BOARD_WIDTH / 2 + POST_RADIUS + POST_CLEARANCE
  const top = height / 2 - PADDING
  const face = BOARD_DEPTH / 2 + 0.003

  const names = sign.entries.map((e) => e.name).join('\n')
  const distances = sign.entries.map((e) => formatDistance(e.distanceKm)).join('\n')

  return (
    <group position={[dx * ARM, y, dz * ARM]} rotation={[0, rotation, 0]}>
      <group position={[offset, 0, 0]}>
        <mesh>
          <boxGeometry args={[BOARD_WIDTH, height, BOARD_DEPTH]} />
          <meshStandardMaterial color={BOARD_COLOUR} roughness={0.8} metalness={0} />
        </mesh>
        <Text
          position={[-BOARD_WIDTH / 2 + PADDING, top, face]}
          fontSize={FONT_SIZE}
          color={TEXT_COLOUR}
          anchorX="left"
          anchorY="top"
          lineHeight={LINE_HEIGHT}
        >
          {names}
        </Text>
        <Text
          position={[BOARD_WIDTH / 2 - PADDING, top, face]}
          fontSize={FONT_SIZE}
          color={TEXT_COLOUR}
          anchorX="right"
          anchorY="top"
          lineHeight={LINE_HEIGHT}
        >
          {distances}
        </Text>
      </group>
    </group>
  )
}

function SignPost({
  signs,
  world,
  height,
}: {
  signs: Sign[]
  world: World
  height: HeightField
}) {
  const node = nodeOf(world, signs[0].nodeId)
  const ground = height.heightAt(node.pos[0], node.pos[1])
  const withEntries = signs.filter((s) => s.entries.length > 0)
  if (withEntries.length === 0) return null

  // Stables ovenfra og ned med sin egen høyde, så to tavler aldri møtes.
  let cursor = POST_HEIGHT - 0.2
  const placed = withEntries.map((sign) => {
    const h = boardHeight(sign.entries.length)
    cursor -= h / 2
    const y = cursor
    cursor -= h / 2 + BOARD_GAP
    return { sign, y }
  })

  return (
    <group position={[node.pos[0], ground, node.pos[1]]}>
      <mesh position={[0, POST_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[POST_RADIUS, POST_RADIUS, POST_HEIGHT, 8]} />
        <meshStandardMaterial color={GEAR} flatShading roughness={0.7} metalness={0.1} />
      </mesh>
      {placed.map(({ sign, y }) => (
        <Board key={sign.edgeId} sign={sign} world={world} y={y} />
      ))}
    </group>
  )
}

export function Signs({
  signs,
  nodeIds,
  world,
  height,
}: {
  signs: Sign[]
  nodeIds: string[]
  world: World
  height: HeightField
}) {
  const grouped = useMemo(() => signsByNode(signs), [signs])
  return (
    <>
      {nodeIds.map((id) => {
        const list = grouped.get(id)
        if (!list || list.length === 0) return null
        return <SignPost key={id} signs={list} world={world} height={height} />
      })}
    </>
  )
}
