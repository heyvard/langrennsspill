# langrennspill

Tynt skall for et 3D-langrennsspill. En seedet, prosedyralt generert løypegraf
med navngitte steder og genererte skilt, traversert av to kjøretøy: skiløperen
(rytmebasert) og en løypemaskin som preparerer sporet den kjører på.

## Regler

- `src/sim/` er ren TypeScript og importerer **aldri** three eller react.
- Alle tunbare tall bor i `src/sim/constants.ts`. Ingen magiske tall ellers.
  Ny konstant = ny nøkkel i `Params`, `DEFAULTS`, `RANGES` **og** `PARAM_GROUPS`
  — mangler den i en gruppe, blir den `undefined` i runtime.
  Former den verdenen, skal den også inn i `WORLD_PARAM_KEYS`.
- Params **sendes inn** i sim-funksjonene. Aldri importert som global state.
- `src/render/` inneholder ingen spillogikk, bare tegning.
- `src/input/` oversetter tastatur og berøring til `InputEvent[]`. sim/ skal
  aldri vite hvilken enhet hendelsen kom fra. Bruk `pointerdown`, aldri `click`.
- Ingen fysikkmotor. Spør før du legger til nye avhengigheter.
- Fast timestep `FIXED_DT` (1/120) med akkumulator i `src/engine/useSimLoop.ts`,
  frikoblet fra render. Rendering interpolerer mellom `prev` og `curr`.
- Aldri NaN. Skiløperens `v` er alltid i `[0, MAX_SPEED]`; løypemaskinens `v`
  er fortegnsatt, i `[-GROOMER_MAX_SPEED * GROOMER_REVERSE_FACTOR, GROOMER_MAX_SPEED]`,
  dens sideveis posisjon `lat` er i `[-lateralLimit(p), lateralLimit(p)]`, og
  kursavviket `yaw` er i `[-GROOMER_MAX_YAW, GROOMER_MAX_YAW]`. Dekket av tester.

## Verdenen

- Verdenen er data. `generate(seed, params)` er ren og deterministisk — samme
  seed gir bitidentisk resultat. **Ingen `Math.random` i `sim/`**, bare `makeRng`.
- Kandidatkantene kommer fra en Delaunay-triangulering av POI-punktene. Den er
  planar, så kantene krysser ikke hverandre allerede før slingringen.
- En kant er en polyline definert som forskyvning vinkelrett på sin egen rette
  korde, klemt til under halve avstanden til nærmeste nabokorde. To kurver som
  hver holder seg innenfor halve avstanden til den andres korde kan ikke møtes
  — det er dét som gjør at ingen kanter krysser.
- `s` langs en kant er **vannrett** buelengde, målt fra `edge.from`. `dir`
  bestemmer bare fortegnet på tangent og stigning, så
  `theta = atan(edgeGradient(...))` alltid er positiv i motbakke.
- Stigning har én definisjon, i `gradientOfProfile` — sentraldifferanse over
  `DIFF_H` = 2 m. Generatoren måler med nøyaktig samme mål når den avgjør om en
  kant er brattere enn `MAX_GRADIENT`, ellers ville løftet vært tomt.
- Løyper planeres, de drapes ikke: høyden langs en kant glattes over
  `GRADE_WINDOW` meter, og endene låses til en nodehøyde alle kanter i noden
  deler. Serpentiner først, hardere planering som siste utvei — den siste
  konvergerer alltid, så `MAX_GRADIENT` er et løfte og ikke et ønske.
- `render/trailField.ts` skjærer terrenget inn mot løypehøyden. Uten det ligger
  den planerte traseen begravd der planeringen skar. Samme oppslag holder
  trærne ute av sporet.
- Skilt genereres fra grafen med Dijkstra, aldri skrevet for hånd.
- Grafen muteres kun gjennom `groomSpan()`. Alt annet i `world/` er lesing.
- `traversal.advance()` er den ene veien å flytte seg langs grafen. Begge
  kjøretøy bruker den. Default-valget i et kryss er minste retningsendring.
- Løypa har en bredde, `TRAIL_HALF_WIDTH` til hver side av midtlinja, og
  prepareringen er delt på tvers i `GROOM_LANE_COUNT` baner. `WorldEdge.groomedAt`
  er derfor et flatt rutenett — bane × bøtte, indeksert `lane * buckets + bucket`
  — ikke lenger én dimensjon. Bladet (`GROOMER_BLADE_WIDTH`) dekker bare noen av
  banene, så hele bredden krever flere passeringer. Skiløperen leser alltid
  midtbanen (`lat = 0`); hun har ingen sideveis posisjon.
- Løypemaskinens sideveis posisjon `lat` lagres i kantens eget rom — meter mot
  høyre for `from → to`, samme rom `edgeLateral(edge, s, 1)` og løypebåndet i
  `render/TrackRibbons.tsx` er definert i. Styringen selv regnes i den
  førerrelative `q = dir * lat`, fordi føreren opplever `lat` speilvendt når
  `dir === -1`. De to hendelsene som kan snu `dir` inne i `advance()` krever
  hver sin oppdatering: et kryss til en annen kant bevarer `q` (den nye kantens
  `from`/`to` er vilkårlig merket), en blindveisnuing bevarer den fysiske
  `lat` (maskinen snur på stedet, den flytter seg ikke sideveis av å snu). Se
  `vehicles/groomer.ts`.

## Balansen

`TAP_IMPULSE` og `K_DRAG` tunes sammen: impulsen setter hvor bratt det går an å
komme seg opp, luftmotstanden setter toppfarten på flata. Kravet er at takten
slår `G · (MAX_GRADIENT + MU_UNGROOMED)` — ellers finnes det bakker en løper
aldri kommer opp, og da er verdenen ødelagt.

Forskjellen på preparert og upreparert kommer mest fra `GRIP_UNGROOMED`, ikke
fra friksjonen: µ drukner i luftmotstand ved marsjfart, mens et fraspark som
glipper merkes overalt. Med innkjørte verdier gir det ~31 mot ~19 km/t.

## Kommandoer

    pnpm dev     pnpm test     pnpm world:check     pnpm build     pnpm lint

`world:check` kjører generatoren på 50 seeds og krever at hver verden er
sammenhengende, uten krysninger, uten kanter over `MAX_GRADIENT`, med minst én
sløyfe og alle POI-er nåbare fra stadion. Den ligger utenfor `pnpm test` fordi
den er treg og svarer på et annet spørsmål: ikke om koden gjør det den sier,
men om verdenene den lager er verdt å gå tur i.

## Utenfor scope nå

Karaktermodell, animasjon, lyd, meny, lagring, ferdige 3D-modeller,
postprocessing.
