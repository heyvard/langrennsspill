/**
 * Bryteren mellom skiløper og løypemaskin. M-tasten er usynlig på mobil,
 * så dette er den eneste veien inn for berøring — en switch øverst til
 * venstre, unna minikart og gass-/reverssonene.
 *
 * Tegnes som en pille med en glidende knapp, skrevet i en rAF-løkke rett
 * til DOM, som Hud.tsx og TouchZones.tsx gjør med sine hyppig oppdaterte
 * felt — ingen React-rerender per bilde.
 */

import { useEffect, useRef } from 'react'
import type { SimStore } from '../engine/simStore'
import type { InputSource } from '../input/useInput'

export function ModeSwitch({ source, store }: { source: InputSource; store: SimStore }) {
  const thumb = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (thumb.current) {
        thumb.current.style.transform =
          store.curr.mode === 'skier' ? 'translateX(0)' : 'translateX(48px)'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [store])

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    source.pushMode()
  }

  return (
    <button
      className="mode-switch"
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Bytt mellom skiløper og løypemaskin"
    >
      <span className="mode-switch-thumb" ref={thumb} />
      <span className="mode-switch-option">⛷️</span>
      <span className="mode-switch-option">🚜</span>
    </button>
  )
}
