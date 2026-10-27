// Siena headless Chrome su e2e kamera (mūsų maskotas, jokio tikro žmogaus) → kadrai + patikrinimai.
// Naudojimas: npm run build && node tools/wall-check.mjs [--players 1-4] [--size 390x844] [--landscape] [--gpu] [--lang en] [--out dir]
//   Kamera nemoka išsisukti, todėl verdiktą veda testo kabliukas window.__wl.force("safe"|"caught"); pirmoji siena
//   rodoma su TIKRU atpažinimu (taškai ant maskoto), tik prieš laiko pabaigą įjungiamas „safe“. P1 išsilaiko
//   iki 9 raundo (pamatyti visas sienų rūšis), kiti pagaunami 1–3 raunde. Sėkla fiksuota (__wl.seed(7)).
import {createRequire} from "module";
import fs from "fs";
import path from "path";
import http from "http";
const require=createRequire(import.meta.url);
const puppeteer=require(process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core");
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,"$1")),"..");
const rest=process.argv.slice(2), arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const landscape=rest.includes("--landscape"),players=Number(arg("--players","2")),lang=arg("--lang","lt");
const [vw,vh]=(arg("--size","")||(landscape?"844x390":"390x844")).split("x").map(Number);
const out=arg("--out",path.join(root,"_playthrough","wall",`${players}p-${vw}x${vh}${lang==="en"?"-en":""}`));
fs.mkdirSync(out,{recursive:true});
const dist=path.join(root,"dist");
if(!fs.existsSync(path.join(dist,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
(await import("../test/e2e/global-setup.ts")).default();
const CAM=(await import("../test/e2e/paths.ts")).CAM;
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp",".woff2":"font/woff2",".svg":"image/svg+xml"};
const port=8831;
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split("?")[0]);const f=path.join(dist,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fails=[];const ok=(t,v)=>{console.log(v?"ok  ":"FAIL",t);if(!v)fails.push(t)};
const SURVIVE=[9,3,1,2]; // walls each player survives before being caught
try{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",protocolTimeout:600000,args:["--no-sandbox",`--lang=${lang==="en"?"en-GB":"lt-LT"}`,"--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${CAM}`,"--autoplay-policy=no-user-gesture-required",...(rest.includes("--gpu")?["--use-angle=d3d11","--ignore-gpu-blocklist","--enable-gpu-rasterization"]:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])]});
  const p=await b.newPage();
  await p.setViewport({width:vw,height:vh,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource|supabase/i.test(m.text()))errs.push(m.text().slice(0,200))});
  let n=0;const shot=async(name,wait=0)=>{if(wait)await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${name}.png`;await p.screenshot({path:path.join(out,f)});console.log("•",f)};
  const q=(js,...a)=>p.evaluate(js,...a);
  const st=()=>q(()=>window.__wl.state());
  const until=async(fn,ms,step=100)=>{for(let i=0;i<ms/step;i++){if(await fn())return true;await sleep(step)}return false};
  await p.evaluateOnNewDocument(()=>{localStorage.setItem("novacore.onb","1");localStorage.setItem("novacore.nick","Ignas");localStorage.setItem("novacore.wlNames",JSON.stringify(["","Martynas","Ąžuolė Žemaitytė",""]))});
  await p.goto(`http://localhost:${port}/${lang==="en"?"?lang=en":""}#/`,{waitUntil:"networkidle0"});
  await p.$eval(".wl-tile",el=>el.scrollIntoView({block:"center"}));await shot("home-tile",500);
  ok("plytelė po barjerų",await q(()=>document.querySelector(".hd-tile")?.nextElementSibling?.classList.contains("wl-tile")));
  await p.click(".wl-tile");await shot("setup",900);
  ok("maršrutas #/siena",await q(()=>location.hash==="#/siena"));
  await p.click(`[data-wl="${players}"]`);await sleep(200);
  ok("vardų eilučių tiek, kiek žaidėjų",await q(n=>[...document.querySelectorAll("#wlNames .lj-nrow")].filter(r=>!r.hidden).length===n,players));
  await p.$eval("#wall",el=>el.scrollTop=el.scrollHeight);await shot("setup-bottom",400);
  await q(()=>window.__wl.seed(7));
  await p.click("#wlGo");
  await until(()=>q(()=>!document.getElementById("wlRun").classList.contains("hide")),180000,200);
  await shot("turn-1",400);
  const kinds=new Set();let realShot=false;
  for(let k=0;k<players;k++){
    await until(async()=>{const s=await st();return s.k===k&&s.phase==="card"},60000);
    if(k>0){await shot(`turn-${k+1}`,500);await q(()=>window.__wl.ready())}
    for(const t0=Date.now();Date.now()-t0<150000;){
      const s=await st();
      if(s.k!==k||s.phase==="off")break;
      if(s.phase==="wall"){
        const last=s.round>SURVIVE[k];
        // P1's first wall: the real detector (points on the mascot) until shortly before the deadline
        if(k===0&&s.round===1&&!realShot){
          await q(()=>window.__wl.force(""));
          await until(async()=>(await st()).t>1.6,8000,50);
          await shot("wall-1-real");realShot=true;
          const r=await st();console.log("tikras atpažinimas: seen",r.seen,"taškų sienoje",r.hits,r.kind);
        }
        await q(v=>window.__wl.force(v),last?"caught":"safe");
        if(!kinds.has(s.kind)&&(k===0||last)){kinds.add(s.kind);await until(async()=>(await st()).t>Math.min(1,s.secs*.4),6000,40);await shot(`wall-${s.round}-${s.kind}`)}
      }
      if(s.phase==="slam"&&s.res&&!kinds.has(`v${k}${s.round}`)){kinds.add(`v${k}${s.round}`);if(s.res==="caught"||(k===0&&s.round===1))await shot(`${s.res}-${k+1}`,120)}
      await sleep(40);
    }
  }
  await until(()=>q(()=>!document.getElementById("wlEnd").classList.contains("hide")),30000);
  await shot("results",1400);
  await p.$eval("#wlEnd",el=>el.scrollTop=el.scrollHeight);await shot("results-bottom",400);
  const g=await q(()=>JSON.parse(localStorage.getItem("novacore.history")||"[]")[0]);
  console.log("istorija:",JSON.stringify({mode:g?.mode,players:g?.players,reps:g?.reps,secs:g?.secs}));
  ok("istorijoje wall eilutė",g?.mode==="wall"&&g.players===players);
  ok(`raundai ${SURVIVE.slice(0,players)}`,JSON.stringify(g?.reps)===JSON.stringify(SURVIVE.slice(0,players)));
  ok("rezultatų eilučių tiek, kiek žaidėjų",await q(n=>document.querySelectorAll("#wlRows>li").length===n,players));
  ok("pirmas – daugiausia raundų",await q(()=>document.querySelector("#wlRows>li .sp-place")?.textContent==="1"));
  ok("vardai ir rezultatai telpa",await q(()=>[...document.querySelectorAll(".sp-row-t,#wlWin")].every(e=>e.scrollWidth<=e.clientWidth+1)));
  ok("sienų rūšys: šonas, pritūpimas, skylė",["left","right"].some(x=>kinds.has(x))&&kinds.has("duck")&&[...kinds].some(x=>x==="hole"||x==="legL"||x==="legR"));
  console.log("sienos:",[...kinds].filter(x=>!x.startsWith("v")).join(", "));
  await q(()=>history.back());await sleep(800);
  ok("atgal iš rezultatų → sienos nustatymai",await q(()=>location.hash==="#/siena"&&!document.getElementById("wall").classList.contains("hide")));
  await p.goto(`http://localhost:${port}/${lang==="en"?"?lang=en":""}#/profilis`,{waitUntil:"networkidle0"});
  await sleep(600);await p.$eval("#histOpen",el=>el.click());await shot("history",700);
  ok("istorijos eilutė „Siena“",await q(()=>/Siena|The Wall/.test(document.querySelector("#histList .what")?.textContent||"")));
  ok("naršyklės klaidų nėra",!errs.length);
  if(errs.length)console.log("KLAIDOS:\n  "+errs.join("\n  "));
  console.log("→",out);
  await b.close();
}catch(e){console.error(e);fails.push(String(e))}
srv.close();
process.exit(fails.length?1:0);
