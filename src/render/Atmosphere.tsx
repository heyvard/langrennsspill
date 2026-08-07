/**
 * Himmel, omgivelseslys og eksponentiell tåke, alt fra stemningen.
 * Tåka er både stemning og culling — kort sikt er meningen, tynnere om dagen.
 */

import type { Mood } from './palette'

export function Atmosphere({ mood, fogDensity }: { mood: Mood; fogDensity: number }) {
  return (
    <>
      <color attach="background" args={[mood.fog]} />
      <fogExp2 attach="fog" args={[mood.fog.getHex(), fogDensity * mood.fogScale]} />

      <ambientLight color={mood.ambient} intensity={mood.ambientIntensity} />
      <hemisphereLight
        color={mood.skyColor}
        groundColor={mood.groundColor}
        intensity={mood.hemiIntensity}
      />
      {/* Høy sol midt på dagen, lav i vest mot kvelden. Slukner før mørket. */}
      <directionalLight
        color={mood.sunColor}
        intensity={mood.sunIntensity}
        position={mood.sunPosition}
      />
    </>
  )
}
