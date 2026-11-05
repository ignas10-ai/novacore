# Vakarėlio režimas („Vakarėlis“) — koncepcija ir įgyvendinimo planas

**Statusas:** MVP įgyvendintas · 2026-11-05 · šaka `claude/71-party-mvp`
**Viena frazė:** *Visi žaidimai. Viena komanda. Viena taurė.*
**Angliškai:** Party Mode.

> **Galutinis 2026-11-05 srautas (viršija žemiau esančius senus punktus):** žaidėjų vardų ir pasirinkimo **nėra** – tik dviejų komandų pavadinimai, o prie kameros stoja kas nori. Paleidus: 3,8 s disco kamuolio intro (be skip; žaidimai iššoka ir toliau sukasi aplink kamuolį) → 5 s 1v1 VS kortelė → automatinis traukimas → automatinis žaidimo paleidimas (be „Stok prieš kamerą“ mygtuko) → **best-of-3 serija** (pirma komanda, laimėjusi 2 raundus; daugiausia 3) → raundo rezultatas (auto po 5 s) → serijos rezultatas (auto po 6 s) → disco lobby, kuris po 5 s vėl traukia automatiškai. Taškai: 1 už seriją, 0,5 lygiosios, viena 2× comeback serija. Muzika groja **tik žaidimo metu** (po rankų gate iki raundo pabaigos). Komandų pavadinimai rodomi vietoj P1 pasiruošimo ekrane ir HUD. Kataloge kortelė vadinasi **„Party Mode“**, be paantraštės, su didesniu šriftu ir sulygintu tekstu. Lobby/finalas – tamsus neoninis disco klubas. Žemiau esantis planas likęs istorinis; kur prieštarauja, vadovaukitės šiuo bloku.
>
> **Ankstesnis MVP įgyvendinimas:** visi **10 žaidimų** (6 pagrindiniai + 4 beta su jungikliu), 2 komandos, 1–4 žaidėjai komandoje. Srautas: setup → **5 s gaublio intro** → lobby, kuriame komandos pasirenka po atstovą → **automatinis rungties traukimas** su CS:GO dėžės / marmuro lenktynių animacija → „Stok prieš kamerą“ kortelė → įprastas `startFlow` žaidimas → rezultatas → lobby. **Žaidėjų vardų nereikia** – žaidėjai žymimi „Raudoni 1“, „Mėlyni 1“ ir t. t. **Taškai:** 1 už pergalę, 0,5 lygiosios, viena **2× comeback** rungtis (kai komanda atsilieka 2+ arba tai paskutinė rungtis). Pridėta **vakarėlio muzika** (`src/party/music.ts`, 2 NCS takeliai, tik žaidimo metu). 8 nauji SVG veikėjai naudojami kitų žaidimų setup galerijose ir HUD/rezultatų eilutėse (ne vakarėlio setup'e / rezultate / MVP). Startas – vaivorykštinis slideris su stipria įkrova; TV – **žaidimo veidrodis** per esamą WebRTC; tęsimas per `localStorage`. **Dar ne:** atskira vakarėlio TV taškų lenta, paskutinių vakarėlių sąrašas, trofėjai.
>
> **Pastaba:** žemiau esantis ilgas planas buvo parašytas prieš pirmą MVP ir kai kurios detalės (rankinis „Traukti rungtį“, vardų įvedimas, svertiniai taškai) buvo pakeistos aukščiau aprašytu srautu. Laikykis viršaus, o ne pasenusių punktyrinių fragmentų.

---

## 1. Pitch

### 1.1 Problema

MoveClash turi 10 mini žaidimų, bet grupė vis dar žaidžia juos po vieną: atidaryk žaidimą → nustatymai → žaidėjai → žaidimas → rezultatas → atgal → kitas žaidimas. Tarp žaidimų dingsta tempas, niekas nežino, kas „laimi vakarą“, o žiūrovai neturi bendros lentelės. Trūksta sluoksnio, kuris 10 žaidimų paverstų vienu vakaru.

### 1.2 Idėja

**Vakarėlis yra bendra komandų lyga, kurią sudaro atskiros rungtys.** Dvi komandos (raudona / mėlyna), po 1–4 žaidėjus (pavyzdys: 3 prieš 3, 6 žmonės). Kiekviena rungtis — esamas MoveClash žaidimas, paleidžiamas iš vakarėlio lobby. Po rungties grįžtama į lobby, kur matosi bendras rezultatas, sužaistos rungtys ir likę žaidimai. Tada traukiama kita rungtis.

Tai **ne naujas žaidimas** ir **ne non-stop sesija**. Tai vakaro rezultatų lenta + atskiri žaidimai, kuriuos galima žaisti savo tempu, daryti pertraukas, net uždaryti programėlę ir tęsti vėliau.

### 1.3 Kaip atrodo vakaras (60 s)

1. Telefonas ant grindų, TV atidarytas per `#/ekranas/<kodas>`.
2. Telefone: **Vakarėlis** → įvedami tik komandų pavadinimai „Raudoni“ ir „Mėlyni“. Žaidėjų vardų/pasirinkimo nėra.
3. Paspaudus startą – disco kamuolio intro, 1v1 kortelė ir **automatinis traukimas**; nieko spausti nereikia.
4. Ištraukta **Siena**; žaidimas paleidžiamas automatiškai. Kas nori, tas stoja prie kameros; rankų pakėlimas duoda laiko pasikeisti.
5. Siena žaidžiama **best-of-3**: raundai, kol viena komanda laimi 2. Po kiekvieno raundo – rezultatas ir automatinis kitas raundas (5 s).
6. Seriją laimėjusi komanda gauna tašką; 1:1 serijoje trečias raundas sprendžia. Po serijos – disco lobby, kuris po 5 s vėl traukia rungtį.
7. Taip visos rungtys (6 pagrindinės, o įjungus beta — 10) arba iki 5 taškų; viena serija bus **2×** (comeback). Pabaigoje — čempionas, rezultatas, serijų lentelė ir „Revanšas“.

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
- **Komandų dydis neįvedamas.** App'e nėra žaidėjų skaičiaus, vardų ar eilių; prie kameros stoja kas nori. Komanda gali turėti 2–8 žmones, bet tai socialinis susitarimas, ne nustatymas.
- **Žaidėjų vardų nėra.** Naudojami tik komandų pavadinimai ir baziniai komandų veikėjai (Kometa / Banga), o ne 8 nauji chibi veikėjai.
- **Vienoje rungtyje žaidžia po vieną atstovą iš komandos.** Tai pagrindinis supaprastinimas:
  - tinka visiems 10 žaidimų be 4 žaidėjų agregavimo taisyklių;
  - rungtis lieka 1–4 min. (best-of-3 serija – 2–3 raundai);
  - visi turi rolę: žaidi, palaikai, ruošiesi;
  - taškus gauna komanda; MVP nėra.
- **Komanda pati tariasi, kas stos.** App'as nieko nepasirenka ir netikrina; tai socialinė dalis. 1P serijoje starteris keičiasi kiekvieną raundą, todėl komandos gali keisti atstovus.
- **3 prieš 3 pavyzdys:** kiekviename raunde po vieną iš komandos; kiti du palaiko. Per 2–3 raundus kiekvienas žaidėjas gali gauti progą.

### 2.2 Rungties traukimas

- **Nėra „Traukti rungtį“ mygtuko ir jokio pasirinkimo.** Pirmą kartą po disco intro ir 1v1 kortelės, vėliau iš lobby po 5 s, rungtis ištraukiama **automatiškai** ir parodoma per animaciją.
- **Be pasikartojimų:** kol yra nežaistų žaidimų, tas pats žaidimas nekartojamas.
- **Pool'as:** 6 pagrindiniai žaidimai (Rep Maratonas, Sprintas, Boksas, Šuolis į tolį, Slidinėjimas, Siena) + 4 beta (Barjerai, Boulingas, Badmintonas, Ietis), įjungiami „Įtraukti beta rungtis“ jungikliu. Setup'e galima atjungti ir atskirus žaidimus; turi likti bent 1.
- **Animacija keičiasi:** **6 skirtingi ilgesni traukimai** – CS:GO kortelių karuselė, marmuro lenktynės, ruletės ratas, slotų mašina, smiginio lenta ir kortų fanas, **traukiami atsitiktinai ir nekartojant paskutinių dviejų**. Kiekvienas naudoja žaidimų spalvas ir sporto ikonas, trunka ~5,2–5,8 s + ~1,1 s nugalėtojo atskleidimą. Atskleidimas iškart paleidžia žaidimą.
- Jei liko 0 žaidimų, vakarėlis baigiasi (daugiausia taškų turinti komanda laimi; lygiosios — žr. 2.7).
- **Atšaukti seriją** galima tik grįžus į lobby su „Tęsti seriją“ / „Baigti vakarėlį“; atskiro „Praleisti rungtį“ nėra. Jei rungtis neįmanoma (trauma), vakarėlį galima baigti lobby'je.

### 2.3 Kas žaidžia? (be pasirinkimo)

- **App'e niekas nepasirenkamas.** Komandos žaidėjai patys nusprendžia, kas stos prie kameros; app'as rodo tik komandos pavadinimą.
- **2 žaidėjų žaidime** (Sprintas, Boksas, Slidinėjimas, Barjerai, Badmintonas, Rep Maratonas) abu atstovai stoja vienu metu ir kovoja.
- **1 žaidėjo žaidime** (Siena, Šuolis į tolį, Ietis, Boulingas) komandos žaidžia paeiliui: pirmos komandos atstovas, tada antros. Žaidimo „turn card“ pats perima antrą žaidėją.
- **Pradedančioji komanda** rodoma pasiruošimo ekrane: „Pradeda: Raudoni · antras: Mėlyni“. 1P serijoje starteris keičiasi kiekvieną raundą.
- **Nėra „Stok prieš kamerą“ mygtuko:** po traukimo žaidimas paleidžiamas automatiškai; laiko atsistoti duoda įprastas rankų pakėlimo gate.
- **Bendri komandų pavadinimai** rodomi vietoj P1/P2 pasiruošimo ekrane ir rep žaidimo HUD.

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

- **Pirmoji 1 žaidėjo serija:** burtai (monetos metimas) prieš pirmą raundą. App parodo „Pradeda: Raudoni“.
- **Vėlesni 1 žaidėjo serijos raundai:** starteris **kaitaliojasi kiekvieną raundą** (1-as, 2-as, 3-as). Po serijos kita solo serija pradeda nuo tos komandos, kuri nepradėjo paskutinio raundo.
- **2 žaidėjų žaidimuose** pradedančios komandos nėra — abu pradeda kartu.
- Pasiruošimo ekranas visada rodo, kuri komanda pradeda.

### 2.6 Taškai

**Vienodas už visą vakarą:** kiekviena **serija** verta **1 taško** (0,5 kiekvienai, jei serija lygi). Seriją laimi komanda, pirmoji pasiekusi **2 raundų pergales**; daugiausia 3 raundai. Jei po 3 raundų komandos turi po tiek pat pergalių, serija lygi.

- **2× comeback serija:** lygiai **viena** per vakarą. Ji traukiama, kai po serijos viena komanda atsilieka **2+ taškais**, arba automatiškai kaip **paskutinė likusi rungtis**, jei dviguba dar nebuvo panaudota. Laimėjimas duoda 2 taškus, lygiosios – po 1. Tai leidžia atsilošti iš 2 taškų deficito, bet ne apverčia viso vakaro.
- **Paskutinė rungtis** niekada nėra „Auksinė“ atskirai – ji dviguba tik pagal tą pačią taisyklę.
- Setup'e taškų sistemos rinktis nebereikia; yra tik vakarėlio ilgis („Visos rungtys“ / „Iki 5“).

### 2.7 Vakarėlio pabaiga

Du režimai:

1. **„Visos rungtys“ (pagal nutylėjimą):** sužaidžiama viskas, kas pateko į pool'ą (iki 10). Laimi daugiausia taškų turinti komanda. Tai geriausiai atitinka „sujunk visus žaidimus“.
2. **„Iki 5 taškų“:** vakarėlis baigiasi, kai po serijos viena komanda turi 5 taškus ir yra priekyje.

- **Ankstesnis sustabdymas:** lobby mygtukas „Baigti vakarėlį“ (patvirtinus). Skelbiamas lyderis; jei lygiosios — bendra taurė arba papildoma rungtis.
- **Lygiosios po paskutinės rungties:** v1 — bendra taurė; v2 — „Dar viena rungtis“ (sudden death, atsitiktinė iš likusių arba bet kuri).
- **Jei visos rungtys sužaistos, o taškai lygūs:** bendra taurė (v1).

### 2.8 Žaidimų formatai

Kiekviena rungtis — 2 aktyvūs žaidėjai (po vieną iš komandos). **Kiekviena eilutė žaidžiama kaip best-of-3 serija (2–3 raundai); taškas už visą seriją visada 1 (arba 2 comeback serijai).**

| Žaidimas | Formatas vakarėlyje | Trukmė (raundo) | Taškai (serijos) | Pastabos |
|---|---|---:|---:|---|
| **Rep Maratonas** (`rr`) | 30 s, 1 raundas; abu atstovai vienu metu | 30 s | 1 | Pratimų rinkinys: pritūpimai + šuoliukai + keliai + šoniniai. |
| **Sprintas** (`sp`) | 100 m, 2 takeliai, vienas bėgimas | 1 min | 1 | Įprasta ankstyvo starto taisyklė. |
| **Boksas** (`bx`) | 30 s, abu vienu metu | 1 min | 1 | Vakarėlyje klipas neįrašomas. |
| **Šuolis į tolį** (`lj`) | po 3 bandymus, paeiliui | 2 min | 1 | Geresnis šuolis; lygiosios — 2-u bandymu; foul = X. |
| **Barjerai** (`hd`) | 100 m, 2 takeliai | 1 min | 1 | Beta; pagal nutylėjimą išjungta. |
| **Boulingas** (`bw`) | po 3 kadrus, paeiliui | 3–4 min | 1 | Bendras kėglių skaičius; beta; ilgiausia rungtis. |
| **Slidinėjimas** (`sk`) | 2 žaidėjų lenktynės, tas pats 400 m kursas | 1 min | 1 | Split-screen; abu vienu metu. |
| **Siena** (`wl`) | po 1 bandymą, paeiliui | 1 min | 1 | Daugiau sienų; lygiosios — ilgesnis laikas. |
| **Badmintonas** (`bd`) | rungtynės iki 11 (vėliau galima 7) | 3–5 min | 1 | Beta; ilgiausia rungtis. |
| **Ietis** (`jv`) | po 3 metimus, paeiliui | 2 min | 1 | Galiojančių metimų suma (kaip žaidimo reitinge); lygiosios — geriausias metimas. |

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

1. **Nav + hero:** atgal, „Vakarėlis“, TV mygtukas; `gallery("party")` 3 panelių sporto emblemos hero.
2. **Komandos:** dvi kortelės (raudona / mėlyna). Kiekvienoje: tik komandos pavadinimas (numatytas „Raudoni“ / „Mėlyni“) ir komandos avataras. **Jokių žaidėjų eilių, vardų ar „Pridėti žaidėją“.**
3. **Vakarėlio ilgis:** „Visos rungtys“ (pagal nutylėjimą) / „Iki 5 taškų“.
4. **Žaidimų pool'as:** 6 pagrindinių žaidimų chip'ų tinklelis; beta jungiklis atskleidžia ir įjungia 4 beta žaidimus (viso 10). Bent 1 žaidimas.
5. **TV ir muzika:** „Rodyti per TV“ atidaro esamą `#screenSheet`; atskiras „Rodyti žaidimą per TV“ (mirror) jungiklis (numatytas įjungtas) ir „Muzika“ jungiklis (numatytas įjungtas, `novacore.partyMusic`) su NCS kūrinių priskyrimu smulkiu tekstu.
6. **Pradėti:** `slide()` mygtukas „Pradėti vakarėlį“, vaivorykštinis su stiprėjančia aura. Paleidus – disco kamuolio intro (be skip), 1v1 kortelė ir automatinis traukimas.

Jei neįrašyti abu komandų pavadinimai arba pasirinkta 0 žaidimų — „Pradėti“ rodo paaiškinimą ir neveda į intro.

### 3.3 Lobby

Tai pagrindinis vakarėlio ekranas; dabar tamsus neoninis disco klubas su kamuoliu, judančiomis sporto ikonomis, dideliu rezultatu ir spalvingais likusių žaidimų burbulais.

- **Didelis rezultatas:** Raudoni 3 : 2 Mėlyni; prie kiekvieno — komandos spalva, avataras; jei „Iki 5“ — „iki 5“; jei „Visos“ — „liko 6 rungtys“.
- **Nėra komandų sudėčių ir „Kas žaidžia?“ pasirinkimo.** Visada rodoma „Kita rungtis / Ruoškis vakarėliui“ su automatiniu 5 s countdown ir progreso juosta.
- **Sužaistos serijos:** sąrašas (žaidimas, serijos rezultatas, laimėtojas); 2× serija pažymėta geltonai.
- **Likę žaidimai:** spalvingi chipsai su sporto ikonomis; „Liko 6 rungtys“.
- **CTA:** auto traukimas po 5 s; jei yra neišbaigta serija (grįžus po pertraukos) — „Tęsti seriją“ ir „Atšaukti“.
- **Antriniai:** „Baigti vakarėlį“ (patvirtinti), „Naujas vakarėlis“ (su patvirtinimu).
- **Pertrauka:** galima uždaryti programėlę, grįžti į Pradžią, vakarėlis lieka; auto traukimas atšaukiamas, kai išeinama.

### 3.4 Traukimas

- **Automatinis:** atsidaro full-screen `#partyDraw` overlay be pasirinkimų ar mygtukų. Prieš tai (pirmą kartą) – disco kamuolio intro ir 5 s 1v1 kortelė; vėliau – iš karto iš lobby.
- **Šeši variantai, atsitiktinai:** **6 skirtingi ilgesni traukimai** – CS:GO kortelių karuselė, marmuro lenktynės, ruletės ratas, slotų mašina, smiginio lenta ir kortų fanas, **traukiami atsitiktinai ir nekartojant paskutinių dviejų**. Kiekvienas ~5,2–5,8 s + 1,1 s atskleidimas.
- **Po atskleidimo žaidimas paleidžiamas automatiškai** (`startFlow`). Nėra „Stok prieš kamerą“ kortelės; laiko atsistoti duoda rankų pakėlimo gate. 1P starteris – pagal serijos eigą.
- Jei pasirinkta tik 1 žaidimas, jis vis tiek traukiamas per animaciją ir yra 2× (paskutinė rungtis).

### 3.5 Automatinis startas (be stand kortelės)

- Po traukimo atskleidimo iškart atidaromas įprastas `#loading` + `#ready` (rankų pakėlimas), tada žaidimas. Žaidėjai mato komandos pavadinimą pasiruošimo ekrane ir HUD, ne P1.
- **2 žaidėjų žaidime** gate reikalauja abiejų atstovų; **1 žaidėjo** – pirmojo. Antrasis ateina per žaidimo turn card'ą.
- **Round result:** po raundo rodomas `#partyResult[data-mode=round]` su serijos rezultatu; po 5 s automatiškai paleidžiamas kitas raundas (arba paspaudus „Kitas raundas“).
- **Series result:** po 2 pergalių / 3 raundų rodomas `data-mode=series` su taškais; po 6 s automatiškai grįžtama į lobby, kuris po 5 s traukia kitą seriją.

### 3.6 Pasiruošimas / „pastatymas“

- Paspaudus „Pradėti rungtį“, vyksta įprastas `startFlow`: atidaroma kamera, modelis, užsklanda „Kraunama“, tada **esamas rankų pakėlimo gate** („Rankos aukštyn“).
- „Stok prieš kamerą“ kortelė jau pasakė, kas turi stoti. 2 žaidėjų rungtyje gate reikalauja abiejų atstovų; 1 žaidėjo rungtyje — pirmojo.
- 1 žaidėjo rungtyje antrasis atstovas laukia; jo eilė ateina per žaidimo turn card'ą (ten yra savas gate).
- Tai išsprendžia „pastatymą“ be naujo gate ekrano: naudojamas tas pats, kurį žaidėjai jau pažįsta.

### 3.7 Žaidimas

- Žaidimas veikia įprastai, su savo HUD, garsais ir TV lenta.
- `startLeg()` nustato komandų pavadinimus žaidimo tvarka; HUD/pasiruošimo ekranas rodo „Raudoni / Mėlyni“, ne P1/P2. Visi žaidimai gauna tuos pačius vardus.
- Vakarėlio muzika groja **tik žaidimo metu**: `startGame()` paleidžia ją po rankų gate, `onLegDone()` sustabdo raundo pabaigoje. Lobby, intro, VS, traukimas ir rezultatai – tyloje.
- Jokio papildomo party overlay žaidimo metu; neapkraunamas ekranas.

### 3.8 Rungties / serijos rezultatas

Kai žaidimas baigiasi ir įrašo istorijos eilutę, party parodo **rezultato overlay** (`#partyResult`):

- **Round:** `data-mode="round"`, pavadinimas „Raudoni laimi raundą!“ / „Raundas lygus“, serijos rezultatas („Serija 1 : 0“), automatinis kitas raundas po 5 s (arba „Kitas raundas“ mygtukas). **Jokio auto-advance į kitą seriją.**
- **Series:** `data-mode="series"`, „Raudoni +1“, raundai („Raundai 2 : 1“), bendras rezultatas; automatinis grįžimas į lobby po 6 s (arba mygtukas). Tada lobby po 5 s traukia kitą seriją.
- **Komandų vardai** ir avatarai; jokių žaidėjų vardų.
- Žaidimo savo rezultatų ekranas party metu **nerodomas** (party overlay jį pakeičia). Taip išvengiama konfliktuojančių „Žaisti dar kartą / Į pradžią“ mygtukų.
- Paspaudus / automatiškai: `cleanupGame()` nuvalo žaidimą/kamerą, `document.body.classList.remove("ingame","playing")`, `screenPhase("idle")`, `history.back()` grąžina į `#/vakarelis`; lobby atsinaujina su rezultatu ir auto-traukimu. Jei Android back apeina overlay'ų, tą patį cleanup'ą atlieka `onView("party")`.

### 3.9 Finalas

- Čempionų komanda, taurė, abiejų komandų veikėjai, konfeti (reduced-motion saugu).
- Galutinis rezultatas, skirtumas, „Naujas vakarėlio rekordas“ (didžiausias skirtumas šiame telefone).
- **Nėra MVP** – žaidėjai nepriskiriami, todėl finalas rodo tik komandas.
- **Serijų lentelė:** kiekviena serija: žaidimas, raundų rezultatas, laimėtojas, taškai.
- **Veiksmai:** „Revanšas“ (tos pačios komandos, tas pats pool'as, naujas disco intro), „Naujas vakarėlis“ (setup), „Į pradžią“.
- **Bendros lygiosios:** bendra taurė; v2 — papildoma serija.
- **Dalintis (pasirinktinai):** teksto suvestinė per esamą `share()`.

### 3.10 TV

- **Per rungtį (įgyvendinta):** TV rodo **gyvą žaidimo vaizdą** (ne tik taškų lentą). `cast.ts` `setMirror(base, overlay)` siunčia aktyvų žaidimo canvas per esamą camera-per-TV WebRTC; Boksas/Siena komponuoja kamerą + `bxCv`/`wlCv`, kiti žaidimai siunčia savo `*Cv`, rep – `cv`. TV `#screen[data-cam="1"]` rodo vaizdą su taškais viršuje.
- **Lobby / tarp rungčių:** telefonas yra pagrindinė lenta; TV stream'as sustabdomas (`screenPhase("idle")`). Phase 2 — atskira vakarėlio TV taškų lenta su komandų pavadinimais ir rungčių taškais; tam reikėtų `ScreenState` `party` lauko.
- **Kamera per TV:** vakarėlio setup'e „Rodyti žaidimą per TV“ jungiklis įjungtas pagal nutylėjimą; jis įjungia esamą WebRTC stream'ą. Kiekvienos rungties pradžioje stream'as startuoja, grįžus į lobby sustoja.

### 3.11 Pertraukos ir tęsimas

- Vakarėlio būsena saugoma **`localStorage novacore.party`**, ne `sessionStorage`: galima uždaryti programėlę, grįžti po valandos ar kitą dieną.
- Pradžioje, jei yra aktyvus vakarėlis: „Tęsti vakarėlį“ (Raudoni 3 : 2 Mėlyni, liko 5 rungtys).
- Jei programa buvo užmušta rungties metu: būsena `playing`, bet istorijos eilutės nėra. Lobby siūlo „Kartoti rungtį“ arba „Atšaukti rungtį“ (grąžina žaidimą į pool'ą).
- Jei istorijos eilutė su `party` leg id jau yra (pvz., programa užsidarė po rezultato), lobby ją įskaito ir tęsia.
- „Baigti vakarėlį“ visada prieinama lobby'e; su patvirtinimu. Sužaistos rungtys lieka istorijoje.

### 3.12 Back / quit

- **Rungties metu:** back elgiasi kaip įprastame žaidime (dažniausiai nurijamas; rezultate — grąžina į lobby).
- **Lobby:** back į Pradžią; vakarėlis lieka. Jei nori baigti — atskiras mygtukas.
- **Stand card / rezultato overlay:** back = atgal į lobby (arba atšaukti rungtį, jei dar nepradėta).
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
  ├─ Kas žaidžia? → po vieną atstovą iš komandos
  ├─ automatinis traukimas (case / marble race) → „Stok prieš kamerą“ kortelė
  ├─ Pradėti rungtį → prepareParty(cfg) → startFlow(mode)
  │     ├─ loading + camera + gate (esamas)
  │     ├─ game loop (esamas)
  │     └─ finish() → saveHist → partyLegDone() → party overlay
  └─ Grįžti į vakarėlį → resetGame() + history.back() → lobby
```

Kamera atidaroma ir uždaroma **kiekvienai rungčiai atskirai**, kaip įprastame žaidime. Nereikia laikyti kameros, modelio ar wake lock'o per visą vakarą.

### 4.2 Nauji failai

| Failas | Paskirtis |
|---|---|
| `src/party/logic.ts` | **PURE** (be DOM/storage): tipai, traukimas, 1/0,5 taškai + 2× comeback, `legResult(row)`, būsenos validacija. Unit testai. |
| `src/party/bus.ts` | Mažas be ciklų: `partyActive()`, `partyLegDone()`, `setPartySink()`. Žaidimai importuoja tik jį. |
| `src/party/music.ts` | Trys NCS takeliai, tylus fonas (`HTMLAudio`), party music jungiklis + globalaus Garsas jungiklio reakcija, fade/duck. |
| `src/party/party.ts` | Setup, 5 s gaublio intro, lobby su atstovų pasirinkimu, automatinis traukimas (case / marble), „Stok prieš kamerą“ kortelė, rezultato overlay, finalas, persistence, TV veidrodis, muzikos paleidimas. |
| `src/party/party.css` | Vakarėlio stiliai + intro/draw animacijos. |
| `test/unit/party.test.ts` | Traukimas, 1/0,5 taškai, 2× comeback, `legResult` visiems 10 režimų, lygiosios/DNF/foul, validacija. |
| `test/e2e/party.spec.ts` | Intro → lobby → automatinis traukimas → Sprintas → rezultatas → finalas; `party-solo`, `party-rep`, `party-javelin`. |

### 4.3 Duomenų modelis

```ts
// src/party/logic.ts (PURE)
export type Team = 0 | 1;
export interface PartyPlayer { name: string; legs: number; wins: number; }
export interface PartyLeg {
  game: string;
  points: number;                // 1 normal, 2 comeback
  double: boolean;               // the one 2x leg
  format: "solo" | "duo";
  lineup: [number, number];      // [team0 player index, team1 player index]
  starter: Team;                 // 1P: kuri komanda pradeda; 2P: 0 (nesvarbu)
  winner: Team | -1 | null;
  values: [number | null, number | null];
  kind: "points" | "seconds" | "metres" | "walls" | "pins";
  pts: [number, number];
  at: number;
}
export interface Party {
  v: 2;
  id: string;
  createdAt: number;
  updatedAt: number;
  teams: [{ name: string; players: PartyPlayer[] }, { name: string; players: PartyPlayer[] }];
  mode: "all" | "target";        // visos rungtys / iki N
  target: number;                // 5, jei mode="target"
  doubleUsed: boolean;           // the 2x comeback was drawn
  poolAll: string[];             // selected games for a rematch
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

- **v1 (įgyvendinta):** žaidimo canvas veidrodis per esamą camera-per-TV WebRTC; tarp rungčių TV stream'as sustoja, telefonas yra pagrindinė lenta.
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
- **Žaidimas nepaleidžiamas:** stand card → „Bandyti dar kartą“ / X (grąžina į pool'ą be taškų).
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
| **2. Setup + lobby** | `#/vakarelis`, komandos, ilgis, lobby, automatinis traukimas, stand card, rezultato overlay, finalas, persistence | 4 d. |
| **3. Adapteriai A** | Rep (game.ts), Sprintas, Šuolis į tolį, Boksas | 3 d. |
| **4. Adapteriai B** | Slidinėjimas, Barjerai, Siena, Ietis | 3 d. |
| **5. Adapteriai C** | Boulingas, Badmintonas | 2 d. |
| **6. TV + poliravimas** | TV v1/v2, konfeti, garsai, 360/landšaftas, a11y, trofėjai | 3 d. |
| **7. Testai + telefonas** | E2E, screenshots, 30 min. realaus vakarėlio testas, baterija/karštis | 2–3 d. |
| **Viso** | Visi 10 žaidimų | **~20–24 žmogaus dienos** |
| **Įgyvendinta** | Visi 10 žaidimų, beta jungiklis, lobby + traukimas + 1P/2P, starto slideris, TV veidrodis, rezultatas/finalas | **~2 savaitės** |

Su dviem žmonėmis lygiagrečiai (vienas — logika/lobby, kitas — adapteriai/TV) — pilnas vakaras ~2 savaitės kalendoriaus; MVP ~1 savaitė.

### 5.2 Laikas po 11-06

11-06 pateikimas rytoj, todėl siūlau **pateikti koncepciją** (vienas skaidrės punktas / vienas pastraipa), o koduoti po 11-08, kai Ignas grįžta.

| Data | Rezultatas |
|---|---|
| 11-06 | Koncepcijos pateikimas; jokios kodo rizikos |
| 11-08–11-10 | Sprendimai, maketai, gryna logika + testai |
| 11-11–11-15 | Setup + lobby + loterija + Rep/Sprintas/Šuolis/Boksas; pirmas žaidžiamas 3 rungčių vakaras |
| 11-16–11-20 | Visi adapteriai + TV žaidimo veidrodis; **MVP demonstracija** su visais 10 žaidimų |
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
- Traukimas: tik iš pool'o, be pasikartojimų, beta filtravimas, tuščias pool, „Visos“ vs „Iki 5“.
- Komandų pasirinkimas: 3v3, 2v2, 1P eilė, starterių kaitaliojimas, negalimas tuščias pasirinkimas.
- Taškai: 1 už pergalę, 0,5 lygiosios, viena 2× comeback rungtis (2+ atsilikimas arba paskutinė rungtis), target pasiekimas, lygiosios po paskutinės.
- `legResult`: visi 10 režimų, didesnis/mažesnis, null/DNF, visi foul, lygiosios, 2-o bandymo tie-break, Sienos `secs` tie-break, P1/P2 → team mapping.
- Validacija: sugadinta/sena būsena, trūkstamos rungtys, `playing` atkūrimas.

**E2E (`test/e2e/party.spec.ts`):**
- Setup → intro (skip) → lobby → po atstovų pasirinkimo **automatinis traukimas** → „Stok prieš kamerą“ → Sprintas su `__sp.feed(3)` → rezultatas → finalas.
- 1P eilė: pirmoji komanda, antra; rezultatų mapping.
- 2P: abu atstovai.
- Tęsimas: reload lobby; „Tęsti“; taškai išlieka.
- Back: lobby → Pradžia; rungties metu; rezultato overlay.
- a11y: setup, lobby, stand card, rezultatas, finalas.
- Screenshots 390×844 ir 360×780.

**Rankinis telefonas:**
- 3v3, 6–10 rungčių (su beta), TV; 30–40 min.; kamera tarp rungčių, baterija/karštis, 1P eilė, komandų pasirinkimas, lygiosios, atšaukta rungtis, uždarymas/tęsimas, Android back, muzikos volume ir nutildymas.

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
| 10 adapterių apimtis | Visi 10 įgyvendinti; Rep/Boulingas/Badmintonas sudėtingiausi |
| Programėlė užsidaro rungties metu | Būsena `playing`; „Kartoti“ / „Atšaukti“; eilutė su leg id atpažįstama |
| Savaitės tikslo dvigubinimas | Jokios suvestinės eilutės; tik rungčių eilutės |
| Beta žaidimai nepatikrinti telefonu | Pagal nutylėjimą išjungti; įjungiama sąmoningai |

### Sprendimai (priimti)

1. **Vakarėlio ilgis:** „Visos rungtys“ arba „Iki 5 taškų“.
2. **Taškai:** 1 už pergalę, 0,5 lygiosios; viena 2× comeback rungtis (2+ atsilikimas arba paskutinė rungtis).
3. **Pradedančioji komanda:** kaitaliojimas; pirmai 1P rungčiai monetos metimas.
4. **Komandų dydis:** 1–4 žaidėjai komandoje (2–8 iš viso; pvz., 3v3).
5. **Pavadinimas:** „Vakarėlis“.
6. **Traukimas:** automatinis po atstovų pasirinkimo, be atskiro mygtuko; animacija keičiasi (case / marble race).
7. **Muzika:** 2 NCS takeliai, tik žaidimo metu, atskiras jungiklis; privalomas priskyrimas setup'e.

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
      {"name": "Raudoni 1", "legs": 4, "wins": 3},
      {"name": "Raudoni 2", "legs": 3, "wins": 1},
      {"name": "Raudoni 3", "legs": 3, "wins": 0}
    ]},
    {"name": "Mėlyni", "players": [
      {"name": "Mėlyni 1", "legs": 4, "wins": 2},
      {"name": "Mėlyni 2", "legs": 3, "wins": 1},
      {"name": "Mėlyni 3", "legs": 2, "wins": 0}
    ]}
  ],
  "mode": "all",
  "target": 5,
  "doubleUsed": true,
  "poolAll": ["rr", "sp", "bx", "lj", "sk", "wl", "hd", "bw", "bd", "jv"],
  "pool": ["bx", "lj", "hd", "bw", "sk", "wl", "bd", "jv"],
  "current": null,
  "legs": [
    {"game": "sp", "points": 1, "double": false, "format": "duo", "lineup": [0, 0], "starter": 0,
     "winner": 0, "values": [12.34, 12.87], "kind": "seconds", "pts": [1, 0], "at": 0}
  ],
  "totals": [1, 0],
  "phase": "lobby",
  "nextStarter": 1
}
```

### 7.3 i18n raktų grupės

`party.title`, `party.tagline`, `party.how1..3`, `party.teams`, `party.teamA/B`, `party.players`, `party.add`, `party.remove`, `party.balance`, `party.need2`, `party.mode`, `party.modeAll`, `party.modeTarget`, `party.untilN`, `party.points`, `party.pointsW`, `party.pointsS`, `party.beta`, `party.tv`, `party.start`, `party.lobby`, `party.draw`, `party.drawing`, `party.poolLeft`, `party.legCard`, `party.pointsAtStake`, `party.solo`, `party.duo`, `party.starter`, `party.second`, `party.whoPlays`, `party.playedN`, `party.startLeg`, `party.cancel`, `party.skip`, `party.skipSub`, `party.result`, `party.takes`, `party.tie`, `party.tiePts`, `party.backToParty`, `party.standings`, `party.lastLeg`, `party.finishParty`, `party.finishSub`, `party.finishYes`, `party.finishNo`, `party.resume`, `party.resumeSub`, `party.champions`, `party.mvp`, `party.rematch`, `party.newParty`, `party.home`, `party.record`, `party.margin`, `party.noGames`, `party.gameGone`, `party.camFail`, `party.retry`, `party.coin`, `party.coinStarts`.

Visi `lt.ts` ir `en.ts`, tie patys `{params}`; daugiskaita per `tn`.
