/**
 * Skumring, kaldt blått omgivelseslys, tett eksponentiell tåke.
 * Tåka er både stemning og culling — kort sikt er meningen.
 */

import { useMemo } from 'react'
import { moodAt } from './palette'

export function Atmosphere({ timeOfDay, fogDensity }: { timeOfDay: number; fogDensity: number }) {
  const mood = useMemo(() => moodAt(timeOfDay), [timeOfDay])

  return (
    <>
      <color attach="background" args={[mood.fog]} />
      <fogExp2 attach="fog" args={[mood.fog.getHex(), fogDensity]} />

      <ambientLight color={mood.ambient} intensity={mood.ambientIntensity} />
      <hemisphereLight
        color={mood.skyColor}
        groundColor={mood.groundColor}
        intensity={mood.hemiIntensity}
      />
      {/* Lav sol i vest. Slukner før det blir helt mørkt. */}
      <directionalLight
        color={mood.sunColor}
        intensity={mood.sunIntensity}
        position={[-140, 40, -90]}
      />
    </>
  )
}
