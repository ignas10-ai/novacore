# tools/ – atpažinimo testavimas ant tikrų vaizdo įrašų

Žaidimo `step()` logika tikrinama ne tik sintetinėmis pozomis (`test-detect.cjs`), bet ir tikrais žmonių įrašais.

```
vaizdo įrašas (.mp4) ──extract.cjs──▶ fixtures/<vardas>.json ──replay.cjs──▶ kiek pakartojimų užskaitė step()
                                                               └─replay-check.cjs─▶ OK / nukrypimai (regresija)
```

## Komandos

| Komanda | Ką daro |
|---|---|
| `node tools/extract.cjs <video.mp4> <vardas> [--poses 2]` | Headless Chrome + MediaPipe Pose (tas pats modelis kaip žaidime) → `fixtures/<vardas>.json` (kas ~33 ms: 33 taškai × [x, y, visibility, z]). Reikia Chrome ir `puppeteer-core` (keliai `PUPPETEER_CORE` / `CHROME` env arba numatytieji faile). ~1–2 min 30 s įrašui. |
| `node tools/replay.cjs <fixture> [pratimas\|all] [--from s --to s]` | Praleidžia fixture per `step()`; spausdina pakartojimus, jų laikus, „nematomų" kadrų skaičių. `all` – visi 7 detektoriai (matosi kryžminiai klaidingi užskaitymai). |
| `node tools/replay-check.cjs` | Regresija: lentelė `CASES` su laukiamais skaičiais. Paleisti po kiekvieno `step()` / slenksčių keitimo. |

## Pilnas žaidimo prabėgimas be telefono (`playthrough.cjs`)

```
ffmpeg -i klipas.mp4 -vf "scale=640:360,fps=30" -pix_fmt yuv420p cam.y4m
node tools/playthrough.cjs cam.y4m              # portretas 390×844
node tools/playthrough.cjs cam.y4m --landscape  # 844×390
```

Chrome vietoj kameros paima `cam.y4m`, žaidimas pereina startas → paruošimas → 60 s → rezultatai → klipai, kadrai krenta į `_playthrough/`. Paruošimo vartui įraše turi būti ~4 s su abiem riešais virš nosies (rankos už galvos NEskaitosi) – galima priklijuoti tokį gabalą priekyje per `ffmpeg concat`. Taip 2026-10-23 rastos ir pataisytos 3 UI bėdos (žr. CHANGELOG).

## Kaip pridėti savo įrašą (komandos testas)

1. Nufilmuok telefonu **iš priekio**, telefonas ant grindų/stovo, visas kūnas kadre, 10 pakartojimų vieno pratimo (žr. `docs/TESTAVIMO-PROTOKOLAS.md`).
2. `node tools/extract.cjs ~/Downloads/pritupimai-ignas-2m.mp4 squat-ignas-2m`
3. `node tools/replay.cjs squat-ignas-2m squat` → palygink su tikru skaičiumi.
4. Jei sutampa ±1 – pridėk eilutę į `replay-check.cjs` `CASES`, commit'ink fixture (JSON ~1 MB) – ne vaizdo įrašą.

## Fixture'ai (2026-10-23, YouTube demonstracijos iš priekio)

| Fixture | Pratimas | Tikras skaičius | Pastaba |
|---|---|---|---|
| `squat` | pritūpimai | 3 | |
| `squat-side` | pritūpimai **iš šono** | 3 | viena koja nematoma → žaidimas neskaičiuoja (teisingai: kamera turi būti iš priekio) |
| `squatjump` | pritūpimai su šuoliuku | 9 | |
| `sidestep` | šoniniai žingsniai | ~16 išžengimų, 9 su pasislinkimu | |
| `knees` | aukšti keliai | ~25 (9–25 s) | |
| `lunge` | atvirkštiniai įtūpstai | 7 (3+3+1 languose) | įraše kameros pjūviai, naudoti `--from/--to` |
| `crunch` | įstriži atsilenkimai | 8 | |
| `oblique-sidebend` | šoninis atsilenkimas (KITAS pratimas) | – | neigiamas atvejis cross-crunch'ui |

## Ką išmokom (kodėl slenksčiai tokie)

- **2D kelio kampas iš priekio beveik nejuda** (180°→150° gilaus pritūpimo metu). MediaPipe `z` duoda 3D kampą, kuris svyruoja ~130°→60°. Todėl `ang3()` ir `KNEE_*` slenksčiai `index.html`.
- Pritūpimo gylis per klubų/pečių santykį iš priekio – triukšmo ribose (0,60 vs 0,58). Nenaudoti kaip varto.
- Įtūpste iš priekio kulkšnys būna 1,5–3,5 klubų pločio – siauros stovėsenos reikalauti negalima; skiria kelių aukščių skirtumas.
- Įstrižame atsilenkime alkūnė iš priekio lieka ~0,8 pečių pločio nuo kelio, bet nusileidžia iki kelio aukščio – tikrinti dy, ne dx.
