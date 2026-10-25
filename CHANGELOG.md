# Pakeitimų žurnalas

## 2026-10-25 — ui-v3: 3D personažų diegimas, 1 dalis (šaka `ui-v3`, į master NEsujungta)

- **Sujungta su master:** Android programėlė (Capacitor) ir klipų strigimo pataisymas dabar ir `ui-v3` šakoje, konfliktų nebuvo. `npm test`, `npm run build`, `nav-check` 14/14 – OK.
- **Pradžia:** „ŽAISTI“ visada matosi visas – personažai stovi po žodžiu (jų aukštis = kortelė minus žodžio juosta), ne ant jo. Landscape – mažesnis žodis, kad Ž paukščiukas nenukirstų.
- **Vienoda tipografija:** Anton – tik didelės antraštės (ekranų pavadinimai, „ŽAISTI“, įvado antraštės, laimėtojas, pasiruošimas, kraunama, klipai, lapų antraštės), visos didžiosiomis. Visa kita – Inter, skaičiai irgi (serija, vieta, savaitės tikslas, VS). Anton niekur nebe „paryškinamas“ dirbtinai. Lietuviškų raidžių tarpai (≥1,25) palikti.
- **Profilio avataras = personažo galva** (Pradžioje ir Profilyje vietoj raidės). Profilis → Nustatymai → „Personažas“: Raudonas (numatytas) arba Mėlynas, saugoma telefone.
- **Sustota: baigėsi Gemini kreditai** (402 „prepayment credits are depleted“, tas pats raktas visuose .env). Likę 16 paveikslėlių (5 pratimų pozos, telefono pastatymo, įvado 3 žingsnio, laimėjimo/pralaimėjimo, kompanijų, ikonos, 8 medaliai) aprašyti `tools/art/jobs.json` – papildžius kreditus paleisti `tools/art/batch.mjs` (žr. AGENTS „Adding an exercise pose“). Kol kas 5 pratimai, nustatymų, įvado ir žaidimo kortelės iliustracijos – dar žmogeliukai.

## 2026-10-25 — Android programėlė (APK) per GitHub Actions (šaka `android`)

- **Capacitor 8.5.3:** tas pats žaidimas kaip Android aplikacija `lt.novacore.app` („NovaCore“). Pavadinimas ir ID – tik `capacitor.config.json`.
- **APK renka GitHub Actions** po kiekvieno `push` į `master`: testai → `vite build` (su Supabase raktais iš repo paslapčių) → `cap sync` → `assembleDebug` → artefaktas `novacore-debug-apk`. Igno kompiuteryje Android SDK nereikia. Kaip įsidiegti – README „Android APK“.
- **Kas kitaip programėlėje:** kamera prašo leidimo pirmą kartą paleidus žaidimą (tik vaizdas, be mikrofono); ekranas neužgęsta (Wake Lock WebView'e neveikia); Android „atgal“ veikia kaip ekrano „atgal“, pradžios ekrane uždaro programėlę; klipų „Atsisiųsti“ ir „Dalintis“ atidaro sistemos dalinimosi langą (išsaugoti į Failus / Nuotraukas, siųsti draugams); kvietimų ir iššūkių nuorodos veda į novacore-two.vercel.app; be service worker ir be viso ekrano mygtuko.
- **Dar neveikia:** `/?g=` ir `/?c=` nuorodos atsidaro naršyklėje, ne programėlėje; pirmam paleidimui reikia interneto (MediaPipe modelis iš CDN); ikona ir užsklanda – standartinės Capacitor.
- **Svetainė nepakito:** visi pakeitimai – tik `Capacitor.isNativePlatform()` šakose, Vercel renka tą patį `dist/`.

## 2026-10-25 — klipų peržiūra nebestringa (šaka `fix-clip-lag`)

Komandos draugas pranešė: po žaidimo klipų ekrane peržiūros grotuvas stringa / trūkčioja.

- **Kol kerpama ištrauka, pilnas klipas nebegroja savaime:** rodomas sustabdytas kadras (pirmas geriausios vietos kadras) ir užrašas „ištrauka už ~N s“. Anksčiau tuo pačiu metu telefonas dekodavo du 1080p60 vaizdus ir dar realiu laiku perkoduodavo – grotuvas strigdavo. Pilną klipą vis dar galima paleisti pačiam paspaudus.
- **Ištrauka kerpama pagal tikrus kadrus:** kadras piešiamas tada, kai dekoduojamas naujas vaizdo kadras (`requestVideoFrameCallback`), o ne kiekvieną ekrano atnaujinimą – mažiau pasikartojančių ir praleistų kadrų. Senose naršyklėse – kaip anksčiau.
- **Ištrauka – 30 kadrų/s** (ir atitinkamas bitų srautas), pilnas klipas – kaip buvo (iki 60 kadrų/s). Peržiūrai ir dalinimuisi 60 nereikia, o perkodavimas tampa dvigubai lengvesnis.
- **Patikros:** `npm test` (+ ištraukos 30 kadrų/s pakopos testas), `npm run build` – OK. Headless Chrome su netikra 60 kadrų/s kamera, prieš → po: kerpant rodomas sustabdytas kadras + „ištrauka už ~N s“, paruošus ištrauka groja, naršyklės klaidų nėra (portretas ir landscape). Ištraukos failas 6,0 MB → 1,3 MB (anksčiau ~53 kadrai/s, dauguma – tų pačių kadrų kopijos, nes piešta kiekvieną ekrano atnaujinimą), grojant ištrauką praleista 16/440 → 7/119 kadrų. Headless įrašo pilną klipą tik ~3 kadrais/s (swiftshader), todėl tikrą sklandumą dar reikia pažiūrėti telefone.

## 2026-10-25 — app-v3: šviesi sportinė išvaizda „raudonas kampas prieš mėlyną“ (šaka `ui-v2`)

Ignas atmetė tamsų Volt: telefone atrodė kaip vienas puslapis, dominavo juoda + žalia. Informacinė architektūra ir funkcijos – tos pačios, pakeista išvaizda ir pojūtis.

- **Paletė:** šiltai baltas fonas `#F7F5F2`, baltos kortelės su minkštais sluoksniuotais šešėliais (be rėmelių), tamsiai mėlynas tekstas `#14183A`. P1 ir pagrindiniai mygtukai – raudona `#FF3B3B` (mažam tekstui – `#CC1A27`, raudonoms plokštumoms su mažu baltu tekstu – `#E5252F`), P2 – mėlyna `#2F6BFF`, geltona `#FFC61A` – serijos, rekordai, daugiklis, šventė. Viskas `:root` žetonuose, juoda + oranžinė niekur.
- **Kiekvienas pratimas turi savo spalvą:** pritūpimai raudona, pašokimai mėlyna, aukšti keliai geltona, su šuoliuku rožinė, šoniniai žingsniai mėtinė, įtūpstai violetinė, atsilenkimai žydra – plytelėse, pasirinkime, juostose, rezultatuose.
- **Pradžia:** „VS“ kortelė – raudonas ir mėlynas žaidėjų kampai su animuotais žmogeliukais ir dideliu „Žaisti“; serija – geltona plytelė, vieta kompanijoje – mėlyna; greito starto plytelės savo spalvomis; savaitės tikslas geltonai. Landscape – du stulpeliai.
- **Pratimai:** spalvotos plytelės su žmogeliuku ir rekordu; paspaudus – lapas iš apačios su „kaip daryti“, „ką tikrina kamera“, „iš viso“ ir „rekordas“.
- **Profilis:** antraštės kortelė, 4 spalvotos statistikos plytelės, 7 dienų stulpeliai (šiandien – raudonai), juostos pratimų spalvomis, ženkliukai kaip spalvoti medaliai (neturimi – pilki).
- **Įvadas:** kiekvienas žingsnis per visą ekraną savo spalva – raudona, mėlyna, geltona; iliustracijos baltoje kortelėje.
- **Kaip programėlė, ne puslapis:** ekranai įslysta iš dešinės ir išslysta atgal (push/pop), tarp skirtukų – trumpas perėjimas be slydimo; viršuje lipni juosta, kurioje nuslinkus didelę antraštę atsiranda mažas pavadinimas; lapai išvažiuoja iš apačios su rankenėle; kiekvienas mygtukas paspaudus susitraukia (0,97); apatinis meniu baltas, aktyvus skirtukas raudonas su užpildyta ikona. `prefers-reduced-motion` išjungia animacijas.
- **Kamera lieka tamsi** (pasiruošimas, žaidimas, klipai) – tamsiai mėlyna vietoj juodos: P1 raudona, P2 mėlyna, daugiklis ir laiko juosta geltoni, pasiruošimo rėmelio kampai raudoni/mėlyni. Rezultatai – šviesūs, laimėtojo kortelė jo spalva (lygiosios – geltona).
- **PWA ikonos:** baltas „N.“ ant raudono su geltonu tašku, `sw.js` v5.
- **Patikros:** `npm test`, `npm run build` – OK. Naujas `tools/nav-check.cjs` – 20/20 (skirtukai, gili nuoroda, push/pop, atgal iš kompanijos, lipni juosta, pratimo lapas, atgal pasiruošime / žaidime, „Žaisti dar kartą“, „Į pradžią“), naršyklės klaidų nėra. Visi ekranai portretu ir landscape – `Downloads\NovaCore\app-v3\` (tie patys pavadinimai kaip app-v2 + `29-exercise-detail`). Dizaino patikra (styleseed) ~86/100.

## 2026-10-25 — app-v2: NovaCore kaip tikra programėlė (šaka `ui-v2`)

Vieno puslapio žaidimas tapo programėle su meniu apačioje. Žaidimas, atpažinimas ir klipai – kaip buvo.

- **Įvadas (tik pirmą kartą, galima praleisti):** 3 trumpi langai – kas tai (du animuoti žmogeliukai P1/P2 spalvomis), kaip pastatyti telefoną, slapyvardis + kameros leidimas su paaiškinimu „vaizdas niekur nesiunčiamas“. Vėliau atidaromas iš Profilio („Kaip žaisti“). Kas jau žaidė anksčiau, įvado nemato.
- **Apatinis meniu:** Pradžia · Kompanijos · Pratimai · Profilis. Paslepiamas tik kameros metu (pasiruošimas, žaidimas, rezultatai, klipai). Kiekvienas ekranas turi savo nuorodą (`#/kompanijos`, `#/pratimai`, `#/profilis`, `#/zaisti`), `/?g=KODAS` ir `/?c=…` veikia kaip anksčiau. Android „atgal“ elgiasi kaip ekrano „atgal“ mygtukas: iš bet kurio skirtuko – į Pradžią, pasiruošime – į nustatymus, žaidimo metu – nieko (kad netyčia nenutrūktų), rezultatuose – atgal į programėlę.
- **Pradžia:** pasisveikinimas vardu, serija (dienos iš eilės su bent vienu žaidimu), tavo vieta savaitės lentelėje (geriausia iš kompanijų), didelis „Žaisti“ → nustatymai, 3 greito starto plytelės (Dvikova 3 min · Solo 3 min · Greitas 1 min – iškart į kamerą), iššūkio kortelė su „Priimti“, savaitės tikslas 5 žaidimai.
- **Žaidimo nustatymai** – atskiras ekranas: žaidėjai, trukmė, pratimų pasirinkimas, garsas, kaip pastatyti telefoną, „Pradėti“.
- **Kompanijos:** sąrašas (pavadinimas, narių skaičius, tavo vieta), sukurti / prisijungti kodu, kompanijos ekranas su kodu, „Pakviesti“, savaitės lentele ir „Išeiti“ (du paspaudimai). Kai kompanijų nėra – paaiškinimas, kam jos; be interneto – užrašas, o ne dingęs skirtukas.
- **Pratimai:** visi 7 pratimai su animuotu žmogeliuku, kaip daryti, patarimas (ką tikrina skaičiuoklė), BETA ženklas, tavo „iš viso“ ir „rekordas“ kiekvienam.
- **Profilis:** vardas (keisti), žaidimai / judesiai / rekordas / serija, 7 dienų stulpeliai, judesiai pagal pratimą, 8 ženkliukai (pirmas žaidimas, dvikova, 3 dienos iš eilės, 100 pritūpimų, 100 taškų, įveiktas iššūkis, 10 žaidimų, visi pratimai), paskutiniai žaidimai + visa istorija, nustatymai (garsas, vibracija, įvadas, privatumas, versija).
- **Rezultatai ir klipai:** pridėti „Žaisti dar kartą“ (be puslapio perkrovimo – taškai, klipai ir modelis išvalomi) ir „Į pradžią“.
- **Pasiruošimo ekranas:** kameros rėmelis su kampais kaip BS-PROOF skeneryje; kraunama, klipai ir lapai perdaryti ant tos pačios sistemos.
- **Spalvos:** Volt – beveik juodas fonas `#0b0b0f`, volt `#d4ff3a` (P1, akcentas), šiltai raudona `#ff4d5e` (P2). Tik `:root` žetonai, `?palette=` jungiklis pašalintas. Raudona reiškia tik P2, BETA ar įspėjimą. Pašalinta: taškų tinklelis programėlės ekranuose, šoninės juostos kortelėse.
- **Ikonos:** Lucide (ISC) SVG viename faile `src/ui/icons.ts`, be šrifto ir be emoji. **PWA ikonos** – naujos („N.“ su volt tašku, yra maskable), `sw.js` v4.
- **Duomenys:** viskas skaičiuojama iš telefono istorijos (veikia be interneto); istorija dabar saugo pakartojimus pagal pratimą (seni žaidimai jų neturi – pratimų sumos prasideda nuo šiol). Slapyvardis pirmiausia saugomas telefone ir sinchronizuojamas su serveriu, kai yra ryšys. Duomenų bazė nekeista (`001_init.sql`).
- **Kodas:** `src/ui/router.ts`, `onboarding.ts`, `home.ts`, `library.ts`, `profile.ts`, `icons.ts`, `src/history/stats.ts` (grynas, `test-stats.cjs` – `npm test` dalis).
- **Patikros:** `npm test` ir `npm run build` – OK. Naujas `tools/screens.cjs` – kiekvieno ekrano kadras portretu (390×844) ir landscape (844×390) su netikru Supabase ir istorija (28 + 28 kadrai, `Downloads\NovaCore\app-v2\`). Interaktyvi navigacijos patikra (skirtukai, gili nuoroda, atgal pasiruošime / žaidime / rezultatuose, „Žaisti dar kartą“, „Į pradžią“) – 18/18, naršyklės klaidų nėra. Dizaino patikra (styleseed) – 87/100 prieš paskutinį pataisymą.

## 2026-10-25 — atpažinimas v4: šuoliukai, greiti keliai, pritūpimas kampu, pašokimai ir šoniniai žingsniai ant tikrų klipų (šaka `detect-v4`)

- **Šuoliukai (`squatjump`):** šuolis = ŽEMESNĖ pėda pakyla ≥0,2 liemens virš savo „grindų" (kulkšnies aukštis pritūpus), ne klubų pakilimas virš stovėsenos. Žmogus, šokantis iš pritūpimo į pritūpimą be atsistojimo, anksčiau duodavo 0 – stovėsenos bazė neatsirasdavo. Abu keliai turi lenktis kartu (bėgimas/aukšti keliai lenkia po vieną), skrydis ≥200 ms (kairės/dešinės kulkšnies sukeitimo glitch'as ~100 ms). `squatjump3` 0→6/6, held-out `squatjump5` 0→8/9 (vienas praleistas dėl VIS – tamsus pritūpimas). Klaidingi „šuoliukai" kituose pratimuose: aukšti keliai 13→0, bėgimas 8→0, šoniniai žingsniai 13→0, atsilenkimai 4→0.
- **Aukšti keliai (`knees`):** kelis lyginamas su KITU keliu (≥0,5 liemens aukščiau), ne su klubų linija; pakelto kelio pėda turi būti ≥0,6 liemens aukščiau (jei kulkšnys matomos) ir kelis ne žemiau kaip 0,5 liemens po klubu. `MIN_GAP` tik keliams perpus (greiti žingsniai ~0,27 s). `knees2` 7→25/24; pritūpimas kampu nebeskaitomas kaip keliai (3→0); įtūpstai – 0.
- **Įstriži atsilenkimai:** papildomai kelis ≥0,5 liemens aukščiau už kitą kelį → pritūpimas kampu nebeskaitomas (3→0), tikri atsilenkimai nepakito (23/23 held-out).
- **Šoniniai žingsniai:** „suglausta" ir tada, kai pėdos sustoja ties ~55 % to žingsnio didžiausio pločio (squat walk'e pėdos ne visada susiglaudžia; slėnyje, ne pakeliui); išmestas 2,5 s „atidaryta" laikmatis (jis perkeldavo atskaitos tašką į platų stovą ir laikytas šoninis pritūpimas + grįžimas skaičiuodavosi). `sidestep2` 9→11/12, held-out `sidestep3` 11/11, `sidestep-squat` 2→0, `sidestep` 9/9.
- **Pašokimai (`jack`):** pirmą kartą tikri žmonės – 5 klipai (`jack2`–`jack6`), `step()` nekeistas: 41/41.
- Nauji fixture'ai (tik landmark JSON, apkirpti): `jack2`–`jack6`, `sidestep2`, `sidestep3`, `sidestep-squat`, `squatjump5`. `accuracy.cjs`: `STEP_TUNED` – held-out ir ranka rašytam `step()` (klipai, ant kurių derinta, nebeskaičiuojami kaip held-out); lango rodymas su `{to}`. `replay-check.cjs`: 3 „ŽINOMOS SPRAGOS" pašalintos, +22 atvejai. `test-detect.cjs`: sintetinės pozos realistiškos (šuolio metu pakyla ir pėdos, pakeltas kelis kelia pėdą), +greiti keliai, +laikytas šoninis pritūpimas.
- **Beta žymos nekeistos** – reikia telefono testo. Held-out ≥90 %: pritūpimai, įtūpstai (k-NN, nekeista), pašokimai, atsilenkimai, šoniniai žingsniai (1 held-out klipas), aukšti keliai (1 held-out klipas, 17/16). Šuoliukai 8/9 (89 %).

## 2026-10-25 — ui-v2 pavyzdžiai: BS-PROOF struktūra (šaka `ui-v2`, tik 3 ekranai)

- **Perdaryti 3 ekranai** (startas, žaidimo HUD, rezultatai) ant BS-PROOF dizaino sistemos: Inter (Google Fonts, su LT raidėmis), 900 svorio tankios antraštės, 18 px kortelės, 14 px valdikliai, 999 px „pill“ mygtukai, laimo akcentas, rekordai kaip BS-PROOF „ledger“ juosta, iššūkis kaip BS-PROOF įspėjimo kortelė. Pašalinta: pasvirę blokai, įstrižos juostos, kontūrinis „NOVA CORE“, Barlow Condensed kursyvas.
- **Visos spalvos – tik `:root` žetonai** (`--bg`, `--surface`, `--fg*`, `--accent`, `--fill`, `--p1`, `--p2`, `--on-*`), permatomumas per `color-mix()`; skeletų spalvas `camera.ts` skaito iš `--p1`/`--p2`. Paletę galima pakeisti viename bloke. Laikinas palyginimas: `/?palette=volt` (juoda + volt žalsvai geltona, P2 šiltai raudona).
- P1 = laimas `#d9ef73`, P2 = BS-PROOF koralas, pašviesintas tamsiam fonui `#ee7d5f` (6,2:1).
- Logotipas – vienas teksto mazgas `.wordmark` („NovaCore“ + laimo taškas per `::after`), kad pavadinimą būtų lengva pakeisti.
- Kiti ekranai (pasiruošimas, kraunama, klipai, lapai) dar senos struktūros, tik perkelti ant naujų žetonų be pasvirimo.
- `playthrough.cjs`: `--history` (netikri žaidimai → rekordų kortelė) ir `--palette <vardas>`.

## 2026-10-25 — 2 etapas: slapyvardis, kompanijos, savaitės lentelė, iššūkiai (Supabase, šaka `app-v1`)

- **Prisijungimas be el. pašto:** Supabase anoniminis prisijungimas + slapyvardis (2–20 simbolių). Pirmą kartą atsidaro langas „Tavo vardas“ (galima „Vėliau“). Starto ekrane – slapyvardžio mygtukas ir „Kompanijos“ su tavo vieta savaitės lentelėje (#2).
- **Kompanijos:** sukurti (pavadinimas → 6 simbolių kodas), pakviesti (Web Share arba nukopijuota nuoroda `/?g=KODAS`), prisijungti kodu arba atsidarius nuorodą, būti keliose, išeiti (du paspaudimai). Lentelė – šios savaitės geriausias 3 min solo rezultatas, tavo eilutė paryškinta, dar nežaidę – „—“.
- **Iššūkiai:** rezultatų ekrane „Mesti iššūkį“ → nuoroda `/?c=<žaidimo id>`. Ją atidarius starto ekrane rodoma „<vardas> surinko N tšk. per 3 min – įveik!“, parenkama ta pati trukmė, o po žaidimo – „Įveikei!“ / „Dar ne · trūko N tšk.“.
- **Po kiekvieno žaidimo** rezultatas siunčiamas į `games` (solo – P1 taškai, dvikova – didesni taškai, pakartojimai pagal pratimą, pratimų sąrašas). Be interneto jis lieka telefone (`novacore.pending`) ir išsiunčiamas kitą kartą atidarius.
- **Žaidimas veikia ir be interneto ar serverio** – internetinė dalis tik papildoma, klaidos rodomos trumpu lietuvišku užrašu. Vietinė istorija ir rekordai nepakeisti.
- Kodas: `src/online/api.ts` (be DOM), `src/ui/social.ts`, langai naudoja tą patį `.ex-sheet` dizainą; priklausomybė `@supabase/supabase-js` 2.118.0. Duomenų bazės schema nekeista (`001_init.sql`).
- Patikros: `node tools/social-check.mjs` (tikras serveris: 2 vartotojai, kompanija, lentelė, iššūkis, RLS), `playthrough.cjs --social` (netikras serveris naršyklėje → slapyvardžio, kompanijų, iššūkio kadrai portretu, 360 px ir landscape), `--size`.
- **Dar reikia serveryje (Ignas):** paleisti `supabase/migrations/001_init.sql` ir įjungti „Allow anonymous sign-ins“ – 10-25 abiejų dar nebuvo, todėl `social-check` dar nepaleistas iki galo.

## 2026-10-25 — perkelta į Vite + TypeScript projektą (šaka `app-v1`, 1 etapas)

- **Elgesys nepakeistas** – tik kodo sutvarkymas, kad žaidimą būtų galima auginti į pilną programėlę. Vienas 2 150 eilučių `index.html` išskaidytas: `index.html` liko tik žymėjimas (ekranai, demonstracijų SVG), CSS – `src/styles/main.css` (`:root` žetonai ir „Active Arcade“ išvaizda nepakeisti), JS – moduliai `src/detect/` (atpažinimas, be DOM), `src/clips/`, `src/camera/`, `src/game/`, `src/audio/`, `src/history/`, `src/ui/`. Struktūra – `AGENTS.md`.
- Priklausomybės: `vite`, `typescript`, `@mediapipe/tasks-vision` **0.10.14** (ta pati versija; JS dabar iš npm, wasm ir modelis – iš CDN kaip anksčiau). Jokio React ar UI karkaso.
- Komandos: `npm run dev`, `npm run build`, `npm test` (tipai + `test-detect.cjs` + `replay-check.cjs`). Vercel renka `vite build` ir publikuoja `dist/` (`vercel.json`).
- **Testai nebe„pjausto“ `index.html`** – `test-detect.cjs`, `tools/replay.cjs`, `replay-check.cjs`, `accuracy.cjs` importuoja `src/detect/*.ts` tiesiogiai (Node ≥ 22.18). Rezultatai prieš ir po perkėlimo **sutampa simbolis į simbolį** (`OK`, `OK`, ta pati tikslumo lentelė); `samples.cjs` sugeneruoja identišką `pose-samples.json`.
- `playthrough.cjs` dabar testuoja surinktą `dist/` ir daro papildomą kadrą `00-start`. Palyginta su `detect-v3` kadrais (portretas ir landscape): starto ekranas ir pratimų lapas – identiški pikselių tikslumu, žaidimo/rezultatų/klipų ekranai – ta pati išvaizda (skiriasi tik vaizdo įrašo momentas ir taškai).
- PWA: `pose-samples.json`, `sw.js`, `manifest.webmanifest`, `icons/` perkelti į `public/`. `sw.js` v3: Vite failai su hash'u (`/assets/*`) kešuojami cache-first ir paimami iš `index.html` jau įdiegimo metu – žaidimas veikia be interneto po pirmo apsilankymo (patikrinta headless offline režimu).
- Kas pasikeitė už žaidimo ribų: Vercel'yje nebepublikuojami `tools/`, `docs/` ir fixture'ai (tik `dist/`).

## 2026-10-25 — atpažinimas v3: pozų klasifikatorius (k-NN) pritūpimams ir įtūpstams (šaka `detect-v3`)

- **Naujas skaitiklis:** Google MediaPipe „Pose classification“ (Apache-2.0) perkeltas į gryną JS `index.html` (`poseEmbed`, `poseClassify`): kūno pozų embedding'as → k-NN prieš pažymėtas pavyzdines pozas → EMA → pakartojimas, kai poza „įeina“ ir „išeina“ (6/4 balsai iš 10). Pavyzdžiai – `pose-samples.json` (~58 KB), generuojami `node tools/samples.cjs` iš `tools/samples-spec.json` (laiko intervalai fixture'uose). Naujas pratimas = nufilmuoti ir pažymėti pozas, ne derinti slenksčius.
- **Gyvai:** `squat` ir `lunge` (įtūpstai lieka beta). Kiti pratimai – kaip buvo (`step()`); jei `pose-samples.json` neužsikrauna, irgi `step()`. `NEED`/`VIS`, `MIN_GAP` ir 2 žaidėjai veikia kaip anksčiau.
- **Tikslumas (naujas `node tools/accuracy.cjs`, 10 naujų klipų, held-out = nemokyta ant jų):** pritūpimai – tikri pakartojimai 4 held-out klipuose 22/22 (buvo 21/22), klaidingi „pritūpimai“ kituose pratimuose 0 (buvo 18: atsilenkimai 9+5+1, įtūpstai 3); įtūpstai – held-out 7/7 (buvo 6/7), pritūpimas kampu nebeskaitomas kaip įtūpstas (buvo 3).
- **Neperjungta:** aukšti keliai ir atsilenkimai – k-NN ant naujų žmonių ne geresnis už `step()` (2 bandymai); šuoliukai ir šoniniai žingsniai – embedding'as nemato šuolio/pasislinkimo. Žinomos spragos įrašytos į `replay-check.cjs`: „mini“ šuoliukai (`step()` 0 iš 6), žemi greiti keliai (7 iš 24).
- **Modelis:** `full` palygintas su `lite` ant visų klipų – ne geresnis apskritai, 1,6× didesnis → liekame prie `lite`, URL vienoje konstantoje `POSE_MODEL`.
- `tools/extract.cjs`: `--cpu` (~5× greičiau), `--model`, `--out`. 10 naujų fixture'ų (`squat2–4`, `squatjump3`, `knees2–3`, `crunch2–4`, `lunge5`). `sw.js` VERSION v2 + `pose-samples.json` kešuojamas.
- Dar reikia: tikro telefono testo (portretas, 60 fps) pritūpimams ir įtūpstams prieš merge'inant į `master`.

## 2026-10-23 — UI po pilno prabėgimo su tikru žmogumi (fake-camera testas)

Visas žaidimas (startas → paruošimas → 60 s → rezultatai → klipai) pervarytas headless Chrome su `--use-file-for-fake-video-capture` (tikro žmogaus įrašas kaip kamera), portretu ir landscape. Pataisyta tai, kas matėsi:

- **Starto ekranas:** mygtukas „Pradėti“ buvo žemiau ekrano krašto (po rekordų, garso ir pasiruošimo skilčių). Dabar `position:sticky` apačioje – matomas iš karto, nustatymai slenka po juo.
- **Klipų ekranas:** vietoj juodo langelio su „Kerpamos geriausios akimirkos…“ (iki ~30 s, nes ištrauka kerpama atkuriant realiu laiku) iš karto rodomas **pilnas klipas**, o ant jo – mažas užrašas su atgaline atskaita „ištrauka už ~N s“. Kai ištrauka paruošta, vaizdas pasikeičia į ją.
- **Rezultatų ekranas:** pridėtas **pakartojimų sąrašas pagal pratimą** (P1/P2 stulpeliai, solo – vienas), eilutė po antrašte dabar „N judesiai · M tšk. per X min“. Tam `scoreEvents` įrašai gavo `ex` lauką.
- Pastebėta, bet NEkeista: rankos už galvos (plaštakos ties ausimis) neužskaitomos kaip „rankos aukštyn“ – riešai turi būti virš nosies; tai teisinga, užuomina „RANKOS AUKŠTYN“ rodoma.

## 2026-10-23 — atpažinimas patikrintas ant TIKRŲ žmonių įrašų (`tools/`)

- Naujas `tools/` rinkinys: `extract.cjs` (vaizdo įrašas → MediaPipe Pose landmark'ai į `tools/fixtures/*.json`, tas pats modelis kaip žaidime), `replay.cjs` (fixture → `step()` → kiek pakartojimų užskaityta), `replay-check.cjs` (regresija: 7 teigiami + 5 neigiami atvejai ant 8 tikrų klipų iš priekio). Paleisti: `node tools/replay-check.cjs`.
- **Rasta esminė klaida: 2D kelio kampas iš priekio neveikia.** Tikrame pritūpime iš priekio 2D kampas keičiasi tik 180°→150°, todėl riba `<110°` niekada nepasiekiama (0 iš 3 pritūpimų, 3 iš 9 šuoliukų). Įvestas `ang3()` su MediaPipe `z` – 3D kampas svyruoja ~130°→60°. Pritūpimai ir šuoliukai dabar naudoja abu (gilu, kai bet kuris sako gilu; stovima, kai abu sako stovima): 3/3 pritūpimai, 8/9 šuoliukai.
- **Šoniniai žingsniai perrašyti:** būsenos *suglausta → plati (išžengta ~2 klubų pločiai) → suglausta su kūno pasislinkimu*. Pločiai lyginami su paties žaidėjo siauriausia stovėsena. Pritūpimo vartas pašalintas – tikrame įraše klubų/pečių santykis tarp stovėjimo ir sportinio pritūpimo keitėsi 0,60→0,58 (triukšmo ribose). Buvo 3, dabar 9 iš ~9 realių žingsnių su pasislinkimu (išžengimas ir grįžimas į tą pačią vietą neskaičiuojamas – sąmoningai).
- **Įtūpstai:** pašalinta sąlyga `stance<1.25 klubų` – iš priekio kulkšnys apačioje būna 1,5–3,5 klubų pločio, todėl ji atmetė visus pakartojimus. Skiriamasis požymis nuo pritūpimo – kelių aukščių skirtumas (`stagger>0.25`, įtūpste 0,5–0,8, pritūpime 0,02–0,05). Buvo 0 tikrų, dabar 6/7.
- **Įstriži atsilenkimai:** alkūnė iš priekio niekada nepriartėja prie kelio arčiau ~0,8 pečių pločio (tai sukimas), bet nusileidžia iki kelio aukščio. Langas 0,6/0,6 → 1,3/0,8. Buvo 2/8, dabar 7/8; šoninis atsilenkimas (kitas pratimas) – 0, kaip ir turi būti.
- Aukšti keliai: 24 iš ~25 – nekeista.
- `test-detect.cjs` sintetiniai atvejai suderinti su realiais dydžiais (šoninio žingsnio plotis, įtūpsto stagger).
- Beta žymos dar NEnuimtos: tai vis dar YouTube klipai, ne mūsų telefonas; po komandos testo pagal `docs/TESTAVIMO-PROTOKOLAS.md` galima nuimti.

## 2026-10-23 — garsas, rekordai, PWA

- **Garsas ir vibracija.** Web Audio sintezuoti garsai be jokių failų: „tick“ už kiekvieną užskaitytą pakartojimą (P1 ir P2 skirtingo aukščio), dviejų natų „ding“ keičiantis raundui, tylus tiksėjimas paskutines 10 s, trumpa fanfara finiše. Telefone už pakartojimą – `navigator.vibrate(30)`. Starto ekrane mygtukas **„Garsas: įj./išj.“** (įsimenamas `localStorage` `novacore.sound`). `AudioContext` sukuriamas tik paspaudus „Pradėti“ (naršyklės reikalauja vartotojo gesto).
- **Žaidimų istorija ir rekordai.** Po kiekvieno žaidimo į `localStorage` (`novacore.history`, iki 50 įrašų) įrašoma data, žaidėjų skaičius, trukmė, pratimai, taškai ir pakartojimai. Rezultatų ekrane – žyma **„Naujas rekordas!“**, kai viršytas geriausias rezultatas tam žaidėjų skaičiui (pirmas žaidimas rekordu neskelbiamas). Starto ekrane nauja kortelė **„Rekordai“**: solo ir dvikovos rekordai, žaidimų skaičius, visų judesių suma; mygtukas „Istorija“ atidaro paskutinių 10 žaidimų sąrašą su „Išvalyti“. Be istorijos kortelė nerodoma.
- **PWA.** `manifest.webmanifest` + `sw.js` + `icons/` (192, 512, maskable 512): žaidimą galima įsidėti į telefono pradžios ekraną kaip programėlę, atsidaro be naršyklės juostų. Service worker: app shell – network-first su cache atsarga; MediaPipe/šriftų CDN – network-first su runtime cache, todėl kartą paleistas žaidimas užsikrauna ir be interneto. `vercel.json` – `sw.js` be kešavimo.
- Meta: atnaujintas aprašymas, `og:*` žymos (dalinantis nuoroda rodoma ikona ir aprašymas), `apple-touch-icon`.

## 2026-10-22 (vakaras) — nauji pratimai pažymėti „beta“, animacijų ir šoninių žingsnių pataisos

- Keturi nauji pratimai (`squatjump`, `sidestep`, `lunge`, `crunch`) gavo `beta:true` žymą: pasirinkimo lentelėje matomi su „BETA“ etikete, bet **pagal nutylėjimą išjungti**, kol nepatikrinti su tikru žmogumi prieš kamerą. Pirmi trys pratimai veikia kaip anksčiau. Išsaugotas naršyklės pasirinkimas gerbiamas.
- Šoninių žingsnių pritūpimo tikrinimas nebenaudoja fiksuotos ribos 0,62 (klubų–kulkšnių / pečių–kulkšnių santykis). Realiems kūnams stovint šis santykis svyruoja ~0,56–0,68, todėl ilgakojams „pritūpimas“ buvo visada, trumpakojams – niekada. Dabar lyginama su paties žaidėjo aukščiausia (stovima) poza tame raunde (`s.r0`), pritūpimas = santykis nukrito ≥0,03.
- Trenerio animacijos: pritūpimo su šuoliuku rankos viršuje pakeltos į V (anksčiau 110° slėpė plaštakas už galvos); šoniniai žingsniai perpiešti kaip pritūpusi figūra, kuri žingsniuoja kairėn–dešinėn (kojos išsiskiria, tada susiglaudžia); įstrižų atsilenkimų liemuo lenkiasi link pakelto kelio, kad alkūnė jį pasiektų.
- Trukmės mygtukų skaičiai (`3:00` / `1:00`) nebesikerpa 430 px pločio ekranuose (`min(34px,8vw)`).

## 2026-10-22 — šoniniai žingsniai vietoje čiuožėjo šuoliukų

- **Čiuožėjo šuoliukai** pakeisti **šoniniais žingsniais** (`sidestep`): žaidėjas turi šiek tiek pritūpti, žengti viena koja į šoną ir prikelti kitą koją prie jos, tada kartoti į kitą pusę.
- Atpažinimas nebepriima vien kūno siūbavimo ar kojų platinimo. Reikia, kad:
  - pėdų plotis iš tiesaus (susikėlusios kojos) išaugtų bent 0,6 klubų pločio,
  - pėdų centras po žingsnio pasislinktų bent 0,35 klubų pločio (kita koja turi sekti pirmą),
  - klubai nusileistų iki mažiau nei ~62 % atstumo nuo peties iki kulkšnies (šiek tiek pritūpus),
  - pėdos vėl sugrįžtų į pradinį plotį. Išžengimas ir grįžimas ta pačia koja neįskaitomas, o žengiant stovint (be pritūpimo) taškų nėra.
- Perpiešta demonstracija: pritūpusi figūra iš tiesų perkelia pėdą į šoną, prikelia kitą ir kartoja į priešingą pusę; nebėra slystančio plačių kojų silueto.
- Išsaugomas ankstesnis pratimų pasirinkimas: senasis `skater` įrašas automatiškai atitinka naująjį `sidestep`.
- `test-detect.cjs` pridėti teigiami ir neigiami scenarijai: pritūpęs šoninis žingsnis į abi puses, stovimas šoninis žingsnis ir išžengimas-grįžimas.

## 2026-10-22 — keturi nauji pratimai

- Į pratimų sąrašą įtraukti **pritūpimai su šuoliuku**, **čiuožėjo šuoliukai**, **atvirkštiniai įtūpstai** ir **įstriži atsilenkimai stovint**. „Aukšti keliai“ jau buvo žaidime, todėl jis nedubliuojamas.
- Kiekvienas naujas pratimas turi savo judesio atpažinimą:
  - Pritūpimas su šuoliuku skaičiuojamas tik po pritūpimo (kelio kampas < 115°) ir tik tada, kai klubai realiai pakyla virš stovėjimo lygio daugiau nei 12 % liemens ilgio. Vien atsistojimas iš pritūpimo neįskaitomas.
  - Čiuožėjo šuoliukui reikia plataus šoninio klubų judesio į abi puses ir krypties pasikeitimo; mažas siūbavimas neįskaitomas.
  - Atvirkštiniam įtūpstui reikia klubų nusileidimo, skirtingo aukščio kelių ir siauros pėdų pozicijos, todėl paprastas pritūpimas su lygiais keliais nesiskaičiuoja.
  - Įstrižiems atsilenkimams stovint reikia pakelto kelio (virš 10 % liemens ilgio) ir prie jo prisilietusio priešingos pusės alkūnės; kol kelias nenuleidžiamas, tas pats judesys antrą kartą neįskaitomas.
- Pridėtos animuotos trenerio kortelės su atskirais SVG judesiais (`squatjump`, `skater`, `lunge`, `crunch`), todėl kiekvienas pratimas turi savo demonstraciją.
- `test-detect.cjs` papildytas naujų pratimų teigiamais ir neigiamais scenarijais: šuoliukas be pritūpimo, pritūpimas be šuoliuko, mažas šoninis siūbavimas, pritūpimas vietoje įtūpsto, pakeltas kelias be alkūnės ir pakartotinis judesys nenumetus kelio.
- Kai pasirinkti visi 7 pratimai, 3 min sesija telpa 6 raundus, todėl kiekviena sesija pradedama nuo kito pasirinkto pratimo (`exShift`) – taip per kelis žaidimus visi pratimai išbandomi, o ne visada praleidžiamas paskutinis.

## 2026-10-22 — 1080p / 60 fps pagal įrenginio galimybes

- Kamera dabar prašoma **1920×1080 @ 60 fps**. Po paleidimo tikrinamas realus kameros režimas (`getSettings()`), todėl telefonas, kuris to nepalaiko, automatiškai gauna artimiausią variantą. Įkėlimo ekrane parodoma, kokį režimą telefonas realiai davė.
- Jei telefonas realiai duoda 1080p60, tiesioginė peržiūra rodoma 1080p, o pilnas ir geriausių akimirkų klipai įrašomi **1080×1920 / 1920×1080 @ 60 fps**. Jei ne – naudojamas 1080p30, 720p60 arba 720p30 pagal tai, ką telefonas tikrai gali.
- Klipų bitrate padidintas (iki **8 Mbps** 1080p60 atveju), o pirmenybė teikiama H.264 High 4.2 profiliui.
- Pozų atpažinimas 1080p kameros atveju vyksta sumažintame iki 1280 px kadre, kad didelė peržiūra nesulėtintų 60 fps judesio sekimo; 720p atveju kokybė lieka tokia pat kaip anksčiau.
- `clipSpec()` kokybės pasirinkimas padengtas `test-detect.cjs` testais.
- Pastaba: 1080p60 klipai užima žymiai daugiau vietos ir atminties nei buvę 720p30.

## 2026-10-22 — spartesnis judesio sekimas

- Pose modelis nebeapdoroja to paties kameros kadro po kelis kartus: darbas vyksta tik atsiradus naujam `cam.currentTime` kadrui, todėl 60/120 Hz ekranuose nebedaromas dvigubas ar keturgubas darbas.
- Inferencija iš pradžių buvo ribojama iki ~30 kadrų/s ir automatiškai retinama, jei telefone ji užtrunka, kad piešimas ir HUD liktų sklandūs (vėliau tikslas pakeltas iki 60 fps, žr. naujausią įrašą). Kamera iš pradžių paprašyta 30 fps.
- Laikmatis atnaujinamas kartą per sekundę, progreso juosta – 10 kartų/s; dažnai naudojami HUD elementai kešuojami, o skeletas piešiamas vienu `stroke()` vietoj 12 atskirų brūkštelėjimų žaidėjui.
- Judesio slenksčiai ir taškų logika nepakeisti, todėl `node test-detect.cjs` rezultatai išlieka tokie patys.

## 2026-10-22 — užuominos, neaktyvumo priminimas ir kamera

- Judėjimo užuomina (rodyklė „Atsitrauk“, „Į kairę / Į dešinę“) nebeužstoja ir nebeišjungia trenerio animacijos. Abu elementai rodomi vienu metu.
- Portretiniame ekrane užuomina rodoma virš trenerio kortelės, o telefonų landšafte – kompaktiška eilute po ja, todėl animacija visada lieka matoma.
- Trenerio demonstracija pakartojama jau po **5 s** be taškų (anksčiau – po ~9 s). Laikas valdomas per `IDLE_DEMO_SECS`.
- Kamera pradėta prašyti iki 60 fps. Vėlesnis įrašas prideda 1080p60 režimą ir klipų kokybę pagal realias įrenginio galimybes (žr. naujausią įrašą).

## 2026-10-21 — pasirenkami pratimai

- Pradžios ekrane įdėta kompaktiška pratimų suvestinė: pasirinktų pratimų skaičius, pavadinimų žetonai ir **„Keisti“** mygtukas.
- „Keisti“ atidaro apatinę **pratimų lentelę**. Jos kortelės generuojamos automatiškai iš `EX` sąrašo, todėl ateityje pridėjus pratimą nereikės papildomo HTML – jis iškart atsiras pasirinkime.
- Lentelė slenka, kai pratimų daugėja; joje rodomas kiekvieno pratimo numeris, pavadinimas ir pasirinkimo žymė.
- Galima įjungti bet kokį pratimų derinį; paskutinio pratimo išjungti neleidžiama – kortelė trumpai suvirpa, o pastaba paaiškina, kad bent vienas pratimas turi likti.
- Kai pasirinkti ne visi pratimai, lentelės viršuje atsiranda **„Visi“** mygtukas greitam visų pratimų pasirinkimui.
- Žaidimo raundai sukasi tik per pasirinktus pratimus, todėl trumpesnėje sesijoje galima žaisti tik mėgstamus pratimus. Pasirinkimas įsimenamas naršyklėje ir išlieka po „Grįžti į pradžią“.
- Geriausių akimirkų peržiūra rezervuoja laiką kiekvienam pasirinktam pratimui, o ne visiems trims.
- Dizainas išlaiko esamą kalbą (skew, kondensuoti numeriai, spalvoti šešėliai), o „zen“ judesiai naudoja `--ease-bounce`: lentelė išslenka su `zen-sheet-in`, kortelės pasirodo pakopa su `zen-tile-in`, pasirinkimas atšoka su `zen-pick`, atmetimas suvirpa su `zen-nope`.
- `test-detect.cjs` papildytas custom pratimų skaičiaus highlight scenarijumi.

## 2026-10-20 — sesijos patobulinimai

### Startas ir žaidimo eiga

- Prieš startą įvestas 3 sekundžių rankų virš galvos laikymo vartas. Visi pasirinkti žaidėjai turi laikyti abi rankas virš galvos; numetus rankas laikmatis atsistato (su 300 ms tolerancija).
- Paruošimo ekrane pridėtas mygtukas **„Atgal į nustatymus“**: sustabdo kamerą, atšaukia laikmačius, uždaro pose modelį ir grąžina į pradžios ekraną.
- Pridėtas **„Kraunama“** ekranas su tamsintu fonu ir bouncing loader animacija; kameros/modelio klaida grąžina į startą su „Bandykite dar kartą“.
- Pridėtas fullscreen mygtukas, prisitaikantis prie mobilaus ekrano ir paslepiantis save, jei naršyklė nepalaiko Fullscreen API.
- Žaidimo ir pasiruošimo metu naudojamas **Screen Wake Lock API**, kad telefonas ar kompiuteris neužmigtų. Ekranas vėl gali užmigti pasibaigus žaidimui arba paspaudus „Atgal į nustatymus“.
- Pridėtos spring/bounce tipo mygtukų paspaudimo, hover ir ekranų įėjimo animacijos.

### Rezultatai ir klipai

- Po žaidimo pirmiausia rodomi rezultatai, po jų **„Toliau“** mygtukas veda į atskirą klipų ekraną.
- Sugeneruojama 15–30 s trukmės geriausių akimirkų peržiūra:
  - parenkamos taškų prasme stipriausios 4 s atkarpos;
  - pridedama po 0,5 s konteksto;
  - garantuojama, kad peržiūroje atsispindėtų kiekvienas žaidime buvęs pratimas, kad lengvesni pratimai neužgožtų kitų.
- Pilnas klipas ir peržiūra įrašomi **MP4 (H.264/AVC1)** formatu; WebM naudojamas tik kaip paskutinė fallback išeitis.
- Klipų orientacija atitinka žaidimo formatą: **720×1280** portretinis arba **1280×720** landšaftinis vaizdas (vėliau pridėtas 1080p60 režimas, žr. naujausią įrašą).
- Klipuose nebėra kūno sekimo linijų: įrašomas tik veidrodinis kameros vaizdas.
- Abu atsisiuntimai sujungti į vieną **„Atsisiųsti klipą“** meniu su „Geriausios akimirkos“ ir „Pilnas klipas“ pasirinkimais; meniu turi bounce animaciją ir chevron pasukimą.
- Pridėtas **„Bendrinti peržiūrą“** mygtukas, naudojantis Web Share API su MP4 failu; nepalaikant – atsisiunčiama peržiūra.
- Pridėtas **„Grįžti į pradžią“** mygtukas.

### Mokymo animacijos ir pagalba

- Pridėtos animuotos trenerio kortelės su sketched stickman figūromis, grindų plokštuma, linija ir šešėliu.
- Demonstravimai rodomi žaidimo pradžioje ir pasikeitus pratimui:
  - pritūpimai;
  - pašokimai;
  - aukšti keliai (bėgimas vietoje).
- Figūrų judesiai interpoliuojami kiekvieną kadrą, o ne perjungiami tarp kelių statiškų pozų; naudojamas spring/bounce easing.
- Pašokimų demonstracijoje pėdos išlieka ant grindų ir tik išsiskiria į šalis, be šokinėjimo.
- Sugriežtinta pašokimų detekcija: reikia, kad abi rankos būtų virš galvos ir išskėstos į šalis, o abi pėdos judėtų į išorę nuo savo klubų. Vienos kojos judėjimas ar rankų kėlimas be mosto nebeužskaitomas.
- Mažas pagalbos tekstas pakeistas didelėmis animuotomis užuominomis:
  - **ATSITRAUK** su krypties rodykle, kai žaidėjas per arti;
  - **RANKOS AUKŠTYN** paruošimo metu;
  - **Į KAIRĘ / Į DEŠINĘ** su žaidėjo numeriu, kai kūnas arti kairiojo/dešiniojo kadro krašto.
- Jei per raundą žaidėjas nerenka taškų apie 9 s, jo pratimo demonstracija parodoma dar kartą (vieną kartą tam raundui).

### Testavimas ir dokumentacija

- `test-detect.cjs` papildytas:
  - rankų virš galvos patikra;
  - highlight segmentų trukmės ir pratimų padengimo testais;
  - pašokimų bypass apsaugos testais;
  - kairės/dešinės krypties užuominų testais.
- Atlikti browser smoke testai: MP4 įrašymas (`ftyp`), 720×1280 vaizdas, highlight peržiūra, download meniu, share galimybė, loading ekranas, animuotos užuominos ir neaktyvumo demonstravimas.
- Atnaujintas `README.md` ir sukurtas `AGENTS.md`, aprašantis architektūrą, testavimo ypatumus ir spąstus.
