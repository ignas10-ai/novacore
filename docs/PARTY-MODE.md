# Vakarėlio režimas („Vakarėlis“) — koncepcija ir įgyvendinimo planas

**Statusas:** MVP įgyvendintas · 2026-11-05 · šaka `claude/71-party-mvp`
**Viena frazė:** *Visi žaidimai. Viena komanda. Viena taurė.*
**Angliškai:** Party Mode.

> **MVP (šiame branch'e):** 5 žaidimai (`rr`, `sp`, `bx`, `lj`, `wl`), 2 komandos, 1–4 žaidėjai komandoje, lobby + atsitiktinis traukimas + komandų pasirinkimas + rezultatas + finalas, 8 nauji SVG veikėjai, tęsimas per `localStorage`. **Dar ne:** Slidinėjimas, beta žaidimai, atskira vakarėlio TV lenta, paskutinių vakarėlių sąrašas, trofėjai.

---

## 1. Pitch

### 1.1 Problema

MoveClash turi 10 mini žaidimų, bet grupė vis dar žaidžia juos po vieną: atidaryk žaidimą → nustatymai → žaidėjai → žaidimas → rezultatas → atgal → kitas žaidimas. Tarp žaidimų dingsta tempas, niekas nežino, kas „laimi vakarą“, o žiūrovai neturi bendros lentelės. Trūksta sluoksnio, kuris 10 žaidimų paverstų vienu vakaru.

### 1.2 Idėja

**Vakarėlis yra bendra komandų lyga, kurią sudaro atskiros rungtys.** Dvi komandos (raudona / mėlyna), po 1–4 žaidėjus (pavyzdys: 3 prieš 3, 6 žmonės). Kiekviena rungtis — esamas MoveClash žaidimas, paleidžiamas iš vakarėlio lobby. Po rungties grįžtama į lobby, kur matosi bendras rezultatas, sužaistos rungtys ir likę žaidimai. Tada traukiama kita rungtis.

Tai **ne naujas žaidimas** ir **ne non-stop sesija**. Tai vakaro rezultatų lenta + atskiri žaidimai, kuriuos galima žaisti savo tempu, daryti pertraukas, net uždaryti programėlę ir tęsti vėliau.

### 1.3 Kaip atrodo vakaras (60 s)

1. Telefonas ant grindų, TV atidarytas per `#/ekranas/<kodas>`.
2. Telefone: **Vakarėlis** → komandos „Raudoni“ (Kometa, Saulė, Mėta) ir „Mėlyni“ (Banga, ...). 3 prieš 3.
3. Lobby: **0 : 0**, „Traukti rungtį“.
4. Loterija ištraukia **Sieną**. Kortelė: „Siena · 1 tšk. · žaidžiama po vieną · pradeda Raudoni“.
5. Komandos tariasi: Raudoni stato **Kometą**, Mėlyni — **Bangą**. `Pradėti`.
6. Kometa žaidžia Sieną, tada ta pati Siena Bangai — Banga. Rezultatas 6 : 4. Raudoni gauna 1 tašką.
7. **Grįžtama į lobby.** Galima atsipūsti, paaiškinti, įpilti vandens. Lobby: **1 : 0**, „Traukti rungtį“.
8. Taip visos rungtys (6 pagrindinės, o įjungus beta — 10) arba iki 5 taškų. Pabaigoje — čempionas, MVP, visų rungčių lentelė ir „Revanšas“.

### 1.4 Kodėl tai tinka būtent dabar

- **Viskas jau yra:** 10 žaidimų, `GameMode` sutartis, rankų pakėlimo vartai, kamera, modelis, TV lenta, veikėjai, istorija, XP, trofėjai. Nereikia naujo judesių atpažinimo, naujų pratimų ribų ar naujo 3D meno.
- **Tai atsako į klausimą „kodėl atsidaryti antrą kartą?“** Vakarėlis yra priežastis pasikviesti draugus, o revanšas — vienas paspaudimas.
- **Atskiros rungtys = mažesnė techninė rizika.** Nereikia laikyti kameros ir modelio per visą vakarą; kiekviena rungtis naudoja įprastą `startFlow` kelią. Tarp rungčių kamera išjungiama, kaip ir įprastame žaidime.
- **Tai skiriasi nuo kitų:** ne „dar vienas kameros fitneso žaidimas“, o sofos vakarėlio platforma, kur telefonas yra teisėjas, o TV — stadionas.
- **Tai gali būti žaidžiama ne non-stop:** lobby yra tikra vieta, kur sustojama; rezultatas išsaugomas; galima tęsti po valandos ar kitą dieną.

### 1.5 Sėkmės matai

| Rodiklis | Dabar (vienas žaidimas) | Su Vakarėliu |
|---|---|---|
| Sesijos trukmė | ~3 min | 20–40 min (su pertraukomis) |
| Žaidimų per sesiją | 1 | 5–10 |
| Žmonių | 1–2 | 2–8 (pavyzdys 6) |
| Priežastis grįžti | serija / rekordas | „Tęsti vakarėlį“ / revanšas |
| TV | viena lenta | visas vakaro transliacija |
| Pertraukos | – | natūralios, tarp rungčių |

Mokyklos validacijai: 3 grupės (2v2, 3v3, šeima), kiek pradėtų vakarėlių baigiama, ar norėtų revanšo, kiek laiko užima viena rungtis. Lokaliai galima skaičiuoti `novacore.parties`; serverio analitikos v1 nereikia.

---

## 2. Taisyklės

### 2.1 Komandos ir žaidėjai

- **Lygiai 2 komandos:** raudona (0) ir mėlyna (1). Spalvos nekeičiamos — jos atitinka visų žaidimų P1/P2, HUD ir TV lentą. Komandų pavadinimus galima redaguoti.
- **2–8 žaidėjai, po 1–4 komandoje.** Pavyzdys: 6 žaidėjai, po 3. Rekomenduojama 2v2 arba 3v3.
- Kiekvienas žaidėjas turi vardą (iki 14 simbolių) ir vieną iš 4 veikėjų. Veikėjai gali kartotis; svarbiausia — vardas.
- **Vienoje rungtyje žaidžia po vieną atstovą iš komandos.** Tai pagrindinis supaprastinimas:
  - tinka visiems 10 žaidimų be 4 žaidėjų agregavimo taisyklių;
  - rungtis lieka 1–4 min.;
  - visi turi rolę: žaidi, palaikai, ruošiesi;
  - taškus gauna komanda, o individualiai — MVP.
- **Komanda pati tariasi ir pasirenka atstovą.** App'e tai atliekama bakstelint žaidėjo kortelę. Nėra priverstinės rotacijos; rodoma, kiek rungčių žaidėjas jau žaidė, kad komanda galėtų balansuoti.
- **3 prieš 3 pavyzdys:** kiekvienoje rungtyje po vieną iš komandos; kiti du palaiko. Per 6–10 rungčių kiekvienas žaidėjas paprastai gauna 3–4 rungtis.

### 2.2 Rungties traukimas

- Lobby mygtukas **„Traukti rungtį“** atsitiktinai išrenka vieną iš **likusių, dar nežaistų** žaidimų.
- **Be pasikartojimų:** kol yra nežaistų žaidimų, tas pats žaidimas nekartojamas.
- **Pool'as (MVP):** 5 žaidimai (Rep Maratonas, Sprintas, Boksas, Šuolis į tolį, Siena). Vėliau planuojama pridėti Slidinėjimą ir beta žaidimus (Barjerai, Boulingas, Badmintonas, Ietis) – tada „Visos rungtys“ būtų 6 arba 10. Setup'e galima atjungti ir atskirus žaidimus; turi likti bent 1.
- Traukimo animacija: loterija su likusių žaidimų ikonomis, 2–3 s sukimasis, sustojimas, būgnų garsas. Tai vakaro „game show“ akimirka.
- Jei liko 0 žaidimų, vakarėlis baigiasi (daugiausia taškų turinti komanda laimi; lygiosios — žr. 2.7).
- **„Praleisti rungtį“** (tik nenumatytiems atvejams, pvz., trauma): žaidimas pašalinamas iš pool'o, taškų niekas negauna. Negalima naudoti kaip taktikos; tai patvirtinama.
- **Jokio persimetimo:** ištraukta rungtis nežaidžiama iš naujo vien todėl, kad komandai nepatogi. „Atšaukti“ prieš startą grąžina žaidimą į pool'ą ir uždaro kortelę; tai leidžiama tik kartą per rungtį.

### 2.3 Kas žaidžia? (komandos pasirinkimas)

- Ištraukus žaidimą, atsidaro **leg card** su dviem komandų kolonomis.
- Kiekviena komanda baksteli **vieną** savo žaidėją. Kortelėje matoma: vardas, veikėjas, „Žaidė: 2 rungtis“.
- **2 žaidėjų žaidime** (Sprintas, Boksas, Slidinėjimas, Barjerai, Badmintonas, Rep Maratonas) abu atstovai stoja vienu metu ir kovoja.
- **1 žaidėjo žaidime** (Siena, Šuolis į tolį, Ietis, Boulingas) abu atstovai pasirenkami iš karto, bet žaidžia **paeiliui**: pirmos komandos atstovas, tada antros. Žaidimo „turn card“ pats perima antrą žaidėją.
- **Pradedančioji komanda** rodoma kortelėje: „Pradeda: Raudoni · antras: Mėlyni“. Komanda gali pasirinkti bet kurį savo žaidėją; eilė priklauso nuo komandos, ne nuo žaidėjo.
- Mygtukas **„Pradėti“** įjungiamas, kai abi komandos pasirinko. **„Atgal“** grąžina į lobby (žr. 2.2 dėl atšaukimo).
- Pasirinkimas išsaugomas rungties istorijoje (kuris žaidėjas atstovavo komandai).

### 2.4 Vieno ir dviejų žaidėjų rungtys

**1 žaidėjo rungtis (paeiliui):**
- Pradeda komanda A. Jos atstovas stoja prie kameros, žaidžia.
- Tada komanda B. Jos atstovas stoja ir žaidžia tą patį žaidimą tomis pačiomis sąlygomis.
- Lyginami abiejų rezultatai (pvz., Siena: daugiau sienų; Šuolis: toliau; Ietis: didesnė suma; Boulingas: daugiau kėglių).
- Žaidimo vidiniai „turn card“ ir vartai tvarko antrojo žaidėjo pasiruošimą. Party sluoksnis tik nustato, kas yra P1 ir kas P2, ir susieja rezultatus su komandomis.

**2 žaidėjų rungtis (vienu metu):**
- Abu atstovai stoja prie kameros ir žaidžia vienu metu.
- Laimi tas, kurio rezultatas geresnis (taškai, laikas, metrai, kėgliai).
- Komandos spalva atitinka žaidimo P1/P2 spalvą: raudona = P1, mėlyna = P2.

### 2.5 Pradedančioji komanda

- **Pirmoji 1 žaidėjo rungtis:** burtai (monetos metimas) loterijos metu. App parodo „Pradeda: Raudoni“.
- **Vėlesnės 1 žaidėjo rungtys:** pradeda ta komanda, kuri **nepradėjo** praėjusios 1 žaidėjo rungties. Taip eilė kaitaliojasi.
- **2 žaidėjų rungtyse** pradedančios komandos nėra — abu pradeda kartu.
- Kortelė visada rodo eilę, kad nebūtų ginčų.
- Alternatyva (vėliau): pradeda atsiliekanti komanda, kad būtų didesnis „comeback“ efektas. v1 — kaitaliojimas.

### 2.6 Taškai

**Svertinė (pagal nutylėjimą):** kiekviena rungtis verta 1–3 taškų. Laimi komanda, kurios atstovo rezultatas geresnis. Lygiosios — po 1 tašką.

| Rungtis | Taškai |
|---|---:|
| Rep Maratonas, Boulingas | 3 |
| Sprintas, Barjerai, Slidinėjimas, Šuolis į tolį, Ietis, Badmintonas | 2 |
| Boksas, Siena | 1 |

**Paprasta:** kiekviena rungtis — 1 taškas. Tinka mažesniems vaikams arba greitam vakarui.

- **Lygiosios rungtyje:** po 1 tašką abiem komandoms (nepriklausomai nuo rungties vertės).
- **Dviguba rungtis (pasirinktinai):** jei įjungta, loterija vieną kartą per vakarą gali ištraukti „Dvigubą rungtį“ (vertė ×2). Tai papildoma drama, bet neprivaloma.
- **Paskutinė rungtis:** jei žaidžiamos visos rungtys, paskutinė gali būti „Auksinė“ (+1 arba +2, pasirinktinai). v1 — neprivaloma; numatyta išjungta.

### 2.7 Vakarėlio pabaiga

Du režimai:

1. **„Visos rungtys“ (pagal nutylėjimą):** sužaidžiama viskas, kas pateko į pool'ą (iki 10). Laimi daugiausia taškų turinti komanda. Tai geriausiai atitinka „sujunk visus žaidimus“.
2. **„Iki N taškų“:** 3 / 5 / 7. Vakarėlis baigiasi, kai po rungties viena komanda turi N taškų ir yra priekyje. Greitas vakaras (~15–20 min.).

- **Ankstesnis sustabdymas:** lobby mygtukas „Baigti vakarėlį“ (patvirtinus). Skelbiamas lyderis; jei lygiosios — bendra taurė arba papildoma rungtis.
- **Lygiosios po paskutinės rungties:** v1 — bendra taurė; v2 — „Dar viena rungtis“ (sudden death, atsitiktinė iš likusių arba bet kuri).
- **Jei visos rungtys sužaistos, o taškai lygūs:** bendra taurė (v1).

### 2.8 Žaidimų formatai

Kiekviena rungtis — 2 aktyvūs žaidėjai (po vieną iš komandos).

| Žaidimas | Formatas vakarėlyje | Trukmė | Taškai | Pastabos |
|---|---|---:|---:|---|
| **Rep Maratonas** (`rr`) | 60 s, 2 pratimai × 30 s; abu atstovai vienu metu | 1,5 min | 3 | Pratimų rinkinys: pritūpimai + šuoliukai + keliai + šoniniai; ta pati tvarka abiem. |
| **Sprintas** (`sp`) | 100 m, 2 takeliai, vienas bėgimas | 1 min | 2 | Įprasta ankstyvo starto taisyklė. |
| **Boksas** (`bx`) | 30 s, abu vienu metu | 1 min | 1 | Vakarėlyje klipas neįrašomas. |
| **Šuolis į tolį** (`lj`) | po 2 bandymus, paeiliui | 2 min | 2 | Geresnis šuolis; lygiosios — 2-u bandymu; foul = X. |
| **Barjerai** (`hd`) | 100 m, 2 takeliai | 1 min | 2 | Beta; pagal nutylėjimą išjungta. |
| **Boulingas** (`bw`) | po 3 kadrus, paeiliui | 3–4 min | 3 | Bendras kėglių skaičius; beta; ilgiausia rungtis. |
| **Slidinėjimas** (`sk`) | 2 žaidėjų lenktynės, tas pats 400 m kursas | 1 min | 2 | Split-screen; abu vienu metu. |
| **Siena** (`wl`) | po 1 bandymą, paeiliui | 1 min | 1 | Daugiau sienų; lygiosios — ilgesnis laikas. |
| **Badmintonas** (`bd`) | rungtynės iki 11 (vėliau galima 7) | 3–5 min | 2 | Beta; ilgiausia rungtis. |
| **Ietis** (`jv`) | po 2 metimus, paeiliui | 2 min | 2 | Galiojančių metimų suma (kaip žaidimo reitinge); lygiosios — geriausias metimas. |

Pastaba: party nustatymai perduodami į žaidimo pačio setup kintamuosius (pvz., `dur=30` boksui, `frames=3` boulingui, `n=2`/vardai turn-based žaidimams). Žaidimo taisyklės neforkinamos.

### 2.9 Ko nebus v1

- Online / nuotolinis vakarėlis (skirtingi telefonai). Nuotolinės dvikovos lieka atskirai.
- Savaitinės grupės lyderių lentos poveikis; vakarėlis yra lokalus.
- 4 žaidėjai vienu metu prie kameros; visada 2 aktyvūs.
- Klipai po kiekvienos rungties.
- Parduotuvė, monetos, mokėjimai.
- Naujas judesių atpažinimas ar pratimų ribos.

---

## 3. UX

### 3.1 Įėjimas

- **Pradžia:** platus „Vakarėlis“ banneris po hero / greito starto: 4 veikėjų galvos, taurė, „2 komandos · 6 žaidėjai · iki 10 rungčių“, mygtukas „Kurti vakarėlį“. Jei yra aktyvus vakarėlis — „Tęsti vakarėlį · Raudoni 3 : 2 Mėlyni“.
- **Rungtys:** „Režimai“ kortelė virš sporto lentynos (tas pats banneris, kompaktiškas).
- **Ne atskiras tab'as:** vakarėlis yra režimas, ne nuolatinė navigacijos vieta.

### 3.2 Setup (`#/vakarelis`, naujas router view `party`)

1. **Hero:** „VAKARĖLIS“, šūkis, taurė + veikėjai, 3 žingsnių „Kaip tai veikia“.
2. **Komandos:** dvi kortelės (raudona / mėlyna). Kiekvienoje: komandos pavadinimas (numatytas „Raudoni“ / „Mėlyni“), žaidėjų sąrašas, „Pridėti žaidėją“. Žaidėjo eilutė: veikėjas, vardas, komanda. 2–8 žaidėjai, po 1–4 komandoje; mygtukas „Subalansuoti“ (3v3 / 2v2).
3. **Vakarėlio ilgis:** „Visos rungtys“ (pagal nutylėjimą) / „Iki 3“ / „Iki 5“ / „Iki 7“, su trukmės įvertinimu.
4. **Žaidimų pool'as:** MVP – 5 žaidimų tinklelis su jungikliais (visi įjungti). Vėliau – 6 pagrindiniai + beta atskiru jungikliu. Rodoma „5 rungtys“; bent 1.
5. **Taškai:** „Svertiniai“ (1–3 už rungtį) / „Paprasti“ (1 už rungtį), su pavyzdžiu.
6. **TV:** „Rodyti per TV“ atidaro esamą `#screenSheet` su kambario kodu; „TV prijungtas / Laukiama TV“.
7. **Pradėti:** `slide()` mygtukas „Pradėti vakarėlį“. Smulkus tekstas: „Kiekvienoje rungtyje žaidžia po vieną iš komandos. Visi keičiasi.“
8. **Paskutiniai vakarėliai:** paskutiniai 3 rezultatai su „Revanšas“ (jei yra).

Jei komandoje mažiau nei 1 žaidėjas arba iš viso mažiau nei 2 — „Pradėti“ neaktyvus su paaiškinimu.

### 3.3 Lobby

Tai pagrindinis vakarėlio ekranas. Jame:

- **Didelis rezultatas:** Raudoni 3 : 2 Mėlyni; prie kiekvieno — komandos spalva, veikėjas; jei „Iki 5“ — „iki 5“; jei „Visos“ — „liko 6 rungtys“.
- **Komandų sudėtys:** visi žaidėjai, kiek rungčių žaidė.
- **Sužaistos rungtys:** sąrašas (žaidimas, atstovai, laimėtojas, taškai). Paskutinė paryškinta.
- **Likę žaidimai:** ikonos / chipsai; „Liko 6 rungtys“.
- **CTA:** „Traukti rungtį“ (didelis). Jei yra neišbaigta rungtis — „Tęsti rungtį“.
- **Antriniai:** „Baigti vakarėlį“ (patvirtinti), „Pakeisti komandas“ (grįžti į setup; keisti galima tik prieš pradedant; kitu atveju „Naujas vakarėlis“ su patvirtinimu).
- **Paskutinė rungtis:** „Paskutinė: Siena — Raudoni +1“.
- **Pertrauka:** niekas nevyksta savaime; galima uždaryti programėlę, grįžti į Pradžią, vakarėlis lieka.

### 3.4 Traukimas

- Paspaudus „Traukti rungtį“: full-screen overlay su likusių žaidimų ikonomis, besisukančiomis 2–3 s; sulėtėja; sustoja ties vienu; būgnai (`sfx`), blyksnis.
- Po to — **leg card** (žemiau).
- Jei 1 žaidėjo rungtis ir tai pirma tokia — monetos metimas, kuri komanda pradeda; app parodo rezultatą.
- Traukimas neleidžiamas, jei jau yra neišbaigta rungtis.

### 3.5 Leg card (kas žaidžia?)

- **Viršuje:** „3 RUNGTS / 10“, sporto ikona, žaidimo pavadinimas, taškų chip („2 tšk.“), formato eilutė („2 žaidėjai vienu metu“ arba „Paeiliui · pradeda Raudoni“).
- **Viduryje:** dvi komandų kolonos. Kiekviena rodo savo žaidėjus; pasirinktas paryškinamas komandos spalva; po vardu „Žaidė: 2“.
- **Mygtukai:** „Pradėti“ (kai abi pasirinko), „Atgal“ / „Atšaukti“.
- **1 žaidėjo rungtis:** pirmos komandos kolona pažymėta „Pradeda“, antros — „Antras“.
- **2 žaidėjų rungtis:** abi kolonos lygiavertės; „Abu vienu metu“.
- **Pastaba:** komandos tariasi patys; app'as netikrina, ar pasirinkimas „teisingas“. Tai socialinė dalis.

### 3.6 Pasiruošimas / „pastatymas“

- Paspaudus „Pradėti“, vyksta įprastas `startFlow`: atidaroma kamera, modelis, užsklanda „Kraunama“, tada **esamas rankų pakėlimo gate** („Rankos aukštyn“).
- Leg card jau pasakė, kas turi stoti. 2 žaidėjų rungtyje gate reikalauja abiejų atstovų; 1 žaidėjo rungtyje — pirmojo.
- 1 žaidėjo rungtyje antrasis atstovas laukia; jo eilė ateina per žaidimo turn card'ą (ten yra savas gate).
- Tai išsprendžia „pastatymą“ be naujo gate ekrano: naudojamas tas pats, kurį žaidėjai jau pažįsta.

### 3.7 Žaidimas

- Žaidimas veikia įprastai, su savo HUD, garsais ir TV lenta.
- `prepareParty` nustato žaidimo rodomus vardus į atstovų vardus, kad HUD rodytų „Kometa / Banga“, o spalvos atitiktų komandas.
- Jokio papildomo party overlay žaidimo metu; neapkraunamas ekranas.

### 3.8 Rungties rezultatas

Kai žaidimas baigiasi ir įrašo istorijos eilutę, party parodo **rezultato overlay**:

- **„RAUDONI +2“** (komandos spalva), rungties rezultatas („12,34 s : 12,87 s“, „24 : 18“, „6,59 m : 6,10 m“ ir t. t.).
- **Atnaujintas bendras rezultatas:** „3 : 2“.
- **„Grįžti į vakarėlį“** — vienintelis veiksmas. **Jokio auto-advance:** grupė gali pasikalbėti, kol overlay'us laiko.
- Žaidimo savo rezultatų ekranas party metu **nerodomas** (party overlay jį pakeičia). Taip išvengiama konfliktuojančių „Žaisti dar kartą / Į pradžią“ mygtukų.
- Paspaudus „Grįžti į vakarėlį“: `resetGame()` nuvalo žaidimą/kamerą, `document.body.classList.remove("ingame","playing")`, `screenPhase("idle")`, `history.back()` grąžina į `#/vakarelis`; lobby atsinaujina su rezultatu ir paskutine rungtimi. Jei Android back apeina overlay'ų, tą patį cleanup'ą atlieka `onView("party")`.

### 3.9 Finalas

- Čempionų komanda, taurė, abiejų komandų veikėjai, konfeti (reduced-motion saugu).
- Galutinis rezultatas, skirtumas, „Naujas vakarėlio rekordas“ (didžiausias skirtumas šiame telefone).
- **MVP:** daugiausia rungčių laimėjęs žaidėjas; lygiosios — pagal bendrą indėlį.
- **Rungčių lentelė:** kiekviena rungtis: žaidimas, atstovai, laimėtojas, taškai, rezultatas.
- **Veiksmai:** „Revanšas“ (tos pačios komandos, tas pats pool'as, naujas traukimas), „Naujas vakarėlis“ (setup), „Į pradžią“.
- **Bendros lygiosios:** bendra taurė; v2 — papildoma rungtis.
- **Dalintis (pasirinktinai):** teksto suvestinė per esamą `share()`.

### 3.10 TV

- **Per rungtį:** įprasta žaidimo TV lenta (taškai, laikas, pratimas, rezultatas). Nereikia keisti protokolo.
- **Lobby / tarp rungčių:** v1 telefone; TV gali likti paskutinėje žaidimo būsenoje arba „Laukiama“. Phase 2 — atskira vakarėlio TV lenta: komandų pavadinimai, bendri taškai, rungčių taškai, „Auksinė“ žyma. Tam reikėtų `ScreenState` `party` lauko (viewer'is jį clamp'ina; seni TV ir toliau veikia).
- **Kamera per TV:** kadangi rungtys atskiros, kiekvienos rungties pradžioje stream'as startuoja įprastai, pabaigoje sustoja. Tai priimtina, nes tarp rungčių yra lobby.

### 3.11 Pertraukos ir tęsimas

- Vakarėlio būsena saugoma **`localStorage novacore.party`**, ne `sessionStorage`: galima uždaryti programėlę, grįžti po valandos ar kitą dieną.
- Pradžioje, jei yra aktyvus vakarėlis: „Tęsti vakarėlį“ (Raudoni 3 : 2 Mėlyni, liko 5 rungtys).
- Jei programa buvo užmušta rungties metu: būsena `playing`, bet istorijos eilutės nėra. Lobby siūlo „Kartoti rungtį“ arba „Atšaukti rungtį“ (grąžina žaidimą į pool'ą).
- Jei istorijos eilutė su `party` leg id jau yra (pvz., programa užsidarė po rezultato), lobby ją įskaito ir tęsia.
- „Baigti vakarėlį“ visada prieinama lobby'e; su patvirtinimu. Sužaistos rungtys lieka istorijoje.

### 3.12 Back / quit

- **Rungties metu:** back elgiasi kaip įprastame žaidime (dažniausiai nurijamas; rezultate — grąžina į lobby).
- **Lobby:** back į Pradžią; vakarėlis lieka. Jei nori baigti — atskiras mygtukas.
- **Leg card / rezultato overlay:** back = atgal į lobby (arba atšaukti rungtį, jei dar nepradėta).
- **Android back** eina per tą patį router'į; jokių naujų „neišeik“ taisyklių.

### 3.13 Kalba ir prieinamumas

- Visi tekstai per `t()`; `lt.ts` + `en.ts`.
- Pavadinimas: **LT „Vakarėlis“**, **EN „Party“**.
- Komandų vardai — vartotojo įvestis; numatyti „Raudoni“ / „Mėlyni“.
- 360 px ir 390 px portretas, 844×390 landšaftas; `prefers-reduced-motion`; `aria-live` taškams; fokusas ant „Toliau“ / „Grįžti į vakarėlį“; axe AA be critical.
- Jokių emoji; esamos Phosphor ikonos + `trophy` / `confetti`, jei trūksta.

---

## 4. Techninis planas

### 4.1 Architektūra

Vakarėlis **nėra** `GameMode`, kuris valdo kamerą per visas rungtis. Tai:

1. **Lobby route** `#/vakarelis` + party būsena `localStorage`.
2. **Kiekviena rungtis** paleidžiama kaip įprastas žaidimas per `startFlow(mode)` (arba `startFlow()` Rep Maratonui).
3. **Party sluoksnis** prieš startą nustato žaidimo formatą/vardus (`prepareParty`), o žaidimo `finish()` pabaigoje perima rezultatą (`partyLegDone`) ir parodo party overlay vietoj žaidimo rezultatų ekrano.

```
Lobby (#/vakarelis)
  ├─ Traukti rungtį → loterija → leg card
  ├─ Kas žaidžia? → komandų pasirinkimas
  ├─ Pradėti → prepareParty(cfg) → startFlow(mode)
  │     ├─ loading + camera + gate (esamas)
  │     ├─ game loop (esamas)
  │     └─ finish() → saveHist → partyLegDone() → party overlay
  └─ Grįžti į vakarėlį → resetGame() + history.back() → lobby
```

Kamera atidaroma ir uždaroma **kiekvienai rungčiai atskirai**, kaip įprastame žaidime. Nereikia laikyti kameros, modelio ar wake lock'o per visą vakarą.

### 4.2 Nauji failai

| Failas | Paskirtis |
|---|---|
| `src/party/logic.ts` | **PURE** (be DOM/storage): tipai, traukimas, komandų pasirinkimas, taškai, `legResult(row)`, būsenos validacija. Unit testai. |
| `src/party/bus.ts` | Mažas be ciklų: `partyActive()`, `partyLegDone()`, `setPartySink()`. Žaidimai importuoja tik jį. |
| `src/party/party.ts` | Setup, lobby, loterija, leg card, team pick, rezultato overlay, finalas, persistence, TV (vėliau). |
| `src/party/party.css` | Vakarėlio stiliai. |
| `test/unit/party.test.ts` | Traukimas, pasirinkimas, taškai, `legResult` visiems 10 režimų, lygiosios/DNF/foul, validacija. |
| `test/e2e/party.spec.ts` | Lobby → traukimas → team pick → Sprintas → rezultatas → lobby → Šuolis → finalas; 3v3; 1P eilė; back; a11y. |

### 4.3 Duomenų modelis

```ts
// src/party/logic.ts (PURE)
export type Team = 0 | 1;
export interface PartyPlayer { name: string; char: CharId; legs: number; }
export interface PartyLeg {
  game: string;
  points: number;
  golden: boolean;
  format: "solo" | "duo";
  lineup: [number, number];      // [team0 player index, team1 player index]
  starter: Team;                 // 1P: kuri komanda pradeda; 2P: 0 (nesvarbu)
  winner: Team | -1 | null;
  raw: [number | null, number | null];
  labels: [string, string];
  pts: [number, number];
  at: number;
}
export interface Party {
  v: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  teams: [{ name: string; players: PartyPlayer[] }, { name: string; players: PartyPlayer[] }];
  mode: "all" | "target";        // visos rungtys / iki N
  target: number;                // 3/5/7, jei mode="target"
  scoring: "weighted" | "simple";
  beta: boolean;
  pool: string[];                // likę žaidimai
  current: PartyLeg | null;      // ištraukta, dar nesužaista
  legs: PartyLeg[];              // sužaistos
  totals: [number, number];
  phase: "lobby" | "playing" | "done";
  nextStarter: Team;             // 1P eilė
}
```

- Aktyvus vakarėlis: `localStorage novacore.party`.
- Baigti vakarėliai: `localStorage novacore.parties` (max 10): `{t, teams, players, legs, totals, mvp}`.
- `validateParty(raw)` sutvarko/atmeta blogą būseną (kaip `readState()` clamp'ina TV būseną).

### 4.4 Party bus ir žaidimų integracija

Kiekvienas žaidimas gauna:

1. **`prepareParty(cfg)`** (per `GameMode.party?` arba atskirą eksportą):
   - nustato žaidimo lokalius formato kintamuosius: `n=2`, `names=[atstovasA, atstovasB]`, `S.players` (2 arba 1), `dur`, `frames`, `target`, pradedančią komandą;
   - **neatidaro kameros ir nekvietė `begin()`** — tai padarys `startFlow`.
2. **`finish()` apsauga:**
   ```ts
   saveHist(h);
   if (partyActive()) { partyLegDone(); return; } // be savo rezultatų ekrano, be klipų
   ```
   - Kameros/wake lock sustabdymas gali vykti įprastai (rungtis baigta).
   - Rep žaidime (`game.ts`) reikia atskiro `recordGame()` + `releaseWakeLock()`/`stopCamera()` party šakoje, nes jo `finish()` kitaip tvarko rezultatus.
3. **Niekas nekeičiama įprastame kelyje**, kai `partyActive()` false.

`GameMode` papildymas:

```ts
party?: (cfg: PartyLegCfg) => void; // prepareParty
```

### 4.5 Kaip paleidžiama rungtis

1. Lobby: `prepareParty(cfg)` kiekvienam žaidimui nustato:
   - `S.players = 2` (2P) arba `1` (1P turn-based);
   - `S.st = [{}, {}]`, `resetTracking()`;
   - žaidimo vardus į atstovų vardus;
   - `n=2` (turn-based) arba S.players=2 (simultaneous);
   - pradedančią komandą (1P): žaidimo P1 = starterio atstovas, P2 = kitos komandos atstovas.
2. `startFlow(mode)` atidaro kamerą + modelį, parodo loading + esamą gate, paleidžia `mode.start()`.
3. 2P: gate reikalauja abiejų atstovų rankų; 1P: pirmojo. Antrasis 1P atstovas įeina per žaidimo turn card'ą.
4. Žaidimas baigiasi → `finish()` → `saveHist` → `partyLegDone()`.
5. Party overlay → „Grįžti į vakarėlį“ → `resetGame()`, `body.classList.remove("ingame","playing")`, `screenPhase("idle")`, `history.back()`.

### 4.6 Rezultato nuskaitymas

`partyLegDone()` ima `loadHist()[0]` (žaidimas ką tik įrašė) ir kviečia `legResult(row, leg)`.

| mode | Metrika | Laimi | Lygiosios |
|---|---|---|---|
| `rr` (rep) | `score` | didesnis | po 1 tšk. |
| `sprint`, `hurdles`, `ski` | `times` | mažesnis; null = DNF | po 1 tšk. |
| `boxing` | `pts` | didesnis | po 1 tšk. |
| `longjump` | geriausias `jumps[p]` | didesnis; null = foul | 2-u bandymu |
| `javelin` | galiojančių `throws[p]` suma | didesnė | geriausiu metimu |
| `bowling` | `bwTotals` | didesnis | po 1 tšk. |
| `wall` | `reps` (sienos) | daugiau | `secs` |
| `badminton` | `bdScore` | didesnis | negalimos |
| fallback | `score` | didesnis | po 1 tšk. |

- Gražinama `raw`, `labels`, `winner` **komandų tvarka**, ne P1/P2 tvarka.
- 1P: `row` masyvai yra P1/P2 tvarka; P1 = `starter`. Todėl `legResult` pirmiausia permapping'ina `[P1, P2]` → `[team0, team1]`.
- 2P: P1 = team0, P2 = team1; mapping tiesioginis.
- Visi null / visi foul / abu DNF = lygiosios.
- Po to eilutė papildoma `party` metadata ir išsaugoma:
  ```ts
  row.party = { id, game, points, lineup, starter, winner, pts: [a, b] };
  ```

### 4.7 Komandų ir žaidėjų priskyrimas P1/P2

- **2P:** `P1 = team0 atstovas`, `P2 = team1 atstovas`. Abu vienu metu; eilė nesvarbi.
- **1P:** `P1 = starterio atstovas`, `P2 = kitos komandos atstovas`. Žaidimas pradeda P1; antras — P2.
- Party `PartyLeg.lineup` saugoma **komandų tvarka** (team0, team1), kad lobby lentelė būtų teisinga.
- `legResult` naudoja `starter`, kad permappintų.
- Kitą 1P rungtį `nextStarter = 1 - starter` (kaitaliojimas). Pirmą 1P rungtį nustato monetos metimas.

### 4.8 TV

- **v1:** kiekviena rungtis naudoja įprastą žaidimo TV lentą. Tarp rungčių TV nebūtinai ką nors rodo; telefonas yra pagrindinė lenta.
- **v2 (Phase 2):** `ScreenState` papildomas `party` lauku:
  ```ts
  party?: {
    names: [string, string];
    pts: [number, number];
    leg: number; legs: number;
    legName: string;
    golden: boolean;
    mvp?: string;
  }
  ```
  `readState` clamp'ina (vardai 12, pts 0–99, leg 0–10). `screen.ts` renderina atskirą vakarėlio lentą. Seni TV be `party` ir toliau rodo seną vaizdą.
- **Lobby TV:** v2 gali rodyti bendrą rezultatą, kai telefonas lobby'e; tam reikia `screenPhase("play")` + `setScreenMode(partyTv)` lobby metu. v1 — ne.

### 4.9 Istorija, XP, trofėjai

- Kiekviena rungtis įrašo **įprastą istorijos eilutę** (žaidimas tai jau daro). Ji skaičiuojama XP, serijai, savaitės tikslui, rekordams.
- **Jokios suvestinės eilutės** `novacore.history` v1, kad nedvigubintų savaitės tikslo. Vakarėlio suvestinė — `novacore.parties`.
- `Game` (`src/history/stats.ts`) gauna neprivalomą `party` metadata lauką.
- **Trofėjai (Phase 2):** „Vakarėlio debiutas“ (baigti vakarėlį), „Komandos dvasia“ (3 vakarėliai), „Auksinė ranka“ (laimėti paskutinę rungtį). Skaito `party` metadata / `novacore.parties`; jokių DB migracijų.
- **Savaitinė grupės lenta:** nesikeičia; vakarėlio rungtys nesiunčiamos į Supabase.

### 4.10 Persistencija ir gedimai

- **Tęsimas:** `localStorage novacore.party`; Home banneris „Tęsti vakarėlį“.
- **Rungties metu programa užsidarė:** būsena `playing`; lobby siūlo „Kartoti rungtį“ / „Atšaukti“. Istorijos eilutė atsiranda tik po `finish()`.
- **Kamera nepavyko:** įprastas `startFlow` klaidos kelias (toast, grįžimas į lobby); „Bandyti dar kartą“.
- **Žaidimas nepaleidžiamas:** leg card → „Bandyti dar kartą“ / „Praleisti rungtį“ (be taškų).
- **TV neprisijungęs:** vakarėlis veikia; cast sheet rodo įprastą būseną.
- **Netikėtas uždarymas po rezultato:** eilutė su `party` leg id jau yra; lobby įskaito ir tęsia.

### 4.11 Failai

| Sritis | Failai |
|---|---|
| Nauji | `src/party/logic.ts`, `src/party/bus.ts`, `src/party/party.ts`, `src/party/party.css` |
| Įėjimas | `src/main.ts` (importas po žaidimų), `src/ui/router.ts` (view `party`, `#/vakarelis`), `src/ui/home.ts` (banneris / „Tęsti“), `src/ui/chars.ts` (party ikona, jei reikia) |
| Core | `src/game/game.ts` (rep party start/cleanup, `finish()` party šaka), `src/game/state.ts` (jei reikia bendro flag) |
| Žaidimai | `src/sprint/sprint.ts`, `src/boxing/boxing.ts`, `src/longjump/longjump.ts`, `src/hurdles/hurdles.ts`, `src/bowling/bowling.ts`, `src/ski/ski.ts`, `src/wall/wall.ts`, `src/javelin/javelin.ts`, `src/badminton/badminton.ts` (prepareParty + finish guard) |
| Istorija | `src/history/stats.ts` (`party?`), `src/history/history.ts` (metadata išsaugojimas) |
| i18n | `src/i18n/lt.ts`, `src/i18n/en.ts` |
| Testai | `test/unit/party.test.ts`, `test/e2e/party.spec.ts`, `tools/screens.cjs`, `test/unit/router.test.ts` |

`index.html` nereikia keisti, jei setup/lobby/overlay DOM kuriamas `party.ts` (kaip mini žaidimai).

---

## 5. Planas

### 5.1 Etapai

| Etapas | Apimtis | Įvertinimas |
|---|---|---:|
| **0. Sprendimai + maketai** | Patvirtinti taisykles ir pavadinimą; 4 telefono maketai + 1 TV rėmas; galutiniai tekstai | 1–2 d. |
| **1. Gryna logika** | `logic.ts` + `party.test.ts`: traukimas, pasirinkimas, taškai, `legResult` visiems 10 | 2 d. |
| **2. Setup + lobby** | `#/vakarelis`, komandos, ilgis, taškai, lobby, loterija, leg card, team pick, rezultato overlay, finalas, persistence | 4 d. |
| **3. Adapteriai A** | Rep (game.ts), Sprintas, Šuolis į tolį, Boksas | 3 d. |
| **4. Adapteriai B** | Slidinėjimas, Barjerai, Siena, Ietis | 3 d. |
| **5. Adapteriai C** | Boulingas, Badmintonas | 2 d. |
| **6. TV + poliravimas** | TV v1/v2, konfeti, garsai, 360/landšaftas, a11y, trofėjai | 3 d. |
| **7. Testai + telefonas** | E2E, screenshots, 30 min. realaus vakarėlio testas, baterija/karštis | 2–3 d. |
| **Viso** | Visi 10 žaidimų | **~20–24 žmogaus dienos** |
| **MVP** | 5 žaidimai (Rep, Sprintas, Šuolis, Boksas, Siena), lobby + traukimas + 2P/1P, paprastas rezultatas | **~8–10 žmogaus dienų** |

Su dviem žmonėmis lygiagrečiai (vienas — logika/lobby, kitas — adapteriai/TV) — pilnas vakaras ~2 savaitės kalendoriaus; MVP ~1 savaitė.

### 5.2 Laikas po 11-06

11-06 pateikimas rytoj, todėl siūlau **pateikti koncepciją** (vienas skaidrės punktas / vienas pastraipa), o koduoti po 11-08, kai Ignas grįžta.

| Data | Rezultatas |
|---|---|
| 11-06 | Koncepcijos pateikimas; jokios kodo rizikos |
| 11-08–11-10 | Sprendimai, maketai, gryna logika + testai |
| 11-11–11-15 | Setup + lobby + loterija + Rep/Sprintas/Šuolis/Boksas; pirmas žaidžiamas 3 rungčių vakaras |
| 11-16–11-20 | Likę adapteriai + TV v1; **MVP demonstracija** su 5 žaidimais |
| 11-21–11-27 | Visi 10, TV v2, trofėjai, poliravimas, a11y |
| 11-28–11-30 | E2E + realaus telefono testai (3v3, 1P eilė, tęsimas), pataisymai |
| 12-01 | Užšaldymas; finalinė prezentacija |
| 12-02 | Galutinis pateikimas (EN prezentacija) |

Jei 11-06 pitch'ui reikia demo — 3 rungčių demo (Sprintas + Šuolis + Boksas) per 3–4 d., bet nestabdyti pateikimo.

### 5.3 Priėmimo kriterijai

- Iš `#/vakarelis` 3v3 komanda gali pradėti vakarėlį, ištraukti rungtį, pasirinkti atstovus ir sužaisti ją su realia kamera.
- 1P rungtis: pradeda ištraukta komanda, po jos — kita; abu rezultatai įskaitomi; laimėtojas gauna taškus.
- 2P rungtis: abu atstovai vienu metu; laimėtojas gauna taškus.
- Po rungties grįžtama į lobby; rezultatas atnaujinamas; galima uždaryti programėlę ir tęsti.
- „Visos rungtys“: kiekvienas žaidimas ištraukiamas lygiai kartą; „Iki 5“: baigiama pasiekus 5 ir esant priekyje.
- 1P eilė kaitaliojasi; rodoma kortelėje.
- Back: rungties metu kaip įprasta; lobby — į Pradžią; „Baigti“ — patvirtinimas.
- Kiekviena rungtis įrašo normalią istorijos eilutę su `party` metadata; savaitės tikslas/serija/XP skaičiuoja rungtis, ne suvestinę.
- `npm test` ir `npm run test:e2e` žali; naujas `party.spec.ts`; screenshots 360/390/landscape; jokių critical a11y.
- Įprasti žaidimai nepakitę, kai `partyActive()` false.

### 5.4 Testai

**Unit (`test/unit/party.test.ts`):**
- Traukimas: tik iš pool'o, be pasikartojimų, beta filtravimas, tuščias pool, „Visos“ vs „Iki N“.
- Komandų pasirinkimas: 3v3, 2v2, 1P eilė, starterių kaitaliojimas, negalimas tuščias pasirinkimas.
- Taškai: svertiniai/paprasti, lygiosios, dviguba rungtis, target pasiekimas, lygiosios po paskutinės.
- `legResult`: visi 10 režimų, didesnis/mažesnis, null/DNF, visi foul, lygiosios, 2-o bandymo tie-break, Sienos `secs` tie-break, P1/P2 → team mapping.
- Validacija: sugadinta/sena būsena, trūkstamos rungtys, `playing` atkūrimas.

**E2E (`test/e2e/party.spec.ts`):**
- 3v3 setup; traukimas su testiniu hook'u į `["sp","lj","wl"]`; team pick; Sprintas su `__sp.feed(3)`; rezultatas 2:0; lobby; Šuolis su `__lj.feed`/`.jumpAt(28.8)`; Siena su `__wl.force`; finalas.
- 1P eilė: pirmoji komanda, antra; rezultatų mapping.
- 2P: abu atstovai.
- Tęsimas: reload lobby; „Tęsti“; taškai išlieka.
- Back: lobby → Pradžia; rungties metu; rezultato overlay.
- a11y: setup, lobby, leg card, rezultatas, finalas.
- Screenshots 390×844 ir 360×780.

**Rankinis telefonas:**
- 3v3, 6–10 rungčių (su beta), TV; 30–40 min.; kamera tarp rungčių, baterija/karštis, 1P eilė, komandų pasirinkimas, lygiosios, praleista rungtis, uždarymas/tęsimas, Android back.

---

## 6. Rizikos ir sprendimai

| Rizika | Sprendimas |
|---|---|
| Traukimas ištraukia nepatogų žaidimą (trauma, vieta) | „Praleisti rungtį“ be taškų; „Atšaukti“ prieš startą grąžina į pool'ą |
| Komanda visada renkasi tą patį žaidėją | Rodoma „Žaidė: N“; rekomendacija, ne prievolė; komanda atsakinga už pramogas |
| 1P antras žaidėjas turi pranašumą (mato rezultatą) | Starterių kaitaliojimas; rodoma eilė; galima rinktis atsiliekančią komandą |
| P1/P2 → komandų mapping klaidos | Gryna `legResult` su testais visiems režimams; `starter` saugomas |
| Kamera atsidaro kiekvienai rungčiai (2–3 s) | Priimtina, nes tarp rungčių yra lobby; nėra non-stop reikalavimo |
| TV tarp rungčių nieko ne-rodo | v1 telefonas yra lenta; v2 atskira party TV lenta |
| 10 adapterių apimtis | Etapais; MVP su 5; Rep/Boulingas/Badmintonas sudėtingiausi |
| Programėlė užsidaro rungties metu | Būsena `playing`; „Kartoti“ / „Atšaukti“; eilutė su leg id atpažįstama |
| Savaitės tikslo dvigubinimas | Jokios suvestinės eilutės; tik rungčių eilutės |
| Beta žaidimai nepatikrinti telefonu | Pagal nutylėjimą išjungti; įjungiama sąmoningai |

### Sprendimai, kurių reikia

1. **Vakarėlio ilgis:** „Visos rungtys“ (rekomenduojama, atitinka „sujunk visus žaidimus“) ar „Iki 5 taškų“ (greitesnis)?
2. **Taškai:** svertiniai 1–3 (rekomenduojama, atitinka „1 ar daugiau“) ar paprasti 1 už rungtį?
3. **Pradedančioji komanda:** kaitaliojimas (rekomenduojama) ar atsiliekanti komanda? Ar pirmai 1P rungčiai monetos metimas?
4. **Komandų dydis:** 1–4 žaidėjai komandoje (2–8 iš viso; pvz., 3v3) — tinka?
5. **Pavadinimas:** „Vakarėlis“ (rekomenduojama) ar „Komandų vakaras“ / „Didysis vakaras“?

### Ateitis (neįsipareigota)

- Nuotolinis vakarėlis dviem telefonams / komandoms; grupės + Realtime + dvikovos laikrodžio sinchronizavimas; `004_party.sql` ir Ignui.
- Savaitinė „kompanijos vakaro“ lyga.
- Dalijimosi rezultato paveikslėlis / video.
- Vakarėlio trofėjai ir XP bonusas.
- 4 žaidėjai vienu metu, jei atsiras 4 pozų žaidimas.
- TV žiūrovų balsavimas (kitą rungtis / dviguba rungtis).

---

## 7. Priedai

### 7.1 Pavyzdinė vakaro lentelė (3v3, visos rungtys)

| # | Rungtis | Atstovai | Laimėtojas | Taškai | Rezultatas |
|---:|---|---|---|---:|---|
| 1 | Sprintas 100 m | Kometa vs Banga | Kometa | 2 | 12,34 : 12,87 s |
| 2 | Šuolis į tolį | Saulė vs Banga | Banga | 2 | 6,10 : 6,59 m |
| 3 | Boksas 30 s | Kometa vs Mėta | Kometa | 1 | 24 : 18 |
| 4 | Siena | Saulė vs Mėta | Mėta | 1 | 6 : 7 sienos |
| 5 | Rep Maratonas | Kometa vs Banga | Banga | 3 | 88 : 104 |
| … | … | … | … | … | … |
| | **Galutinis** | | **Banga** | **12 : 9** | |

MVP: Banga (4 rungčių pergalės).

### 7.2 Pavyzdinis `Party` JSON

```json
{
  "v": 1,
  "id": "p-8f3a",
  "createdAt": 1762300800000,
  "updatedAt": 1762304400000,
  "teams": [
    {"name": "Raudoni", "players": [
      {"name": "Kometa", "char": "r", "legs": 4},
      {"name": "Saulė", "char": "y", "legs": 3},
      {"name": "Mėta", "char": "g", "legs": 3}
    ]},
    {"name": "Mėlyni", "players": [
      {"name": "Banga", "char": "b", "legs": 4},
      {"name": "Rūta", "char": "r", "legs": 3},
      {"name": "Tomas", "char": "y", "legs": 2}
    ]}
  ],
  "mode": "all",
  "target": 0,
  "scoring": "weighted",
  "beta": false,
  "pool": ["bx", "lj", "hd", "bw", "sk", "wl", "bd", "jv"],
  "current": null,
  "legs": [
    {"game": "sp", "points": 2, "format": "duo", "lineup": [0, 0], "starter": 0,
     "winner": 0, "raw": [12.34, 12.87], "labels": ["12,34 s", "12,87 s"], "pts": [2, 0]}
  ],
  "totals": [2, 0],
  "phase": "lobby",
  "nextStarter": 1
}
```

### 7.3 i18n raktų grupės

`party.title`, `party.tagline`, `party.how1..3`, `party.teams`, `party.teamA/B`, `party.players`, `party.add`, `party.remove`, `party.balance`, `party.need2`, `party.mode`, `party.modeAll`, `party.modeTarget`, `party.untilN`, `party.points`, `party.pointsW`, `party.pointsS`, `party.beta`, `party.tv`, `party.start`, `party.lobby`, `party.draw`, `party.drawing`, `party.poolLeft`, `party.legCard`, `party.pointsAtStake`, `party.solo`, `party.duo`, `party.starter`, `party.second`, `party.whoPlays`, `party.playedN`, `party.startLeg`, `party.cancel`, `party.skip`, `party.skipSub`, `party.result`, `party.takes`, `party.tie`, `party.tiePts`, `party.backToParty`, `party.standings`, `party.lastLeg`, `party.finishParty`, `party.finishSub`, `party.finishYes`, `party.finishNo`, `party.resume`, `party.resumeSub`, `party.champions`, `party.mvp`, `party.rematch`, `party.newParty`, `party.home`, `party.record`, `party.margin`, `party.noGames`, `party.gameGone`, `party.camFail`, `party.retry`, `party.coin`, `party.coinStarts`.

Visi `lt.ts` ir `en.ts`, tie patys `{params}`; daugiskaita per `tn`.
