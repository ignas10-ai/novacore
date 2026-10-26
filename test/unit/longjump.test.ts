// Šuolis į tolį (src/longjump/logic.ts + src/detect/takeoff.ts): distance model, foul rule, take-off timing,
// turn rotation, best-of-3 ranking (ties, all fouls), and the take-off detector on real clips (tools/fixtures).
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import type {Lm} from "../../src/detect/classifier.ts";
import {takeoff,takeoffState} from "../../src/detect/takeoff.ts";
import {LINE_M,D_MAX,IGNORE_GAP,GRACE_S,LIMIT_S,MIN_T,bestJump,jumpDist,newAttempt,stepAt,tick,jump,xAt,vBefore,total,turnOf,rank,bestOf} from "../../src/longjump/logic.ts";
import {K_SPEED,V_MAX} from "../../src/sprint/speed.ts";

// run an attempt at a steady cadence (steps/s) until the runner reaches x (or the attempt ends); returns the attempt
function runTo(cad:number,x:number,hz=60){
  const a=newAttempt(),dt=1/hz;let next=0.3,leg=0,t=0;
  while(a.state==="run"&&a.r.x<x&&t<30){t+=dt;while(t>=next){stepAt(a,next,leg);leg^=1;next+=1/cad}tick(a,t,dt)}
  return {a,t};
}

describe("distance model",()=>{
  it("follows the documented table (take-off right at the line)",()=>{
    const table:[number,number][]=[[1,3.26],[1.5,4.09],[2,4.92],[2.5,5.76],[3,6.59],[3.5,7.42],[4,8.25],[4.5,8.95],[6,8.95]];
    for(const [cad,d] of table)expect(jumpDist(Math.min(V_MAX,K_SPEED*cad),0),`cadence ${cad}/s`).toBe(d);
  });
  it("never beats the world record and grows with speed",()=>{
    let prev=-1;
    for(let v=0;v<=20;v+=.25){const d=bestJump(v);expect(d).toBeLessThanOrEqual(D_MAX);expect(d).toBeGreaterThanOrEqual(prev);prev=d}
    expect(bestJump(0)).toBe(1.6);expect(bestJump(-3)).toBe(1.6);
  });
  it("is measured from the line: an early take-off loses the gap, cut down to the centimetre",()=>{
    expect(jumpDist(7.8,0)).toBe(6.59);
    expect(jumpDist(7.8,0.5)).toBe(6.09);
    expect(jumpDist(7.8,0.004)).toBe(6.58); // 6.588 -> 6.58, never rounded up
    expect(jumpDist(2.6,5)).toBe(0); // way too early: lands short of the pit
  });
  it("past the line = foul (null)",()=>{
    expect(jumpDist(9,-0.01)).toBeNull();
    expect(jumpDist(9,NaN)).toBeNull();
  });
});

describe("attempt: foul rule and take-off",()=>{
  it("a jump in the zone counts, from the take-off point and the approach speed",()=>{
    const {a,t}=runTo(3,LINE_M-0.4);
    expect(jump(a,t)).toBe("ok");
    expect(a.state).toBe("air");
    expect(a.take!.gap).toBeCloseTo(LINE_M-a.r.x,1);
    expect(a.take!.v).toBeCloseTo(7.8,0);
    expect(a.take!.dist).toBeCloseTo(6.59-a.take!.gap,1);
  });
  it("crossing the line without a jump = foul after the grace window",()=>{
    const {a}=runTo(3,LINE_M+50); // runs until the attempt is decided
    expect(a.state).toBe("foul");expect(a.why).toBe("line");
    expect(a.t-a.crossAt).toBeGreaterThan(GRACE_S);
    expect(a.r.x).toBeLessThan(LINE_M+4); // decided right after the line
  });
  it("a take-off confirmed late (after the line) but STARTED before it still counts",()=>{
    const {a}=runTo(3,LINE_M+0.6); // detector confirms ~0.1-0.2 s after the feet left the floor
    const tBefore=a.hist[a.hist.length-3]-0.2;
    expect(xAt(a,tBefore)).toBeLessThan(LINE_M);
    expect(a.state).toBe("run");
    expect(jump(a,tBefore)).toBe("ok");
  });
  it("a take-off past the line = foul",()=>{
    const {a,t}=runTo(3,LINE_M+0.3);
    expect(jump(a,t)).toBe("foul");
    expect(a.state).toBe("foul");expect(a.why).toBe("line");
  });
  it("far from the board the take-off is ignored, the attempt goes on",()=>{
    const {a,t}=runTo(3,LINE_M-IGNORE_GAP-2);
    expect(jump(a,t)).toBe("early");
    expect(a.state).toBe("run");
    expect(jump(newAttempt(),MIN_T/2)).toBe(""); // right after "Bėk!"
  });
  it("an early jump inside the window still counts with less distance",()=>{
    const {a,t}=runTo(3,LINE_M-3);
    expect(jump(a,t)).toBe("ok");
    expect(a.take!.dist).toBeCloseTo(6.59-3,1);
  });
  it("no jump and no running = foul when the time runs out",()=>{
    const a=newAttempt();let t=0;
    while(a.state==="run"&&t<LIMIT_S+2){t+=1/60;tick(a,t,1/60)}
    expect(a.state).toBe("foul");expect(a.why).toBe("none");
  });
  it("steps after the jump do not move the runner any more",()=>{
    const {a,t}=runTo(3,LINE_M-1);jump(a,t);
    const x=a.r.x;stepAt(a,t+.1,0);tick(a,t+.2,.1);
    expect(a.r.x).toBe(x);
  });
  it("approach speed = the best of the last 0.6 s (the crouch into the jump costs nothing)",()=>{
    const {a,t}=runTo(3,LINE_M-2);
    let tt=t;for(let i=0;i<30;i++){tt+=1/60;tick(a,tt,1/60)} // 0.5 s without steps: speed sags
    expect(a.r.v).toBeLessThan(vBefore(a,tt));
    expect(vBefore(a,tt)).toBeCloseTo(7.8,0);
  });
});

describe("turns and ranking",()=>{
  it("rotates P1..Pn, three rounds",()=>{
    expect(total(1)).toBe(3);expect(total(4)).toBe(12);
    expect([0,1,2,3,4,5].map(k=>turnOf(k,2))).toEqual([{round:0,player:0},{round:0,player:1},{round:1,player:0},{round:1,player:1},{round:2,player:0},{round:2,player:1}]);
    expect(turnOf(7,3)).toEqual({round:2,player:1});
    expect(turnOf(2,1)).toEqual({round:2,player:0});
  });
  it("best valid jump wins; X does not count",()=>{
    const r=rank([[5.1,null,5.3],[null,6.02,4],[4.4,4.5,4.6]]);
    expect(r.map(x=>[x.i,x.best,x.place])).toEqual([[1,6.02,1],[0,5.3,2],[2,4.6,3]]);
  });
  it("ties on the best jump are broken by the 2nd, then the 3rd best",()=>{
    expect(rank([[6,5,null],[6,5.5,1]]).map(x=>x.i)).toEqual([1,0]);
    expect(rank([[6,5,4],[6,5,4.2]]).map(x=>x.i)).toEqual([1,0]);
    expect(rank([[6,null,null],[6,2,null]]).map(x=>x.i)).toEqual([1,0]);
  });
  it("identical series share the place",()=>{
    const r=rank([[6,5,null],[null,5,6],[3,3,3]]);
    expect(r.map(x=>x.place)).toEqual([1,1,3]);
  });
  it("all fouls: no place, listed last",()=>{
    const r=rank([[null,null,null],[2,null,null]]);
    expect(r.map(x=>[x.i,x.best,x.place])).toEqual([[1,2,1],[0,null,null]]);
    expect(rank([[null,null,null],[null,null,null]]).every(x=>x.place==null&&x.best==null)).toBe(true);
    expect(bestOf([null,null])).toBeNull();expect(bestOf([1,3,2])).toBe(3);
  });
});

describe("take-off detector",()=>{
  const toLm=(p:number[][]):Lm[]=>p.map(([x,y,visibility,z=0])=>({x,y,z,visibility}));
  const run=(f:string,from=0,to=1e9)=>{
    const d=JSON.parse(readFileSync(new URL(`../../tools/fixtures/${f}.json`,import.meta.url),"utf8"));
    const s=takeoffState(),ev:number[]=[];
    for(const fr of d.frames){if(fr.t<from||fr.t>to||!fr.p[0])continue;const t=takeoff(s,toLm(fr.p[0]),fr.t*1000);if(t)ev.push(t/1000)}
    return ev;
  };
  it("running in place (high knees, fast knees with hops, jogging) never takes off",()=>{
    for(const f of ["knees","knees2","knees3"])expect(run(f),f).toEqual([]);
  });
  it("standing up from a squat is not a jump",()=>{
    for(const f of ["squat","squat3","squat4"])expect(run(f),f).toEqual([]);
  });
  it("finds real jumps (squat jumps from the front, several people)",()=>{
    expect(run("squatjump",0,12.7)).toHaveLength(8);
    expect(run("squatjump8",0,14)).toHaveLength(9);
    expect(run("squatjump9")).toHaveLength(15);
    expect(run("squatjump7")).toHaveLength(24);
    expect(run("squatjump6").length).toBeGreaterThanOrEqual(27); // 31 small hops, the smallest stay below TK_AIR
  });
  it("reports the moment the feet left the floor, not the confirmation",()=>{
    const ev=run("squatjump",0,3);
    expect(ev[0]).toBeGreaterThan(1.2);expect(ev[0]).toBeLessThan(1.5);
  });
  it("ignores frames without a torso or with NaN, keeps working after them",()=>{
    const s=takeoffState(),lm=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
    lm[11].y=lm[12].y=.3;lm[23].y=lm[24].y=.55;lm[25].y=lm[26].y=.7;lm[27].y=lm[28].y=.85;
    for(let t=0;t<1000;t+=33)expect(takeoff(s,lm,t)).toBe(0);
    const bad=lm.map(p=>({...p,y:NaN}));expect(takeoff(s,bad,1033)).toBe(0);
    const hid=lm.map(p=>({...p,visibility:.1}));expect(takeoff(s,hid,1066)).toBe(0);
    const air=lm.map((p,j)=>({...p,y:p.y-(j>=23?.06:.05)})); // whole body 0.06 up = 0.24 torso
    let got=0;for(let t=1100;t<1400&&!got;t+=33)got=takeoff(s,air,t);
    expect(got).toBe(1100);
  });
  it("a tracker swap to another person (sideways jump of the body) is not a take-off",()=>{
    const body=(cx:number,dy:number)=>{const lm=Array.from({length:33},()=>({x:cx,y:.5,z:0,visibility:1}));
      lm[11].y=lm[12].y=.3+dy;lm[23].y=lm[24].y=.55+dy;lm[25].y=lm[26].y=.7+dy;lm[27].y=lm[28].y=.85+dy;return lm};
    const s=takeoffState();let fired=0;
    for(let t=0;t<4000;t+=33)fired+=takeoff(s,Math.floor(t/600)%2?body(.7,-.08):body(.3,0),t)?1:0; // a shorter person further back, every 0.6 s
    expect(fired).toBe(0);
  });
});
