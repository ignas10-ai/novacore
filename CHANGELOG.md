# Pakeitimų žurnalas

## 2026-10-20 — sesijos patobulinimai

### Startas ir žaidimo eiga

- Prieš startą įvestas 3 sekundžių rankų virš galvos laikymo vartas. Visi pasirinkti žaidėjai turi laikyti abi rankas virš galvos; numetus rankas laikmatis atsistato (su 300 ms tolerancija).
- Paruošimo ekrane pridėtas mygtukas **„Atgal į nustatymus“**: sustabdo kamerą, atšaukia laikmačius, uždaro pose modelį ir grąžina į pradžios ekraną.
- Pridėtas **„Kraunama“** ekranas su tamsintu fonu ir bouncing loader animacija; kameros/modelio klaida grąžina į startą su „Bandykite dar kartą“.
- Pridėtas fullscreen mygtukas, prisitaikantis prie mobilaus ekrano ir paslepiantis save, jei naršyklė nepalaiko Fullscreen API.
- Pridėtos spring/bounce tipo mygtukų paspaudimo, hover ir ekranų įėjimo animacijos.

### Rezultatai ir klipai

- Po žaidimo pirmiausia rodomi rezultatai, po jų **„Toliau“** mygtukas veda į atskirą klipų ekraną.
- Sugeneruojama 15–30 s trukmės geriausių akimirkų peržiūra:
  - parenkamos taškų prasme stipriausios 4 s atkarpos;
  - pridedama po 0,5 s konteksto;
  - garantuojama, kad peržiūroje atsispindėtų kiekvienas žaidime buvęs pratimas, kad lengvesni pratimai neužgožtų kitų.
- Pilnas klipas ir peržiūra įrašomi **MP4 (H.264/AVC1)** formatu; WebM naudojamas tik kaip paskutinė fallback išeitis.
- Klipų orientacija atitinka žaidimo formatą: **720×1280** portretinis arba **1280×720** landšaftinis vaizdas.
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
