/**
 * Løypemaskinen. Ingen rytme — gass, tomgang, revers og et ratt.
 *
 * Den har motorkraft nok til å ta enhver bakke grafen kan by på, og den raser
 * ikke nedover: over marsjfarten legger beltet seg imot og holder den der.
 * Alt den kjører over blir preparert, også i revers — men bare i det båndet
 * bladet dekker, og løypa er bredere enn bladet.
 *
 * Sideveis posisjon er det som gjør styringen til noe annet enn pynt. `lat`
 * lagres i kantens eget rom, meter mot høyre for `from → to`, fordi det er
 * rommet `edgeLateral(edge, s, 1)` og løypebåndet i render/ er definert i.
 * Føreren opplever det speilvendt når `dir === -1`, så styringen selv regnes
 * i den førerrelative størrelsen `q = dir * lat`.
 *
 * To ulike ting kan få `advance()` til å snu `dir` inne i seg selv, og de
 * krever hver sin oppdatering av `lat` etterpå:
 *
 *  - Et kryss til en annen kant: `from`/`to` på den nye kanten er vilkårlig
 *    merket, uavhengig av hvilken fysisk retning maskinen kjører. Her er det
 *    `q` som skal bevares — «en meter til høyre for føreren» er fortsatt én
 *    meter til høyre for føreren på den andre siden av krysset.
 *  - En blindvei på samme kant: maskinen snur på stedet, den flytter seg
 *    ikke sideveis av å snu. Her er det den fysiske `lat` som skal bevares
 *    — ikke `q`, som tvert imot bytter fortegn, siden det som var til
 *    førerens høyre nå er til venstre etter snuen.
 */

import type { Params } from '../constants'
import { clamp } from '../rng'
import { advance, type Chooser } from '../traversal'
import type { GroomerState } from '../types'
import { edgeGradient } from '../world/geometry'
import { edgeOf, type World } from '../world/types'
import { groomSpan } from './grooming'

/** Toppfarten i den retningen maskinen faktisk beveger seg. */
function capFor(v: number, p: Params): number {
  const top = Math.max(p.GROOMER_MAX_SPEED, 0)
  return v >= 0 ? top : top * Math.max(p.GROOMER_REVERSE_FACTOR, 0)
}

/**
 * Hvor langt ut fra midtlinja maskinens midtpunkt får komme, meter.
 *
 * Det er beltene som klemmes, ikke midtpunktet: i ytterstilling ligger
 * bladkanten nøyaktig på løypekanten, og to passeringer i hver sin
 * ytterstilling dekker bredden akkurat. Er bladet bredere enn løypa, blir
 * grensen null og maskinen står i midten.
 */
export function lateralLimit(p: Params): number {
  return Math.max(p.TRAIL_HALF_WIDTH - Math.max(p.GROOMER_BLADE_WIDTH, 0) / 2, 0)
}

export function stepGroomer(
  state: GroomerState,
  rawThrottle: number,
  rawSteer: number,
  now: number,
  dt: number,
  world: World,
  p: Params,
  chooser: Chooser,
): GroomerState {
  // Begge pådragene er trinnløse, men aldri mer enn fullt utslag: klemmen her
  // er det som gjør at farts- og kursgrensene holder uansett hva inndatalaget
  // finner på å sende inn.
  const throttle = clamp(rawThrottle, -1, 1)
  const steer = clamp(rawSteer, -1, 1)

  const edge = edgeOf(world, state.placement.edge)
  const theta = Math.atan(edgeGradient(edge, state.placement.s, state.placement.dir))

  // Rattet dreier mot ønsket utslag, det står ikke der med en gang. Slipper
  // man det, blir det stående akkurat der det var — det er ikke fjæret, en
  // løypemaskin retter seg ikke opp av seg selv. Bare aktiv styring beveger det.
  let yaw = state.yaw
  if (steer !== 0) {
    const wanted = steer * Math.max(p.GROOMER_MAX_YAW, 0)
    const swing = Math.max(p.GROOMER_STEER_RATE, 0) * dt
    yaw = state.yaw + clamp(wanted - state.yaw, -swing, swing)
  }
  if (!Number.isFinite(yaw)) yaw = 0

  let v = state.v
  // Stigningen leses langs løypa. At maskinen skrår gjennom den, og dermed
  // klatrer v·cos(ψ) i sekundet, er innenfor støyen ved et halvt radian.
  const aGravity = -p.G * Math.sin(theta)
  const aDrag = -p.K_DRAG * v * Math.abs(v)
  const aRolling = v === 0 ? 0 : -Math.sign(v) * p.MU_UNGROOMED * p.G * Math.cos(theta)

  v += (throttle * p.GROOMER_POWER + aGravity + aDrag + aRolling) * dt

  // Beltet holder igjen. Over marsjfarten bremses den mot den, aldri under.
  const cap = capFor(v, p)
  if (Math.abs(v) > cap) {
    v = Math.sign(v) * Math.max(cap, Math.abs(v) - p.GROOMER_BRAKE * dt)
  }

  // Uten gass står den stille, også i bakke. En løypemaskin triller ikke.
  if (throttle === 0) {
    const braked = Math.abs(v) - p.GROOMER_BRAKE * dt
    v = braked <= 0 ? 0 : Math.sign(v) * braked
  }

  if (!Number.isFinite(v)) v = 0

  const before = state.placement

  // Rygger man med rattet mot høyre, går maskinen mot venstre — fortegnet på
  // v ordner det av seg selv.
  const limit = lateralLimit(p)
  const steeringDelta = v * Math.sin(yaw) * dt
  const placement = advance(before, v * Math.cos(yaw) * dt, world, chooser)

  const lat =
    placement.edge === before.edge
      ? // Samme kant, med eller uten en blindveisnuing innimellom: fysisk
        // posisjon er kontinuerlig, og styringen regnes i førerens
        // opprinnelige retning gjennom hele steget.
        clamp(state.lat + before.dir * steeringDelta, -limit, limit)
      : // Ny kant: bevar den førerrelative posisjonen, ikke den rå verdien —
        // det er `q` som er uavhengig av den nye kantens vilkårlige from/to.
        placement.dir * clamp(before.dir * state.lat + steeringDelta, -limit, limit)

  // Stemple snøen bak seg. En maskin som står stille preparerer ingenting —
  // ellers ville én bøtte holdt seg evig fersk under en parkert maskin.
  if (v === 0) return { placement, v, lat, yaw }

  // Ett steg er noen centimeter, så et kryss midt i steget deles i to spenn.
  if (placement.edge === before.edge) {
    groomSpan(world, before.edge, before.s, placement.s, lat, now, p)
  } else {
    const moving = v >= 0 ? 1 : -1
    // Retningen bevegelsen har i hver kants egen s.
    const leftBehind = before.dir * moving === 1 ? edgeOf(world, before.edge).length : 0
    const enteredAt = placement.dir * moving === 1 ? 0 : edgeOf(world, placement.edge).length
    // Posisjonen ved avreise fra den gamle kanten er tilnærmet lat — steget
    // er noen centimeter, forskjellen fra styringen underveis er støy.
    groomSpan(world, before.edge, before.s, leftBehind, state.lat, now, p)
    groomSpan(world, placement.edge, enteredAt, placement.s, lat, now, p)
  }

  return { placement, v, lat, yaw }
}
