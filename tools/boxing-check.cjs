// Boksas prabėgimas headless Chrome su „suvaidinta" kamera (kaip sprint-check.cjs) → kadrai + fps + istorija + atgal taisyklės.
// Naudojimas: npm run build && node tools/boxing-check.cjs <cam.y4m> [--players 1|2] [--dur 30|60] [--landscape] [--out dir] [--size 390x844] [--gpu]
//   --gpu: tikra vaizdo plokštė (d3d11) – be jos MediaPipe headless režime ~1 kadras/s ir smūgių beveik nebūna.
//   y4m: pradžioje abiem riešais virš nosies (pasiruošimo vartai), toliau judančios rankos (taikiniai pataikomi atsitiktinai).
// Rezultatas: <out>/01-home … NN-results(+bottom), home-after + ataskaita (taškai, smūgiai, fps, istorijos eilutė, OK/FAIL).
const path=require("path"),fs=require("fs"),http=require("http");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const [,,y4m,...rest]=process.argv;
if(!y4m||!fs.existsSync(y4m)){console.error("node tools/boxing-check.cjs <cam.y4m> [--players 1|2] [--dur 30|60] [--landscape] [--out dir]");process.exit(1)}
const arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const landscape=rest.includes("--landscape"),players=arg("--players","2"),dur=arg("--dur","30");
const out=arg("--out",path.join(__dirname,"..","_playthrough","boxing",`${players}p${landscape?"-landscape":""}`));
fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,"..","dist");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp",".woff2":"font/woff2"};
const port=8820+(landscape?1:0)+(players==="1"?2:0);
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let b;
(async()=>{
  b=await puppeteer.launch({executablePath:CHROME,headless:"new",protocolTimeout:600000,args:["--no-sandbox","--lang=lt-LT","--accept-lang=lt-LT","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`,"--autoplay-policy=no-user-gesture-required",...(rest.includes("--gpu")?["--use-angle=d3d11","--ignore-gpu-blocklist","--enable-gpu-rasterization"]:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])]});
  const p=await b.newPage();
  const [vw,vh]=(arg("--size","")||(landscape?"844x390":"390x844")).split("x").map(Number);
  await p.setViewport({width:vw,height:vh,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,200))});
  let n=0;const shot=async(name,wait=0)=>{if(wait)await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${name}.png`;await p.screenshot({path:path.join(out,f)});console.log("•",f)};
  const q=(js,...a)=>p.evaluate(js,...a);
  const vis=id=>q(id=>!document.getElementById(id).classList.contains("hide"),id);
  await p.evaluateOnNewDocument(()=>localStorage.setItem("novacore.onb","1"));
  await p.goto(`http://localhost:${port}/#/`,{waitUntil:"networkidle0"});
  await q(()=>document.querySelector(".bx-tile").scrollIntoView({block:"center"}));
  await shot("home-tile",800);
  await p.click(".bx-tile");await shot("setup",900);
  await p.click(`[data-bx="${players}"]`);await p.click(`[data-bxd="${dur}"]`);await sleep(200);
  await p.$eval("#boxing",el=>el.scrollTop=el.scrollHeight);await shot("setup-bottom",400);
  await p.click("#bxGo");
  for(let i=0;i<180;i++){await sleep(500);if(await q(()=>!document.getElementById("ready").classList.contains("hide")&&document.getElementById("loading").classList.contains("hide")))break}
  await shot("ready",1200);
  for(let i=0;i<240;i++){await sleep(250);if(await vis("boxRun"))break}
  await shot("pasiruosk",300);
  for(let i=0;i<40;i++){await sleep(100);if(await q(()=>document.getElementById("bxCall").classList.contains("is-num")))break}
  await shot("count",100);
  for(let i=0;i<60;i++){await sleep(50);if(await q(()=>window.__boxState().phase==="play"))break}
  await shot("kova",150);
  const t0=Date.now();
  // Android back mid-round is swallowed (game.ts: S.running)
  await q(()=>history.back());await sleep(600);
  const nav=[["atgal raundo metu ignoruojamas",await q(()=>!document.getElementById("boxRun").classList.contains("hide")&&location.hash==="#/zaidimas")]];
  const frames=Math.max(4,Math.round(+dur/4));
  let lastHits=-1,hitShot=false;
  for(let k=0;k<frames;k++){
    await sleep(+dur*1000/frames-300);
    if(await vis("boxEnd"))break;
    const s=await q(()=>window.__boxState());
    const hits=s.p.reduce((a,x)=>a+x.hits,0);
    await shot(`round-${k}${hits>lastHits&&lastHits>=0?"-hit":""}`);
    lastHits=hits;
    console.log("   ",JSON.stringify(s.p.map(x=>`${x.score}tšk ${x.hits}h ${x.misses}m ${x.bombs}b c${x.combo}`)));
  }
  const perf=await q(()=>window.__boxPerf&&window.__boxPerf());
  const end=await q(()=>window.__boxState());
  for(let i=0;i<60;i++){await sleep(250);if(await q(()=>window.__boxState().phase==="end"))break}
  if(await q(()=>window.__boxState().phase==="end"))await shot("laikas",200);
  for(let i=0;i<120;i++){await sleep(500);if(await vis("boxEnd"))break}
  await shot("results",1200);
  await p.$eval("#boxEnd",el=>el.scrollTop=el.scrollHeight);await shot("results-bottom",400);
  const hist=await q(()=>JSON.parse(localStorage.getItem("novacore.history")||"[]")[0]);
  console.log("fps:",JSON.stringify(perf),"| raundas ~",((Date.now()-t0)/1000).toFixed(1),"s");
  console.log("galas:",JSON.stringify(end.p));
  console.log("istorija:",JSON.stringify({mode:hist?.mode,players:hist?.players,duration:hist?.duration,pts:hist?.pts,reps:hist?.reps,acc:hist?.acc,combo:hist?.combo}));
  nav.push(["istorijoje boksas",hist?.mode==="boxing"&&hist.players===+players&&hist.duration===+dur&&Array.isArray(hist.pts)]);
  nav.push(["rezultatų taškai = žaidimo taškai",JSON.stringify(hist?.pts?.slice(0,+players))===JSON.stringify(end.p.map(x=>x.score))]);
  nav.push(["bent vienas taikinys pasirodė",end.p.some(x=>x.hits+x.misses+x.bombs>0)]);
  // the highlight clip (camera only): open it, then come back via "Žaisti dar kartą" there (must restart BOXING, not the rep game)
  if(await q(()=>!document.getElementById("bxClip").hidden)){
    await p.click("#bxClip");await sleep(1500);
    await shot("clips",500);
    nav.push(["klipas atidarytas",await vis("clips")]);
    await q(()=>document.querySelector("#clips [data-again]").click());
  }else await q(()=>document.getElementById("bxAgain").click());
  for(let i=0;i<120;i++){await sleep(500);if(await vis("ready"))break}
  nav.push(["„Žaisti dar kartą“ → pasiruošimas",await q(()=>!document.getElementById("ready").classList.contains("hide")&&document.getElementById("boxEnd").classList.contains("hide"))]);
  // the gate passes again -> the BOXING round (not the rep-game HUD); the fake camera may not show arms up again: then n/a
  let mode="";
  for(let i=0;i<100&&!mode;i++){await sleep(250);mode=await q(()=>!document.getElementById("boxRun").classList.contains("hide")?"boxing":document.getElementById("hud").classList.contains("on")?"rep":"")}
  if(mode)nav.push(["„Žaisti dar kartą“ paleidžia boksą, ne pratimų žaidimą",mode==="boxing"]);
  else console.log("n/a  antras raundas neprasidėjo (kamera nerodė rankų aukštyn)");
  for(const [t,v] of nav)console.log(v?"ok  ":"FAIL",t);
  console.log(errs.length?"KLAIDOS:\n  "+errs.join("\n  "):"klaidų nėra","\n→",out);
  await b.close();srv.close();
  process.exit(nav.every(([,v])=>v)&&!errs.length?0:1);
})().catch(async e=>{console.error(e);try{await b?.close()}catch(_){}srv.close();process.exit(1)});
