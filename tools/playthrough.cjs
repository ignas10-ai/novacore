// Pilnas žaidimo prabėgimas headless Chrome su „suvaidinta" kamera iš vaizdo failo → ekrano kadrai kiekvieno ekrano.
// Naudojimas: node tools/playthrough.cjs <cam.y4m> [--landscape] [--out dir] [--players 1|2] [--duration 60|180]
//   y4m paruošimas: ffmpeg -i klipas.mp4 -vf "scale=640:360,fps=30" -pix_fmt yuv420p cam.y4m
//   (paruošimo vartui reikia ~4 s, kai abu riešai virš nosies – jei įraše to nėra, suklijuok priekyje tokį gabalą)
// Rezultatas: <out>/01-loading … 07-clips-menu.png + konsolės klaidos. Chrome/puppeteer-core keliai – kaip extract.cjs.
const path=require("path"),fs=require("fs"),http=require("http");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const [,,y4m,...rest]=process.argv;
if(!y4m||!fs.existsSync(y4m)){console.error("node tools/playthrough.cjs <cam.y4m> [--landscape] [--out dir]");process.exit(1)}
const arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const landscape=rest.includes("--landscape"),out=arg("--out",path.join(__dirname,"..","_playthrough",landscape?"landscape":"portrait"));
const players=arg("--players","1"),duration=arg("--duration","60"),port=8766+(landscape?1:0);
fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,"..");
const types={".html":"text/html",".js":"text/javascript",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png"};
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`,"--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const p=await b.newPage();
  await p.setViewport(landscape?{width:844,height:390,deviceScaleFactor:2,isMobile:true}:{width:390,height:844,deviceScaleFactor:2,isMobile:true});
  const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200))});
  const shot=async(n,t)=>{await sleep(t);await p.screenshot({path:path.join(out,n+".png")});console.log("•",n)};
  const visible=id=>p.evaluate(id=>{const el=document.getElementById(id);return !!el&&getComputedStyle(el).display!=="none"},id);
  await p.goto(`http://localhost:${port}/`,{waitUntil:"networkidle0"});await sleep(800);
  await p.click(`[data-p="${players}"]`);await p.click(`[data-d="${duration==="60"?"60":"180"}"]`);
  await p.click("#go");
  await shot("01-loading",600);
  for(let i=0;i<40;i++){await sleep(500);if(await visible("ready")&&!(await visible("loading")))break}
  await shot("02-ready",1500);
  for(let i=0;i<30;i++){await sleep(500);if(await p.evaluate(()=>document.getElementById("hud").classList.contains("on")))break} // ready gate passed?
  await shot("03-game-start",1200);
  const n=Math.ceil(+duration/8);
  for(let i=0;i<n;i++)await shot(`04-game-${String(i).padStart(2,"0")}`,7500);
  for(let i=0;i<60;i++){await sleep(500);if(await visible("end"))break}
  await shot("05-end",1500);
  await p.click("#toClips").catch(()=>console.log("! #toClips nerastas"));
  await shot("06-clips-busy",1500);
  for(let i=0;i<90;i++){await sleep(500);const ok=await p.evaluate(()=>{const v=document.querySelector("#clips video");return !!(v&&v.src&&v.readyState>=2&&document.getElementById("previewLoad").hidden)});if(ok)break}
  await shot("06-clips",800);
  await p.click("#dlToggle").catch(()=>{});
  await shot("07-clips-menu",800);
  console.log(errs.length?"KLAIDOS:\n  "+errs.join("\n  "):"klaidų nėra","\n→",out);
  await b.close();srv.close();
})();
