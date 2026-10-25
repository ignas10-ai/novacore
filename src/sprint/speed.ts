// Sprint speed model. PURE (no DOM): knee-lift steps -> cadence -> running speed -> distance. test-sprint.cjs imports it.
// One "step" = one knee lift counted by step(...,"knees") (each leg separately), so cadence is steps per second.
// Tuning (2026-10-25): normal in-place high knees 2.5-3.5 steps/s -> 100 m in ~12-17 s; fast 4.5+/s hits V_MAX -> ~10.5 s.
export const RACE_M=100;
export const K_SPEED=2.6;              // m/s per step/s: 3 steps/s = 7.8 m/s
export const V_MAX=11.5;               // m/s cap
export const A_MAX=6.5;                // m/s² acceleration cap (a sprinter's start, not a car)
export const TAU_UP=0.8, TAU_DOWN=0.45; // s: speed eases toward the target (slower up than down: stopping is felt at once)
export const DT_MIN=0.12, DT_MAX=1.2;  // s between steps: faster = detector jitter, slower = not running any more
export const CAD_EMA=0.35;             // smoothing per step
export const SPLIT_M=10;

export interface Runner{x:number;v:number;cad:number;last:number;steps:number;vTop:number;fin:number|null;splits:number[]}
export const runner=():Runner=>({x:0,v:0,cad:0,last:-1,steps:0,vTop:0,fin:null,splits:[]});

// a knee lift at race time t (s)
export function onStep(r:Runner,t:number){
  r.steps++;
  if(r.last>=0){
    const dt=t-r.last;
    if(dt>=DT_MIN&&dt<=DT_MAX){const c=1/dt;r.cad=r.cad?r.cad+(c-r.cad)*CAD_EMA:c}
  }
  r.last=t;
}
// cadence right now: decays once the next step is overdue (1.5x the current interval), 0 after DT_MAX
export function cadenceAt(r:Runner,t:number){
  if(!r.cad||r.last<0)return 0;
  const gap=t-r.last;
  if(gap>DT_MAX)return 0;
  return gap*r.cad>1.5?1.5/gap:r.cad;
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
    while(cad>0&&t>=next){onStep(r,next);next+=1/cad}
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
