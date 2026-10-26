// Šuolis į tolį – rules (spec: Martynas, 2026-10-26). PURE: no DOM (test/unit/longjump.test.ts).
// Run in place -> the mascot runs down a LINE_M runway (speed = the sprint cadence model, src/sprint/speed.ts) ->
// jump (take-off from src/detect/takeoff.ts) before the line. Touching/crossing the line = foul (X). Distance is
// measured FROM THE LINE like real long jump: jumping early still counts but loses the gap.
//   distance = max(0, best(v) - gap),  best(v) = min(8.95, 1.6 + 0.64·v),  gap = line - take-off point (m, >= 0)
// v = approach speed = the highest runner speed in the last APPROACH_S before take-off (the crouch into the jump
// costs a step or two of cadence; real jumpers are judged on their approach too). Deterministic, no randomness.
//   cadence (steps/s)  speed (m/s)  best jump (take-off right at the line)
//   1.0                2.6          3.26 m
//   1.5                3.9          4.09 m
//   2.0                5.2          4.92 m
//   2.5                6.5          5.76 m
//   3.0                7.8          6.59 m
//   3.5                9.1          7.42 m
//   4.0               10.4          8.25 m
//   4.4+              11.5 (cap)    8.95 m (world record 8.95 m = the ceiling)
// Standing still (v 0) = 1.6 m. Distances are cut DOWN to the centimetre (official measuring).
import {runner,onStep,advance,type Runner} from "../sprint/speed.ts";

export const LINE_M=30;        // runway to the foul line: ~4-6 s at 2-3 steps/s (sprint model with its acceleration)
export const ZONE_M=2;         // highlighted take-off zone before the line
export const PIT_M=0.6;        // sand starts this far past the line
export const ATTEMPTS=3;
export const D_MAX=8.95, D_BASE=1.6, D_K=0.64;
export const APPROACH_S=0.6;
export const IGNORE_GAP=4;     // a take-off further than this from the line is ignored ("Per anksti!", keep running): a detector
                               // glitch mid-run must not end the attempt (headless y4m with two people: a pose swap at 8 m)
export const GRACE_S=0.3;      // after crossing the line wait this long for a confirmed take-off from before the line
export const LIMIT_S=16;       // no jump by then = a foul ("nešokta")
export const MIN_T=0.6;        // take-offs in the first 0.6 s after "Bėk!" are ignored

export const bestJump=(v:number)=>Math.min(D_MAX,Math.max(0,D_BASE+D_K*Math.max(0,v)));
// null = foul (take-off past the line)
export function jumpDist(v:number,gap:number):number|null{
  if(!(gap>=0))return null;
  return Math.floor(Math.max(0,bestJump(v)-gap)*100+1e-6)/100;
}

// ---------- one attempt ----------
export type AttemptState="run"|"air"|"foul";
export type FoulWhy=""|"line"|"none";
export interface Take{t:number;x:number;v:number;gap:number;dist:number}
export interface Attempt{r:Runner;t:number;hist:number[];state:AttemptState;crossAt:number;take:Take|null;why:FoulWhy}
export const newAttempt=():Attempt=>({r:runner(),t:0,hist:[],state:"run",crossAt:-1,take:null,why:""});

// a knee lift (leg 0/1) at attempt time t; ignored once the jumper is in the air or fouled
export function stepAt(a:Attempt,t:number,leg:number){if(a.state==="run")onStep(a.r,t,leg)}
// integrate to attempt time t; returns true when this frame turned the attempt into a foul
export function tick(a:Attempt,t:number,dt:number):boolean{
  a.t=t;
  if(a.state==="air")return false;
  advance(a.r,t,dt);
  const h=a.hist;h.push(t,a.r.x,a.r.v);
  while(h.length>3&&h[0]<t-2)h.splice(0,3);
  if(a.state!=="run")return false;
  if(a.crossAt<0&&a.r.x>=LINE_M)a.crossAt=t;
  if(a.crossAt>=0&&t-a.crossAt>GRACE_S){a.state="foul";a.why="line";return true}
  if(t>LIMIT_S){a.state="foul";a.why="none";return true}
  return false;
}
// runner position / approach speed at an earlier time (history = flat [t, x, v] triples)
export function xAt(a:Attempt,t:number){
  const h=a.hist;
  if(!h.length)return a.r.x;
  if(t<=h[0])return h[1];
  for(let i=3;i<h.length;i+=3)if(h[i]>=t){const f=(t-h[i-3])/((h[i]-h[i-3])||1);return h[i-2]+(h[i+1]-h[i-2])*f}
  return h[h.length-2];
}
export function vBefore(a:Attempt,t:number){
  let v=0;const h=a.hist;
  for(let i=0;i<h.length;i+=3)if(h[i]<=t+1e-9&&h[i]>=t-APPROACH_S)v=Math.max(v,h[i+2]);
  return v||a.r.v;
}
// a confirmed take-off that started at attempt time tTake. "ok" = valid jump (a.take filled), "foul" = past the line,
// "early" = too far from the line (ignored, keep running), "" = not running any more / too soon after the start
export function jump(a:Attempt,tTake:number):""|"ok"|"foul"|"early"{
  if(a.state!=="run"||tTake<MIN_T)return "";
  const x=xAt(a,tTake),gap=LINE_M-x;
  if(gap>IGNORE_GAP)return "early";
  const v=vBefore(a,tTake),d=jumpDist(v,gap);
  if(d==null){a.state="foul";a.why="line";a.take={t:tTake,x,v,gap,dist:0};return "foul"}
  a.state="air";a.take={t:tTake,x,v,gap,dist:d};
  return "ok";
}

// ---------- series: 1-4 players x 3 attempts, rotating (P1, P2, ... then round 2) ----------
export const total=(n:number)=>n*ATTEMPTS;
export const turnOf=(k:number,n:number)=>({round:Math.floor(k/n),player:k%n});
// jumps[p] = up to 3 results, null = foul. Ranking: best valid jump, ties by the 2nd best, then the 3rd (real rule);
// a player with only fouls has no place (null) and is listed last. Equal on all three = shared place.
export interface Rank{i:number;best:number|null;place:number|null}
const sorted=(js:(number|null)[])=>js.filter((d):d is number=>d!=null).sort((a,b)=>b-a);
function cmp(a:(number|null)[],b:(number|null)[]){
  const x=sorted(a),y=sorted(b);
  for(let k=0;k<ATTEMPTS;k++){const d=(y[k]??-1)-(x[k]??-1);if(d)return d}
  return 0;
}
export function rank(jumps:(number|null)[][]):Rank[]{
  const order=jumps.map((_,i)=>i).sort((a,b)=>cmp(jumps[a],jumps[b])||a-b);
  const out:Rank[]=[];
  order.forEach((i,k)=>{
    const best=sorted(jumps[i])[0]??null;
    const prev=out[k-1];
    const place=best==null?null:prev&&prev.place!=null&&cmp(jumps[order[k-1]],jumps[i])===0?prev.place:k+1;
    out.push({i,best,place});
  });
  return out;
}
export const bestOf=(js:(number|null)[])=>sorted(js)[0]??null;
// flight drawing: duration and apex height for a jump of this length (m from take-off)
export const flightS=(len:number)=>0.42+0.07*len;
export const apexM=(len:number)=>0.35+0.1*len;
