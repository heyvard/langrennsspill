/**
 * Løypemaskinen. Ingen rytme — gass, tomgang, revers og et ratt.
 *
 * Den har motorkraft nok til å ta enhver bakke grafen kan by på, og den raser
 * ikke nedover: over marsjfarten legger beltet seg imot og holder den der.
 * Alt den kjører over blir preparert, også i revers — men bare i det båndet
 * bladet dekker, og løypa er bredere enn bladet.
 *
 * Kursen `yaw` er fri hele veien rundt, ikke et lite avvik fra løypas tangent:
 * beltene kan gå hver sin vei, så rattet er en dreiehastighet og maskinen snur
 * også på stedet. Løypa er bred nok til at den får plass til å snu inne i den.
 * Det er bare posisjonen som følger grafen — hvilken vei maskinen peker, og
 * dermed hvilken vei den kjører, bestemmer føreren helt selv. Med `|yaw| > π/2`
 * går den bakover langs kanten selv om den kjører forover; `advance()` tar
 * negativ avstand, og fortegnsbokholderiet dens gir riktig `dir` uansett.
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
 *
 * `yaw` følger derimot med urørt gjennom begge: den måles fra tangenten i
 * `dir`, og `advance()` velger `dir` slik at tangenten peker samme vei i
 * forhold til maskinen som før. Kursen snur da nøyaktig så mye som krysset
 * selv svinger — som er dét som får maskinen til å følge grafen rundt hjørnet.
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
 * Det er bladet som klemmes, ikke midtpunktet: en bjelke som dreier om
 * midtpunktet sveiper en sirkel med halve bladbredden som radius, så et
 * midtpunkt som holder den avstanden til løypekanten har bladet innenfor
 * uansett hvilken vei maskinen peker. Det er dét som gjør at kursen kan være
 * fri uten at maskinen preparerer utenfor løypa. Er bladet bredere enn løypa,
 * blir grensen null og maskinen står på midtlinja.
 */
export function lateralLimit(p: Params): number {
  return Math.max(p.TRAIL_HALF_WIDTH - Math.max(p.GROOMER_BLADE_WIDTH, 0) / 2, 0)
}

/** Bringer en vinkel inn i (-π, π]. Kursen er fri, men den skal ikke vokse. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
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

  // Rattet er en dreiehastighet, ikke et utslag: holder man det inne, fortsetter
  // maskinen å snu, hele veien rundt om man vil. Slipper man det, blir kursen
  // stående der den var — det er ikke fjæret, en løypemaskin retter seg ikke
  // opp av seg selv. Farten spiller ingen rolle; beltene snur den på stedet.
  let yaw = wrapAngle(state.yaw + steer * Math.max(p.GROOMER_STEER_RATE, 0) * dt)
  if (!Number.isFinite(yaw)) yaw = 0

  // Stigningen leses langs løypa, men bare den delen maskinen faktisk klatrer.
  // Løypa er vannrett på tvers, så cos(ψ) er hele projeksjonen: peker maskinen
  // tvers av løypa, er det ingen bakke å ta, og peker den ned igjen, snur
  // fortegnet — uten det ville en maskin som snudde i motbakke fått
  // tyngdekraften i ryggen begge veier.
  const theta = Math.atan(
    edgeGradient(edge, state.placement.s, state.placement.dir) * Math.cos(yaw),
  )

  let v = state.v
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

  // Farten deles på kursen: `cos ψ` langs løypa, `sin ψ` på tvers. Peker
  // maskinen bakover langs kanten, blir avstanden negativ, og `advance()` tar
  // den. Rygger man, går begge deler motsatt vei — fortegnet på v ordner det
  // av seg selv.
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
    groomSpan(world, before.edge, before.s, placement.s, lat, yaw, now, p)
  } else {
    // Retningen bevegelsen har langs kanten, i den enden av steget den gjelder.
    const moving = v * Math.cos(yaw) >= 0 ? 1 : -1
    const leftBehind = before.dir * moving === 1 ? edgeOf(world, before.edge).length : 0
    const enteredAt = placement.dir * moving === 1 ? 0 : edgeOf(world, placement.edge).length
    // Posisjonen ved avreise fra den gamle kanten er tilnærmet lat — steget
    // er noen centimeter, forskjellen fra styringen underveis er støy.
    groomSpan(world, before.edge, before.s, leftBehind, state.lat, yaw, now, p)
    groomSpan(world, placement.edge, enteredAt, placement.s, lat, yaw, now, p)
  }

  return { placement, v, lat, yaw }
}
