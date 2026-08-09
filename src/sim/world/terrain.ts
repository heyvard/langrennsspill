/**
 * Høydefeltet. Én kilde for både simuleringen og terrengmesh-et, så bakken
 * løperen kjenner er nøyaktig den bakken du ser.
 *
 * Løftet ut av det gamle sporet uendret — kantene i grafen samples mot denne
 * ved generering, og render/ tegner den samme funksjonen som rutenett.
 */

import { createNoise2D } from 'simplex-noise'
import type { Params } from '../constants'
import { makeRng } from '../rng'

/** Antall støyoktaver i høydefeltet. */
const OCTAVES = 3
/** Amplitudefall per oktav. Lavt tall holder bakkene bestigelige. */
const PERSISTENCE = 0.4
/** Frekvensøkning per oktav. */
const LACUNARITY = 2

/** Egen strøm så høydefeltet ikke flytter seg når grafen endrer seg. */
const TERRAIN_SALT = 0x9e3779b9

export type HeightField = {
  heightAt(x: number, z: number): number
}

export function createHeightField(seed: number, p: Params): HeightField {
  const noise2D = createNoise2D(makeRng(seed ^ TERRAIN_SALT))

  function heightAt(x: number, z: number): number {
    let sum = 0
    let norm = 0
    let amp = 1
    let freq = p.TERRAIN_FREQUENCY
    for (let o = 0; o < OCTAVES; o++) {
      sum += amp * noise2D(x * freq, z * freq)
      norm += amp
      amp *= PERSISTENCE
      freq *= LACUNARITY
    }
    // Normalisert så utslaget holder seg innenfor ±TERRAIN_AMPLITUDE
    // uansett antall oktaver.
    return (sum / norm) * p.TERRAIN_AMPLITUDE
  }

  return { heightAt }
}
