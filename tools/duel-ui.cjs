// Dvikovos per atstumą UI prabėgimas: DVI atskiros naršyklės (du telefonai, du anoniminiai vartotojai), kiekviena su savo
// netikra kamera, prieš SURINKTĄ dist/ (pirma `npm run build`). Supabase netikras: REST perimamas puppeteer'iu (bendra
// atmintinė DB abiem naršyklėms), o Realtime WebSocket nukreipiamas į vietinį Phoenix protokolo serverį (broadcast,
// presence, postgres_changes, privataus kanalo patikra) – realūs `duel:<id>` pranešimai tarp dviejų puslapių, suskaičiuoti.
// Kameros: personažų paveikslėliai (src/art) → MJPEG: ~20 s rankos aukštyn (pasiruošimo vartai), toliau kaitaliojasi
// kelio pakėlimas į kairę / dešinę – „Žingsniai į šoną" pratime tai duoda taškų (A greičiau, B lėčiau).
// Naudojimas: node tools/duel-ui.cjs [--out dir] [--drop]   (--drop: B atsijungia žaidimo viduryje → A mato „Atsijungė")
// Reikia: Chrome, puppeteer-core (+ jo `ws`), ffmpeg (FFMPEG env arba PATH). Kadrai → <out>/NN-*.png (numatyta _playthrough/duel).
const path=require("path"),fs=require("fs"),http=require("http"),{execFileSync}=require("child_process");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG=process.env.FFMPEG||"ffmpeg";
const puppeteer=require(PUP),{WebSocketServer}=require(path.join(PUP,"..","ws"));
const rest=process.argv.slice(2),arg=(k,d)=>{const i=rest.indexOf(k);return i>=0?rest[i+1]:d};
const out=path.resolve(arg("--out",path.join(__dirname,"..","_playthrough","duel"))),DROP=rest.includes("--drop");
const root=path.join(__dirname,"..","dist"),art=path.join(__dirname,"..","src","art");
if(!fs.existsSync(path.join(root,"index.html"))){console.error("nėra dist/ – pirma: npm run build");process.exit(1)}
fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---------- netikros kameros ----------
function cam(name,cycle){
  const f=path.join(out,`cam-${name}.mjpeg`);if(fs.existsSync(f))return f;
  const q=cycle/4,J=path.join(art,"melynas-jack@2x.webp"),H=path.join(art,"melynas-hero@2x.webp");
  // 0-20 s rankos aukštyn; toliau: kelias kairėn (q) → stovėsena (q) → kelias dešinėn (q) → stovėsena (q)
  const ph=`mod(t-20,${cycle})`;
  execFileSync(FFMPEG,["-y","-loglevel","error","-f","lavfi","-i","color=c=0xd8d4cc:s=640x360:r=30","-loop","1","-i",J,"-loop","1","-i",H,"-filter_complex",
    `[1]scale=-1:330[j];[2]scale=-1:330,split[h][h2];[h2]hflip[hm];`+
    `[0][j]overlay=(W-w)/2:15:enable='lt(t,20)+between(${ph},${q},${2*q})+between(${ph},${3*q},${4*q})'[x];`+
    `[x][h]overlay=(W-w)/2:15:enable='gte(t,20)*lt(${ph},${q})'[y];[y][hm]overlay=(W-w)/2:15:enable='gte(t,20)*between(${ph},${2*q},${3*q})'`,
    "-t","110","-q:v","6","-f","mjpeg",f]);
  return f;
}

// ---------- bendra netikra DB ----------
const U={A:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
const db={nick:{},duels:[]};
const G={id:"g1",name:"10B klasė",code:"K7Q2ZX",owner_id:U.A};
const uuid=()=>require("crypto").randomUUID();
const jwt=sub=>[{alg:"none"},{sub,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600}].map(o=>Buffer.from(JSON.stringify(o)).toString("base64url")).join(".")+".x";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"*","access-control-expose-headers":"*"};
function restMock(p,me){
  p.on("request",r=>{
    const u=new URL(r.url());
    if(!u.hostname.endsWith(".supabase.co"))return r.continue();
    const send=(status,body)=>r.respond({status,headers:{...cors,"content-type":"application/json"},body:body===undefined?"":JSON.stringify(body)});
    if(r.method()==="OPTIONS")return send(204);
    const pth=u.pathname,body=r.postData()?JSON.parse(r.postData()):{};
    const fail=msg=>send(400,{code:"P0001",message:msg});
    if(pth==="/auth/v1/signup")return send(200,{access_token:jwt(me),token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:"r",user:{id:me,aud:"authenticated",role:"authenticated",is_anonymous:true,app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});
    if(pth==="/rest/v1/profiles"){if(r.method()==="GET")return send(200,db.nick[me]?[{nickname:db.nick[me]}]:[]);db.nick[me]=body.nickname;return send(201)}
    if(pth==="/rest/v1/groups")return send(200,[G]);
    if(pth==="/rest/v1/games"||pth==="/rest/v1/group_members")return send(201);
    if(pth==="/rest/v1/rpc/group_leaderboard")return send(200,[{user_id:U.B,nickname:db.nick[U.B]||"Martynas",best:318,games:4},{user_id:U.A,nickname:db.nick[U.A]||"Ignas",best:291,games:3}]);
    if(pth==="/rest/v1/rpc/get_challenge")return send(200,[]);
    if(pth==="/rest/v1/rpc/pending_duels")return send(200,db.duels.filter(d=>d.to_user===me&&d.status==="pending"&&Date.now()-Date.parse(d.created_at)<6e5).map(d=>({id:d.id,group_id:d.group_id,from_user:d.from_user,nickname:db.nick[d.from_user],settings:d.settings,created_at:d.created_at})));
    const d=db.duels.find(x=>x.id===body.p_id), upd=(x,o)=>{const old={...x};Object.assign(x,o);rt.change("UPDATE",x,old);return send(200,x)};
    if(pth==="/rest/v1/rpc/invite_duel"){
      if(body.p_to===me)return fail("duel_self");
      for(const x of db.duels)if(x.from_user===me&&x.to_user===body.p_to&&x.status==="pending"){const old={...x};x.status="cancelled";rt.change("UPDATE",x,old)}
      const n={id:uuid(),group_id:body.p_group,from_user:me,to_user:body.p_to,status:"pending",settings:{duration:body.p_duration,exercises:body.p_exercises,seed:Math.floor(Math.random()*1e6)},created_at:new Date().toISOString(),started_at:null,from_score:null,to_score:null,winner:null};
      db.duels.push(n);rt.change("INSERT",n);return send(200,n);
    }
    if(pth==="/rest/v1/rpc/respond_duel"){if(!d||d.to_user!==me)return fail("duel_not_found");if(d.status!=="pending")return fail("duel_closed");return upd(d,{status:body.p_accept?"accepted":"declined"})}
    if(pth==="/rest/v1/rpc/cancel_duel"){if(!d||![d.from_user,d.to_user].includes(me)||!["pending","accepted"].includes(d.status))return send(200,null);return upd(d,{status:"cancelled"})}
    if(pth==="/rest/v1/rpc/start_duel"){if(!d||d.from_user!==me||d.status!=="accepted")return fail("duel_closed");return upd(d,{status:"playing",started_at:new Date().toISOString()})}
    if(pth==="/rest/v1/rpc/finish_duel"){
      if(!d)return fail("duel_not_found");if(!(body.p_score>=0&&body.p_score<=2000))return fail("duel_bad_score");
      const k=me===d.from_user?"from_score":"to_score",o={[k]:d[k]??body.p_score};
      const f=o.from_score??d.from_score,t=o.to_score??d.to_score;
      if(f!=null&&t!=null){o.status="done";o.winner=f>t?d.from_user:t>f?d.to_user:null}else o.status="playing";
      return upd(d,o);
    }
    console.log("! nemokama užklausa",r.method(),pth);send(404,{message:"mock"});
  });
}

// ---------- netikras Realtime (Phoenix, vsn 2.0.0) ----------
const count={};
const rt=(()=>{
  const wss=new WebSocketServer({port:0});
  const topics=new Map(); // topic -> Map(ws -> member)
  const sub=t=>{const b=Buffer.from(t.split(".")[1],"base64url");return JSON.parse(b).sub};
  const tx=(ws,msg)=>{if(ws.readyState===1)ws.send(JSON.stringify(msg))};
  const members=t=>topics.get(t)||new Map();
  const state=t=>{const s={};for(const m of members(t).values())if(m.meta)s[m.key]={metas:[m.meta]};return s};
  const diff=(t,joins,leaves)=>{for(const [ws] of members(t))tx(ws,[null,null,t,"presence_diff",{joins,leaves}])};
  const fan=(t,from,event,payload)=>{count[event]=(count[event]||0)+1;for(const [ws,m] of members(t))if(ws!==from&&m.joined)tx(ws,[null,null,t,"broadcast",{type:"broadcast",event,payload}])};
  function leave(ws,t){const m=members(t).get(ws);if(!m)return;members(t).delete(ws);if(m.meta)diff(t,{},{[m.key]:{metas:[m.meta]}})}
  wss.on("connection",ws=>{
    ws.on("message",(data,isBinary)=>{
      if(isBinary){ // kind 3 = user broadcast push (realtime-js serializer)
        const b=new Uint8Array(data),[,jl,rl,tl,el,ml,enc]=b;let o=7;const s=n=>{const v=Buffer.from(b.slice(o,o+n)).toString();o+=n;return v};
        s(jl);s(rl);const t=s(tl),ev=s(el);s(ml);const raw=Buffer.from(b.slice(o)).toString();
        return fan(t,ws,ev,enc===1?JSON.parse(raw||"{}"):raw);
      }
      const [jr,ref,t,ev,p]=JSON.parse(String(data));
      const reply=(status,response={})=>tx(ws,[jr,ref,t,"phx_reply",{status,response}]);
      if(t==="phoenix")return reply("ok");
      if(ev==="phx_join"){
        const uid=sub(p.access_token||""),cfg=p.config||{};
        if(cfg.private){const id=t.replace(/^realtime:duel:/,""),d=db.duels.find(x=>x.id===id);if(!d||![d.from_user,d.to_user].includes(uid))return reply("error",{reason:"Unauthorized: You do not have permissions to read from this Channel topic"})}
        const pg=(cfg.postgres_changes||[]).map((f,i)=>({...f,id:i+1}));
        if(!topics.has(t))topics.set(t,new Map());
        members(t).set(ws,{uid,key:cfg.presence?.key||uid,pg,meta:null,joined:true,jr});
        reply("ok",{postgres_changes:pg});
        if(cfg.presence?.enabled)tx(ws,[jr,null,t,"presence_state",state(t)]);
        return;
      }
      const m=members(t).get(ws);
      if(ev==="phx_leave"){leave(ws,t);return reply("ok")}
      if(ev==="presence"&&p?.event==="track"&&m){m.meta={phx_ref:Math.random().toString(36).slice(2),...p.payload};count.presence=(count.presence||0)+1;diff(t,{[m.key]:{metas:[m.meta]}},{});return reply("ok")}
      if(ev==="broadcast"&&m){fan(t,ws,p.event,p.payload);return reply("ok")}
      reply("ok");
    });
    ws.on("close",()=>{for(const t of topics.keys())leave(ws,t)});
  });
  function change(type,record,old){
    for(const [t,ms] of topics)for(const [ws,m] of ms)for(const b of m.pg){
      if(b.table!=="duels"||(b.event!=="*"&&b.event!==type))continue;
      const [col,val]=(b.filter||"").split("=eq.");if(col&&String(record[col])!==val)continue;
      if(![record.from_user,record.to_user].includes(m.uid))continue; // RLS
      count.postgres_changes=(count.postgres_changes||0)+1;
      tx(ws,[null,null,t,"postgres_changes",{ids:[b.id],data:{schema:"public",table:"duels",commit_timestamp:new Date().toISOString(),type,record,old_record:old||{},columns:[],errors:null}}]);
    }
  }
  return {port:()=>wss.address().port,change,close:()=>wss.close()};
})();

// ---------- statinis dist/ ----------
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp"};
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];const f=path.join(root,u==="/"?"index.html":u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)}).listen(8794);
const base="http://localhost:8794/";

let n=0;const errs=[];
async function phone(who,nick,camFile){
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",`--use-file-for-fake-video-capture=${camFile}`,"--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  p.on("pageerror",e=>errs.push(`${who} PAGEERROR ${e.message}`));
  p.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon|Failed to load resource/.test(t))errs.push(`${who} ${t.slice(0,200)}`);if(/dvikova/i.test(t))console.log(`  [${who}] ${t}`)});
  await p.setRequestInterception(true);restMock(p,U[who]);
  await p.evaluateOnNewDocument((port,nick,who)=>{
    localStorage.setItem("novacore.onb","1");localStorage.setItem("novacore.nick",nick);
    if(who==="A")localStorage.setItem("novacore.exercises",JSON.stringify(["sidestep"]));
    const W=window.WebSocket;
    window.WebSocket=class extends W{constructor(u,pr){super(String(u).replace(/^wss?:\/\/[^/]+\.supabase\.co/,`ws://localhost:${port}`),pr)}};
  },rt.port(),nick,who);
  await p.goto(base+"#/",{waitUntil:"networkidle0"});
  return {b,p,who};
}
const shot=async(ph,name,wait=600)=>{await sleep(wait);const f=`${String(++n).padStart(2,"0")}-${ph.who}-${name}.png`;await ph.p.screenshot({path:path.join(out,f)});console.log("•",f)};
const until=async(ph,fn,what,ms=60000)=>{const t=Date.now();while(!(await ph.p.evaluate(fn))){if(Date.now()-t>ms)throw new Error(`${ph.who}: nesulaukta – ${what}`);await sleep(250)}};
const click=async(ph,sel)=>{await ph.p.waitForSelector(sel,{visible:true,timeout:10000});await ph.p.$eval(sel,e=>e.click())};
const text=(ph,sel)=>ph.p.$eval(sel,e=>e.textContent.trim());

(async()=>{
  let pass=0,fail=0;const ok=(name,cond)=>{cond?pass++:fail++;console.log(cond?"ok  ":"FAIL",name)};
  const A=await phone("A","Ignas",cam("A",2)),B=await phone("B","Martynas",cam("B",3.2));
  try{
    await sleep(2500); // duel.ts inbox starts ~1.5 s after the app
    await A.p.goto(base+"#/kompanijos/g1",{waitUntil:"networkidle0"});await sleep(900);
    await shot(A,"group-duel-buttons");
    ok("lentelėje kardų mygtukas tik prie draugo",await A.p.$$eval(".lb-duel",bs=>bs.length===1&&bs[0].dataset.nick==="Martynas"));
    await click(A,".lb-duel");await shot(A,"invite-pick",700);
    await click(A,'[data-dd="60"]');await click(A,"#duelYes");
    await until(A,()=>document.getElementById("duelTitle").textContent.includes("Laukiam"),"laukimo būsena",8000);
    await shot(A,"invite-waiting",500);
    await until(B,()=>document.getElementById("duelSheet").open&&document.getElementById("duelYes").textContent.includes("Priimti"),"B gauna kvietimą gyvai",10000);
    await shot(B,"invite-incoming",700);
    ok("B kvietimas: slapyvardis ir trukmė",(await text(B,"#duelTitle")).startsWith("Ignas")&&(await text(B,"#duelSub")).includes("1 min"));
    await click(B,"#duelYes");
    await until(B,()=>document.getElementById("duelYes").textContent.includes("kamer"),"B fojė",8000);
    await until(A,()=>document.getElementById("duelYes").textContent.includes("kamer"),"A mato priėmimą",8000);
    await until(A,()=>document.getElementById("dvOpp").dataset.on==="1","A mato B prisijungusį (presence)",8000);
    await shot(A,"lobby",500);await shot(B,"lobby",200);
    await click(A,"#duelYes");await sleep(4000);await click(B,"#duelYes");
    await until(A,()=>!document.getElementById("ready").classList.contains("hide"),"A pasiruošimo ekranas",90000);
    await shot(A,"ready",300);
    await until(A,()=>document.getElementById("rdCount").textContent==="Laukiam"||document.getElementById("hud").classList.contains("on"),"A praeina rankų vartus",60000);
    await shot(A,"ready-waiting-opponent",200);
    await until(B,()=>/^[123]$/.test(document.getElementById("rdCount").textContent)||document.getElementById("hud").classList.contains("on"),"B atgalinis skaičiavimas",90000);
    await shot(B,"countdown",0);
    await Promise.all([until(A,()=>document.getElementById("hud").classList.contains("on"),"A žaidimas"),until(B,()=>document.getElementById("hud").classList.contains("on"),"B žaidimas")]);
    const t0=await Promise.all([A.p.evaluate(()=>Date.now()),B.p.evaluate(()=>Date.now())]);
    ok(`abu žaidimai prasidėjo (skirtumas tikrinant ${Math.abs(t0[0]-t0[1])} ms)`,true);
    ok("HUD: Tu prieš Martynas",(await text(A,".pl.p1 .chip"))==="Tu"&&(await text(A,".pl.p2 .chip"))==="Martynas");
    ok("tie patys pratimai abiem",(await text(A,"#exName"))===(await text(B,"#exName")));
    await sleep(22000);
    // skaičiai „iššoka" 500 ms po kiekvieno taško: fotografuojam, kai abu rodomi pilnai (ne animacijos pradžioje)
    const settled=()=>[...document.querySelectorAll("#s1 .t-digit,#s2 .t-digit")].every(d=>getComputedStyle(d).opacity==="1");
    // headless swiftshader nepiešia composited sluoksnių (will-change) virš kameros drobės – tik kadrui išjungiam will-change
    for(const ph of [A,B]){await until(ph,settled,"taškai matomi",8000).catch(e=>console.log("  !",e.message));await ph.p.addStyleTag({content:".t-digit{will-change:auto!important}"});await shot(ph,"game-hud",300)}
    const [a1,a2]=await A.p.evaluate(()=>[+document.getElementById("s1").textContent,+document.getElementById("s2").textContent]);
    const [b1,b2]=await B.p.evaluate(()=>[+document.getElementById("s1").textContent,+document.getElementById("s2").textContent]);
    console.log(`  A rodo ${a1}:${a2}, B rodo ${b1}:${b2}`);
    ok("gyvi taškai: kiekvienas mato kito taškus (±1 s vėlavimas)",a1>0&&b1>0&&Math.abs(a2-b1)<=2&&Math.abs(b2-a1)<=2);
    if(DROP){
      await B.b.close();await sleep(4000);
      ok("B atsijungė → A HUD rodo „Atsijungė“, žaidimas tęsiasi",(await text(A,".pl.p2 .chip"))==="Atsijungė"&&await A.p.evaluate(()=>document.getElementById("hud").classList.contains("on")));
      await shot(A,"game-opponent-left",0);
    }
    await until(A,()=>!document.getElementById("end").classList.contains("hide"),"A rezultatai",70000);
    if(!DROP)await until(B,()=>!document.getElementById("end").classList.contains("hide"),"B rezultatai",10000);
    await sleep(2500);
    await shot(A,"results",0);if(!DROP)await shot(B,"results",0);
    const resA=await text(A,"#duelResTxt");console.log("  A:",resA,"|",await text(A,"#winner"));
    if(!DROP){
      const resB=await text(B,"#duelResTxt");console.log("  B:",resB,"|",await text(B,"#winner"));
      const fa=db.duels.at(-1);
      ok("DB: abu rezultatai, laimėtojas",fa.status==="done"&&fa.from_score!=null&&fa.to_score!=null);
      ok("rezultatai sutampa abiejuose telefonuose",resA.startsWith(`Tu ${fa.from_score} : ${fa.to_score}`)&&resB.startsWith(`Tu ${fa.to_score} : ${fa.from_score}`));
      await A.p.$eval("#end",e=>e.scrollTop=e.scrollHeight);await shot(A,"results-rematch",500);
      await click(A,"#duelAgain");
      await until(B,()=>document.getElementById("duelSheet").open,"B gauna revanšo kvietimą",10000);
      await shot(A,"rematch-waiting",500);await shot(B,"rematch-incoming",200);
      await click(B,"#duelNo");await until(A,()=>!document.getElementById("duelSheet").open,"A sužino apie atmetimą",8000);
      ok("atmestas revanšas uždaro A laukimą",true);
      await click(A,"#end [data-home]");await sleep(1200);
      ok("po dvikovos solo nustatymai atstatyti (body be .duel, P1/P2)",await A.p.evaluate(()=>!document.body.classList.contains("duel")&&document.querySelector(".pl.p2 .chip").textContent==="P2"));
      await shot(A,"home-after",300);
    }else ok("A rezultatas su atsijungimo žinute",/atsijungė/.test(resA));
  }catch(e){fail++;console.error("FAIL",e.message);await shot(A,"fail",0).catch(()=>{});await shot(B,"fail",0).catch(()=>{})}
  console.log("Realtime pranešimai (siųsta):",JSON.stringify(count));
  ok("naršyklės klaidų nėra"+(errs.length?":\n  "+errs.join("\n  "):""),!errs.length);
  console.log(`\n${pass}/${pass+fail} OK → ${out}`);
  await A.b.close().catch(()=>{});await B.b.close().catch(()=>{});srv.close();rt.close();process.exit(fail?1:0);
})();
