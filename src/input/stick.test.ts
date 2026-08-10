import { describe, expect, it } from 'vitest'
import { createAxis2, knobOffset, stickAxes } from './stick'

describe('stickAxes', () => {
  it('gir nøyaktig null innenfor dødsonen', () => {
    const out = stickAxes(5, 5, 100, 0.2, createAxis2())
    expect(out.x).toBe(0)
    expect(out.y).toBe(0)
  })

  it('gir fullt utslag når fingeren når kanten', () => {
    const out = stickAxes(100, 0, 100, 0.2, createAxis2())
    expect(out.x).toBeCloseTo(1, 6)
    expect(out.y).toBeCloseTo(0, 6)
  })

  it('klemmer sirkulært — diagonalt maksutslag gir ikke lengde over 1', () => {
    const out = stickAxes(1000, 1000, 100, 0.2, createAxis2())
    expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('y er positiv oppover, motsatt skjermens piksel-y', () => {
    const up = stickAxes(0, -100, 100, 0, createAxis2())
    const down = stickAxes(0, 100, 100, 0, createAxis2())
    expect(up.y).toBeGreaterThan(0)
    expect(down.y).toBeLessThan(0)
  })

  it('skalerer kontinuerlig fra dødsonekanten, ikke med et hopp', () => {
    const deadzone = 0.3
    const justInside = stickAxes(29, 0, 100, deadzone, createAxis2())
    const justOutside = stickAxes(31, 0, 100, deadzone, createAxis2())
    expect(justInside.x).toBe(0)
    expect(justOutside.x).toBeGreaterThan(0)
    expect(justOutside.x).toBeLessThan(0.05)
  })

  it('gir aldri NaN, selv ved travel = 0', () => {
    const out = stickAxes(10, 10, 0, 0.1, createAxis2())
    expect(Number.isFinite(out.x)).toBe(true)
    expect(Number.isFinite(out.y)).toBe(true)
  })

  it('gir nøyaktig null uten forskyvning', () => {
    const out = stickAxes(0, 0, 100, 0, createAxis2())
    expect(out.x).toBe(0)
    expect(out.y).toBe(0)
  })
})

describe('knobOffset', () => {
  it('følger fingeren innenfor radien', () => {
    const out = knobOffset(20, -10, 100, createAxis2())
    expect(out.x).toBe(20)
    expect(out.y).toBe(-10)
  })

  it('klemmes til radien når fingeren går utenfor', () => {
    const out = knobOffset(300, 400, 100, createAxis2())
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(100, 6)
  })

  it('gir aldri NaN, selv ved travel = 0', () => {
    const out = knobOffset(10, 10, 0, createAxis2())
    expect(Number.isFinite(out.x)).toBe(true)
    expect(Number.isFinite(out.y)).toBe(true)
  })
})
