/**
 * Skriver aktivt kjøretøy til `data-mode` på `<html>`, i en rAF-løkke —
 * samme mønster som Hud.tsx og resten av ui/ bruker for hyppig oppdaterte
 * felt. Flere overlays (joystickene, modusknappen, minikartet) trenger å
 * vise eller skjule seg etter modus, så attributtet bor på rota i stedet for
 * å skrives separat av hver av dem.
 */

import { useEffect } from 'react'
import type { SimStore } from '../engine/simStore'

export function useModeAttribute(store: SimStore) {
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      document.documentElement.dataset.mode = store.curr.mode
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [store])
}
