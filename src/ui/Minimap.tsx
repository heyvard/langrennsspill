/**
 * Minikartet. Hele grafen i ett bilde, med spilleren som en pil.
 *
 * Dette er verktøyet for å vurdere om genereringen er god: ser man sløyfer,
 * spredte steder og løyper som slingrer, er den det. Uten kartet er 3D-bildet
 * for smalt til å svare på spørsmålet.
 *
 * Egen rAF-loop som tegner rett på canvas, aldri React-state per bilde —
 * samme begrunnelse som i Hud.
 */

import { useEffect, useRef } from 'react'
import { sampleTime, type SimStore } from '../engine/simStore'
import type { Params } from '../sim/constants'
import { activePlacement } from '../sim/physics'
import { groomedShare } from '../sim/vehicles/grooming'
import { edgePoint } from '../sim/world/geometry'
import { edgeOf, type World } from '../sim/world/types'

/** Kartets størrelse i CSS-piksler. */
const SIZE = 220
const PADDING = 14
/** Luft mellom stedsprikken og navnet, piksler. */
const LABEL_GAP = 5
/** Hvor mange bilder mellom hver tegning. Kartet trenger ikke 60 Hz. */
const EVERY = 4

const BACKDROP = 'rgba(10, 14, 22, 0.72)'
const UNGROOMED = '#5c6a80'
const GROOMED = '#eaf2ff'
const POI = '#ffd479'
const STADION = '#7ef2b0'
const PLAYER = '#ff6b57'

export function Minimap({
  store,
  world,
  paramsRef,
  visible,
}: {
  store: SimStore
  world: World
  paramsRef: { current: Params }
  visible: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!visible) return
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = SIZE * dpr
    el.height = SIZE * dpr
    ctx.scale(dpr, dpr)

    // Verdenens utstrekning. Regnes én gang — grafen flytter seg ikke.
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const node of world.nodes.values()) {
      minX = Math.min(minX, node.pos[0])
      maxX = Math.max(maxX, node.pos[0])
      minZ = Math.min(minZ, node.pos[1])
      maxZ = Math.max(maxZ, node.pos[1])
    }
    const scale = (SIZE - PADDING * 2) / Math.max(maxX - minX, maxZ - minZ, 1)
    const offsetX = PADDING + ((SIZE - PADDING * 2) - (maxX - minX) * scale) / 2
    const offsetZ = PADDING + ((SIZE - PADDING * 2) - (maxZ - minZ) * scale) / 2
    const px = (x: number) => offsetX + (x - minX) * scale
    const pz = (z: number) => offsetZ + (z - minZ) * scale

    let raf = 0
    let frame = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (frame++ % EVERY !== 0) return

      const p = paramsRef.current
      const now = sampleTime(store)

      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = BACKDROP
      ctx.fillRect(0, 0, SIZE, SIZE)

      // Løypene. Fargen forteller hvor mye av kanten som er fersk.
      ctx.lineCap = 'round'
      for (const edge of world.edges.values()) {
        const fresh = groomedShare(world, edge.id, now, p)
        ctx.strokeStyle = fresh > 0.02 ? GROOMED : UNGROOMED
        ctx.lineWidth = 1 + fresh * 1.6
        ctx.globalAlpha = 0.55 + fresh * 0.45
        ctx.beginPath()
        ctx.moveTo(px(edge.points[0][0]), pz(edge.points[0][1]))
        for (let i = 1; i < edge.points.length; i++) {
          ctx.lineTo(px(edge.points[i][0]), pz(edge.points[i][1]))
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Stedene.
      ctx.font = '9px system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      for (const node of world.nodes.values()) {
        if (!node.poi) continue
        const x = px(node.pos[0])
        const z = pz(node.pos[1])
        const isStadion = node.poi.kind === 'stadion'
        ctx.fillStyle = isStadion ? STADION : POI
        ctx.beginPath()
        ctx.arc(x, z, isStadion ? 3.5 : 2.2, 0, Math.PI * 2)
        ctx.fill()
        // Navnet står til høyre for prikken, men flippes over til venstre
        // når det ellers ville falt utenfor kartet.
        ctx.fillStyle = 'rgba(233, 240, 250, 0.85)'
        const width = ctx.measureText(node.poi.name).width
        const right = x + LABEL_GAP + width <= SIZE - PADDING / 2
        ctx.textAlign = right ? 'left' : 'right'
        ctx.fillText(node.poi.name, x + (right ? LABEL_GAP : -LABEL_GAP), z)
      }

      // Spilleren, som en pil i kjøreretningen.
      const placement = activePlacement(store.curr)
      const edge = edgeOf(world, placement.edge)
      const here = edgePoint(edge, placement.s)
      const ahead = edgePoint(edge, placement.s + placement.dir * 8)
      const angle = Math.atan2(pz(ahead.z) - pz(here.z), px(ahead.x) - px(here.x))
      ctx.textAlign = 'left'
      ctx.save()
      ctx.translate(px(here.x), pz(here.z))
      ctx.rotate(angle)
      ctx.fillStyle = PLAYER
      ctx.beginPath()
      ctx.moveTo(6, 0)
      ctx.lineTo(-4, 3.5)
      ctx.lineTo(-4, -3.5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [store, world, paramsRef, visible])

  if (!visible) return null
  return <canvas className="minimap" ref={canvas} style={{ width: SIZE, height: SIZE }} />
}
