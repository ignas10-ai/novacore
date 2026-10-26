// Sprint speed model. PURE (no DOM): knee-lift steps -> cadence -> running speed -> distance. test-sprint.cjs imports it.
// One "step" = one knee lift counted by step(...,"knees") (each leg separately), so cadence is steps per second.
// Speed follows ONLY how often the legs alternate, never how high they go (2026-10-26, Martynas on a real phone:
// slow but very high lifts "flew"). Old cause: cadence was an EMA of 1/Δt, intervals > 1.2 s were ignored, and a
// same-leg repeat (one-frame left/right knee swap while a knee is held high, knees.json 12.9 s) counted as a step:
// one 0.26 s glitch doubled the cadence and the slow intervals after it never pulled it back down.
// Now: cadence = alternating steps / time over the last ~1.25 s (mean interval, so one extra step adds little),
// same-leg repeats ignored, slow intervals lower it, an overdue step decays it as 1/gap, 0 after DT_MAX.
// Curve: v* = 2.6 m/s per step/s, cap 11.5: 0.7/s 1.7 m/s walk · 1/s 2.6 · 1.5/s 3.9 jog · 3/s 7.8 run · 4.4+/s cap (100 m below).
export const RACE_M=100;
export const K_SPEED=2.6;              // m/s per step/s: 3 steps/s = 7.8 m/s
export const V_MAX=11.5;               // m/s cap
export const A_MAX=6.5;                // m/s² acceleration cap (a sprinter's start, not a car)
export const TAU_UP=0.8, TAU_DOWN=0.45; // s: speed eases toward the target (slower up than down: stopping is felt at once)
export const DT_MIN=0.12, DT_MAX=1.5;  // s between steps: faster = detector jitter, slower = stopped (next step starts over)
export const WIN=1.25;                 // s: cadence window (intervals ending in the last WIN s; at least one)
export const SPLIT_M=10;

// ts = recent counted step times (oldest first), leg = leg of the last counted step (-1 unknown)
export interface Runner{x:number;v:number;ts:number[];leg:number;steps:number;vTop:number;fin:number|null;splits:number[]}
export const runner=():Runner=>({x:0,v:0,ts:[],leg:-1,steps:0,vTop:0,fin:null,splits:[]});

// a knee lift at race time t (s); leg 0/1 from the detector, -1 = unknown (alternation not checked)
export function onStep(r:Runner,t:number,leg=-1){
  r.steps++;
  const last=r.ts[r.ts.length-1];
  if(last!=null&&t-last<DT_MIN){r.ts[r.ts.length-1]=t;return} // detector double count / burst: one step
  if(leg>=0&&leg===r.leg)return;                 // same leg again: not a running step (leg swap glitch / hopping)
  if(last!=null&&t-last>DT_MAX)r.ts.length=0;    // after a stop the next step starts over
  r.leg=leg;r.ts.push(t);
  if(r.ts.length>8)r.ts.shift();
}
// cadence right now: mean step rate over the window, decaying as 1/gap once the next step is overdue, 0 after DT_MAX
export function cadenceAt(r:Runner,t:number){
  const ts=r.ts,n=ts.length;
  if(n<2)return 0;
  const last=ts[n-1],gap=t-last;
  if(gap>DT_MAX)return 0;
  let k=n-2;
  while(k>0&&ts[k-1]>=last-WIN)k--;
  const cad=(n-1-k)/(last-ts[k]);
  return gap*cad>1?1/gap:cad;
}
export const targetSpeed=(cad:number)=>Math.min(V_MAX,K_SPEED*cad);

// integrate one frame (dt s, ending at race time t); records splits every 10 m and the interpolated finish time
export function advance(r:Runner,t:number,dt:number){
  if(dt<=0)return;
  const target=targetSpeed(cadenceAt(r,t));
  let dv=(target-r.v)*(1-Math.exp(-dt/(target>r.v?TAU_UP:TAU_DOWN)));
  if(dv>A_MAX*dt)dv=A_MAX*dt;
  r.v+=dv;
  if(r.v>r.vTop)r.vTop=r.v;
  const x0=r.x;
  r.x+=r.v*dt;
  // crossing time by linear interpolation inside the frame (frame-rate independent results)
  while(r.splits.length<RACE_M/SPLIT_M&&r.x>=(r.splits.length+1)*SPLIT_M){
    const m=(r.splits.length+1)*SPLIT_M;
    r.splits.push(t-dt*(r.x-m)/(r.x-x0));
  }
  if(r.fin==null&&r.x>=RACE_M)r.fin=r.splits[r.splits.length-1];
}

// steady cadence from the gun (first step after `react` s) -> finish time + splits. Used for the default ghost and tests.
export function simulate(cad:number,react=0.3,hz=60,limit=60){
  const r=runner(),dt=1/hz;
  let next=react;
  for(let t=dt;t<=limit&&r.fin==null;t+=dt){
    while(cad>0&&t>=next){onStep(r,next,r.steps%2);next+=1/cad}
    advance(r,t,dt);
  }
  return r;
}
// ghost position from stored 10 m splits (accelerating through the first split, linear between the rest)
export function ghostX(splits:number[],t:number){
  if(!splits.length||t<=0)return 0;
  const t1=splits[0];
  if(t<t1)return SPLIT_M*(t/t1)**1.6;
  for(let k=1;k<splits.length;k++)if(t<splits[k])return SPLIT_M*(k+(t-splits[k-1])/(splits[k]-splits[k-1]));
  return SPLIT_M*splits.length+(t-splits[splits.length-1])*SPLIT_M/Math.max(.5,splits[splits.length-1]-(splits[splits.length-2]??0));
}
