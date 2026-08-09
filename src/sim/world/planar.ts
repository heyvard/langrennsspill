/**
 * Planargeometri i xz. Delt mellom generatoren, som bruker den til å holde
 * løypene fra hverandre, og validatoren, som bruker den til å bevise at de
 * faktisk holdt seg fra hverandre.
 */

export type Point = [number, number]

/** Dobbelt areal av trekanten abc. Positiv = mot klokka. */
export function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/** Kvadrert avstand. Sparer en rot der bare sammenligning trengs. */
export function dist2(a: Point, b: Point): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

/** Korteste avstand fra punkt til linjestykke. */
export function pointSegmentDistance(q: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(q[0] - a[0], q[1] - a[1])
  let t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy))
}

/**
 * Krysser de to linjestykkene hverandre?
 *
 * Kun ekte krysninger teller: deler de et endepunkt, eller berører de bare
 * så vidt hverandre, svarer vi nei. Kanter som møtes i en node skal ikke
 * regnes som en krysning, og det er nettopp endepunktene de deler.
 */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/**
 * Krysser to polylinjer hverandre? Segmentpar som deler et endepunkt hoppes
 * over, så to kanter som møtes i en node ikke slår ut.
 */
export function polylinesCross(a: Point[], b: Point[]): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsCross(a[i], a[i + 1], b[j], b[j + 1])) return true
    }
  }
  return false
}

/** Sirkelen gjennom a, b, c. null når punktene er kolineære. */
export function circumcircle(a: Point, b: Point, c: Point): { cx: number; cy: number; r2: number } | null {
  const d = 2 * cross(a, b, c)
  if (Math.abs(d) < 1e-9) return null
  const a2 = a[0] * a[0] + a[1] * a[1]
  const b2 = b[0] * b[0] + b[1] * b[1]
  const c2 = c[0] * c[0] + c[1] * c[1]
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d
  const cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d
  return { cx, cy, r2: dist2([cx, cy], a) }
}
