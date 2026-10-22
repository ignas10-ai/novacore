# NovaCore – 3 minutės judėjimo su draugais

Prototipas Samsung Solve for Tomorrow 2026 (tema: sportas ir technologijos).
Komanda: Ignas Bagdanavičius, Martynas Ignatavičius, Stela Bujanauskaitė · mokytoja Rūta Sidaugienė.

Vienas `index.html`: telefono kamera → MediaPipe Pose (veikia įrenginyje, vaizdas niekur nesiunčiamas) → prieš startą pasirenkami pratimai ir 3 s laikomos rankos virš galvos → skaičiuoja pasirinktus pratimus (pritūpimai, pašokimai, aukšti keliai, pritūpimai su šuoliuku, šoniniai žingsniai, atvirkštiniai įtūpstai, įstriži atsilenkimai stovint) 1–2 žaidėjams (su animuotu demonstravimu ir krypties rodyklėmis) → taškai, kas 30 s daugiklis auga → rezultatai → 15–30 s geriausių akimirkų peržiūra (iš visų pasirinktų pratimų, pagal žaidimo orientaciją, MP4) ir pilno klipo atsisiuntimas (be kūno linijų), vienas atsisiuntimo meniu ir peržiūros bendrinimas. Kamera ir klipai automatiškai naudoja iki 1080p60, jei telefonas tai palaiko. Žaidimo metu ekranas neužmiega (Screen Wake Lock).

Paleisti: atidaryti per https (kamera), pvz. `npx serve` arba Vercel.

Viso kūrimo seanso pakeitimai: [CHANGELOG.md](CHANGELOG.md).
