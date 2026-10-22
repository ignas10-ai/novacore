// Regresija ant TIKRŲ žmonių įrašų: kiekvienam fixture – kiek pakartojimų turi užskaityti step().
// `node tools/replay-check.cjs` → OK arba sąrašas, kas nukrypo. Paleisti po kiekvieno step() keitimo.
// Tikrasis skaičius suskaičiuotas ranka iš kadrų lapų (ffmpeg fps=4..8 tile) 2026-10-23.
const {runFile}=require("./replay.cjs");
const path=require("path"),fs=require("fs");
const CASES=[
  // fixture, pratimas, laukiama, tolerancija, langas, pastaba
  ["squat","squat",3,0,{},"3 pritūpimai iš priekio (sq_front_00001)"],
  ["squatjump","squatjump",8,1,{},"9 šuoliukai; pirmas be stovimo baseline"],
  ["squatjump","squat",9,1,{},"pritūpimų detektorius ant šuoliukų – turi skaičiuoti visus"],
  ["sidestep","sidestep",9,2,{},"~16 išžengimų, iš jų 9 su kūno pasislinkimu (kiti – išžengimas ir atgal)"],
  ["knees","knees",24,2,{},"~25 kelių pakėlimai (9–25 s)"],
  ["crunch","crunch",7,1,{},"8 įstriži atsilenkimai (cc_00001)"],
  ["lunge","lunge",3,0,{from:9,to:21},"front-view įtūpstai, 3 tikri"],
  ["lunge","lunge",2,1,{from:25,to:31.4},"3 tikri, vienas labai seklus"],
  ["lunge","lunge",1,0,{from:37,to:41},"1 tikras"],
  // neigiami: kitas pratimas neturi skaičiuotis
  ["oblique-sidebend","crunch",0,0,{},"šoninis (ne įstrižas) atsilenkimas – ne cross crunch"],
  ["squat","lunge",0,0,{},"pritūpimas ≠ įtūpstas"],
  ["squatjump","lunge",0,0,{},"šuoliukas ≠ įtūpstas"],
  ["squat","knees",0,1,{},"pritūpimas ≠ aukšti keliai"],
  ["squat-side","squat",0,0,{},"šoninis vaizdas – viena koja nematoma → lost, 0 (kamera turi būti iš priekio)"],
];
let bad=0;
for(const [fx,ex,want,tol,win,note] of CASES){
  const file=path.join(__dirname,"fixtures",fx+".json");
  if(!fs.existsSync(file)){console.log(`  ? ${fx} – nėra fixture`);continue}
  const r=runFile(file,ex,win);
  const ok=Math.abs(r.reps-want)<=tol;
  if(!ok)bad++;
  console.log(`  ${ok?"✓":"✗"} ${fx.padEnd(16)} ${ex.padEnd(10)} ${String(r.reps).padStart(3)} (laukta ${want}±${tol})  ${note}`);
}
console.log(bad?`${bad} NUKRYPIMAI`:"OK");
process.exit(bad?1:0);
