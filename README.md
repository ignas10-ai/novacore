# NovaCore – 3 minutės judėjimo su draugais

Prototipas Samsung Solve for Tomorrow 2026 (tema: sportas ir technologijos).
Komanda: Ignas Bagdanavičius, Martynas Ignatavičius, Stela Bujanauskaitė · mokytoja Rūta Sidaugienė.

Telefono kamera → MediaPipe Pose (veikia įrenginyje, vaizdas niekur nesiunčiamas) → prieš startą pasirenkami pratimai ir 3 s laikomos rankos virš galvos → skaičiuoja pasirinktus pratimus (pritūpimai, pašokimai, aukšti keliai, pritūpimai su šuoliuku, šoniniai žingsniai, atvirkštiniai įtūpstai, įstriži atsilenkimai stovint) 1–2 žaidėjams (su animuotu demonstravimu ir krypties rodyklėmis) → taškai, kas 30 s daugiklis auga → rezultatai → 15–30 s geriausių akimirkų peržiūra (iš visų pasirinktų pratimų, pagal žaidimo orientaciją, MP4) ir pilno klipo atsisiuntimas (be kūno linijų), vienas atsisiuntimo meniu ir peržiūros bendrinimas. Kamera ir klipai automatiškai naudoja iki 1080p60, jei telefonas tai palaiko. Žaidimo metu ekranas neužmiega (Screen Wake Lock).

Nuo app-v2 tai programėlė su meniu apačioje: **Pradžia** (serija, savaitės tikslas, vieta lentelėje, greitas startas), **Kompanijos** (savaitės lentelė su draugais), **Pratimai** (visi pratimai su animacija ir patarimais) ir **Profilis** (statistika, 7 dienos, ženkliukai, istorija, nustatymai); pirmą kartą – trumpas įvadas.

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

Viso kūrimo seanso pakeitimai: [CHANGELOG.md](CHANGELOG.md).
