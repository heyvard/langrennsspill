/**
 * Tappflaten. Venstre og høyre skjermhalvdel, ingen synlige knapper —
 * bare en svak kortvarig glød der fingeren traff.
 *
 * pointerdown, ikke click: click venter på at berøringen slippes, og den
 * forsinkelsen ødelegger hele rytmefølelsen.
 */

import { useEffect, useRef } from 'react'
import type { TapSource } from './useTaps'

/** Hvor lenge gløden lever, ms. Må matche varigheten i CSS-en. */
const GLOW_MS = 320

export function TouchZones({ source }: { source: TapSource }) {
  const layer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return source.subscribe(({ x, y }) => {
      const host = layer.current
      if (!host) return
      const dot = document.createElement('div')
      dot.className = 'glow'
      dot.style.left = `${x}px`
      dot.style.top = `${y}px`
      host.appendChild(dot)
      setTimeout(() => dot.remove(), GLOW_MS)
    })
  }, [source])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    source.push({
      side: e.clientX < window.innerWidth / 2 ? 'L' : 'R',
      x: e.clientX,
      y: e.clientY,
    })
  }

  return (
    <div
      className="tap-zones"
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="glow-layer" ref={layer} />
    </div>
  )
}
