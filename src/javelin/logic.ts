// Iečio metimas – rules (spec: Martynas, issue #4, implementation #31). PURE: no DOM, no storage
// (test/unit/javelin.test.ts).
//
// One thrower in front of the camera at a time (1-4 players take turns, like Šuolis į tolį):
//   1. The player picks the throwing arm by holding it out to its own side. Each side has a ring that fills in
//      HAND_FILL_S (2 s); switching sides drains the other ring. A full ring locks the hand (12 s without a choice =
//      the fuller side is used).
//   2. A SHORT run-up (LINE_M = 14 m, less than half of the long jump's 30 m) on the sprint cadence model, the javelin
//      hand held at the shoulder / slightly above.
//   3. At the line, swing the throwing arm forward. A release that started after the line (or a run past the line
//      without a throw) = foul. A release more than EARLY_M before the line is ignored ("Per anksti!"), so the player
//      keeps running; a throw inside the last metres is valid but the early gap is subtracted, like the long jump.
//   4. Distance = f(arm height at the release, swing speed, approach speed), measured from the line, cut DOWN to the
//      centimetre. 3 attempts each; the winner has the biggest TOTAL of valid throws (ties: best, then 2nd, then 3rd).
//
// Distance model (raw throw, before the early gap):
//   8 m + 38 m * armHeight/H_MAX + 34 m * (swingSpeed-S_MIN)/(S_MAX-S_MIN) + 6 m * v/V_CAP, cap 86 m.
//   arm height = the highest wrist above its shoulder in the wind-up (0 = at the shoulder, 0.7 = a full overhead
//   reach). swing speed = the peak 3D wrist speed during the forward swing (torso/s), z included when MediaPipe
//   provides it (fallback = the 2D downward speed alone). approach = the runner speed when the swing started.
import {runner,onStep,advance,type Runner} from "../sprint/speed.ts";
import {VIS} from "../detect/exercises.ts";
import type {Lm} from "../detect/classifier.ts";

// ---------- runway / attempt ----------
export const LINE_M=14;        // short run-up: ~2.5-4 s at 2-3 steps/s (vs 30 m in the long jump)
export const ZONE_M=2.2;       // green "Mesk!" band before the line (~0.3 s at full speed)
export const APPROACH_M=4;     // orange "Ruoškis…" band before it
export const ATTEMPTS=3;
export const EARLY_M=4;        // a swing that starts farther than this from the line is ignored, not a throw
export const LIMIT_S=12;       // no throw by then = foul ("Neišmetė")
export const GRACE_S=0.3;      // after crossing the line wait this long for a confirmed swing that started before it
export const MIN_T=0.6;        // swings in the first 0.6 s after "Bėk!" are ignored

// ---------- distance model (metres) ----------
export const D_BASE=8, D_ARM=38, D_SWING=34, D_RUN=6, D_MAX=86;
export const H_MAX=0.7;        // torso units: wrist above the shoulder (0.7 = overhead)
export const S_MIN=1.2, S_MAX=9; // torso/s: wrist speed at the start / at a full throw
export const V_CAP=11.5;       // m/s: same cap as the sprint model
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
export const throwDist=(armHeight:number,swingSpeed:number,approach:number)=>{
  const h=clamp(armHeight/H_MAX,0,1);
  const s=clamp((swingSpeed-S_MIN)/(S_MAX-S_MIN),0,1);
  const v=clamp(approach/V_CAP,0,1);
  return Math.min(D_MAX,D_BASE+D_ARM*h+D_SWING*s+D_RUN*v);
};
// final distance measured from the line: gap = line - release point (m, >= 0). null = past the line = foul.
export function throwScore(armHeight:number,swingSpeed:number,approach:number,gap:number):number|null{
  if(!(gap>=0))return null;
  return Math.floor(Math.max(0,throwDist(armHeight,swingSpeed,approach)-gap)*100+1e-6)/100;
}

// ---------- body / hand geometry (mirrored screen space, frame-height units) ----------
export const HAND_OUT=0.32;    // a wrist this far outside its shoulder picks that hand
export const HAND_UP=0.18;     // ... while above the shoulder (a hanging arm never picks)
export const HAND_FILL_S=2;    // the ring fills in 2 s (Martyno spec)
export const HAND_DRAIN_S=1.1; // switching sides drains the other ring
export const HAND_IDLE_S=3;    // no arm out: both rings slowly drain
export const HAND_AUTO_S=12;   // no full ring by then = the fuller side is used
export interface Wrist{ok:boolean;x:number;y:number;z:number;out:number;up:boolean;h:number;xr:number} // z = relative to the shoulder
export interface Body{sx:number;sy:number;sw:number;u:number;lean:number;wr:[Wrist,Wrist]}
const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;

// mirror x (the preview is mirrored), y stays; both in frame-height units, so x/y/z share one scale.
export function readBody(lm:Lm[],ar:number):Body|null{
  const a=lm?.[11],b=lm?.[12];
  if(!ok(a)||!ok(b))return null;
  const ax=(1-a.x)*ar,bx=(1-b.x)*ar,sy=(a.y+b.y)/2,sx=(ax+bx)/2,sw=Math.hypot(ax-bx,a.y-b.y);
  let u=sw*1.3,hx=sx,hy=sy+u;
  const h1=lm[23],h2=lm[24];
  if(ok(h1)&&ok(h2)){
    hx=((1-h1.x)+(1-h2.x))/2*ar;hy=(h1.y+h2.y)/2;
    u=Math.max(Math.hypot(hx-sx,hy-sy),sw);
  }
  if(!(u>0.04))return null;
  const wr:[Wrist,Wrist]=[0,1].map(k=>{
    const s=k?b:a,w=k?lm[16]:lm[15],e=k?lm[14]:lm[13];
    if(!ok(s)||!ok(w)||!ok(e))return {ok:false,x:0,y:0,z:0,out:0,up:false,h:0,xr:0};
    const sx2=(1-s.x)*ar,sy2=s.y,wx=(1-w.x)*ar,wy=w.y;
    const zw=w.z,zs0=s.z;
    const z=typeof zw==="number"&&Number.isFinite(zw)?zw:0,zs=typeof zs0==="number"&&Number.isFinite(zs0)?zs0:0;
    const xr=(wx-sx2)/u, h=(sy2-wy)/u, zr=((z-zs)*ar)/u;
    return {ok:true,x:wx,y:wy,z:zr,out:xr*(k?1:-1),up:wy<sy2+HAND_UP*u,h,xr};
  }) as [Wrist,Wrist];
  return {sx,sy,sw,u,lean:clamp((sx-hx)/u,-1,1),wr};
}
// the arm held out to its own side; the further one wins, a near-tie (both out) is not a choice
export function activeHand(b:Body|null):0|1|null{
  if(!b)return null;
  const [l,r]=b.wr,lo=l.ok&&l.up&&l.out>HAND_OUT,ro=r.ok&&r.up&&r.out>HAND_OUT;
  if(lo&&ro)return Math.abs(l.out-r.out)>0.12?(l.out>r.out?0:1):null;
  return lo?0:ro?1:null;
}

export interface HandPick{fill:[number,number];chosen:0|1|null;at:number;start:number;last:number;auto:boolean}
export const newHandPick=():HandPick=>({fill:[0,0],chosen:null,at:0,start:-1,last:0,auto:false});
// returns the chosen hand (0 = anatomical left, 1 = right), null while still filling
export function updateHandPick(p:HandPick,b:Body|null,now:number):0|1|null{
  const dt=Math.min(0.2,Math.max(0,(now-p.last)/1000));p.last=now;
  if(p.start<0)p.start=now;
  if(p.chosen!=null)return p.chosen;
  const f=p.fill,a=activeHand(b);
  if(a!=null){
    f[a]=Math.min(1,f[a]+dt/HAND_FILL_S);
    f[1-a]=Math.max(0,f[1-a]-dt/HAND_DRAIN_S);
  }else{
    f[0]=Math.max(0,f[0]-dt/HAND_IDLE_S);f[1]=Math.max(0,f[1]-dt/HAND_IDLE_S);
  }
  if(f[0]>=1||f[1]>=1){p.chosen=f[0]>=f[1]?0:1;p.at=now;return p.chosen}
  if(now-p.start>=HAND_AUTO_S*1000){p.chosen=f[0]>f[1]?0:1;p.at=now;p.auto=true;return p.chosen}
  return null;
}

// ---------- one attempt ----------
export type AttemptState="run"|"fly"|"foul";
export type FoulWhy=""|"line"|"none";
export interface Throw{t:number;x:number;v:number;h:number;s:number;gap:number;dist:number;raw:number}
export interface Swing{t:number;h:number;peak:number;z:number;x:number}
export interface Arm{t:number;x:number;h:number;z:number} // wrist relative to its shoulder, torso units
export interface Attempt{r:Runner;t:number;hist:number[];state:AttemptState;crossAt:number;take:Throw|null;why:FoulWhy;
  side:0|1;prev:Arm|null;hs:number[];swing:Swing|null;earlyAt:number;holdAt:number;cocked:boolean}
export const newAttempt=(side:0|1):Attempt=>({r:runner(),t:0,hist:[],state:"run",crossAt:-1,take:null,why:"",side,prev:null,hs:[],swing:null,earlyAt:0,holdAt:0,cocked:false});

// a knee lift (leg 0/1) at attempt time t; ignored once the javelin is released or the attempt is a foul
export function stepAt(a:Attempt,t:number,leg:number){if(a.state==="run")onStep(a.r,t,leg)}
// integrate to attempt time t; returns true when this frame turned the attempt into a foul
export function tick(a:Attempt,t:number,dt:number):boolean{
  a.t=t;
  if(a.state!=="run")return false;
  advance(a.r,t,dt);
  const h=a.hist;h.push(t,a.r.x,a.r.v);
  while(h.length>3&&h[0]<t-2)h.splice(0,3);
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
  for(let i=0;i<h.length;i+=3)if(h[i]<=t+1e-9&&h[i]>=t-0.6)v=Math.max(v,h[i+2]);
  return v||a.r.v;
}

// ---------- swing detector ----------
// A javelin throw is NOT any wrist movement. The player must first HOLD the javelin steady at/above the shoulder
// (~0.15 s), and then make a real swing: a sudden forward/down motion with enough travel and peak speed. Merely
// running with the arm up (the reported bug), or a small bounce, never releases.
export const HOLD_Y=-0.08;      // wrist at/above the shoulder
export const HOLD_SPEED=1.2;    // torso/s: steady enough to be "holding the javelin"
export const HOLD_S=0.15;       // s: a steady hold this long arms the throw
export const BACK_Z=0.08;       // z behind the shoulder also arms it (when MediaPipe z is usable)
export const BACK_H=0.50;       // fallback: wrist this high above the shoulder arms it
export const SWING_START=1.2;   // torso/s: a real swing starts faster than a run bounce
export const SWING_MIN=1.8;     // torso/s: a half/natural swing still releases; a run bounce stays below
export const RELEASE_Z=0.05;    // forward wrist travel from the swing start (torso)
export const RELEASE_Y=0.12;    // or down travel; down-only needs an even faster peak
export const RELEASE_MIN=0.08;  // s: the swing cannot release faster than this
export const RELEASE_H0=-0.10;  // the swing must start near/above the shoulder (not a low running arm swing)
export const RELEASE_LOW=-0.42; // the release itself cannot be at hip level (a running arm swing ends there)
export const RELEASE_X=0.025;    // fallback (no usable z): the wrist must also move across/forward, not just bounce
export const SWING_MAX=26;      // torso/s: above this it is a MediaPipe z glitch, not a human wrist
export const Z_LIMIT=0.9;       // torso: the wrist cannot be this far in front/behind its own shoulder
export const SWING_TIMEOUT=0.9; // s: no release by then = a practice swing, re-arm
export const HEIGHT_WIN=0.6;    // s: the arm-height peak is looked up in this window before the swing
export const EARLY_COOL=0.8;    // s: one "Per anksti!" per attempt, not every frame

// Feed the chosen wrist for the current pose frame. "ok" = the javelin was released (a.take is filled),
// "foul" = past the line, "early" = too far from the line (ignored, keep running), "" = nothing yet.
export function throwArm(a:Attempt,arm:Arm|null):""|"ok"|"foul"|"early"{
  if(a.state!=="run")return "";
  if(arm&&arm.t<MIN_T)return ""; // still leaving the start: no throw yet
  if(!arm){a.prev=null;a.holdAt=0;a.cocked=false;a.swing=null;return ""}
  const prev=a.prev;a.prev=arm;
  const hs=a.hs;hs.push(arm.t,arm.h);
  while(hs.length&&hs[0]<arm.t-HEIGHT_WIN)hs.splice(0,2);
  if(!prev)return "";
  const dt=arm.t-prev.t;
  if(!(dt>0&&dt<=0.5))return "";
  const vx=(arm.x-prev.x)/dt,vh=(arm.h-prev.h)/dt,vz=(arm.z-prev.z)/dt;
  const speed=Math.hypot(vx,vh,vz);
  if(speed>SWING_MAX||Math.abs(arm.z)>Z_LIMIT||Math.abs(arm.h)>1.5){ // tracking glitch: never a throw, start over
    a.prev=null;a.swing=null;a.cocked=false;a.holdAt=0;return "";
  }
  const down=Math.max(0,-vh),fwd=Math.max(0,-vz); // y grows down; z grows away from the camera
  const holding=arm.h>=HOLD_Y&&speed<HOLD_SPEED;
  // Arm only after a steady hold, or a clear back/overhead position. A running bounce is neither.
  if(!a.cocked&&!a.swing){
    if(holding){
      if(!a.holdAt)a.holdAt=prev.t;
      if(arm.t-a.holdAt>=HOLD_S)a.cocked=true;
    }else a.holdAt=0;
    if(!a.cocked&&speed<SWING_START*.7&&(arm.z>=BACK_Z||arm.h>=BACK_H))a.cocked=true;
  }
  if(a.cocked&&!a.swing){
    if(speed>=SWING_START&&(fwd>=SWING_START*.45||down>=SWING_START*.45)){
      let peak=-1;for(let i=1;i<hs.length;i+=2)peak=Math.max(peak,hs[i]);
      a.swing={t:prev.t,h:peak,z:prev.z,x:prev.x,peak:speed};
    }else if(!holding&&arm.h<-0.15&&speed<SWING_START*.5){
      a.cocked=false;a.holdAt=0; // the arm was lowered without a throw: re-arm on the next hold
    }
  }
  if(!a.swing)return "";
  const sw=a.swing;
  sw.peak=Math.max(sw.peak,speed);sw.h=Math.max(sw.h,arm.h);
  if(arm.t-sw.t>SWING_TIMEOUT){a.swing=null;a.cocked=false;a.holdAt=0;return ""}
  if(sw.peak<SWING_MIN||arm.t-sw.t<RELEASE_MIN)return "";
  const fwdTravel=sw.z-arm.z,downTravel=sw.h-arm.h;
  const zKnown=Math.abs(sw.z)>0.02||Math.abs(arm.z)>0.02;
  // Forward depth is the best throw signal. Without usable z, require a down + across swing; a vertical running
  // bounce has no x travel and is rejected. A run bounce below SWING_MIN never gets here.
  const xTravel=Math.abs(arm.x-sw.x);
  const release=sw.h>=RELEASE_H0&&arm.h>=RELEASE_LOW&&(zKnown
    ?fwdTravel>=RELEASE_Z
    :(downTravel>=RELEASE_Y&&xTravel>=RELEASE_X&&sw.peak>=SWING_MIN));
  if(!release)return "";
  const x=xAt(a,sw.t),gap=LINE_M-x;
  if(gap<0){a.state="foul";a.why="line";a.take={t:sw.t,x,v:vBefore(a,sw.t),h:sw.h,s:sw.peak,gap,dist:0,raw:0};return "foul"}
  if(gap>EARLY_M){a.swing=null;a.earlyAt=arm.t;return "early"}
  const v=vBefore(a,sw.t),raw=throwDist(sw.h,sw.peak,v),dist=throwScore(sw.h,sw.peak,v,gap)!;
  a.state="fly";
  a.take={t:sw.t,x,v,h:sw.h,s:sw.peak,gap,dist,raw};
  return "ok";
}

// ---------- series: 1-4 players x 3 attempts, rotating (P1, P2, ... then round 2) ----------
export const total=(n:number)=>n*ATTEMPTS;
export const turnOf=(k:number,n:number)=>({round:Math.floor(k/n),player:k%n});
// throws[p] = up to 3 results, null = foul. Ranking: the TOTAL of valid throws (Martyno spec: "daugiausiai į tolį
// per visus bandymus"), ties by the best, then the 2nd, then the 3rd; all fouls = no place, listed last.
export interface Rank{i:number;total:number;best:number|null;place:number|null}
const valid=(js:(number|null)[])=>js.filter((d):d is number=>d!=null);
export const totalOf=(js:(number|null)[])=>valid(js).reduce((a,b)=>a+b,0);
export const bestOf=(js:(number|null)[])=>{const v=valid(js).sort((a,b)=>b-a);return v[0]??null};
const cmp=(a:(number|null)[],b:(number|null)[])=>{
  const va=valid(a),vb=valid(b);
  if(!va.length||!vb.length)return va.length? -1:vb.length? 1:0;
  const ta=va.reduce((x,y)=>x+y,0),tb=vb.reduce((x,y)=>x+y,0);
  if(ta!==tb)return tb-ta;
  const sa=va.sort((x,y)=>y-x),sb=vb.sort((x,y)=>y-x);
  for(let k=0;k<ATTEMPTS;k++){const d=(sb[k]??-1)-(sa[k]??-1);if(d)return d}
  return 0;
};
export function rank(throws:(number|null)[][]):Rank[]{
  const order=throws.map((_,i)=>i).sort((a,b)=>cmp(throws[a],throws[b])||a-b);
  const out:Rank[]=[];
  order.forEach((i,k)=>{
    const best=bestOf(throws[i]),tot=totalOf(throws[i]),has=valid(throws[i]).length>0;
    const prev=out[k-1];
    const place=!has?null:prev&&prev.place!=null&&cmp(throws[order[k-1]],throws[i])===0?prev.place:k+1;
    out.push({i,total:tot,best,place});
  });
  return out;
}

// flight drawing: duration and apex height for a throw of this length (m from the release point)
export const flightS=(len:number)=>0.85+0.02*len;
export const apexM=(len:number)=>3+0.11*len;
