// Game frames for Pradžia tiles, setup galleries and results (#38/#41): every game is played with the e2e mascot camera
// in landscape (1100×620 css @1 → 780×390 WebP, light enough for a gallery slide and fast enough for MediaPipe in headless
// swiftshader) and 3 moments are saved as public/scenes/<xx>-1.webp, -2, -3. The first one is
// also copied to public/scenes/<xx>.webp when that base frame does not exist yet (home tile / results banner), so
// every game ends up with its own frame.
// Usage: npm run scenes [-- sprint hurdles …]   (needs puppeteer-core + Chrome: PUPPETEER_CORE / CHROME env like store-assets)
import {createRequire} from "module";import {createServer} from "vite";import fs from "fs";
import path from "path";
const require=createRequire(import.meta.url);const puppeteer=require(process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core");
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,"$1")),".."),out=path.join(root,"public","scenes");
(await import("../test/e2e/global-setup.ts")).default();const y4m=(await import("../test/e2e/paths.ts")).CAM;
const v=await createServer({root,logLevel:"error",server:{port:5196,strictPort:true}});await v.listen();
const b=await puppeteer.launch({executablePath:process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:"new",protocolTimeout:600000,
  args:["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`,"--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vis=id=>`(e=>!!e&&e.checkVisibility())(document.getElementById("${id}"))`;
const until=async(p,js,ms)=>{for(let i=0;i<ms/200;i++){if(await p.evaluate(js).catch(()=>false))return true;await sleep(200)}return false};
// per game: one run + 3 moments. cap(n) saves <xx>-n.webp from the tuned clip below.
const G=[
  ["sprint",".sp-tile",'[data-sp="1"]',"#spGo","sprintRun",async(p,cap)=>{
    await until(p,"__sp.state().phase==='race'",30000);await p.evaluate("__sp.feed(3.2)");
    await sleep(1200);await cap(1);await sleep(3000);await cap(2);await sleep(4000);await cap(3)}],
  ["hurdles",".hd-tile",'[data-hd="1"]',"#hdGo","hdRun",async(p,cap)=>{
    await p.evaluate(()=>{__hd.feed(3.2);__hd.jumpAt(2.5)});
    await sleep(1200);await cap(1);await sleep(2200);await cap(2);await sleep(2200);await cap(3)}],
  ["longjump",".lj-tile",'[data-lj="1"]',"#ljGo","ljRun",async(p,cap)=>{
    await p.evaluate(()=>{__lj.feed(3.6);__lj.jumpAt(-1)});
    await until(p,"__lj.state().phase==='run'",40000);
    await sleep(1600);await cap(1);
    for(let i=0;i<120;i++){if((await p.evaluate("__lj.state().x"))>=27.5)break;await sleep(100)}
    await p.evaluate("__lj.jump()");await sleep(320);await cap(2);
    await sleep(1500);await cap(3)}],
  ["boxing",".bx-tile",'[data-bx="1"]',"#bxGo","boxRun",async(p,cap)=>{
    await until(p,"__boxState().phase==='play'",30000);
    await sleep(2200);await cap(1);await sleep(3000);await cap(2);await sleep(3000);await cap(3)}],
  ["bowling",".bw-tile",'[data-bw="1"]',"#bwGo","bwRun",async(p,cap)=>{
    await until(p,"__bw.state().phase==='card'||__bw.state().phase==='hand'",30000);
    if((await p.evaluate("__bw.state().phase"))==="card")await p.evaluate("__bw.ready()");
    await until(p,"__bw.state().phase==='hand'",10000);await p.evaluate("__bw.hand(1)");
    await until(p,"__bw.state().phase==='aim'",10000);await p.evaluate("__bw.aim(0.1,0)");await sleep(500);
    await p.evaluate("__bw.throw(9)");
    await sleep(600);await cap(1);await sleep(900);await cap(2);await sleep(1200);await cap(3)},p=>p.evaluate("__bw.script()")],
  ["ski",".sk-tile",'[data-sk="1"]',"#skGo","skRun",async(p,cap)=>{
    await p.waitForFunction(()=>!!window.__sk);await p.evaluate("__sk.ready();__sk.auto(true)");
    await sleep(1200);await cap(1);await sleep(3500);await cap(2);await sleep(4500);await cap(3)}],
  ["wall",".wl-tile",'[data-wl="1"]',"#wlGo","wlRun",async(p,cap)=>{
    await until(p,"__wl.state().phase==='wall'",30000);
    await p.evaluate(()=>{__wl.seed(7);__wl.force("safe");setInterval(()=>__wl.force("safe"),300)});
    await sleep(1200);await cap(1);await sleep(2400);await cap(2);await sleep(2800);await cap(3)},p=>p.evaluate("__wl.seed(7)")],
  ["badminton",".bd-tile",'[data-bd="1"]',"#bdGo","bdRun",async(p,cap)=>{
    await until(p,"__bd.state().phase==='pick'",30000);await p.evaluate("__bd.pick(1,1)");
    await sleep(700);await p.evaluate("__bd.serve()");
    await sleep(500);await cap(1);await sleep(1000);await cap(2);await sleep(1400);await cap(3)}],
  ["javelin",".jv-tile",'[data-jv="1"]',"#jvGo","jvRun",async(p,cap)=>{
    await until(p,"__jv.state().phase==='pick'",30000);await p.evaluate("__jv.hand(1)");
    await until(p,"__jv.state().phase==='run'",20000);
    await p.evaluate(()=>{__jv.feed(3);__jv.throwAt(-1)});
    await sleep(1800);await cap(1);
    for(let i=0;i<120;i++){if((await p.evaluate("__jv.state().x"))>=11.8)break;await sleep(100)}
    await p.evaluate("__jv.throw()");await sleep(320);await cap(2);
    await sleep(1500);await cap(3)}],
];
const K={sprint:"sp",hurdles:"hd",longjump:"lj",boxing:"bx",bowling:"bw",ski:"sk",wall:"wl",badminton:"bd",javelin:"jv"};
// css px; below the HUD, left of the corner camera preview
const CLIP={def:{x:0,y:215,width:780,height:390},longjump:{x:180,y:130,width:720,height:360},bowling:{x:240,y:100,width:680,height:340},wall:{x:0,y:30,width:1100,height:550},boxing:{x:0,y:30,width:1100,height:550},badminton:{x:40,y:120,width:860,height:430},javelin:{x:120,y:120,width:860,height:430}};
const only=process.argv.slice(2);
for(const [name,tile,solo,go,run,play,pre] of G){
  if(only.length&&!only.includes(name))continue;
  const p=await b.newPage();p.on("pageerror",e=>console.log(name,"ERR",e.message));
  await p.setViewport({width:1100,height:620,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await p.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem("novacore.onb","1")});
  const cap=async(i)=>{
    const f=`${K[name]}-${i}.webp`;
    if(process.env.FULL)await p.screenshot({path:`${out}/_full-${K[name]}-${i}.png`});
    else await p.screenshot({path:`${out}/${f}`,type:"webp",quality:80,clip:CLIP[name]??CLIP.def});
    console.log("•",f);
  };
  try{
    await p.goto("http://localhost:5196/?lang=lt#/",{waitUntil:"networkidle0",timeout:120000});await sleep(800);
    await p.$eval(tile,e=>e.click());await sleep(700);await p.click(solo);await sleep(200);if(pre)await pre(p);await p.click(go);
    if(!await until(p,vis(run),200000))throw new Error("no run screen");
    // hide the calls / HUD leftovers that would cover the frame; the gallery wants the pure game canvas
    const hide=name==="boxing"||name==="wall"?"":"#stage{display:none!important}"; // their stage IS the game overlay (pads / walls)
    await p.addStyleTag({content:`${hide}[id$=Call],[class*=-call],[class*=ghost-tag],.sp-gap,#jvArm,#bdNote,#skLegend,#bwHand,#bwAim,#bwStatus{visibility:hidden!important}`});
    await sleep(250);
    await play(p,cap);console.log(name,"ok");
    const base=`${out}/${K[name]}.webp`;if(!fs.existsSync(base))fs.copyFileSync(`${out}/${K[name]}-1.webp`,base);
  }catch(e){console.log(name,"FAIL",e.message)}
  await p.close();
}
await b.close();await v.close();
