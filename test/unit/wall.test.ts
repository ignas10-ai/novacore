// Siena (src/wall/logic.ts): time curve, kinds by round, seeded walls, every wall forces a move and has a way out,
// inside test (visibility, NaN, edge tolerance), round clock (pause when lost, jitter, verdict), scoring + ranking.
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import type {Lm} from "../../src/detect/classifier.ts";
import {rngFrom} from "../../src/boxing/logic.ts";
import {T0,T_MIN,T_EXTRA,LOST_S,POOL,kindsAt,secsFor,bodyOf,wallFor,inside,newRound,track,advance,verdict,newScore,addRound,rank,
  type Body,type Kind,type Wall} from "../../src/wall/logic.ts";

const AR=16/9;
// a standing front-view figure in frame-height units: centre X, shoulder line sy, torso u (feet at sy+2.5u)
function figure(X:number,sy=0.3,u=0.18,o:{vis?:number;squat?:number;liftL?:number;liftR?:number}={}):Lm[]{
  const lm:Lm[]=Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:0.05}));
  const d=(o.squat??0)*u; // a squat moves the upper body down
  const put=(i:number,px:number,py:number,v=o.vis??0.99)=>{lm[i]={x:1-px/AR,y:py,z:0,visibility:v}};
  put(0,X,sy-0.35*u+d);
  put(11,X-0.38*u,sy+d);put(12,X+0.38*u,sy+d);
  put(13,X-0.45*u,sy+0.45*u+d);put(14,X+0.45*u,sy+0.45*u+d);
  put(15,X-0.45*u,sy+0.85*u+d);put(16,X+0.45*u,sy+0.85*u+d);
  put(23,X-0.22*u,sy+u+d);put(24,X+0.22*u,sy+u+d);
  put(25,X-0.22*u,sy+1.75*u-(o.liftL??0)*u*0.6);put(26,X+0.22*u,sy+1.75*u-(o.liftR??0)*u*0.6);
  put(27,X-0.22*u,sy+2.5*u-(o.liftL??0)*u);put(28,X+0.22*u,sy+2.5*u-(o.liftR??0)*u);
  return lm;
}
const bodyAt=(X:number)=>bodyOf(figure(X),AR)!;
// a plausible way out for each kind: where to stand / how to bend
function escape(w:Wall,b:Body):Lm[]{
  const need=2*b.hw+0.25*b.u, ar=AR;
  const gapX=()=>{ // centre of the widest free column (the hole, or beside a side wall / pillar)
    const xs=[0,ar,...w.rects.filter(r=>r.y1>=1&&r.y0<=0).flatMap(r=>[r.x0,r.x1])].sort((a,b)=>a-b);
    let best=[0,0];for(let i=0;i<xs.length-1;i++){const a=xs[i],c=xs[i+1];const free=!w.rects.some(r=>r.y1>=1&&r.y0<=0&&r.x0<=a+1e-9&&r.x1>=c-1e-9);if(free&&c-a>best[1]-best[0])best=[a,c]}
    expect(best[1]-best[0],`room for the body (${w.kind})`).toBeGreaterThanOrEqual(need-1e-9);
    return (best[0]+best[1])/2;
  };
  switch(w.kind){
    case "duck":return figure(b.cx,b.sy,b.u,{squat:0.75});
    case "duckL":case "duckR":case "holeDuck":return figure(gapX(),b.sy,b.u,{squat:0.75});
    case "legL":return figure(b.cx,b.sy,b.u,{liftL:1});
    case "legR":return figure(b.cx,b.sy,b.u,{liftR:1});
    default:return figure(gapX(),b.sy,b.u);
  }
}

describe("time curve",()=>{
  it("starts at 5 s, shrinks every round, never below the floor",()=>{
    expect(secsFor(1)).toBe(T0);
    let prev=99;
    for(let r=1;r<40;r++){const s=secsFor(r);expect(s).toBeLessThanOrEqual(prev);expect(s).toBeGreaterThanOrEqual(T_MIN);prev=s}
    expect(secsFor(30)).toBe(T_MIN);
    expect(secsFor(4)).toBeCloseTo(3.41,2);
  });
  it("gives two-move walls a little extra",()=>{
    expect(secsFor(9,"hole")).toBeCloseTo(secsFor(9)+T_EXTRA,9);
    expect(secsFor(9,"left")).toBe(secsFor(9));
  });
});

describe("walls by round",()=>{
  it("unlocks kinds over the rounds and introduces each new group on its first round",()=>{
    expect(kindsAt(1)).toEqual(["left","right"]);
    expect(kindsAt(4)).toContain("duck");
    expect(kindsAt(6)).not.toContain("hole");
    expect(kindsAt(9)).toContain("holeDuck");
    const b=bodyAt(AR/2);
    for(const [r,ks] of POOL)for(let s=1;s<30;s++)expect(ks,`round ${r} seed ${s}`).toContain(wallFor(r,rngFrom(s),b,AR).kind);
  });
  it("is the same sequence for the same seed (every player of a game) and differs between seeds",()=>{
    const seq=(seed:number)=>{const rng=rngFrom(seed);let prev:Kind|""="";return Array.from({length:14},(_,i)=>{const w=wallFor(i+1,rng,bodyAt(AR/2),AR,prev);prev=w.kind;return w.kind})};
    expect(seq(7)).toEqual(seq(7));
    expect(new Set([1,2,3,4,5].map(s=>seq(s).join())).size).toBeGreaterThan(1);
  });
  it("draws the RNG exactly twice per wall, even when the wall had to flip or fall back",()=>{
    const count=(X:number)=>{let n=0;const r=rngFrom(3),c=()=>{n++;return r()};for(let i=1;i<=12;i++)wallFor(i,c,bodyAt(X),AR);return n};
    expect(count(AR/2)).toBe(24);expect(count(AR*0.9)).toBe(24);
  });
  it("never repeats the previous kind when there is a choice",()=>{
    for(let s=1;s<60;s++){const w=wallFor(4,rngFrom(s),bodyAt(AR/2),AR,"duck");expect(w.kind).not.toBe("duck")}
  });
  it("flips a side wall that has no room (player at the edge) and stays inside the frame",()=>{
    for(let s=1;s<40;s++){
      const atRight=wallFor(1,rngFrom(s),bodyAt(AR*0.9),AR), atLeft=wallFor(1,rngFrom(s),bodyAt(AR*0.1),AR);
      expect(atRight.kind,"standing on the right: the wall comes from the right").toBe("right");
      expect(atLeft.kind).toBe("left");
      for(const w of [atRight,atLeft])for(const r of w.rects){expect(r.x0).toBeGreaterThanOrEqual(0);expect(r.x1).toBeLessThanOrEqual(AR);expect(r.y1).toBeLessThanOrEqual(1)}
    }
  });
  it("a leg wall needs visible feet (else another kind)",()=>{
    const lm=figure(AR/2);lm[27].visibility=0.1;lm[28].visibility=0.1;
    const b=bodyOf(lm,AR)!;expect(b.ay).toBeNull();
    for(let s=1;s<40;s++)expect(["legL","legR"]).not.toContain(wallFor(7,rngFrom(s),b,AR).kind);
  });
});

describe("every wall catches a standing player and has a way out",()=>{
  const where=[AR*0.35,AR/2,AR*0.62];
  for(let round=1;round<=12;round++)it(`round ${round}`,()=>{
    for(const X of where)for(let s=1;s<25;s++){
      const lm=figure(X),b=bodyOf(lm,AR)!,w=wallFor(round,rngFrom(s*31+round),b,AR);
      expect(inside(lm,AR,w,b.u).length,`${w.kind} at ${X.toFixed(2)} must force a move`).toBeGreaterThan(0);
      const out=escape(w,b);
      expect(inside(out,AR,w,b.u),`${w.kind}: the escape pose is safe`).toEqual([]);
    }
  });
});

describe("inside test",()=>{
  const w:Wall={kind:"left",rects:[{x0:0,y0:0,x1:0.8,y1:1}],secs:5,feet:false};
  it("ignores low-visibility and non-finite points",()=>{
    const lm=figure(1.3);lm[15]={x:1-0.5/AR,y:0.5,z:0,visibility:0.2}; // a ghost wrist deep in the wall
    expect(inside(lm,AR,w,0.18)).toEqual([]);
    lm[15]={x:NaN,y:0.5,z:0,visibility:0.99};
    expect(inside(lm,AR,w,0.18)).toEqual([]);
    lm[15]={x:1-0.5/AR,y:0.5,z:0,visibility:0.99};
    expect(inside(lm,AR,w,0.18)).toEqual([15]);
  });
  it("a point just over the edge (less than the tolerance) does not count",()=>{
    const lm=figure(1.3);lm[15]={x:1-(0.8-0.005)/AR,y:0.5,z:0,visibility:0.99};
    expect(inside(lm,AR,w,0.18)).toEqual([]);
    lm[15]={x:1-(0.8-0.03)/AR,y:0.5,z:0,visibility:0.99};
    expect(inside(lm,AR,w,0.18)).toEqual([15]);
  });
  it("needs shoulders + hips to call the body seen",()=>{
    const lm=figure(AR/2);lm[23].visibility=0.2;
    expect(bodyOf(lm,AR)).toBeNull();
    expect(bodyOf(null,AR)).toBeNull();
  });
});

describe("round clock and verdict",()=>{
  const w=(secs=2):Wall=>({kind:"left",rects:[{x0:0,y0:0,x1:0.9,y1:1}],secs,feet:false});
  const run=(r:ReturnType<typeof newRound>,frames:number,lm:(k:number)=>Lm[]|null,dt=1/30)=>{let v="";for(let k=0;k<frames&&!v;k++){track(r,lm(k),AR);v=advance(r,dt)}return v};
  it("a player who gets out in time is safe; reaction = when they got out",()=>{
    const r=newRound(w());
    expect(run(r,90,k=>figure(k<20?0.6:1.4))).toBe("safe");
    expect(r.safeAt).toBeCloseTo(20/30,2);
  });
  it("a player still inside at the deadline is caught",()=>{
    const r=newRound(w());
    expect(run(r,90,k=>figure(k<50?1.4:0.6))).toBe("caught");
  });
  it("pauses while the body is not seen - never a fail, the clock waits",()=>{
    const r=newRound(w(1));
    expect(run(r,10,()=>figure(0.6))).toBe("");
    const t=r.t;
    expect(run(r,120,()=>null)).toBe(""); // 4 s nobody in frame
    expect(r.seen).toBe(false);
    expect(r.t).toBeLessThan(t+LOST_S+0.05);
    expect(run(r,60,()=>figure(1.4))).toBe("safe"); // back in the frame, already out
  });
  it("a lost core point also pauses (shoulders/hips below visibility)",()=>{
    const r=newRound(w(1));
    expect(run(r,60,()=>figure(0.6,0.3,0.18,{vis:0.3}))).toBe("");
    expect(r.seen).toBe(false);
  });
  it("jitter on the edge: one stray inside sample in the last window does not catch",()=>{
    const r=newRound(w(1));
    expect(run(r,40,k=>figure(k%3===0?0.6:1.4))).toBe("safe");
    expect(verdict({...newRound(w(1)),t:1,hist:[0.8,1,0.9,1,1,0]})).toBe("caught");
    expect(verdict({...newRound(w(1)),t:1,hist:[0.8,1,0.9,0,1,1]})).toBe("caught");
    expect(verdict({...newRound(w(1)),t:1,hist:[0.8,1,0.9,1,1,0,1,0]})).toBe("safe"); // 1 of 3 in the window
  });
  it("returns the verdict only once",()=>{
    const r=newRound(w(0.1));
    expect(run(r,10,()=>figure(1.4))).toBe("safe");
    expect(advance(r,1)).toBe("");
    expect(track(r,figure(0.5),AR)).toBe(false);
  });
});

describe("scoring and ranking",()=>{
  const sc=(rounds:number,react=0,secs=0)=>({...newScore(),rounds,react,secs});
  it("counts survived rounds, time survived (the caught round too) and reaction",()=>{
    const s=newScore(),r=newRound({kind:"duck",rects:[],secs:4,feet:false});r.safeAt=1.25;
    addRound(s,r,"safe");addRound(s,{...r,safeAt:-1},"caught");
    expect(s).toEqual({rounds:1,secs:8,react:1.25});
  });
  it("most rounds win, faster reaction breaks a tie, identical results share the place",()=>{
    expect(rank([sc(3),sc(7),sc(5)]).map(p=>p.i)).toEqual([1,2,0]);
    expect(rank([sc(4,6),sc(4,5.5)]).map(p=>[p.i,p.place])).toEqual([[1,1],[0,2]]);
    expect(rank([sc(4,5),sc(4,5.001),sc(2)]).map(p=>[p.i,p.place])).toEqual([[0,1],[1,1],[2,3]]);
    expect(rank([sc(0),sc(0)]).map(p=>p.place)).toEqual([1,1]);
  });
});

describe("real clips (tools/fixtures): the walls fit a real body",()=>{
  const clip=(name:string)=>{const fx=JSON.parse(readFileSync(new URL(`../../tools/fixtures/${name}.json`,import.meta.url),"utf8"));
    return {ar:fx.w/fx.h,frames:fx.frames.filter((f:any)=>f.p[0]).map((f:any)=>(f.p[0] as number[][]).map(([x,y,visibility,z=0])=>({x,y,z,visibility})) as Lm[])}};
  // share of the clip's frames in which the player is OUT of this wall, built from the first frame's body
  const freeShare=(name:string,kind:Kind)=>{
    const {ar,frames}=clip(name),b=bodyOf(frames[0],ar)!;
    const rounds:Partial<Record<Kind,number>>={left:1,duck:3,legL:7,legR:7};
    let w:Wall|null=null;for(let s=1;s<400&&!w;s++){const x=wallFor(rounds[kind]??1,rngFrom(s),b,ar);if(x.kind===kind)w=x}
    expect(inside(frames[0],ar,w!,b.u).length,`${name}: the ${kind} wall catches the starting pose`).toBeGreaterThan(0);
    let free=0,seen=0;for(const lm of frames){const bb=bodyOf(lm,ar);if(!bb)continue;seen++;if(!inside(lm,ar,w!,bb.u).length)free++}
    return free/seen;
  };
  it("a real squat gets under the low bar, jumping jacks (arms up) never do",()=>{
    for(const c of ["squat","squat3"])expect(freeShare(c,"duck"),c).toBeGreaterThan(0.25);
    expect(freeShare("jack2","duck")).toBe(0);
  });
  it("standing in place never escapes a side wall, side steps do",()=>{
    for(const c of ["jack2","knees","squat"])expect(freeShare(c,"left"),c).toBe(0);
    expect(freeShare("sidestep","left")).toBeGreaterThan(0.2);
  });
  it("high knees lift a foot out of the leg wall, a squat does not",()=>{
    expect(freeShare("knees","legL")).toBeGreaterThan(0.15);
    expect(freeShare("squat","legL")).toBe(0);
  });
});
