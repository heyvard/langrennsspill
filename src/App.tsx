import { Canvas } from '@react-three/fiber'
import { Leva } from 'leva'
import { useMemo, useRef } from 'react'
import { createSimStore } from './engine/simStore'
import { TouchZones } from './input/TouchZones'
import { useTaps } from './input/useTaps'
import { Scene } from './render/Scene'
import { createTrack } from './sim/track'
import { Hud } from './ui/Hud'
import { useTuning } from './ui/useTuning'

export default function App() {
  const source = useTaps()
  const { params, view } = useTuning()

  // Simuleringen leser parametrene fra en ref, så sliderne slår inn med
  // en gang uten å re-rendre scenen.
  const paramsRef = useRef(params)
  paramsRef.current = params

  const store = useMemo(() => createSimStore(), [])

  // Sporet bygges bare på nytt når noe som faktisk former det endrer seg.
  const track = useMemo(
    () => createTrack(view.seed, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      view.seed,
      params.LOOP_LENGTH,
      params.TRACK_WOBBLE,
      params.TERRAIN_AMPLITUDE,
      params.TERRAIN_FREQUENCY,
    ],
  )

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 62, near: 0.1, far: 400 }}
      >
        <Scene store={store} track={track} paramsRef={paramsRef} source={source} view={view} />
      </Canvas>

      <TouchZones source={source} />
      <Hud store={store} track={track} paramsRef={paramsRef} visible={view.showHud} />
      <Leva collapsed titleBar={{ title: 'tuning' }} />
    </>
  )
}
