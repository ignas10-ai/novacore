// Google Play grafika (issue #6): 512 ikona, 1024×500 viršelis, 5 ekrano kadrai 1080×1920 su antrašte (LT + EN).
// Naudojimas: node tools/store-assets.mjs [--out dir] [--gpu]   (pats paleidžia Vite dev serverį; kamera = e2e klipas su maskotu)
// Pavadinimas imamas iš public/manifest.webmanifest short_name, tad pervadinus (#8) užtenka paleisti iš naujo.
// Kamera = e2e klipas su mūsų maskotu (jokio tikro žmogaus), tad kameros langelį galima rodyti.
import {createRequire} from "module";
import {createServer} from "vite";
import fs from "fs";
import path from "path";
const require=createRequire(import.meta.url);
const puppeteer=require(process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core");
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,"$1")),"..");
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d};
const out=path.resolve(arg("--out",path.join(root,"_playthrough","store")));
fs.mkdirSync(out,{recursive:true});
const NAME=JSON.parse(fs.readFileSync(path.join(root,"public/manifest.webmanifest"),"utf8")).short_name;
// e2e kamera (test/e2e/global-setup.ts): maskotas ant sienos, pirmas 20 s rankos aukštyn = praeina pasiruošimo vartus
(await import("../test/e2e/global-setup.ts")).default();
const y4m=(await import("../test/e2e/paths.ts")).CAM;

const CAP={
  lt:{home:["Sporto žaidimai","be konsolės – tik telefonas"],air:["Bėk ir šok","kamera mato kiekvieną judesį"],lj:["Iki 4 žaidėjų","ant vieno telefono"],
      games:["3 sporto žaidimai","sprintas, boksas, šuolis į tolį"],ex:["Kamera skaičiuoja","kiekvieną pakartojimą"],
      tag:"Sporto žaidimai su draugais. Be konsolės – tik telefonas."},
  en:{home:["Sports games","no console – just your phone"],air:["Run and jump","the camera sees every move"],lj:["Up to 4 players","on one phone"],
      games:["3 sports games","sprint, boxing, long jump"],ex:["The camera counts","every single rep"],
      tag:"Party sports games with friends. No console – just a phone."},
};

const vite=await createServer({root,logLevel:"error",server:{port:5199,strictPort:true}});
await vite.listen();
const URL0="http://localhost:5199/";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",protocolTimeout:600000,args:["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`,"--autoplay-policy=no-user-gesture-required",
  ...(process.argv.includes("--gpu")?["--use-angle=d3d11","--ignore-gpu-blocklist"]:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])]});
const until=async(p,js,ms)=>{for(let i=0;i<ms/100;i++){if(await p.evaluate(js))return true;await sleep(100)}return false};

// raw app screens, 360×640 css @3 = 1080×1920
async function raw(lang){
  const p=await b.newPage();
  await p.setViewport({width:360,height:640,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem("novacore.onb","1")});
  const q=`?lang=${lang}`;
  const S={};
  const snap=async k=>{S[k]=await p.screenshot({encoding:"base64"});console.log(" ",lang,k)};
  await p.goto(`${URL0}${q}#/`,{waitUntil:"networkidle0"});await sleep(1200);await snap("home");
  await p.goto(`${URL0}${q}#/pratimai`,{waitUntil:"networkidle0"});await sleep(1000);await snap("ex");
  await p.goto(`${URL0}${q}#/`,{waitUntil:"networkidle0"});await p.$eval(".sp-tile",el=>el.scrollIntoView({block:"start"}));await p.evaluate(()=>scrollBy(0,-90));await sleep(1200);await snap("games");
  // Šuolis į tolį, 4 žaidėjai, per testo kabliukus (window.__lj)
  await p.goto(`${URL0}${q}#/`,{waitUntil:"networkidle0"});
  await p.$eval(".lj-tile",el=>el.click());await sleep(800);
  await p.click('[data-lj="4"]');await sleep(200);await p.click("#ljGo");
  if(!await until(p,()=>!document.getElementById("ljRun").classList.contains("hide"),180000))throw new Error("šuolis: nepraėjo pasiruošimo");
  await p.evaluate(()=>window.__lj.feed(3.6));
  for(let k=0;k<12;k++){
    await until(p,`(s=>s.k===${k}&&s.phase!=="off")(window.__lj.state())`,30000);
    await p.evaluate(()=>window.__lj.jumpAt(28.8));
    const t0=Date.now();
    for(;;){
      const s=await p.evaluate(()=>window.__lj.state());
      if(s.k>k||s.phase==="off")break;
      if(s.phase==="card"&&Date.now()-t0>1500)await p.evaluate(()=>window.__lj.ready());
      if(k===0&&(s.phase==="air"||s.phase==="land")&&!S.air)await snap("air");
      await sleep(40);
    }
  }
  await until(p,()=>!document.getElementById("ljEnd").classList.contains("hide"),15000);await sleep(1400);await snap("lj");
  await p.close();
  return S;
}

const css=`*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;overflow:hidden;font-family:"Nunito",sans-serif;color:#14183A}
.burst{position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% 18%,var(--a) 0 8deg,var(--b) 8deg 16deg)}
h1{position:absolute;left:0;right:0;top:118px;text-align:center;font:400 96px/1.05 "Titan One";white-space:nowrap;color:#fff;-webkit-text-stroke:10px #14183A;paint-order:stroke fill;text-shadow:0 10px 0 #14183A}
h2{position:absolute;left:60px;right:60px;top:258px;text-align:center;font:900 46px/1.2 "Nunito";color:#14183A}
.ph{position:absolute;left:50%;top:400px;width:840px;height:1493px;translate:-50% 0;border:14px solid #14183A;border-radius:64px;overflow:hidden;box-shadow:0 22px 0 #14183A;background:#F7F5F2}
.ph img{width:100%;height:100%;display:block}`;
const fontLink=`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Titan+One&family=Nunito:wght@800;900&display=block">`;
const TONES={home:["#FF3B3B","#FF5A5A"],air:["#2F6BFF","#4A80FF"],lj:["#FFC61A","#FFD34D"],games:["#FF3B3B","#FF5A5A"],ex:["#2F6BFF","#4A80FF"]};

const p=await b.newPage();
async function render(html,w,h,file){
  await p.setViewport({width:w,height:h,deviceScaleFactor:1});
  await p.setContent(html,{waitUntil:"load",timeout:120000});await p.evaluate(()=>document.fonts.ready);
  await p.screenshot({path:path.join(out,file)});console.log("•",file);
}
for(const lang of ["lt","en"]){
  const S=await raw(lang);
  for(const [i,k] of ["home","air","lj","games","ex"].entries()){
    const [t,s]=CAP[lang][k],[a,c]=TONES[k];
    await render(`<!doctype html><meta charset="utf-8">${fontLink}<style>${css}body{--a:${a};--b:${c}}</style><div class="burst"></div><h1>${t}</h1><h2>${s}</h2><div class="ph"><img src="data:image/png;base64,${S[k]}"></div>`,1080,1920,`${lang}-${i+1}-${k}.png`);
  }
}

// viršelis + ikona: tikri maskotai iš src/ui/mascots.ts per Vite
const art=await (async()=>{const q=await b.newPage();await q.goto(URL0,{waitUntil:"networkidle0"});
  const r=await q.evaluate(async()=>{const m=await import("/src/ui/mascots.ts");return {r:m.mascot("r","vs"),b:m.mascot("b","vs"),head:m.avatar("r")}});await q.close();return r})();
for(const lang of ["lt","en"])await render(`<!doctype html><meta charset="utf-8">${fontLink}<style>*{margin:0}body{width:1024px;height:500px;overflow:hidden;position:relative;font-family:Nunito;background:#2F6BFF}
.l{position:absolute;inset:0 50% 0 0;background:#FF3B3B;clip-path:polygon(0 0,112% 0,88% 100%,0 100%)}.r{position:absolute;inset:0 0 0 46%;background:#2F6BFF}
.m{position:absolute;bottom:-6px;width:250px}.m.a{left:40px}.m.b{right:40px}
.vs{position:absolute;left:50%;top:316px;translate:-50% 0;width:120px;height:120px;border-radius:50%;background:#FFC61A;border:8px solid #14183A;box-shadow:0 8px 0 #14183A;font:400 52px/104px "Titan One";text-align:center;color:#14183A}
h1{position:absolute;left:0;right:0;top:44px;text-align:center;font:400 112px/1 "Titan One";color:#fff;-webkit-text-stroke:11px #14183A;paint-order:stroke fill;text-shadow:0 10px 0 #14183A}
h1 i{font-style:normal;color:#FFC61A}
p{position:absolute;left:300px;right:300px;top:182px;text-align:center;font:900 30px/1.25 Nunito;color:#fff;text-shadow:0 3px 0 #14183A}</style>
<div class="l"></div><div class="r"></div><div class="m a">${art.r}</div><div class="m b">${art.b}</div><div class="vs">VS</div><h1>${NAME}<i>.</i></h1><p>${CAP[lang].tag}</p>`,1024,500,`${lang}-feature-1024x500.png`);
await render(`<!doctype html><meta charset="utf-8"><style>*{margin:0}body{width:512px;height:512px;overflow:hidden;background:repeating-conic-gradient(from 0deg at 50% 50%,#FFC61A 0 10deg,#FFD34D 10deg 20deg)}
svg{position:absolute;left:56px;top:56px;width:400px;height:400px}</style>${art.head}`,512,512,"icon-512.png");

await b.close();await vite.close();
console.log("OK →",out);
