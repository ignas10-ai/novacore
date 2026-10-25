// Vaizdo įrašas → tools/fixtures/<name>.json (MediaPipe Pose landmark'ai kas ~33 ms).
// Naudojimas: node tools/extract.cjs <video.mp4> <name> [--poses 2] [--step 33] [--model lite|full] [--out dir] [--cpu]
// Reikia: Chrome + puppeteer-core (PUPPETEER_CORE kelias žemiau arba env). Internetas – modelis iš CDN.
const path=require("path"),fs=require("fs"),{pathToFileURL}=require("url");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const [,,video,name,...rest]=process.argv;
if(!video||!name){console.error("node tools/extract.cjs <video> <name> [--poses N] [--step ms]");process.exit(1)}
const arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--allow-file-access-from-files","--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const p=await b.newPage();
  p.on("console",m=>{if(m.type()==="error")console.error("[page]",m.text())});
  const url=pathToFileURL(path.join(__dirname,"extract.html")).href+`?src=${encodeURIComponent(pathToFileURL(path.resolve(video)).href)}&poses=${arg("--poses",1)}&step=${arg("--step",33)}&model=${arg("--model","lite")}&cpu=${rest.includes("--cpu")?1:0}`;
  await p.goto(url);
  const t0=Date.now();
  let res=null;
  while(!res){await new Promise(r=>setTimeout(r,500));res=await p.evaluate(()=>window.__result);if(Date.now()-t0>600e3)throw new Error("timeout")}
  await b.close();
  if(res.error){console.error(res.error);process.exit(1)}
  const dir=path.resolve(arg("--out",path.join(__dirname,"fixtures")));fs.mkdirSync(dir,{recursive:true});
  const out=path.join(dir,name+".json");
  res.src=path.basename(video); // be absoliučių kelių
  fs.writeFileSync(out,JSON.stringify(res));
  const seen=res.frames.filter(f=>f.p.length).length;
  console.log(`${name}: ${res.frames.length} kadrų, žmogus matomas ${seen} (${Math.round(seen/res.frames.length*100)} %), ${res.w}x${res.h}, ${res.duration.toFixed(1)} s, ${res.model} ${res.msPerFrame} ms/kadrą → ${path.relative(process.cwd(),out)}`);
})();
