/**
 * Stedsnavn settes sammen av et forledd og et etterledd, deterministisk fra
 * seed. Etterleddet velges ikke fritt: det må passe til hva stedet er, så et
 * vann aldri heter «-kollen» og en topp aldri «-tjern». Kinden kommer fra
 * terrenget, så navnet forteller noe sant om kartet.
 */

import type { PoiKind } from './types'

const FORLEDD = [
  'Bjørn',
  'Blank',
  'Skjennung',
  'Gås',
  'Svart',
  'Store',
  'Lille',
  'Kobber',
  'Tryvann',
  'Sinober',
  'Hakloa',
  'Fugl',
  'Rams',
  'Ulve',
  'Brann',
]

/** Etterledd gruppert etter hva slags sted de kan beskrive. */
const ETTERLEDD: Record<PoiKind, string[]> = {
  vann: ['vann', 'tjern', 'putten', 'myra'],
  topp: ['kollen', 'haugen', 'åsen', 'brenna'],
  hytte: ['seter', 'stua', 'koia', 'hytta'],
  kryss: ['kollen', 'seter', 'brenna', 'stua'],
  stadion: ['seter', 'stua', 'vann'],
}

/**
 * Trekker et ubrukt navn for en kind. `taken` muteres, så gjentatte kall gir
 * aldri duplikater. Er alle kombinasjonene for kinden brukt opp, faller vi
 * tilbake til å gå gjennom hele tabellen i fast rekkefølge — det kan ikke
 * skje med de POI-antallene vi genererer, men det skal ikke låse seg.
 */
export function pickName(kind: PoiKind, rng: () => number, taken: Set<string>): string {
  const suffixes = ETTERLEDD[kind]
  const total = FORLEDD.length * suffixes.length
  const start = Math.floor(rng() * total) % total
  for (let i = 0; i < total; i++) {
    const k = (start + i) % total
    const name = FORLEDD[k % FORLEDD.length] + suffixes[Math.floor(k / FORLEDD.length)]
    if (!taken.has(name)) {
      taken.add(name)
      return name
    }
  }
  for (const forledd of FORLEDD) {
    for (const list of Object.values(ETTERLEDD)) {
      for (const suffix of list) {
        const name = forledd + suffix
        if (!taken.has(name)) {
          taken.add(name)
          return name
        }
      }
    }
  }
  throw new Error('tom for stedsnavn')
}
