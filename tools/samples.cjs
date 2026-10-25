// Pažymėti laiko intervalai fixture'uose (tools/samples-spec.json) → public/pose-samples.json (žaidimo k-NN pavyzdinės pozos).
// Naudojimas: node tools/samples.cjs   → perrašo public/pose-samples.json pratimais, kurių spec turi "live":true
// Spec: { pratimas: { live, flip, count:[klasės, kurios skaičiuojamos], every:N (kas N-tą kadrą; ir per set), pairs?:[EMB indeksai],
//                     sets:[{fx:"fixture", <klasė>:[[nuo,iki],…], …}] } }
// build() naudoja ir accuracy.cjs (palyginimas su step(), hold-out).
const fs=require("fs"),path=require("path");
const {poseEmbed}=require("./replay.cjs");
const SPEC=JSON.parse(fs.readFileSync(path.join(__dirname,"samples-spec.json"),"utf8"));
const cache={},load=(fx,dir)=>cache[dir+fx]||(cache[dir+fx]=JSON.parse(fs.readFileSync(path.join(dir,fx+".json"),"utf8")));
// skip(fx,from,to) → true išmeta tą intervalą (hold-out bandymams); dir – kiti fixture'ai (pvz. full modelio)
function build(ex,{skip,dir=path.join(__dirname,"fixtures")}={}){
  const sp=SPEC[ex],samples=[];
  for(const set of sp.sets){
    const d=load(set.fx,dir),ar=d.w/d.h;
    for(const [cls,ranges] of Object.entries(set)){
      if(cls==="fx"||cls==="every")continue;
      for(const [a,b] of ranges){
        if(skip&&skip(set.fx,a,b))continue;
        d.frames.filter(f=>f.t>=a&&f.t<=b&&f.p[0]).forEach((f,i)=>{
          if(i%(set.every||sp.every||3))return;
          samples.push([cls,...poseEmbed(f.p[0].map(([x,y,visibility,z=0])=>({x,y,z,visibility})),ar).map(v=>Math.round(v))]);
        });
      }
    }
  }
  return {flip:!!sp.flip,count:sp.count,...sp.pairs&&{pairs:sp.pairs},samples};
}
module.exports={SPEC,build};
if(require.main===module){
  const out={};
  for(const ex of Object.keys(SPEC))if(SPEC[ex].live)out[ex]=build(ex);
  const file=path.join(__dirname,"..","public","pose-samples.json");
  fs.writeFileSync(file,"{\n"+Object.entries(out).map(([ex,c])=>`${JSON.stringify(ex)}:{"flip":${c.flip},"count":${JSON.stringify(c.count)},${c.pairs?`"pairs":${JSON.stringify(c.pairs)},`:""}"samples":[\n${c.samples.map(s=>JSON.stringify(s)).join(",\n")}]}`).join(",\n")+"\n}\n");
  for(const [ex,c] of Object.entries(out))console.log(`${ex.padEnd(10)} ${c.samples.length} pozų (${[...new Set(c.samples.map(s=>s[0]))].map(k=>k+" "+c.samples.filter(s=>s[0]===k).length).join(", ")})`);
  console.log(`→ ${path.relative(process.cwd(),file)} ${(fs.statSync(file).size/1024).toFixed(0)} KB`);
}
