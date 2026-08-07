/**
 * Liten deterministisk PRNG. simplex-noise 4 tar imot en random-funksjon,
 * men leverer ingen seedet en selv — dette er den.
 */

/** mulberry32: rask, god nok fordeling, samme sekvens for samme seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}
