/**
 * Tapp-kilde. Samler tastatur og berøring i én kø av Tap.
 * sim/ får aldri vite hvilken enhet tappet kom fra.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Side, Tap } from '../sim/types'

/** Hvor på skjermen tappet traff, i piksler. Kun til gløden. */
export type TapHit = { side: Side; x: number; y: number }

type Listener = (hit: TapHit) => void

export type TapSource = {
  /** Tømmer køen og returnerer tappene som har kommet siden sist. */
  pull(): Tap[]
  /** Registrerer et tapp. Kalles av touch-sonene og tastaturet. */
  push(hit: TapHit): void
  /** Varsles ved hvert tapp, så overlayet kan tegne en glød. */
  subscribe(fn: Listener): () => void
}

/** Sim-klokka går i sekunder. performance.now() er millisekunder. */
export function now(): number {
  return performance.now() / 1000
}

export function useTaps(): TapSource {
  const queue = useRef<Tap[]>([])
  const listeners = useRef(new Set<Listener>())

  const source = useMemo<TapSource>(
    () => ({
      pull() {
        const taps = queue.current
        queue.current = []
        return taps
      },
      push(hit) {
        // Tidsstempelet settes her, så tett på hendelsen som mulig.
        queue.current.push({ t: now(), side: hit.side })
        for (const fn of listeners.current) fn(hit)
      },
      subscribe(fn) {
        listeners.current.add(fn)
        return () => listeners.current.delete(fn)
      },
    }),
    [],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Autorepeat er ikke tapping.
      if (e.repeat) return
      const side: Side | null = e.key === 'ArrowLeft' ? 'L' : e.key === 'ArrowRight' ? 'R' : null
      if (!side) return
      e.preventDefault()
      // Gløden legges midt i sin skjermhalvdel, så tastatur ser ut som touch.
      source.push({
        side,
        x: side === 'L' ? window.innerWidth * 0.25 : window.innerWidth * 0.75,
        y: window.innerHeight * 0.62,
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [source])

  return source
}
