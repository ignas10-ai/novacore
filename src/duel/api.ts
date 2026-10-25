// Remote duels, NO DOM (supabase/migrations/002_duels.sql): RPC wrappers + the pure helpers that tools/duel-check.mjs tests.
// Writes go only through the RPCs (RLS: only the two players can read a duel). Realtime channel `duel:<id>` is private.
import {sb} from "../online/api.ts";

export interface DuelSettings{duration:number;exercises:string[];seed:number}
export interface Duel{id:string;group_id:string;from_user:string;to_user:string;status:string;settings:DuelSettings;created_at:string;from_score:number|null;to_score:number|null;winner:string|null}
export interface Invite{id:string;group_id:string;from_user:string;nickname:string;settings:DuelSettings;created_at:string}

export const INVITE_MS=10*60e3; // = the 10 min in respond_duel / pending_duels
export const SCORE_MS=250;      // own score is broadcast at most 4x/s, and only when it changed
export const START_LEAD_MS=3000;// host announces the start this far ahead

const must=<T>(r:{data:T;error:any})=>{if(r.error)throw r.error;return r.data};
const c=()=>{if(!sb)throw new Error("offline");return sb};
export const invite=async(group:string,to:string,duration:number,exercises:string[])=>must(await c().rpc("invite_duel",{p_group:group,p_to:to,p_duration:duration,p_exercises:exercises})) as Duel;
export const respond=async(id:string,accept:boolean)=>must(await c().rpc("respond_duel",{p_id:id,p_accept:accept})) as Duel;
export const cancel=async(id:string)=>must(await c().rpc("cancel_duel",{p_id:id})) as Duel|null;
export const start=async(id:string)=>must(await c().rpc("start_duel",{p_id:id})) as Duel;
export const finish=async(id:string,score:number)=>must(await c().rpc("finish_duel",{p_id:id,p_score:Math.min(2000,Math.max(0,score|0))})) as Duel;
export const pending=async()=>(must(await c().rpc("pending_duels")) as Invite[])||[];

// LT message for a duel failure (falls back to the general online messages)
export function duelErr(e:any,general:(e:any)=>string){
  const m=String(e?.message||e||"");
  if(/duel_not_member/.test(m))return "Draugas nebe šios kompanijos narys.";
  if(/duel_closed|duel_not_found/.test(m))return "Šis kvietimas nebegalioja.";
  if(/duel_rate/.test(m))return "Per daug kvietimų. Pabandyk po valandos.";
  if(/duel_bad/.test(m))return "Netinkami dvikovos nustatymai.";
  return general(e);
}

// PURE: clock offset (opponent clock - my clock) from ping/pong samples; the fastest round trip is the least skewed one.
// t0 = my send time, t = their reply time (their clock), t1 = my receive time.
export function clockOffset(samples:{t0:number;t:number;t1:number}[]){
  let best:{off:number;rtt:number}|null=null;
  for(const s of samples){const rtt=s.t1-s.t0;if(rtt<0)continue;const off=s.t-(s.t0+s.t1)/2;if(!best||rtt<best.rtt)best={off,rtt}}
  return best;
}
// PURE: the first exercise index for both phones (same seed -> same order; game.ts cycles from there)
export const seedShift=(seed:number,n:number)=>n>0?Math.abs(Math.trunc(seed))%n:0;
// PURE: is a pending invite still valid (client side, the server checks again on respond)
export const fresh=(createdAt:string,now:number)=>now-Date.parse(createdAt)<INVITE_MS;
