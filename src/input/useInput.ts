/**
 * Inndata-kilden. Samler tastatur og berøring i én kø av hendelser.
 * sim/ får aldri vite hvilken enhet de kom fra.
 *
 * To slag inndata med ulik natur:
 *   - hendelser (tapp, sveip, modusbytte) er øyeblikk, og køes med tidsstempel
 *   - hold er en tilstand, og leses av som nivå når simuleringen trenger den
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Side } from '../sim/types'

/** Hvor på skjermen inndataen traff, i piksler. Kun til gløden. */
export type TapHit = { side: Side; x: number; y: number }

export type InputEvent =
  | { kind: 'tap'; t: number; side: Side }
  | { kind: 'swipe'; t: number; side: Side }
  | { kind: 'mode'; t: number }

/**
 * Hvilke soner som holdes inne akkurat nå. `L`/`R` er rattet i løypemaskinen,
 * `U`/`D` er gass og revers. Skiløperen leser ingen av dem — hun går på tapp.
 */
export type Holds = { L: boolean; R: boolean; U: boolean; D: boolean }

/** Retningene et hold kan ha. Flere enn `Side`, som bare er venstre og høyre. */
export type HoldKey = keyof Holds

/**
 * De trinnløse nivåene, hver i `[-1, 1]`. Samme natur som holdene — en
 * tilstand, ikke et øyeblikk — men med et utslag i stedet for av og på.
 * `drive*` er gass og ratt, `look*` er kameraet. Tastaturet setter dem aldri.
 */
export type Axes = { driveX: number; driveY: number; lookX: number; lookY: number }

export type AxisKey = keyof Axes

type Listener = (hit: TapHit) => void

export type InputSource = {
  /** Tømmer køen og returnerer hendelsene som har kommet siden sist. */
  pull(): InputEvent[]
  /** Nivået på holdene nå. Objektet gjenbrukes — ikke ta vare på det. */
  holds(): Holds
  /** Nivået på aksene nå. Gjenbrukt objekt, som `holds()`. */
  axes(): Axes
  setAxis(key: AxisKey, value: number): void
  pushTap(hit: TapHit): void
  pushSwipe(side: Side, hit: TapHit): void
  pushMode(): void
  setHold(key: HoldKey, down: boolean): void
  /** Varsles ved hvert tapp, så overlayet kan tegne en glød. */
  subscribe(fn: Listener): () => void
}

/** Sim-klokka går i sekunder. performance.now() er millisekunder. */
export function now(): number {
  return performance.now() / 1000
}

export function useInput(): InputSource {
  const queue = useRef<InputEvent[]>([])
  const held = useRef<Holds>({ L: false, R: false, U: false, D: false })
  const levels = useRef<Axes>({ driveX: 0, driveY: 0, lookX: 0, lookY: 0 })
  const listeners = useRef(new Set<Listener>())

  const source = useMemo<InputSource>(
    () => ({
      pull() {
        const events = queue.current
        queue.current = []
        return events
      },
      holds() {
        return held.current
      },
      axes() {
        return levels.current
      },
      setAxis(key, value) {
        levels.current[key] = Number.isFinite(value) ? value : 0
      },
      pushTap(hit) {
        // Tidsstempelet settes her, så tett på hendelsen som mulig.
        queue.current.push({ kind: 'tap', t: now(), side: hit.side })
        for (const fn of listeners.current) fn(hit)
      },
      pushSwipe(side, hit) {
        queue.current.push({ kind: 'swipe', t: now(), side })
        for (const fn of listeners.current) fn(hit)
      },
      pushMode() {
        queue.current.push({ kind: 'mode', t: now() })
      },
      setHold(key, down) {
        held.current[key] = down
      },
      subscribe(fn) {
        listeners.current.add(fn)
        return () => listeners.current.delete(fn)
      },
    }),
    [],
  )

  useEffect(() => {
    /** Gløden legges midt i sin skjermhalvdel, så tastatur ser ut som touch. */
    function hitFor(side: Side): TapHit {
      return {
        side,
        x: side === 'L' ? window.innerWidth * 0.25 : window.innerWidth * 0.75,
        y: window.innerHeight * 0.62,
      }
    }

    // Venstre/høyre pil er tapp for skiløperen og ratt for løypemaskinen —
    // samme hold, ulik betydning avhengig av hvem som styrer. Opp/ned pil og
    // W/S er gass og revers, bare løypemaskinen bryr seg.
    function sideOfArrow(key: string): Side | null {
      return key === 'ArrowLeft' ? 'L' : key === 'ArrowRight' ? 'R' : null
    }

    function verticalOfArrow(key: string): 'U' | 'D' | null {
      return key === 'ArrowUp' ? 'U' : key === 'ArrowDown' ? 'D' : null
    }

    function onKeyDown(e: KeyboardEvent) {
      const arrow = sideOfArrow(e.key)
      if (arrow) {
        e.preventDefault()
        source.setHold(arrow, true)
        // Autorepeat er ikke tapping — men holdet står fortsatt.
        if (!e.repeat) source.pushTap(hitFor(arrow))
        return
      }
      const vertical = verticalOfArrow(e.key)
      if (vertical) {
        e.preventDefault()
        source.setHold(vertical, true)
        return
      }
      if (e.repeat) return
      const lower = e.key.toLowerCase()
      if (lower === 'a' || lower === 'd') {
        e.preventDefault()
        const side: Side = lower === 'a' ? 'L' : 'R'
        source.pushSwipe(side, hitFor(side))
        return
      }
      if (lower === 'w' || lower === 's') {
        e.preventDefault()
        source.setHold(lower === 'w' ? 'U' : 'D', true)
        return
      }
      if (lower === 'm') {
        e.preventDefault()
        source.pushMode()
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const arrow = sideOfArrow(e.key)
      if (arrow) {
        source.setHold(arrow, false)
        return
      }
      const vertical = verticalOfArrow(e.key)
      if (vertical) {
        source.setHold(vertical, false)
        return
      }
      const lower = e.key.toLowerCase()
      if (lower === 'w' || lower === 's') source.setHold(lower === 'w' ? 'U' : 'D', false)
    }

    /**
     * Slipper man tasten mens fanen er borte, kommer keyup aldri — og en
     * finger som forsvinner med fanen slipper aldri joysticken heller.
     */
    function onBlur() {
      source.setHold('L', false)
      source.setHold('R', false)
      source.setHold('U', false)
      source.setHold('D', false)
      source.setAxis('driveX', 0)
      source.setAxis('driveY', 0)
      source.setAxis('lookX', 0)
      source.setAxis('lookY', 0)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [source])

  return source
}
