// Badmintonas – PURE rules, flight physics, camera gestures and scoring (no DOM / storage; test/unit/badminton.test.ts).
// Court: z = 0 (P1 baseline) .. COURT_LEN (P2 baseline), the net at NET_Z, x = across the court, y = height (m).
// A rally: the server swings a hand up to serve, then each player must swing when the shuttle is on their own half:
//   clear = fast upward swing (high, deep, defensive),
//   smash = fast downward swing that started at/above the shoulder (steep, aggressive; needs a high shuttle),
//   drop  = gentle sideways / short swing (just over the net).
// The shot power + aim come from the swing speed and the wrist position; the flight is then simulated with gravity and
// shuttle drag, so a bad swing really hits the net or flies out (the physics decides, not a scripted outcome).
// Two players share the court (P1 bottom / left, P2 top / right); solo = P1 against a bot on the other side.
import {VIS} from "../detect/exercises.ts";
import type {Lm} from "../detect/classifier.ts";

// ---------- court ----------
export const COURT_LEN=13.4;   // full court, baseline to baseline (m)
export const COURT_W=5.18;     // singles width (m)
export const NET_Z=COURT_LEN/2;
export const NET_H=1.55;       // net at the posts (m)
export const SHORT_SERVICE=1.98;// short service line distance from the net (m)
export const START_Z:[number,number]=[1.45,COURT_LEN-1.45]; // server stands here
export const START_H=1.0;      // the shuttle is held this high before the serve
export const HIT_MAX_H=5.4;    // a shuttle above this is out of reach
export const HIT_COOL=0.18;    // s: the same side cannot touch the shuttle twice within this
export const SERVE_TIMEOUT=7;  // s: no serve swing -> auto serve (the game must not stall)
export const SMASH_MIN_H=2.35; // m: a smash below this is a weak, net-bound chop

// ---------- flight model ----------
export const G=9.81;           // m/s²
export const DRAG_XZ=2.1;      // s: horizontal shuttle drag time constant (real shuttles slow down fast)
export const DRAG_Y=2.4;       // s: vertical drag
const SIM_STEP=1/240;          // s: sub-step, so the net line is never tunnelled at 60 fps

export type Side=0|1;
export type Stroke="serve"|"clear"|"drop"|"smash";
export const STROKES:Stroke[]=["serve","clear","drop","smash"];
export const sideOfZ=(z:number):Side=>z<NET_Z?0:1;
export const inCourt=(z:number,x:number)=>z>=0&&z<=COURT_LEN&&Math.abs(x)<=COURT_W/2;
// a serve must land beyond the short service line on the receiver's side
export const serveIn=(z:number,x:number)=>inCourt(z,x)&&Math.abs(z-NET_Z)+1e-9>=SHORT_SERVICE;

export interface Shuttle{
  x:number;y:number;z:number;         // position (m)
  vx:number;vy:number;vz:number;     // velocity (m/s)
  live:boolean;                      // in flight (false = waiting for the serve / after a point)
  t:number;                          // s since the last hit (also the serve)
  serve:boolean;                     // this flight is a serve (the short service line applies)
  from:Side|-1;                      // the side that hit it last
}
export const newShuttle=(server:Side=0):Shuttle=>({
  x:0,y:START_H,z:START_Z[server],vx:0,vy:0,vz:0,live:false,t:0,serve:false,from:-1,
});

export type FlightEvent=
  | {type:"net";by:Side}                                        // the hitter put it into the net
  | {type:"land";side:Side;x:number;z:number;in:boolean;fault:boolean;serve:boolean;winner:Side}; // side = where it landed

const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
// the vx/vz/vy of a shot from the current shuttle position; `high` = the shuttle is high enough for a real smash
function shot(s:Shuttle,side:Side,stroke:Stroke,power:number,aim:number){
  const dir=side===0?1:-1, high=s.y>=SMASH_MIN_H, p=clamp(power,.8,1.3), a=clamp(aim,-1,1);
  let vy=0,vz=0,vx=0;
  switch(stroke){
    case "serve":  vy=8.6*p; vz=dir*7.3*p; vx=a*1.1; break;
    case "clear":  vy=(s.y<1.1?7.2:8.5)*p; vz=dir*6.2*p; vx=a*2.5; break;
    case "drop":   vy=(s.y>2?2.4:3.1)*p; vz=dir*4.6*p; vx=a*2.1; break;
    case "smash":  vy=(high?-2.8:-1.0)*p; vz=dir*(high?11.8:7.0)*p; vx=a*3.0; break;
  }
  return {vx,vy,vz};
}

// the shuttle can be returned from anywhere on your own half, below HIT_MAX_H, a moment after the last touch
export const canHit=(s:Shuttle,side:Side)=>s.live&&s.y>0&&s.y<HIT_MAX_H&&sideOfZ(s.z)===side&&s.t>=HIT_COOL;
export function serveShuttle(s:Shuttle,side:Side,power=1,aim=0){
  s.x=0;s.y=START_H;s.z=START_Z[side];
  const v=shot(s,side,"serve",power,aim);
  s.vx=v.vx;s.vy=v.vy;s.vz=v.vz;
  s.live=true;s.t=0;s.serve=true;s.from=side;
}
// a return; false when the shuttle is not on that side / too high / too soon
export function hitShuttle(s:Shuttle,side:Side,stroke:Stroke,power=1,aim=0):boolean{
  if(!canHit(s,side))return false;
  const v=shot(s,side,stroke,power,aim);
  s.vx=v.vx;s.vy=v.vy;s.vz=v.vz;
  s.t=0;s.serve=false;s.from=side;
  return true;
}

// advance the shuttle; returns one event when it hits the net or lands, else null. dt is clamped by the caller.
export function stepShuttle(s:Shuttle,dt:number):FlightEvent|null{
  if(!s.live||!(dt>0))return null;
  const n=Math.max(1,Math.ceil(dt/SIM_STEP)),h=dt/n;
  for(let i=0;i<n;i++){
    const pz=s.z,py=s.y,from:Side=s.from<0?sideOfZ(pz):(s.from as Side);
    s.vy-=G*h;
    const kxz=Math.exp(-h/DRAG_XZ),ky=Math.exp(-h/DRAG_Y);
    s.vx*=kxz;s.vz*=kxz;s.vy*=ky;
    s.x+=s.vx*h;s.z+=s.vz*h;s.y+=s.vy*h;s.t+=h;
    // net: a crossing between the two sub-steps; under the tape (NET_H) = a fault by the hitter
    if((pz<NET_Z)!==(s.z<NET_Z)){
      const k=(NET_Z-pz)/(s.z-pz||1e-9),yc=py+(s.y-py)*k;
      if(yc<NET_H){
        s.live=false;s.y=NET_H;s.z=NET_Z;s.t=0;
        return {type:"net",by:from};
      }
    }
    if(s.y<=0){
      s.y=0;s.live=false;
      const side=sideOfZ(s.z),inside=inCourt(s.z,s.x),valid=s.serve?serveIn(s.z,s.x):inside;
      // a good landing in the receiver's court = the hitter wins; out / short / back on the hitter's own side = the opponent
      const fault=!valid||side===s.from;
      const from:Side=s.from<0?side:(s.from as Side);
      const winner:Side=fault?(from===0?1:0):from;
      return {type:"land",side,x:s.x,z:s.z,in:inside,fault,serve:s.serve,winner};
    }
  }
  return null;
}
// side that would win the rally if the shuttle landed now (used by the HUD / tests, not the physics)
export const receiverOf=(s:Shuttle):Side=>sideOfZ(s.z);

// ---------- match ----------
export interface StrokeCounts{serve:number;clear:number;drop:number;smash:number}
export interface Match{
  target:number;score:[number,number];server:Side;
  rally:number;longest:number;rallies:number;lastRally:number;
  strokes:[StrokeCounts,StrokeCounts];
  done:boolean;winner:Side|-1;
}
const counts=():StrokeCounts=>({serve:0,clear:0,drop:0,smash:0});
export const newMatch=(target=11):Match=>({
  target:target===21?21:11,score:[0,0],server:0,rally:0,longest:0,rallies:0,lastRally:0,
  strokes:[counts(),counts()],done:false,winner:-1,
});
export function countStroke(m:Match,side:Side,stroke:Stroke){m.strokes[side][stroke]++}
// a point ends the rally; the winner serves next (as in the idea). Returns true when the match is over.
export function addPoint(m:Match,winner:Side):boolean{
  if(m.done)return m.done;
  m.score[winner]++;m.server=winner;
  m.lastRally=m.rally;m.longest=Math.max(m.longest,m.rally);m.rallies++;m.rally=0;
  if(m.score[winner]>=m.target){m.done=true;m.winner=winner}
  return m.done;
}
export const matchWinner=(m:Match):0|1|2=>m.winner<0?0:(m.winner+1) as 1|2;
export const bestRally=(rows:{mode?:string;bdLongest?:number}[]):number=>{
  let best=0;
  for(const g of rows)if(g.mode==="badminton")best=Math.max(best,g.bdLongest||0);
  return best;
};

// ---------- camera: body, hand choice, swing classification ----------
export const CHOOSE_HOLD=2.0;   // s: hold the hand out to pick it (the two bubbles fill evenly)
export const HAND_OUT=0.34;     // torso lengths outside its own shoulder
export const HAND_UP=0.15;      // ... and above the shoulder (a hanging arm never picks)
export const HAND_TIE=0.14;     // both hands out and this close = no choice yet
export const SW_WINDOW=0.30;    // s of wrist history used to classify one swing
export const SW_DIST=0.16;      // torso lengths of travel that make a swing
export const SW_UP=0.95;        // torso/s upward peak = a clear
export const SW_DOWN=1.15;      // torso/s downward peak = a smash
export const SW_DROP=0.55;      // torso/s gentler swing = a drop shot
export const SW_GAP=0.45;       // s: one swing per hand per this (no double hits from one motion)

export interface Body{cx:number;cy:number;sx:number;sy:number;lx:number;rx:number;u:number;ar:number}
export interface Wrist{ok:boolean;x:number;y:number;out:number;up:boolean}
export interface Ctrl{body:Body;wrists:[Wrist,Wrist]}
const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;

// mirrored screen space in frame-height units (the same convention as boxing/bowling): X = (1-x)*ar, Y = y
export function control(lm:Lm[]|null|undefined,ar:number):Ctrl|null{
  const a=lm?.[11],b=lm?.[12];
  if(!ok(a)||!ok(b))return null;
  const ax=(1-a!.x)*ar,bx=(1-b!.x)*ar,sy=(a!.y+b!.y)/2,sx=(ax+bx)/2,sw=Math.hypot(ax-bx,a!.y-b!.y);
  let u=sw*1.3,hx=sx,hy=sy+u; // u = torso length (or 1.3 shoulder widths when the hips are out of frame)
  const h1=lm![23],h2=lm![24];
  if(ok(h1)&&ok(h2)){
    hx=((1-h1!.x)+(1-h2!.x))/2*ar;hy=(h1!.y+h2!.y)/2;
    u=Math.max(Math.hypot(hx-sx,hy-sy),sw);
  }
  if(!(u>0.02)||!(sw>0.01))return null;
  const wrists:[Wrist,Wrist]=[0,1].map(k=>{
    const s=k?b!:a!,w=k?lm![16]:lm![15],e=k?lm![14]:lm![13];
    if(!ok(s)||!ok(w)||!ok(e))return {ok:false,x:0,y:0,out:0,up:false};
    const wx=(1-w!.x)*ar,wy=w!.y,sx2=(1-s!.x)*ar;
    return {ok:true,x:wx,y:wy,out:(wx-sx2)*(k?1:-1)/u,up:wy<sy+HAND_UP*u};
  }) as [Wrist,Wrist];
  return {body:{cx:sx,cy:sy,sx,sy,lx:ax,rx:bx,u,ar},wrists};
}
export interface ChoiceState{held:[number,number];pick:0|1|null;lost:number}
export const newChoice=():ChoiceState=>({held:[0,0],pick:null,lost:0});
// one frame: which arm is held out to its own side, and how far the two bubbles have filled (seconds held).
// A dropped detection frame keeps the fill for CHOICE_GRACE (a hand that flickers out of view must not reset a hold).
export const CHOICE_GRACE=0.35;
export function tickChoice(c:Ctrl|null,st:ChoiceState,dt:number):{pick:0|1|null;progress:[number,number]}{
  if(st.pick!=null)return {pick:st.pick,progress:[1,1]};
  if(!c){
    st.lost+=Math.max(0,Math.min(.25,dt));
    if(st.lost>CHOICE_GRACE)st.held[0]=st.held[1]=0;
    return {pick:null,progress:[st.held[0]/CHOOSE_HOLD,st.held[1]/CHOOSE_HOLD]};
  }
  st.lost=0;
  const [l,r]=c.wrists,lo=l.ok&&l.up&&l.out>HAND_OUT,ro=r.ok&&r.up&&r.out>HAND_OUT;
  let cand:0|1|null=null;
  if(lo&&ro)cand=Math.abs(l.out-r.out)>HAND_TIE?(l.out>r.out?0:1):null;
  else if(lo)cand=0;else if(ro)cand=1;
  for(const k of [0,1] as const)st.held[k]=cand===k?Math.min(CHOOSE_HOLD,st.held[k]+Math.max(0,Math.min(.25,dt))):0;
  if(cand!=null&&st.held[cand]>=CHOOSE_HOLD){st.pick=cand;return {pick:cand,progress:[1,1]}}
  return {pick:null,progress:[st.held[0]/CHOOSE_HOLD,st.held[1]/CHOOSE_HOLD]};
}

export interface Sample{t:number;y:number;x:number}
export interface SwingState{hist:[Sample[],Sample[]];last:[number,number]}
export const newSwingState=():SwingState=>({hist:[[],[]],last:[-1,-1]});
export interface Swing{hand:0|1;stroke:"clear"|"drop"|"smash";power:number;aim:number;peak:number}
// one fresh inference frame. `now` in seconds. Only the chosen hand is tracked (the idea: pick a hand, use it).
export function readSwing(lm:Lm[]|null|undefined,ar:number,hand:0|1,st:SwingState,now:number):Swing|null{
  const c=control(lm,ar);
  if(!c){st.hist[0].length=0;st.hist[1].length=0;return null}
  const w=c.wrists[hand];
  if(!w.ok){st.hist[hand].length=0;return null}
  const h=st.hist[hand];
  h.push({t:now,y:w.y,x:w.x});
  while(h.length&&h[0].t<now-SW_WINDOW)h.shift();
  if(h.length<2||!(now-st.last[hand]>=SW_GAP))return null;
  const u=c.body.u;
  let minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity,peakUp=0,peakDown=0,peakX=0;
  for(let i=0;i<h.length;i++){
    const q=h[i];
    if(q.y<minY)minY=q.y;if(q.y>maxY)maxY=q.y;if(q.x<minX)minX=q.x;if(q.x>maxX)maxX=q.x;
    if(i){const p=h[i-1],dt=(q.t-p.t)||1e-3,dy=(q.y-p.y)/u/dt,dx=(q.x-p.x)/u/dt;
      if(dy<0)peakUp=Math.max(peakUp,-dy);else peakDown=Math.max(peakDown,dy);
      peakX=Math.max(peakX,Math.abs(dx));}
  }
  const spanY=(maxY-minY)/u,spanX=(maxX-minX)/u,y=w.y,x=w.x;
  const nearTop=(maxY-y)/u>=0.09,nearBottom=(y-minY)/u>=0.09;
  let stroke:"clear"|"drop"|"smash"|null=null,peak=0;
  if(spanY>=SW_DIST&&peakDown>=SW_DOWN&&nearBottom&&minY<=c.body.sy+.06*u){stroke="smash";peak=peakDown}
  else if(spanY>=SW_DIST&&peakUp>=SW_UP&&nearTop){stroke="clear";peak=peakUp}
  else if((spanX>=SW_DIST||spanY>=SW_DIST*.8)&&Math.max(peakUp,peakDown,peakX)>=SW_DROP){stroke="drop";peak=Math.max(peakUp,peakDown,peakX)}
  if(!stroke)return null;
  st.last[hand]=now;h.length=0;
  return {hand,stroke,power:stroke==="drop"?1:clamp(peak/2.35,.8,1.3),aim:clamp((x-c.body.cx)/(.95*u),-1,1),peak};
}

// ---------- solo bot ----------
export const BOT_DELAY=0.32;     // s after the shuttle arrives on its side before it swings
export const BOT_MISS=0.06;      // base chance it lets the shuttle land
export const BOT_MISS_RALLY=0.012;
export const BOT_MISS_MAX=0.22;
export interface Bot{wait:number;fired:boolean;rng:()=>number}
export const newBot=(rng:()=>number=Math.random):Bot=>({wait:0,fired:false,rng});
// returns a return shot (the caller applies hitShuttle) or null. A miss = the shuttle lands, the player scores.
export function botAct(s:Shuttle,side:Side,b:Bot,dt:number,rally=0):Swing|null{
  if(!s.live||sideOfZ(s.z)!==side){b.wait=0;b.fired=false;return null}
  if(b.fired)return null;
  b.wait+=Math.max(0,Math.min(.25,dt));
  if(b.wait<BOT_DELAY)return null;
  if(s.vy>0&&s.t<1.1)return null; // still rising / just crossed: wait for it to come down
  b.fired=true;
  const miss=Math.min(BOT_MISS_MAX,BOT_MISS+Math.max(0,rally)*BOT_MISS_RALLY);
  if(b.rng()<miss)return null;
  const high=s.y>=SMASH_MIN_H,r=b.rng();
  const stroke:"clear"|"drop"|"smash"=high?(r<.35?"smash":r<.75?"clear":"drop"):(r<.75?"clear":"drop");
  return {hand:1,stroke,power:.92+b.rng()*.2,aim:(b.rng()-.5)*1.0,peak:0};
}
