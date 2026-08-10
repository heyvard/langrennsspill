/**
 * De to joystickene for løypemaskinen: venstre styrer kamera, høyre styrer
 * kjøring. Bare synlige/aktive i løypemaskin-modus (styrt av CSS via
 * `data-mode` på `<html>`, skrevet av `useModeAttribute`), men alltid montert
 * — også på desktop, så de kan dras med mus.
 */

import { Joystick } from './Joystick'
import type { InputSource } from './useInput'

export function Sticks({ source, deadzone }: { source: InputSource; deadzone: number }) {
  return (
    <div className="sticks">
      <Joystick
        className="stick-left"
        label="Kameravinkel"
        deadzone={deadzone}
        onChange={(x, y) => {
          source.setAxis('lookX', x)
          source.setAxis('lookY', y)
        }}
      />
      <Joystick
        className="stick-right"
        label="Kjøring"
        deadzone={deadzone}
        onChange={(x, y) => {
          source.setAxis('driveX', x)
          source.setAxis('driveY', y)
        }}
      />
    </div>
  )
}
