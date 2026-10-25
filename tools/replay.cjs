// Fixture (tools/fixtures/*.json) → step() iš src/detect/step.ts → kiek pakartojimų užskaitytų.
// Naudojimas: node tools/replay.cjs <fixture> [pratimas|all] [--person 0] [--from s] [--to s]
//   node tools/replay.cjs squat squat      → tik pritūpimų detektorius
//   node tools/replay.cjs squat all        → visi 7 detektoriai ant to paties įrašo (kryžminiai klaidingi užskaitymai)
// Spausdina: pakartojimai, laikai, kiek kadrų „nematomas" (lost). Tikrą skaičių pasitikrink iš vaizdo.
const fs=require("fs"),path=require("path");
const {step}=require("../src/detect/step.ts"),{EX}=require("../src/detect/exercises.ts"),{POSE,poseEmbed}=require("../src/detect/classifier.ts");
// same sample poses as the game (src/main.ts fetches pose-samples.json)
const SAMPLES=path.join(__dirname,"..","public","pose-samples.json");
if(fs.existsSync(SAMPLES))Object.assign(POSE,JSON.parse(fs.readFileSync(SAMPLES,"utf8")));
const toLm=p=>p.map(([x,y,visibility,z=0])=>({x,y,z,visibility}));
// pose: undefined = as in the game, null = hand-written step() branch, {…} = this classifier config
function runFile(file,id,{person=0,from=0,to=1e9,pose}={}){
  const data=JSON.parse(fs.readFileSync(file,"utf8"));
  const live=POSE[id];if(pose!==undefined){if(pose)POSE[id]=pose;else delete POSE[id]}
  const s={ar:data.w/data.h};let reps=0,lost=0,seen=0;const times=[];
  for(const f of data.frames){
    if(f.t<from||f.t>to)continue;
    const p=f.p[person];if(!p)continue;seen++;
    if(step(s,toLm(p),id,f.t*1000)){reps++;times.push(f.t.toFixed(1))}
    if(s.lost)lost++;
  }
  if(live)POSE[id]=live;else delete POSE[id];
  return {id,reps,times,lost,seen,data};
}
module.exports={runFile,EX,POSE,poseEmbed};
if(require.main===module){
  const [,,fx,exArg="all",...rest]=process.argv;
  if(!fx){console.error("node tools/replay.cjs <fixture> [pratimas|all]");process.exit(1)}
  const arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?+rest[i+1]:d};
  const opts={person:arg("--person",0),from:arg("--from",0),to:arg("--to",1e9)};
  const file=fx.endsWith(".json")?fx:path.join(__dirname,"fixtures",fx+".json");
  const ids=exArg==="all"?EX.map(e=>e.id):[exArg];
  if(ids.some(id=>!EX.find(e=>e.id===id))){console.error("nežinomas pratimas:",exArg,"→",EX.map(e=>e.id).join(", "));process.exit(1)}
  let header=false;
  for(const id of ids){
    const r=runFile(file,id,opts);
    if(!header){header=true;console.log(`${path.basename(file,".json")}: ${r.data.frames.length} kadrų, ${r.data.duration.toFixed(1)} s, langas ${opts.from}–${Math.min(opts.to,r.data.duration).toFixed(1)} s, žmogus #${opts.person}`)}
    console.log(`  ${id.padEnd(10)} ${String(r.reps).padStart(3)} rep  lost ${String(r.lost).padStart(3)}/${r.seen}  ${r.times.join(" ")}`);
  }
}
