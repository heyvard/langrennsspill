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

/** Hvilke soner som holdes inne akkurat nå. */
export type Holds = { L: boolean; R: boolean }

type Listener = (hit: TapHit) => void

export type InputSource = {
  /** Tømmer køen og returnerer hendelsene som har kommet siden sist. */
  pull(): InputEvent[]
  /** Nivået på holdene nå. Objektet gjenbrukes — ikke ta vare på det. */
  holds(): Holds
  pushTap(hit: TapHit): void
  pushSwipe(side: Side, hit: TapHit): void
  pushMode(): void
  setHold(side: Side, down: boolean): void
  /** Varsles ved hvert tapp, så overlayet kan tegne en glød. */
  subscribe(fn: Listener): () => void
}

/** Sim-klokka går i sekunder. performance.now() er millisekunder. */
export function now(): number {
  return performance.now() / 1000
}

export function useInput(): InputSource {
  const queue = useRef<InputEvent[]>([])
  const held = useRef<Holds>({ L: false, R: false })
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
      setHold(side, down) {
        held.current[side] = down
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

    function sideOfArrow(key: string): Side | null {
      return key === 'ArrowLeft' ? 'L' : key === 'ArrowRight' ? 'R' : null
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
      if (e.repeat) return
      const lower = e.key.toLowerCase()
      if (lower === 'a' || lower === 'd') {
        e.preventDefault()
        const side: Side = lower === 'a' ? 'L' : 'R'
        source.pushSwipe(side, hitFor(side))
        return
      }
      if (lower === 'm') {
        e.preventDefault()
        source.pushMode()
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const arrow = sideOfArrow(e.key)
      if (arrow) source.setHold(arrow, false)
    }

    /** Slipper man tasten mens fanen er borte, kommer keyup aldri. */
    function onBlur() {
      source.setHold('L', false)
      source.setHold('R', false)
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
