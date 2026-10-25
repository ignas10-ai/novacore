// NovaCore online sluoksnio patikra prieš TIKRĄ Supabase (supabase/migrations/001_init.sql): 2 anoniminiai vartotojai,
// profiliai, kompanija, prisijungimas kodu, žaidimai, savaitės lentelė, iššūkis + RLS (B nemato A žaidimų ir svetimos
// kompanijos). Naudojimas: node tools/social-check.mjs   (raktai iš .env.local; service_role NEnaudojamas)
// Išeities kodas: 0 = OK, 1 = patikra nepraėjo, 2 = serveris neparuoštas (migracija / anoniminis prisijungimas).
// Po savęs ištrina savo kompaniją; 2 testiniai anoniminiai vartotojai ir jų žaidimai lieka (games neturi delete teisės).
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {gameRow} from "../src/online/api.ts";

// --- 1. gryna logika (be tinklo): kas siunčiama į games ---
const ev=[{player:0,ex:"squat"},{player:0,ex:"squat"},{player:1,ex:"jack"},{player:0,ex:"jack"}];
const at=new Date("2026-10-25T10:00:00Z");
let r=gameRow(1,180,[7,0],ev,["squat","jack"],"id1",at);
assert.deepEqual([r.players,r.duration,r.score,r.reps],[1,180,7,{squat:2,jack:1}]);
r=gameRow(2,60,[3,9],ev,["squat","jack"],"id2",at);
assert.deepEqual([r.score,r.reps],[9,{jack:1}],"2 žaidėjai: didesnis rezultatas ir to žaidėjo pakartojimai");
assert.equal(gameRow(1,180,[5000,0],[],[],"id3",at).score,2000,"DB check: score ≤ 2000");
console.log("✓ gameRow");

// --- 2. tikras serveris ---
let env={};
try{env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(l=>/^\w+=/.test(l)).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]))}catch(e){}
const URL_=process.env.VITE_SUPABASE_URL||env.VITE_SUPABASE_URL, KEY=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
class Blocked extends Error{}
const blocked=msg=>{throw new Blocked(msg)}; // ponytail: no process.exit() – on Windows it aborts while fetch sockets close
const mk=()=>createClient(URL_||"http://localhost",KEY||"none",{auth:{persistSession:false,autoRefreshToken:false}});
const A=mk(),B=mk();
const must=(res,what)=>{if(res.error)throw new Error(`${what}: ${res.error.code||""} ${res.error.message}`);return res.data};
const ok=what=>console.log("✓",what);

const ids={};
let gid=null;
try{
if(!URL_||!KEY)blocked("nėra VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env.local)");
for(const [n,c] of [["A",A],["B",B]]){
  const {data,error}=await c.auth.signInAnonymously();
  if(error)blocked(error.code==="anonymous_provider_disabled"?"anoniminis prisijungimas išjungtas (Supabase → Authentication → Sign In / Providers → Allow anonymous sign-ins)":`signInAnonymously: ${error.code||""} ${error.message}`);
  ids[n]=data.user.id;
}
ok("2 anoniminiai vartotojai");
const tag=Math.random().toString(36).slice(2,6);
  for(const [n,c] of [["A",A],["B",B]]){
    const res=await c.from("profiles").upsert({id:ids[n],nickname:`Test${n}-${tag}`});
    if(res.error?.code==="PGRST205")blocked("lentelių nėra – paleisk supabase/migrations/001_init.sql (SQL Editor)");
    must(res,`profilis ${n}`);
  }
  ok("profiliai");

  const g=must(await A.rpc("create_group",{p_name:`Testas ${tag}`}),"create_group");
  gid=g.id;
  assert.match(g.code,/^[0-9A-F]{6}$/);assert.equal(g.owner_id,ids.A);
  ok(`kompanija sukurta (kodas ${g.code})`);

  // RLS: B dar ne narys
  assert.deepEqual(must(await B.from("groups").select("id").eq("id",gid),"B groups"),[],"B mato svetimą kompaniją");
  assert.deepEqual(must(await B.rpc("group_leaderboard",{gid}),"B lb"),[],"B mato svetimos kompanijos lentelę");
  assert.deepEqual(must(await B.from("group_members").select("user_id").eq("group_id",gid),"B members"),[],"B mato svetimus narius");
  ok("RLS: svetima kompanija nematoma");

  const bad=await B.rpc("join_group",{p_code:"ZZZZZZ"});
  assert.match(bad.error?.message||"",/group_not_found/);
  const j=must(await B.rpc("join_group",{p_code:g.code.toLowerCase()}),"join_group");
  assert.equal(j.id,gid);
  assert.equal(must(await B.from("groups").select("id").eq("id",gid),"B groups po join").length,1);
  ok("prisijungta kodu (mažosios raidės irgi tinka)");

  const row=(c,o)=>c.from("games").insert({id:crypto.randomUUID(),players:1,duration:180,score:0,reps:{},exercises:["squat"],...o}).select("id").single();
  const ga=must(await row(A,{score:120,reps:{squat:40}}),"A game");
  must(await row(B,{score:150}),"B game");
  must(await row(B,{score:300,players:2}),"B 2p game");
  must(await row(B,{score:400,duration:60}),"B 1 min game");
  ok("žaidimai įrašyti");

  const lb=must(await A.rpc("group_leaderboard",{gid}),"lb");
  assert.deepEqual(lb.map(x=>[x.user_id,x.best,Number(x.games)]),[[ids.B,150,1],[ids.A,120,1]],"lentelė: tik 3 min solo, geriausias pirmas");
  ok("savaitės lentelė");

  assert.deepEqual(must(await B.from("games").select("id").eq("id",ga.id),"B → A game"),[],"B mato A žaidimą");
  assert.ok(must(await B.from("games").select("user_id"),"B games").every(x=>x.user_id===ids.B));
  const forged=await B.from("games").insert({players:1,duration:180,score:999,user_id:ids.A});
  assert.ok(forged.error,"B įrašė žaidimą A vardu");
  ok("RLS: svetimi žaidimai nematomi ir neįrašomi");

  const ch=must(await B.rpc("get_challenge",{game_id:ga.id}),"get_challenge");
  assert.equal(ch.length,1);assert.equal(ch[0].nickname,`TestA-${tag}`);assert.equal(ch[0].score,120);assert.equal(ch[0].duration,180);
  ok("iššūkis matomas pagal žaidimo id");

  await B.from("profiles").update({nickname:"Hacked"}).eq("id",ids.A);
  assert.equal(must(await A.from("profiles").select("nickname").eq("id",ids.A).single(),"A profile").nickname,`TestA-${tag}`);
  await B.from("groups").delete().eq("id",gid);
  assert.equal(must(await A.from("groups").select("id").eq("id",gid),"A groups").length,1,"ne savininkas ištrynė kompaniją");
  ok("RLS: svetimas profilis ir kompanija nekeičiami");

  must(await B.from("group_members").delete().eq("group_id",gid).eq("user_id",ids.B),"leave");
  assert.deepEqual(must(await B.from("groups").select("id").eq("id",gid),"B groups po leave"),[]);
  ok("išėjimas iš kompanijos");
  console.log("OK");
}catch(e){
  if(e instanceof Blocked){console.error("BLOKUOJA:",e.message);process.exitCode=2}
  else{console.error("FAIL",e.message);process.exitCode=1}
}
finally{
  if(gid){const d=await A.from("groups").delete().eq("id",gid);console.log(d.error?`! kompanijos ištrinti nepavyko: ${d.error.message}`:"(testinė kompanija ištrinta; 2 anoniminiai test vartotojai lieka)")}
}
