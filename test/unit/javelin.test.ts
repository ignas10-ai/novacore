// Iečio metimas (src/javelin/logic.ts): distance model, hand-pick rings, swing / line rules, turn rotation and the
// total-of-three ranking. Synthetic landmarks mirror the bowling camera-control tests (the e2e camera cannot throw).
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {
  LINE_M,D_MAX,EARLY_M,LIMIT_S,GRACE_S,MIN_T,H_MAX,
  throwDist,throwScore,readBody,activeHand,newHandPick,updateHandPick,HAND_FILL_S,
  newAttempt,stepAt,tick,throwArm,newAttempt as attempt,rank,total,turnOf,totalOf,bestOf,xAt,vBefore,
} from "../../src/javelin/logic.ts";
import type {Arm,Attempt} from "../../src/javelin/logic.ts";
import type {Lm} from "../../src/detect/classifier.ts";
import {K_SPEED,V_MAX} from "../../src/sprint/speed.ts";

// run an attempt at a steady cadence until it reaches x (or is decided); returns the attempt and time
function runTo(cad:number,x:number,hz=60){
  const a=newAttempt(1),dt=1/hz;let next=.3,leg=0,t=0;
  while(a.state==="run"&&a.r.x<x&&t<30){t+=dt;while(t>=next){stepAt(a,next,leg);leg^=1;next+=1/cad}tick(a,t,dt)}
  return {a,t};
}
// one synthetic throw: a steady 0.35 s hold at h, then a fast forward/down swing (z toward the camera)
function swing(a:Attempt,h=.55){
  const t0=a.t+.02;
  let ev="" as ""|"ok"|"foul"|"early";
  for(let i=0;i<7;i++){ev=throwArm(a,{t:t0+i*.05,x:0,h,z:0});if(ev)return ev}
  const t1=t0+.35;
  ev=throwArm(a,{t:t1,x:.12,h:h-.10,z:-.05});if(ev)return ev;
  return throwArm(a,{t:t1+.05,x:.30,h:h-.55,z:-.20});
}

describe("distance model",()=>{
  it("grows with arm height, swing speed and approach speed, capped at the world-class ceiling",()=>{
    expect(throwDist(0,0,0)).toBe(8);
    expect(throwDist(.7,9,11.5)).toBe(D_MAX);
    expect(throwDist(.35,5,7)).toBeGreaterThan(throwDist(.2,3,4));
    expect(throwDist(2,20,20)).toBe(D_MAX);
    expect(throwDist(-1,-3,-4)).toBe(8);
  });
  it("is measured from the line and cut DOWN to the centimetre",()=>{
    const raw=throwDist(.5,6,8);
    expect(throwScore(.5,6,8,0)).toBe(Math.floor(raw*100)/100);
    expect(throwScore(.5,6,8,.5)).toBeCloseTo(Math.floor((raw-.5)*100)/100,9);
    expect(throwScore(.5,6,8,100)).toBe(0);
  });
  it("past the line = foul (null)",()=>{
    expect(throwScore(.5,6,8,-.01)).toBeNull();
    expect(throwScore(.5,6,8,NaN)).toBeNull();
  });
});

describe("hand pick (two 2 s rings)",()=>{
  // 33 landmarks, mirrored x: left wrist on the left of the screen, like the camera preview
  function pose(out:"l"|"r"|"none" = "l", both=false):Lm[]{
    const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:1})) as Lm[];
    lm[11]={x:.6,y:.3,visibility:1};lm[12]={x:.4,y:.3,visibility:1};
    lm[23]={x:.6,y:.62,visibility:1};lm[24]={x:.4,y:.62,visibility:1};
    lm[13]={x:.72,y:.24,visibility:1};lm[15]={x:.82,y:.16,visibility:1};
    lm[14]={x:.44,y:.5,visibility:1};lm[16]={x:.5,y:.5,visibility:1};
    if(out==="r"||both){lm[14]={x:.28,y:.24,visibility:1};lm[16]={x:.18,y:.16,visibility:1};lm[15]={x:.82,y:.5,visibility:1}}
    if(out==="none"){lm[15]={x:.82,y:.5,visibility:1};lm[16]={x:.18,y:.5,visibility:1}}
    return lm;
  }
  it("reads the body and picks the arm held out to its own side",()=>{
    const b=readBody(pose("l"),1)!;
    expect(b).not.toBeNull();
    expect(activeHand(b)).toBe(0);
    const r=readBody(pose("r"),1)!;
    expect(activeHand(r)).toBe(1);
    expect(activeHand(readBody(pose("none"),1)!)).toBeNull();
    const bothLm=pose("r");bothLm[13]={x:.72,y:.24,visibility:1};bothLm[15]={x:.82,y:.16,visibility:1};
    expect(activeHand(readBody(bothLm,1)!)).toBeNull(); // both out is not a choice
  });
  it("fills the chosen ring for 2 s; a full ring locks the hand",()=>{
    const p=newHandPick(),lm=pose("l");let now=0,chosen:0|1|null=null;
    for(let i=0;i<25&&chosen==null;i++){now+=100;chosen=updateHandPick(p,readBody(lm,1),now)}
    expect(chosen).toBe(0);
    expect(p.fill[0]).toBe(1);
    expect(now).toBeGreaterThanOrEqual(HAND_FILL_S*1000-100);
  });
  it("switching sides drains the first ring and fills the other",()=>{
    const p=newHandPick();let now=0,chosen:0|1|null=null;
    for(let i=0;i<10;i++){now+=100;updateHandPick(p,readBody(pose("l"),1),now)}
    expect(p.fill[0]).toBeGreaterThan(.3);
    const before=p.fill[0];
    for(let i=0;i<10;i++){now+=100;chosen=updateHandPick(p,readBody(pose("r"),1),now)}
    expect(p.fill[0]).toBeLessThan(before);
    expect(p.fill[1]).toBeGreaterThan(.3);
    for(let i=0;i<12&&chosen==null;i++){now+=100;chosen=updateHandPick(p,readBody(pose("r"),1),now)}
    expect(chosen).toBe(1);
  });
  it("auto-picks after 12 s without a full ring, and missing / NaN landmarks never choose",()=>{
    const p=newHandPick(),lm=pose("none"),bad=lm.map(x=>({...x,x:NaN}));
    let now=0;for(let i=0;i<20;i++){now+=100;expect(updateHandPick(p,readBody(bad,1),now)).toBeNull()}
    now=13000;
    expect(updateHandPick(p,readBody(lm,1),now)).not.toBeNull();
    expect(p.auto).toBe(true);
  });
});

describe("attempt: line rules and swing",()=>{
  it("a swing before the line releases the javelin and scores",()=>{
    const {a,t}=runTo(3,LINE_M-.5);
    expect(a.state).toBe("run");
    expect(swing(a)).toBe("ok");
    expect(a.state).toBe("fly");
    expect(a.take!.gap).toBeGreaterThan(.3);
    expect(a.take!.gap).toBeLessThan(.6);
    expect(a.take!.dist).toBeGreaterThan(5);
    expect(a.take!.h).toBeGreaterThan(.4);
    expect(a.take!.s).toBeGreaterThan(2);
    expect(t).toBeGreaterThan(0);
  });
  it("a release after the line is a foul",()=>{
    const {a}=runTo(3,LINE_M+.1);
    expect(a.state).toBe("run");
    expect(swing(a)).toBe("foul");
    expect(a.state).toBe("foul");
    expect(a.why).toBe("line");
  });
  it("a swing far before the line is ignored (keep running)",()=>{
    const {a}=runTo(3,LINE_M-EARLY_M-2);
    expect(swing(a)).toBe("early");
    expect(a.state).toBe("run");
    expect(a.take).toBeNull();
  });
  it("crossing the line without a throw = foul after the grace window",()=>{
    const {a}=runTo(3,LINE_M+50);
    expect(a.state).toBe("foul");expect(a.why).toBe("line");
    expect(a.t-a.crossAt).toBeGreaterThan(GRACE_S);
    expect(a.r.x).toBeLessThan(LINE_M+4);
  });
  it("no throw by the time limit = foul (none)",()=>{
    const a=newAttempt(1);let t=0;
    while(a.state==="run"&&t<LIMIT_S+2){t+=1/60;tick(a,t,1/60)}
    expect(a.state).toBe("foul");expect(a.why).toBe("none");
  });
  it("swings in the first 0.6 s are ignored",()=>{
    const {a}=runTo(3,LINE_M-1);
    expect(throwArm(a,{t:MIN_T/2,x:0,h:.55,z:0})).toBe("");
    expect(throwArm(a,{t:MIN_T/2+.05,x:.30,h:0,z:-.20})).toBe("");
  });
  it("a held wrist (no forward swing) never releases",()=>{
    const {a}=runTo(3,LINE_M-.5);
    let ev="" as ""|"ok"|"foul"|"early";
    for(let i=0;i<10;i++)ev=throwArm(a,{t:a.t+.02+i*.05,x:0,h:.45,z:0});
    expect(ev).toBe("");
    expect(a.state).toBe("run");
  });
  it("running with the arm held above the shoulder never throws (the reported bug)",()=>{
    const {a}=runTo(3,LINE_M-.5);
    const t0=a.t+.02;
    let ev="" as ""|"ok"|"foul"|"early";
    for(let i=0;i<24;i++){
      const h=.30+.06*Math.sin(i*1.7);
      ev=throwArm(a,{t:t0+i*.05,x:.02*Math.sin(i),h,z:0});
      if(ev)break;
    }
    expect(ev).toBe("");
    expect(a.state).toBe("run");
  });
  it("a small fast running bounce cannot release the javelin",()=>{
    const {a}=runTo(3,LINE_M-.5);
    const t0=a.t+.02;
    for(let i=0;i<7;i++)throwArm(a,{t:t0+i*.05,x:0,h:.30,z:0}); // steady hold
    let ev="" as ""|"ok"|"foul"|"early";
    for(let i=0;i<8;i++){
      const h=i%2?.10:.30; // 0.2 torso bounce at ~4 torso/s
      ev=throwArm(a,{t:t0+.35+i*.05,x:.02,h,z:0});
      if(ev)break;
    }
    expect(ev).toBe("");
    expect(a.state).toBe("run");
  });
  it("a real swing with no MediaPipe z releases on down travel",()=>{
    const {a}=runTo(3,LINE_M-.5);
    const t0=a.t+.02;
    for(let i=0;i<7;i++)expect(throwArm(a,{t:t0+i*.05,x:0,h:.60,z:0})).toBe("");
    expect(throwArm(a,{t:t0+.35,x:.12,h:.35,z:0})).toBe("");
    expect(throwArm(a,{t:t0+.40,x:.25,h:.05,z:0})).toBe("ok");
    expect(a.state).toBe("fly");
    expect(a.take!.h).toBeGreaterThan(.5);
  });
  it("a slow lower of the javelin arm never releases",()=>{
    const {a}=runTo(3,LINE_M-.5);
    const t0=a.t+.02;
    for(let i=0;i<7;i++)throwArm(a,{t:t0+i*.05,x:0,h:.30,z:0});
    let ev="" as ""|"ok"|"foul"|"early";
    for(let i=1;i<=4;i++){ev=throwArm(a,{t:t0+.35+i*.1,x:0,h:.30-i*.05,z:0});if(ev)break}
    expect(ev).toBe("");
  });
  it("real running clips never throw, on either hand (the phone bug)",()=>{
    const toLm=(p:number[][]):Lm[]=>p.map(([x,y,visibility,z=0])=>({x,y,z,visibility}));
    for(const f of ["knees","knees2","knees3"]){
      const d=JSON.parse(readFileSync(new URL(`../../tools/fixtures/${f}.json`,import.meta.url),"utf8"));
      for(const side of [0,1] as const){
        const a=newAttempt(side);a.r.x=LINE_M-1; // a throw release would score here, not "early"
        let ev="" as ""|"ok"|"foul"|"early";
        for(const fr of d.frames){
          const lm=fr.p?.[0];if(!lm)continue;
          const b=readBody(toLm(lm),1);if(!b)continue;
          const w=b.wr[side];if(!w.ok)continue;
          ev=throwArm(a,{t:fr.t,x:w.xr,h:w.h,z:w.z});
          if(ev)break;
        }
        expect(ev,`${f} side ${side}`).toBe("");
      }
    }
  });
  it("approach speed is the best of the last 0.6 s before the swing",()=>{
    const {a,t}=runTo(3,LINE_M-1);
    let tt=t;for(let i=0;i<30;i++){tt+=1/60;tick(a,tt,1/60)}
    expect(a.r.v).toBeLessThan(vBefore(a,tt));
    expect(vBefore(a,tt)).toBeCloseTo(7.8,0);
    expect(xAt(a,tt)).toBeCloseTo(a.r.x,5);
  });
});

describe("turns and ranking (total of three)",()=>{
  it("rotates P1..Pn, three rounds",()=>{
    expect(total(1)).toBe(3);expect(total(4)).toBe(12);
    expect([0,1,2,3,4,5].map(k=>turnOf(k,2))).toEqual([{round:0,player:0},{round:0,player:1},{round:1,player:0},{round:1,player:1},{round:2,player:0},{round:2,player:1}]);
  });
  it("the biggest total of valid throws wins; X does not count",()=>{
    const r=rank([[10,null,10],[8,9,9],[20,20,20]]);
    expect(r.map(x=>[x.i,x.total,x.best,x.place])).toEqual([[2,60,20,1],[1,26,9,2],[0,20,10,3]]);
  });
  it("ties are broken by the best, then the 2nd, then the 3rd throw",()=>{
    expect(rank([[10,10,10],[10,10,11]]).map(x=>x.i)).toEqual([1,0]);
    expect(rank([[10,10,10],[10,11,9]]).map(x=>x.i)).toEqual([1,0]);
    expect(rank([[10,10,10],[10,10,10]]).map(x=>x.place)).toEqual([1,1]);
  });
  it("all fouls have no place and are listed last",()=>{
    const r=rank([[null,null,null],[1,null,null]]);
    expect(r.map(x=>[x.i,x.place,x.total])).toEqual([[1,1,1],[0,null,0]]);
    expect(rank([[null,null,null],[null,null,null]]).every(x=>x.place==null)).toBe(true);
    expect(bestOf([null,3,null])).toBe(3);expect(totalOf([1,null,2])).toBe(3);
  });
});
