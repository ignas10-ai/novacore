# Pakeitimų žurnalas

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
