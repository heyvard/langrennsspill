/**
 * Én virtuell joystick: en ring med en knott som følger tommelen.
 *
 * Knotten flyttes ved å skrive `transform` rett til DOM i pekerhendelsen, ikke
 * gjennom React-state — samme grunn som Hud.tsx og ModeSwitch.tsx skriver rett
 * til DOM: dette skjer for ofte til at en rerender per bevegelse er verdt det.
 *
 * Utslagsradien måles fra elementene selv, så størrelsen finnes bare ett sted,
 * i CSS-en. Sentrum er ringens midtpunkt og ikke der fingeren landet: knotten
 * skal hoppe til tommelen med en gang, slik at man ser hvor stikka står.
 *
 * `stopPropagation` er ikke valgfritt — under stikka ligger tappflaten, og et
 * drag på stikka skal verken telle som tapp eller sveip.
 */

import { useRef } from 'react'
import { createAxis2, knobOffset, stickAxes } from './stick'

export function Joystick({
  className,
  deadzone,
  label,
  onChange,
}: {
  className: string
  deadzone: number
  label: string
  /** Utslaget nå, i `[-1, 1]` per akse. `y` er positiv oppover. */
  onChange: (x: number, y: number) => void
}) {
  const knob = useRef<HTMLDivElement>(null)
  const active = useRef<number | null>(null)
  const center = useRef({ x: 0, y: 0, travel: 0 })
  const axes = useRef(createAxis2())
  const offset = useRef(createAxis2())

  function moveKnob(x: number, y: number) {
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (active.current !== null) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    active.current = e.pointerId

    const ring = e.currentTarget.getBoundingClientRect()
    const dot = knob.current?.getBoundingClientRect()
    center.current = {
      x: ring.left + ring.width / 2,
      y: ring.top + ring.height / 2,
      // Knotten skal bli inne i ringen, så radien er ringens minus knottens.
      travel: Math.max((ring.width - (dot?.width ?? 0)) / 2, 0),
    }
    handle(e.clientX, e.clientY)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (active.current !== e.pointerId) return
    e.stopPropagation()
    handle(e.clientX, e.clientY)
  }

  function handle(clientX: number, clientY: number) {
    const { x, y, travel } = center.current
    const dx = clientX - x
    const dy = clientY - y
    const knobAt = knobOffset(dx, dy, travel, offset.current)
    moveKnob(knobAt.x, knobAt.y)
    const level = stickAxes(dx, dy, travel, deadzone, axes.current)
    onChange(level.x, level.y)
  }

  function release(e: React.PointerEvent<HTMLDivElement>) {
    if (active.current !== e.pointerId) return
    e.stopPropagation()
    active.current = null
    moveKnob(0, 0)
    onChange(0, 0)
  }

  return (
    <div
      className={`stick ${className}`}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="stick-knob" ref={knob} />
    </div>
  )
}
