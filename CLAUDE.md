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
  trærne ute av sporet. Oppslaget er nærmeste-punkt, så `SAMPLE_SPACING` er
  også hvor grovt bakken trappes langs løypa — trinnet er halve avstanden
  ganger stigningen, og blir det større enn løftet i `TrackRibbons`, stikker
  terrenget opp gjennom løypebåndet i flekker.
- Løypebåndet er vannrett på tvers, i løypehøyde pluss `LIFT`, ikke drapert
  over terrenget: bakken er alt dratt opp i løypehøyde i hele bredden, så et
  bånd med sidefall ville ligget begravd i den ene ytterkanten. `LIFT` måles
  fra sporbunnen og må derfor være større enn `RAIL_DEPTH`.
- Tverrsnittet er én sammenhengende strip: to par klassiskspor ute mot hver
  kant, skøytefelt mellom. Sporene er kolonner som alltid finnes, men som
  ligger i flukt med flata og har samme farge til noen har kjørt der — det er
  dét som gjør upreparert løype til blank snø. Begge kolonnene i et par leser
  samme bane, så et par settes helt eller ikke i det hele tatt.
- Skilt genereres fra grafen med Dijkstra, aldri skrevet for hånd.
- Grafen muteres kun gjennom `groomSpan()`. Alt annet i `world/` er lesing.
- `traversal.advance()` er den ene veien å flytte seg langs grafen. Begge
  kjøretøy bruker den. Default-valget i et kryss er minste retningsendring.
- Løypa har en bredde, `TRAIL_HALF_WIDTH` til hver side av midtlinja, og
  prepareringen er delt på tvers i `GROOM_LANE_COUNT` baner. `WorldEdge.groomedAt`
  er derfor et flatt rutenett — bane × bøtte, indeksert `lane * buckets + bucket`
  — ikke lenger én dimensjon. Bladet (`GROOMER_BLADE_WIDTH`) dekker bare noen av
  banene, så hele bredden krever flere passeringer. En bøtte stemples hel så
  snart maskinen er inne i den, så `GROOM_BUCKET_LENGTH` er også hvor langt
  foran bladet sporet kan rekke å dukke opp. Skiløperen leser alltid
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

## GLB-modeller

- Meshy AI-eksport er rå og altfor tung til sanntid: 4096²-teksturer og et
  sammenhengende, ikke-retopologisert mesh på hundretusenvis av trekanter.
  Kjør alltid gjennom `gltf-transform` (`weld` → `simplify` med
  `MeshoptSimplifier` → `textureCompress` per teksturslot → `meshopt`-
  komprimering) som et engangsskritt før filen havner i `public/models/` —
  aldri som permanent avhengighet i `package.json`, bare `npx`/en scratch-mappe.
- Bruk meshopt, ikke Draco, for geometrikomprimering. Draco-dekoderen i
  `useGLTF` hentes fra en ekstern CDN (`gstatic.com`) med mindre man peker den
  et annet sted; meshopt-dekoderen er allerede bundlet i `three-stdlib`/`drei`
  og krever ingen nettverkstilgang.
- Meshy setter `emissiveFactor=[1,1,1]`, som gjør modellen uønsket selvlysende.
  Nullstill den i optimaliseringsskriptet, ikke i runtime-koden.
- Bounding box-sentrering **må** regnes ut fra det rå GLTF-scene-objektet
  (`useMemo` nøkla på `scene`) før det henger under en gruppe som allerede
  poseres av simuleringen. `Box3.setFromObject` leser verdensrom-transformer;
  kjøres utregningen etter at objektet er hengt under en gruppe med en ekte
  posisjon (typisk fordi Suspense løser seint, etter at posen alt har rukket
  å bli satt), blir offset forurenset av den posisjonen og modellen kastes
  langt utenfor synsfeltet. Se `render/Groomer.tsx`.
- Asset-stier bygges med `import.meta.env.BASE_URL`, aldri hardkodet `/` —
  GitHub Pages-bygget serveres fra `/langrennsspill/`, lokal dev fra `/`.

## Kommandoer

    pnpm dev     pnpm test     pnpm world:check     pnpm build     pnpm lint
    pnpm screenshot

`world:check` kjører generatoren på 50 seeds og krever at hver verden er
sammenhengende, uten krysninger, uten kanter over `MAX_GRADIENT`, med minst én
sløyfe og alle POI-er nåbare fra stadion. Den ligger utenfor `pnpm test` fordi
den er treg og svarer på et annet spørsmål: ikke om koden gjør det den sier,
men om verdenene den lager er verdt å gå tur i.

`pnpm screenshot` (`scripts/screenshot.mjs`) booter vite og tar et headless
skjermbilde av `<canvas>` med Playwright/Chromium (WebGL via SwiftShader).
Laget for økter uten tilkoblet nettleser — f.eks. Claude Code-sesjoner i
eksterne sandboxer — der `render/`-endringer ellers ikke kan verifiseres
visuelt. `--build` kjører mot prod-bygget i stedet for dev-serveren,
`--out <path>` styrer hvor filen havner (default `.claude/screenshots/`,
gitignored). Krever at Chromium-binæren er hentet én gang med
`npx playwright install chromium` — trenger nettverkstilgang i sandboxen
første gang.

## Utenfor scope nå

Karaktermodell, animasjon, lyd, meny, lagring, postprocessing. Unntaket er
løypemaskinens karosseri: én optimalisert GLB (`public/models/groomer.glb`,
se `render/Groomer.tsx`) — resten av spillverdenen er fortsatt prosedyral.
