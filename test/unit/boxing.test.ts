// Boksas target logic (src/boxing/logic.ts): spawn positions relative to the body, hit test (min speed, sweep,
// debounce, arming), bomb / gold / combo, expiry, 2-player isolation, lost / NaN landmarks, and a real fixture.
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import type {Lm} from "../../src/detect/classifier.ts";
import {newGame,update,bodyOf,slotPos,region,assign,fist,segDist,rngFrom,multOf,lifeAt,gapAt,maxActive,accuracy,winner,
  SLOTS,onBody,BASE,GOLD_PTS,BOMB_PTS,HAND_COOL,ARM_S,R_U,EXT,type Game,type Target,type Kind} from "../../src/boxing/logic.ts";

// a standing person in MIRRORED screen space (x 0..1 left->right on screen, ar 1): torso = s, shoulders 0.75 s wide.
// l / r = screen-left / screen-right wrist (landmarks 15 / 16); elbow:false hides the elbows so the fist = the wrist.
type P2=[number,number];
function pose(cx:number,cy:number,s:number,o:{l?:P2;r?:P2;elbow?:boolean;vis?:number;hips?:boolean}={}):Lm[]{
  const v=o.vis??0.99, lm:Lm[]=Array.from({length:33},()=>({x:0.5,y:0.5,visibility:0.2}));
  const put=(j:number,X:number,Y:number,vis=v)=>{lm[j]={x:1-X,y:Y,visibility:vis}};
  put(0,cx,cy-0.45*s);
  put(11,cx-0.375*s,cy);put(12,cx+0.375*s,cy);
  if(o.hips!==false){put(23,cx-0.2*s,cy+s);put(24,cx+0.2*s,cy+s)}
  const el=o.elbow===false?0:v;
  put(13,cx-0.45*s,cy+0.45*s,el);put(14,cx+0.45*s,cy+0.45*s,el);
  const l=o.l??[cx-0.3*s,cy+0.2*s],r=o.r??[cx+0.3*s,cy+0.2*s];
  put(15,...l);put(16,...r);
  return lm;
}
const pad=(g:Game,i:number,x:number,y:number,kind:Kind="hit",born=-1,life=5,r=0.06):Target=>{
  const tg={id:g.nextId++,x,y,r,kind,born,life,slot:-1};g.p[i].targets.push(tg);g.p[i].lastSpawn=1e9;return tg; // lastSpawn: no auto spawns
};
// punch: the screen-right wrist moves from `from` to `to` over `n` frames of `dt` s starting at t0; returns all events
function punch(g:Game,t0:number,from:P2,to:P2,{n=4,dt=1/30,cx=0.5,cy=0.4,s=0.3,side="r" as "l"|"r"}={}){
  const evs=[];
  for(let k=0;k<=n;k++){
    const a=k/n,w:P2=[from[0]+(to[0]-from[0])*a,from[1]+(to[1]-from[1])*a];
    evs.push(...update(g,t0+k*dt,[pose(cx,cy,s,{[side]:w,elbow:false})]));
  }
  return evs;
}
const types=(evs:{type:string}[])=>evs.map(e=>e.type).filter(t=>t!=="spawn");

describe("body + target placement",()=>{
  it("body unit = torso with hips, 1.3 shoulder widths without",()=>{
    expect(bodyOf(pose(0.5,0.4,0.3),1)!.u).toBeCloseTo(0.3);
    expect(bodyOf(pose(0.5,0.4,0.3,{hips:false}),1)!.u).toBeCloseTo(0.75*0.3*1.3);
  });
  it("pads sit at fixed offsets from the shoulders, in body units",()=>{
    const b=bodyOf(pose(0.5,0.5,0.2),1)!, reg:[number,number]=[0,1];
    SLOTS.forEach(([dx,dy,side],s)=>{
      const q=slotPos(b,s,reg),bx=side<0?b.lx:side>0?b.rx:b.cx;
      expect(q.x).toBeCloseTo(bx+dx*b.u);expect(q.y).toBeCloseTo(b.sy+dy*b.u);expect(q.r).toBeCloseTo(R_U*b.u);
    });
    expect(slotPos(b,3,reg).x).toBeLessThan(b.lx);expect(slotPos(b,4,reg).x).toBeGreaterThan(b.rx);expect(slotPos(b,2,reg).y).toBeLessThan(b.sy-b.u);
  });
  it("no slot sits on the head, torso or a guard (Martynas #17); a pad clamped onto the body is detected",()=>{
    const b=bodyOf(pose(0.5,0.5,0.2),16/9)!;
    for(let s=0;s<SLOTS.length;s++)expect(onBody(b,slotPos(b,s,[0,16/9])),`slot ${s}`).toBe(false);
    expect(onBody(b,{x:b.cx,y:b.sy+0.3*b.u,r:0.05})).toBe(true); // chest
    expect(onBody(b,{x:b.lx,y:b.sy-0.5*b.u,r:0.05})).toBe(true); // by the face, where the gloves guard
  });
  it("scales with distance: half the size = half the offsets",()=>{
    const near=bodyOf(pose(0.5,0.5,0.24),1)!,far=bodyOf(pose(0.5,0.5,0.12),1)!;
    for(let s=0;s<SLOTS.length;s++){
      const a=slotPos(near,s,[0,1]),b=slotPos(far,s,[0,1]);
      expect(b.x-far.cx).toBeCloseTo((a.x-near.cx)/2);expect(b.y-far.sy).toBeCloseTo((a.y-near.sy)/2);
    }
  });
  it("clamped inside the player's half and the frame",()=>{
    const g=newGame(2,16/9,60), b=bodyOf(pose(0.08,0.15,0.3),1)!; // a person at the far-left top edge
    for(let s=0;s<SLOTS.length;s++){
      const q=slotPos(b,s,region(g,0));
      expect(q.x-q.r).toBeGreaterThanOrEqual(-1e-9);expect(q.x+q.r).toBeLessThanOrEqual(g.ar/2+1e-9);
      expect(q.y-q.r).toBeGreaterThanOrEqual(0);expect(q.y+q.r).toBeLessThanOrEqual(1);
    }
  });
  it("aspect ratio: x is in frame-height units",()=>{
    const b=bodyOf(pose(0.5,0.5,0.2),2)!;
    expect(b.cx).toBeCloseTo(1);expect(b.sy).toBeCloseTo(0.5);
  });
});

describe("spawning",()=>{
  it("first pad appears around the player, never on a hand, one at a time early",()=>{
    const g=newGame(1,1,60,rngFrom(1));
    const evs=update(g,0,[pose(0.5,0.45,0.3)]);
    expect(evs.filter(e=>e.type==="spawn")).toHaveLength(1);
    const tg=g.p[0].targets[0],b=g.p[0].body!;
    expect(Math.abs(tg.x-b.cx)).toBeLessThan(1.6*b.u);expect(tg.kind).toBe("hit");
    for(const h of g.p[0].hands)expect(Math.hypot(h.x-tg.x,h.y-tg.y)).toBeGreaterThan(tg.r);
    update(g,1,[pose(0.5,0.45,0.3)]);
    expect(g.p[0].targets).toHaveLength(1); // maxActive = 1 in the first 30 %
  });
  it("no pads without a body, no bombs/gold in the first seconds",()=>{
    const g=newGame(1,1,60,rngFrom(2));
    expect(update(g,0,[])).toEqual([]);
    expect(update(g,0.5,null)).toEqual([]);
    const kinds:string[]=[];
    for(let t=0;t<4.9;t+=0.1)for(const e of update(g,t,[pose(0.5,0.45,0.3)]))if(e.type==="spawn")kinds.push(e.tg.kind);
    expect(kinds.length).toBeGreaterThan(1);expect(new Set(kinds)).toEqual(new Set(["hit"]));
  });
  it("pace speeds up: shorter life, shorter gap, two pads later",()=>{
    expect(lifeAt(0)).toBe(2);expect(lifeAt(1)).toBeCloseTo(1.2);expect(lifeAt(2)).toBeCloseTo(1.2);
    expect(gapAt(1)).toBeLessThan(gapAt(0));expect(maxActive(0)).toBe(1);expect(maxActive(0.5)).toBe(2);
  });
  it("a long round mixes bombs and gold, never two bombs at once",()=>{
    const g=newGame(1,1,60,rngFrom(7)),seen:Record<string,number>={};
    for(let t=0;t<60;t+=1/30){
      const evs=update(g,t,[pose(0.5,0.45,0.3)]);
      for(const e of evs)if(e.type==="spawn")seen[e.tg.kind]=(seen[e.tg.kind]||0)+1;
      expect(g.p[0].targets.filter(x=>x.kind==="bomb").length).toBeLessThanOrEqual(1);
      expect(g.p[0].targets.length).toBeLessThanOrEqual(2);
    }
    expect(seen.hit).toBeGreaterThan(30);expect(seen.bomb).toBeGreaterThan(0);expect(seen.gold).toBeGreaterThan(0);
  });
  it("no pads in the last half second",()=>{
    const g=newGame(1,1,30,rngFrom(3));
    update(g,29.6,[pose(0.5,0.45,0.3)]);
    expect(g.p[0].targets).toHaveLength(0);
  });
});

describe("hit test",()=>{
  it("a fast punch through the pad scores BASE and starts the combo",()=>{
    const g=newGame(1,1,60);
    pad(g,0,0.85,0.35);
    const evs=punch(g,1,[0.62,0.5],[0.9,0.32]);
    expect(types(evs)).toEqual(["hit"]);
    expect(g.p[0]).toMatchObject({score:BASE,hits:1,combo:1,best:1});
  });
  it("a fast hand that passes THROUGH between two frames still counts (sweep)",()=>{
    const g=newGame(1,1,60);
    pad(g,0,0.8,0.3);
    expect(types(punch(g,1,[0.66,0.44],[0.94,0.16],{n:1}))).toEqual(["hit"]);
  });
  it("a resting / slowly drifting hand on the pad never counts",()=>{
    const g=newGame(1,1,60);
    pad(g,0,0.8,0.3,"hit",-1,60);
    for(let k=0;k<90;k++)expect(types(update(g,1+k/30,[pose(0.5,0.4,0.3,{r:[0.8,0.3],elbow:false})]))).toEqual([]);
    expect(types(punch(g,5,[0.74,0.36],[0.8,0.3],{n:30}))).toEqual([]); // ~0.3 u/s
    expect(g.p[0].hits).toBe(0);
  });
  it("detector jitter at rest is not a punch",()=>{
    const g=newGame(1,1,60,rngFrom(9)),rnd=rngFrom(10);
    pad(g,0,0.8,0.3,"hit",-1,60);
    for(let k=0;k<300;k++){
      const lm=pose(0.5,0.4,0.3,{r:[0.8,0.3]});
      for(const p of lm){p.x+=(rnd()-.5)*0.008;p.y+=(rnd()-.5)*0.008}
      update(g,1+k/30,[lm]);
    }
    expect(g.p[0].hits).toBe(0);
  });
  it("a pad cannot be hit while it pops in (ARM_S)",()=>{
    const g=newGame(1,1,60);
    pad(g,0,0.85,0.35,"hit",1);
    expect(types(punch(g,1,[0.62,0.5],[0.9,0.32],{n:3,dt:ARM_S/4}))).toEqual([]);
  });
  it("debounce: the same hand cannot score twice within HAND_COOL",()=>{
    const g=newGame(1,1,60);
    pad(g,0,0.75,0.35);pad(g,0,0.9,0.35);
    const evs=punch(g,1,[0.6,0.35],[0.98,0.35],{n:2,dt:0.05});
    expect(types(evs)).toEqual(["hit"]);
    pad(g,0,0.75,0.35);
    expect(types(punch(g,1+HAND_COOL+0.2,[0.98,0.35],[0.6,0.35],{n:2,dt:0.05}))).toEqual(["hit"]);
    expect(g.p[0].hits).toBe(2);
  });
  it("glove extension: the fist reaches EXT of the forearm past the wrist",()=>{
    const lm=pose(0.5,0.4,0.3,{r:[0.7,0.4]});lm[14]={x:1-0.6,y:0.4,visibility:1};
    const f=fist(lm,1,1)!;expect(f[0]).toBeCloseTo(0.7+0.1*EXT);expect(f[1]).toBeCloseTo(0.4);
    lm[14].visibility=0.1;expect(fist(lm,1,1)![0]).toBeCloseTo(0.7);
  });
  it("segDist",()=>{expect(segDist(0,0,1,0,0.5,0.2)).toBeCloseTo(0.2);expect(segDist(0,0,0,0,3,4)).toBe(5);expect(segDist(0,0,1,0,2,0)).toBe(1)});
});

describe("scoring: combo, gold, bomb, expiry",()=>{
  it("combo multiplier steps every 5 hits up to x4",()=>{
    expect([0,4,5,9,10,15,40].map(multOf)).toEqual([1,1,2,2,3,4,4]);
    const g=newGame(1,1,60);let t=1,pts=0;
    for(let k=0;k<6;k++){pad(g,0,0.85,0.35,"hit",t-0.5);pts=punch(g,t,[0.62,0.5],[0.9,0.32]).find(e=>e.type==="hit")!.pts;t+=1}
    expect(pts).toBe(2*BASE);expect(g.p[0].score).toBe(5*BASE+2*BASE);expect(g.p[0].best).toBe(6);
  });
  it("gold = GOLD_PTS x multiplier",()=>{
    const g=newGame(1,1,60);pad(g,0,0.85,0.35,"gold");
    const e=punch(g,1,[0.62,0.5],[0.9,0.32]).find(e=>e.type==="gold")!;
    expect(e.pts).toBe(GOLD_PTS);expect(g.p[0].golds).toBe(1);expect(g.p[0].hits).toBe(1);
  });
  it("bomb: minus points (floored at 0), combo reset, counts against accuracy",()=>{
    const g=newGame(1,1,60);
    for(let k=0;k<3;k++){pad(g,0,0.85,0.35,"hit",k);punch(g,1+k,[0.62,0.5],[0.9,0.32])}
    pad(g,0,0.85,0.35,"bomb",4);
    const e=punch(g,5,[0.62,0.5],[0.9,0.32]).find(e=>e.type==="bomb")!;
    expect(e.pts).toBe(BOMB_PTS);expect(g.p[0]).toMatchObject({score:3*BASE+BOMB_PTS,combo:0,best:3,bombs:1});
    pad(g,0,0.85,0.35,"bomb",5);punch(g,6,[0.62,0.5],[0.9,0.32]);
    expect(g.p[0].score).toBe(0);
    expect(accuracy(g.p[0])).toBeCloseTo(3/5);
  });
  it("expired pad = miss and combo lost; an expired bomb is a dodge",()=>{
    const g=newGame(1,1,60);
    pad(g,0,0.85,0.35);punch(g,1,[0.62,0.5],[0.9,0.32]);
    pad(g,0,0.1,0.1,"hit",1.2,0.5);pad(g,0,0.1,0.9,"bomb",1.2,0.5);
    const evs=update(g,1.8,[pose(0.5,0.4,0.3)]);
    expect(types(evs).sort()).toEqual(["gone","miss"]);
    expect(g.p[0]).toMatchObject({combo:0,misses:1,bombs:0,score:BASE});
  });
  it("a pad that expires while the player is out of view is not a miss",()=>{
    const g=newGame(1,1,60);
    update(g,0,[pose(0.5,0.4,0.3)]);g.p[0].targets=[];
    pad(g,0,0.85,0.35,"hit",0,2);
    for(let t=0.1;t<3;t+=0.1)update(g,t,[]); // nobody in frame
    expect(g.p[0].misses).toBe(0);expect(g.p[0].targets).toHaveLength(0);
  });
});

describe("two players",()=>{
  it("each player's pads stay in their own half",()=>{
    const g=newGame(2,16/9,60,rngFrom(4));
    for(let t=0;t<60;t+=1/15){
      update(g,t,[pose(0.5,0.4,0.3),pose(1.3,0.42,0.28)]);
      for(const tg of g.p[0].targets)expect(tg.x+tg.r).toBeLessThanOrEqual(g.ar/2+1e-9);
      for(const tg of g.p[1].targets)expect(tg.x-tg.r).toBeGreaterThanOrEqual(g.ar/2-1e-9);
    }
    expect(g.p[0].misses+g.p[1].misses).toBeGreaterThan(10);
  });
  it("P2's glove in P1's pad scores nothing for anyone",()=>{
    const g=newGame(2,1,60);
    pad(g,0,0.45,0.35);g.p[1].lastSpawn=1e9;
    const p1=pose(0.22,0.4,0.2);
    for(let k=0;k<=4;k++){
      const w:P2=[0.75-0.08*k,0.35]; // P2 (body at 0.78) punches left across the middle into P1's pad
      update(g,1+k/30,[p1,pose(0.78,0.4,0.2,{l:w,elbow:false})]);
    }
    expect(g.p[0].hits+g.p[1].hits).toBe(0);expect(g.p[0].targets).toHaveLength(1);
  });
  it("poses are assigned left -> right; a lone pose goes to the half it stands in",()=>{
    const a=pose(0.25,0.4,0.2),b=pose(0.75,0.4,0.2);
    expect(assign([b,a],2,1)).toEqual([a,b]);
    expect(assign([b],2,1)).toEqual([null,b]);
    expect(assign([a],2,1)).toEqual([a,null]);
    expect(assign([b,a],1,1)).toEqual([b,null]);
  });
  it("winner",()=>{
    const g=newGame(2,1,60);g.p[0].score=50;g.p[1].score=70;expect(winner(g)).toBe(2);
    g.p[1].score=50;expect(winner(g)).toBe(0);expect(winner(newGame(1,1,60))).toBe(0);
  });
});

describe("lost / broken landmarks",()=>{
  it("low-visibility wrist never scores",()=>{
    const g=newGame(1,1,60);pad(g,0,0.85,0.35);
    for(let k=0;k<=4;k++){
      const lm=pose(0.5,0.4,0.3,{r:[0.62+0.07*k,0.5-0.045*k],elbow:false});lm[16].visibility=0.2;
      update(g,1+k/30,[lm]);
    }
    expect(g.p[0].hits).toBe(0);
  });
  it("NaN landmarks are ignored (no throw, no hit, no NaN state)",()=>{
    const g=newGame(1,1,60);pad(g,0,0.85,0.35);
    const lm=pose(0.5,0.4,0.3,{r:[0.9,0.32]});lm[16]={x:NaN,y:NaN,visibility:1};
    expect(()=>update(g,1,[lm])).not.toThrow();
    const bad=pose(0.5,0.4,0.3);bad[11]={x:NaN,y:0.4,visibility:1};
    expect(update(g,1.05,[bad]).filter(e=>e.type!=="spawn")).toEqual([]);
    expect(()=>update(g,NaN,[lm])).not.toThrow();
    for(const h of g.p[0].hands){expect(Number.isFinite(h.spd)).toBe(true)}
    expect(g.p[0].hits).toBe(0);
  });
  it("a hand that reappears somewhere else is not a punch (history reset on lost frames)",()=>{
    const g=newGame(1,1,60);pad(g,0,0.85,0.35,"hit",-1,60);
    update(g,1,[pose(0.5,0.4,0.3,{r:[0.62,0.6],elbow:false})]);
    const gone=pose(0.5,0.4,0.3,{r:[0.62,0.6],elbow:false});gone[16].visibility=0.1;
    update(g,1.033,[gone]);
    update(g,1.066,[pose(0.5,0.4,0.3,{r:[0.86,0.35],elbow:false})]); // teleported onto the pad
    update(g,1.1,[pose(0.5,0.4,0.3,{r:[0.86,0.35],elbow:false})]);
    expect(g.p[0].hits).toBe(0);
  });
  it("shoulders lost: no hits even if the wrist is visible and fast",()=>{
    const g=newGame(1,1,60);pad(g,0,0.85,0.35);
    for(let k=0;k<=4;k++){
      const lm=pose(0.5,0.4,0.3,{r:[0.62+0.07*k,0.5-0.045*k],elbow:false});lm[11].visibility=0.1;
      update(g,1+k/30,[lm]);
    }
    expect(g.p[0].hits).toBe(0);
  });
});

describe("real clip (tools/fixtures)",()=>{
  // a jumping-jack clip: the arms swing through the high pads, so a seeded game must register hits; the same pose
  // frozen in place (no movement) must not
  const fx=JSON.parse(readFileSync(new URL("../../tools/fixtures/jack2.json",import.meta.url),"utf8"));
  const toLm=(p:number[][])=>p.map(([x,y,visibility,z=0])=>({x,y,z,visibility}));
  it("arms moving -> hits; the same body frozen -> none",()=>{
    const ar=fx.w/fx.h;
    let hits=0,frozen=0;
    for(const seed of [1,2,3]){
      const g=newGame(1,ar,fx.duration,rngFrom(seed));
      for(const f of fx.frames)if(f.p[0])update(g,f.t,[toLm(f.p[0])]);
      hits+=g.p[0].hits;
      const s=newGame(1,ar,fx.duration,rngFrom(seed)),first=toLm(fx.frames.find((f:any)=>f.p[0]).p[0]);
      for(const f of fx.frames)update(s,f.t,[first]);
      frozen+=s.p[0].hits;
    }
    expect(hits).toBeGreaterThan(3);
    expect(frozen).toBe(0);
  });
});
