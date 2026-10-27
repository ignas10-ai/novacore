// Barjerinis bėgimas headless Chrome su e2e kamera (mūsų maskotas, jokio tikro žmogaus) → kadrai + patikrinimai.
// Naudojimas: npm run build && node tools/hurdles-check.mjs [--players 1|2] [--size 390x844] [--landscape] [--gpu] [--lang en] [--out dir]
//   Bėgimą veda testo kabliukai: window.__hd.feed(3.2) (sintetinis tempas) ir __hd.jumpAt(1.5) (atsispyrimas 1,5 m
//   prieš barjerą; detektorius patikrintas unit testuose ant tools/fixtures). 3-ias barjeras sąmoningai be šuolio
//   (P1; dvikovoje P2 – dar ir 6-as) → užkliūva, nuvirsta, lėtėja.
import {createRequire} from "module";
import fs from "fs";
import path from "path";
import http from "http";
const require=createRequire(import.meta.url);
const puppeteer=require(process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core");
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,"$1")),"..");
const rest=process.argv.slice(2), arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const landscape=rest.includes("--landscape"),players=Number(arg("--players","1")),lang=arg("--lang","lt");
const [vw,vh]=(arg("--size","")||(landscape?"844x390":"390x844")).split("x").map(Number);
const out=arg("--out",path.join(root,"_playthrough","hurdles",`${players}p-${vw}x${vh}${lang==="en"?"-en":""}`));
fs.mkdirSync(out,{recursive:true});
const dist=path.join(root,"dist");
if(!fs.existsSync(path.join(dist,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
(await import("../test/e2e/global-setup.ts")).default();
let CAM=(await import("../test/e2e/paths.ts")).CAM;
if(players>1){ // the duel gate needs two people: the same mascot twice, arms up (the race itself runs on the hooks)
  const cam2=path.join(path.dirname(CAM),"cam2.mjpeg"),J=path.join(root,"src","art","melynas-jack@2x.webp");
  if(!fs.existsSync(cam2))(await import("child_process")).execFileSync(process.env.FFMPEG||"ffmpeg",["-y","-loglevel","error","-f","lavfi","-i","color=c=0xd8d4cc:s=640x360:r=30","-loop","1","-i",J,
    "-filter_complex","[1]scale=-1:300,split[a][b];[0][a]overlay=40:30[x];[x][b]overlay=W-w-40:30","-t","60","-q:v","6","-f","mjpeg",cam2],{stdio:"inherit"});
  CAM=cam2;
}
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp",".woff2":"font/woff2",".svg":"image/svg+xml"};
const port=8830;
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split("?")[0]);const f=path.join(dist,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fails=[];const ok=(t,v)=>{console.log(v?"ok  ":"FAIL",t);if(!v)fails.push(t)};
try{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",protocolTimeout:600000,args:["--no-sandbox",`--lang=${lang==="en"?"en-GB":"lt-LT"}`,"--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${CAM}`,"--autoplay-policy=no-user-gesture-required",...(rest.includes("--gpu")?["--use-angle=d3d11","--ignore-gpu-blocklist","--enable-gpu-rasterization"]:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])]});
  const p=await b.newPage();
  await p.setViewport({width:vw,height:vh,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource|supabase/i.test(m.text()))errs.push(m.text().slice(0,200))});
  let n=0;const shot=async(name,wait=0)=>{if(wait)await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${name}.png`;await p.screenshot({path:path.join(out,f)});console.log("•",f)};
  const q=(js,...a)=>p.evaluate(js,...a);
  const st=()=>q(()=>window.__hd.state());
  const until=async(fn,ms,step=100)=>{for(let i=0;i<ms/step;i++){if(await fn())return true;await sleep(step)}return false};
  await p.evaluateOnNewDocument(()=>{localStorage.setItem("novacore.onb","1");localStorage.setItem("novacore.nick","Ignas")});
  await p.goto(`http://localhost:${port}/${lang==="en"?"?lang=en":""}#/`,{waitUntil:"networkidle0"});
  await p.$eval(".hd-tile",el=>el.scrollIntoView({block:"center"}));await shot("home-tile",500);
  ok("plytelė po šuolio į tolį",await q(()=>document.querySelector(".lj-tile")?.nextElementSibling?.classList.contains("hd-tile")));
  await p.click(".hd-tile");await shot("setup",900);
  ok("maršrutas #/barjerai",await q(()=>location.hash==="#/barjerai"));
  await p.click(`[data-hd="${players}"]`);await sleep(200);
  await p.$eval("#hurdles",el=>el.scrollTop=el.scrollHeight);await shot("setup-bottom",400);
  await p.click("#hdGo");
  await until(()=>q(()=>!document.getElementById("hdRun").classList.contains("hide")),180000,200);
  await shot("marks",300);
  await q(()=>{window.__hd.feed(3.2);window.__hd.jumpAt(1.5)});
  const seen=new Set();let s;
  for(const t0=Date.now();Date.now()-t0<120000;){
    s=await st();
    if(s.phase==="off")break;
    const a=s.runs[0];
    // deliberate clips: hurdle 3 for P1 (and 3 + 6 for P2)
    for(let i=0;i<s.runs.length;i++){const nx=s.runs[i].next,miss=nx===2||(i===1&&nx===5);await q((d,i)=>window.__hd.jumpAt(d,i),miss?-1:1.5,i)}
    const once=async(k,cond,wait=0)=>{if(cond&&!seen.has(k)){seen.add(k);await shot(k,wait)}};
    if(s.phase==="race"){
      await once("go",true,150);
      await once("approach",a.next===1&&a.x>26-7&&a.x<26-3.2);
      await once("zone",a.next===1&&a.x>26-2.8&&a.x<26-1.6);
      await once("hop",a.hop&&a.next===2);
      await once("touch",a.next===2&&a.res[2]==null&&a.x>36.3&&a.x<37.4);
      await once("clip",a.res[2]===false,120);
      await once("mid",a.x>60);
    }
    await once("finish",a.fin!=null,500);
    await sleep(40);
  }
  await until(()=>q(()=>!document.getElementById("hdEnd").classList.contains("hide")),20000);
  await shot("results",1400);
  await p.$eval("#hdEnd",el=>el.scrollTop=el.scrollHeight);await shot("results-bottom",400);
  const g=await q(()=>JSON.parse(localStorage.getItem("novacore.history")||"[]")[0]);
  console.log("istorija:",JSON.stringify({mode:g?.mode,players:g?.players,times:g?.times,clr:g?.clr}));
  ok("istorijoje hurdles eilutė",g?.mode==="hurdles"&&g.players===players);
  ok("P1 finišavo 10–25 s",g?.times?.[0]>10&&g.times[0]<25);
  ok(`P1 peršoko 7/8${players>1?", P2 6/8":""}`,g?.clr?.[0]===7&&(players<2||g.clr[1]===6));
  ok("rezultatų eilučių tiek, kiek žaidėjų",await q(n=>document.querySelectorAll("#hdRows>li").length===n,players));
  ok("vardai telpa (be „…“ ir be perpildymo)",await q(()=>[...document.querySelectorAll(".sp-row-txt b,.sp-row-t,#hdWin")].every(e=>e.scrollWidth<=e.clientWidth+1)));
  await q(()=>history.back());await sleep(800);
  ok("atgal iš rezultatų → barjerų nustatymai",await q(()=>location.hash==="#/barjerai"&&!document.getElementById("hurdles").classList.contains("hide")));
  ok("naršyklės klaidų nėra",!errs.length);
  if(errs.length)console.log("KLAIDOS:\n  "+errs.join("\n  "));
  console.log("→",out);
  await b.close();
}catch(e){console.error(e);fails.push(String(e))}
srv.close();
process.exit(fails.length?1:0);
