/**
 * Løypene: en norsk løypeprofil på tvers — to par klassiskspor, ett par ute
 * mot hver løypekant, med skøytefeltet liggende mellom dem. Ett bånd per kant
 * i grafen, og bare de kantene som er inne.
 *
 * Feltet er ikke ett stykke — det er delt i GROOM_LANE_COUNT baner på tvers,
 * samme baner løypemaskinen preparerer én om gangen. Grensa mellom to baner
 * er hard: hver bane får sin egen fargede stripe, ikke en jevn overgang, så
 * det synes akkurat hvor et pass sluttet og et annet begynte.
 *
 * Tverrsnittet er én sammenhengende strip uten hull. Det er dét som gjør at
 * upreparert løype er blank snø: skisporene finnes som kolonner hele tiden,
 * men de ligger i flukt med resten og har samme farge helt til noen har kjørt
 * der. Et spor er ikke geometri som dukker opp, det er en renne som synker.
 *
 * Båndet er altså ikke statisk. Prepareringen leses ut av rutenettet og
 * skrives inn i geometrien: upreparert er flatt, ujevnt og matt, preparert
 * har sporene senket som trikkeskinner og cordfløyel på tvers, og ferskt
 * preparert er tydelig lysere enn alt annet. Det er den eneste
 * tilbakemeldingen spilleren får på at løypemaskinen gjorde noe.
 *
 * Høyden oppdateres uten å regne normaler på nytt — `flatShading` utleder dem
 * i fragmentshaderen, så geometrien kan bevege seg gratis.
 */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color } from 'three'
import { sampleTime, type SimStore } from '../engine/simStore'
import type { Params } from '../sim/constants'
import {
  bucketIndex,
  edgeLateral,
  edgePoint,
  freshnessOfCell,
  halfWidth,
  laneCount,
  laneIndex,
  laneWidth,
} from '../sim/world/geometry'
import { edgeOf, type WorldEdge, type World } from '../sim/world/types'
import { GROOVE, LANE, LANE_FRESH, UNGROOMED } from './palette'

/** Avstand fra midten av et sporpar ut til hvert av parets to skispor, meter. */
const GAUGE = 0.42
/** Bredden på toppåpningen av ett skispor, meter. */
const RAIL_WIDTH = 0.16
/** Bredden på den flate bunnen i skisporet — skisålen er flat. */
const RAIL_FLOOR_WIDTH = 0.11
/**
 * Hvor dypt skisporet presses ned i ferskt preparert spor, meter. Dypt nok,
 * og med bratt nok vegg, til å lese som en renne i snøen og ikke som en
 * skygge — et spor skal se ut som noe man kan sette skien ned i.
 */
const RAIL_DEPTH = 0.07
/**
 * Hvor høyt båndet legges over løypehøyden, meter. Målt fra sporbunnen og
 * ikke fra snøflata: er løftet mindre enn `RAIL_DEPTH`, ligger bunnen av
 * renna under bakken, og terrenget spiser sporet i flekker. Marginen på toppen
 * dekker at bakken bare treffer løypehøyden så nøyaktig som `trailField`
 * sampler den.
 */
const LIFT = RAIL_DEPTH + 0.05
/** Snøstripe mellom ytterste skispor og feltet utenfor, meter. */
const RAIL_GAP = 0.12
/**
 * Hvor sporparene ligger, som andel av halv løypebredde. Klassiskspora ligger
 * ute mot kantene i en ekte løype, med skøytefeltet i midten — men aldri så
 * langt ut at et par går utenfor løypa eller inn i det andre.
 */
const PAIR_FRACTION = 0.62
/** Meter mellom tverrsnitt. Cordfløyelen må lese som et mønster. */
const SEGMENT = 1.0
/** Rifleamplitude i ferskt preparert felt. */
const RIDGE_HEIGHT = 0.02
/**
 * Ujevnheten i upreparert snø, meter. Holdt lav og lavfrekvent med vilje:
 * blir den stor og skifter fortegn for hvert tverrsnitt, leser løypa som
 * løse plater i stedet for en sammenhengende trasé.
 */
const ROUGH_HEIGHT = 0.022
/** Hvor mange tverrsnitt én ujevnhet strekker seg over. */
const ROUGH_WAVELENGTH = 5

/** Hvor ofte prepareringen leses av på nytt. Den forfaller over minutter. */
const UPDATE_HZ = 8

/** 0 = flat snø (sporkant, ryggen mellom sporene), 1 = sporbunn, 2 = felt. */
type ColumnKind = 0 | 1 | 2

/**
 * Tverrsnittet, bygget fra Params i stedet for hardkodet: sideveis avstand
 * per kolonne, hvilken art kolonnen er, hvilken bane den leser preparering
 * fra, og hvilke nabopar som skal trianguleres.
 */
type CrossSection = {
  offsets: Float64Array
  kind: ColumnKind[]
  lane: Int32Array
  /** Strip-indekser som skal trianguleres. Resten er null-brede baneskjøter. */
  bridges: number[]
}

/**
 * Én kolonne under bygging. `joinPrev` er falsk bare i baneskjøtene, der to
 * kolonner ligger oppå hverandre for å gi en hard fargegrense — å trianguler
 * mellom dem ville gitt et null-bredt bånd og ingenting annet.
 */
type Column = { offset: number; kind: ColumnKind; lane: number; joinPrev: boolean }

/** Halv bredde på et sporpar, ytterste skispor pluss snøkanten utenfor. */
function pairSpan(): number {
  return GAUGE + RAIL_WIDTH / 2 + RAIL_GAP
}

/** Avstanden fra midtlinja ut til hvert av de to sporparene, meter. */
function pairOffset(p: Params): number {
  const half = halfWidth(p)
  const span = pairSpan()
  // Nedre grense først: et par som ikke får plass mot kanten skal heller
  // stikke litt utenfor enn å gli inn i paret på andre siden av midten.
  return Math.max(span, Math.min(half * PAIR_FRACTION, half - span))
}

/** Alle banegrenser fra -halvbredde til +halvbredde, strengt stigende. */
function laneBoundaries(p: Params): number[] {
  const half = halfWidth(p)
  const n = laneCount(p)
  const w = laneWidth(p)
  const out: number[] = []
  for (let k = 0; k <= n; k++) out.push(-half + k * w)
  return out
}

/**
 * Flatt felt fra `from` til `to`, delt opp ved hver banegrense innimellom.
 * Hvert segment får sine egne kolonner i begge ender, farget likt, så grensa
 * mot naboen blir skarp i stedet for å smøres — akkurat slik et enkelt
 * maskinpass ser ut mot et upreparert nabofelt.
 */
function pushField(cols: Column[], p: Params, from: number, to: number): void {
  if (to - from < 1e-6) return
  const inside = laneBoundaries(p).filter((b) => b > from + 1e-6 && b < to - 1e-6)
  const cuts = [from, ...inside, to]
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]
    const b = cuts[i + 1]
    const lane = laneIndex((a + b) / 2, p)
    // Første kolonne i første segment kobles til det som lå foran (sporet
    // eller ingenting); de øvrige er baneskjøter og skal stå fritt.
    cols.push({ offset: a, kind: 2, lane, joinPrev: i === 0 })
    cols.push({ offset: b, kind: 2, lane, joinPrev: true })
  }
}

/**
 * Ett par klassiskspor om `centre`. Alle åtte kolonnene leser samme bane, den
 * `centre` ligger i: et par er én ting, og et halvt preparert spor der den ene
 * rennen finnes og den andre ikke ville lest som en feil, ikke som et pass.
 */
function pushRails(cols: Column[], p: Params, centre: number): void {
  const lane = laneIndex(centre, p)
  for (const side of [-1, 1] as const) {
    const c = centre + side * GAUGE
    const offsets = [
      c - RAIL_WIDTH / 2,
      c - RAIL_FLOOR_WIDTH / 2,
      c + RAIL_FLOOR_WIDTH / 2,
      c + RAIL_WIDTH / 2,
    ]
    const kinds: ColumnKind[] = [0, 1, 1, 0]
    for (let i = 0; i < offsets.length; i++) {
      cols.push({ offset: offsets[i], kind: kinds[i], lane, joinPrev: true })
    }
  }
}

function buildCrossSection(p: Params): CrossSection {
  const half = halfWidth(p)
  const span = pairSpan()
  const pair = pairOffset(p)

  const cols: Column[] = []
  pushField(cols, p, -half, -pair - span)
  pushRails(cols, p, -pair)
  // Skøytefeltet: alt mellom de to sporparene, bredest av feltene.
  pushField(cols, p, -pair + span, pair - span)
  pushRails(cols, p, pair)
  pushField(cols, p, pair + span, half)

  // Ytterkolonnene treffer ±halvbredde nøyaktig fordi feltene bygges fra dem
  // og ikke fra banegrensene — avrunding i grensene kan ikke lekke ut i kanten.

  // Strippen er sammenhengende: alt trianguleres unntatt baneskjøtene.
  const bridges: number[] = []
  for (let i = 0; i < cols.length - 1; i++) {
    if (cols[i + 1].joinPrev) bridges.push(i)
  }

  return {
    offsets: new Float64Array(cols.map((c) => c.offset)),
    kind: cols.map((c) => c.kind),
    lane: new Int32Array(cols.map((c) => c.lane)),
    bridges,
  }
}

/** Deterministisk verdi i [-1, 1] fra et heltall. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * Ujevnhet som varierer over flere meter, ikke fra tverrsnitt til tverrsnitt.
 * Interpolerer mellom to hashverdier så snøen bølger i stedet for å flimre.
 */
function jitter(i: number): number {
  const t = i / ROUGH_WAVELENGTH
  const a = Math.floor(t)
  const f = t - a
  // Smoothstep mellom nabopunktene gir en myk, men fortsatt tilfeldig, flate.
  return hash(a) + (hash(a + 1) - hash(a)) * (f * f * (3 - 2 * f))
}

type Ribbon = {
  geometry: BufferGeometry
  sections: number
  cross: CrossSection
  /** Løypehøyde pluss LIFT, per tverrsnitt. Grunnlinja høydene regnes fra. */
  baseY: Float32Array
  /** Prepareringsbøtta hvert tverrsnitt hører til. */
  bucket: Int32Array
}

function buildRibbon(edge: WorldEdge, p: Params): Ribbon {
  const cross = buildCrossSection(p)
  const cols = cross.offsets.length
  const n = Math.max(8, Math.round(edge.length / SEGMENT))
  const count = (n + 1) * cols

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const baseY = new Float32Array(n + 1)
  const bucket = new Int32Array(n + 1)

  for (let i = 0; i <= n; i++) {
    const s = (i / n) * edge.length
    const centre = edgePoint(edge, s)
    const lat = edgeLateral(edge, s, 1)
    bucket[i] = bucketIndex(edge, s, p)
    // Vannrett på tvers, ikke drapert over terrenget under. Løypa er planert i
    // hele sin bredde, og `trailField` har allerede dratt bakken opp i
    // løypehøyde like langt ut som båndet rekker: et bånd som beholdt
    // terrengets sidefall ville dermed stukket opp av bakken i den ene
    // ytterkanten og ligget begravd i den andre — nettopp der sporene ligger.
    baseY[i] = centre.y + LIFT
    for (let col = 0; col < cols; col++) {
      const off = cross.offsets[col]
      const v = i * cols + col
      positions[v * 3] = centre.x + lat.x * off
      positions[v * 3 + 2] = centre.z + lat.z * off
    }
  }

  const indices = new Uint32Array(n * cross.bridges.length * 6)
  let k = 0
  for (let i = 0; i < n; i++) {
    for (const col of cross.bridges) {
      const a = i * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      // Vindingen må gi normaler oppover: lateral × tangent peker opp,
      // motsatt rekkefølge ville lagt flaten med ansiktet ned i bakken.
      indices[k++] = a
      indices[k++] = b
      indices[k++] = c
      indices[k++] = b
      indices[k++] = d
      indices[k++] = c
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))

  return { geometry, sections: n, cross, baseY, bucket }
}

const railColour = new Color()
const laneColour = new Color()

/** Skriver preparering inn i høyder og farger. Ingen normaler å regne om. */
function refresh(ribbon: Ribbon, edge: WorldEdge, now: number, p: Params): void {
  const { cross } = ribbon
  const cols = cross.offsets.length
  const position = ribbon.geometry.getAttribute('position') as BufferAttribute
  const colour = ribbon.geometry.getAttribute('color') as BufferAttribute
  const pos = position.array as Float32Array
  const col = colour.array as Float32Array

  for (let i = 0; i <= ribbon.sections; i++) {
    const bucket = ribbon.bucket[i]
    const ridge = (i % 2 === 0 ? 1 : -1) * RIDGE_HEIGHT
    const rough = jitter(i) * ROUGH_HEIGHT

    for (let c = 0; c < cols; c++) {
      const v = i * cols + c
      const kind = cross.kind[c]
      const f = freshnessOfCell(edge, cross.lane[c] * edge.buckets + bucket, now, p)

      // Snøflata slik den ligger før noen har rørt den: ujevn, og ujevn på
      // tvers av hele tverrsnittet på én gang. Ryddes bort etter hvert som
      // prepareringen tar over — det er dét som gjør upreparert løype til én
      // sammenhengende flate uten antydning til hvor sporene kommer.
      const flat = ribbon.baseY[i] + rough * (1 - f)

      pos[v * 3 + 1] =
        kind === 1
          ? // Sporbunnen. Renna finnes ikke før noen har satt den, og den
            // synker ned fra flata i takt med at sporet blir satt.
            flat - RAIL_DEPTH * f
          : kind === 2
            ? flat + ridge * f
            : flat

      const c3 = v * 3
      if (kind === 1) {
        railColour.copy(UNGROOMED).lerp(GROOVE, f)
        col[c3] = railColour.r
        col[c3 + 1] = railColour.g
        col[c3 + 2] = railColour.b
      } else {
        // Sporkantene er samme snø som feltet rundt — det er bare bunnen av
        // renna som er en annen farge.
        laneColour.copy(UNGROOMED).lerp(LANE, Math.min(f * 2, 1)).lerp(LANE_FRESH, f)
        col[c3] = laneColour.r
        col[c3 + 1] = laneColour.g
        col[c3 + 2] = laneColour.b
      }
    }
  }

  position.needsUpdate = true
  colour.needsUpdate = true
  ribbon.geometry.computeBoundingSphere()
}

function EdgeRibbon({
  edge,
  store,
  paramsRef,
}: {
  edge: WorldEdge
  store: SimStore
  paramsRef: { current: Params }
}) {
  const ribbon = useMemo(
    () => buildRibbon(edge, paramsRef.current),
    // paramsRef er en ref — den utløser bevisst ingen ombygging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edge],
  )

  useEffect(() => {
    refresh(ribbon, edge, 0, paramsRef.current)
    return () => ribbon.geometry.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ribbon, edge])

  const nextUpdate = useRef(0)
  useFrame(() => {
    const now = sampleTime(store)
    if (now < nextUpdate.current) return
    nextUpdate.current = now + 1 / UPDATE_HZ
    refresh(ribbon, edge, now, paramsRef.current)
  })

  return (
    <mesh geometry={ribbon.geometry}>
      <meshStandardMaterial
        vertexColors
        flatShading
        roughness={0.9}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  )
}

export function TrackRibbons({
  edgeIds,
  world,
  store,
  paramsRef,
}: {
  edgeIds: string[]
  world: World
  store: SimStore
  paramsRef: { current: Params }
}) {
  return (
    <>
      {edgeIds.map((id) => (
        <EdgeRibbon key={id} edge={edgeOf(world, id)} store={store} paramsRef={paramsRef} />
      ))}
    </>
  )
}
