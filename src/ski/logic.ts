// Slidinėjimas – rules, the generated course and the ski physics (issue #23, idea #4). PURE: no DOM, no storage
// (test/unit/ski.test.ts). One skier at a time (like Šuolis į tolį): lean left/right to steer, pull both arms down
// like ski poles to speed up, lean back to brake. The course is a seeded downhill ribbon with snow walls, centre
// line and slalom gates. Passing a gate cleanly counts; passing outside it costs MISS_PENALTY seconds; hitting a
// flag stops the skier dead (CRASH_S); every second outside the boundary line is added as a time penalty.
// Final time = raw time + time out of bounds + missed gates × MISS_PENALTY. Fastest final time wins.
import {VIS} from "../detect/exercises.ts";
import type {Lm} from "../detect/classifier.ts";

// ---------- course ----------
export const COURSE_M=400;       // finish line distance down the slope
export const HALF_W=7.5;         // boundary line half-width (m)
export const SOFT_W=2.2;         // deep snow outside it before the hard snow wall
export const GATE_FIRST=55;      // first gate
export const GATE_EVERY=42;      // gate spacing (m)
export const GATE_HALF=2.7;      // half the gate span (pole to pole = 5.4 m)
export const POLE_HIT=0.75;      // skier + pole radius (m): closer than this = you hit the flag
export const MISS_PENALTY=2;     // seconds added for every missed gate
export const LIMIT_S=120;        // a run that takes longer is a DNF

// ---------- ski physics ----------
export const START_V=8;          // m/s out of the start hut
export const GLIDE=9;            // m/s the slope keeps without poling
export const V_MAX=26;           // m/s cap
export const PUSH_V=2.2;         // m/s added by one double-pole push
export const DRAG_TAU=3.0;       // s: speed eases toward GLIDE (slow snow friction)
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
export const PUSH_SPEED=1.25;    // torso-lengths/s downward wrist speed that counts as a pole push
export const PUSH_TOP=.55;       // hands must be above shoulderY + this*u to re-arm
export const PUSH_BOTTOM=.02;    // ... and below hipY + this*u to pull
export const HAND_IN=.95;        // both gloves inside this*u of the body centre (not out to the sides)
export const PUSH_RETURN=.18;    // s before the next push can arm again

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
  const c:Course={seed,gates:[],trees:[],a1:1.8+r()*1.8,l1:70+r()*60,p1:r()*Math.PI*2,a2:.8+r(),l2:34+r()*22,p2:r()*Math.PI*2};
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
export interface SkiInput{steer:number;brake:number;push:boolean}
export const NO_INPUT:SkiInput={steer:0,brake:0,push:false};
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
  if(!crash&&brake<.15&&!oob0&&input.push){s.v=Math.min(V_MAX,s.v+PUSH_V);s.poles++}
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
export interface Ctrl{ok:boolean;steer:number;brake:number;push:boolean;poleSpeed:number;body:Body|null}
export interface PoleState{armed:boolean;lastY:number;lastT:number;lastPush:number}
export const newPoleState=():PoleState=>({armed:false,lastY:0,lastT:0,lastPush:0});
const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;
const later=(t:number,now:number)=>now>t?now:t;

// read one fresh pose frame. `ps` is mutated (the push gesture is a small state machine) - call it ONCE per new
// inference frame, not on every animation frame, or the downward speed reads as 0.
export function readControl(lm:Lm[],ar:number,ps:PoleState,now:number):Ctrl{
  const no:Ctrl={ok:false,steer:0,brake:0,push:false,poleSpeed:0,body:null};
  const a=lm?.[11],b=lm?.[12],h1=lm?.[23],h2=lm?.[24];
  if(!ok(a)||!ok(b)||!ok(h1)||!ok(h2)){ps.armed=false;ps.lastT=later(ps.lastT,now);return no}
  const ax=(1-a.x)*ar,bx=(1-b.x)*ar,hx1=(1-h1.x)*ar,hx2=(1-h2.x)*ar;
  const sx=(ax+bx)/2,sy=(a.y+b.y)/2,hx=(hx1+hx2)/2,hy=(h1.y+h2.y)/2;
  const sw=Math.hypot(ax-bx,a.y-b.y),u=Math.hypot(hx-sx,hy-sy);
  if(!(u>.04)||!(sw>.02)){ps.armed=false;ps.lastT=later(ps.lastT,now);return no}
  const lean=clamp((sx-hx)/u/LEAN_MAX,-1,1);
  const steer=Math.abs(lean)<=LEAN_DEAD?0:lean>0?clamp((lean-LEAN_DEAD)/(1-LEAN_DEAD),0,1):-clamp((-lean-LEAN_DEAD)/(1-LEAN_DEAD),0,1);
  // leaning back shortens the torso in the front camera: torso height / shoulder width drops
  const ratio=(hy-sy)/sw;
  const brake=clamp((BRAKE_ON-ratio)/(BRAKE_ON-BRAKE_FULL),0,1);
  // double-pole gesture: both gloves dive together from chest height past the hips
  const e1=lm[13],e2=lm[14],w1=lm[15],w2=lm[16];
  let push=false,poleSpeed=0;
  if(ok(e1)&&ok(e2)&&ok(w1)&&ok(w2)){
    const wx1=(1-w1.x)*ar,wx2=(1-w2.x)*ar;
    const avgY=(w1.y+w2.y)/2,avgX=(wx1+wx2)/2;
    const inside=Math.abs(wx1-sx)<HAND_IN*u&&Math.abs(wx2-sx)<HAND_IN*u&&Math.abs(avgX-sx)<HAND_IN*u;
    const dt=ps.lastT?Math.max(.001,(now-ps.lastT)/1000):0;
    const down=dt>0&&dt<.4?clamp((avgY-ps.lastY)/u/dt,0,6):0;
    poleSpeed=down;
    const top=sy+PUSH_TOP*u,bottom=hy+PUSH_BOTTOM*u;
    if(!inside||avgY<sy-.6*u){ps.armed=false}
    else{
      if(!ps.armed&&avgY<top&&avgY>sy-.45*u&&down<1.0&&now-ps.lastPush>PUSH_RETURN*1000)ps.armed=true;
      if(ps.armed&&avgY>bottom&&down>PUSH_SPEED){push=true;ps.armed=false;ps.lastPush=now}
    }
    ps.lastY=avgY;ps.lastT=now;
  }else{
    ps.armed=false;ps.lastT=later(ps.lastT,now);ps.lastY=0;
  }
  return {ok:true,steer,brake,push,poleSpeed,body:{sx,sy,hx,hy,sw,u,ar}};
}
