// Regresija ant TIKRŲ žmonių įrašų: kiekvienam fixture – kiek pakartojimų turi užskaityti step().
// `node tools/replay-check.cjs` → OK arba sąrašas, kas nukrypo. Paleisti po kiekvieno step() keitimo.
// Tikrasis skaičius suskaičiuotas ranka iš kadrų lapų (ffmpeg fps=4..8 tile) 2026-10-23.
const {runFile}=require("./replay.cjs");
const path=require("path"),fs=require("fs");
const CASES=[
  // fixture, pratimas, laukiama, tolerancija, langas, pastaba[, tikras skaičius – kai laukiama ≠ tikra; naudoja accuracy.cjs]
  ["squat","squat",3,0,{},"3 pritūpimai iš priekio (sq_front_00001)"],
  ["squat2","squat",3,0,{},"3 pritūpimai, kamera ~30° kampu (sq_front_00002)"],
  ["squat3","squat",6,0,{},"6 pritūpimų, kojas dalinai dengia kamuolys, 640×480 (sq_front_00003)"],
  ["squat4","squat",4,0,{},"4 lėti pritūpimai, rankos į priekį (YT qtwh-kxcWmE)"],
  ["squatjump","squatjump",8,1,{},"9 šuoliukai; paskutinis nusileidžia jau po įrašo pabaigos (12,7 s)",9],
  ["squatjump3","squatjump",6,1,{to:16.9},"6 šuoliukų iš gilaus pritūpimo be atsistojimo tarp jų (squat_jump_00001; detect-v4: pėdos nuo grindų, buvo 0)"],
  ["squatjump5","squatjump",6,1,{to:21.4},"6 šuoliukų, kitas žmogus, šiek tiek kampu (Leap Fitness txLE-jOCEsc 13,5–21,4 s; v3 – 0)"],
  ["squatjump5","squatjump",2,1,{from:23},"3 šuoliukai; pirmas pritūpimas tamsus – kojos „nematomos“ (VIS), todėl 2",3],
  ["squatjump","squat",9,1,{},"pritūpimų detektorius ant šuoliukų – turi skaičiuoti visus"],
  ["sidestep","sidestep",9,2,{},"~16 išžengimų, iš jų 9 su kūno pasislinkimu (kiti – išžengimas ir atgal)"],
  ["sidestep2","sidestep",12,2,{},"12 žingsnių „lateral squat walk“, kamera seka žmogų, pėdos ne visada susiglaudžia (YT bQoc10-MHlE 1,5–20,6 s)"],
  ["sidestep3","sidestep",11,1,{},"11 lėtų žingsnių su pritūpimu, kitas žmogus (YT g78CxAtjkCE, dešinysis žmogus)"],
  ["sidestep-squat","sidestep",0,0,{},"išžengimas + pritūpimas + atgal į vietą ≠ šoninis žingsnis (YT Ap5Xjp9lRd8; buvo 2)"],
  ["jack2","jack",4,0,{to:5.2},"4 pašokimai (YT uLVt6u15L98, iki stambaus plano)"],
  ["jack2","jack",3,0,{from:8.5},"3 pašokimai po stambaus plano"],
  ["jack3","jack",11,1,{},"11 pašokimų, žmogus mažas kadre, rankos virš galvos X (YT wdzPdljVpr0)"],
  ["jack4","jack",3,0,{to:5.5},"3 pašokimai, tamsi salė (YT CWpmIW6l-YA)"],
  ["jack4","jack",3,0,{from:26},"3 pašokimai, antras planas"],
  ["jack5","jack",6,0,{},"6 pašokimų (Fitness Blender c4DAnQ6DtF8, tik vaizdas iš priekio)"],
  ["jack6","jack",11,1,{},"11 pašokimų namuose, šalia mažas antras vaizdas (YT nGaXj3kkmrU 50–63 s)"],
  ["knees","knees",24,2,{},"24 kelių pakėlimai (9–25 s; 10-25 perskaičiuota kadrais; v4 26 – 1 kadro kojų sukeitimas 12,9 s)"],
  ["knees","knees",14,2,{from:17.5,to:29.6},"14 pakėlimų antroje pusėje (k-NN mokytas tik 0–17,5 s)"],
  ["knees2","knees",24,2,{},"24 greiti žemesni pakėlimai (kelis tik iki klubų) su pašokimu, ~30° kampu (YT DfjpR6dzLVg; v4: kelių tarpusavio aukštis, buvo 7)"],
  ["knees3","knees",16,2,{},"16 pakėlimų bėgant vietoje (YT VGb_fJ81yWc)"],
  ["crunch","crunch",7,1,{},"8 įstriži atsilenkimai (cc_00001)",8],
  ["crunch","crunch",4,0,{from:18,to:24.8},"4 atsilenkimai antroje pusėje (k-NN mokytas tik 0–18 s)"],
  ["crunch2","crunch",8,1,{},"8 atsilenkimų, lauke, kamera arti (YT 1lhIgmu6dkQ)"],
  ["crunch3","crunch",10,1,{},"10 atsilenkimų, sporto salė, žmogus mažas (YT mHcLoucwiSo)"],
  ["crunch4","crunch",5,0,{},"5 atsilenkimai (YT ubCkax7G2O8)"],
  ["lunge","lunge",3,0,{from:9,to:21},"front-view įtūpstai, 3 tikri"],
  ["lunge","lunge",2,1,{from:25,to:31.4},"3 tikri, vienas labai seklus",3],
  ["lunge","lunge",1,0,{from:37,to:41},"1 tikras"],
  ["lunge5","lunge",3,0,{},"3 įtūpstai, kitas žmogus, ~20° kampu (YT riVwQa0N-SU)"],
  // neigiami: kitas pratimas neturi skaičiuotis
  ["oblique-sidebend","crunch",0,0,{},"šoninis (ne įstrižas) atsilenkimas – ne cross crunch"],
  ["oblique-sidebend","crunch",0,0,{from:17,to:26.4},"tas pats, antra pusė (k-NN neigiami pavyzdžiai tik iš 0–17 s)"],
  ["squat","lunge",0,0,{},"pritūpimas ≠ įtūpstas"],
  ["squat3","lunge",0,0,{},"pritūpimas ≠ įtūpstas"],
  ["squatjump3","lunge",0,0,{to:16.9},"mini šuoliukai ≠ įtūpstas (step() skaičiavo 1)"],
  ["squat2","lunge",0,0,{},"pritūpimas kampu ≠ įtūpstas"],
  ["squat2","knees",0,0,{},"pritūpimas kampu ≠ aukšti keliai (abu keliai kartu; buvo 3)"],
  ["squat2","crunch",0,0,{},"pritūpimas kampu ≠ atsilenkimas (abu keliai kartu; buvo 3)"],
  ["squatjump","lunge",0,0,{},"šuoliukas ≠ įtūpstas"],
  ["squat","squatjump",0,0,{},"atsistojimas iš pritūpimo be šuolio ≠ šuoliukas"],
  ["knees","squatjump",0,0,{},"aukšti keliai su pašokimu ≠ šuoliukas (buvo 13)"],
  ["knees3","squatjump",0,0,{},"bėgimas vietoje ≠ šuoliukas (buvo 8)"],
  ["lunge5","squatjump",0,0,{},"įtūpstai ≠ šuoliukas (kojų sukeitimas ~100 ms)"],
  ["sidestep","squatjump",0,0,{},"šoniniai žingsniai ≠ šuoliukas (buvo 13)"],
  ["crunch2","squatjump",0,0,{},"atsilenkimai ≠ šuoliukas (buvo 4)"],
  ["lunge","knees",1,1,{from:9,to:21},"įtūpstai ≠ aukšti keliai (priekinio kelio pėda lieka ant grindų)",0],
  ["lunge5","knees",0,1,{},"įtūpstai ≠ aukšti keliai"],
  ["squat","knees",0,1,{},"pritūpimas ≠ aukšti keliai"],
  ["knees3","squat",0,0,{},"bėgimas vietoje ≠ pritūpimas"],
  ["crunch3","squat",0,1,{},"atsilenkimai ≠ pritūpimas (step() skaičiavo 9)"],
  ["crunch4","squat",0,0,{},"atsilenkimai ≠ pritūpimas (step() skaičiavo 5)"],
  ["lunge5","squat",0,1,{},"įtūpstai ≠ pritūpimas (step() skaičiavo 3)"],
  ["crunch","squat",0,0,{from:18,to:24.8},"atsilenkimai ≠ pritūpimas"],
  ["squat-side","squat",0,0,{},"šoninis vaizdas – viena koja nematoma → lost, 0 (kamera turi būti iš priekio)"],
];
module.exports={CASES};
if(require.main===module){
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
}
