// Kiekvieno programėlės ekrano kadras (+ pabaigoje pratimo lapas) (portretas ir landscape), su netikru Supabase (kompanijos ir lentelės užpildytos)
// ir netikra žaidimų istorija (statistika, serija, ženkliukai). Testuoja SURINKTĄ dist/ – pirma `npm run build`.
// Naudojimas: node tools/screens.cjs [cam.y4m] [--out dir] [--landscape|--both] [--size 390x844] [--no-game] [--players 1|2] [--lang lt|en]
//   cam.y4m – „suvaidinta" kamera žaidimo ekranams (kaip playthrough.cjs: reikia ~4 s abiem riešais virš nosies);
//   be jo arba su --no-game kadrai baigiasi ties nustatymais. Rezultatas: <out>/01-onboarding-1.png … (+ "-landscape").
const path=require("path"),fs=require("fs"),http=require("http");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const {mockSupabase,CHAL_ID}=require("./mock-supabase.cjs");
const rest=process.argv.slice(2), arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const y4m=rest.find(a=>a.endsWith(".y4m")&&fs.existsSync(a)), noGame=rest.includes("--no-game")||!y4m;
const out=arg("--out",path.join(__dirname,"..","_playthrough","screens"));
const modes=rest.includes("--both")?[false,true]:[rest.includes("--landscape")];
const LANG=arg("--lang","lt")==="en"?"en-GB":"lt-LT"; // navigator.language -> src/i18n (default LT, whatever this PC's Chrome says)
const root=path.join(__dirname,"..","dist");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
fs.mkdirSync(out,{recursive:true});
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp"};
const port=8790;
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const DAY=864e5;
// 12 games over the last 9 days: streak, weekly goal, 7-day bars, per-exercise totals, some badges
function seed(now){
  const ex=(sq,jk,kn,ln)=>({squat:sq,jack:jk,knees:kn,...(ln?{lunge:ln}:{})});
  const g=(d,h,o)=>({t:now-d*DAY-h*36e5,duration:180,ex:["squat","jack","knees"],...o});
  return [
    g(0,1,{players:2,score:[148,131],reps:[61,55],exReps:[ex(25,20,16),ex(22,18,15)]}),
    g(0,3,{players:1,score:[212,0],reps:[83,0],exReps:[ex(30,28,25),{}],beat:true}),
    g(1,2,{players:1,score:[176,0],reps:[70,0],exReps:[ex(26,24,20),{}]}),
    g(2,5,{players:2,score:[96,120],reps:[40,49],exReps:[ex(14,13,13),ex(18,16,15)]}),
    g(3,1,{players:1,duration:60,score:[31,0],reps:[31,0],exReps:[ex(31,0,0),{}],ex:["squat"]}),
    g(3,4,{players:1,score:[160,0],reps:[66,0],exReps:[ex(22,22,22),{}]}),
    g(5,2,{players:1,score:[140,0],reps:[58,0],exReps:[ex(20,19,12,7),{}],ex:["squat","jack","knees","lunge"]}),
    g(6,6,{players:2,score:[88,90],reps:[37,38],exReps:[ex(12,13,12),ex(13,13,12)]}),
    g(8,3,{players:1,score:[120,0],reps:[50,0],exReps:[ex(17,17,16),{}]}),
  ];
}
(async()=>{
  for(const landscape of modes){
    const suf=landscape?"-landscape":"";
    const [vw,vh]=(arg("--size","")||(landscape?"844x390":"390x844")).split("x").map(Number);
    const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox",`--lang=${LANG}`,`--accept-lang=${LANG}`,"--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",...(y4m?[`--use-file-for-fake-video-capture=${y4m}`]:[]),"--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
    const p=await b.newPage();
    await p.setViewport({width:vw,height:vh,deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await p.evaluateOnNewDocument(l=>Object.defineProperty(navigator,"language",{get:()=>l}),LANG);
    await p.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"no-preference"}]);
    const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource|WebSocket|realtime/i.test(m.text()))errs.push(m.text().slice(0,200))});
    let n=0;
    const shot=async(name,wait=700)=>{await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${name}${suf}.png`;await p.screenshot({path:path.join(out,f)});console.log("•",f)};
    const scrollTo=(sel,y)=>p.$eval(sel,(el,y)=>el.scrollTop=y==="end"?el.scrollHeight:y,y);
    const tap=async sel=>{await p.waitForSelector(sel,{visible:true,timeout:8000});await p.click(sel)};
    await mockSupabase(p);
    const base=`http://localhost:${port}/`;
    await p.goto(base,{waitUntil:"networkidle0"});
    await shot("onboarding-1",900);
    await tap("#onbNext");await shot("onboarding-2");
    await tap("#onbNext");await p.type("#onbNick","Ignas");await shot("onboarding-3");
    await tap("#onbNext");await shot("home-first",1200);
    // populated state: history + reload
    await p.evaluate(h=>localStorage.setItem("novacore.history",JSON.stringify(h)),seed(Date.now()));
    await p.goto(base+"#/kompanijos",{waitUntil:"networkidle0"});await shot("groups-empty",900);
    await p.type("#grpName","10B klasė");await p.click("#grpNewForm button[type=submit]");await shot("group-created",1300);
    await p.goto(base+"#/kompanijos",{waitUntil:"networkidle0"});await sleep(600);
    await p.type("#grpCodeIn","bd42ff");await p.click("#grpJoinForm button[type=submit]");await shot("group-leaderboard",1400);
    await tap("#grpShare").catch(()=>{});await shot("group-invite-toast",500);
    await p.goto(base+"#/kompanijos",{waitUntil:"networkidle0"});await shot("groups-list",1200);
    await p.goto(base+"#/",{waitUntil:"networkidle0"});await shot("home",1300);
    await p.goto(`${base}?c=${CHAL_ID}#/`,{waitUntil:"networkidle0"});await shot("home-challenge",1300);
    await p.goto(base+"#/pratimai",{waitUntil:"networkidle0"});await shot("library",1200);
    await scrollTo("#library","end");await shot("library-bottom",600);
    await p.goto(base+"#/profilis",{waitUntil:"networkidle0"});await shot("profile",1300);
    await scrollTo("#profile",landscape?560:620);await shot("profile-badges",700);
    await scrollTo("#profile","end");await shot("profile-settings",700);
    await tap("#histOpen");await shot("history-sheet",800);
    await p.keyboard.press("Escape");await sleep(400);
    await tap("#nickOpen");await shot("nick-sheet",800);
    await p.keyboard.press("Escape");await sleep(400);
    await p.goto(base+"#/",{waitUntil:"networkidle0"});await sleep(800);
    await tap("#homePlay");await shot("setup",900);
    if(!landscape){await p.$eval("#castOpen",e=>e.scrollIntoView({block:"center"}));await sleep(300)} // the sticky Pradėti bar covers the row at rest
    await tap(landscape?"#setupCast":"#castOpen");await shot("setup-cast-sheet",900);
    await tap("#castOn");await shot("cast-on",700);
    const castCode=await p.$eval("#castCode",el=>el.textContent.trim());
    console.log("TV kodas:",castCode);
    await p.keyboard.press("Escape");await sleep(400);
    await scrollTo("#start","end");await shot("setup-bottom",500);
    await p.$eval("#exOpen",e=>e.scrollIntoView({block:"center"}));await sleep(300); // stay clear of the sticky bar
    await tap("#exOpen");await shot("exercise-sheet",900);
    await tap("#exDone");await sleep(400);
    if(!noGame){
      await scrollTo("#start",0);await sleep(300); // the sticky top bar would cover the buttons when scrolled
      await tap(`[data-p="${arg("--players","2")}"]`);await tap('[data-d="60"]');
      await p.click("#go");await shot("loading",500);
      for(let i=0;i<180;i++){await sleep(500);if(await p.evaluate(()=>!document.getElementById("ready").classList.contains("hide")&&document.getElementById("loading").classList.contains("hide")))break} // model + wasm from the CDN can take a while
      await shot("ready",250);
      for(let i=0;i<90;i++){await sleep(500);if(await p.evaluate(()=>document.getElementById("hud").classList.contains("on")))break}
      await shot("game",9000);
      for(let i=0;i<120;i++){await sleep(500);if(await p.evaluate(()=>!document.getElementById("end").classList.contains("hide")))break}
      await shot("results",2200);
      await tap("#toClips");
      for(let i=0;i<90;i++){await sleep(500);if(await p.evaluate(()=>document.getElementById("previewLoad").hidden))break}
      await shot("clips",800);
      await scrollTo("#clips","end");await shot("clips-actions",500);
      await p.evaluate(()=>document.querySelector("#clips [data-home]").click());
      await shot("home-after-game",1200);
      console.log("po žaidimo URL:",await p.evaluate(()=>location.hash+" d="+history.state?.d));
    }
    await p.goto(base+"#/pratimai",{waitUntil:"networkidle0"});await sleep(800);
    await tap('.ex-card[data-ex="squat"]');await shot("exercise-detail",900);
    // TV lenta: antrasis langas su netikromis būsenomis. Telefono langą uždarome (about:blank), kad jo
    // periodinis „idle" siuntimas neperrašytų vaizduojamų kadrų.
    await p.goto("about:blank");
    const tv=await b.newPage();
    await tv.setViewport({width:vw,height:vh,deviceScaleFactor:2});
    const tvErr=[];tv.on("pageerror",e=>tvErr.push("PAGEERROR "+e.message));
    const tvShot=async(name,wait=500)=>{await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${name}${suf}.png`;await tv.screenshot({path:path.join(out,f)});console.log("•",f)};
    await tv.goto(base+"#/ekranas",{waitUntil:"load"});await tvShot("tv-connect",900);
    if(/^[A-Z0-9]{6}$/.test(castCode)){
      await tv.goto(base+"#/ekranas/"+castCode,{waitUntil:"load"});await tvShot("tv-wait",900);
      const post=s=>tv.evaluate(({code,state})=>{const c=new BroadcastChannel("novacore-screen");c.postMessage({code,state});c.close()},{code:castCode,state:s});
      const sent=Date.now(),baseState={v:1,code:castCode,players:2,duration:180,round:0,mult:1,sent,lang:LANG.slice(0,2)};
      const EXN=LANG==="en-GB"?{squat:"Squats",jack:"Jumping jacks"}:{squat:"Pritūpimai",jack:"Pašokimai"}; // the phone sends the name in its language
      await post({...baseState,phase:"ready",left:180,ex:null,score:[0,0],reps:0,winner:0});await tvShot("tv-ready",500);
      await post({...baseState,phase:"play",left:92,round:2,mult:3,ex:{id:"squat",name:EXN.squat},score:[148,131],reps:98,winner:0});await tvShot("tv-live",700);
      await post({...baseState,players:1,phase:"play",left:41,round:4,mult:5,ex:{id:"jack",name:EXN.jack},score:[212,0],reps:120,winner:0});await tvShot("tv-live-solo",700);
      await post({...baseState,phase:"done",left:0,ex:null,score:[148,131],reps:98,winner:1});await tvShot("tv-done",900);
    }
    if(tvErr.length)console.log("TV KLAIDOS:\n  "+tvErr.join("\n  "));
    console.log(errs.length?"KLAIDOS:\n  "+errs.join("\n  "):"klaidų nėra");
    await b.close();
  }
  srv.close();console.log("→",out);
})().catch(e=>{console.error(e);srv.close();process.exit(1)});
