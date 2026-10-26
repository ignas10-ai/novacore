/// <reference types="vite/client" />
// Online layer (Supabase, supabase/migrations/001_init.sql): anonymous sign-in + nickname, kompanijos, games,
// weekly leaderboard, challenges. NO DOM. Everything is additive: any call may fail (offline, no env vars,
// server not ready) and callers must keep the game playable. RLS does the security; never use the service_role key.
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {t} from "../i18n/i18n.ts";

export interface Group{id:string;name:string;code:string;owner_id:string}
export interface LbRow{user_id:string;nickname:string;best:number|null;games:number}
export interface Challenge{nickname:string;score:number;duration:number;players:number;exercises:string[];created_at:string}
export interface GameRow{id:string;players:number;duration:number;score:number;reps:Record<string,number>;exercises:string[];created_at:string}

const env=import.meta.env||{}; // undefined when Node imports this file (tools/social-check.mjs)
export const sb:SupabaseClient|null=(()=>{try{return env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_PUBLISHABLE_KEY?createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY):null}catch(e){return null}})();

const NICK_KEY="novacore.nick", PENDING_KEY="novacore.pending", PENDING_MAX=20;
const ls={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};
export const cachedNick=()=>ls.get(NICK_KEY);
export const setCachedNick=(n:string)=>ls.set(NICK_KEY,n);

// PURE: one games row from a finished game. 1 player -> P1; 2 players -> the higher score (and that player's reps).
export function gameRow(players:number,duration:number,score:number[],events:{player:number;ex:string}[],exercises:string[],id:string,at:Date):GameRow{
  const p=players===1||score[0]>=score[1]?0:1;
  const reps:Record<string,number>={};
  for(const e of events)if(e.player===p)reps[e.ex]=(reps[e.ex]||0)+1;
  return {id,players,duration,score:Math.min(2000,Math.max(0,score[p]|0)),reps,exercises,created_at:at.toISOString()};
}

// player-facing message for any failure (current language); the game itself never depends on it.
export function errText(e:any){
  const code=e?.code||e?.error_code||"", msg=String(e?.message||e||"");
  if(code==="anonymous_provider_disabled"||/anonymous sign-ins are disabled/i.test(msg))return t("err.anon");
  if(/group_not_found/.test(msg))return t("err.noGroup");
  if(code==="PGRST205"||code==="PGRST202"||code==="42P01"||code==="42883")return t("err.notReady");
  if(!sb)return t("err.offline");
  if((typeof navigator!=="undefined"&&navigator.onLine===false)||/fetch|network|load failed/i.test(msg))return t("err.net");
  return t("err.generic");
}
const must=<T>(r:{data:T;error:any})=>{if(r.error)throw r.error;return r.data};
function client(){if(!sb)throw new Error("offline");return sb}

export async function userId(){const {data}=await client().auth.getSession();return data.session?.user.id||null}
let signingIn:Promise<string>|null=null; // one anonymous user even if two callers race (challenge load + nickname save)
async function ensureUser(){
  const id=await userId();
  if(id)return id;
  signingIn??=client().auth.signInAnonymously().then(({data,error})=>{if(error)throw error;return data.user!.id}).finally(()=>{signingIn=null});
  return signingIn;
}
// session only (no profile): needed to read a challenge before the player has picked a nickname
export const ensureSession=ensureUser;

export async function loadNick(){
  const id=await userId();
  if(!id)return null;
  const p=must(await client().from("profiles").select("nickname").eq("id",id).maybeSingle()) as {nickname:string}|null;
  return p?.nickname||null;
}
export async function saveNick(nick:string){
  const id=await ensureUser();
  must(await client().from("profiles").upsert({id,nickname:nick}));
  ls.set(NICK_KEY,nick);
}

// „Ištrinti mano duomenis" (003_delete_me.sql): server rows + the anonymous user, then this device's session.
export async function deleteMyData(){
  if(await userId())must(await client().rpc("delete_my_data"));
  await client().auth.signOut({scope:"local"}).catch(()=>{});
}

export async function myGroups(){return must(await client().from("groups").select("id,name,code,owner_id").order("created_at")) as Group[]}
export async function createGroup(name:string){return must(await client().rpc("create_group",{p_name:name})) as Group}
export async function joinGroup(code:string){return must(await client().rpc("join_group",{p_code:code})) as Group}
export async function leaveGroup(gid:string){
  const id=await userId();
  must(await client().from("group_members").delete().eq("group_id",gid).eq("user_id",id!));
}
export async function leaderboard(gid:string){return must(await client().rpc("group_leaderboard",{gid})) as LbRow[]}
export async function getChallenge(gameId:string){
  const rows=must(await client().rpc("get_challenge",{game_id:gameId})) as Challenge[];
  return rows?.[0]||null;
}

// Games are queued in localStorage first, so a game played offline reaches the leaderboard on the next online open.
// The id is generated client-side, so a retry after a lost response is a harmless duplicate (23505).
function pending():GameRow[]{try{const p=JSON.parse(ls.get(PENDING_KEY)||"[]");return Array.isArray(p)?p:[]}catch(e){return []}}
// true = on the server (or already there: 23505), false = dropped data error (22xxx/23xxx); throws on network/server errors
async function send(row:GameRow){
  const {error}=await client().from("games").insert(row);
  if(!error||error.code==="23505")return true;
  if(/^2[23]/.test(error.code||""))return false;
  throw error;
}
// resolves the ids that reached the server; a dropped row leaves the queue so it cannot block it
export async function flushGames(){
  const saved=new Set<string>();
  if(!sb||!(await userId()))return saved;
  for(const row of pending()){
    if(await send(row))saved.add(row.id);
    ls.set(PENDING_KEY,JSON.stringify(pending().filter(r=>r.id!==row.id)));
  }
  return saved;
}
export const queued=(id:string)=>pending().some(r=>r.id===id);
// resolves true ONLY when this row is confirmed on the server (the challenge link /?c=<id> is valid).
// Blocked localStorage = the queue cannot hold it, so it is sent directly (no retry later).
export async function saveGame(row:GameRow){
  ls.set(PENDING_KEY,JSON.stringify([...pending(),row].slice(-PENDING_MAX)));
  if(queued(row.id))return (await flushGames()).has(row.id);
  return !!sb&&!!(await userId())&&send(row);
}
