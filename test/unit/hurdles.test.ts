// Barjerinis bėgimas (src/hurdles/logic.ts): hurdle layout, clear vs clip, the take-off window, speed loss on a clip,
// the hop keeping the tempo, finish time vs the flat sprint.
import {describe,it,expect} from "vitest";
import {HURDLES,N_HURDLES,ZONE_M,APPROACH_M,LATE_M,GRACE_S,CLIP_KEEP,MIN_T,newRun,stepAt,tick,jump,cue,cleared,hopLift,type Run} from "../../src/hurdles/logic.ts";
import {simulate,RACE_M,SPLIT_M} from "../../src/sprint/speed.ts";

// a race at a steady cadence (the legs restart one step after each landing); jumpAt(i) = how far before hurdle i to take off (null = never). The detector's
// confirmation comes `lag` s after the take-off (the jump is evaluated at the real take-off time).
function race(cad:number,jumpAt:(i:number)=>number|null,{lag=0.15,until=(a:Run)=>a.r.fin!=null,hz=60}={}){
  const a=newRun(),dt=1/hz,clips:number[]=[];let next=0.3,leg=0,t=0,pend:{t:number;at:number}|null=null;
  while(!until(a)&&t<60){
    t+=dt;
    while(t>=next){stepAt(a,next,leg);leg^=1;next+=1/cad}
    const air=!!a.hop,c=tick(a,t,dt);if(c>=0)clips.push(c);
    if(air&&!a.hop)next=t+1/cad; // a person lands, then steps on
    const i=a.next,d=i<N_HURDLES?jumpAt(i):null;
    if(!pend&&d!=null&&!a.hop&&a.r.x>=HURDLES[i]-d)pend={t,at:t+lag};
    if(pend&&t>=pend.at){jump(a,pend.t);pend=null}
  }
  return {a,t,clips};
}

describe("course",()=>{
  it("8 hurdles inside 100 m, the zones never overlap, no hop crosses a 10 m split",()=>{
    expect(HURDLES).toHaveLength(N_HURDLES);
    expect(HURDLES[N_HURDLES-1]).toBeLessThan(RACE_M-5);
    for(let i=1;i<N_HURDLES;i++)expect(HURDLES[i]-HURDLES[i-1]).toBeGreaterThanOrEqual(ZONE_M+APPROACH_M+ZONE_M);
    for(const h of HURDLES)expect(Math.floor((h-ZONE_M)/SPLIT_M)).toBe(Math.floor((h+ZONE_M)/SPLIT_M));
  });
  it("cue: orange approach, green zone, nothing between hurdles",()=>{
    const a=newRun(),h=HURDLES[0];
    expect(cue(a,h-ZONE_M-APPROACH_M-.1)).toBe("");
    expect(cue(a,h-ZONE_M-1)).toBe("ready");
    expect(cue(a,h-1)).toBe("go");
    expect(cue(a,h+LATE_M+.1)).toBe("");
  });
});

describe("clear vs clip",()=>{
  it("a take-off in the green zone clears the hurdle and hops over it",()=>{
    const {a}=race(3,i=>i===0?1.5:null,{until:a=>a.res[0]!=null&&!a.hop&&a.r.x>HURDLES[0]+2});
    expect(a.res[0]).toBe(true);
    expect(cleared(a)).toBe(1);
    expect(a.r.x).toBeGreaterThan(HURDLES[0]);
  });
  it("no take-off = clipped once the runner is past the bar (+ the detector grace), speed cut",()=>{
    let vAt=0;
    const {a,clips}=race(3,()=>null,{until:a=>{if(a.res[0]==null)vAt=a.r.v;return a.res[0]!=null}});
    expect(clips).toEqual([0]);
    expect(a.res[0]).toBe(false);
    expect(a.r.v).toBeCloseTo(vAt*CLIP_KEEP,0);
    expect(a.r.x).toBeGreaterThan(HURDLES[0]+LATE_M);
    expect(a.t-a.at[0]).toBeLessThan(.02);
  });
  it("a late confirmation still clears if the feet left inside the window",()=>{
    const {a}=race(3,i=>i===0?0.2:null,{lag:GRACE_S*.9,until:a=>a.res[0]!=null});
    expect(a.res[0]).toBe(true);
  });
  it("too early (orange band) is only a hint, too late or between hurdles is ignored",()=>{
    const {a,t}=race(3,()=>null,{until:a=>a.r.x>=HURDLES[0]-ZONE_M-1});
    expect(jump(a,t)).toBe("early");
    expect(a.res[0]).toBeNull();
    const b=race(3,()=>null,{until:a=>a.r.x>=HURDLES[0]+LATE_M+.05&&a.res[0]==null}).a;
    expect(jump(b,b.t)).toBe("");
    const c=race(3,()=>null,{until:a=>a.r.x>=HURDLES[0]-ZONE_M-APPROACH_M-2}).a;
    expect(jump(c,c.t)).toBe("");
    expect(jump(newRun(),MIN_T/2)).toBe("");
  });
  it("one take-off clears one hurdle; in the air further take-offs do nothing",()=>{
    const {a}=race(3,i=>i===0?1:null,{until:a=>a.hop!=null});
    expect(jump(a,a.t)).toBe("");
    expect(a.res.slice(1).every(r=>r==null)).toBe(true);
  });
  it("steps in the air are ignored and the hop keeps the speed",()=>{
    const {a}=race(3,i=>i===0?1.5:null,{until:a=>a.hop!=null});
    const v=a.r.v,n=a.r.ts.length;
    stepAt(a,a.t+.01,0);expect(a.r.ts.length).toBe(n);
    for(let k=0;k<5;k++)tick(a,a.t+1/60,1/60); // no steps at all for 5 frames: still the take-off speed
    expect(a.r.v).toBe(v);
  });
});

describe("timing and finish",()=>{
  const flat=simulate(3).fin!;
  it("all hurdles cleared ~ the flat 100 m time (the hop costs nothing)",()=>{
    const {a,clips}=race(3,()=>1.5);
    expect(clips).toEqual([]);
    expect(cleared(a)).toBe(N_HURDLES);
    expect(Math.abs(a.r.fin!-flat)).toBeLessThan(.25);
  });
  it("every clip costs time, never a disqualification",()=>{
    const all=race(3,()=>null), half=race(3,i=>i%2?1.5:null);
    expect(all.clips).toEqual([0,1,2,3,4,5,6,7]);
    expect(all.a.r.fin).not.toBeNull();
    expect(half.a.r.fin!).toBeGreaterThan(flat+1);
    expect(all.a.r.fin!).toBeGreaterThan(half.a.r.fin!+1);
    expect(cleared(half.a)).toBe(4);
  });
  it("faster legs = faster time, with the same jumps",()=>{
    expect(race(4,()=>1.5).a.r.fin!).toBeLessThan(race(2.5,()=>1.5).a.r.fin!);
  });
  it("hop height: 0 at take-off and landing, top in the middle",()=>{
    const h={i:0,x0:14,x1:18,t0:0,v:7};
    expect(hopLift(h,14)).toBe(0);expect(hopLift(h,18)).toBe(0);expect(hopLift(h,16)).toBe(1);expect(hopLift(h,20)).toBe(0);
  });
});
