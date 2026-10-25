# tools/ – atpažinimo testavimas ant tikrų vaizdo įrašų

Žaidimo `step()` logika (`src/detect/step.ts` – Node įrankiai ją importuoja tiesiogiai, reikia Node ≥ 22.18) tikrinama ne tik sintetinėmis pozomis (`test-detect.cjs`), bet ir tikrais žmonių įrašais.

```
vaizdo įrašas (.mp4) ──extract.cjs──▶ fixtures/<vardas>.json ──replay.cjs──▶ kiek pakartojimų užskaitė step()
                                                               ├─replay-check.cjs─▶ OK / nukrypimai (regresija)
                                                               └─accuracy.cjs─────▶ tikra vs step() vs k-NN, held-out
samples-spec.json (pažymėti laiko intervalai) ──samples.cjs──▶ ../public/pose-samples.json (žaidimo k-NN pavyzdinės pozos)
```

## Komandos

| Komanda | Ką daro |
|---|---|
| `node tools/extract.cjs <video.mp4> <vardas> [--poses 2] [--cpu] [--model full] [--out dir]` | Headless Chrome + MediaPipe Pose (tas pats modelis kaip žaidime) → `fixtures/<vardas>.json` (kas ~33 ms: 33 taškai × [x, y, visibility, z]). Reikia Chrome ir `puppeteer-core` (keliai `PUPPETEER_CORE` / `CHROME` env arba numatytieji faile). `--cpu` (XNNPACK) ~5× greičiau nei headless GPU (swiftshader); `squat` abiem būdais davė tuos pačius pakartojimus; `--model full` tik palyginimui. |
| `node tools/replay.cjs <fixture> [pratimas\|all] [--from s --to s]` | Praleidžia fixture per `step()`; spausdina pakartojimus, jų laikus, „nematomų" kadrų skaičių. `all` – visi 7 detektoriai (matosi kryžminiai klaidingi užskaitymai). |
| `node tools/replay-check.cjs` | Regresija: lentelė `CASES` su laukiamais skaičiais (kaip žaidime, su `pose-samples.json`). „ŽINOMA SPRAGA" eilutės fiksuoja dabartinį elgesį, tikras skaičius – 7-as laukas. Paleisti po kiekvieno `step()` / slenksčių / spec keitimo. |
| `node tools/accuracy.cjs [--dir d] [--only squat,lunge]` | Kiekvienam atvejui: tikras skaičius, ranka rašytas `step()`, k-NN klasifikatorius (iš `samples-spec.json`), ar atvejis held-out (nepersidengia su mokymo intervalais). Pagal tai sprendžiama, kuris skaitiklis gyvas. |
| `node tools/samples.cjs` | `samples-spec.json` → `../public/pose-samples.json` (tik `"live":true` pratimai). |

## Naujas pratimas = pavyzdinės pozos, ne slenksčiai

1. Nufilmuok 1–2 įrašus iš priekio, `extract.cjs` → fixture.
2. `samples-spec.json`: pratimui `count` klasės (pvz. `down`, arba `L`/`R`), `flip` (ar kairė = dešinė), nebūtinai `pairs` (kurios kūno poros svarbios; kojos+liemuo = `[0,5,6,7,8,11,12,15,16,20,22]`), ir `sets`: `{"fx":"…","down":[[nuo,iki]…],"up":[…]}`. Intervalus imk iš kadrų lapo (ffmpeg tile) ar `replay.cjs` laikų – tik aiškias fazes, be perėjimų. `no` = kito pratimo kadrai (neigiami pavyzdžiai, mažina kryžminius užskaitymus); `every` – kas kelintą kadrą imti.
3. Vieną įrašą (ar jo dalį) palik **ne** spec'e ir įrašyk į `replay-check.cjs` – tai held-out.
4. `node tools/accuracy.cjs` – jei k-NN geresnis už `step()`, `"live":true` → `node tools/samples.cjs` → `replay-check.cjs` laukiami skaičiai.

Intervalai 2026-10-25 parinkti iš signalų plato (3D kelio kampas, kelio pakilimas, kelių aukščių skirtumas) ir patikrinti kadrų lapuose; pereinamieji kadrai nežymėti.

## Pilnas žaidimo prabėgimas be telefono (`playthrough.cjs`)

```
ffmpeg -i klipas.mp4 -vf "scale=640:360,fps=30" -pix_fmt yuv420p cam.y4m
npm run build                                   # playthrough testuoja surinktą dist/
node tools/playthrough.cjs cam.y4m              # portretas 390×844
node tools/playthrough.cjs cam.y4m --landscape  # 844×390
node tools/playthrough.cjs cam.y4m --social     # + netikras Supabase ir iššūkio nuoroda → 05-end su palyginimu
node tools/playthrough.cjs cam.y4m --social --size 360x740 --out _playthrough/p360
node tools/playthrough.cjs cam.y4m --history          # + 3 netikri žaidimai istorijoje
```

Chrome vietoj kameros paima `cam.y4m`, žaidimas pereina startas → paruošimas → 60 s → rezultatai → klipai, kadrai krenta į `_playthrough/`. Paruošimo vartui įraše turi būti ~4 s su abiem riešais virš nosies (rankos už galvos NEskaitosi) – galima priklijuoti tokį gabalą priekyje per `ffmpeg concat`. Taip 2026-10-23 rastos ir pataisytos 3 UI bėdos (žr. CHANGELOG).

## Visi programėlės ekranai (`screens.cjs`)

```
npm run build
node tools/screens.cjs cam2sq.y4m --both --out ~/Downloads/NovaCore/app-v2   # portretas 390×844 + landscape 844×390
node tools/screens.cjs --no-game                                         # be kameros: iki nustatymų ekrano
```

Švarus naršyklės profilis → įvadas 1–3 → Pradžia (tuščia) → įdedama netikra istorija (9 žaidimai per 9 dienas) → Kompanijos (tuščia, sukurta, lentelė, sąrašas), Pradžia (su vieta ir iššūkiu), Pratimai, Profilis (+ ženkliukai, nustatymai), istorijos ir slapyvardžio lapai, nustatymai, „Didelis ekranas“ lapas (įjungtas kodas), pratimų lapas; su kameros failu – kraunama, pasiruošimas, žaidimas, rezultatai, klipai, Pradžia po žaidimo. Gale atidaromas antras langas su TV lenta: `tv-connect`, `tv-wait`, `tv-ready`, `tv-live`, `tv-live-solo`, `tv-done` (būsenos įterpiamos per BroadcastChannel, nes headless neturi Supabase sesijos). Supabase visada netikras (`mock-supabase.cjs`). Dviem žaidėjams reikia įrašo su dviem žmonėmis (`--players 1` – vienam). Kadrai sunumeruoti (`01-onboarding-1.png` …, landscape `…-landscape.png`) – peržiūrėti VISUS.

## Didelis ekranas (`cast-check.cjs`)

```
npm run build
node tools/cast-check.cjs
```

Atidaro telefono nustatymus, įjungia „Didelį ekraną“, perskaito kodą, atidaro antrą langą `#/ekranas/<kodas>` tame pačiame naršyklės kontekste ir tikrina: 6 simbolių kodą, telefone matomą „TV prijungtas“ (`hello`), TV gaunamą `idle`, taškų/laiko/pratimo/animacijos atvaizdavimą, laimėtojo būseną, kodo įvedimą TV lange ir išjungimą telefone. Tai BroadcastChannel kelias (be Supabase), todėl veikia ir be interneto; Realtime tarp įrenginių tikrinamas rankiniu telefonu + kompiuteriu. 24 teiginiai, `N/N OK`, exit 1 jei kas nors nepavyksta. Reikia Chrome ir `puppeteer-core` (kaip `screens.cjs`).

Kameros vaizdas (WebRTC, „Kamera per TV“) šiame įrankyje netikrinamas – reikia tikros kameros ir antro įrenginio; `cast-check.cjs` tikrina tik kodą/būsenas. Rankinis bandymas: telefone įjunk kamerą, TV spausk „Kamera“, žaisk 1 min; patikrink vaizdą, išjungimą iš abiejų pusių ir kad žaidimas/klipas nesulėtėtų.

Jei nori pamatyti tikrą žaidimą TV lentoje be telefono, suklijuok y4m, kurio pradžioje bent ~15 s abi rankos virš galvos (paruošimo vartams), tada įprastą klipe: `ffmpeg` → `cam.y4m`, tada `playthrough.cjs` su `--social` (žr. aukščiau) arba rankiniu `#/ekranas` langu. 12 s neužtenka, jei modelis kraunasi ilgiau.

PWA ikonos: `node tools/icons.cjs` (reikia interneto Inter šriftui). Lucide ikonos: `node tools/lucide-icons.cjs src/ui/icons.ts <visi vardai>`.

## Kaip pridėti savo įrašą (komandos testas)

1. Nufilmuok telefonu **iš priekio**, telefonas ant grindų/stovo, visas kūnas kadre, 10 pakartojimų vieno pratimo (žr. `docs/TESTAVIMO-PROTOKOLAS.md`).
2. `node tools/extract.cjs ~/Downloads/pritupimai-ignas-2m.mp4 squat-ignas-2m`
3. `node tools/replay.cjs squat-ignas-2m squat` → palygink su tikru skaičiumi.
4. Jei sutampa ±1 – pridėk eilutę į `replay-check.cjs` `CASES`, commit'ink fixture (JSON ~1 MB) – ne vaizdo įrašą.

## Fixture'ai (YouTube demonstracijos iš priekio; 2026-10-25 nauji – `--cpu`)

| Fixture | Pratimas | Tikras skaičius | Pastaba |
|---|---|---|---|
| `squat` | pritūpimai | 3 | |
| `squat-side` | pritūpimai **iš šono** | 3 | viena koja nematoma → žaidimas neskaičiuoja (teisingai: kamera turi būti iš priekio) |
| `squatjump` | pritūpimai su šuoliuku | 9 | |
| `sidestep` | šoniniai žingsniai | ~16 išžengimų, 9 su pasislinkimu | |
| `knees` | aukšti keliai | ~25 (9–25 s) | |
| `lunge` | atvirkštiniai įtūpstai | 7 (3+3+1 languose) | įraše kameros pjūviai, naudoti `--from/--to` |
| `crunch` | įstriži atsilenkimai | 8 | |
| `oblique-sidebend` | šoninis atsilenkimas (KITAS pratimas) | – | neigiamas atvejis cross-crunch'ui; 0–17 s naudojama kaip `no` pavyzdžiai |
| `squat2` | pritūpimai, kamera ~30° kampu | 3 | held-out |
| `squat3` | pritūpimai, kojas dalinai dengia kamuolys | 6 | held-out; `step()` 5 |
| `squat4` | pritūpimai, rankos į priekį | 4 | held-out (YT qtwh-kxcWmE) |
| `squatjump3` | šuoliukai iš gilaus pritūpimo be atsistojimo tarp jų | 6 | apkirpta 0–17,4 s; v3 `step()` 0, v4 6 (pėdos nuo grindų) |
| `knees2` | žemesni greiti pakėlimai su pašokimu | 24 | v3 `step()` 7, v4 25 (kelių tarpusavio aukštis), k-NN 3 (YT DfjpR6dzLVg) |
| `knees3` | bėgimas vietoje | 16 | YT VGb_fJ81yWc |
| `crunch2`–`crunch4` | įstriži atsilenkimai, 3 kiti žmonės | 8 / 10 / 5 | held-out |
| `lunge5` | atvirkštiniai įtūpstai, kitas žmogus | 3 | held-out (YT riVwQa0N-SU) |
| `jack2`–`jack6` | pašokimai (jumping jacks), 5 skirtingi žmonės iš priekio | 4+3 / 11 / 3+3 / 6 / 11 | 2026-10-25 detect-v4, apkirpta iki vaizdo iš priekio (YT uLVt6u15L98, wdzPdljVpr0, CWpmIW6l-YA, c4DAnQ6DtF8, nGaXj3kkmrU); `step()` 41/41, nederinta |
| `sidestep2` | „lateral squat walk", kamera seka žmogų | 12 | YT bQoc10-MHlE 1,5–20,6 s; pėdos ne visada susiglaudžia – pagal jį derintas `SS_CLOSE` |
| `sidestep3` | lėti šoniniai žingsniai su pritūpimu | 11 | YT g78CxAtjkCE, tik dešinysis žmogus (2 žmonės kadre); held-out |
| `squatjump5` | šuoliukai, kitas žmogus, šiek tiek kampu | 6 + 3 | Leap Fitness txLE-jOCEsc 13,5–21,4 ir 23,5–27,1 s; held-out (v3 – 0) |
| `sidestep-squat` | išžengimas + pritūpimas + atgal (KITAS pratimas) | 0 | YT Ap5Xjp9lRd8 8,5–24,5 s; neigiamas atvejis šoniniams žingsniams |

## Lite vs full modelis (2026-10-25)

Visi klipai perekstraktuoti su `pose_landmarker_full` (`--cpu`). Rezultatas nevienareikšmis: `step()` atsilenkimai 8/8 (lite 7), `knees2` 9 (lite 7), bet daugiau klaidingų pritūpimų (atsilenkimuose 4 vs 1, šoninis vaizdas 2 vs 0), k-NN pritūpimai `squat2` 1/3 (lite 3/3). Greitis headless CPU – panašus (33–71 vs 30–47 ms/kadrą, triukšmingas matavimas), parsisiuntimas 9,4 MB vs 5,8 MB. Liekame prie **lite** (`POSE_MODEL` `src/camera/camera.ts`).

## Ką išmokom (kodėl slenksčiai tokie)

- **2D kelio kampas iš priekio beveik nejuda** (180°→150° gilaus pritūpimo metu). MediaPipe `z` duoda 3D kampą, kuris svyruoja ~130°→60°. Todėl `ang3()` ir `KNEE_*` slenksčiai `src/detect/step.ts`.
- Pritūpimo gylis per klubų/pečių santykį iš priekio – triukšmo ribose (0,60 vs 0,58). Nenaudoti kaip varto.
- Įtūpste iš priekio kulkšnys būna 1,5–3,5 klubų pločio – siauros stovėsenos reikalauti negalima; skiria kelių aukščių skirtumas.
- Įstrižame atsilenkime alkūnė iš priekio lieka ~0,8 pečių pločio nuo kelio, bet nusileidžia iki kelio aukščio – tikrinti dy, ne dx.
- Ranka rašytas pritūpimų `step()` skaičiuoja BET KOKĮ kelių sulenkimą: atsilenkimuose 5–9, įtūpstuose 3–12 „pritūpimų". k-NN su kojų+liemens embedding'u ir `no` pavyzdžiais – 0, o tikrus pritūpimus skaičiuoja taip pat tiksliai.
- k-NN embedding'as nepriklauso nuo padėties kadre, todėl šuolio (`squatjump`) ir pasislinkimo į šoną (`sidestep`) jis nemato – ten lieka `step()`.

## Internetinė dalis prieš tikrą Supabase (`social-check.mjs`)

`node tools/social-check.mjs` – 2 anoniminiai vartotojai, profiliai, kompanija, prisijungimas kodu, žaidimai, savaitės lentelė, iššūkis ir RLS (B nemato A žaidimų ir svetimos kompanijos, negali įrašyti žaidimo A vardu, keisti A profilio ar trinti A kompanijos). Išeitis 2 = serveris neparuoštas (nepaleista `001_init.sql` arba išjungtas anoniminis prisijungimas). Testinė kompanija ištrinama, 2 anoniminiai vartotojai ir jų žaidimai lieka (Authentication → Users – galima ištrinti ranka).
