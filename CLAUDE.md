# langrennspill

Tynt skall for et 3D-langrennsspill. Løperen følger sporet automatisk; eneste
handling er å tappe vekselvis venstre og høyre side i takt.

## Regler

- `src/sim/` er ren TypeScript og importerer **aldri** three eller react.
- Alle tunbare tall bor i `src/sim/constants.ts`. Ingen magiske tall ellers.
  Ny konstant = ny nøkkel i `Params`, `RANGES` og `PARAM_GROUPS` — da får den
  leva-slider automatisk.
- Params **sendes inn** i sim-funksjonene. Aldri importert som global state.
- `src/render/` inneholder ingen spillogikk, bare tegning.
- `src/input/` oversetter tastatur og berøring til `Tap[]`. sim/ skal aldri
  vite hvilken enhet tappet kom fra. Bruk `pointerdown`, aldri `click`.
- Ingen fysikkmotor. Spør før du legger til nye avhengigheter.
- Fast timestep `FIXED_DT` (1/120) med akkumulator i `src/engine/useSimLoop.ts`,
  frikoblet fra render. Rendering interpolerer mellom `prev` og `curr`.
- Aldri NaN, og `v` alltid i `[0, MAX_SPEED]`. Dekket av tester.
- `theta = atan(gradientAt(s))`, så positiv theta er motbakke og
  gravitasjonsleddet er `-G * sin(theta)`.
- Utenfor scope nå: karaktermodell, animasjon, lyd, meny, postprocessing.

## Kommandoer

    pnpm dev     pnpm test     pnpm build     pnpm lint
