import { Canvas } from '@react-three/fiber'
import { Leva } from 'leva'
import { useMemo, useRef } from 'react'
import { createSimStore } from './engine/simStore'
import { TouchZones } from './input/TouchZones'
import { useInput } from './input/useInput'
import { plantForest } from './render/planting'
import { Scene } from './render/Scene'
import { buildTrailField } from './render/trailField'
import { WORLD_PARAM_KEYS } from './sim/constants'
import { generate } from './sim/world/generate'
import { generateSigns } from './sim/world/signs'
import { createHeightField } from './sim/world/terrain'
import { Hud } from './ui/Hud'
import { Minimap } from './ui/Minimap'
import { ModeButton } from './ui/ModeButton'
import { useTuning } from './ui/useTuning'

export default function App() {
  const source = useInput()
  const { params, view } = useTuning()

  // Simuleringen leser parametrene fra en ref, så sliderne slår inn med
  // en gang uten å re-rendre scenen.
  const paramsRef = useRef(params)
  paramsRef.current = params

  // Verdenen bygges bare på nytt når noe som faktisk former den endrer seg.
  // Nøkkelen er en streng, ellers ville useMemo fått et nytt array hver render.
  const worldKey = `${view.seed}|${WORLD_PARAM_KEYS.map((k) => params[k]).join(',')}`
  const bundle = useMemo(() => {
    const world = generate(view.seed, paramsRef.current)
    const height = createHeightField(view.seed, paramsRef.current)
    const trails = buildTrailField(world, paramsRef.current)
    return {
      world,
      height,
      trails,
      signs: generateSigns(world, paramsRef.current),
      forest: plantForest(world, height, trails, view.seed),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldKey])

  // Ny verden betyr nye kant-ID-er, så simuleringen må starte på nytt med den.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => createSimStore(bundle.world), [bundle])

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 62, near: 0.1, far: 500 }}
      >
        {/* Nøkkelen står her og ikke på Canvas: en ny verden skal bygge
            scenen på nytt, ikke rive ned WebGL-konteksten. */}
        <Scene
          key={worldKey}
          store={store}
          world={bundle.world}
          height={bundle.height}
          forest={bundle.forest}
          trails={bundle.trails}
          signs={bundle.signs}
          paramsRef={paramsRef}
          source={source}
          view={view}
        />
      </Canvas>

      <TouchZones source={source} swipeThreshold={params.SWIPE_THRESHOLD_PX} store={store} />
      <ModeButton source={source} store={store} />
      <Hud store={store} world={bundle.world} paramsRef={paramsRef} visible={view.showHud} />
      <Minimap
        store={store}
        world={bundle.world}
        paramsRef={paramsRef}
        visible={view.showMinimap}
      />
      {/* Tuning-panelet er et utviklerverktøy — det skal ikke følge med i produksjonsbygget. */}
      <Leva collapsed titleBar={{ title: 'tuning' }} hidden={!import.meta.env.DEV} />
    </>
  )
}
