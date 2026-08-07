/**
 * Debug-HUD. Kun for tuning — uten den er ingenting av dette justerbart.
 *
 * Oppdateres i en egen rAF-loop som skriver rett til DOM. En setState per
 * bilde ville re-rendret React 60 ganger i sekundet uten grunn.
 */

import { useEffect, useRef } from 'react'
import type { SimStore } from '../engine/simStore'
import { sampleV } from '../engine/simStore'
import { nextExpectedSide, targetInterval } from '../sim/cadence'
import type { Params } from '../sim/constants'
import type { Track } from '../sim/track'

/** Tekstfeltene trenger ikke 60 Hz — tallene blir uleselige. */
const TEXT_HZ = 15

export function Hud({
  store,
  track,
  paramsRef,
  visible,
}: {
  store: SimStore
  track: Track
  paramsRef: { current: Params }
  visible: boolean
}) {
  const speed = useRef<HTMLSpanElement>(null)
  const gradient = useRef<HTMLSpanElement>(null)
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
      const interval = targetInterval(state.v, p)
      const bar = pulse.current
      if (bar) {
        const since = state.cadence.lastTapTime === null ? 0 : simNow - state.cadence.lastTapTime
        const progress = Math.min(since / interval, 1)
        bar.style.transform = `scaleX(${progress})`
        // Blink idet tappet forventes, og en kort nåde etterpå.
        bar.style.opacity = progress >= 1 ? '1' : String(0.35 + 0.5 * progress)
      }

      if (now - lastText > 1000 / TEXT_HZ) {
        lastText = now
        const v = sampleV(store)
        if (speed.current) speed.current.textContent = (v * 3.6).toFixed(1)
        if (gradient.current) {
          gradient.current.textContent = (track.gradientAt(state.s) * 100).toFixed(1)
        }
        if (quality.current) quality.current.textContent = state.cadence.lastQuality.toFixed(2)
        if (side.current) side.current.textContent = nextExpectedSide(state.cadence) ?? '–'
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [store, track, paramsRef, visible])

  if (!visible) return null

  return (
    <div className="hud">
      <div className="hud-row">
        <span ref={speed}>0.0</span>
        <em>km/t</em>
      </div>
      <div className="hud-row">
        <span ref={gradient}>0.0</span>
        <em>% stigning</em>
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
