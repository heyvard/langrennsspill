/**
 * Alle tunbare tall bor her. Ingen magiske tall andre steder i sim/.
 *
 * `Params` sendes inn i sim-funksjonene — den importeres aldri som en global.
 * Det holder simuleringen ren og lar testene variere konstanter fritt.
 *
 * RANGES er ikke pynt: leva-panelet genereres mekanisk fra det, så en ny
 * konstant kan ikke legges til uten å få slider. Typen håndhever det.
 */

export type Params = {
  // --- Fysikk ---
  /** Tyngdeakselerasjon, m/s². */
  G: number
  /** Luftmotstand, akselerasjon per (m/s)². */
  K_DRAG: number
  /** Hard klamring av farten oppover, m/s. */
  MAX_SPEED: number
  /** Fast timestep i sekunder. Determinisme gjelder per valgt dt. */
  FIXED_DT: number

  // --- Takt ---
  /** Ønsket tid mellom tapp ved stillstand, sekunder. */
  BASE_INTERVAL: number
  /** Hvor mye intervallet krymper per m/s fart. */
  INTERVAL_SPEED_FACTOR: number
  /** Gulv for intervallet. Hindrer at spillet degenererer til rå mashing. */
  MIN_INTERVAL: number
  /** Tak for intervallet. */
  MAX_INTERVAL: number
  /** Bomming utover dette gir quality 0, sekunder. */
  TIMING_WINDOW: number
  /** Fartsøkning i m/s for et perfekt tapp. */
  TAP_IMPULSE: number
  /** Faktor når tappet ikke veksler side. */
  WRONG_SIDE_PENALTY: number
  /** Utforhelling der løperen begynner å huke seg ned, radianer. */
  TUCK_THRESHOLD: number
  /** Hvor mange radianer brattere til tapping er helt uvirksomt. */
  TUCK_RANGE: number

  // --- Verden ---
  /** Halv bredde på området POI-ene sås i, meter. 2000 gir ca 4x4 km. */
  WORLD_EXTENT: number
  /** Ønsket antall POI-noder. Poisson-disk gir litt færre om det blir trangt. */
  POI_COUNT: number
  /** Minste avstand mellom to POI-er, meter. */
  POI_MIN_DISTANCE: number
  /** Ekstra kanter utover spenntreet, som andel av treets kanter. Gir sløyfer. */
  EXTRA_EDGE_RATIO: number
  /** Korteste biten en lang kant deles opp i, meter. */
  SPLIT_MIN_LENGTH: number
  /** Lengste kantbit før den må deles med en kryssnode, meter. */
  SPLIT_MAX_LENGTH: number
  /** Sideveis slingring som andel av kantens lengde. 0 = rett strek. */
  WIGGLE_AMPLITUDE: number
  /** Hvor mange meter omvei én meter høydeforskjell er verdt i spenntreet. */
  CLIMB_WEIGHT: number
  /** Brattest tillatte stigning, dy/ds. Serpentiner legges til til den holder. */
  MAX_GRADIENT: number
  /** Over denne maksstigningen er kanten 'middels'. */
  DIFFICULTY_MEDIUM_GRADIENT: number
  /** Over denne maksstigningen er kanten 'krevende'. */
  DIFFICULTY_HARD_GRADIENT: number
  /** Høydeutslag i terrenget, meter. Høyt gir ubestigelige vegger. */
  TERRAIN_AMPLITUDE: number
  /** Grunnfrekvens i terrengstøyen, 1/meter. Høyt gir kortere bakker. */
  TERRAIN_FREQUENCY: number
  /**
   * Halv løypebredde, meter. Løypa er symmetrisk om midtlinja, og skisporene
   * ligger i midten — skiløperen renderes fra midtlinja og har ingen
   * sideveis posisjon.
   */
  TRAIL_HALF_WIDTH: number

  // --- Preparering ---
  /** Lengden på én prepareringsbøtte, meter. Oppløsningen på halvpreparerte kanter. */
  GROOM_BUCKET_LENGTH: number
  /**
   * Antall baner på tvers av løypa. Oppløsningen på halvpreparerte bredder.
   * Tvinges opp til nærmeste oddetall, så det finnes en midtbane som dekker
   * skisporene — ellers kunne ett spor blitt preparert og det andre ikke.
   */
  GROOM_LANE_COUNT: number
  /** Friksjon i ferskt preparert spor. */
  MU_GROOMED: number
  /** Friksjon i upreparert snø. */
  MU_UNGROOMED: number
  /** Hvor lenge prepareringen holder seg, sekunder. */
  GROOM_DECAY_TIME: number
  /**
   * Hvor mye av frasparket som blir igjen i upreparert snø, 0–1.
   * I et ferskt spor står skia stille under kicken; i løssnø glipper den.
   * Dette er den fysiske grunnen til at preparering betyr noe i langrenn,
   * og det som gjør forskjellen tydelig — friksjon alene drukner i luftmotstand.
   */
  GRIP_UNGROOMED: number

  // --- Løypemaskin ---
  /** Toppfart for løypemaskinen, m/s. Den har ikke hastverk. */
  GROOMER_MAX_SPEED: number
  /** Motorkraft som akselerasjon, m/s². Må slå G*sin(MAX_GRADIENT). */
  GROOMER_POWER: number
  /** Retardasjon når den holder igjen utfor, m/s². */
  GROOMER_BRAKE: number
  /** Reversfart som andel av toppfarten. */
  GROOMER_REVERSE_FACTOR: number
  /** Bredden bladet preparerer, meter. Setter hvor mange pass en løype tar. */
  GROOMER_BLADE_WIDTH: number
  /** Største kursavvik fra løypas tangent, radianer. Fullt rattutslag. */
  GROOMER_MAX_YAW: number
  /** Hvor fort rattet dreier mot ønsket utslag, radianer per sekund. */
  GROOMER_STEER_RATE: number

  // --- Navigasjon ---
  /** Hvor nær krysset man må være for at et sveip skal telle, meter. */
  JUNCTION_PREVIEW_DISTANCE: number
  /** Hvor mange piksler pekeren må flytte seg for at det er et sveip. */
  SWIPE_THRESHOLD_PX: number
  /** Hvor stor del av joystickens utslag som regnes som null. */
  JOYSTICK_DEADZONE: number
  /** Hvor mange steder det er plass til på ett skilt. */
  SIGN_ENTRY_COUNT: number
  /** Steder lenger unna enn dette kommer ikke på skiltet, meter. */
  SIGN_MAX_DISTANCE: number
}

/**
 * Innkjørte verdier. Med disse gir perfekt takt i ferskt spor ~31 km/t i snitt
 * over en generert verden, mot ~19 km/t i upreparert snø — nesten 60 % forskjell,
 * og det er hele koblingen mellom de to modusene. Slurvete takt gir omtrent
 * ingenting. MAX_SPEED nås aldri i praksis — den er en sikkerhetsklamme.
 */
export const DEFAULTS: Params = {
  G: 9.81,
  // Luftmotstanden setter toppfarten på flata; TAP_IMPULSE setter hvor bratt
  // det går an å komme seg opp. De to må tunes sammen.
  K_DRAG: 0.049,
  MAX_SPEED: 25,
  FIXED_DT: 1 / 120,

  BASE_INTERVAL: 0.6,
  INTERVAL_SPEED_FACTOR: 0.02,
  MIN_INTERVAL: 0.32,
  MAX_INTERVAL: 0.9,
  TIMING_WINDOW: 0.22,
  // Må være stor nok til at takten slår G·MAX_GRADIENT i upreparert snø,
  // ellers finnes det bakker en løper aldri kommer opp.
  TAP_IMPULSE: 2.3,
  WRONG_SIDE_PENALTY: 0.35,
  TUCK_THRESHOLD: 0.03,
  TUCK_RANGE: 0.035,

  WORLD_EXTENT: 2000,
  POI_COUNT: 11,
  POI_MIN_DISTANCE: 400,
  EXTRA_EDGE_RATIO: 0.28,
  SPLIT_MIN_LENGTH: 300,
  SPLIT_MAX_LENGTH: 600,
  WIGGLE_AMPLITUDE: 0.08,
  CLIMB_WEIGHT: 12,
  MAX_GRADIENT: 0.14,
  // Terskler lagt der den faktiske fordelingen ligger, så alle tre
  // merkelappene faktisk blir brukt. Se rapporten i world.check.
  DIFFICULTY_MEDIUM_GRADIENT: 0.085,
  DIFFICULTY_HARD_GRADIENT: 0.115,
  // Med 5.5 lander løypenes maksstigning på p50 0.094 og p90 0.124. Høyere
  // amplitude gir bakker generatoren ikke klarer å svinge seg unna, og da må
  // den planere dem bort i stedet — flatere løyper i kupert terreng.
  TERRAIN_AMPLITUDE: 5.5,
  TERRAIN_FREQUENCY: 0.0045,
  // Seks meter bred: nøyaktig to bladbredder, så løypa krever to pass og
  // maskinen har en meter og en halv å styre på til hver side.
  TRAIL_HALF_WIDTH: 3,

  GROOM_BUCKET_LENGTH: 10,
  // Oddetall, så midtbanen dekker skisporene. Sju baner à ~0.86 m.
  GROOM_LANE_COUNT: 7,
  MU_GROOMED: 0.02,
  MU_UNGROOMED: 0.075,
  GROOM_DECAY_TIME: 600,
  GRIP_UNGROOMED: 0.62,

  GROOMER_MAX_SPEED: 6,
  GROOMER_POWER: 4,
  GROOMER_BRAKE: 6,
  GROOMER_REVERSE_FACTOR: 0.5,
  GROOMER_BLADE_WIDTH: 3,
  // En halv radian er ~29°. Nok til å krysse løypa på et titalls meter uten
  // at maskinen ser ut til å kjøre sidelengs.
  GROOMER_MAX_YAW: 0.5,
  GROOMER_STEER_RATE: 1.6,

  JUNCTION_PREVIEW_DISTANCE: 60,
  SWIPE_THRESHOLD_PX: 40,
  // Nok til at en tommel som hviler i sentrum ikke gir gass, lite nok til at
  // et lite utslag fortsatt er et lite utslag.
  JOYSTICK_DEADZONE: 0.12,
  SIGN_ENTRY_COUNT: 3,
  SIGN_MAX_DISTANCE: 6000,
}

export type Range = { min: number; max: number; step: number }

export const RANGES: Record<keyof Params, Range> = {
  G: { min: 0, max: 20, step: 0.01 },
  K_DRAG: { min: 0, max: 0.15, step: 0.0005 },
  MAX_SPEED: { min: 1, max: 60, step: 0.5 },
  FIXED_DT: { min: 1 / 240, max: 1 / 30, step: 1 / 960 },

  BASE_INTERVAL: { min: 0.2, max: 1.5, step: 0.005 },
  INTERVAL_SPEED_FACTOR: { min: 0, max: 0.08, step: 0.0005 },
  MIN_INTERVAL: { min: 0.1, max: 1, step: 0.005 },
  MAX_INTERVAL: { min: 0.2, max: 2, step: 0.005 },
  TIMING_WINDOW: { min: 0.02, max: 0.6, step: 0.005 },
  TAP_IMPULSE: { min: 0, max: 6, step: 0.01 },
  WRONG_SIDE_PENALTY: { min: 0, max: 1, step: 0.01 },
  TUCK_THRESHOLD: { min: 0, max: 0.4, step: 0.001 },
  TUCK_RANGE: { min: 0.005, max: 0.4, step: 0.001 },

  WORLD_EXTENT: { min: 500, max: 4000, step: 50 },
  POI_COUNT: { min: 8, max: 14, step: 1 },
  POI_MIN_DISTANCE: { min: 200, max: 900, step: 10 },
  EXTRA_EDGE_RATIO: { min: 0, max: 0.6, step: 0.01 },
  SPLIT_MIN_LENGTH: { min: 100, max: 800, step: 10 },
  SPLIT_MAX_LENGTH: { min: 200, max: 1500, step: 10 },
  WIGGLE_AMPLITUDE: { min: 0, max: 0.3, step: 0.005 },
  CLIMB_WEIGHT: { min: 0, max: 60, step: 0.5 },
  MAX_GRADIENT: { min: 0.04, max: 0.5, step: 0.005 },
  DIFFICULTY_MEDIUM_GRADIENT: { min: 0.01, max: 0.3, step: 0.005 },
  DIFFICULTY_HARD_GRADIENT: { min: 0.02, max: 0.5, step: 0.005 },
  TERRAIN_AMPLITUDE: { min: 0, max: 40, step: 0.1 },
  TERRAIN_FREQUENCY: { min: 0.0005, max: 0.02, step: 0.0001 },
  TRAIL_HALF_WIDTH: { min: 1.5, max: 6, step: 0.1 },

  GROOM_BUCKET_LENGTH: { min: 2, max: 50, step: 1 },
  GROOM_LANE_COUNT: { min: 1, max: 15, step: 2 },
  MU_GROOMED: { min: 0, max: 0.2, step: 0.001 },
  MU_UNGROOMED: { min: 0, max: 0.3, step: 0.001 },
  GROOM_DECAY_TIME: { min: 10, max: 3600, step: 10 },
  GRIP_UNGROOMED: { min: 0.1, max: 1, step: 0.01 },

  GROOMER_MAX_SPEED: { min: 1, max: 15, step: 0.1 },
  GROOMER_POWER: { min: 0.5, max: 20, step: 0.1 },
  GROOMER_BRAKE: { min: 0.5, max: 30, step: 0.1 },
  GROOMER_REVERSE_FACTOR: { min: 0.1, max: 1, step: 0.05 },
  GROOMER_BLADE_WIDTH: { min: 1, max: 6, step: 0.1 },
  GROOMER_MAX_YAW: { min: 0.05, max: 1.2, step: 0.01 },
  GROOMER_STEER_RATE: { min: 0.2, max: 8, step: 0.1 },

  JUNCTION_PREVIEW_DISTANCE: { min: 10, max: 300, step: 5 },
  SWIPE_THRESHOLD_PX: { min: 10, max: 200, step: 1 },
  JOYSTICK_DEADZONE: { min: 0, max: 0.5, step: 0.01 },
  SIGN_ENTRY_COUNT: { min: 1, max: 5, step: 1 },
  SIGN_MAX_DISTANCE: { min: 500, max: 20000, step: 100 },
}

/** Rekkefølgen sliderne skal stå i, gruppert som de tunes. */
export const PARAM_GROUPS: { label: string; keys: (keyof Params)[] }[] = [
  { label: 'Fysikk', keys: ['G', 'K_DRAG', 'MAX_SPEED', 'FIXED_DT'] },
  {
    label: 'Takt',
    keys: [
      'BASE_INTERVAL',
      'INTERVAL_SPEED_FACTOR',
      'MIN_INTERVAL',
      'MAX_INTERVAL',
      'TIMING_WINDOW',
      'TAP_IMPULSE',
      'WRONG_SIDE_PENALTY',
      'TUCK_THRESHOLD',
      'TUCK_RANGE',
    ],
  },
  {
    label: 'Verden',
    keys: [
      'WORLD_EXTENT',
      'POI_COUNT',
      'POI_MIN_DISTANCE',
      'EXTRA_EDGE_RATIO',
      'SPLIT_MIN_LENGTH',
      'SPLIT_MAX_LENGTH',
      'WIGGLE_AMPLITUDE',
      'CLIMB_WEIGHT',
      'MAX_GRADIENT',
      'DIFFICULTY_MEDIUM_GRADIENT',
      'DIFFICULTY_HARD_GRADIENT',
      'TERRAIN_AMPLITUDE',
      'TERRAIN_FREQUENCY',
      'TRAIL_HALF_WIDTH',
    ],
  },
  {
    label: 'Preparering',
    keys: [
      'GROOM_BUCKET_LENGTH',
      'GROOM_LANE_COUNT',
      'MU_GROOMED',
      'MU_UNGROOMED',
      'GROOM_DECAY_TIME',
      'GRIP_UNGROOMED',
    ],
  },
  {
    label: 'Løypemaskin',
    keys: [
      'GROOMER_MAX_SPEED',
      'GROOMER_POWER',
      'GROOMER_BRAKE',
      'GROOMER_REVERSE_FACTOR',
      'GROOMER_BLADE_WIDTH',
      'GROOMER_MAX_YAW',
      'GROOMER_STEER_RATE',
    ],
  },
  {
    label: 'Navigasjon',
    keys: [
      'JUNCTION_PREVIEW_DISTANCE',
      'SWIPE_THRESHOLD_PX',
      'JOYSTICK_DEADZONE',
      'SIGN_ENTRY_COUNT',
      'SIGN_MAX_DISTANCE',
    ],
  },
]

/**
 * Parametrene som former verdenen. Endres én av dem må grafen genereres på
 * nytt — de andre slår inn umiddelbart uten å bygge om noe.
 */
export const WORLD_PARAM_KEYS = [
  'WORLD_EXTENT',
  'POI_COUNT',
  'POI_MIN_DISTANCE',
  'EXTRA_EDGE_RATIO',
  'SPLIT_MIN_LENGTH',
  'SPLIT_MAX_LENGTH',
  'WIGGLE_AMPLITUDE',
  'CLIMB_WEIGHT',
  'MAX_GRADIENT',
  'DIFFICULTY_MEDIUM_GRADIENT',
  'DIFFICULTY_HARD_GRADIENT',
  'TERRAIN_AMPLITUDE',
  'TERRAIN_FREQUENCY',
  'TRAIL_HALF_WIDTH',
  // Bøttene og banene er selve rutenettet groomedAt allokeres i.
  'GROOM_BUCKET_LENGTH',
  'GROOM_LANE_COUNT',
] as const satisfies readonly (keyof Params)[]

/** Standard seed. Rendering og sim må alltid bruke samme. */
export const DEFAULT_SEED = 1337
