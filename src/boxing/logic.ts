// Boksas – daužyk taikinius: PURE target-game logic (no DOM; test/unit/boxing.test.ts).
// Space: mirrored screen space in frame-HEIGHT units, X=(1-lm.x)*ar, Y=lm.y (ar = frame width/height), so circles stay
// round and speeds are isotropic. Body unit u = torso length (shoulder mid -> hip mid), or 1.3 shoulder widths when the
// hips are out of frame (close to the camera). Targets are placed relative to the player's shoulders in u, so the game
// scales with distance; each player only gets targets in their own half (solo = the whole frame).
// A HIT = the fist (wrist + 35% of the forearm past it, the glove) passes through a target's circle while the hand is
// moving faster than MIN_SPEED u/s (a hand resting on a pad never counts), per-hand debounce HAND_COOL, a fresh target
// is armed only after ARM_S. Landmarks below VIS or non-finite are ignored: no hits, and the hand's history resets.
import type {Lm} from "../detect/classifier.ts";
import {VIS} from "../detect/exercises.ts";

export type Kind="hit"|"bomb"|"gold";
export interface Target{id:number;x:number;y:number;r:number;kind:Kind;born:number;life:number;slot:number}
export interface Hand{x:number;y:number;px:number;py:number;t:number;spd:number;ok:boolean;prev:boolean;cool:number}
export interface Body{lx:number;rx:number;cx:number;sy:number;u:number}
export interface Player{
  targets:Target[];score:number;hits:number;misses:number;bombs:number;golds:number;combo:number;best:number;
  lastSpawn:number;lastSlot:number;hands:[Hand,Hand];body:Body|null;seenAt:number;
}
export interface Game{players:number;ar:number;dur:number;rng:()=>number;p:Player[];nextId:number;t:number;top:number} // top: frame band covered by the HUD (no pads there)
// hit/gold/bomb = touched, miss = a pad expired untouched (combo lost), gone = a bomb expired (dodged, no penalty)
export type EvType="spawn"|"hit"|"gold"|"bomb"|"miss"|"gone";
export interface Ev{type:EvType;p:number;tg:Target;pts:number;combo:number;mult:number;hand:number}

export const BASE=10, GOLD_PTS=30, BOMB_PTS=-15, COMBO_STEP=5, MULT_MAX=4;
export const MIN_SPEED=1.6;   // u/s: a punch is ~3-6 u/s, a resting hand + detector jitter < 0.8
export const SPD_TAU=0.15;    // s: decaying peak speed, so a fist that slows down on the pad still counts
export const HAND_COOL=0.25;  // s: one hand cannot score twice within this
export const ARM_S=0.15;      // s: a pad cannot be hit while it pops in
export const EXT=0.35;        // glove = wrist + EXT x (wrist - elbow)
export const HIT_TOL=1.15;    // forgiveness on the radius (the glove is bigger than a point)
export const R_U=0.3, R_MIN=0.045, R_MAX=0.15; // pad radius in u, clamped in frame-height units
export const LOST_S=0.6;      // body unseen this long: no spawns, expiries do not count as misses
export const FIRST_SAFE=5;    // s: no bombs/gold at the very start
export const BOMB_P=0.12, GOLD_P=0.08;
export const MAX_DT=0.3;      // s: older hand samples are not used for speed / sweep

// pace: pads live 2.0 s -> 1.2 s, spawn every 0.9 s -> 0.4 s, 1 pad at a time first, 2 after 30% of the round
export const lifeAt=(frac:number)=>2-0.8*clamp01(frac);
export const gapAt=(frac:number)=>0.9-0.5*clamp01(frac);
export const maxActive=(frac:number)=>frac<0.3?1:2;
export const multOf=(comboBefore:number)=>Math.min(MULT_MAX,1+Math.floor(comboBefore/COMBO_STEP));

// slots around the body: [dx from the shoulder on that side (u), dy from shoulder height (u), side -1 left / 0 centre / 1 right]
export const SLOTS:[number,number,number][]=[
  [-0.45,-0.75,-1], // 0 high left
  [0.45,-0.75,1],   // 1 high right
  [0,-1.05,0],      // 2 above the head
  [-0.9,-0.1,-1],   // 3 left, shoulder height
  [0.9,-0.1,1],     // 4 right, shoulder height
  [-0.6,0.45,-1],   // 5 chest height, outside the body, left
  [0.6,0.45,1],     // 6 chest height, outside the body, right
];

function clamp01(v:number){return Math.min(1,Math.max(0,v))}
const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;
const hand=():Hand=>({x:0,y:0,px:0,py:0,t:0,spd:0,ok:false,prev:false,cool:0});
const player=():Player=>({targets:[],score:0,hits:0,misses:0,bombs:0,golds:0,combo:0,best:0,lastSpawn:-1e9,lastSlot:-1,hands:[hand(),hand()],body:null,seenAt:-1e9});

// seeded RNG for tests / replays (mulberry32)
export function rngFrom(seed:number){
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
}
export function newGame(players:number,ar:number,dur:number,rng:()=>number=Math.random):Game{
  return {players:players===2?2:1,ar:ar>0&&Number.isFinite(ar)?ar:16/9,dur,rng,p:[player(),player()],nextId:1,t:0,top:0};
}

// shoulders (11,12) are required; hips (23,24) only refine the body unit
export function bodyOf(lm:Lm[],ar:number):Body|null{
  const a=lm?.[11],b=lm?.[12];
  if(!ok(a)||!ok(b))return null;
  const ax=(1-a.x)*ar,bx=(1-b.x)*ar,sy=(a.y+b.y)/2,cx=(ax+bx)/2,sw=Math.hypot(ax-bx,a.y-b.y);
  let u=sw*1.3;
  const h1=lm[23],h2=lm[24];
  if(ok(h1)&&ok(h2)){
    const hx=((1-h1.x)+(1-h2.x))/2*ar,hy=(h1.y+h2.y)/2,torso=Math.hypot(hx-cx,hy-sy);
    u=Math.max(torso,sw); // leaning towards the camera foreshortens the torso
  }
  if(!(u>0.02))return null; // a degenerate / far-away detection
  return {lx:Math.min(ax,bx),rx:Math.max(ax,bx),cx,sy,u};
}
export function region(g:Game,i:number):[number,number]{
  return g.players===1?[0,g.ar]:i===0?[0,g.ar/2]:[g.ar/2,g.ar];
}
// slot -> pad centre + radius for this body, clamped inside the player's region and the frame
export function slotPos(b:Body,slot:number,reg:[number,number],top=0){
  const [dx,dy,side]=SLOTS[slot];
  const r=Math.min(R_MAX,Math.max(R_MIN,R_U*b.u));
  const bx=side<0?b.lx:side>0?b.rx:b.cx;
  const m=r*1.3; // the pad + its timer ring stay fully inside the frame / the player's half
  const x=Math.min(reg[1]-m,Math.max(reg[0]+m,bx+dx*b.u));
  const y=Math.min(1-m,Math.max(Math.max(0.02,top)+m,b.sy+dy*b.u));
  return {x,y,r};
}

// poses -> players. Two players: sorted by mirrored nose x (as camera.ts does); a single detected pose in a
// 2-player game goes to the half its shoulders are in (so P2 alone never plays P1's pads)
export function assign(poses:Lm[][],players:number,ar:number):(Lm[]|null)[]{
  const out:(Lm[]|null)[]=[null,null];
  const ps=(poses||[]).filter(Boolean);
  if(players===1){out[0]=ps[0]??null;return out}
  if(ps.length>=2){
    const s=ps.slice(0,2).sort((a,b)=>(1-(a[0]?.x??0.5))-(1-(b[0]?.x??0.5)));
    out[0]=s[0];out[1]=s[1];
  }else if(ps.length===1){
    const b=bodyOf(ps[0],ar),x=b?b.cx/ar:1-(ps[0][0]?.x??0.5);
    out[x<0.5?0:1]=ps[0];
  }
  return out;
}

// fist position (frame-height units) or null when the wrist is not trustworthy
export function fist(lm:Lm[],side:0|1,ar:number):[number,number]|null{
  const w=lm[side?16:15],e=lm[side?14:13];
  if(!ok(w))return null;
  const wx=(1-w.x)*ar,wy=w.y;
  if(!ok(e))return [wx,wy];
  const ex=(1-e.x)*ar,ey=e.y;
  return [wx+(wx-ex)*EXT,wy+(wy-ey)*EXT];
}
// distance from point c to the segment a-b
export function segDist(ax:number,ay:number,bx:number,by:number,cx:number,cy:number){
  const vx=bx-ax,vy=by-ay,l2=vx*vx+vy*vy;
  const k=l2?Math.min(1,Math.max(0,((cx-ax)*vx+(cy-ay)*vy)/l2)):0;
  return Math.hypot(ax+vx*k-cx,ay+vy*k-cy);
}

function spawn(g:Game,i:number,t:number,evs:Ev[]){
  const P=g.p[i],b=P.body!,frac=t/g.dur,reg=region(g,i);
  const cand:{slot:number;x:number;y:number;r:number}[]=[];
  for(let s=0;s<SLOTS.length;s++){
    if(s===P.lastSlot)continue;
    const q=slotPos(b,s,reg,g.top);
    if(P.targets.some(o=>Math.hypot(o.x-q.x,o.y-q.y)<o.r+q.r*1.2))continue;
    if(P.hands.some(h=>h.ok&&Math.hypot(h.x-q.x,h.y-q.y)<q.r*1.6))continue; // never on top of a hand
    cand.push({slot:s,...q});
  }
  if(!cand.length)return;
  const c=cand[Math.floor(g.rng()*cand.length)%cand.length];
  let kind:Kind="hit";
  if(t>=FIRST_SAFE){
    const r=g.rng();
    if(r<BOMB_P&&!P.targets.some(o=>o.kind==="bomb"))kind="bomb";
    else if(r>=BOMB_P&&r<BOMB_P+GOLD_P)kind="gold";
  }
  const tg:Target={id:g.nextId++,x:c.x,y:c.y,r:c.r,kind,born:t,life:lifeAt(frac),slot:c.slot};
  P.targets.push(tg);P.lastSpawn=t;P.lastSlot=c.slot;
  evs.push({type:"spawn",p:i,tg,pts:0,combo:P.combo,mult:multOf(P.combo),hand:-1});
}

function touch(g:Game,i:number,tg:Target,h:number,evs:Ev[]){
  const P=g.p[i];
  P.targets.splice(P.targets.indexOf(tg),1);
  if(tg.kind==="bomb"){
    const before=P.score;P.score=Math.max(0,P.score+BOMB_PTS);P.combo=0;P.bombs++;
    evs.push({type:"bomb",p:i,tg,pts:P.score-before,combo:0,mult:1,hand:h});
    return;
  }
  const mult=multOf(P.combo),pts=(tg.kind==="gold"?GOLD_PTS:BASE)*mult;
  P.combo++;P.best=Math.max(P.best,P.combo);P.hits++;if(tg.kind==="gold")P.golds++;
  P.score+=pts;
  evs.push({type:tg.kind==="gold"?"gold":"hit",p:i,tg,pts,combo:P.combo,mult,hand:h});
}

// One step. t = seconds since the round started (monotonic). poses = this camera frame's landmarks (any order), or null
// when there is no fresh frame (timers still run: expiry + spawning use the last seen body).
export function update(g:Game,t:number,poses:Lm[][]|null):Ev[]{
  const evs:Ev[]=[];
  if(!Number.isFinite(t))return evs;
  g.t=t;
  if(poses){
    const as=assign(poses,g.players,g.ar);
    for(let i=0;i<g.players;i++){
      const P=g.p[i],lm=as[i];
      const b=lm?bodyOf(lm,g.ar):null;
      if(!b){for(const h of P.hands){h.ok=false;h.prev=false;h.spd=0}continue} // lost: no hits, forget the hand history
      P.body=b;P.seenAt=t;
      for(const k of [0,1] as const){
        const h=P.hands[k],f=fist(lm!,k,g.ar);
        if(!f){h.ok=false;h.prev=false;h.spd=0;continue}
        const dt=t-h.t;
        h.prev=h.ok&&dt>0&&dt<MAX_DT;
        if(h.prev){
          const inst=Math.hypot(f[0]-h.x,f[1]-h.y)/dt/b.u;
          h.spd=Math.max(inst,h.spd*Math.exp(-dt/SPD_TAU));
          h.px=h.x;h.py=h.y;
        }else{h.spd=0;h.px=f[0];h.py=f[1]}
        h.x=f[0];h.y=f[1];h.t=t;h.ok=true;
        if(!h.prev||h.spd<MIN_SPEED||t<h.cool)continue;
        // nearest armed pad the glove swept through this frame
        let best:Target|null=null,bd=1e9;
        for(const tg of P.targets){
          if(t-tg.born<ARM_S)continue;
          const d=segDist(h.px,h.py,h.x,h.y,tg.x,tg.y);
          if(d<=tg.r*HIT_TOL&&d<bd){bd=d;best=tg}
        }
        if(best){touch(g,i,best,k,evs);h.cool=t+HAND_COOL}
      }
    }
  }
  for(let i=0;i<g.players;i++){
    const P=g.p[i],seen=t-P.seenAt<LOST_S;
    for(const tg of [...P.targets])if(t>=tg.born+tg.life){
      P.targets.splice(P.targets.indexOf(tg),1);
      if(tg.kind==="bomb")evs.push({type:"gone",p:i,tg,pts:0,combo:P.combo,mult:multOf(P.combo),hand:-1});
      else if(seen){P.combo=0;P.misses++;evs.push({type:"miss",p:i,tg,pts:0,combo:0,mult:1,hand:-1})}
      else evs.push({type:"gone",p:i,tg,pts:0,combo:P.combo,mult:multOf(P.combo),hand:-1}); // player out of view: no penalty
    }
    const frac=t/g.dur;
    if(P.body&&seen&&t<g.dur-0.5&&P.targets.length<maxActive(frac)&&t-P.lastSpawn>=gapAt(frac))spawn(g,i,t,evs);
  }
  return evs;
}

export function accuracy(P:Player){const n=P.hits+P.misses+P.bombs;return n?P.hits/n:0}
// 0 = tie / solo, 1 = P1, 2 = P2
export function winner(g:Game):0|1|2{
  if(g.players===1)return 0;
  const [a,b]=[g.p[0].score,g.p[1].score];
  return a===b?0:a>b?1:2;
}
