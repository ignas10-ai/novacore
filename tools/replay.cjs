// Fixture (tools/fixtures/*.json) → step() iš index.html → kiek pakartojimų užskaitytų.
// Naudojimas: node tools/replay.cjs <fixture> [pratimas|all] [--person 0] [--from s] [--to s]
//   node tools/replay.cjs squat squat      → tik pritūpimų detektorius
//   node tools/replay.cjs squat all        → visi 7 detektoriai ant to paties įrašo (kryžminiai klaidingi užskaitymai)
// Spausdina: pakartojimai, laikai, kiek kadrų „nematomas" (lost). Tikrą skaičių pasitikrink iš vaizdo.
const fs=require("fs"),path=require("path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const a=html.indexOf("const EX=["),b=html.indexOf("if(typeof module");
const m={};new Function("module",html.slice(a,b)+"\nmodule.exports={step,EX,NEED};")(m);
const {step,EX}=m.exports;
const toLm=p=>p.map(([x,y,visibility,z=0])=>({x,y,z,visibility}));
function runFile(file,id,{person=0,from=0,to=1e9}={}){
  const data=JSON.parse(fs.readFileSync(file,"utf8"));
  const s={};let reps=0,lost=0,seen=0;const times=[];
  for(const f of data.frames){
    if(f.t<from||f.t>to)continue;
    const p=f.p[person];if(!p)continue;seen++;
    if(step(s,toLm(p),id,f.t*1000)){reps++;times.push(f.t.toFixed(1))}
    if(s.lost)lost++;
  }
  return {id,reps,times,lost,seen,data};
}
module.exports={runFile,EX};
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
