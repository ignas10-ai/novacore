# Planas iki pateikimo (2026-11-06) ir toliau

Kas, ką ir iki kada daro, kad MoveClash būtų pateiktas Samsung Solve for Tomorrow su veikiančiu prototipu, tyrimu ir tvarkingu pristatymu. Parengta 2026-10-23.

## Terminai (iš taisyklių ir organizatorių atmintinės)

| Data | Kas |
|---|---|
| **Pr 10-27** | Vidinis terminas: viskas paruošta, nes Ignas 10-28–11-08 Šri Lankoje (ryšys tik vakarais, +2,5 val.). |
| **Tr 10-29, 16:00–18:00 LT** | Creativity Forum (Zoom) – **privalomas**. Ignui tai 18:30 vietos laiku; jungiasi komanda + mokytoja, Ignas iš viešbučio, jei pavyks. |
| **Kt 11-06, 23:59** | Idėjos pateikimo terminas (forma + pristatymo failas ≤10 MB arba nuoroda). |
| 11-07–11-12 → **11-13** | Komisija vertina → skelbiamas TOP 5 (po 5 iš kiekvienos šalies). |
| 11-16–12-02 | Mentorystė; galutinis darbas iki **12-02 23:59**. |
| Gruodis | Finalas (pernai – Rygoje, gruodžio 11 d.), **pristatymas angliškai**. |

## Savaitė 1: 10-23 (Kt) – 10-27 (Pr) — testai, apklausa, tekstai

| Kada | Kas | Kas daro (siūloma, suderinti) |
|---|---|---|
| Kt 10-23 | Apklausą sudėti į Google Forms ([APKLAUSA.md](APKLAUSA.md)) ir išplatinti visais kanalais. | Stela (forma), visi (platinimas) |
| Kt–Pn 10-23/24 | Realus testas su žmogumi pagal [TESTAVIMO-PROTOKOLAS.md](TESTAVIMO-PROTOKOLAS.md): bent 3 patikrinti pratimai × 2 žmonės; 4 beta pratimams – po 10 s įrašą Ignui. | Martynas + Ignas (+ Stela kaip 3-ias žaidėjas) |
| Pn 10-24 | Iš įrašų pataisyti beta pratimų ribas, perleisti `node test-detect.cjs`, deploy. | Ignas |
| Š 10-25 | Pakartotinis testas po pataisų; nufilmuoti **30 s demo video** (2 žaidėjai, horizontaliai, taškai bėga, gale klipas). | Martynas + draugai |
| Š–S 10-25/26 | Į [PATEIKIMAS.md](PATEIKIMAS.md) tekstus įrašyti tikrus skaičius (apklausa, tikslumas, pakartojimas). Pristatymo failas (8 skaidrės, PDF ≤10 MB). | Ignas (tekstas + PDF), Stela (skaidrių vaizdas, komandos nuotrauka) |
| S 10-26 | BIO-RED finalas (Ignas užimtas iki vakaro). | – |
| **Pr 10-27** | Pateikti formą **arba** perduoti Martynui galutinius tekstus + PDF + prisijungimą, kad pateiktų iki 11-06. Patikrinti, kas kapitonas formoje. | Ignas → Martynas |

Minimumas, jei nespėjam visko: 3 patikrinti pratimai (be beta), apklausa ≥30 atsakymų, 30 s video, 3 tekstai, 8 skaidrės. Beta pratimai gali likti išjungti – pateikimui jų nereikia.

## Savaitė 2: 10-28 – 11-06 — be Igno vietoje

| Kada | Kas | Kas daro |
|---|---|---|
| Tr 10-29 16:00 | Creativity Forum (Zoom). Užsirašyti 3 mintis apie įpročių formavimą – tinka į „kaip užtikrinsim, kad žais ne vieną kartą" dalį. | Martynas, Stela, mokytoja Rūta (+ Ignas iš viešbučio) |
| 10-30–11-03 | Uždaryti apklausą, suskaičiuoti procentus pagal grupes, įrašyti į tekstus (vietoj [X]/[Y]). | Stela |
| 11-03–11-05 | Galutinė tekstų ir PDF peržiūra (Ignas vakarais per chat'ą). | Visi |
| **iki Kt 11-06** | Pateikti formą, išsaugoti patvirtinimo laišką į komandos chat'ą. | Martynas (arba Ignas, jei pateikta 10-27) |

## Po pateikimo

- **11-13 TOP 5.** Jei patenkam – mentorystė 11-16–12-02: reikės 2 telefonų režimo prototipo (dabar tik vienas telefonas, 1–2 žaidėjai) ir didesnio testo (≥20 žaidėjų).
- **Finalas gruodį – angliškai.** Žaidimui reikės **EN versijos** (visi tekstai `index.html` dabar lietuviški; kalbos perjungimas dar neparašytas). Pristatymas ir demo video – EN.
- Ignas grįžta 11-08: kodas, EN versija, 2 telefonų režimas.

## Atsakomybės (siūloma, suderinti chate)

| Kas | Už ką |
|---|---|
| Ignas | Judesių atpažinimas ir ribos, deploy, pateikimo tekstai, PDF, formos pateikimas (arba perdavimas). |
| Martynas | Kodas: pratimai, animacijos, klipai; testai su žmonėmis; demo video; pateikimas 11-06, jei Ignas nepateikė. |
| Stela | Apklausa (forma, platinimas, skaičiai), skaidrių vaizdas, komandos nuotrauka, Creativity Forum užrašai. |
| Mokytoja Rūta | Atstovauja komandai formoje, Creativity Forum, mokyklos pertraukų testas su klase (jei leis). |

Darbo tvarka kode (iš AGENTS.md): `git pull` prieš darbą → pakeitimas → `node test-detect.cjs` → `OK` → `git push`. Konfliktus rodyti Ignui. Beta žymą nuo pratimo nuimti tik po realaus testo.
