// Sprintas 100 m prabėgimas headless Chrome su „suvaidinta" kamera (kaip playthrough.cjs) → kadrai + fps.
// Naudojimas: npm run build && node tools/sprint-check.cjs <cam.y4m> [--players 1|2] [--landscape] [--out dir] [--size 390x844] [--gpu]
//   --gpu: tikra vaizdo plokštė (d3d11) vietoj swiftshader – be jos MediaPipe headless režime ~1 kadras/s ir bėgikai beveik nejuda.
//   y4m: ~5 s abiem riešais virš nosies (paruošimo vartai), ~4 s ramiai stovint (atgalinis skaičiavimas), tada aukšti keliai.
// Rezultatas: <out>/01-setup, 02-ready, 03-pozicijos, 04-demesio, 05-mars, 06..-race-N, NN-finish, NN-results(+scroll) + fps ataskaita.
const path=require("path"),fs=require("fs"),http=require("http");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const [,,y4m,...rest]=process.argv;
if(!y4m||!fs.existsSync(y4m)){console.error("node tools/sprint-check.cjs <cam.y4m> [--players 1|2] [--landscape] [--out dir]");process.exit(1)}
const arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const landscape=rest.includes("--landscape"),players=arg("--players","2");
const out=arg("--out",path.join(__dirname,"..","_playthrough","sprint",`${players}p${landscape?"-landscape":""}`));
fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,"..","dist");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp"};
const port=8800+(landscape?1:0)+(players==="1"?2:0);
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",protocolTimeout:600000,args:["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`,"--autoplay-policy=no-user-gesture-required",...(rest.includes("--gpu")?["--use-angle=d3d11","--ignore-gpu-blocklist","--enable-gpu-rasterization"]:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])]});
  const p=await b.newPage();
  const [vw,vh]=(arg("--size","")||(landscape?"844x390":"390x844")).split("x").map(Number);
  await p.setViewport({width:vw,height:vh,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,200))});
  let n=0;const shot=async(name,wait=0)=>{if(wait)await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${name}.png`;await p.screenshot({path:path.join(out,f)});console.log("•",f)};
  const q=(js)=>p.evaluate(js);
  await p.evaluateOnNewDocument(()=>localStorage.setItem("novacore.onb","1"));
  await p.goto(`http://localhost:${port}/#/`,{waitUntil:"networkidle0"});
  await shot("home",800);
  await p.click(".sp-tile");await shot("setup",900);
  await p.click(`[data-sp="${players}"]`);await sleep(200);
  await p.click("#spGo");
  for(let i=0;i<180;i++){await sleep(500);if(await q(()=>!document.getElementById("ready").classList.contains("hide")&&document.getElementById("loading").classList.contains("hide")))break}
  await shot("ready",1200);
  for(let i=0;i<240;i++){await sleep(250);if(await q(()=>!document.getElementById("sprintRun").classList.contains("hide")))break}
  await shot("pozicijos",500);
  for(let i=0;i<40;i++){await sleep(100);if(await q(()=>document.getElementById("spCall").classList.contains("is-set")))break}
  await shot("demesio",300);
  for(let i=0;i<60;i++){await sleep(50);if(await q(()=>document.getElementById("spCall").classList.contains("is-go")))break}
  await shot("mars",120);
  const t0=Date.now();
  // Android back mid-race is swallowed (game.ts: S.running)
  await q(()=>history.back());await sleep(600);
  const nav=[["atgal lenktynių metu ignoruojamas",await q(()=>!document.getElementById("sprintRun").classList.contains("hide")&&location.hash==="#/zaidimas")]];
  for(let k=0;k<12;k++){
    await sleep(2500);
    if(await q(()=>!document.getElementById("sprintEnd").classList.contains("hide")))break;
    const fin=await q(()=>document.getElementById("spCall").classList.contains("is-fin"));
    await shot(fin?`finish-${k}`:`race-${k}`);
  }
  const perf=await q(()=>window.__sprintPerf&&window.__sprintPerf());
  for(let i=0;i<120;i++){await sleep(500);if(await q(()=>!document.getElementById("sprintEnd").classList.contains("hide")))break}
  await shot("results",1200);
  await p.$eval("#sprintEnd",el=>el.scrollTop=el.scrollHeight);await shot("results-bottom",400);
  const hist=await q(()=>JSON.parse(localStorage.getItem("novacore.history")||"[]")[0]);
  console.log("fps:",JSON.stringify(perf),"| lenktynės ~",((Date.now()-t0)/1000).toFixed(1),"s");
  console.log("istorija:",JSON.stringify({mode:hist?.mode,times:hist?.times,reps:hist?.reps}));
  // "Bėgti dar kartą" -> ready gate again, back there -> sprint setup; then Pradžia from the tile flow
  await q(()=>document.getElementById("spAgain").click());
  for(let i=0;i<120;i++){await sleep(500);if(await q(()=>!document.getElementById("ready").classList.contains("hide")))break}
  nav.push(["„Bėgti dar kartą“ → pasiruošimas",await q(()=>!document.getElementById("ready").classList.contains("hide")&&document.getElementById("sprintEnd").classList.contains("hide"))]);
  await q(()=>history.back());await sleep(800);
  nav.push(["atgal pasiruošime → sprinto nustatymai",await q(()=>location.hash==="#/sprintas"&&!document.getElementById("sprint").classList.contains("hide")&&!document.body.classList.contains("ingame"))]);
  await q(()=>history.back());await sleep(800);await shot("home-after",600);
  nav.push(["atgal iš nustatymų → Pradžia",await q(()=>location.hash==="#/"&&!document.getElementById("home").classList.contains("hide"))]);
  for(const [t,v] of nav)console.log(v?"ok  ":"FAIL",t);
  console.log(errs.length?"KLAIDOS:\n  "+errs.join("\n  "):"klaidų nėra","\n→",out);
  await b.close();srv.close();
})().catch(e=>{console.error(e);srv.close();process.exit(1)});
