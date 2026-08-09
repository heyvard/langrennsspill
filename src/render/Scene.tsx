/**
 * Alt som lever inne i Canvas. Ingen spillogikk her — scenen leser
 * simuleringens tilstand og verdenen, og tegner det.
 */

import { Perf } from 'r3f-perf'
import { useMemo } from 'react'
import { useSimLoop } from '../engine/useSimLoop'
import type { SimStore } from '../engine/simStore'
import type { InputSource } from '../input/useInput'
import type { Params } from '../sim/constants'
import { clamp } from '../sim/rng'
import type { Sign } from '../sim/world/signs'
import type { HeightField } from '../sim/world/terrain'
import type { World } from '../sim/world/types'
import type { View } from '../ui/useTuning'
import { Atmosphere } from './Atmosphere'
import { FollowCamera } from './FollowCamera'
import type { Forest } from './planting'
import { Trees } from './Forest'
import { Groomer } from './Groomer'
import { moodAt } from './palette'
import { Runner } from './Runner'
import { Signs } from './Signs'
import { Terrain } from './Terrain'
import type { TrailField } from './trailField'
import { TrackRibbons } from './TrackRibbons'
import { useStreaming } from './useStreaming'

/** Så mange e-foldinger inn i tåka det er verdt å laste. */
const FOG_DEPTH = 3
const MIN_RADIUS = 140
const MAX_RADIUS = 420

export function Scene({
  store,
  world,
  height,
  forest,
  trails,
  signs,
  paramsRef,
  source,
  view,
}: {
  store: SimStore
  world: World
  height: HeightField
  forest: Forest
  trails: TrailField
  signs: Sign[]
  paramsRef: { current: Params }
  source: InputSource
  view: View
}) {
  useSimLoop(store, world, paramsRef, source)

  // Stemningen trengs tre steder — atmosfæren, hodelykta og strømmeradien —
  // så den regnes ut her og sendes ned.
  const mood = useMemo(() => moodAt(view.timeOfDay), [view.timeOfDay])

  // Strømmeradien følger tåka: tettere dis, mindre å laste.
  const radius = useMemo(() => {
    const density = Math.max(view.fogDensity * mood.fogScale, 1e-4)
    return clamp(FOG_DEPTH / density, MIN_RADIUS, MAX_RADIUS)
  }, [view.fogDensity, mood.fogScale])

  const streamed = useStreaming(store, world, radius)

  return (
    <>
      <Atmosphere mood={mood} fogDensity={view.fogDensity} />
      <Terrain chunks={streamed.chunks} height={height} trails={trails} />
      <TrackRibbons
        edgeIds={streamed.edgeIds}
        world={world}
        store={store}
        height={height}
        paramsRef={paramsRef}
      />
      <Trees chunks={streamed.chunks} forest={forest} />
      <Signs signs={signs} nodeIds={streamed.nodeIds} world={world} height={height} />
      {/* Lykta slukner av seg selv i dagslys — lampFactor er 0 der. */}
      <Runner
        store={store}
        world={world}
        intensity={view.headlightIntensity * mood.lampFactor}
        angle={view.headlightAngle}
      />
      <Groomer store={store} world={world} intensity={view.headlightIntensity * mood.lampFactor} />
      <FollowCamera store={store} world={world} height={height} />
      {view.showPerf && <Perf position="bottom-left" />}
    </>
  )
}
