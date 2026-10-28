# MoveClash – 3 minutės judėjimo su draugais

Prototipas Samsung Solve for Tomorrow 2026 (tema: sportas ir technologijos).
Komanda: Ignas Bagdanavičius, Martynas Ignatavičius, Stela Bujanauskaitė · mokytoja Rūta Sidaugienė.

Telefono kamera → MediaPipe Pose (veikia įrenginyje; vaizdas niekur nesiunčiamas, nebent pats įjungi „Kamera per TV“) → prieš startą pasirenkami pratimai ir 3 s laikomos rankos virš galvos → skaičiuoja pasirinktus pratimus (pritūpimai, pašokimai, aukšti keliai, pritūpimai su šuoliuku, šoniniai žingsniai, atvirkštiniai įtūpstai, įstriži atsilenkimai stovint) 1–2 žaidėjams (su animuotu demonstravimu ir krypties rodyklėmis) → taškai, kas 30 s daugiklis auga → rezultatai → 15–30 s geriausių akimirkų peržiūra (iš visų pasirinktų pratimų, pagal žaidimo orientaciją, MP4) ir pilno klipo atsisiuntimas (be kūno linijų), vienas atsisiuntimo meniu ir peržiūros bendrinimas. Kamera ir klipai automatiškai naudoja iki 1080p60, jei telefonas tai palaiko. Žaidimo metu ekranas neužmiega (Screen Wake Lock).

Nuo app-v2 tai programėlė su meniu apačioje: **Pradžia** (serija, savaitės tikslas, vieta lentelėje, greitas startas), **Kompanijos** (savaitės lentelė su draugais), **Pratimai** (visi pratimai su animacija ir patarimais) ir **Profilis** (statistika, 7 dienos, ženkliukai, istorija, nustatymai); pirmą kartą – trumpas įvadas.

Nuo 2026-10-25 yra **„Didelis ekranas“**: telefone įjungi trumpą kodą, o televizoriuje ar nešiojamame kompiuteryje atidarai `#/ekranas/<kodas>` (arba įvedi kodą) – ten rodomi dideli taškai, laikas, pratimas ir rezultatai. Telefonas lieka kamera; pagal nutylėjimą per TV siunčiami tik taškai ir pratimo pavadinimas. Jei nori, telefone arba TV įjungi **Kamera per TV** – tada TV rodo ir gyvą kameros vaizdą su skeletu (WebRTC, tiesiogiai tarp įrenginių; vaizdas neįrašomas ir nepatenka į klipą, o mato jį tik tą kodą turintis TV). Veikia per Supabase Realtime (skirtingi įrenginiai) arba per BroadcastChannel (tas pats naršyklės langas / antras ekranas, veikia ir be interneto). TV be naršyklės atveju – AirPlay / Chromecast veidrodinimas arba HDMI.

Žaidimas veikia kaip PWA (galima įsidėti į telefono pradžios ekraną, kartą užkrautas veikia ir be interneto), turi sintezuotus garsus su vibracija ir vietinę žaidimų istoriją su rekordais (tik tame telefone). Su slapyvardžiu (be el. pašto) – kompanijos su kodu, savaitės lentelė ir iššūkių nuorodos draugams; be interneto veikia viskas, išskyrus šią dalį.

## Paleisti lokaliai

Reikia Node ≥ 22.18.

```
npm install
npm run dev       # http://localhost:5173 (kamera veikia per localhost)
npm test          # tipai + atpažinimo testai (sintetiniai ir tikrų žmonių įrašai) + statistikos testas
npm run build     # → dist/ (tai, ką publikuoja Vercel)
npm run preview   # paleidžia surinktą dist/
node tools/screens.cjs cam.y4m --both   # visų ekranų kadrai (portretas + landscape), žr. tools/README.md
```

### Kintamieji (Supabase)

Internetinei daliai (slapyvardis, kompanijos, savaitės lentelė, iššūkių nuorodos) – `.env.local` (į git nekeliamas) ir Vercel'yje (Preview + Production):

```
VITE_SUPABASE_URL=https://<projektas>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Be jų žaidimas veikia kaip anksčiau, tik be internetinės dalies. Serveryje vieną kartą: SQL Editor → `supabase/migrations/001_init.sql` → Run, ir Authentication → Sign In / Providers → **Allow anonymous sign-ins**. Patikra: `node tools/social-check.mjs`. `service_role` rakto nenaudoti niekur.

Telefonui per tą patį Wi-Fi kamera reikalauja https – paprasčiausia naudoti Vercel preview nuorodą. Projekto struktūra ir taisyklės – [AGENTS.md](AGENTS.md).

## Didelis ekranas (TV lenta)

1. Telefone: **Pradžia** → TV ikona viršuje arba **Žaisti → Didelis ekranas** → **Įjungti didelį ekraną**.
2. Televizoriuje arba kompiuteryje, prijungtame prie TV, atidaryk rodomą nuorodą (arba `.../#/ekranas` ir įvesk 6 simbolių kodą).
3. Telefone spausk **Pradėti** – TV rodys pasiruošimą, didelius taškus, laiką, pratimą ir rezultatus. Kodas lieka matomas apatinėje eilutėje, jei reikia prijungti dar vieną ekraną.
4. Jei nori gyvo vaizdo: telefone lapo apačioje įjunk **Kamera per TV**, arba TV viršuje spausk **Kamera**. TV rodys kameros vaizdą su skeletu, o taškai, laikas ir pratimas bus viršuje. Vienu metu – vienas TV; pasibaigus žaidimui kamera sustoja ir vėl įsijungs kitą kartą (arba išjunk ją telefone / TV).

Kodas sukuriamas tik paspaudus „Įjungti“ ir galioja tol, kol uždarai programėlės kortelę. Duomenų bazės keisti nereikia: skirtingiems įrenginiams naudojamas Supabase Realtime viešas kanalas, tam pačiam naršyklės langui – BroadcastChannel. Jei televizorius neturi naršyklės, naudok AirPlay / Chromecast ekrano veidrodinimą arba prijunk kompiuterį HDMI kabeliu. Be kameros režimo per TV siunčiami tik taškai, laikas ir pratimo pavadinimas. Įjungus „Kamera per TV“, vaizdas tiesiogiai (WebRTC) siunčiamas tik tam TV, kuris turi kodą; jis neįrašomas ir nepatenka į klipą.

## Android APK

Ta pati programėlė kaip Android aplikacija (Capacitor). APK surenka GitHub Actions po kiekvieno `push` į `master` (ir `android`) – kompiuteryje Android SDK nereikia.

Kaip parsisiųsti ir įsidiegti (pvz., Martynui):

1. Prisijungti prie GitHub (bet kokia paskyra – be jos artefaktų atsisiųsti neleidžia).
2. https://github.com/ignas10-ai/novacore/actions/workflows/android.yml → viršutinis žalias (✓) paleidimas → apačioje **Artifacts** → **novacore-debug-apk** (atsisiunčia `.zip`; laikomas 90 d.).
3. Išarchyvuoti → `app-debug.apk` persiųsti į telefoną (arba atsisiųsti iškart telefone).
4. Telefone atidaryti `app-debug.apk` → leisti diegti iš šio šaltinio („Nežinomi šaltiniai“ / „Install unknown apps“ naršyklei ar failų tvarkyklei) → Įdiegti. Play Protect gali perspėti („nežinomas kūrėjas“) – „Vis tiek įdiegti“.
5. Pirmą kartą paleidus žaidimą programėlė paprašys leidimo kamerai – leisti.

Naujesnę versiją diegti ant viršaus (ta pati debug versija, duomenys lieka). Žaidimui pirmą kartą reikia interneto (MediaPipe modelis kraunamas iš CDN).

Rankiniu būdu (su Android SDK): `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`.

Viso kūrimo seanso pakeitimai: [CHANGELOG.md](CHANGELOG.md).
