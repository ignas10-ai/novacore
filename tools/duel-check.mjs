// NovaCore nuotolinių dvikovų patikra prieš TIKRĄ Supabase (supabase/migrations/002_duels.sql): 3 anoniminiai vartotojai
// (A kviečia, B priima, C – pašalinis), kompanija, kvietimas, gyvas kvietimas per postgres_changes, privatus kanalas
// duel:<id> su presence, laikrodžio ping/pong, sinchronizuotas startas, taškų broadcast, finish_duel + RLS.
// Naudojimas: node tools/duel-check.mjs   (raktai iš .env.local; service_role NEnaudojamas)
// Išeities kodas: 0 = OK, 1 = patikra nepraėjo, 2 = serveris neparuoštas (002 nepaleista / anoniminis prisijungimas išjungtas).
// Po savęs ištrina kompaniją (dvikovos išsitrina kartu – on delete cascade); 3 testiniai anoniminiai vartotojai lieka.
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {clockOffset,seedShift,fresh,INVITE_MS,SCORE_MS} from "../src/duel/api.ts";

// --- 1. gryna logika ---
assert.deepEqual(clockOffset([{t0:0,t:1050,t1:100},{t0:200,t:1230,t1:260},{t0:300,t:900,t1:900}]),{off:1000,rtt:60},"greičiausias RTT laimi");
assert.equal(clockOffset([]),null);
assert.equal(seedShift(123457,4),1);assert.equal(seedShift(-7,3),1);assert.equal(seedShift(5,0),0);
assert.ok(fresh(new Date(Date.now()-60e3).toISOString(),Date.now()));
assert.ok(!fresh(new Date(Date.now()-INVITE_MS-1).toISOString(),Date.now()));
console.log("✓ clockOffset / seedShift / fresh");

// --- 2. tikras serveris ---
let env={};
try{env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(l=>/^\w+=/.test(l)).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]))}catch(e){}
const URL_=process.env.VITE_SUPABASE_URL||env.VITE_SUPABASE_URL, KEY=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
class Blocked extends Error{}
const blocked=msg=>{throw new Blocked(msg)};
const mk=()=>createClient(URL_||"http://localhost",KEY||"none",{auth:{persistSession:false,autoRefreshToken:false}});
const A=mk(),B=mk(),C=mk();
const must=(res,what)=>{if(res.error)throw new Error(`${what}: ${res.error.code||""} ${res.error.message}`);return res.data};
const ok=what=>console.log("✓",what);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,what,ms=10000)=>{const t=Date.now();while(!fn()){if(Date.now()-t>ms)throw new Error(`nesulaukta: ${what}`);await sleep(50)}};
const subscribe=(ch,what)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error(`${what}: subscribe timeout`)),12000);ch.subscribe(st=>{if(st==="SUBSCRIBED"){clearTimeout(t);res("ok")}else if(st==="CHANNEL_ERROR"||st==="TIMED_OUT"){clearTimeout(t);res(st)}})});

const ids={};
let gid=null;const channels=[];
try{
  if(!URL_||!KEY)blocked("nėra VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env.local)");
  for(const [n,c] of [["A",A],["B",B],["C",C]]){
    const {data,error}=await c.auth.signInAnonymously();
    if(error)blocked(error.code==="anonymous_provider_disabled"?"anoniminis prisijungimas išjungtas (Authentication → Sign In / Providers → Allow anonymous sign-ins)":`signInAnonymously: ${error.code||""} ${error.message}`);
    ids[n]=data.user.id;
    await c.realtime.setAuth(data.session.access_token);
  }
  const tag=Math.random().toString(36).slice(2,6);
  for(const [n,c] of [["A",A],["B",B],["C",C]]){
    const r=await c.from("profiles").upsert({id:ids[n],nickname:`Duel${n}-${tag}`});
    if(r.error?.code==="PGRST205")blocked("lentelių nėra – pirma paleisk supabase/migrations/001_init.sql");
    must(r,`profilis ${n}`);
  }
  const probe=await A.rpc("pending_duels");
  if(probe.error&&/PGRST202|42883|PGRST205|42P01/.test(probe.error.code||""))blocked("dvikovų lentelės/funkcijų nėra – paleisk supabase/migrations/002_duels.sql (Supabase → SQL Editor → įklijuoti → Run)");
  must(probe,"pending_duels");
  ok("3 anoniminiai vartotojai + profiliai, 002 yra");

  const g=must(await A.rpc("create_group",{p_name:`Dvikova ${tag}`}),"create_group");gid=g.id;
  must(await B.rpc("join_group",{p_code:g.code}),"B join");
  ok(`kompanija ${g.code}: A ir B nariai, C – ne`);

  // gyvas kvietimas: B klauso savo inbox
  const live=[];
  let pgReady=false; // Realtime sends system {extension:"postgres_changes",status:"ok"} once the WAL subscription exists on the server
  const inbox=B.channel(`inbox:${ids.B}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"duels",filter:`to_user=eq.${ids.B}`},p=>live.push(p.new))
    .on("system",{},p=>{if(p?.extension==="postgres_changes"&&p.status==="ok")pgReady=true});
  channels.push([B,inbox]);
  assert.equal(await subscribe(inbox,"B inbox"),"ok","B inbox kanalas");
  // SUBSCRIBED != the server already streams the table: an INSERT right after SUBSCRIBED was sometimes lost (~2/4 runs).
  // Wait for the server's own "Subscribed to PostgreSQL" system message (+ a short margin); the live assertion below stays strict.
  await until(()=>pgReady,"B inbox: postgres_changes prenumerata serveryje (system ok)",20000).catch(e=>console.log("!",e.message,"– tęsiama po 3 s"));
  await sleep(pgReady?300:3000);

  const bad=async(p,re,what)=>{const r=await p;assert.ok(r.error&&re.test(r.error.message),`${what}: ${r.error?.message||"be klaidos"}`)};
  await bad(A.rpc("invite_duel",{p_group:gid,p_to:ids.A,p_duration:60,p_exercises:["squat"]}),/duel_self/,"pats sau");
  await bad(A.rpc("invite_duel",{p_group:gid,p_to:ids.B,p_duration:90,p_exercises:["squat"]}),/duel_bad_settings/,"trukmė 90");
  await bad(A.rpc("invite_duel",{p_group:gid,p_to:ids.B,p_duration:60,p_exercises:["DROP TABLE"]}),/duel_bad_settings/,"blogas pratimas");
  await bad(A.rpc("invite_duel",{p_group:gid,p_to:ids.C,p_duration:60,p_exercises:["squat"]}),/duel_not_member/,"C ne narys");
  await bad(C.rpc("invite_duel",{p_group:gid,p_to:ids.B,p_duration:60,p_exercises:["squat"]}),/duel_not_member/,"C kviečia iš svetimos kompanijos");
  ok("invite_duel tikrina: pats sau, nustatymai, narystė");

  const d=must(await A.rpc("invite_duel",{p_group:gid,p_to:ids.B,p_duration:60,p_exercises:["squat","jack"]}),"invite_duel");
  assert.equal(d.status,"pending");assert.equal(d.settings.duration,60);assert.deepEqual(d.settings.exercises,["squat","jack"]);assert.equal(typeof d.settings.seed,"number");
  await until(()=>live.some(x=>x.id===d.id),"B gauna kvietimą gyvai (postgres_changes)",20000);
  ok("kvietimas sukurtas ir B gavo jį gyvai");

  const pend=must(await B.rpc("pending_duels"),"B pending");
  assert.ok(pend.some(x=>x.id===d.id&&x.nickname===`DuelA-${tag}`),"B mato laukiantį kvietimą su A slapyvardžiu");
  assert.deepEqual(must(await C.from("duels").select("id").eq("id",d.id),"C select"),[],"C mato svetimą dvikovą");
  assert.deepEqual(must(await C.rpc("pending_duels"),"C pending"),[]);
  await bad(C.rpc("respond_duel",{p_id:d.id,p_accept:true}),/duel_not_found/,"C priima svetimą");
  await bad(A.rpc("respond_duel",{p_id:d.id,p_accept:true}),/duel_not_found/,"A priima pats savo");
  const ins=await A.from("duels").insert({group_id:gid,from_user:ids.A,to_user:ids.B,settings:{}});
  assert.ok(ins.error,"tiesioginis insert turi būti uždraustas");
  ok("RLS: C nemato ir negali priimti; tiesioginis insert uždraustas");

  const acc=must(await B.rpc("respond_duel",{p_id:d.id,p_accept:true}),"respond_duel");
  assert.equal(acc.status,"accepted");
  await bad(B.rpc("respond_duel",{p_id:d.id,p_accept:false}),/duel_closed/,"antras atsakymas");
  ok("B priėmė (antrą kartą atsakyti nebegalima)");

  // privatus kanalas
  const rx={A:[],B:[],C:[]};
  const chan=(c,me,who)=>{const ch=c.channel(`duel:${d.id}`,{config:{private:true,broadcast:{self:false},presence:{key:me}}});
    ch.on("broadcast",{event:"*"},m=>rx[who]?.push({...m,at:Date.now()}));channels.push([c,ch]);return ch};
  const chA=chan(A,ids.A,"A"),chB=chan(B,ids.B,"B"),chC=chan(C,ids.C,"C");
  const [sa,sb,scc]=await Promise.all([subscribe(chA,"A"),subscribe(chB,"B"),subscribe(chC,"C")]);
  assert.equal(sa,"ok","A prisijungia prie duel kanalo");assert.equal(sb,"ok","B prisijungia prie duel kanalo");
  assert.notEqual(scc,"ok","C NETURI prisijungti prie privataus duel kanalo");
  await chA.track({n:"A"});await chB.track({n:"B"});
  await until(()=>chA.presenceState()[ids.B]?.length&&chB.presenceState()[ids.A]?.length,"presence: abu mato vienas kitą");
  ok("privatus kanalas: A ir B viduje, mato vienas kitą (presence); C atmestas");

  // laikrodžio sinchronizacija (B = svečias)
  chA.on("broadcast",{event:"ping"},({payload})=>chA.send({type:"broadcast",event:"pong",payload:{t0:payload.t0,t:Date.now()}}));
  const samples=[];
  chB.on("broadcast",{event:"pong"},({payload})=>samples.push({t0:payload.t0,t:payload.t,t1:Date.now()}));
  for(let i=0;i<5;i++){await chB.send({type:"broadcast",event:"ping",payload:{t0:Date.now()}});await sleep(150)}
  await until(()=>samples.length>=3,"pong atsakymai");
  const off=clockOffset(samples);
  assert.ok(Math.abs(off.off)<=off.rtt,`tas pats kompiuteris: poslinkis ${off.off} ms turi būti < RTT ${off.rtt} ms`);
  ok(`laikrodis: poslinkis ${Math.round(off.off)} ms, RTT ${Math.round(off.rtt)} ms`);

  // sinchronizuotas startas
  const at=Date.now()+1500;let startA=0,startB=0;
  setTimeout(()=>startA=Date.now(),at-Date.now());
  chB.on("broadcast",{event:"start"},({payload})=>setTimeout(()=>startB=Date.now(),payload.at-off.off-Date.now()));
  await chA.send({type:"broadcast",event:"start",payload:{at}});
  must(await A.rpc("start_duel",{p_id:d.id}),"start_duel");
  await until(()=>startA&&startB,"abu startai",5000);
  assert.ok(Math.abs(startA-startB)<80,`startų skirtumas ${startA-startB} ms`);
  ok(`sinchronizuotas startas: skirtumas ${startA-startB} ms`);

  // taškai ~4x/s
  for(let s=1;s<=6;s++){await chA.send({type:"broadcast",event:"score",payload:{s}});await sleep(SCORE_MS)}
  await chB.send({type:"broadcast",event:"score",payload:{s:4}});
  await until(()=>rx.B.filter(m=>m.event==="score").at(-1)?.payload.s===6,"B gauna A taškus");
  await until(()=>rx.A.filter(m=>m.event==="score").at(-1)?.payload.s===4,"A gauna B taškus");
  assert.equal(rx.C.length,0,"C nieko negavo");
  ok(`taškų broadcast: B gavo ${rx.B.filter(m=>m.event==="score").length}/6, A gavo B taškus, C – nieko`);

  // pabaiga
  await bad(A.rpc("finish_duel",{p_id:d.id,p_score:5000}),/duel_bad_score/,"5000 tšk.");
  await bad(C.rpc("finish_duel",{p_id:d.id,p_score:10}),/duel_not_found/,"C rašo svetimą rezultatą");
  const f1=must(await A.rpc("finish_duel",{p_id:d.id,p_score:120}),"A finish");
  assert.equal(f1.status,"playing");assert.equal(f1.winner,null);
  must(await A.rpc("finish_duel",{p_id:d.id,p_score:999}),"A finish dar kartą");
  const f2=must(await B.rpc("finish_duel",{p_id:d.id,p_score:95}),"B finish");
  assert.deepEqual([f2.status,f2.from_score,f2.to_score,f2.winner],["done",120,95,ids.A],"done, A laimėjo, A rezultatas neperrašytas");
  assert.deepEqual(must(await C.from("duels").select("id"),"C visos"),[],"C nemato jokių svetimų dvikovų");
  ok("finish_duel: ribos, vienas įrašas žaidėjui, laimėtojas; C nemato");
  console.log("OK");
}catch(e){
  if(e instanceof Blocked){console.error("BLOKUOJA:",e.message);process.exitCode=2}
  else{console.error("FAIL",e.message);process.exitCode=1}
}finally{
  for(const [c,ch] of channels)await c.removeChannel(ch).catch(()=>{});
  for(const c of [A,B,C])c.realtime.disconnect();
  if(gid){const r=await A.from("groups").delete().eq("id",gid);console.log(r.error?`! kompanijos ištrinti nepavyko: ${r.error.message}`:"(testinė kompanija ir jos dvikovos ištrintos; 3 anoniminiai test vartotojai lieka)")}
}
