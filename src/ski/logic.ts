// Slidinėjimas – rules, the generated course and the ski physics (issue #23, idea #4; two-player race #30). PURE:
// no DOM, no storage (test/unit/ski.test.ts). One skier at a time in solo/turn-based modes; in the 2-player race
// two Skier objects use the same course, each with its own controls and camera. Lean left/right to steer, pull
// arms down like ski poles to speed up, lean back to brake. The course is a seeded downhill ribbon with snow walls,
// centre line and slalom gates. Passing a gate cleanly counts; passing outside it costs MISS_PENALTY seconds;
// hitting a flag stops the skier dead (CRASH_S); every second outside the boundary line is added as a time
// penalty. Final time = raw time + time out of bounds + missed gates × MISS_PENALTY. Fastest final time wins.
import {VIS} from "../detect/exercises.ts";
import type {Lm} from "../detect/classifier.ts";

// ---------- course ----------
export const COURSE_M=400;       // finish line distance down the slope
export const HALF_W=7.0;         // boundary line half-width (m)
export const SOFT_W=2.2;         // deep snow outside it before the hard snow wall
export const GATE_FIRST=45;      // first gate (issue #30: shorter run-up than 55 m)
export const GATE_EVERY=30;      // gate spacing (m); 12 gates on the 400 m course
export const GATE_HALF=2.1;      // half the gate span (pole to pole = 4.2 m, was 5.4 m)
export const POLE_HIT=0.75;      // skier + pole radius (m): closer than this = you hit the flag
export const MISS_PENALTY=2;     // seconds added for every missed gate
export const LIMIT_S=120;        // a run that takes longer is a DNF

// ---------- ski physics ----------
export const START_V=9;          // m/s out of the start hut
export const GLIDE=10;           // m/s the slope keeps without poling
export const V_MAX=26;           // m/s cap (~94 km/h)
export const PUSH_V=1.9;         // m/s added by one hand push
export const DRAG_TAU=3.6;       // s: speed eases toward GLIDE (slow snow friction)
export const BRAKE_V=4;          // m/s target while leaning back
export const BRAKE_TAU=.55;      // s: braking is quick
export const STEER_MAX=.35;      // rad: full lean turns the skis ~20°
export const STEER_TAU=.16;      // s: steering answers quickly
export const CRASH_S=.9;         // s: stopped after hitting a flag
export const OOB_KEEP=.55;       // speed target factor in deep snow
export const LEAN_MAX=.34;       // torso lean (in torso lengths) = full steer
export const LEAN_DEAD=.06;      // ignore tiny sway
export const BRAKE_ON=1.02;      // torso height / shoulder width below this = start braking
export const BRAKE_FULL=.68;     // ... and this = full brake
export const PUSH_SPEED=.65;     // torso-lengths/s peak downward wrist speed that counts as a pole push
export const PUSH_DIST=.08;      // a wrist must drop this much (torso lengths) for one stroke
export const PUSH_RETURN=.08;    // ... and rise this much again before the next stroke
export const PUSH_GAP=.18;       // s per hand: no double count from one swing
export const PUSH_DOUBLE=1.6;    // both hands together = one stronger push
export const HAND_IN=1.15;       // a hand this far (torso lengths) from the body centre is out to the side

const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));

export interface Gate{i:number;z:number;x:number;half:number}
export interface Tree{x:number;z:number;s:number}
export interface Course{seed:number;gates:Gate[];trees:Tree[];a1:number;l1:number;p1:number;a2:number;l2:number;p2:number}
// mulberry32: the same seed = the same course on every player's run
function rng(seed:number){
  let a=seed>>>0;
  return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
}
// centre line of the ribbon: two long sine bends, ±~5 m over 400 m
export const centerAt=(c:Course,z:number)=>c.a1*Math.sin(z/c.l1+c.p1)+c.a2*Math.sin(z/c.l2+c.p2);
export function newCourse(seed=1):Course{
  const r=rng(seed);
  // issue #30: harder course – shorter bends and a wider amplitude than before, but still inside the ribbon
  const c:Course={seed,gates:[],trees:[],a1:2.0+r()*2.0,l1:55+r()*45,p1:r()*Math.PI*2,a2:.9+r()*.9,l2:28+r()*16,p2:r()*Math.PI*2};
  const n=Math.floor((COURSE_M-GATE_FIRST)/GATE_EVERY)+1;
  for(let i=0;i<n;i++){
    const z=GATE_FIRST+i*GATE_EVERY;
    const off=(r()*2-1)*(HALF_W-GATE_HALF-1.2);
    const x=clamp(centerAt(c,z)+off,-HALF_W+GATE_HALF+.3,HALF_W-GATE_HALF-.3);
    c.gates.push({i,z,x,half:GATE_HALF});
  }
  for(let i=0;i<110;i++){
    const z=-12+r()*(COURSE_M+24), side=r()<.5?-1:1;
    c.trees.push({x:centerAt(c,z)+side*(HALF_W+SOFT_W+2+r()*15),z,s:.65+r()*.8});
  }
  return c;
}

// ---------- one run ----------
export type GateRes="ok"|"miss"|"hit";
export interface Skier{
  x:number;z:number;v:number;heading:number;t:number;
  crash:number;oob:number;miss:number;hit:number;clean:number;gate:number;poles:number;
  fin:number|null;raw:number|null;dnf:boolean;maxV:number;
  res:(GateRes|null)[];
}
export const newSkier=(c:Course):Skier=>({
  x:centerAt(c,0),z:0,v:START_V,heading:0,t:0,crash:0,oob:0,miss:0,hit:0,clean:0,gate:0,poles:0,
  fin:null,raw:null,dnf:false,maxV:START_V,res:c.gates.map(()=>null),
});
export interface SkiInput{steer:number;brake:number;push:boolean;power?:number}
export const NO_INPUT:SkiInput={steer:0,brake:0,push:false,power:1};
export const penalty=(s:Skier)=>s.oob+s.miss*MISS_PENALTY;
export const liveTime=(s:Skier)=>s.t+penalty(s);
export type SkiEvent={type:"clean"|"miss"|"hit"|"finish"|"dnf";gate?:number};

// integrate one frame. `input.push` is a one-frame event (a double-pole push just happened).
export function tick(s:Skier,c:Course,dt:number,input:SkiInput=NO_INPUT):SkiEvent[]{
  const ev:SkiEvent[]=[];
  if(s.fin!=null||s.dnf||!(dt>0))return ev;
  s.t+=dt;
  const crash=s.crash>0;
  if(crash)s.crash=Math.max(0,s.crash-dt);
  const brake=crash?0:clamp(input.brake,0,1);
  const steer=crash?0:clamp(input.steer,-1,1);
  const off0=s.x-centerAt(c,s.z),oob0=Math.abs(off0)>HALF_W;
  // steering: ease the heading toward the lean
  s.heading+=(steer*STEER_MAX-s.heading)*(1-Math.exp(-dt/STEER_TAU));
  // speed: glide, brake or recover from a crash; poling adds an impulse (never while braking / in deep snow)
  let target=GLIDE,tau=DRAG_TAU;
  if(crash){target=0;tau=.35}
  else if(brake>.12){target=BRAKE_V;tau=BRAKE_TAU}
  else if(oob0)target=GLIDE*OOB_KEEP;
  else if(target>s.v)tau=.8;
  if(target<s.v)tau=crash?.35:brake>.12?BRAKE_TAU:DRAG_TAU;
  s.v+=(target-s.v)*(1-Math.exp(-dt/tau));
  if(!crash&&brake<.15&&!oob0&&input.push){s.v=Math.min(V_MAX,s.v+PUSH_V*clamp(input.power??1,.5,1.8));s.poles++}
  s.v=clamp(s.v,0,V_MAX);
  if(s.v>s.maxV)s.maxV=s.v;
  // move along the heading (z = down the slope, x = across it)
  s.x+=s.v*Math.sin(s.heading)*dt;
  s.z+=s.v*Math.cos(s.heading)*dt;
  // out of bounds: deep snow slows the skier and every second outside is added to the time
  const off=s.x-centerAt(c,s.z);
  if(Math.abs(off)>HALF_W)s.oob+=dt;
  const edge=HALF_W+SOFT_W;
  if(Math.abs(off)>edge){
    s.x=centerAt(c,s.z)+Math.sign(off)*edge;
    if(Math.abs(s.heading)>STEER_MAX*.6)s.heading*=.5;
    s.v*=.985; // scraping the snow wall
  }
  // gates: sweep every gate this frame crossed (a slow frame can skip several)
  while(s.gate<c.gates.length&&s.z>=c.gates[s.gate].z){
    const g=c.gates[s.gate];
    const dL=Math.abs(s.x-(g.x-g.half)),dR=Math.abs(s.x-(g.x+g.half));
    if(dL<POLE_HIT||dR<POLE_HIT){s.hit++;s.res[g.i]="hit";s.v=0;s.crash=CRASH_S;ev.push({type:"hit",gate:g.i})}
    else if(Math.abs(s.x-g.x)<=g.half){s.clean++;s.res[g.i]="ok";ev.push({type:"clean",gate:g.i})}
    else{s.miss++;s.res[g.i]="miss";ev.push({type:"miss",gate:g.i})}
    s.gate++;
  }
  // finish / time limit
  if(s.z>=COURSE_M){s.raw=s.t;s.fin=s.t+penalty(s);ev.push({type:"finish"})}
  else if(s.t>=LIMIT_S){s.dnf=true;ev.push({type:"dnf"})}
  return ev;
}

// ---------- two-player race: pose assignment ----------
// MediaPipe returns poses sorted by mirrored x (leftmost on screen first). With two poses P1 = left, P2 = right;
// a lone pose belongs to the player on that half of the frame. Pure so the model→player mapping is unit-tested.
export function splitPoses<T extends {x:number}>(poses:T[]):[T|null,T|null]{
  const out:[T|null,T|null]=[null,null];
  if(poses.length>=2){out[0]=poses[0];out[1]=poses[1]}
  else if(poses.length===1)out[poses[0].x>=.5?1:0]=poses[0];
  return out;
}

// ---------- turns and ranking ----------
export const total=(n:number)=>Math.max(1,Math.min(4,n));
export const turnOf=(k:number,n:number)=>({round:0,player:Math.max(0,Math.min(total(n)-1,k))});
export interface Rank{i:number;time:number|null;place:number|null}
export function rank(times:(number|null)[]):Rank[]{
  const order=times.map((_,i)=>i).sort((a,b)=>(times[a]??1e9)-(times[b]??1e9)||a-b);
  const out:Rank[]=[];
  order.forEach((i,k)=>{
    const t=times[i]??null;
    const prev=out[k-1];
    const place=t==null?null:prev&&prev.time!=null&&prev.time===t?prev.place:k+1;
    out.push({i,time:t,place});
  });
  return out;
}
export const bestTime=(times:(number|null)[])=>times.reduce<number>((m,t)=>t!=null?Math.min(m,t):m,Infinity);

// ---------- camera controls (mirrored screen space, frame-height units) ----------
export interface Body{sx:number;sy:number;hx:number;hy:number;sw:number;u:number;ar:number}
export interface Ctrl{ok:boolean;steer:number;brake:number;push:boolean;pushes:number;power:number;hand:-1|0|1;poleSpeed:number;body:Body|null}
export interface HandState{armed:boolean;topY:number;lowY:number;peak:number;lastY:number;lastT:number;lastPush:number}
export interface PoleState{hands:[HandState,HandState]}
export const newHandState=():HandState=>({armed:true,topY:0,lowY:0,peak:0,lastY:0,lastT:0,lastPush:0});
export const newPoleState=():PoleState=>({hands:[newHandState(),newHandState()]});
const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;
const resetHand=(h:HandState,now:number)=>{h.armed=true;h.topY=0;h.lowY=0;h.peak=0;h.lastY=0;h.lastT=now};

// read one fresh pose frame. `ps` is mutated (each hand has its own stroke state) - call it ONCE per new inference
// frame, not on every animation frame, or the downward speed reads as 0. A push = one wrist dropping PUSH_DIST from
// its recent high with a peak downward speed above PUSH_SPEED, anywhere between shoulder and thigh height; the hand
// is re-armed when it comes back up. Alternating hands and both hands together both work.
export function readControl(lm:Lm[],ar:number,ps:PoleState,now:number):Ctrl{
  const no:Ctrl={ok:false,steer:0,brake:0,push:false,pushes:0,power:1,hand:-1,poleSpeed:0,body:null};
  const a=lm?.[11],b=lm?.[12],h1=lm?.[23],h2=lm?.[24];
  if(!ok(a)||!ok(b)||!ok(h1)||!ok(h2)){resetHand(ps.hands[0],now);resetHand(ps.hands[1],now);return no}
  const ax=(1-a.x)*ar,bx=(1-b.x)*ar,hx1=(1-h1.x)*ar,hx2=(1-h2.x)*ar;
  const sx=(ax+bx)/2,sy=(a.y+b.y)/2,hx=(hx1+hx2)/2,hy=(h1.y+h2.y)/2;
  const sw=Math.hypot(ax-bx,a.y-b.y),u=Math.hypot(hx-sx,hy-sy);
  if(!(u>.04)||!(sw>.02)){resetHand(ps.hands[0],now);resetHand(ps.hands[1],now);return no}
  const lean=clamp((sx-hx)/u/LEAN_MAX,-1,1);
  const steer=Math.abs(lean)<=LEAN_DEAD?0:lean>0?clamp((lean-LEAN_DEAD)/(1-LEAN_DEAD),0,1):-clamp((-lean-LEAN_DEAD)/(1-LEAN_DEAD),0,1);
  // leaning back shortens the torso in the front camera: torso height / shoulder width drops
  const ratio=(hy-sy)/sw;
  const brake=clamp((BRAKE_ON-ratio)/(BRAKE_ON-BRAKE_FULL),0,1);
  // per-hand pole stroke: both hands together = one stronger push; alternating hands = one push each
  let pushes=0,hand:-1|0|1=-1,poleSpeed=0;
  for(let i=0;i<2;i++){
    const hs=ps.hands[i],el=lm[i?14:13],wr=lm[i?16:15];
    if(!ok(el)||!ok(wr)){resetHand(hs,now);continue}
    const wy=wr.y,wx=(1-wr.x)*ar;
    const dt=hs.lastT?Math.max(.001,(now-hs.lastT)/1000):0;
    if(!(dt>0&&dt<.45)){hs.topY=wy;hs.lowY=wy;hs.lastY=wy;hs.lastT=now;hs.peak=0;continue}
    const dy=wy-hs.lastY;
    const down=clamp(dy/u/dt,0,8);
    if(down>poleSpeed)poleSpeed=down;
    if(!hs.armed){
      // re-arm when the hand comes back up from the bottom of the last stroke (or is raised above the shoulder)
      if(wy<hs.lowY-PUSH_RETURN*u||wy<sy-.1*u){hs.armed=true;hs.topY=wy;hs.lowY=wy;hs.peak=0}
    }else{
      if(hs.topY===0||wy<hs.topY){hs.topY=wy;hs.lowY=wy;hs.peak=0}
      else if(wy>hs.lowY){hs.lowY=wy;hs.peak=Math.max(hs.peak,down)}
      const inside=Math.abs(wx-sx)<HAND_IN*u;
      if(inside&&wy>sy-.05*u&&hs.lowY-hs.topY>=PUSH_DIST*u&&hs.peak>=PUSH_SPEED&&now-hs.lastPush>=PUSH_GAP*1000){
        pushes++;hand=i as 0|1;hs.armed=false;hs.lastPush=now;hs.lowY=wy;hs.peak=0;
      }
    }
    hs.lastY=wy;hs.lastT=now;
  }
  return {ok:true,steer,brake,push:pushes>0,pushes,power:pushes>1?PUSH_DOUBLE:1,hand:pushes===1?hand:-1,poleSpeed,body:{sx,sy,hx,hy,sw,u,ar}};
}
