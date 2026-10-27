// Barjerinis bėgimas – rules (issue #14). PURE: no DOM (test/unit/hurdles.test.ts).
// 100 m with N_HURDLES hurdles. Run in place -> speed from the sprint cadence model (src/sprint/speed.ts). Before each
// hurdle: orange approach band, then a green take-off zone (same staged cue as the long jump). A take-off (from
// src/detect/takeoff.ts) that STARTED inside [H - ZONE_M, H + LATE_M] clears hurdle H: the runner hops over at its
// approach speed (best of the last APPROACH_S, like the long jump) and the hop's air time does not count against the
// cadence. No take-off in time = the hurdle is clipped: it falls and the runner keeps CLIP_KEEP of the speed (stumble,
// ~0.5 s lost at 3 steps/s). Never a disqualification. Score = the finish time; hurdles cleared x/N on the side.
// Hurdles at 16, 26 ... 86 m (10 m apart, ~1.3 s at 3 steps/s): no hop (landing <= H + ZONE_M) crosses a 10 m split.
import {runner,onStep,advance,K_SPEED,type Runner} from "../sprint/speed.ts";

export const N_HURDLES=8, FIRST_M=16, GAP_M=10;
export const HURDLES=Array.from({length:N_HURDLES},(_,i)=>FIRST_M+i*GAP_M);
export const ZONE_M=3;        // green take-off zone before each hurdle (~0.4 s at 7.8 m/s: jump on orange, take off on green)
export const APPROACH_M=4;    // orange "Ruoškis…" band before it
export const LATE_M=0.4;      // a take-off this far past the hurdle still counts (the feet left at the bar)
export const GRACE_S=0.25;    // the detector confirms ~120-200 ms after the feet left: wait this long past H + LATE_M
export const HOP_MIN=1;       // half the hop length at least (a take-off right at the bar still hops 2 m)
export const CLIP_KEEP=0.4;   // speed kept after clipping a hurdle
export const APPROACH_S=0.6;
export const MIN_T=0.6;       // take-offs in the first 0.6 s after the gun are ignored

// res[i]: true = cleared, false = clipped, null = not yet. at[i] = when it was decided (race time, for the animation).
// hop = the hop in progress: from x0 to x1 (m), the frozen speed v, take-off time t0.
export interface Hop{i:number;x0:number;x1:number;t0:number;v:number}
export interface Run{r:Runner;t:number;hist:number[];next:number;res:(boolean|null)[];at:number[];crossAt:number;hop:Hop|null}
export const newRun=():Run=>({r:runner(),t:0,hist:[],next:0,res:HURDLES.map(()=>null),at:HURDLES.map(()=>-1),crossAt:-1,hop:null});
export const cleared=(a:Run)=>a.res.filter(x=>x===true).length;

// a knee lift at race time t: ignored in the air and past the finish (the runner coasts)
export function stepAt(a:Run,t:number,leg:number){if(!a.hop&&a.r.fin==null)onStep(a.r,t,leg)}

// integrate to race time t; returns the index of a hurdle clipped in this frame, else -1
export function tick(a:Run,t:number,dt:number):number{
  a.t=t;
  const r=a.r,h=a.hop;
  if(h){
    const v=r.v;advance(r,t,dt);r.x+=(v-r.v)*dt;r.v=v; // in the air: speed frozen (advance still books splits / finish)
    if(r.x>=h.x1){
      // landed = a footfall: the air time must not read as "stopped", so the cadence window restarts at the take-off
      // tempo and the steps after the hop carry on from there (neither a slump nor a boost vs the flat sprint)
      // ponytail: two synthetic step times; a real "pause" in speed.ts if another game needs one
      const c=h.v/K_SPEED;r.ts=c>0?[t-1/c,t]:[];
      r.leg=-1;a.hop=null;
    }
  }else advance(r,t,dt);
  const hs=a.hist;hs.push(t,r.x,r.v);
  while(hs.length>3&&hs[0]<t-2)hs.splice(0,3);
  const i=a.next;
  if(i>=N_HURDLES||a.res[i]!=null)return -1;
  if(a.crossAt<0&&r.x>=HURDLES[i]+LATE_M)a.crossAt=t;
  if(a.crossAt>=0&&t-a.crossAt>GRACE_S){
    a.res[i]=false;a.at[i]=t;a.next++;a.crossAt=-1;
    r.v*=CLIP_KEEP;
    return i;
  }
  return -1;
}
// runner position / approach speed at an earlier race time (history = flat [t, x, v] triples)
export function xAt(a:Run,t:number){
  const h=a.hist;
  if(!h.length)return a.r.x;
  if(t<=h[0])return h[1];
  for(let i=3;i<h.length;i+=3)if(h[i]>=t){const f=(t-h[i-3])/((h[i]-h[i-3])||1);return h[i-2]+(h[i+1]-h[i-2])*f}
  return h[h.length-2];
}
export function vBefore(a:Run,t:number){
  let v=0;const h=a.hist;
  for(let i=0;i<h.length;i+=3)if(h[i]<=t+1e-9&&h[i]>=t-APPROACH_S)v=Math.max(v,h[i+2]);
  return v||a.r.v;
}
// zone of the next hurdle at x: "go" = green take-off zone, "ready" = orange approach, "" = neither
export function cue(a:Run,x=a.r.x):""|"ready"|"go"{
  if(a.hop||a.next>=N_HURDLES||a.r.fin!=null)return "";
  const g=HURDLES[a.next]-x;
  return g<-LATE_M?"":g<=ZONE_M?"go":g<=ZONE_M+APPROACH_M?"ready":"";
}
// a confirmed take-off that started at race time tTake. "ok" = clears the next hurdle (a.hop set), "early" = in the
// orange band (ignored, a hint), "" = ignored (in the air, too soon, between hurdles, past the finish)
export function jump(a:Run,tTake:number):""|"ok"|"early"{
  const i=a.next;
  if(a.hop||tTake<MIN_T||i>=N_HURDLES||a.r.fin!=null)return "";
  const x=xAt(a,tTake),gap=HURDLES[i]-x;
  if(gap<-LATE_M)return "";
  if(gap>ZONE_M)return gap<=ZONE_M+APPROACH_M?"early":"";
  const v=vBefore(a,tTake),w=Math.max(HOP_MIN,gap);
  a.res[i]=true;a.at[i]=a.t;a.next++;a.crossAt=-1;
  a.hop={i,x0:x,x1:HURDLES[i]+w,t0:tTake,v};a.r.v=v;
  return "ok";
}
// height of the hop at x, 0..1 (a parabola, centred on the hurdle when the take-off was >= HOP_MIN before it)
export const hopLift=(h:Hop,x:number)=>{const u=(x-h.x0)/((h.x1-h.x0)||1);return u<=0||u>=1?0:4*u*(1-u)};
