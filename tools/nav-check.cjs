// Navigacijos patikra prieš SURINKTĄ dist/ (pirma `npm run build`): skirtukai, gili nuoroda, push/pop perėjimas,
// Android „atgal", lapai, sticky juosta; su kameros failu – ir atgal pasiruošime / žaidime, „Žaisti dar kartą", „Į pradžią".
// Naudojimas: node tools/nav-check.cjs [cam.y4m]   → kiekviena patikra „ok"/„FAIL", pabaigoje suma; exit 1, jei kas nepavyko.
const path=require("path"),fs=require("fs"),http=require("http");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const {mockSupabase}=require("./mock-supabase.cjs");
const y4m=process.argv.slice(2).find(a=>a.endsWith(".y4m")&&fs.existsSync(a));
const root=path.join(__dirname,"..","dist");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png"};
const port=8792;
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ok=(name,cond)=>{cond?pass++:fail++;console.log(cond?"ok  ":"FAIL",name)};
(async()=>{
  const b=await puppeteer().launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",...(y4m?[`--use-file-for-fake-video-capture=${y4m}`]:[]),"--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));p.on("console",m=>{if(m.type()==="error"&&!/favicon|Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,200))});
  await mockSupabase(p);
  await p.evaluateOnNewDocument(()=>{localStorage.setItem("novacore.onb","1");localStorage.setItem("novacore.nick","Ignas")});
  const base=`http://localhost:${port}/`;
  const st=()=>p.evaluate(()=>({hash:location.hash,d:history.state?.d||0,shown:[...document.querySelectorAll(".screen")].filter(s=>!s.classList.contains("hide")).map(s=>s.id),tab:document.querySelector("#tabbar [aria-current]")?.dataset.tab,ingame:document.body.classList.contains("ingame")}));
  const click=async sel=>{await p.waitForSelector(sel,{visible:true,timeout:8000});await p.$eval(sel,e=>e.click())};
  await p.goto(base+"#/",{waitUntil:"networkidle0"});await sleep(500);
  let s=await st();ok("Pradžia rodoma, skirtukas home",s.shown.join()==="home"&&s.tab==="home");
  await click('#tabbar [data-tab="groups"]');await sleep(500);s=await st();
  ok("skirtukas Kompanijos: #/kompanijos, d=1",s.hash==="#/kompanijos"&&s.d===1&&s.shown.join()==="groups"&&s.tab==="groups");
  await click('#tabbar [data-tab="library"]');await sleep(500);s=await st();
  ok("skirtukas Pratimai pakeičia (d lieka 1)",s.hash==="#/pratimai"&&s.d===1&&s.shown.join()==="library");
  await p.evaluate(()=>history.back());await sleep(500);s=await st();
  ok("atgal iš skirtuko → Pradžia",s.hash==="#/"&&s.shown.join()==="home");
  await click("#homePlay");await sleep(90);s=await st();
  const mid=await p.evaluate(()=>({enter:document.getElementById("start").dataset.enter,leave:document.getElementById("home").dataset.leave}));
  ok("push: abu ekranai perėjimo metu (enter=fwd, leave=fwd)",s.shown.includes("home")&&s.shown.includes("start")&&mid.enter==="fwd"&&mid.leave==="fwd");
  await sleep(500);s=await st();ok("po perėjimo lieka tik nustatymai",s.shown.join()==="start"&&s.hash==="#/zaisti");
  await click('#start [data-back]');await sleep(90);
  const pop=await p.evaluate(()=>({enter:document.getElementById("home").dataset.enter,leave:document.getElementById("start").dataset.leave}));
  await sleep(500);s=await st();ok("pop: atgal mygtukas → Pradžia, d=0",pop.enter==="back"&&pop.leave==="back"&&s.shown.join()==="home"&&s.d===0);
  await click('#tabbar [data-tab="groups"]');await sleep(1200);
  await click("#grpJoinForm input");await p.type("#grpCodeIn","bd42ff");await p.$eval("#grpJoinForm",f=>f.requestSubmit());await sleep(1500);s=await st();
  ok("prisijungus atidaroma kompanija (#/kompanijos/<id>)",s.hash.startsWith("#/kompanijos/")&&s.shown.join()==="group"&&s.tab==="groups");
  await p.evaluate(()=>history.back());await sleep(600);s=await st();ok("atgal iš kompanijos → sąrašas",s.hash==="#/kompanijos"&&s.shown.join()==="groups");
  await p.goto(base+"#/profilis",{waitUntil:"networkidle0"});await sleep(500);s=await st();
  ok("gili nuoroda #/profilis",s.shown.join()==="profile"&&s.tab==="profile");
  await p.$eval("#profile",e=>e.scrollTop=300);await sleep(200);
  ok("sticky juosta: .scrolled po slinkimo",await p.$eval("#profile",e=>e.classList.contains("scrolled")));
  await p.goto(base+"#/pratimai",{waitUntil:"networkidle0"});await sleep(500);
  await click('.ex-card[data-ex="jack"]');await sleep(500);
  ok("pratimo lapas atsidaro su jo spalva",await p.$eval("#exDetail",d=>d.open&&d.dataset.tone==="blue"&&document.getElementById("exdName").textContent.startsWith("Pašokimai")));
  await p.keyboard.press("Escape");await sleep(400);
  ok("Esc uždaro lapą",await p.$eval("#exDetail",d=>!d.open));
  if(y4m){
    await p.goto(base+"#/",{waitUntil:"networkidle0"});await sleep(600);await click("#homePlay");await sleep(600);
    await click('[data-d="60"]');await click("#go");
    for(let i=0;i<40;i++){await sleep(500);if(await p.evaluate(()=>!document.getElementById("ready").classList.contains("hide")))break}
    s=await st();ok("pasiruošimas: #/zaidimas, be meniu",s.hash==="#/zaidimas"&&s.shown.includes("ready")&&s.ingame);
    await p.evaluate(()=>history.back());await sleep(600);s=await st();
    ok("atgal pasiruošime → nustatymai",s.shown.join()==="start"&&!s.ingame);
    await click("#go");
    for(let i=0;i<60;i++){await sleep(500);if(await p.evaluate(()=>document.getElementById("hud").classList.contains("on")))break}
    await p.evaluate(()=>history.back());await sleep(800);
    ok("atgal žaidimo metu ignoruojamas",await p.evaluate(()=>document.getElementById("hud").classList.contains("on")&&location.hash==="#/zaidimas"));
    for(let i=0;i<150;i++){await sleep(500);if(await p.evaluate(()=>!document.getElementById("end").classList.contains("hide")))break}
    ok("rezultatai po žaidimo",(await st()).shown.includes("end"));
    await click("#end [data-again]");
    for(let i=0;i<40;i++){await sleep(500);if(await p.evaluate(()=>!document.getElementById("ready").classList.contains("hide")))break}
    ok("„Žaisti dar kartą“ → vėl pasiruošimas",(await st()).shown.includes("ready"));
    await p.evaluate(()=>history.back());await sleep(600);
    await click("#start [data-back]");await sleep(600);s=await st();
    ok("iš nustatymų atgal → Pradžia, d=0",s.shown.join()==="home"&&s.d===0&&!s.ingame);
  }
  ok("naršyklės klaidų nėra"+(errs.length?": "+errs.join(" | "):""),!errs.length);
  console.log(`\n${pass}/${pass+fail} OK`);
  await b.close();srv.close();process.exit(fail?1:0);
})();
function puppeteer(){return require(PUP)}
