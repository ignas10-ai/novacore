// Pilnas žaidimo prabėgimas headless Chrome su „suvaidinta" kamera iš vaizdo failo → ekrano kadrai kiekvieno ekrano.
// Naudojimas: npm run build && node tools/playthrough.cjs <cam.y4m> [--landscape] [--out dir] [--players 1|2] [--duration 60|180] [--social] [--size 360x740]
//   --social: Supabase pakeičiamas netikru (užklausos perimamos naršyklėje) → papildomi kadrai 00a–00g (slapyvardis,
//   kompanijos, lentelė, iššūkio juosta) ir 05-end su iššūkio palyginimu. Be --social tikras serveris; pirmo paleidimo
//   slapyvardžio langas uždaromas „Vėliau“.
//   --palette volt: atidaro /?palette=volt (spalvų rinkinio palyginimui, žr. main.css :root[data-palette]).
//   --history: įdeda kelis netikrus žaidimus į localStorage (rekordų kortelė starto ekrane matosi nuo pirmo kadro).
//   y4m paruošimas: ffmpeg -i klipas.mp4 -vf "scale=640:360,fps=30" -pix_fmt yuv420p cam.y4m
//   (paruošimo vartui reikia ~4 s, kai abu riešai virš nosies – jei įraše to nėra, suklijuok priekyje tokį gabalą)
// Testuoja SURINKTĄ žaidimą (dist/, kaip Vercel) – po kodo pakeitimų pirma `npm run build`.
// Rezultatas: <out>/00-start, 01-loading … 07-clips-menu.png + konsolės klaidos. Chrome/puppeteer-core keliai – kaip extract.cjs.
const path=require("path"),fs=require("fs"),http=require("http");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const puppeteer=require(PUP);
const [,,y4m,...rest]=process.argv;
if(!y4m||!fs.existsSync(y4m)){console.error("node tools/playthrough.cjs <cam.y4m> [--landscape] [--out dir]");process.exit(1)}
const arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const landscape=rest.includes("--landscape"),social=rest.includes("--social"),out=arg("--out",path.join(__dirname,"..","_playthrough",landscape?"landscape":"portrait"));
const pal=arg("--palette",""),qp=pal?`palette=${pal}`:"";
const players=arg("--players","1"),duration=arg("--duration","60"),port=8766+(landscape?1:0);
fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,"..","dist");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png"};
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(port);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`,"--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const p=await b.newPage();
  const [vw,vh]=(arg("--size","")||(landscape?"844x390":"390x844")).split("x").map(Number); // e.g. --size 360x740
  await p.setViewport({width:vw,height:vh,deviceScaleFactor:2,isMobile:true});
  const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR "+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200))});
  const shot=async(n,t)=>{await sleep(t);await p.screenshot({path:path.join(out,n+".png")});console.log("•",n)};
  const visible=id=>p.evaluate(id=>{const el=document.getElementById(id);return !!el&&getComputedStyle(el).display!=="none"},id);
  if(social)await mockSupabase(p);
  if(rest.includes("--history"))await p.evaluateOnNewDocument(()=>{if(!localStorage.getItem("novacore.history")){const t=Date.now();localStorage.setItem("novacore.history",JSON.stringify([
    {t:t-36e5,players:2,duration:180,ex:["squat","jack","knees"],score:[148,131],reps:[61,55]},
    {t:t-864e5,players:1,duration:180,ex:["squat","lunge"],score:[212,0],reps:[83,0]},
    {t:t-1728e5,players:2,duration:60,ex:["jack"],score:[22,27],reps:[22,27]}]))}});
  await p.goto(`http://localhost:${port}/${qp?"?"+qp:""}`,{waitUntil:"networkidle0"});await sleep(800);
  if(social){
    await shot("00a-nick-first-run",400);
    await p.type("#nickIn","Ignas");await p.click("#nickSave");
    await shot("00b-start-social",900);
    await p.click("#grpOpen");await shot("00c-grp-empty",900);
    await p.type("#grpName","10B klasė");await p.click("#grpNewForm button");await shot("00d-grp-created",1100);
    await p.type("#grpCodeIn","bd42ff");await p.click("#grpJoinForm button");await sleep(900);
    await p.$eval("#grpSheet .sheet-body",el=>el.scrollTop=0);await shot("00e-grp-two",300);
    await p.click("#grpDone");await sleep(400);
    await p.goto(`http://localhost:${port}/?c=${CHAL_ID}${qp?"&"+qp:""}`,{waitUntil:"networkidle0"});
    await shot("00f-challenge",1200);
  }else if(await visible("nickSheet")&&await p.$eval("#nickSheet",d=>d.open))await p.click("#nickLater");
  await shot("00-start",social?0:400);
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
  await shot("05-end",2000);
  if(social){await p.$eval("#end",el=>el.scrollTop=el.scrollHeight);await shot("05b-end-bottom",500)}
  await p.click("#toClips").catch(()=>console.log("! #toClips nerastas"));
  await shot("06-clips-busy",1500);
  for(let i=0;i<90;i++){await sleep(500);const ok=await p.evaluate(()=>{const v=document.querySelector("#clips video");return !!(v&&v.src&&v.readyState>=2&&document.getElementById("previewLoad").hidden)});if(ok)break}
  await shot("06-clips",800);
  await p.click("#dlToggle").catch(()=>{});
  await shot("07-clips-menu",800);
  console.log(errs.length?"KLAIDOS:\n  "+errs.join("\n  "):"klaidų nėra","\n→",out);
  await b.close();srv.close();
})();

// ---------- netikras Supabase (--social): tik UI kadrams, ne duomenų bazės testas (tam – tools/social-check.mjs) ----------
const ME="11111111-1111-4111-8111-111111111111",CHAL_ID="22222222-2222-4222-8222-222222222222";
async function mockSupabase(p){
  const db={nick:null,groups:[],members:{}};
  const others=[{user_id:"a",nickname:"Martynas",best:318,games:4},{user_id:"b",nickname:"Stela",best:274,games:2},{user_id:"c",nickname:"Rūta",best:null,games:0}];
  const jwt=[{alg:"none"},{sub:ME,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600}].map(o=>Buffer.from(JSON.stringify(o)).toString("base64url")).join(".")+".x";
  const cors={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"*","access-control-expose-headers":"*"};
  await p.setRequestInterception(true);
  p.on("request",r=>{
    const u=new URL(r.url());
    if(!u.hostname.endsWith(".supabase.co"))return r.continue();
    const send=(status,body)=>r.respond({status,headers:{...cors,"content-type":"application/json"},body:body===undefined?"":JSON.stringify(body)});
    if(r.method()==="OPTIONS")return send(204);
    const path=u.pathname,body=r.postData()?JSON.parse(r.postData()):{};
    if(path==="/auth/v1/signup")return send(200,{access_token:jwt,token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:"r",user:{id:ME,aud:"authenticated",role:"authenticated",is_anonymous:true,app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});
    if(path==="/rest/v1/profiles")return r.method()==="GET"?send(200,db.nick?[{nickname:db.nick}]:[]):(db.nick=body.nickname,send(201));
    if(path==="/rest/v1/groups")return send(200,db.groups);
    if(path==="/rest/v1/games")return send(201);
    if(path==="/rest/v1/group_members")return send(204);
    if(path==="/rest/v1/rpc/create_group"||path==="/rest/v1/rpc/join_group"){
      const g=path.endsWith("create_group")?{id:"g1",name:body.p_name,code:"K7Q2ZX",owner_id:ME}:{id:"g2",name:"Krepšinio komanda",code:body.p_code.toUpperCase(),owner_id:"a"};
      if(!db.groups.some(x=>x.id===g.id))db.groups.push(g);return send(200,g);
    }
    if(path==="/rest/v1/rpc/group_leaderboard"){
      const meRow={user_id:ME,nickname:db.nick||"?",best:body.gid==="g2"?291:null,games:body.gid==="g2"?3:0};
      return send(200,body.gid==="g2"?[others[0],meRow,others[1],others[2]]:[meRow]);
    }
    if(path==="/rest/v1/rpc/get_challenge")return send(200,[{nickname:"Martynas",score:4,duration:60,players:1,exercises:["squat","jack","knees"],created_at:new Date().toISOString()}]);
    console.log("! nemokama užklausa",r.method(),path);send(404,{message:"mock"});
  });
}
