/**
 * Tappflaten. Venstre og høyre skjermhalvdel, ingen synlige knapper —
 * bare en svak kortvarig glød der fingeren traff.
 *
 * pointerdown, ikke click: click venter på at berøringen slippes, og den
 * forsinkelsen ødelegger hele rytmefølelsen. Derfor teller tappet i det
 * fingeren lander, også når den siden viser seg å bli et sveip. Et sveip
 * som også ga ett tapp er langt bedre enn et tapp som kom for sent.
 *
 * Å holde inne er gass i løypemaskinen, begge sider er revers. Terskelen for
 * sveip er i piksler, ikke i tid — en rask flikk skal telle.
 */

import { useEffect, useRef } from 'react'
import type { Side } from '../sim/types'
import type { InputSource } from './useInput'

/** Hvor lenge gløden lever, ms. Må matche varigheten i CSS-en. */
const GLOW_MS = 320

type Track = { side: Side; x: number; y: number; swiped: boolean }

export function TouchZones({
  source,
  swipeThreshold,
}: {
  source: InputSource
  swipeThreshold: number
}) {
  const layer = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Track>())

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

  function sideAt(clientX: number): Side {
    return clientX < window.innerWidth / 2 ? 'L' : 'R'
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const side = sideAt(e.clientX)
    pointers.current.set(e.pointerId, { side, x: e.clientX, y: e.clientY, swiped: false })
    source.setHold(side, true)
    source.pushTap({ side, x: e.clientX, y: e.clientY })
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const track = pointers.current.get(e.pointerId)
    if (!track || track.swiped) return
    const dx = e.clientX - track.x
    if (Math.abs(dx) < swipeThreshold) return
    track.swiped = true
    const side: Side = dx < 0 ? 'L' : 'R'
    source.pushSwipe(side, { side, x: e.clientX, y: e.clientY })
  }

  function release(e: React.PointerEvent<HTMLDivElement>) {
    const track = pointers.current.get(e.pointerId)
    if (!track) return
    pointers.current.delete(e.pointerId)
    // Holdes samme side fortsatt av en annen finger, skal den bli stående.
    for (const other of pointers.current.values()) if (other.side === track.side) return
    source.setHold(track.side, false)
  }

  return (
    <div
      className="tap-zones"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="glow-layer" ref={layer} />
    </div>
  )
}
