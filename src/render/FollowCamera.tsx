/**
 * Tredjepersonskamera bak det kjøretøyet man styrer, med fri sikt via venstre
 * joystick. Mykt etterheng, litt lav vinkel — lavt nok til at tåka og
 * hodelykta fyller bildet.
 *
 * Løypemaskinen er stor og treg, så den får kameraet lenger bak og høyere.
 * Bytter man modus, glir kameraet over av seg selv: dempingen gjør resten.
 *
 * Venstre stikke dreier riggen rundt kjøretøyet i stedet for å flytte
 * kameraet fritt i verdensrommet — `lookX` vannrett, `lookY` opp/ned.
 * Slipper man stikka, glir vinkelen selv tilbake til rett bak kjøretøyet:
 * en maskin som kjører videre mens du ser deg rundt skal ikke kreve at du
 * styrer kameraet tilbake selv.
 */

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { createPose, samplePose, type SimStore } from '../engine/simStore'
import type { InputSource } from '../input/useInput'
import type { Mode } from '../sim/types'
import type { HeightField } from '../sim/world/terrain'
import type { World } from '../sim/world/types'

type Rig = { distance: number; height: number; lookAhead: number }

const RIGS: Record<Mode, Rig> = {
  skier: { distance: 7.5, height: 2.3, lookAhead: 9 },
  groomer: { distance: 14, height: 6, lookAhead: 14 },
}

/** Etterheng. Lavt tall gir tregere, mykere kamera. */
const SMOOTHING = 4.5
/** Kameraet skal aldri havne under snøen. */
const MIN_CLEARANCE = 1.2

/** Hvor fort riggen dreier seg om kjøretøyet ved fullt joystick-utslag, rad/s. */
const LOOK_YAW_RATE = 2.2
const LOOK_PITCH_RATE = 1.2
/** Rett bak og i rigghøyde er nullpunktet. Negativ er å se opp under maskinen. */
const PITCH_MIN = -0.2
const PITCH_MAX = 0.9
/** Hvor fort vinkelen glir tilbake til rett bak når stikka slippes. */
const RECENTER_RATE = 2.0

export function FollowCamera({
  store,
  world,
  height,
  source,
}: {
  store: SimStore
  world: World
  height: HeightField
  source: InputSource
}) {
  const pose = useRef(createPose())
  const desired = useRef(new Vector3())
  const target = useRef(new Vector3())
  const lookAt = useRef(new Vector3())
  const started = useRef(false)
  /** Riggens dreining rundt kjøretøyet, radianer. Null er rett bak. */
  const orbitYaw = useRef(0)
  const orbitPitch = useRef(0)

  useFrame((state, delta) => {
    const mode = store.curr.mode
    const rig = RIGS[mode]
    const p = samplePose(store, world, mode, pose.current)
    const dt = Math.min(delta, 0.1)

    const axes = source.axes()
    if (axes.lookX !== 0 || axes.lookY !== 0) {
      orbitYaw.current += axes.lookX * LOOK_YAW_RATE * dt
      // Vikle til [-π, π] så veien tilbake til null alltid er den korteste.
      orbitYaw.current = Math.atan2(Math.sin(orbitYaw.current), Math.cos(orbitYaw.current))
      const wantedPitch = orbitPitch.current - axes.lookY * LOOK_PITCH_RATE * dt
      orbitPitch.current = Math.min(Math.max(wantedPitch, PITCH_MIN), PITCH_MAX)
    } else {
      // Ingen aktiv styring: gli tilbake mot null, rammeuavhengig demping.
      const k = 1 - Math.exp(-RECENTER_RATE * dt)
      orbitYaw.current *= 1 - k
      orbitPitch.current *= 1 - k
    }

    // Vannrett retning bak kjøretøyet, dreid med riggens orbit-vinkel.
    const horizontal = Math.hypot(p.tx, p.tz) || 1
    const htx = p.tx / horizontal
    const htz = p.tz / horizontal
    const cosYaw = Math.cos(orbitYaw.current)
    const sinYaw = Math.sin(orbitYaw.current)
    const rtx = htx * cosYaw - htz * sinYaw
    const rtz = htx * sinYaw + htz * cosYaw

    const cosPitch = Math.cos(orbitPitch.current)
    const sinPitch = Math.sin(orbitPitch.current)
    const distanceH = rig.distance * cosPitch
    const riseExtra = rig.distance * sinPitch

    desired.current.set(p.x - rtx * distanceH, p.y + rig.height + riseExtra, p.z - rtz * distanceH)
    // Hold kameraet over bakken selv når løypa stuper.
    const ground = height.heightAt(desired.current.x, desired.current.z)
    desired.current.y = Math.max(desired.current.y, ground + MIN_CLEARANCE)

    target.current.set(p.x + rtx * rig.lookAhead, p.y + 1, p.z + rtz * rig.lookAhead)

    if (!started.current) {
      // Første bilde: hopp på plass i stedet for å svaie inn fra origo.
      state.camera.position.copy(desired.current)
      lookAt.current.copy(target.current)
      started.current = true
    } else {
      // Rammeuavhengig demping — samme følelse uansett bildefrekvens.
      const k = 1 - Math.exp(-SMOOTHING * dt)
      state.camera.position.lerp(desired.current, k)
      lookAt.current.lerp(target.current, k)
    }

    state.camera.lookAt(lookAt.current)
  })

  return null
}
