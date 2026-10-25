// Sprint speed model (src/sprint/speed.ts): cadence -> speed -> 100 m time. Prints OK.
const assert=require("assert");
const {simulate,runner,onStep,advance,cadenceAt,targetSpeed,ghostX,V_MAX}=require("./src/sprint/speed.ts");
const time=c=>simulate(c).fin;
// normal effort lands in 11-18 s, elite cadence ~10 s, faster cadence is always faster
assert.ok(time(2.5)>15&&time(2.5)<18.5,`2.5/s -> ${time(2.5)}`);
assert.ok(time(3)>12.5&&time(3)<15.5,`3/s -> ${time(3)}`);
assert.ok(time(3.5)>11&&time(3.5)<13.5,`3.5/s -> ${time(3.5)}`);
assert.ok(time(5)>9.6&&time(5)<11,`5/s -> ${time(5)}`);
for(let c=1.5;c<5;c+=.25)assert.ok(time(c+.25)<=time(c),`monotonic at ${c}`);
assert.ok(Math.abs(time(6)-time(7.5))<.15,"capped: V_MAX");
assert.equal(simulate(12,.3,60,20).x,0,"steps faster than DT_MIN = jitter, ignored");
assert.equal(simulate(0,0.3,60,20).x,0,"no steps -> no movement");
assert.equal(targetSpeed(99),V_MAX);
// frame rate independent (finish time interpolated inside the frame)
assert.ok(Math.abs(simulate(3,.3,30).fin-simulate(3,.3,120).fin)<.06,"30 vs 120 Hz");
// stopping: cadence decays, speed falls to ~0 within ~2 s, distance stops growing
const r=runner();let t=0;
for(let k=0;k<12;k++)onStep(r,k/3);
for(;t<4;t+=1/60)advance(r,t,1/60);
const vRun=r.v;assert.ok(vRun>6,`running speed ${vRun}`);
for(;t<6.5;t+=1/60)advance(r,t,1/60);
assert.ok(r.v<0.3,`stopped speed ${r.v}`);assert.equal(cadenceAt(r,t),0);
// one glitchy double count (<DT_MIN) does not spike the cadence
const g=runner();onStep(g,0);onStep(g,.33);onStep(g,.36);assert.ok(Math.abs(g.cad-3.03)<.01,`glitch cad ${g.cad}`);
// 10 splits, last = finish; ghost replays them
const s=simulate(3);assert.equal(s.splits.length,10);assert.equal(s.splits[9],s.fin);
assert.ok(Math.abs(ghostX(s.splits,s.splits[4])-50)<1e-6&&Math.abs(ghostX(s.splits,s.fin)-100)<1e-6);
assert.ok(ghostX(s.splits,s.splits[0]/2)<5,"ghost accelerates");
console.log("OK",[2.5,3,3.5,4,5].map(c=>`${c}/s=${time(c).toFixed(2)}s`).join(" "));
