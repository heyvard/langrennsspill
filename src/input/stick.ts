/**
 * Regnestykket bak en virtuell joystick. Ren TS, ingen DOM — komponenten måler
 * piksler, denne filen gjør dem om til utslag.
 *
 * Utslaget er sirkulært, ikke firkantet: lengden på forskyvningen normaliseres,
 * ikke hver akse for seg. Ellers ville et diagonalt drag gitt fullt utslag på
 * begge akser samtidig, og maskinen ville kjørt fortere på skrå enn rett fram.
 */

export type Axis2 = { x: number; y: number }

export function createAxis2(): Axis2 {
  return { x: 0, y: 0 }
}

/**
 * Fingerens forskyvning fra stikkas sentrum, i piksler, om til utslag i
 * `[-1, 1]` per akse. `y` er positiv oppover, motsatt skjermens y-akse.
 *
 * Innenfor dødsonen returneres eksakt `0`. Det er ikke pynt: både
 * `stepGroomer` og kameraets resentrering skiller på «ingen pådrag» og «lite
 * pådrag», og en tommel som hviler skal telle som ingen.
 */
export function stickAxes(
  dx: number,
  dy: number,
  travel: number,
  deadzone: number,
  out: Axis2,
): Axis2 {
  out.x = 0
  out.y = 0
  const length = Math.hypot(dx, dy)
  if (!(travel > 0) || !Number.isFinite(length) || length === 0) return out

  // Én dødsone på 1 ville gjort stikka død, så den kan aldri fylle hele veien.
  const dead = Number.isFinite(deadzone) ? Math.min(Math.max(deadzone, 0), 0.99) : 0
  const reach = Math.min(length / travel, 1)
  if (reach <= dead) return out

  // Skalaen starter på null i dødsonekanten, så utslaget ikke hopper.
  const scale = (reach - dead) / (1 - dead) / length
  out.x = dx * scale
  out.y = -dy * scale
  return out
}

/** Knottens forskyvning i piksler, klemt til stikkas radius. */
export function knobOffset(dx: number, dy: number, travel: number, out: Axis2): Axis2 {
  out.x = 0
  out.y = 0
  const length = Math.hypot(dx, dy)
  if (!(travel > 0) || !Number.isFinite(length) || length === 0) return out

  const scale = length > travel ? travel / length : 1
  out.x = dx * scale
  out.y = dy * scale
  return out
}
