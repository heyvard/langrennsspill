/**
 * Leva-panelet. Hver konstant i Params blir en slider — schemaet bygges
 * mekanisk fra RANGES, så en ny konstant kan ikke legges til uten å dukke
 * opp her.
 */

import { folder, useControls } from 'leva'
import { DAY_HOUR, EVENING_HOUR } from '../render/palette'
import { DEFAULTS, DEFAULT_SEED, PARAM_GROUPS, RANGES, type Params } from '../sim/constants'

/** Alt som bare angår stemning og debug, ikke simuleringen. */
export type View = {
  seed: number
  fogDensity: number
  headlightIntensity: number
  headlightAngle: number
  /** Klokkeslett. 12 er dag, 15 sen ettermiddag, 22 er natt. */
  timeOfDay: number
  showHud: boolean
  showPerf: boolean
}

/** Bygges én gang — leva krever et stabilt schema. */
const PARAM_SCHEMA = Object.fromEntries(
  PARAM_GROUPS.map((group) => [
    group.label,
    folder(
      Object.fromEntries(
        group.keys.map((key) => [key, { value: DEFAULTS[key], ...RANGES[key] }]),
      ),
      { collapsed: true },
    ),
  ]),
)

export function useTuning(): { params: Params; view: View } {
  const paramValues = useControls(PARAM_SCHEMA) as Record<keyof Params, number>

  // Funksjonsformen gir en set-funksjon, som modus-bryteren trenger for å
  // skrive til timeOfDay. Slideren er fortsatt sannheten — bryteren er bare
  // en snarvei til to klokkeslett.
  const [viewValues, setView] = useControls(() => ({
    Stemning: folder(
      {
        modus: {
          value: 'dag',
          options: { Dag: 'dag', Kveld: 'kveld' },
          onChange: (v: string, _path: string, ctx: { initial: boolean }) => {
            if (ctx.initial) return
            setView({ timeOfDay: v === 'dag' ? DAY_HOUR : EVENING_HOUR })
          },
        },
        seed: { value: DEFAULT_SEED, min: 0, max: 99999, step: 1 },
        fogDensity: { value: 0.028, min: 0, max: 0.15, step: 0.001 },
        headlightIntensity: { value: 90, min: 0, max: 400, step: 1 },
        headlightAngle: { value: 0.42, min: 0.05, max: 1.4, step: 0.01 },
        timeOfDay: { value: DAY_HOUR, min: 8, max: 23, step: 0.1 },
      },
      { collapsed: false },
    ),
    Debug: folder(
      {
        showHud: { value: true, label: 'HUD' },
        showPerf: { value: false, label: 'r3f-perf' },
      },
      { collapsed: false },
    ),
  }))

  const view = viewValues as unknown as View

  // Plukk ut Params i den formen sim/ vil ha den.
  const params = {} as Params
  for (const group of PARAM_GROUPS) {
    for (const key of group.keys) params[key] = paramValues[key]
  }

  return { params, view }
}
