// Tikslumo ataskaita: kiekvienam replay-check atvejui – laukta vs step() (ranka rašyta logika) vs k-NN klasifikatorius
// (pavyzdžiai iš samples-spec.json). „held-out" = atvejo langas nepersidengia su nė vienu to pratimo mokymo intervalu.
// Naudojimas: node tools/accuracy.cjs [--dir kitas/fixtures] [--only squat,lunge]
const path=require("path"),fs=require("fs");
const {runFile}=require("./replay.cjs"),{CASES}=require("./replay-check.cjs"),{SPEC,build}=require("./samples.cjs");
const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:null};
const dir=path.resolve(arg("--dir")||path.join(__dirname,"fixtures")),only=arg("--only")?.split(",");
// fixture'ai, ant kurių derinti k-NN skaitiklio papildomi vartai step() (pvz. įtūpsto kelių išsiskyrimas) – ne held-out
const GATE_TUNED={lunge:["lunge","sidestep","sidestep2"]};
const trained=(ex,fx,{from=0,to=1e9})=>(GATE_TUNED[ex]||[]).includes(fx)||(SPEC[ex]?.sets||[]).some(s=>s.fx===fx&&Object.entries(s).some(([k,r])=>k!=="fx"&&k!=="every"&&r.some(([a,b])=>a<to&&b>from)));
// fixture'ai, ant kurių derinti step() slenksčiai (pagal pratimą) – jų skaičiai nėra held-out
const STEP_TUNED={squat:["squat","squatjump"],squatjump:["squatjump","squatjump3","knees3","lunge5","squatjump6","squatjump7","lunge"],sidestep:["sidestep","sidestep2","sidestep-squat"],
  knees:["knees","knees2","squat2","lunge"],crunch:["crunch","oblique-sidebend","squat2","knees3"],lunge:["lunge"],jack:[]};
const cfg={},err={};
console.log("fixture          pratimas   langas      tikra   step  k-NN  held-out (step / k-NN)");
for(const [fx,ex,want0,tol,win,,truth] of CASES){
  const want=truth??want0;
  if(only&&!only.includes(ex))continue;
  const file=path.join(dir,fx+".json");if(!fs.existsSync(file))continue;
  if(SPEC[ex]&&!cfg[ex])cfg[ex]=build(ex,{dir});
  const a=runFile(file,ex,{...win,pose:null}).reps, b=cfg[ex]?runFile(file,ex,{...win,pose:cfg[ex]}).reps:null;
  const held=cfg[ex]?!trained(ex,fx,win):null, sheld=!(STEP_TUNED[ex]||[]).includes(fx);
  const e=err[ex]=err[ex]||{n:0,step:0,knn:0,hn:0,hstep:0,hknn:0,sn:0};
  const da=Math.abs(a-want0)>tol,db=b!=null&&Math.abs(b-want0)>tol; // ✗ = už replay-check tolerancijos
  e.n++;e.step+=Math.abs(a-want);e.knn+=b==null?0:Math.abs(b-want);if(held){e.hn++;e.hknn+=Math.abs(b-want)}if(sheld){e.sn++;e.hstep+=Math.abs(a-want)}
  const w=win.from!=null||win.to!=null?`${win.from??0}–${win.to??"pab."}`:"visas";
  console.log(`${fx.padEnd(16)} ${ex.padEnd(10)} ${w.padEnd(11)} ${String(want).padStart(6)} ${String(a).padStart(5)}${da?"✗":" "}${String(b??"–").padStart(5)}${db?"✗":" "} ${sheld?"taip":"ne"} / ${held==null?"–":held?"taip":"ne"}`);
}
console.log("\nSuma |klaida| (visi atvejai / tik held-out):");
for(const [ex,e] of Object.entries(err))console.log(`  ${ex.padEnd(10)} step ${e.step} / ${e.hstep} (${e.sn} held-out)   k-NN ${SPEC[ex]?e.knn:"–"} / ${SPEC[ex]?e.hknn:"–"} (${e.hn} held-out)   ${e.n} atv.`);
