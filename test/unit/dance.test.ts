// Šokių kova logic (src/dance/logic.ts): movement -> points, freeze penalty / bonus, pose checks, 2-player isolation.
import {describe,it,expect} from "vitest";
import type {Lm} from "../../src/detect/classifier.ts";
import {newDance,update,poseOf,energyOf,winner,pts,NOISE,FULL,FREEZE_S,HOLD_PTS,POSE_PTS,MOVED_PTS,type Dance} from "../../src/dance/logic.ts";
import {rngFrom} from "../../src/boxing/logic.ts";

type P2=[number,number];
// standing person in MIRRORED screen space (ar 1), torso s; l/r = screen-left/right wrist
function body(cx:number,cy:number,s:number,o:{l?:P2;r?:P2;wig?:number}={}):Lm[]{
  const lm:Lm[]=Array.from({length:33},()=>({x:0.5,y:0.5,visibility:0.2}));
  const w=o.wig??0;
  const put=(j:number,X:number,Y:number)=>{lm[j]={x:1-X,y:Y,visibility:0.99}};
  put(0,cx,cy-0.45*s);put(11,cx-0.375*s,cy);put(12,cx+0.375*s,cy);
  put(23,cx-0.2*s,cy+s);put(24,cx+0.2*s,cy+s);
  put(13,cx-0.45*s+w,cy+0.45*s);put(14,cx+0.45*s-w,cy+0.45*s);
  put(15,...(o.l??[cx-0.3*s+w,cy+0.2*s-w]));put(16,...(o.r??[cx+0.3*s-w,cy+0.2*s+w]));
  put(25,cx-0.2*s+w,cy+1.5*s);put(26,cx+0.2*s-w,cy+1.5*s);put(27,cx-0.2*s,cy+2*s-w);put(28,cx+0.2*s,cy+2*s+w);
  return lm;
}
// run the game from t0 to t1 at 30 fps; dancing = limbs swing by `amp` each frame
function run(g:Dance,t0:number,t1:number,amp:number[],mk:(i:number,w:number)=>Lm[]=(i,w)=>body(i?0.75:0.25,0.3,0.15,{wig:w})){
  const evs=[];let k=0;
  for(let t=t0;t<t1;t+=1/30,k++){
    const ps=amp.map((a,i)=>mk(i,k%2?a:-a));
    evs.push(...update(g,t,ps));
  }
  return evs;
}

describe("dance points",()=>{
  it("energy is 0 below NOISE, 1 at FULL",()=>{
    expect(energyOf(NOISE)).toBe(0);expect(energyOf(FULL)).toBe(1);expect(energyOf(FULL*3)).toBe(1);
  });
  it("standing still scores ~0, dancing scores, and per-second points are capped",()=>{
    const g=newDance(2,1,60,rngFrom(1));
    run(g,0,4,[0,0.03]);
    expect(pts(g.p[0])).toBe(0);
    expect(pts(g.p[1])).toBeGreaterThan(20);
    expect(pts(g.p[1])).toBeLessThanOrEqual(4*20);
  });
  it("players only score from their own half",()=>{
    const g=newDance(2,1,60,rngFrom(2));
    run(g,0,3,[0.03,0]);
    expect(g.p[0].score).toBeGreaterThan(0);expect(g.p[1].score).toBe(0);
    expect(winner(g)).toBe(1);
  });
});

describe("freeze",()=>{
  const toFreeze=(g:Dance)=>{const evs=run(g,g.t+1/30,g.nextFreeze+0.05,[0.03,0.03]);expect(evs.some(e=>e.type==="freeze")).toBe(true);return g.t};
  it("first freeze after 5-8 s, music phase switches",()=>{
    const g=newDance(1,1,60,rngFrom(3));
    expect(g.nextFreeze).toBeGreaterThanOrEqual(5);expect(g.nextFreeze).toBeLessThanOrEqual(8);
    toFreeze(g);expect(g.phase).toBe("freeze");
  });
  it("still player gets HOLD_PTS, mover loses MOVED_PTS once",()=>{
    const g=newDance(2,1,60,rngFrom(4));
    const t=toFreeze(g), before=g.p.map(P=>P.score);
    const evs=run(g,t+1/30,t+FREEZE_S+0.2,[0,0.03]);
    expect(evs.filter(e=>e.type==="held").map(e=>e.p)).toEqual([0]);
    expect(evs.filter(e=>e.type==="moved").map(e=>e.p)).toEqual([1]);
    expect(g.p[0].score).toBeCloseTo(before[0]+HOLD_PTS,0);
    expect(g.p[1].score).toBeLessThan(before[1]+MOVED_PTS+10); // +a few dance points after the resume
    expect(g.phase).toBe("dance");
    expect(evs.some(e=>e.type==="resume")).toBe(true);
  });
  it("every 3rd freeze asks for a pose; matching it pays POSE_PTS",()=>{
    const g=newDance(1,1,120,rngFrom(5));
    for(let n=0;n<2;n++){const t=toFreeze(g);run(g,t+1/30,t+FREEZE_S+0.1,[0])}
    const t=toFreeze(g);expect(g.pose).not.toBeNull();
    const want=g.pose!, held:Record<string,Lm[]>={
      up:body(0.5,0.4,0.15,{l:[0.45,0.2],r:[0.55,0.2]}),
      plane:body(0.5,0.4,0.15,{l:[0.25,0.4],r:[0.75,0.4]}),
      hips:body(0.5,0.4,0.15,{l:[0.47,0.55],r:[0.53,0.55]}),
    };
    const evs=run(g,t+1/30,t+FREEZE_S+0.1,[0],()=>held[want]);
    expect(evs.find(e=>e.type==="pose")?.pts).toBe(POSE_PTS);
  });
  it("no freeze too close to the end",()=>{
    const g=newDance(1,1,6,rngFrom(6));g.nextFreeze=4.5;
    expect(run(g,0,6,[0.03]).some(e=>e.type==="freeze")).toBe(false);
  });
});

describe("poses",()=>{
  it("recognises up / plane / hips and nothing for a neutral stance",()=>{
    expect(poseOf(body(0.5,0.4,0.15,{l:[0.45,0.2],r:[0.55,0.2]}),1)).toBe("up");
    expect(poseOf(body(0.5,0.4,0.15,{l:[0.25,0.4],r:[0.75,0.4]}),1)).toBe("plane");
    expect(poseOf(body(0.5,0.4,0.15,{l:[0.47,0.55],r:[0.53,0.55]}),1)).toBe("hips");
    expect(poseOf(body(0.5,0.4,0.15),1)).toBeNull();
    expect(poseOf(null,1)).toBeNull();
  });
  it("NaN landmarks do not crash or score",()=>{
    const g=newDance(1,1,60,rngFrom(7));
    const bad=body(0.5,0.4,0.15);bad[11]={x:NaN,y:NaN,visibility:1};
    expect(()=>update(g,0.1,[bad])).not.toThrow();
    expect(g.p[0].score).toBe(0);
  });
});
