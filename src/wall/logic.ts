// Siena (Hole in the wall; spec: Martynas, #4 / issue #21). PURE: no DOM (test/unit/wall.test.ts).
// Space = mirrored screen space in frame-HEIGHT units like src/boxing: X=(1-lm.x)*ar, Y=lm.y (ar = frame width/height),
// screen-left = the player's own left (the preview is a mirror). A wall = 1-3 rectangles built around where the player
// stands when it appears, so it always forces a move (step aside, duck, lift a leg, get into the hole). The kind comes
// from a seeded RNG by round with exactly two draws per wall, so every player of one game gets the same sequence.
// The player has secsFor(round) to get every tracked point OUT. The clock runs only while the body is seen (lost =
// pause, never a fail). Verdict at the deadline = the majority of the samples in the last JUDGE_S, and a point counts as
// inside only when it is TOL deep in a rectangle, so detector jitter on the edge does not catch anyone.
import type {Lm} from "../detect/classifier.ts";
import {VIS} from "../detect/exercises.ts";

export type Kind="left"|"right"|"duck"|"pillar"|"duckL"|"duckR"|"hole"|"holeDuck"|"legL"|"legR";
export interface Rect{x0:number;y0:number;x1:number;y1:number}
export interface Wall{kind:Kind;rects:Rect[];secs:number;feet:boolean} // feet: a leg wall, the ankles must be seen
// cx = body centre X, sy = shoulder line Y, u = torso length, hw = half body width (arms down), ky/ay = knee/ankle Y
export interface Body{cx:number;sy:number;u:number;hw:number;ky:number|null;ay:number|null}

// ponytail: time curve + margins are first guesses for 2-3 m, tune on a phone (Martynas: start 5 s)
export const T0=5, T_K=0.88, T_MIN=1.2, T_EXTRA=0.5; // 5 · 4.4 · 3.9 · 3.4 · 3.0 · 2.6 · 2.3 · 2.0 · 1.8 · 1.6 · 1.4 · 1.2 s
export const TOL_U=0.06, TOL_MIN=0.012; // a point is inside only this deep (torso units, at least TOL_MIN frame heights)
export const JUDGE_S=0.25, LOST_S=0.5;  // verdict window; no valid pose for LOST_S = "Grįžk į kadrą" (clock paused)
export const SIDE_U=0.25, DUCK_U=0.15, PILLAR_U=0.3, ROOM_U=0.25, HOLE_U=0.3, EDGE=0.02;
export const PTS=[0,11,12,13,14,15,16,23,24,25,26,27,28]; // nose, shoulders, elbows, wrists, hips, knees, ankles
const TWO:Kind[]=["duckL","duckR","hole","holeDuck"]; // two moves at once: a little more time
// [first round, kinds unlocked then]; the round a kind unlocks always shows one of the new kinds
export const POOL:[number,Kind[]][]=[[1,["left","right"]],[3,["duck"]],[5,["pillar","duckL","duckR"]],[7,["hole","legL","legR"]],[9,["holeDuck"]]];
export const kindsAt=(round:number)=>POOL.filter(([r])=>round>=r).flatMap(([,k])=>k);
export const secsFor=(round:number,kind?:Kind)=>Math.max(T_MIN,T0*T_K**(Math.max(1,round)-1))+(kind&&TWO.includes(kind)?T_EXTRA:0);

const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;
// shoulders + hips are required (the player must be seen); knees/ankles only for the leg walls
export function bodyOf(lm:Lm[]|null|undefined,ar:number):Body|null{
  if(!lm)return null;
  const [a,b,h1,h2]=[lm[11],lm[12],lm[23],lm[24]];
  if(!ok(a)||!ok(b)||!ok(h1)||!ok(h2))return null;
  const X=(p:Lm)=>(1-p.x)*ar;
  const sx=(X(a)+X(b))/2,sy=(a.y+b.y)/2,hx=(X(h1)+X(h2))/2,hy=(h1.y+h2.y)/2,sw=Math.hypot(X(a)-X(b),a.y-b.y);
  const u=Math.max(Math.hypot(hx-sx,hy-sy),sw);
  if(!(u>0.02))return null;
  const both=(i:number,j:number)=>ok(lm[i])&&ok(lm[j])?(lm[i].y+lm[j].y)/2:null;
  return {cx:(sx+hx)/2,sy,u,hw:Math.max(0.45*u,sw/2+0.1*u),ky:both(25,26),ay:both(27,28)};
}

const R=(x0:number,y0:number,x1:number,y1:number):Rect=>({x0,y0,x1,y1});
// rectangles for this kind around body b, or null when the frame has no room for the way out (r = the side draw)
function build(k:Kind,b:Body,ar:number,r:number):Rect[]|null{
  const need=2*b.hw+ROOM_U*b.u, L=b.cx+SIDE_U*b.u, Rt=b.cx-SIDE_U*b.u, yb=Math.min(0.85,b.sy+DUCK_U*b.u);
  const okL=ar-L>=need, okR=Rt>=need; // room right of a left wall / left of a right wall
  switch(k){
    case "left":return okL?[R(0,0,L,1)]:null;
    case "right":return okR?[R(Rt,0,ar,1)]:null;
    case "duck":return [R(0,0,ar,yb)]; // a low bar from the top: squat under it
    case "duckL":return okL?[R(0,0,L,1),R(L,0,ar,yb)]:null;
    case "duckR":return okR?[R(Rt,0,ar,1),R(0,0,Rt,yb)]:null;
    case "pillar":{const p0=b.cx-PILLAR_U*b.u,p1=b.cx+PILLAR_U*b.u;return p0>=need||ar-p1>=need?[R(p0,0,p1,1)]:null}
    case "hole":case "holeDuck":{ // walls on both sides, the gap next to the player (not where they stand)
      const w=need+HOLE_U*b.u, right=L+w<=ar-EDGE, left=Rt-w>=EDGE;
      if(!right&&!left)return null;
      const h0=right&&(!left||r<0.5)?L:Rt-w, h1=h0+w;
      return [R(0,0,h0,1),R(h1,0,ar,1),...(k==="holeDuck"?[R(h0,0,h1,yb)]:[])];
    }
    case "legL":case "legR":{ // a low wall over one leg from mid-shin down: lift that leg (or step over to the other side)
      if(b.ky==null||b.ay==null)return null;
      const y=b.ky+0.5*(b.ay-b.ky);
      return [k==="legL"?R(0,y,b.cx,1):R(b.cx,y,ar,1)];
    }
  }
}
const FALLBACK:Kind[]=["left","right","duck"]; // "duck" always fits
// the wall for this round; rng is drawn exactly twice (kind, side) whatever happens, so the sequence stays shared
export function wallFor(round:number,rng:()=>number,b:Body,ar:number,prev:Kind|""=""):Wall{
  const r1=rng(),r2=rng();
  const intro=POOL.find(([r])=>r===round)?.[1];
  const all=kindsAt(round), ks=intro??(all.filter(k=>k!==prev).length?all.filter(k=>k!==prev):all);
  const want=ks[Math.floor(r1*ks.length)%ks.length];
  // a side wall that does not fit flips to the other side before the generic fallback
  const flip:Kind[]=want==="left"?["right"]:want==="right"?["left"]:want==="duckL"?["duckR"]:want==="duckR"?["duckL"]:want==="legL"?["legR"]:want==="legR"?["legL"]:[];
  for(const k of [want,...flip,...FALLBACK]){const rects=build(k,b,ar,r2);if(rects)return {kind:k,rects,secs:secsFor(round,k),feet:k==="legL"||k==="legR"}}
  throw new Error("unreachable");
}

// tracked points inside the wall (indices into lm); low-visibility / non-finite points are ignored
export function inside(lm:Lm[],ar:number,w:Wall,u:number):number[]{
  const tol=Math.max(TOL_MIN,TOL_U*u),out:number[]=[];
  for(const i of PTS){
    const p=lm[i];if(!ok(p))continue;
    const X=(1-p.x)*ar,Y=p.y;
    if(w.rects.some(r=>X>r.x0+tol&&X<r.x1-tol&&Y>r.y0+tol&&Y<r.y1-tol))out.push(i);
  }
  return out;
}

// ---------- one round: the clock (seen time only), samples, verdict ----------
export type Verdict=""|"safe"|"caught";
// t = round clock (s, only while seen), since = real time since the last valid pose, hits = points inside now,
// hist = flat [t, inside 0/1] samples, safeAt = round time the player got (and stayed) out, -1 = inside now
export interface Round{w:Wall;t:number;since:number;seen:boolean;hits:number[];hist:number[];safeAt:number;res:Verdict}
export const newRound=(w:Wall):Round=>({w,t:0,since:0,seen:true,hits:[],hist:[],safeAt:-1,res:""});
// a fresh camera pose (or null = nobody). Returns false when it does not count as seen (core or, for a leg wall, feet lost)
export function track(r:Round,lm:Lm[]|null,ar:number):boolean{
  if(r.res)return false;
  const b=bodyOf(lm,ar);
  if(!b||(r.w.feet&&b.ay==null))return false;
  r.since=0;r.seen=true;
  r.hits=inside(lm!,ar,r.w,b.u);
  const inn=r.hits.length>0;
  if(inn)r.safeAt=-1;else if(r.safeAt<0)r.safeAt=r.t;
  r.hist.push(r.t,inn?1:0);
  while(r.hist.length>2&&r.hist[0]<r.t-1)r.hist.splice(0,2);
  return true;
}
// every frame (real seconds). Returns the verdict once, at the deadline; "" while running or paused
export function advance(r:Round,dt:number):Verdict{
  if(r.res)return "";
  r.since+=dt;r.seen=r.since<LOST_S;
  if(!r.seen)return "";
  r.t=Math.min(r.w.secs,r.t+dt);
  return r.t>=r.w.secs?(r.res=verdict(r)):"";
}
// caught = more than half of the samples in the last JUDGE_S had a point inside (a tie = benefit of the doubt)
export function verdict(r:Round):"safe"|"caught"{
  const h=r.hist;let n=0,k=0;
  for(let i=0;i<h.length;i+=2)if(h[i]>=r.t-JUDGE_S-1e-9){n++;k+=h[i+1]}
  if(!n&&h.length){n=1;k=h[h.length-1]} // a slow camera: the last sample decides
  return k*2>n?"caught":"safe";
}

// ---------- the game: one run per player (turns like the long jump), longest survival wins ----------
// rounds = walls survived, secs = time survived (the caught round counts), react = summed escape time (tiebreak)
export interface Score{rounds:number;secs:number;react:number}
export const newScore=():Score=>({rounds:0,secs:0,react:0});
export function addRound(s:Score,r:Round,v:"safe"|"caught"){
  s.secs+=r.w.secs;
  if(v==="safe"){s.rounds++;s.react+=Math.max(0,r.safeAt)}
}
// most rounds first, then the faster escapes; equal rounds + equal reaction (to 10 ms) share the place
export interface Place{i:number;place:number}
const cmp=(a:Score,b:Score)=>b.rounds-a.rounds||(Math.abs(a.react-b.react)<0.005?0:a.react-b.react);
export function rank(sc:Score[]):Place[]{
  const order=sc.map((_,i)=>i).sort((a,b)=>cmp(sc[a],sc[b])||a-b), out:Place[]=[];
  order.forEach((i,k)=>out.push({i,place:k&&cmp(sc[order[k-1]],sc[i])===0?out[k-1].place:k+1}));
  return out;
}
