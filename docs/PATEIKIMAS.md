# Pateikimas – Samsung Solve for Tomorrow Baltics 2026

Galutiniai trys formos atsakymai, kaip atsakom į kiekvieną vertinimo kriterijų ir į ką turi atsakyti pristatymo failas. Parengta 2026-10-23. Terminas **11-06 23:59**; vidinis – **Pr 10-27** (Ignas 10-28–11-08 Šri Lankoje; jei iki tol nepateikta, pateikia Martynas).

Taisyklės sau: rašom tik tai, kas **veikia dabar** (žr. CHANGELOG). Ko dar nėra – „planuojame" arba žvaigždutė. [SKLIAUSTUOSE] – vietos skaičiams iš apklausos ([APKLAUSA.md](APKLAUSA.md)) ir testų ([TESTAVIMO-PROTOKOLAS.md](TESTAVIMO-PROTOKOLAS.md)). Jei skaičiaus nėra – sakinį išbraukti, ne palikti tuščią.

Kas veikia 2026-10-23: 1 telefonas, 1–2 žaidėjai, 3 patikrinti pratimai (pritūpimai, pašokimai, aukšti keliai) + 4 beta (išjungti), 3 min / 1 min, taškai su daugikliu kas 30 s, trenerio animacijos, 15–30 s geriausių akimirkų klipas MP4 + pilnas klipas, bendrinimas, iki 1080p60, viskas naršyklėje be diegimo, vaizdas apdorojamas tik telefone. **Nėra:** 2 telefonų režimo, muzikos klipe, EN kalbos, 3–4 žaidėjų vienu telefonu.

## 1. Kokia jūsų idėja ir kaip ji paskatins fizinį aktyvumą?

NovaCore – nemokamas telefono žaidimas, kuris 3 minutes paverčia judėjimu kartu su draugais.

Kaip veikia: susitikę draugai pastato telefoną ant stalo ar prie sienos, atidaro nuorodą naršyklėje (nieko diegti nereikia) ir stoja prieš kamerą. Dirbtinis intelektas – pozos atpažinimas, veikiantis tiesiai telefone, vaizdo niekur nesiunčiant – atpažįsta pratimus (pritūpimus, pašokimus, aukštus kelius) ir skaičiuoja taškus kiekvienam žaidėjui. Kas 30 sekundžių keičiasi pratimas ir auga taškų daugiklis, todėl paskutinė minutė tampa tikra kova. Pasibaigus žaidimui programa pati sumontuoja 15–30 sekundžių klipą iš geriausių akimirkų – juo dalinamasi su draugais, ir taip į žaidimą ateina nauji žaidėjai. Prototipas jau veikia: novacore-two.vercel.app.

Kodėl tai skatina aktyvumą: Samsung ir Norstat 2026 m. apklausoje lietuvių paaugliai judėjimo priežastimis įvardijo laiką su draugais (38 %) ir smagumą (33 %), o 60 % prie ekranų praleidžia 5 ir daugiau valandų per dieną. Mūsų apklausa tai patvirtino: iš [N] atsakiusių [X] % sužaistų tokį žaidimą susitikę su kitais, [Y] % pasidalintų klipu. Problema ne ta, kad žmonės nenori judėti – trūksta paprastos priežasties pradėti čia ir dabar, be salės, inventoriaus ir „rimto" nusiteikimo. NovaCore nereikalauja nieko, ko nėra kiekvieno kišenėje. Telefonas, kuris šiandien atitraukia nuo judėjimo, tampa priežastimi pajudėti. Tikslas: kad 3 minučių judėjimas su draugais taptų tokiu pat įprastu kaip bendra nuotrauka susitikus.

## 2. Tikslinė auditorija ir kaip užtikrinsite, kad sprendimas jai tiktų?

Pagrindinė auditorija – [13–19 metų paaugliai / grupė pagal apklausą], kurie susitinka namuose, mokykloje per pertraukas ar vakarėliuose ir kuriems įprastas sportas atrodo nuobodus arba reikalaujantis pasiruošimo. Apklausoje labiausiai žaisti norėjo [grupė] ([X] % „taip"), bet [antra grupė] irgi atsakė [Z] % – todėl žaidimą kuriame bet kuriai kompanijai vienoje patalpoje, o ne tik mokiniams. Antra kryptis – mokyklos: 3 minučių „NovaCore pertrauka" tarp pamokų, klasė prieš klasę.

Mes patys esame ši auditorija, todėl idėją tikriname ne teorijoje, o su savo draugais:
1. Apklausėme [N] žmonių (mokinių, studentų, dirbančių, tėvų): [X] % žaistų, [Y] % pasidalintų klipu, dažniausia kliūtis – [„nenoriu būti filmuojamas" / kita, W %].
2. Pastatėme veikiantį prototipą ir išbandėme su [K] žmonėmis: iš [M] pritūpimų programa suskaičiavo [M₁], iš [M] pašokimų – [M₂] ([tikslumas] %). [Q] iš [K] patys paprašė žaisti dar kartą.
3. Pagal rezultatus jau keitėme žaidimą: [pvz. pridėjome pratimų pasirinkimą / užuominas „atsitrauk" / griežtesnį pašokimų skaičiavimą, kad nebūtų galima apgauti vien rankomis].

Saugumas ir privatumas (nes filmuojami nepilnamečiai): vaizdas apdorojamas tik telefone ir niekur nesiunčiamas, klipas kuriamas tik žaidėjo telefone ir dalinamasi tik jam paspaudus; klipuose nėra kūno sekimo linijų. [Jei apklausoje daug „nenoriu būti filmuojamas":] todėl klipas yra neprivalomas, žaisti galima ir be jo.

Su kuo bendradarbiausime: mokytoja Rūta Sidaugienė (komandos narė, verslumo mokytoja) – išbandyti pertraukų režimą su klase ir pasiekti kitas mokyklas; Kauno „Žalgiris" (konkurso partneris) – savaitės iššūkis su prizais bilietais; Creativity Forum pranešėjos apie įpročių formavimą – kaip pasiekti, kad žaidimas būtų kartojamas, o ne išbandomas vieną kartą.

## 3. Kuo idėja išskirtinė, palyginti su esamais sprendimais?

Patikrinome keturias esamų sprendimų grupes (pilna lentelė – KONKURENTAI.md):
- **Nex Playground** – judesio žaidimų konsolė su kamera, iki 4 žaidėjų. Kainuoja ~299 $ (UK 269 £) plius ~90 $ metinė prenumerata, reikia televizoriaus, Lietuvoje neparduodama.
- **Telefono programėlės su AI pratimų skaičiavimu** (RepSquad, Allena) – kamera ir AI telefone, bet žaidžiama vienam arba su nepažįstamais lentelėse; „draugų iššūkiai" vyksta kiekvienam savo telefone savo laiku. Prenumerata 7–20 $/mėn. ar metus, tik anglų kalba.
- **Just Dance / Just Dance Now / Ring Fit** – šokis arba fitnesas per konsolę; Just Dance Now veikia ir su telefonu, bet telefonas laikomas rankoje, reikia antro ekrano su internetu, ir tai šokis, ne pratimai.
- **Futurum (Solve for Tomorrow 2025)** – asmeninė AI treniruočių programa su taškais. Treniruotė vienam, ne žaidimas kompanijai.

NovaCore skiriasi trimis dalykais: (1) žaidžiama **kartu, toje pačioje patalpoje, su vienu telefonu** – 0 €, jokios įrangos, jokio diegimo; (2) tai **3 minučių žaidimas**, ne treniruočių programa, todėl pradėti galima bet kur ir bet kada; (3) **automatinis klipas** – judėjimas tampa turiniu, kuriuo norisi dalintis, ir žaidimas plinta pats. Esami sprendimai sprendžia „kaip sportuoti efektyviau". Mes sprendžiame „kaip apskritai pradėti judėti, kai esi su draugais ir rankoje telefonas".

## Kaip atsakom į kiekvieną kriterijų (iš taisyklių)

| Kriterijus | Kur tai matosi |
|---|---|
| Technologijos | Pozos atpažinimas (MediaPipe) tiesiai telefone, 2 žaidėjai viename kadre, automatinis klipų montažas – ir tai jau veikia, ne planas. |
| Kūrybiškumas | Telefonas iš kliūties tampa priežastimi judėti; klipas kaip plitimo mechanizmas; ištirti esami sprendimai (KONKURENTAI.md). |
| Kokybė ir tyrimai | Savas tyrimas: apklausa [N], tikslumo testas [%], pakartojimo rodiklis; veikiantis prototipas su nuoroda. |
| Aktualumas / poveikis | Samsung/Norstat LT duomenys + mūsų apklausa; mokyklos pertraukos su mokytoja komandoje; Žalgiris. |
| Išbaigtumas | Prototipas jau keistas pagal testus (CHANGELOG); aiškus planas: 2 telefonų režimas*, EN versija finalui. |
| Platesnis poveikis | Bet kuri kompanija, ne tik mokiniai (apklausos grupės); klasė prieš klasę; vietiniai rėmėjai (prizai nepilnamečiams). |

## Pristatymo failas (PDF ≤ 10 MB) – 8 skaidrės

Turi atsakyti į 5 organizatorių klausimus: **problema/kam · tikslas · sprendimas/kaip veikia · išskirtinumas + analogai · įgyvendinimas/ištekliai**.

| # | Skaidrė | Viena mintis |
|---|---|---|
| 1 | Viršelis | NovaCore – 3 minutės judėjimo su draugais. Vardai, klasė, mokykla, mokytoja. QR į 30 s demo video. |
| 2 | Problema / kam | 38 % juda dėl draugų, 60 % ≥5 val. prie ekrano (Samsung/Norstat) + mūsų [X] %. „Trūksta ne noro, o priežasties pradėti dabar." |
| 3 | Tikslas | 3 min judėjimo su draugais = taip pat įprasta kaip bendra nuotrauka. 2 personos: „Ugnė, 15, pas draugę" · „8b, 10 min pertrauka". |
| 4 | Sprendimas / kaip veikia | 3 ekrano kadrai iš prototipo: starto ekranas → žaidėjai kadre, taškai → klipas. Nuoroda. |
| 5 | Po gaubtu | Kamera → pozos taškai telefone → `step()` pratimų skaičiavimas → taškai → klipas. „Vaizdas niekur neišeina." Kas jau veikia / kas planuojama (*). |
| 6 | Mūsų tyrimas | 3 skaičiai: apklausa, tikslumas, pakartojimas. 1–2 citatos iš 9 kl. |
| 7 | Išskirtinumas + analogai | 2×2 matrica (solo ↔ kartu · įranga ↔ tik telefonas), NovaCore vienas kampe. |
| 8 | Įgyvendinimas / ištekliai | Kas toliau: 2 telefonų režimas*, 20 žaidėjų testas, mokyklų pertraukos, Žalgirio iššūkis, EN finalui. Komandos nuotrauka. Ištekliai: 0 € (nemokamos technologijos, Vercel). |

Tonas: mokinių komisija, ne investuotojai – paprasta kalba, daug vaizdų, vienas skaičius per skaidrę, be žargono. Lietuviškai (finalas angliškai – vėliau).

## Formos pildymas

- Kapitono duomenys: vardas, mokykla, klasė, amžius, tel., el. paštas – suderinti, kas kapitonas (Ignas, bet 10-28–11-08 nepasiekiamas dienomis → Martynas?).
- Viena idėja komandai. Failas ≤10 MB arba Google Drive nuoroda (nuoroda saugiau dėl dydžio; patikrinti, kad atsidaro be prisijungimo).
- Išsaugoti patvirtinimo laišką į komandos chat'ą.
