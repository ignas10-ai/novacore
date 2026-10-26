// Sprint speed model edge cases beyond test-sprint.cjs (cadence -> speed mapping, frame/time edge cases, ghost).
import {describe,it,expect} from "vitest";
import {runner,onStep,cadenceAt,targetSpeed,advance,simulate,ghostX,K_SPEED,V_MAX,DT_MAX,RACE_M} from "../../src/sprint/speed.ts";

describe("cadence -> target speed",()=>{
  it("linear up to V_MAX, 0 at rest",()=>{
    expect(targetSpeed(0)).toBe(0);
    expect(targetSpeed(2)).toBeCloseTo(2*K_SPEED);
    expect(targetSpeed(V_MAX/K_SPEED+1)).toBe(V_MAX);
  });
  it("first step alone gives no cadence (needs an interval)",()=>{
    const r=runner();onStep(r,1);expect(r.cad).toBe(0);expect(cadenceAt(r,1.2)).toBe(0);
  });
  it("a pause longer than DT_MAX does not count as a (slow) interval",()=>{
    const r=runner();onStep(r,0);onStep(r,DT_MAX+0.5);expect(r.cad).toBe(0);
  });
  it("cadence decays when the next step is overdue, 0 after DT_MAX",()=>{
    const r=runner();onStep(r,0);onStep(r,0.5); // 2 steps/s
    expect(cadenceAt(r,0.6)).toBe(2);
    expect(cadenceAt(r,0.5+0.9)).toBeCloseTo(1.5/0.9);
    expect(cadenceAt(r,0.5+DT_MAX+0.01)).toBe(0);
  });
});

describe("integration",()=>{
  it("dt <= 0 (duplicate frame / clock jump back) changes nothing",()=>{
    const r=runner();onStep(r,0);onStep(r,0.3);
    advance(r,0.4,0);advance(r,0.4,-0.016);
    expect([r.x,r.v]).toEqual([0,0]);
  });
  it("a huge frame gap (tab hidden) cannot exceed the acceleration cap",()=>{
    const r=runner();for(let k=0;k<6;k++)onStep(r,k*0.25);
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
