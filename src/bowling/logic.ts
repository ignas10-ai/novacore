// Boulingas – rules and the pin simulation (issue #20, idea #4; tuning #26). PURE: no DOM, no storage
// (test/unit/bowling.test.ts). The phone camera controls the throw: hold one arm out to the side for 2 s to pick the
// bowling hand (both sides show a filling ring, switching is allowed), keep it up to aim (the hand's x position =
// the board / target on the lane), turn the knuckle / wrist to add spin, then make a full back-to-front swing to
// release. The ball is a circle rolling down the lane (x-z plane, metres); the pins are 10 circles in the real
// ten-pin triangle. Ball -> pin and pin -> pin collisions are simulated at 120 Hz, so strikes / spares / splits come
// out of the geometry, not out of a random roll. Scoring is real ten-pin scoring (strike = 10 + next two, spare =
// 10 + next, the last frame gets bonus balls). A series is 3 or 5 frames; players take turns (one player in front of
// the camera at a time, like Šuolis į tolį).
import {VIS} from "../detect/exercises.ts";
import type {Lm} from "../detect/classifier.ts";

// ---------- lane geometry (metres; x = across the lane, z = down the lane from the foul line) ----------
export const LANE_W=1.066;        // 39 boards
export const GUTTER_R=0.11;
export const BALL_R=0.108;
export const PIN_R=0.06;
export const PIN_H=0.38;
export const PIN_Z=18.29;         // head pin (pin 1) distance from the foul line
export const PIN_GAP=0.305;       // centre distance between two pins (12 in)
export const DECK_BACK=PIN_Z+PIN_GAP*3;
export const MAX_Z=DECK_BACK+0.9;
// pin ids: 1 = head pin, 2/3 = second row, 4/5/6 = third, 7/8/9/10 = back row (real ten-pin layout)
export const PINS:[number,number][]=[
  [0,PIN_Z],                                                     // 1
  [-PIN_GAP/2,PIN_Z+PIN_GAP], [PIN_GAP/2,PIN_Z+PIN_GAP],         // 2 3
  [-PIN_GAP,PIN_Z+PIN_GAP*2], [0,PIN_Z+PIN_GAP*2], [PIN_GAP,PIN_Z+PIN_GAP*2], // 4 5 6
  [-PIN_GAP*1.5,PIN_Z+PIN_GAP*3], [-PIN_GAP/2,PIN_Z+PIN_GAP*3], [PIN_GAP/2,PIN_Z+PIN_GAP*3], [PIN_GAP*1.5,PIN_Z+PIN_GAP*3], // 7 8 9 10
];
export const FRAME_OPTIONS=[3,5] as const, DEFAULT_FRAMES=3;
export const FRAME_W=0.55;        // aim -1..1 -> ball target x at the head pin (a ball centre this far out is in the gutter)
export const START_W=0.12;        // the ball starts near the body, shifted by the aim only a little
export const HOOK_W=0.2;          // a full hook bends the path this far sideways near the pins
export const SPEED_MIN=8.5, SPEED_MAX=15;

// ---------- throw gesture (frame-height units; u = torso length) ----------
export const HAND_OUT=0.32;       // a wrist this far outside its shoulder picks that hand
export const HAND_UP=0.18;        // ... while above the shoulder (a hanging arm never picks)
export const CHOOSE_HOLD=2;       // hold the arm out this long to confirm the hand (switch any time before)
export const DROP_Y=0.4;          // wrist this far below the shoulder at the end of a release (waist/mid-torso)
export const LEAN_MAX=0.45;       // torso lean (0.45 u) = the old hook; kept for the body model / tests
export const BODY_MIN=0.04;       // a degenerate / far-away torso
// Full swing: the arm is up/aiming (at or above the shoulder), then swings DOWN and FORWARD in one motion. The old
// z-only wind-up was too strict on phones (MediaPipe z is small/noisy): the raised aim pose now arms the swing, and a
// real backward z (when present) is accepted as an extra. A hand that is merely held down never arms.
export const BACK_Y=0.18;         // the wrist may be this far below the shoulder and still arm (matches the hand pick)
export const BACK_Z=0.08;         // ... or this far behind the shoulder in MediaPipe z
export const SWING_Y=0.35;        // down travel from the raised pose before a release (u)
export const SWING_Z=0.15;        // forward depth travel that also releases (u)
export const SWING_SPEED=0.9;     // u/s down or forward: a slow lower is not a throw
export const SWING_S=2;           // s from the start of the downswing to release
export const BACK_HOLD=30;        // s: the aim may be held this long before the swing (practically no timeout)
export const FWD_START=0.02;      // wrist below the shoulder (u) when the forward half starts
export const SPIN_K=1.15;         // knuckle angle -> hook
export const SPIN_V=0.35;         // lateral wrist speed -> hook (per u/s)

export interface Body{cx:number;cy:number;sx:number;sy:number;lx:number;rx:number;hx:number;hy:number;u:number;ar:number}
// z = wrist depth relative to the shoulder in torso units (+ = behind the body, NaN when MediaPipe z is missing)
// knuckle = signed wrist x relative to the elbow (screen direction: + = to the right), the knuckle-turn proxy
export interface Wrist{ok:boolean;x:number;y:number;z:number;knuckle:number;out:number;up:boolean}
export interface Ctrl{body:Body;wrists:[Wrist,Wrist];lean:number}
const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));

// mirrored screen space in frame-height units: X = (1-x)*ar, Y = y (the same space as src/boxing/logic.ts)
export function control(lm:Lm[],ar:number):Ctrl|null{
  const a=lm?.[11],b=lm?.[12];
  if(!ok(a)||!ok(b))return null;
  const ax=(1-a.x)*ar,bx=(1-b.x)*ar,sy=(a.y+b.y)/2,sx=(ax+bx)/2,sw=Math.hypot(ax-bx,a.y-b.y);
  let u=sw*1.3,hx=sx,hy=sy+u;
  const h1=lm[23],h2=lm[24];
  if(ok(h1)&&ok(h2)){
    hx=((1-h1.x)+(1-h2.x))/2*ar;hy=(h1.y+h2.y)/2;
    u=Math.max(Math.hypot(hx-sx,hy-sy),sw);
  }
  if(!(u>BODY_MIN))return null;
  const wrists:[Wrist,Wrist]=[0,1].map(k=>{
    const s=k?b:a,w=k?lm[16]:lm[15],e=k?lm[14]:lm[13];
    if(!ok(s)||!ok(w)||!ok(e))return {ok:false,x:0,y:0,z:NaN,knuckle:0,out:0,up:false};
    const wx=(1-w.x)*ar,wy=w.y,sx2=(1-s.x)*ar,sy2=s.y,ex=(1-e.x)*ar;
    const wz=w.z,sz=s.z;
    const z=typeof wz==="number"&&typeof sz==="number"&&Number.isFinite(wz)&&Number.isFinite(sz)?(wz-sz)/u:NaN; // + = behind the shoulder
    return {ok:true,x:wx,y:wy,z,knuckle:(wx-ex)/u,out:(wx-sx2)*(k?1:-1)/u,up:wy<sy2+HAND_UP*u};
  }) as [Wrist,Wrist];
  return {body:{cx:sx,cy:sy,sx,sy,lx:ax,rx:bx,hx,hy,u,ar},wrists,lean:clamp((sx-hx)/u,-1,1)};
}

// ---------- hand pick (2 s, both directions, switchable) ----------
// p[0] = left ring, p[1] = right ring, 0..1. The active side fills, the other drains (both drain with no side).
export function pickStep(p:[number,number],side:0|1|null,dt:number,hold=CHOOSE_HOLD):[number,number]{
  const k=clamp(dt,0,.1)/Math.max(.1,hold);
  return [side===0?Math.min(1,p[0]+k):Math.max(0,p[0]-k),side===1?Math.min(1,p[1]+k):Math.max(0,p[1]-k)];
}
// knuckle/wrist turn + lateral wrist motion -> hook -1..1 (positive = to the player's right on screen)
export const spinOf=(knuckle:number,lateral=0)=>clamp(knuckle*SPIN_K+lateral*SPIN_V,-1,1);

// ---------- full back-to-front swing detector ----------
export type SwingPhase="idle"|"back"|"forward";
export interface SwingState{phase:SwingPhase;backAt:number;fwdAt:number;backY:number;backZ:number;lastY:number;lastZ:number;lastT:number;peak:number}
export const swingState=():SwingState=>({phase:"idle",backAt:0,fwdAt:0,backY:0,backZ:0,lastY:0,lastZ:0,lastT:0,peak:0});
export interface SwingPoint{ok:boolean;y:number;z:number}
// Feed the chosen wrist every camera frame. "back" = the arm is up/aiming (or behind in z), "forward" = the downswing
// has started (lock the aim, the throw is coming), "release" = enough down/forward travel with speed. The old detector
// required a z-only backswing, which real phones rarely produced; the raised aim pose is the backswing now, and the
// z travel is still accepted when MediaPipe gives it.
export function swing(st:SwingState,w:SwingPoint,body:{sy:number;u:number},now:number):""|"back"|"forward"|"release"{
  if(!w.ok||!Number.isFinite(w.y)){st.phase="idle";st.lastT=now;return ""}
  const u=body.u,sy=body.sy,zOK=Number.isFinite(w.z);
  const dt=st.lastT?clamp((now-st.lastT)/1000,0,.25):0;
  const down=dt>0?(w.y-st.lastY)/dt/u:0;
  const toward=dt>0&&zOK&&Number.isFinite(st.lastZ)?(st.lastZ-w.z)/dt/u:0;
  st.lastY=w.y;st.lastZ=w.z;st.lastT=now;
  if(st.phase==="idle"){
    const back=w.y<sy+BACK_Y*u||(zOK&&w.z>BACK_Z);
    if(!back)return "";
    st.phase="back";st.backAt=now;st.fwdAt=0;st.backY=w.y;st.backZ=w.z;st.peak=0;
    return "back";
  }
  if(st.phase==="back"){
    if(now-st.backAt>BACK_HOLD*1000){st.phase="idle";return ""}
    if(w.y<st.backY)st.backY=w.y;
    if(zOK&&w.z>st.backZ)st.backZ=w.z;
    // the downswing starts when the wrist leaves the raised pose and moves down; the aim is locked from here.
    // A low-frame-rate camera can jump from the up pose to the release in one sample: check the release immediately.
    if(now-st.backAt>120&&w.y>sy+FWD_START*u&&(down>.25||toward>.25)){
      st.phase="forward";st.fwdAt=now;st.peak=Math.max(down,toward);
      const downTravel=(w.y-st.backY)/u, zTravel=zOK?st.backZ-w.z:0;
      if(w.y>sy+DROP_Y*u&&(downTravel>SWING_Y||zTravel>SWING_Z)&&st.peak>SWING_SPEED){
        st.phase="idle";
        return "release";
      }
      return "forward";
    }
    return "";
  }
  if(now-st.fwdAt>SWING_S*1000){st.phase="idle";return ""}
  st.peak=Math.max(st.peak,down,toward);
  const downTravel=(w.y-st.backY)/u;
  const zTravel=zOK?st.backZ-w.z:0;
  const low=w.y>sy+DROP_Y*u;
  if(low&&(downTravel>SWING_Y||zTravel>SWING_Z)&&Math.max(down,toward)>SWING_SPEED){
    st.phase="idle";
    return "release";
  }
  return "";
}
// the arm held out to the side; the further one wins, a tie (both out) is not a choice
export function handChoice(c:Ctrl):0|1|null{
  const [l,r]=c.wrists, lo=l.ok&&l.up&&l.out>HAND_OUT, ro=r.ok&&r.up&&r.out>HAND_OUT;
  if(lo&&ro)return Math.abs(l.out-r.out)>0.12?(l.out>r.out?0:1):null;
  return lo?0:ro?1:null;
}
// aim -1..1 from the chosen wrist relative to its own shoulder (hand right of the right shoulder = +, i.e. right side)
export function aimOf(c:Ctrl,side:0|1){
  const w=c.wrists[side];if(!w.ok)return null;
  const shoulderX=side?c.body.rx:c.body.lx;
  return clamp((w.x-shoulderX)/(1.05*c.body.u),-1,1);
}
// predicted ball x at the head pin: target board + hook bend (the same path the simulation uses)
export const targetX=(aim:number)=>clamp(aim,-1,1)*FRAME_W;
export function ballX(z:number,aim:number,hook:number){
  const s=clamp(z/PIN_Z,0,1.2),u=clamp(aim,-1,1);
  return u*START_W+(targetX(u)-u*START_W)*s+clamp(hook,-1,1)*HOOK_W*s*s*s;
}
// the ball's speed from the swing: a gentle lower is slow, a hard swing is fast
export const throwSpeed=(downTorsoPerS:number)=>clamp(SPEED_MIN+(downTorsoPerS-1)*(SPEED_MAX-SPEED_MIN)/7,SPEED_MIN,SPEED_MAX);

// ---------- pin physics ----------
export interface SimPin{x:number;z:number;down:boolean;fall:number;dx:number;dz:number}
export interface SimFrame{t:number;bx:number;bz:number;p:SimPin[]}
export interface Throw{down:number[];frames:SimFrame[];endT:number;speed:number;aim:number;hook:number;standing:boolean[];gutter:boolean}
const PIN_KICK=2.5, PIN_FWD=1.9; // m/s a standing pin gets from the ball (a full hit) - lower = less explosive pin action
const PIN_DAMP=0.55;              // s: sliding friction time constant (pins stop sooner)
const PIN_REST=0.8;               // pin -> pin restitution
const PIN_REACH=0.11;             // a fallen pin lying on the deck is a little longer than a standing one (pin-pin radius)
const PIN_JITTER=0.004;           // m: a tiny per-throw pin scatter (lane / oil variation); seed 0 = exact
const BALL_DEFLECT=0.01;          // m: the heavy ball is nudged sideways by every pin it hits
const SIM_DT=1/120, SIM_MAX=3.4;

// seeded RNG for the per-throw pin jitter (mulberry32); 0 = no jitter, so the unit tests stay exact.
function jitterRng(seed:number){
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
}

// standing = pins still up before this throw (ids); returns the pins knocked down and a playback timeline.
export function simulateThrow(standing:boolean[],aim:number,hook:number,speed:number,seed=0):Throw{
  const rng=seed?jitterRng(seed):null;
  const ps:PIN_POS[]=PINS.map(([x,z],i)=>({x:x+(rng?(rng()-.5)*PIN_JITTER:0),z:z+(rng?(rng()-.5)*PIN_JITTER*.6:0),
    vx:0,vz:0,down:!standing[i],fall:!standing[i]?1:0,dx:0,dz:0}));
  const down:number[]=[];
  const frames:SimFrame[]=[];let t=0,sample=0,bz=0,gutter=false,deflect=0;
  const hk=clamp(hook,-1,1);
  while(t<SIM_MAX){
    t+=SIM_DT;
    const prevZ=bz;bz=Math.min(MAX_Z,speed*t);
    const px=ballX(prevZ,aim,hk)+deflect, bx=ballX(bz,aim,hk)+deflect;
    if(Math.abs(bx)>LANE_W/2+BALL_R*0.05)gutter=true; // the ball dropped into the channel: it cannot come back
    // the ball hits a pin when their circles overlap (a swept segment, so 15 m/s cannot tunnel)
    let deflectStep=0;
    for(let i=0;i<ps.length;i++){
      const p=ps[i];if(p.down||!standing[i]||gutter)continue;
      const hit=segCircle(px,bx,prevZ,bz,p.x,p.z,BALL_R+PIN_R);
      if(!hit)continue;
      p.down=true;if(!down.includes(i))down.push(i);
      const off=p.x-hit.x,dir=Math.sign(off)||(hk>=0?1:-1);
      deflectStep-=dir*BALL_DEFLECT; // the ball is pushed away from the pin it hit
      p.vx=dir*PIN_KICK*Math.min(1,.35+Math.abs(off)/(BALL_R+PIN_R))+(hk*.35);
      p.vz=PIN_FWD*(.55+.45*Math.min(1,Math.abs(off)/(BALL_R+PIN_R)))+.25;
      p.dx=dir;p.dz=1;
    }
    deflect=clamp(deflect+deflectStep,-.04,.04);
    // pin -> pin collisions (a falling pin sweeps its neighbours)
    for(let i=0;i<ps.length;i++){
      const a=ps[i];if(a.down&&a.fall>=1&&a.vx*a.vx+a.vz*a.vz<1e-4)continue;
      for(let j=i+1;j<ps.length;j++){
        const b=ps[j];
        const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),rr=(a.down?PIN_REACH:PIN_R)+(b.down?PIN_REACH:PIN_R);
        if(d>=rr||d<1e-9)continue;
        const nx=dx/d,nz=dz/d,rvx=b.vx-a.vx,rvz=b.vz-a.vz,rel=rvx*nx+rvz*nz;
        if(rel<0){ // approaching (or one is standing and the other arrives)
          const imp=-(1+PIN_REST)*rel/2;
          b.vx+=imp*nx;b.vz+=imp*nz;a.vx-=imp*nx;a.vz-=imp*nz;
        }
        const push=(rr-d)/2;b.x+=nx*push;b.z+=nz*push;a.x-=nx*push;a.z-=nz*push;
        if(!a.down&&(Math.abs(a.vx)+Math.abs(a.vz)>0.15)){a.down=true;if(!down.includes(i))down.push(i)}
        if(!b.down&&(Math.abs(b.vx)+Math.abs(b.vz)>0.15)){b.down=true;if(!down.includes(j))down.push(j)}
        if(a.down&&!a.dx){a.dx=Math.sign(a.vx)||1;a.dz=Math.sign(a.vz)||1}
        if(b.down&&!b.dx){b.dx=Math.sign(b.vx)||1;b.dz=Math.sign(b.vz)||1}
      }
    }
    // integrate falling pins + friction
    for(let i=0;i<ps.length;i++){
      const p=ps[i];if(!p.down)continue;
      p.x+=p.vx*SIM_DT;p.z+=p.vz*SIM_DT;
      const k=Math.exp(-SIM_DT/PIN_DAMP);p.vx*=k;p.vz*=k;
      p.fall=Math.min(1,p.fall+SIM_DT*3.2);
      if(p.x<-LANE_W/2-PIN_R||p.x>LANE_W/2+PIN_R||p.z<DECK_BACK-PIN_GAP*4||p.z>MAX_Z){p.vx=p.vz=0}
    }
    // 60 Hz playback snapshots
    if(++sample%2===0){
      frames.push({t,bx:ballX(bz,aim,hk)+deflect,bz,p:ps.map(p=>({x:p.x,z:p.z,down:p.down,fall:p.fall,dx:p.dx,dz:p.dz}))});
    }
    if(bz>=MAX_Z&&ps.every(p=>!p.down||(p.vx*p.vx+p.vz*p.vz<1e-3)))break;
  }
  return {down:down.filter(i=>standing[i]).sort((a,b)=>a-b),frames,endT:t,speed,aim,hook:hk,standing:standing.slice(),gutter};
}
interface PIN_POS{x:number;z:number;vx:number;vz:number;down:boolean;fall:number;dx:number;dz:number}
// segment (x0,z0)-(x1,z1) vs circle (cx,cz,r): returns the closest point on the segment if it intersects
function segCircle(x0:number,x1:number,z0:number,z1:number,cx:number,cz:number,r:number){
  const vx=x1-x0,vz=z1-z0,l2=vx*vx+vz*vz;
  const k=l2?clamp(((cx-x0)*vx+(cz-z0)*vz)/l2,0,1):0;
  const x=x0+vx*k,z=z0+vz*k;
  return Math.hypot(x-cx,z-cz)<=r?{x,z}:null;
}

// ---------- frames, turns and real ten-pin scoring ----------
export interface Series{
  n:number;frames:number;p:number;f:number;done:boolean;
  frameRolls:number[][][]; // [player][frame] = pins per roll (1-3 rolls in the last frame)
  rack:boolean[];          // pins standing before the NEXT throw (ids)
  splits:boolean[][];      // [player][frame] = the first roll left a split
}
export const newSeries=(n:number,frames:number=DEFAULT_FRAMES):Series=>({
  n:Math.min(4,Math.max(1,n)),frames:frames===5?5:3,p:0,f:0,done:false,
  frameRolls:Array.from({length:Math.min(4,Math.max(1,n))},()=>Array.from({length:frames===5?5:3},()=>[] as number[])),
  rack:Array(10).fill(true),splits:Array.from({length:Math.min(4,Math.max(1,n))},()=>Array(frames===5?5:3).fill(false) as boolean[]),
});
export const turnOf=(s:Series)=>{const p=s.done?Math.max(0,s.n-1):s.p;return {p,f:s.done?s.frames-1:s.f,roll:s.done?0:s.frameRolls[p][s.f].length}};
export const lastFrame=(s:Series)=>s.f===s.frames-1;
export const rackCount=(s:Series)=>s.rack.filter(Boolean).length;
// how many balls this frame can use: 2, or 3 in the last frame (a strike / spare earns the extra ball)
export const maxRolls=(s:Series)=>lastFrame(s)?3:2;
// after a throw: push the pins, update the rack and advance the turn. `down` = pin ids knocked by this throw.
// Turn order: one player completes their frame (2 balls, or the last frame's bonus balls), then the next player.
export function addRoll(s:Series,down:number[]):{over:boolean;reset:boolean;strike:boolean;spare:boolean}{
  if(s.done)return {over:true,reset:false,strike:false,spare:false};
  const fr=s.frameRolls[s.p][s.f], pins=down.filter(i=>i>=0&&i<10).length;
  fr.push(pins);
  for(const i of down)s.rack[i]=false;
  const first=fr[0],marks=rollMarks(fr);
  const strike=marks[marks.length-1]==="X", spare=marks[marks.length-1]==="/";
  let over:boolean;
  if(!lastFrame(s))over=fr.length>=2||first===10;
  else over=fr.length>=3||(fr.length===2&&first!==10&&first+fr[1]!==10);
  let reset=false;
  if(!over){
    // the last frame's bonus rack after a strike / spare; the second ball of a normal frame leaves the pins up
    reset=lastFrame(s)&&((fr.length===1&&first===10)||(fr.length===2&&(first===10&&fr[1]===10||first!==10&&first+fr[1]===10)));
  }else{
    if(s.p+1<s.n)s.p++;                        // next player, same frame (also the last frame)
    else if(s.f+1<s.frames){s.p=0;s.f++}       // next frame
    else{s.p=s.n;s.done=true}                  // series over
    reset=!s.done;                             // every new player/frame starts from a full rack
  }
  if(reset||s.done)s.rack=Array(10).fill(true);
  return {over,reset,strike,spare};
}
// a rack left after the first ball, for the split call (the head pin down + two pins on opposite sides with a gap)
export function isSplit(standing:boolean[]){
  const on=standing.map((v,i)=>v?i:-1).filter(i=>i>=0);
  if(on.includes(0)||on.length<2)return false;
  let best=Infinity;
  for(const a of on)for(const b of on){
    if(PINS[a][0]<-1e-9&&PINS[b][0]>1e-9)best=Math.min(best,Math.hypot(PINS[a][0]-PINS[b][0],PINS[a][1]-PINS[b][1]));
  }
  return Number.isFinite(best)&&best>0.36; // 2-3 (0.305) is not a split; 4-6 (0.61), 3-10, 7-10 are
}
// frame scores with real bonuses. frameScores[f] = null until the frame can be scored (bonus rolls not thrown yet).
export interface Card{totals:number[];frameScores:(number|null)[][];strikes:number[];spares:number[];open:number[]}
export function scoreCard(s:Series):Card{
  const totals:number[]=[],frameScores:(number|null)[][]=[],strikes:number[]=[],spares:number[]=[],open:number[]=[];
  for(let p=0;p<s.n;p++){
    const fr=s.frameRolls[p],flat:number[]=fr.flat();
    const starts:number[]=[];let k=0;for(const f of fr){starts.push(k);k+=f.length}
    const out:(number|null)[]=[];let total=0,st=0,sp=0,op=0;
    for(let f=0;f<s.frames;f++){
      const rolls=fr[f],si=starts[f];
      let val:number|null=null;
      if(f===s.frames-1){
        if(rolls.length>=2)val=rolls.reduce((a,b)=>a+b,0);
        const marks=rollMarks(rolls);
        if(marks.includes("X"))st++;
        if(marks.includes("/"))sp++;
      }else if(rolls.length>=1&&rolls[0]===10){
        if(flat.length>=si+3)val=10+flat[si+1]+flat[si+2];
        st++;
      }else if(rolls.length>=2&&rolls[0]+rolls[1]===10){
        if(flat.length>=si+3)val=10+flat[si+2];
        sp++;
      }else if(rolls.length>=2){
        val=rolls[0]+rolls[1];op++;
      }
      out.push(val);
      if(val!=null)total+=val;
    }
    totals.push(total);frameScores.push(out);strikes.push(st);spares.push(sp);open.push(op);
  }
  return {totals,frameScores,strikes,spares,open};
}
export const rank=(totals:number[]):{i:number;total:number;place:number}[]=>{
  const order=totals.map((_,i)=>i).sort((a,b)=>totals[b]-totals[a]||a-b);
  let place=1;
  return order.map((i,k)=>{if(k&&totals[i]<totals[order[k-1]])place=k+1;return {i,total:totals[i],place}});
};
// "X" / "/" / "–" / digit for one roll; used by the HUD and the results table. `last` = the 10th-frame-style
// bonus rack: a 10 after a strike/spare starts a fresh rack (a strike), everywhere else a second-ball 10 is a spare.
export function rollMarks(rolls:number[]){
  const out:string[]=[];
  let fresh=true;
  for(let i=0;i<rolls.length;i++){
    const n=rolls[i];
    if(n===10&&fresh){out.push("X");fresh=true}
    else if(i>0&&!fresh&&rolls[i-1]!==10&&rolls[i-1]+n===10){out.push("/");fresh=true}
    else{out.push(n===0?"–":String(n));fresh=false}
  }
  return out;
}
// the best series for the setup card / a new-record badge: the best player total on this phone for the same
// number of frames (a 3-frame total cannot fairly beat a 5-frame one)
export const bestTotal=(rows:{mode?:string;players:number;bwFrames?:number;bwTotals?:number[]}[],frames:number)=>{
  let best=0;
  for(const g of rows)if(g.mode==="bowling"&&g.bwFrames===frames){
    for(let i=0;i<Math.min(4,g.players);i++)best=Math.max(best,g.bwTotals?.[i]??0);
  }
  return best;
};
