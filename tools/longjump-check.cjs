// Šuolis į tolį headless Chrome su „suvaidinta" kamera (kaip sprint-check.cjs) → kadrai + patikrinimai.
// Naudojimas: npm run build && node tools/longjump-check.cjs <cam.y4m> [--players 1-4] [--landscape] [--gpu] [--feed 3] [--out dir] [--size 390x844] [--lang en]
//   y4m: kaip sprintui (rankos aukštyn paruošimo vartams, tada aukšti keliai). Šuolio y4m nėra, todėl atsispyrimą
//   paleidžia testo kabliukas window.__lj.jump() kai bėgikas ~0,8 m prieš liniją (detektorius patikrintas unit testuose
//   ant tools/fixtures). --feed N = sintetinis tempas N žingsnių/s (numatyta 3; y4m kartojasi ir ~14 s jame rankos aukštyn,
//   be bėgimo; 0 = tik kamera). Be --gpu MediaPipe headless režime ~1 kadras/s.
//   Kiekvieno žaidėjo 2-as bandymas sąmoningai be šuolio → peržengta (X). Tarp ėjimų vartai: laukia rankų, po 4 s __lj.ready().
const path=require("path"),fs=require("fs"),http=require("http");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const [,,y4m,...rest]=process.argv;
if(!y4m||!fs.existsSync(y4m)){console.error("node tools/longjump-check.cjs <cam.y4m> [--players 1-4] [--landscape] [--gpu] [--feed 3] [--out dir]");process.exit(1)}
const arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const landscape=rest.includes("--landscape"),players=Number(arg("--players","2")),feed=Number(arg("--feed","3")),lang=arg("--lang","lt");
const out=arg("--out",path.join(__dirname,"..","_playthrough","longjump",`${players}p${landscape?"-landscape":""}`));
fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,"..","dist");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp",".woff2":"font/woff2"};
const port=8820+(landscape?1:0);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split("?")[0]);const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fails=[];const ok=(t,v)=>{console.log(v?"ok  ":"FAIL",t);if(!v)fails.push(t)};
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",protocolTimeout:600000,args:["--no-sandbox",`--lang=${lang==="en"?"en-GB":"lt-LT"}`,"--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`,"--autoplay-policy=no-user-gesture-required",...(rest.includes("--gpu")?["--use-angle=d3d11","--ignore-gpu-blocklist","--enable-gpu-rasterization"]:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])]});
  const p=await b.newPage();
  const [vw,vh]=(arg("--size","")||(landscape?"844x390":"390x844")).split("x").map(Number);
  await p.setViewport({width:vw,height:vh,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,200))});
  let n=0;const shot=async(name,wait=0)=>{if(wait)await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${name}.png`;await p.screenshot({path:path.join(out,f)});console.log("•",f)};
  const q=(js,...a)=>p.evaluate(js,...a);
  const st=()=>q(()=>window.__lj.state());
  const until=async(fn,ms,step=100)=>{for(let i=0;i<ms/step;i++){if(await fn())return true;await sleep(step)}return false};
  await p.evaluateOnNewDocument(()=>{localStorage.setItem("novacore.onb","1");localStorage.setItem("novacore.nick","Ignas")});
  await p.goto(`http://localhost:${port}/${lang==="en"?"?lang=en":""}#/`,{waitUntil:"networkidle0"});
  await shot("home",800);
  await p.$eval(".lj-tile",el=>el.scrollIntoView({block:"center"}));await shot("home-tile",300);
  await p.click(".lj-tile");await shot("setup",900);
  await p.click(`[data-lj="${players}"]`);await sleep(200);
  if(players>1){await p.click("#ljN2",{clickCount:3});await p.type("#ljN2","Martynas")}
  await p.$eval("#longjump",el=>el.scrollTop=el.scrollHeight);await shot("setup-bottom",400);
  await p.click("#ljGo");
  await until(()=>q(()=>!document.getElementById("ready").classList.contains("hide")&&document.getElementById("loading").classList.contains("hide")),90000,500);
  await shot("ready",1200);
  await until(()=>q(()=>!document.getElementById("ljRun").classList.contains("hide")),120000,100);
  await shot("turn-1",250);
  const N=players*3;
  if(feed)await q(f=>window.__lj.feed(f),feed);
  for(let k=0;k<N;k++){
    const foul=k%players===players-1&&Math.floor(k/players)===1; // the last player's 2nd attempt: no jump = foul
    await until(async()=>{const s=await st();return s.k===k&&s.phase!=="off"},30000,50);
    await q(x=>window.__lj.jumpAt(x),foul?-1:28.8); // take-off ~1.2 m before the line, inside the frame loop
    const seen=new Set(),t0=Date.now();let s,last,landAt=0;
    for(;;){
      s=await st();
      if(s.k>k||s.phase==="off")break;
      last=s;
      if(s.phase==="card"&&k>0&&Date.now()-t0>4000)await q(()=>window.__lj.ready()); // the looping y4m may not have arms up
      const first=!seen.has(s.phase);seen.add(s.phase);
      if(first&&s.phase==="card"&&k===1)await shot("turn-2",400);
      if(k===0){
        if(first&&s.phase==="run")await shot("go",100);
        if(s.phase==="run"&&s.x>12&&!seen.has("r12")){seen.add("r12");await shot("run")}
        if(s.phase==="run"&&s.x>27.4&&!seen.has("r27")){seen.add("r27");await shot("zone")}
        if(first&&s.phase==="air")await shot("air",100);
      }
      if(first&&s.phase==="land"){landAt=Date.now();if(k===0)await shot("land",800)}
      if(landAt&&(k===0||k===2)&&!seen.has("res")&&Date.now()-landAt>1500){seen.add("res");await shot(k?"result-3":"result")}
      if(first&&s.phase==="foul"&&foul)await shot("foul",500);
      await sleep(40);
    }
    console.log(`  ${k+1}/${N}`,JSON.stringify(s.jumps),`paskutinė būsena: x ${last.x.toFixed(1)} m, t ${last.t.toFixed(1)} s, ${last.phase} ${last.why||""}`);
  }
  await until(()=>q(()=>!document.getElementById("ljEnd").classList.contains("hide")),10000);
  await shot("results",1400);
  await p.$eval("#ljEnd",el=>el.scrollTop=el.scrollHeight);await shot("results-bottom",400);
  const hist=await q(()=>JSON.parse(localStorage.getItem("novacore.history")||"[]")[0]);
  console.log("istorija:",JSON.stringify({mode:hist?.mode,players:hist?.players,jumps:hist?.jumps,reps:hist?.reps}));
  ok("istorijoje longjump eilutė su visais bandymais",hist?.mode==="longjump"&&hist.players===players&&hist.jumps.length===players&&hist.jumps.every(j=>j.length===3));
  ok("sąmoningas peržengimas įrašytas kaip X (null)",hist?.jumps?.[players-1]?.[1]===null);
  ok("įskaityti šuoliai 0–8,95 m",hist?.jumps?.flat().filter(d=>d!=null).every(d=>d>=0&&d<=8.95));
  ok("rezultatų eilučių tiek, kiek žaidėjų",await q(n=>document.querySelectorAll("#ljRows>li").length===n,players));
  // "Žaisti dar kartą" -> ready gate again; back there -> setup; back -> Pradžia
  await q(()=>document.getElementById("ljAgain").click());
  await until(()=>q(()=>!document.getElementById("ready").classList.contains("hide")),60000,500);
  ok("„Žaisti dar kartą“ → pasiruošimas",await q(()=>!document.getElementById("ready").classList.contains("hide")&&document.getElementById("ljEnd").classList.contains("hide")));
  await q(()=>history.back());await sleep(800);
  ok("atgal pasiruošime → šuolio nustatymai",await q(()=>location.hash==="#/tolis"&&!document.getElementById("longjump").classList.contains("hide")&&!document.body.classList.contains("ingame")));
  await q(()=>history.back());await sleep(800);
  ok("atgal iš nustatymų → Pradžia",await q(()=>location.hash==="#/"&&!document.getElementById("home").classList.contains("hide")));
  ok("naršyklės klaidų nėra",!errs.length);
  if(errs.length)console.log("KLAIDOS:\n  "+errs.join("\n  "));
  console.log("→",out);
  await b.close();srv.close();
  process.exit(fails.length?1:0);
})().catch(e=>{console.error(e);srv.close();process.exit(1)});
