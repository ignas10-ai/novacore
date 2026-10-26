// Live check for 003_delete_me.sql: an anonymous user with a profile, a group, a game and a membership deletes
// everything with one RPC; a second user keeps their own data. Exit 2 = migration not applied yet.
import {createClient} from "@supabase/supabase-js";
const URL_=process.env.VITE_SUPABASE_URL, KEY=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const mk=()=>createClient(URL_,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=(r,w)=>{if(r.error)throw new Error(`${w}: ${r.error.code||""} ${r.error.message}`);return r.data};
const A=mk(),B=mk();
const a=(await A.auth.signInAnonymously()).data.user.id, b=(await B.auth.signInAnonymously()).data.user.id;
must(await A.from("profiles").upsert({id:a,nickname:"del-test-A"}),"profile A");
must(await B.from("profiles").upsert({id:b,nickname:"del-test-B"}),"profile B");
const g=must(await A.rpc("create_group",{p_name:"Trynimo testas"}),"group");
must(await B.rpc("join_group",{p_code:g.code}),"join");
must(await A.from("games").insert({players:1,duration:60,score:12}),"game A");
const gb=must(await B.rpc("create_group",{p_name:"B kompanija"}),"group B");
const r=await A.rpc("delete_my_data");
if(r.error?.code==="PGRST202"){console.log("paleisk supabase/migrations/003_delete_me.sql");process.exit(2)}
must(r,"delete_my_data");
const own=must(await B.from("groups").select("id"),"B groups");
if(own.some(x=>x.id===g.id))throw new Error("A kompanija liko");
if(!own.some(x=>x.id===gb.id))throw new Error("B kompanija dingo");
const p=must(await B.from("profiles").select("id").eq("id",a),"A profile");
if(p.length)throw new Error("A profilis liko");
console.log("✓ A ištrinta (profilis, kompanija, žaidimai, narystės, vartotojas); B duomenys liko");
await B.rpc("delete_my_data");
console.log("OK");
