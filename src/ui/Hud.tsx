/**
 * Debug-HUD. Kun for tuning — uten den er ingenting av dette justerbart.
 *
 * Oppdateres i en egen rAF-loop som skriver rett til DOM. En setState per
 * bilde ville re-rendret React 60 ganger i sekundet uten grunn.
 */

import { useEffect, useRef } from 'react'
import type { SimStore } from '../engine/simStore'
import { nextExpectedSide, targetInterval } from '../sim/cadence'
import type { Params } from '../sim/constants'
import { activePlacement, activeSpeed } from '../sim/physics'
import { muAt } from '../sim/vehicles/grooming'
import { edgeGradient, freshnessAt } from '../sim/world/geometry'
import { edgeOf, type World } from '../sim/world/types'

/** Tekstfeltene trenger ikke 60 Hz — tallene blir uleselige. */
const TEXT_HZ = 15

export function Hud({
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
  const mode = useRef<HTMLSpanElement>(null)
  const speed = useRef<HTMLSpanElement>(null)
  const gradient = useRef<HTMLSpanElement>(null)
  const friction = useRef<HTMLSpanElement>(null)
  const where = useRef<HTMLSpanElement>(null)
  const quality = useRef<HTMLSpanElement>(null)
  const side = useRef<HTMLSpanElement>(null)
  const pulse = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    let raf = 0
    let lastText = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = paramsRef.current
      const state = store.curr
      const now = performance.now()

      // Pulsen må gå hvert bilde — den er en rytmereferanse.
      const simNow = state.t + store.alpha * p.FIXED_DT
      const cadence = state.skier.cadence
      const interval = targetInterval(state.skier.v, p)
      const bar = pulse.current
      if (bar) {
        const since = cadence.lastTapTime === null ? 0 : simNow - cadence.lastTapTime
        const progress = Math.min(since / interval, 1)
        bar.style.transform = `scaleX(${progress})`
        // Blink idet tappet forventes, og en kort nåde etterpå.
        bar.style.opacity = progress >= 1 ? '1' : String(0.35 + 0.5 * progress)
      }

      if (now - lastText > 1000 / TEXT_HZ) {
        lastText = now
        const placement = activePlacement(state)
        const edge = edgeOf(world, placement.edge)

        if (mode.current) {
          mode.current.textContent = state.mode === 'skier' ? 'skiløper' : 'løypemaskin'
        }
        if (speed.current) speed.current.textContent = (activeSpeed(state) * 3.6).toFixed(1)
        if (gradient.current) {
          gradient.current.textContent = (
            edgeGradient(edge, placement.s, placement.dir) * 100
          ).toFixed(1)
        }
        if (friction.current) {
          const mu = muAt(world, placement, simNow, p)
          // Skiløperen leser midtbanen (lat 0); løypemaskinen sin egen posisjon.
          const lat = state.mode === 'groomer' ? state.groomer.lat : 0
          const fresh = freshnessAt(edge, placement.s, lat, simNow, p)
          friction.current.textContent = `${mu.toFixed(3)} (${Math.round(fresh * 100)} %)`
        }
        if (where.current) {
          where.current.textContent = `${edge.name ?? edge.id} · ${edge.difficulty}`
        }
        if (quality.current) quality.current.textContent = cadence.lastQuality.toFixed(2)
        if (side.current) {
          side.current.textContent =
            state.pendingTurn ?? nextExpectedSide(cadence) ?? '–'
        }
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [store, world, paramsRef, visible])

  if (!visible) return null

  return (
    <div className="hud">
      <div className="hud-row">
        <span ref={mode}>skiløper</span>
        <em>M bytter</em>
      </div>
      <div className="hud-row">
        <span ref={speed}>0.0</span>
        <em>km/t</em>
      </div>
      <div className="hud-row">
        <span ref={gradient}>0.0</span>
        <em>% stigning</em>
      </div>
      <div className="hud-row">
        <span ref={friction}>0.000</span>
        <em>μ (ferskhet)</em>
      </div>
      <div className="hud-row hud-where">
        <span ref={where}>–</span>
      </div>
      <div className="hud-row">
        <span ref={quality}>0.00</span>
        <em>quality</em>
      </div>
      <div className="hud-pulse">
        <div className="hud-pulse-fill" ref={pulse} />
      </div>
      <div className="hud-row hud-next">
        <span ref={side}>–</span>
        <em>neste</em>
      </div>
    </div>
  )
}
