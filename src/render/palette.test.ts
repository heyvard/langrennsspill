import { describe, expect, it } from 'vitest'
import { DAY_HOUR, EVENING_HOUR, moodAt } from './palette'

/** Alle timene panelet kan stille inn, i sliderens eget steg. */
function everyHour(): number[] {
  const out: number[] = []
  for (let h = 8; h <= 23.0001; h += 0.1) out.push(h)
  return out
}

describe('moodAt', () => {
  it('slukker hodelykta i dagslys og tenner den i mørket', () => {
    expect(moodAt(DAY_HOUR).lampFactor).toBe(0)
    expect(moodAt(EVENING_HOUR).lampFactor).toBeGreaterThan(0.9)
    expect(moodAt(21).lampFactor).toBe(1)
  })

  it('har sterkest sol midt på dagen og ingen om natta', () => {
    expect(moodAt(DAY_HOUR).sunIntensity).toBeGreaterThan(moodAt(16).sunIntensity)
    expect(moodAt(16).sunIntensity).toBeGreaterThan(moodAt(19).sunIntensity)
    expect(moodAt(21).sunIntensity).toBe(0)
  })

  it('har tynnere dis om dagen enn om kvelden', () => {
    expect(moodAt(DAY_HOUR).fogScale).toBeLessThan(moodAt(EVENING_HOUR).fogScale)
  })

  it('senker sola mot vest utover dagen', () => {
    expect(moodAt(DAY_HOUR).sunPosition[1]).toBeGreaterThan(moodAt(18).sunPosition[1])
  })

  // Kvelden er allerede tunet. Dagsmodusen skal ikke ha flyttet på den.
  it('lar kveldsstemningen stå som før', () => {
    expect(moodAt(21).ambientIntensity).toBeCloseTo(0.17, 5)
    expect(moodAt(21).hemiIntensity).toBeCloseTo(0.18, 5)
    expect(moodAt(16).sunIntensity).toBeCloseTo(1.1 * (1 - moodAt16Falloff()), 2)
  })

  it('gir aldri NaN for noen time slideren kan stille inn', () => {
    for (const h of everyHour()) {
      const mood = moodAt(h)
      for (const n of [
        mood.fogScale,
        mood.ambientIntensity,
        mood.hemiIntensity,
        mood.sunIntensity,
        mood.lampFactor,
        ...mood.sunPosition,
      ]) {
        expect(Number.isFinite(n)).toBe(true)
      }
      for (const c of [mood.fog, mood.ambient, mood.skyColor, mood.groundColor, mood.sunColor]) {
        expect(Number.isFinite(c.r + c.g + c.b)).toBe(true)
      }
    }
  })
})

/** smoothstep(15, 19.5, 16) — falloffen sola hadde før dagsmodusen. */
function moodAt16Falloff(): number {
  const t = (16 - 15) / (19.5 - 15)
  return t * t * (3 - 2 * t)
}
