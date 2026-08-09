# langrennspill

En seedet, prosedyralt generert løypegraf gjennom granskog — navngitte steder,
skilt som faktisk stemmer, og kryss du kan velge i. Vite + React + TypeScript +
three/R3F, ingen fysikkmotor.

    pnpm install
    pnpm dev

## Slik spiller du

**Skiløper.** Tapp vekselvis venstre og høyre i takt: piltast venstre/høyre på
desktop, venstre/høyre skjermhalvdel på mobil. Tapper du raskere enn rytmen
tåler, faller farten.

**Kryss.** Gjør du ingenting, fortsetter du rett fram. Sveip til siden, eller
trykk `A`/`D`, når du er nærmere krysset enn `JUNCTION_PREVIEW_DISTANCE` — så
tas svingen når du ankommer. Blindveier snur deg automatisk.

**Løypemaskin.** `M` bytter kjøretøy. Hold inne én side for gass, begge for
revers. Alt den kjører over blir preparert, og ferskt spor er merkbart raskere
å gå i — omtrent 31 mot 19 km/t. Fordelen visner over `GROOM_DECAY_TIME`.

Minikartet nede til høyre viser hele grafen, hvem som er preparert, og hvor du
er. All tuning ligger i leva-panelet oppe til høyre; HUD og minikart kan skjules
derfra.

Spillet starter i dagslys. `modus` under Stemning bytter mellom **Dag** (sol,
grønn skog, ingen hodelykt) og **Kveld** (mørkt, tett tåke, hodelykt) — begge er
bare snarveier til `timeOfDay`-slideren, som går fra kl. 8 til 23. Dra `seed`
for en ny verden.

## Kommandoer

    pnpm dev     pnpm test     pnpm world:check     pnpm build     pnpm lint

Arkitektur og regler: se [CLAUDE.md](./CLAUDE.md).
