// Slidinėjimas (src/ski/logic.ts): deterministic course, gates (clean / miss / hit), out-of-bounds time penalty,
// poling/braking/steering physics, ranking and the camera gestures (lean, pole pull, lean back).
import {describe,it,expect} from "vitest";
import type {Lm} from "../../src/detect/classifier.ts";
import {COURSE_M,HALF_W,SOFT_W,GATE_FIRST,GATE_EVERY,GATE_HALF,MISS_PENALTY,LIMIT_S,GLIDE,BRAKE_V,V_MAX,PUSH_DOUBLE,
  newCourse,newSkier,newPoleState,tick,readControl,penalty,rank,bestTime,total,turnOf,centerAt} from "../../src/ski/logic.ts";

function drive(course:ReturnType<typeof newCourse>,{pushEvery=.72,brake=0}={}){
  const s=newSkier(course);let t=0,nextPush=.5;const dt=1/60;
  while(s.fin==null&&!s.dnf&&t<LIMIT_S+5){
    const g=course.gates[s.gate];
    const target=g?g.x:centerAt(course,COURSE_M);
    const steer=Math.max(-1,Math.min(1,(target-s.x)/4));
    const push=t>=nextPush;
    tick(s,course,dt,{steer,brake,push});
    if(push)nextPush=t+pushEvery;
    t+=dt;
  }
  return s;
}

// synthetic MediaPipe frame; raw x is mirrored inside readControl (ar=1), so a smaller raw x = further right on screen
function frame(o:{sx?:number;hipX?:number;shY?:number;hipY?:number;wristY?:number;wristLY?:number;wristRY?:number;wristX?:number;ear?:number;vis?:number}={}):Lm[]{
  const a:any[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:o.vis??1}));
  const sx=o.sx??.5,hx=o.hipX??.5,shY=o.shY??.3,hipY=o.hipY??.6,wristY=o.wristY??.42,wristX=o.wristX??.5;
  a[11]={x:sx-.08,y:shY,z:0,visibility:o.vis??1};a[12]={x:sx+.08,y:shY,z:0,visibility:o.vis??1};
  a[13]={x:sx-.12,y:wristY-.08,z:0,visibility:o.vis??1};a[14]={x:sx+.12,y:wristY-.08,z:0,visibility:o.vis??1};
  a[15]={x:wristX-.05,y:o.wristLY??wristY,z:0,visibility:o.vis??1};a[16]={x:wristX+.05,y:o.wristRY??wristY,z:0,visibility:o.vis??1};
  a[23]={x:hx-.06,y:hipY,z:0,visibility:o.vis??1};a[24]={x:hx+.06,y:hipY,z:0,visibility:o.vis??1};
  a[0]={x:.5,y:.2,z:0,visibility:o.vis??1};a[1]={x:.45,y:.22,z:0,visibility:o.vis??1};a[2]={x:.55,y:.22,z:0,visibility:o.vis??1};
  return a as Lm[];
}

describe("course",()=>{
  it("the same seed gives the same course; different seeds differ",()=>{
    const a=newCourse(123),b=newCourse(123),c=newCourse(124);
    expect(a.gates).toEqual(b.gates);
    expect(a.trees).toEqual(b.trees);
    expect(a.gates).not.toEqual(c.gates);
  });
  it("gates are ordered, spaced, inside the ribbon and within the walls",()=>{
    for(const seed of [1,2,99,424242]){
      const c=newCourse(seed);
      expect(c.gates.length).toBeGreaterThan(6);
      c.gates.forEach((g,i)=>{
        expect(g.z).toBe(GATE_FIRST+i*GATE_EVERY);
        expect(g.z).toBeLessThan(COURSE_M);
        expect(g.x+g.half).toBeLessThan(HALF_W);
        expect(g.x-g.half).toBeGreaterThan(-HALF_W);
        expect(Math.abs(g.x-centerAt(c,g.z))).toBeLessThan(HALF_W);
      });
    }
  });
  it("the centre line stays inside the ribbon and bends",()=>{
    const c=newCourse(7);let lo=1e9,hi=-1e9;
    for(let z=0;z<=COURSE_M;z+=5){const x=centerAt(c,z);lo=Math.min(lo,x);hi=Math.max(hi,x);expect(Math.abs(x)).toBeLessThan(HALF_W-1)}
    expect(hi-lo).toBeGreaterThan(2);
  });
});

describe("ski physics",()=>{
  const c=newCourse(11);
  it("glides to the finish without input",()=>{
    const s=newSkier(c);let t=0;
    while(s.fin==null&&!s.dnf&&t<LIMIT_S+5){tick(s,c,1/60,{steer:0,brake:0,push:false});t+=1/60}
    expect(s.fin).not.toBeNull();
    expect(s.v).toBeGreaterThan(0);
    expect(s.z).toBeGreaterThanOrEqual(COURSE_M);
  });
  it("poling speeds the skier up and cuts the time",()=>{
    const slow=newSkier(c),fast=newSkier(c);let t=0,next=.5;
    while((slow.fin==null||fast.fin==null)&&t<LIMIT_S){
      tick(slow,c,1/60,{steer:0,brake:0,push:false});
      const push=t>=next;
      tick(fast,c,1/60,{steer:0,brake:0,push});
      if(push)next=t+.72;
      t+=1/60;
    }
    expect(fast.fin!).toBeLessThan(slow.fin!);
    expect(fast.poles).toBeGreaterThan(10);
    expect(fast.maxV).toBeGreaterThan(GLIDE);
  });
  it("leaning back brakes toward BRAKE_V but does not stop",()=>{
    const s=newSkier(c);s.v=18;
    for(let t=0;t<1.5;t+=1/60)tick(s,c,1/60,{steer:0,brake:1,push:false});
    expect(s.v).toBeLessThan(BRAKE_V+1);
    expect(s.v).toBeGreaterThan(0);
  });
  it("steering moves the skier to the side; the sign follows the lean",()=>{
    const a=newSkier(c),b=newSkier(c);
    for(let t=0;t<1.2;t+=1/60){tick(a,c,1/60,{steer:1,brake:0,push:false});tick(b,c,1/60,{steer:-1,brake:0,push:false})}
    expect(a.x).toBeGreaterThan(b.x+1);
    expect(a.heading).toBeGreaterThan(0);
    expect(b.heading).toBeLessThan(0);
  });
  it("the speed cap holds",()=>{
    const s=newSkier(c);s.v=V_MAX;
    for(let t=0;t<4;t+=1/60){s.v=V_MAX;tick(s,c,1/60,{steer:0,brake:0,push:true})}
    expect(s.v).toBeLessThanOrEqual(V_MAX);
  });
  it("out of bounds collects a time penalty and slows the skier, re-entering stops it",()=>{
    const s=newSkier(c);s.z=30;s.x=centerAt(c,30)+HALF_W+SOFT_W*.5;s.heading=0;s.v=12;
    const v0=s.v;
    for(let t=0;t<2;t+=1/60)tick(s,c,1/60,{steer:0,brake:0,push:false});
    expect(s.oob).toBeGreaterThan(1.8);
    expect(s.v).toBeLessThan(v0);
    const oob=s.oob;
    s.x=centerAt(c,s.z);s.heading=0;
    for(let t=0;t<1;t+=1/60)tick(s,c,1/60,{steer:0,brake:0,push:false});
    expect(s.oob).toBeCloseTo(oob,5);
    expect(penalty(s)).toBeCloseTo(oob+MISS_PENALTY*s.miss,5);
  });
});

describe("gates and penalties",()=>{
  const c=newCourse(5),g0=c.gates[0];
  const atGate=(x:number)=>{const s=newSkier(c);s.z=g0.z-.05;s.x=x;s.heading=0;s.v=12;return s};
  it("passing between the flags = clean",()=>{
    const s=atGate(g0.x);const ev=tick(s,c,1/60,{steer:0,brake:0,push:false});
    expect(ev.map(e=>e.type)).toContain("clean");
    expect(s.res[0]).toBe("ok");expect(s.clean).toBe(1);expect(s.hit+s.miss).toBe(0);
  });
  it("passing outside the gate span = missed + MISS_PENALTY",()=>{
    const s=atGate(g0.x+g0.half+1);const ev=tick(s,c,1/60,{steer:0,brake:0,push:false});
    expect(ev.map(e=>e.type)).toContain("miss");
    expect(s.res[0]).toBe("miss");expect(s.miss).toBe(1);
    expect(penalty(s)).toBeCloseTo(MISS_PENALTY,5);
  });
  it("touching a pole stops the skier dead and sets a crash timer",()=>{
    const s=atGate(g0.x-g0.half);const ev=tick(s,c,1/60,{steer:0,brake:0,push:false});
    expect(ev.map(e=>e.type)).toContain("hit");
    expect(s.res[0]).toBe("hit");expect(s.hit).toBe(1);
    expect(s.v).toBe(0);expect(s.crash).toBeGreaterThan(.5);
  });
  it("the finish time includes out-of-bounds time and missed gates",()=>{
    const s=newSkier(c);s.z=COURSE_M-.01;s.x=centerAt(c,COURSE_M);s.t=20;s.oob=1.25;s.miss=2;s.gate=c.gates.length;
    tick(s,c,1/60,{steer:0,brake:0,push:false});
    expect(s.raw).toBeCloseTo(20+1/60,5);
    expect(s.fin).toBeCloseTo(20+1/60+1.25+2*MISS_PENALTY,5);
  });
  it("a run over the time limit is a DNF",()=>{
    const s=newSkier(c);s.t=LIMIT_S-.01;s.z=10;
    const ev=tick(s,c,1/60,{steer:0,brake:0,push:false});
    expect(ev.map(e=>e.type)).toContain("dnf");
    expect(s.dnf).toBe(true);expect(s.fin).toBeNull();
  });
  it("a clean autopilot run finishes, in a sane time, and the gate order is set",()=>{
    const s=drive(c);
    expect(s.fin).not.toBeNull();
    expect(s.fin!).toBeGreaterThan(15);
    expect(s.fin!).toBeLessThan(70);
    expect(s.gate).toBe(c.gates.length);
    expect(s.clean+s.miss+s.hit).toBe(c.gates.length);
    expect(s.miss).toBeLessThan(4); // steering by proportional control is not perfect, but it should hit most gates
  });
});

describe("ranking and turns",()=>{
  it("fastest wins; ties share the place; DNF last without a place",()=>{
    const r=rank([23.4,20.1,23.4,null]);
    expect(r.map(x=>[x.i,x.place])).toEqual([[1,1],[0,2],[2,2],[3,null]]);
    expect(bestTime([null,22.2,19.9])).toBe(19.9);
    expect(bestTime([null,undefined as any])).toBe(Infinity);
  });
  it("one run per player, in order",()=>{
    expect(total(0)).toBe(1);expect(total(9)).toBe(4);
    expect([0,1,2,3].map(k=>turnOf(k,2))).toEqual([{round:0,player:0},{round:0,player:1},{round:0,player:1},{round:0,player:1}]);
    expect(turnOf(2,4).player).toBe(2);
  });
});

describe("camera controls",()=>{
  it("standing upright: no steer, no brake",()=>{
    const p=newPoleState(),c=readControl(frame(),1,p,1000);
    expect(c.ok).toBe(true);
    expect(Math.abs(c.steer)).toBeLessThan(.01);
    expect(c.brake).toBe(0);
  });
  it("leaning right steers right, leaning left steers left (mirrored screen space)",()=>{
    const right=readControl(frame({sx:.44,hipX:.5,hipY:.6}),1,newPoleState(),1000); // raw x smaller = player's right
    const left=readControl(frame({sx:.56,hipX:.5,hipY:.6}),1,newPoleState(),1000);
    expect(right.steer).toBeGreaterThan(.3);
    expect(left.steer).toBeLessThan(-.3);
  });
  it("leaning back shortens the torso and brakes",()=>{
    const p=newPoleState();
    const c=readControl(frame({shY:.5,hipY:.6}),1,p,1000);
    expect(c.brake).toBeGreaterThan(.6);
    const upright=readControl(frame({shY:.3,hipY:.6}),1,newPoleState(),1000);
    expect(upright.brake).toBe(0);
  });
  it("both gloves pulling down from chest past the hips = one strong pole push; it must re-arm",()=>{
    const p=newPoleState(),now=1000;
    let c=readControl(frame({wristY:.42}),1,p,now);
    expect(c.push).toBe(false);
    c=readControl(frame({wristY:.65}),1,p,now+120);
    expect(c.push).toBe(true);expect(c.pushes).toBe(2);expect(c.power).toBe(PUSH_DOUBLE);
    c=readControl(frame({wristY:.68}),1,p,now+160);
    expect(c.push).toBe(false); // still low: no double count
    c=readControl(frame({wristY:.42}),1,p,now+320);
    expect(c.push).toBe(false); // back up: arming
    c=readControl(frame({wristY:.65}),1,p,now+440);
    expect(c.push).toBe(true);
  });
  it("one hand at a time works; alternating hands each count",()=>{
    const p=newPoleState(),now=1000;
    readControl(frame({wristLY:.42,wristRY:.42}),1,p,now);
    let c=readControl(frame({wristLY:.65,wristRY:.42}),1,p,now+120); // left dives, right stays
    expect(c.push).toBe(true);expect(c.pushes).toBe(1);expect(c.hand).toBe(0);expect(c.power).toBe(1);
    c=readControl(frame({wristLY:.66,wristRY:.42}),1,p,now+240);
    expect(c.push).toBe(false); // left is still low
    readControl(frame({wristLY:.42,wristRY:.42}),1,p,now+360); // left back up -> re-arms
    c=readControl(frame({wristLY:.42,wristRY:.65}),1,p,now+480); // right dives
    expect(c.push).toBe(true);expect(c.pushes).toBe(1);expect(c.hand).toBe(1);
  });
  it("a short partial pull (chest to waist) also counts",()=>{
    const p=newPoleState(),now=1000;
    readControl(frame({wristY:.55}),1,p,now);
    const c=readControl(frame({wristY:.68}),1,p,now+120);
    expect(c.push).toBe(true);
  });
  it("a hand held still or a tiny jiggle does not push",()=>{
    const p=newPoleState(),now=1000;
    readControl(frame({wristY:.42}),1,p,now);
    expect(readControl(frame({wristY:.42}),1,p,now+120).push).toBe(false);
    expect(readControl(frame({wristY:.44}),1,p,now+240).push).toBe(false); // slow 2 cm
    expect(readControl(frame({wristY:.46}),1,p,now+360).push).toBe(false);
  });
  it("a slow lower or one hand out to the side is not a pole push",()=>{
    const p=newPoleState(),now=1000;
    readControl(frame({wristY:.42}),1,p,now);
    const slow=readControl(frame({wristY:.46}),1,p,now+500); // 4 cm over 0.5 s = 0.27 u/s
    expect(slow.push).toBe(false);
    const q=newPoleState();
    readControl(frame({wristY:.42,wristX:.95}),1,q,now); // hands wide, not in front of the body
    const wide=readControl(frame({wristY:.65,wristX:.95}),1,q,now+120);
    expect(wide.push).toBe(false);
  });
  it("alternating arm strokes detected from the camera actually raise the speed",()=>{
    const p=newPoleState(),course=newCourse(3),s=newSkier(course);
    let now=1000,down=false;
    readControl(frame({wristY:.42}),1,p,now);
    for(let k=0;k<10;k++){
      down=!down;
      const r=readControl(frame({wristY:down?.65:.42}),1,p,now+=120);
      tick(s,course,1/60,{steer:0,brake:0,push:r.push,power:r.power});
    }
    expect(s.poles).toBeGreaterThan(2);
    expect(s.v).toBeGreaterThan(GLIDE);
  });
  it("lost visibility / NaN / a missing torso = no controls (the game keeps gliding)",()=>{
    const p=newPoleState();
    expect(readControl(frame({vis:.1}),1,p,1000).ok).toBe(false);
    const nan=frame();nan[11]={...nan[11],x:NaN};
    expect(readControl(nan,1,p,1000).ok).toBe(false);
    const noHips=frame();noHips[23]={...noHips[23],visibility:0};noHips[24]={...noHips[24],visibility:0};
    expect(readControl(noHips,1,p,1000).ok).toBe(false);
  });
});
