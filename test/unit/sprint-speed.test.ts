// Sprint speed model edge cases beyond test-sprint.cjs (cadence -> speed mapping, frame/time edge cases, ghost).
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {runner,onStep,cadenceAt,targetSpeed,advance,simulate,ghostX,K_SPEED,V_MAX,DT_MAX,RACE_M} from "../../src/sprint/speed.ts";
import {step,type StepState} from "../../src/detect/step.ts";

// race driven by a list of knee lifts {t, leg} (looped like a runner who keeps going); returns the 100 m time
type Ev={t:number;leg:number};
function race(ev:Ev[],limit=90){
  const r=runner(),dt=1/60,span=ev[ev.length-1].t-ev[0].t+(ev[ev.length-1].t-ev[0].t)/(ev.length-1);
  const at=(i:number)=>ev[i%ev.length].t-ev[0].t+Math.floor(i/ev.length)*span+0.3;
  let k=0;
  for(let t=dt;t<=limit&&r.fin==null;t+=dt){while(at(k)<=t){onStep(r,at(k),ev[k%ev.length].leg);k++}advance(r,t,dt)}
  return r.fin??Infinity;
}
// alternating lifts every dt s; glitch = every 4th lift the detector also reports the SAME leg 0.25 s later
// (one-frame left/right knee swap while a knee is held high, tools/fixtures/knees.json 12.9 s)
const alt=(dt:number,glitch=false)=>Array.from({length:60},(_,k)=>[{t:k*dt,leg:k%2},...(glitch&&k%4===1?[{t:k*dt+.25,leg:k%2}]:[])]).flat();
// real clip -> knee events (which leg went up) through the game's detector; stretch = the same lifts in slow motion
function clip(name:string,stretch=1){
  const d=JSON.parse(readFileSync(`tools/fixtures/${name}.json`,"utf8"));
  const s={ar:d.w/d.h} as StepState,ev:Ev[]=[];
  for(const f of d.frames){
    if(!f.p[0])continue;
    const up0=s.leg?.[0],lm=f.p[0].map(([x,y,visibility,z=0]:number[])=>({x,y,z,visibility}));
    if(step(s,lm,"knees",f.t*stretch*1000))ev.push({t:f.t*stretch,leg:s.leg[0]&&!up0?0:1});
  }
  return ev;
}

describe("cadence -> target speed",()=>{
  it("linear up to V_MAX, 0 at rest",()=>{
    expect(targetSpeed(0)).toBe(0);
    expect(targetSpeed(2)).toBeCloseTo(2*K_SPEED);
    expect(targetSpeed(V_MAX/K_SPEED+1)).toBe(V_MAX);
  });
  it("first step alone gives no cadence (needs an interval)",()=>{
    const r=runner();onStep(r,1);expect(cadenceAt(r,1.2)).toBe(0);
  });
  it("a pause longer than DT_MAX is a stop: the next step starts over",()=>{
    const r=runner();onStep(r,0,0);onStep(r,DT_MAX+0.5,1);expect(cadenceAt(r,DT_MAX+0.6)).toBe(0);
    onStep(r,DT_MAX+0.9,0);expect(cadenceAt(r,DT_MAX+1)).toBeCloseTo(1/0.4);
  });
  it("cadence decays as 1/gap when the next step is overdue, 0 after DT_MAX",()=>{
    const r=runner();onStep(r,0,0);onStep(r,0.5,1); // 2 steps/s
    expect(cadenceAt(r,0.6)).toBe(2);
    expect(cadenceAt(r,0.5+0.9)).toBeCloseTo(1/0.9);
    expect(cadenceAt(r,0.5+DT_MAX+0.01)).toBe(0);
  });
  it("cadence = mean rate over the window, so slow intervals pull it down",()=>{
    const r=runner();[0,.25,.5,.75,1].forEach((t,k)=>onStep(r,t,k%2)); // 4/s
    expect(cadenceAt(r,1)).toBeCloseTo(4);
    onStep(r,2,1);expect(cadenceAt(r,2)).toBeLessThan(2); // one slow step after a fast run (the old EMA kept 4)
  });
});

describe("speed follows leg-switching rate, not lift height (Martynas, 2026-10-26)",()=>{
  it("slow but high: the same high knees in slow motion are slow",()=>{
    expect(race(clip("knees",2))).toBeGreaterThan(40);
    expect(race(clip("knees").filter(e=>e.t<17))).toBeGreaterThan(33); // the clip's slow, high part (one leg swap at 12.9 s)
  });
  it("slow lifts with leg-swap glitches are never faster than clean slow lifts",()=>{
    expect(race(alt(1,true))).toBeGreaterThanOrEqual(race(alt(1))-0.05);
    expect(race(alt(1.4,true))).toBeGreaterThan(45); // ~0.7 steps/s = walking
  });
  it("fast but low knees are fast",()=>{
    expect(race(clip("knees2"))).toBeLessThan(14); // 3.4 steps/s, knees only up to the hips
    expect(race(alt(0.22))).toBeLessThan(11);
  });
  it("same-leg repeats do not count as running steps",()=>{
    const r=runner();for(let k=0;k<8;k++)onStep(r,k*0.25,0); // one leg, 4 lifts/s
    expect(cadenceAt(r,1.8)).toBe(0);expect(r.steps).toBe(8);
    const a=runner();[0,.3,.6,.65,.9].forEach((t,k)=>onStep(a,t,[0,1,0,0,1][k]));
    expect(cadenceAt(a,.9)).toBeCloseTo(3/.9); // the 0.65 repeat is ignored
  });
  it("stopping slows the runner within ~1 s",()=>{
    const r=runner(),dt=1/60;let t=0,k=0;
    for(;t<6;t+=dt){while(k/4<=t){onStep(r,k/4,k%2);k++}advance(r,t,dt)}
    const v0=r.v,t0=(k-1)/4;
    for(;t<t0+1;t+=dt)advance(r,t,dt);
    expect(v0).toBeGreaterThan(10);expect(r.v).toBeLessThan(v0*0.6);
    for(;t<t0+2.5;t+=dt)advance(r,t,dt);
    expect(r.v).toBeLessThan(0.5);
  });
  it("two players are independent",()=>{
    const a=runner(),b=runner(),dt=1/60;
    for(let t=dt,ka=0,kb=0;t<8;t+=dt){
      while(ka/4<=t){onStep(a,ka/4,ka%2);ka++}
      while(kb<=t){onStep(b,kb,kb%2);kb++} // P2 lifts once a second
      advance(a,t,dt);advance(b,t,dt);
    }
    expect(a.v).toBeGreaterThan(9.5);expect(b.v).toBeLessThan(3);
    const solo=runner();for(let t=dt,k=0;t<8;t+=dt){while(k/4<=t){onStep(solo,k/4,k%2);k++}advance(solo,t,dt)}
    expect(a.x).toBeCloseTo(solo.x,9);
  });
  it("steady cadence keeps the documented 100 m times",()=>{
    const T=(c:number)=>simulate(c).fin!;
    expect(T(2.5)).toBeCloseTo(16.9,0);expect(T(3)).toBeCloseTo(14.3,0);expect(T(4)).toBeCloseTo(11.1,0);expect(T(5)).toBeCloseTo(10.3,0);
  });
});

describe("integration",()=>{
  it("dt <= 0 (duplicate frame / clock jump back) changes nothing",()=>{
    const r=runner();onStep(r,0,0);onStep(r,0.3,1);
    advance(r,0.4,0);advance(r,0.4,-0.016);
    expect([r.x,r.v]).toEqual([0,0]);
  });
  it("a huge frame gap (tab hidden) cannot exceed the acceleration cap",()=>{
    const r=runner();for(let k=0;k<6;k++)onStep(r,k*0.25,k%2);
    advance(r,1.3,1.0); // one 1 s frame
    expect(r.v).toBeLessThanOrEqual(6.5+1e-9);
  });
  it("finish time is recorded once and equals the last split",()=>{
    const s=simulate(4);
    expect(s.fin).not.toBeNull();expect(s.splits).toHaveLength(RACE_M/10);expect(s.fin).toBe(s.splits.at(-1));
    expect(s.splits.every((t,i)=>!i||t>s.splits[i-1])).toBe(true);
  });
  it("no steps within the 60 s limit -> did not finish",()=>{
    expect(simulate(0).fin).toBeNull();
  });
});

describe("ghostX",()=>{
  const s=simulate(3).splits;
  it("no splits / before the gun = start line",()=>{
    expect(ghostX([],5)).toBe(0);expect(ghostX(s,0)).toBe(0);expect(ghostX(s,-1)).toBe(0);
  });
  it("hits every split exactly and is monotonic",()=>{
    s.forEach((t,i)=>expect(ghostX(s,t)).toBeCloseTo((i+1)*10,6));
    let prev=-1;for(let t=0;t<s.at(-1)!+2;t+=0.05){const x=ghostX(s,t);expect(x).toBeGreaterThanOrEqual(prev);prev=x}
  });
  it("keeps coasting past the finish at the last split's speed",()=>{
    expect(ghostX(s,s.at(-1)!+1)).toBeGreaterThan(100);
  });
  it("one-split history does not divide by zero",()=>{
    expect(Number.isFinite(ghostX([2],5))).toBe(true);
  });
});
