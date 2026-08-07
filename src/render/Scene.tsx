/**
 * Alt som lever inne i Canvas. Ingen spillogikk her — scenen leser
 * simuleringens tilstand og sporet, og tegner det.
 */

import { Perf } from 'r3f-perf'
import { useSimLoop } from '../engine/useSimLoop'
import type { SimStore } from '../engine/simStore'
import type { TapSource } from '../input/useTaps'
import type { Params } from '../sim/constants'
import type { Track } from '../sim/track'
import type { View } from '../ui/useTuning'
import { Atmosphere } from './Atmosphere'
import { FollowCamera } from './FollowCamera'
import { Forest } from './Forest'
import { Runner } from './Runner'
import { Terrain } from './Terrain'
import { TrackRibbon } from './TrackRibbon'

export function Scene({
  store,
  track,
  paramsRef,
  source,
  view,
}: {
  store: SimStore
  track: Track
  paramsRef: { current: Params }
  source: TapSource
  view: View
}) {
  useSimLoop(store, track, paramsRef, source)

  return (
    <>
      <Atmosphere timeOfDay={view.timeOfDay} fogDensity={view.fogDensity} />
      <Terrain track={track} />
      <TrackRibbon track={track} />
      <Forest track={track} seed={view.seed} />
      <Runner
        store={store}
        track={track}
        intensity={view.headlightIntensity}
        angle={view.headlightAngle}
      />
      <FollowCamera store={store} track={track} />
      {view.showPerf && <Perf position="bottom-left" />}
    </>
  )
}
