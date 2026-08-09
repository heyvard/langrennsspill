/**
 * Bryteren mellom skiløper og løypemaskin. M-tasten er usynlig på mobil,
 * så dette er den eneste veien inn for berøring — én synlig knapp, i
 * nederste venstre hjørne der den er innafor tommelen og ikke i veien for
 * HUD, minikart eller gass-/reverssonene.
 *
 * Ikonet skrives i en rAF-løkke rett til DOM, som Hud.tsx og TouchZones.tsx
 * gjør med sine hyppig oppdaterte felt — ingen React-rerender per bilde.
 */

import { useEffect, useRef } from 'react'
import type { SimStore } from '../engine/simStore'
import type { InputSource } from '../input/useInput'

export function ModeButton({ source, store }: { source: InputSource; store: SimStore }) {
  const icon = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (icon.current) icon.current.textContent = store.curr.mode === 'skier' ? '⛷️' : '🚜'
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
      className="mode-button"
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Bytt mellom skiløper og løypemaskin"
    >
      <span ref={icon}>⛷️</span>
    </button>
  )
}
