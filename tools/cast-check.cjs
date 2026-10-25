// Didelio ekrano patikra: telefono nustatymuose įjungiamas „Didelis ekranas", atidaroma TV lenta tame pačiame
// naršyklės kontekste ir tikrinama, ar būsena keliauja per BroadcastChannel (be Supabase, veikia ir be interneto).
// Naudojimas: npm run build && node tools/cast-check.cjs
//   Chrome/puppeteer-core – kaip screens.cjs (PUPPETEER_CORE / CHROME env arba numatytieji).
const path=require("path"),fs=require("fs"),http=require("http"),assert=require("assert");
const PUP=process.env.PUPPETEER_CORE||"puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const root=path.join(__dirname,"..","dist");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png"};
const port=8798;
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(p,fn,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(fn))return true;await sleep(200)}return false};
let pass=0,fail=0;
function ok(cond,msg){if(cond){pass++;console.log("  ✓",msg)}else{fail++;console.error("  ✗",msg)}}

(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const errs=[];
  const watch=p=>{p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource|WebSocket|realtime/i.test(m.text()))errs.push(m.text().slice(0,200))})};
  const base=`http://localhost:${port}/`;
  const p=await b.newPage();
  watch(p);
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.evaluateOnNewDocument(()=>localStorage.setItem("novacore.onb","1"));
  await p.goto(base+"#/zaisti",{waitUntil:"networkidle0"});
  await p.click("#castOpen");await sleep(500);
  ok(await p.$eval("#castOff",e=>!e.hidden),"telefonas: pradžioje pasiūloma įjungti");
  await p.click("#castOn");await sleep(700);
  const code=await p.$eval("#castCode",e=>e.textContent.trim());
  ok(/^[A-Z0-9]{6}$/.test(code),"telefonas: 6 simbolių kodas ("+code+")");
  ok(await p.$eval("#castOnBox",e=>!e.hidden),"telefonas: rodoma nuoroda ir kodas");

  const tv=await b.newPage();
  watch(tv);
  await tv.setViewport({width:844,height:390,deviceScaleFactor:2});
  await tv.goto(base+"#/ekranas/"+code,{waitUntil:"load"});
  const tvState=await waitFor(tv,()=>document.getElementById("bsLive").dataset.on==="1");
  ok(tvState,"TV: gavo būseną iš telefono");
  ok(await tv.$eval("#screen",e=>e.dataset.phase)==="idle","TV: laukia žaidimo (idle)");
  ok(await tv.$eval("#bsWaitCode",e=>e.textContent.trim())===code,"TV: rodo tą patį kodą");
  const phoneSeesTv=await waitFor(p,()=>document.getElementById("castLive").dataset.on==="1");
  ok(phoneSeesTv,"telefonas: mato prijungtą TV (hello)");

  const sent=Date.now(),state=(o)=>({v:1,code,players:2,duration:180,round:0,mult:1,sent,ex:null,score:[0,0],reps:0,winner:0,...o});
  const post=s=>tv.evaluate(({code,state})=>{const c=new BroadcastChannel("novacore-screen");c.postMessage({code,state});c.close()},{code,state:s});
  await post(state({phase:"play",left:92,round:2,mult:3,ex:{id:"squat",name:"Pritūpimai"},score:[148,131],reps:98}));
  await sleep(500);
  ok(await tv.$eval("#screen",e=>e.dataset.phase)==="play","TV: žaidimo būsena");
  ok(await tv.$eval("#bsS1",e=>e.textContent)==="148"&&await tv.$eval("#bsS2",e=>e.textContent)==="131","TV: taškai 148:131");
  ok(await tv.$eval("#bsEx",e=>e.textContent)==="Pritūpimai","TV: pratimo pavadinimas");
  ok(await tv.$eval("#bsMult",e=>e.textContent)==="×3","TV: daugiklis");
  ok(await tv.$eval("#bsDemo",e=>!!e.querySelector(".demo-svg")),"TV: pratimo animacija");
  ok(await tv.$eval("#bsTimer",e=>/^\d:\d\d$/.test(e.textContent)),"TV: laikmatis");

  await post(state({phase:"done",left:0,score:[148,131],reps:98,winner:1}));
  await sleep(500);
  ok(await tv.$eval("#screen",e=>e.dataset.phase)==="done","TV: pabaigos būsena");
  ok(await tv.$eval("#bsVerdictTxt",e=>e.textContent)==="Žaidėjas 1 laimi!","TV: laimėtojas");
  ok(await tv.$eval("#bsReps",e=>e.textContent.includes("98")),"TV: pakartojimų skaičius");
  ok(await tv.$eval("#bsS2",e=>getComputedStyle(e.closest(".bs-side")).opacity!=="1"),"TV: pralaimėtojas pritemdytas");

  // code entry on a TV without the link
  await tv.goto(base+"#/ekranas",{waitUntil:"load"});
  await tv.type("#bsCodeIn","ZZ");await tv.click("#bsConnect .go");await sleep(300);
  ok((await tv.$eval("#bsErr",e=>e.textContent)).length>0,"TV: neteisingas kodas atmetamas");
  await tv.$eval("#bsCodeIn",(e,c)=>{e.value=c},code);
  await tv.click("#bsConnect .go");await sleep(1200);
  ok(await tv.evaluate(()=>location.hash)==="#/ekranas/"+code,"TV: kodas įrašytas į nuorodą");
  ok(await tv.$eval("#screen",e=>e.dataset.phase)==="idle","TV: po kodo įvedimo vėl laukia");

  // off switch on the phone
  await p.bringToFront();
  await p.click("#castOffBtn");await sleep(400);
  ok(await p.$eval("#castOff",e=>!e.hidden),"telefonas: išjungta");
  ok(await p.$eval("#castCode",e=>e.textContent.trim())==="------","telefonas: kodas išvalytas");
  ok(await p.$eval("#homeCast",e=>e.dataset.on)==="0","telefonas: Pradžios nuoroda nebeaktyvi");

  ok(errs.length===0,"konsolėje nėra netikėtų klaidų"+ (errs.length?"\n  "+errs.join("\n  "):""));
  console.log(`\n${pass}/${pass+fail} OK`);
  await b.close();srv.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);srv.close();process.exit(1)});
