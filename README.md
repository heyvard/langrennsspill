# langrennspill

Grå kapsel som glir langs et seedet spor gjennom granskog, drevet av rytmiske
vekselvise tapp. Vite + React + TypeScript + three/R3F, ingen fysikkmotor.

    pnpm install
    pnpm dev

Piltast venstre/høyre på desktop, venstre/høyre skjermhalvdel på mobil.
All tuning ligger i leva-panelet oppe til høyre; HUD-en kan skjules derfra.

Spillet starter i dagslys. `modus` under Stemning bytter mellom **Dag** (sol,
grønn skog, ingen hodelykt) og **Kveld** (mørkt, tett tåke, hodelykt) — begge er
bare snarveier til `timeOfDay`-slideren, som går fra kl. 8 til 23.

Arkitektur og regler: se [CLAUDE.md](./CLAUDE.md).
