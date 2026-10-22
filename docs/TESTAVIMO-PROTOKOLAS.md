# Testavimo protokolas – NovaCore su tikrais žmonėmis

Kaip patikrinti, ar kamera teisingai skaičiuoja kiekvieną pratimą, ir ką atsiųsti Ignui, kad galėtų pataisyti ribas. Parengta 2026-10-23.

Kodėl: `node test-detect.cjs` tikrina tik sugalvotas pozas. Keturi pratimai (pritūpimai su šuoliuku, šoniniai žingsniai, atvirkštiniai įtūpstai, įstriži atsilenkimai) yra **BETA** – su žmogumi dar nė karto netestuoti. Be šito testo jų į pateikimą dėti negalima.

## Pasiruošimas (2 min)

- Telefonas atremtas stačiai (ant stalo, prie sienos), kamera į kambarį. Šviesa iš priekio arba šono, ne iš už nugaros (langas už žaidėjo = siluetas = blogai).
- Atidaryti https://novacore-two.vercel.app, trukmė **1:00 testas**, žaidėjai **1** (tikslumui) arba **2** (ar nesimaišo).
- „Keisti" → palikti **vieną** testuojamą pratimą (lentelė leidžia). Taip 1 min raundai bus tik to pratimo.
- Žaidėjas atsitraukia, kol matosi visas kūnas (programa pati pasako „atsitrauk"). Rankos virš galvos 3 s → startas.
- Antras žmogus **skaičiuoja balsu** tikrus pakartojimus ir filmuoja ekraną kitu telefonu (kad matytųsi ir žaidėjas, ir taškai).

## Pilnas testas (apie 60–90 min)

Kiekvienam iš 7 pratimų: **10 pakartojimų × 3 žmonės × 2 atstumai (2 m ir 3 m)**, bent vienas raundas prastesnėje šviesoje. Užrašyti:

- **Tikri** – kiek žmogus padarė (balsu skaičiavo stebėtojas).
- **Užskaityti** – kiek parodė ekranas.
- **Klaidingi** – kiek taškų atsirado, kai žmogus pratimo nedarė (stovėjo, siūbavo, ėjo).
- Tikslumas = užskaityti teisingi / tikri. Tikslas **≥ 90 %** patikrintiems, ≥ 80 % beta pratimams, kad nuimtume žymą.

## Minimalus testas (20 min) – jei laiko nėra

1 žmogus, 2 m, gera šviesa, po 10 pakartojimų kiekvieno iš 7 pratimų (1:00 testas × 7 = ~10 min + užrašai). Tai duoda bent po vieną skaičių kiekvienam pratimui ir 7 įrašus Ignui.

## „Apgavimo" testai (po 30 s kiekvienam)

Pagal CHANGELOG aprašytas apsaugas – šitie judesiai **neturi** duoti taškų:

| Pratimas | Ką bandyti apgauti | Turi būti 0 taškų |
|---|---|---|
| Pašokimai | Tik rankos aukštyn be kojų; tik viena koja į šoną | ✅/❌ |
| Pritūpimai | Lenktis į priekį nelenkiant kelių | ✅/❌ |
| Aukšti keliai | Bėgti vietoje vos keliant kelius (žemiau klubų) | ✅/❌ |
| Pritūpimai su šuoliuku | Pritūpti ir atsistoti be šuolio; pašokti be pritūpimo | ✅/❌ |
| Šoniniai žingsniai | Žingsniuoti stovint (be pritūpimo); siūbuoti liemeniu; išžengti ir grįžti ta pačia koja | ✅/❌ |
| Atvirkštiniai įtūpstai | Paprastas pritūpimas | ✅/❌ |
| Įstriži atsilenkimai | Pakelti kelį be alkūnės; laikyti kelį pakeltą ilgai (turi skaičiuoti 1, ne daug) | ✅/❌ |

Bendra: ar taškai bėga, kai žaidėjas tiesiog **vaikšto per kadrą** arba kai kadre **praeina kitas žmogus**.

## Įrašai Ignui (svarbiausia dalis)

Ignas ribas taiso iš vaizdo, ne iš aprašymo. Kiekvienam pratimui:

1. **10 s klipas telefonu** (ne per žaidimą – paprastas kameros įrašas): žaidėjas visu ūgiu, kamera stačiai ~1 m aukštyje, 2–3 m atstumas, daro pratimą normaliu tempu 5–8 kartus. Vertikalus arba horizontalus – nesvarbu, bet visas kūnas kadre nuo galvos iki pėdų.
2. Antras 10 s klipas **iš 3 m** ir, jei galima, trečias **prastesnėje šviesoje**.
3. Failo pavadinimas: `pratimas-vardas-atstumas.mp4`, pvz. `sidestep-martynas-3m.mp4`.
4. Siųsti per Google Drive / WhatsApp / Messenger (gali suspausti – nieko tokio, svarbu, kad matytųsi sąnariai).
5. Prie įrašo – viena eilutė: „tikrų 8, programa užskaitė 5, klaidingų 0".

Ignas iš įrašo ištraukia kūno taškus ir paleidžia per tą patį `step()`, kurį naudoja žaidimas, tad mato, kuri sąlyga nesuveikia.

## Rezultatų lentelė (užpildyti)

Data: ______ · Vieta/šviesa: ______ · Telefonas (modelis): ______ · Kameros režimas iš „Kraunama" ekrano (pvz. 1080p · 60 fps): ______

| Pratimas | Žmogus | Atstumas | Tikri | Užskaityti | Klaidingi | Tikslumas % | Pastabos / įrašo failas |
|---|---|---|---|---|---|---|---|
| Pritūpimai | | 2 m | 10 | | | | |
| Pritūpimai | | 3 m | 10 | | | | |
| Pašokimai | | 2 m | 10 | | | | |
| Pašokimai | | 3 m | 10 | | | | |
| Aukšti keliai | | 2 m | 10 | | | | |
| Aukšti keliai | | 3 m | 10 | | | | |
| Pritūpimai su šuoliuku (beta) | | 2 m | 10 | | | | |
| Pritūpimai su šuoliuku (beta) | | 3 m | 10 | | | | |
| Šoniniai žingsniai (beta) | | 2 m | 10 | | | | |
| Šoniniai žingsniai (beta) | | 3 m | 10 | | | | |
| Atvirkštiniai įtūpstai (beta) | | 2 m | 10 | | | | |
| Atvirkštiniai įtūpstai (beta) | | 3 m | 10 | | | | |
| Įstriži atsilenkimai (beta) | | 2 m | 10 | | | | |
| Įstriži atsilenkimai (beta) | | 3 m | 10 | | | | |

Dviejų žaidėjų testas (pažymėti): ar P1/P2 nesusikeičia, kai žaidėjai pereina vienas kitam už nugaros ___ · ar antro žaidėjo pakartojimai nepriskiriami pirmam ___ · ar „Nematau žaidėjo 2" rodo teisingai ___

Kiti dalykai, kuriuos užrašyti, kol testuojat (tai eina į pateikimą kaip „pakartojimo rodiklis"): ar žaidėjai **patys paprašė žaisti dar kartą** (taip/ne), kiek pakartojimų padarė per 3 min pilną žaidimą, ar pasidalino klipu.

## Žinomi dalykai, kurių testuoti nereikia

- Klipai be kūno linijų, MP4, 1080p60 jei telefonas gali – jau veikia (Martyno 10-22).
- Ekranas neužmiega žaidžiant (Wake Lock) – veikia.
- Starto ekranas ir pratimų lentelė 390 px pločio – patikrinta ekrano kadrais 10-22.
