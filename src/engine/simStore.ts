/**
 * Delt, muterbar tilstand mellom simuleringen og de som tegner den.
 *
 * Bevisst utenfor React: dette skrives 120 ganger i sekundet, og en
 * re-render per steg ville drept både ytelsen og responsen.
 */

import { initialState } from '../sim/physics'
import { clamp } from '../sim/rng'
import type { State } from '../sim/types'

export type SimStore = {
  /** Tilstanden før siste faste steg. */
  prev: State
  /** Tilstanden etter siste faste steg. */
  curr: State
  /** Hvor langt mellom prev og curr rendringen står, 0–1. */
  alpha: number
  /** Faste steg utført siden start. Kun til debug. */
  steps: number
}

export function createSimStore(): SimStore {
  const state = initialState()
  return { prev: state, curr: state, alpha: 0, steps: 0 }
}

/**
 * Interpolert posisjon langs sporet.
 * Sporet er en sløyfe, så s hopper fra loopLength til 0. Uten korreksjonen
 * ville løperen skutt baklengs rundt hele runden på det ene bildet.
 */
export function sampleS(store: SimStore, loopLength: number): number {
  const a = store.prev.s
  let b = store.curr.s
  if (b < a - loopLength / 2) b += loopLength
  const s = a + (b - a) * store.alpha
  return ((s % loopLength) + loopLength) % loopLength
}

/** Interpolert fart. */
export function sampleV(store: SimStore): number {
  return store.prev.v + (store.curr.v - store.prev.v) * clamp(store.alpha, 0, 1)
}
