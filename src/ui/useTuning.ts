/**
 * Leva-panelet. Hver konstant i Params blir en slider — schemaet bygges
 * mekanisk fra RANGES, så en ny konstant kan ikke legges til uten å dukke
 * opp her.
 */

import { folder, useControls } from 'leva'
import { DEFAULTS, DEFAULT_SEED, PARAM_GROUPS, RANGES, type Params } from '../sim/constants'

/** Alt som bare angår stemning og debug, ikke simuleringen. */
export type View = {
  seed: number
  fogDensity: number
  headlightIntensity: number
  headlightAngle: number
  /** Klokkeslett. 15 er sen ettermiddag, 22 er natt. */
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

const VIEW_SCHEMA = {
  Stemning: folder(
    {
      seed: { value: DEFAULT_SEED, min: 0, max: 99999, step: 1 },
      fogDensity: { value: 0.028, min: 0, max: 0.15, step: 0.001 },
      headlightIntensity: { value: 90, min: 0, max: 400, step: 1 },
      headlightAngle: { value: 0.42, min: 0.05, max: 1.4, step: 0.01 },
      timeOfDay: { value: 18.5, min: 14, max: 23, step: 0.1 },
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
}

export function useTuning(): { params: Params; view: View } {
  const paramValues = useControls(PARAM_SCHEMA) as Record<keyof Params, number>
  const view = useControls(VIEW_SCHEMA) as View

  // Plukk ut Params i den formen sim/ vil ha den.
  const params = {} as Params
  for (const group of PARAM_GROUPS) {
    for (const key of group.keys) params[key] = paramValues[key]
  }

  return { params, view }
}
