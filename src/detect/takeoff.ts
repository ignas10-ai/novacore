// Take-off detector for Šuolis į tolį (src/longjump). PURE: no DOM (unit tests + tools import it).
// The long jump needs the MOMENT the feet leave the floor (not the landing like step(...,"squatjump")), right after
// running in place. Same physics as the squat-jump branch in step.ts, without its squat gate (a run-up jump does
// not start from a deep squat):
//   main: BOTH ankles rise TK_AIR torso above their own floors with both knees level (running lifts one knee at a time,
//         the support foot stays down), held for TK_HOLD ms -> take-off at the first airborne frame. 120 ms: running
//         with hops (knees2.json 7.3 s) stays airborne ~90-110 ms with level knees; real jumps 250-500 ms.
//   fallback (ankles not visible / foot tracking misses): the hip mid rises TK_HIP torso above the HIGHEST hip of
//         the window [now-TK_WIN, now-TK_GAP] (running bob included, the rise itself excluded), held TK_HOLD ms.
//         An EMA baseline sank during a squat and fired on standing up; running hops lift the hip <= 0.3 torso
//         above that top (knees*.json), real jumps 0.5-1.2 (squatjump*.json).
// Returns the take-off time (ms, the first airborne frame) once confirmed, else 0. Re-arms after landing, so a
// jump the game ignores (too far from the board) does not block a real one later.
import {VIS} from "./exercises.ts";
import type {Lm} from "./classifier.ts";

export const TK_AIR=0.12, TK_LAND=0.06, TK_LEVEL=0.3, TK_HOLD=120, TK_REBASE=600, TK_HIP=0.45, TK_WIN=1500, TK_GAP=350, TK_SWAP=0.5;
// floor = per ankle (a front camera sees one foot planted lower than the other: knees.json plants L at 0.85, R at 0.89)
export interface TakeoffState{floor:[number,number]|null;hs:number[];airAt:number;air:boolean;how:""|"feet"|"hip";hiAt:number;px:number|null}
export const takeoffState=():TakeoffState=>({floor:null,hs:[],airAt:0,air:false,how:"",hiAt:0,px:null});

const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;
export function takeoff(s:TakeoffState,lm:Lm[],now:number):number{
  if(![11,12,23,24].every(j=>ok(lm[j])))return 0; // no torso = no scale; keep the state for the next good frame
  const h=Math.abs((lm[23].y+lm[24].y)/2-(lm[11].y+lm[12].y)/2)||0.3;
  const hip=(lm[23].y+lm[24].y)/2, px=(lm[23].x+lm[24].x)/2;
  // the body jumped sideways by more than half a torso in one frame = the tracker switched to another person (or
  // lost and re-found this one): every baseline is someone else's, start over
  if(s.px!=null&&Math.abs(px-s.px)>h*TK_SWAP){s.floor=null;s.hs.length=0;s.air=false;s.hiAt=0}
  s.px=px;
  const feet=[25,26,27,28].every(j=>ok(lm[j]));
  // image y grows downward: lift = how far each ankle is above its own floor; the jump = the LOWER lift
  const lift=feet&&s.floor?Math.min(s.floor[0]-lm[27].y,s.floor[1]-lm[28].y):-1;
  const level=feet&&Math.abs(lm[25].y-lm[26].y)/h<TK_LEVEL;
  const upFeet=level&&lift>h*TK_AIR;
  // hip history as flat [t, y, t, y, ...] pairs; top = highest hip (smallest y) inside the window
  const hs=s.hs;hs.push(now,hip);
  while(hs.length&&hs[0]<now-TK_WIN)hs.splice(0,2);
  let top=Infinity;for(let i=0;i<hs.length&&hs[i]<=now-TK_GAP;i+=2)top=Math.min(top,hs[i+1]);
  const upHip=top<Infinity&&hip<top-h*TK_HIP;
  if(upFeet||upHip){
    if(!s.air){s.air=true;s.airAt=now;s.how=""}
    if(!s.how&&now-s.airAt>=TK_HOLD){s.how=upFeet?"feet":"hip";return s.airAt}
    return 0;
  }
  s.air=false;
  if(!feet)return 0;
  if(!s.floor){s.floor=[lm[27].y,lm[28].y];return 0}
  // each floor moves only while its foot is near/below it (EMA, not max: one noisy low frame must not sink it; a
  // take-off rising over several frames must not drag it up - the squat-jump lesson from detect-v5)
  for(const k of [0,1]){const y=lm[27+k].y;if(y>s.floor[k]-h*TK_LAND)s.floor[k]=s.floor[k]*0.7+y*0.3}
  // both feet above their floors with level knees far longer than any flight = the player moved back: re-base
  if(level&&lift>h*TK_LAND){if(!s.hiAt)s.hiAt=now;else if(now-s.hiAt>TK_REBASE){s.floor=[lm[27].y,lm[28].y];s.hiAt=0}}
  else s.hiAt=0;
  return 0;
}
