// Boulingas (src/bowling/logic.ts): real ten-pin scoring (strike / spare / bonus balls), turn rotation for 1-4
// players, split detection, the aim/lean geometry and the deterministic ball + pin physics.
import {describe,it,expect} from "vitest";
import {
  PINS, PIN_Z, PIN_GAP, MAX_Z, FRAME_W, LANE_W, BALL_R, SPEED_MIN, SPEED_MAX, HAND_OUT, LEAN_MAX,
  newSeries, turnOf, addRoll, rackCount, scoreCard, rank, rollMarks, isSplit, simulateThrow, control, handChoice, aimOf,
  ballX, targetX, throwSpeed, bestTotal, maxRolls, pickStep, spinOf, swing, swingState, type Series,
} from "../../src/bowling/logic.ts";
import type {Lm} from "../../src/detect/classifier.ts";

const full=[true,true,true,true,true,true,true,true,true,true];
const ids=(n:number)=>Array.from({length:n},(_,i)=>i);
const throwN=(s:Series,n:number)=>addRoll(s,ids(n));

describe("lane + throw geometry",()=>{
  it("10 pins in the real triangle, symmetric, head pin at 18.29 m",()=>{
    expect(PINS).toHaveLength(10);
    expect(PINS[0]).toEqual([0,PIN_Z]);
    expect(PINS[3][0]).toBeCloseTo(-PIN_GAP,9);
    expect(PINS[5][0]).toBeCloseTo(PIN_GAP,9);
    expect(PINS[9][0]).toBeCloseTo(PIN_GAP*1.5,9);
    for(const [x] of PINS)expect(Math.abs(x)).toBeLessThan(LANE_W/2);
    // the rows get wider: 1 pin, 2, 3, 4
    expect(PINS.filter(([,z])=>Math.abs(z-PIN_Z)<1e-6)).toHaveLength(1);
    expect(PINS.filter(([,z])=>Math.abs(z-(PIN_Z+PIN_GAP))<1e-6)).toHaveLength(2);
    expect(PINS.filter(([,z])=>Math.abs(z-(PIN_Z+PIN_GAP*2))<1e-6)).toHaveLength(3);
    expect(PINS.filter(([,z])=>Math.abs(z-(PIN_Z+PIN_GAP*3))<1e-6)).toHaveLength(4);
  });
  it("aim maps to a board and a hook bends late; straight line hits the chosen target",()=>{
    expect(targetX(0)).toBe(0);
    expect(targetX(1)).toBeCloseTo(FRAME_W,9);
    expect(targetX(2)).toBeCloseTo(FRAME_W,9);
    expect(ballX(PIN_Z,0.4,0)).toBeCloseTo(targetX(0.4),9);
    expect(ballX(PIN_Z,0,1)).toBeGreaterThan(ballX(PIN_Z,0,0));
    expect(ballX(PIN_Z,0,-1)).toBeLessThan(ballX(PIN_Z,0,0));
    expect(Math.abs(ballX(PIN_Z,1,0))).toBeGreaterThan(LANE_W/2); // a full aim is in the gutter
  });
  it("speed comes from the swing and stays in range",()=>{
    expect(throwSpeed(0)).toBe(SPEED_MIN);
    expect(throwSpeed(100)).toBe(SPEED_MAX);
    expect(throwSpeed(4)).toBeGreaterThan(throwSpeed(2));
  });
});

describe("pin physics",()=>{
  it("a ball down the middle leaves pins (no automatic strike); a gutter ball knocks none",()=>{
    const centre=simulateThrow(full,0,0,11), pocket=simulateThrow(full,0.22,0,11), left=simulateThrow(full,-1,0,11), right=simulateThrow(full,1,0,11);
    expect(centre.down.length).toBeGreaterThanOrEqual(7);
    expect(centre.down.length).toBeLessThan(10); // dead centre is not a strike any more
    expect(centre.down).toContain(0);
    expect(pocket.down.length).toBe(10); // the pocket is still the strike ball
    expect(left.down).toEqual([]);
    expect(right.down).toEqual([]);
    expect(left.gutter).toBe(true);
    expect(right.gutter).toBe(true);
    expect(centre.gutter).toBe(false);
  });
  it("the ball is deflected by the pins it hits (not a canned straight path)",()=>{
    const t=simulateThrow(full,0,0,11);
    const atPin=t.frames.find(f=>f.bz>=PIN_Z)!;
    expect(Math.abs(atPin.bx-ballX(PIN_Z,0,0))).toBeGreaterThan(.003);
  });
  it("the per-throw pin scatter is seeded (0 = exact) and the standing set is kept",()=>{
    const standing=[true,false,true,false,true,false,true,false,true,false];
    const a=simulateThrow(standing,0,0,11,123), b=simulateThrow(standing,0,0,11,456), exact=simulateThrow(full,0,0,11);
    expect(a.standing).toEqual(standing);
    expect(a.down.every(i=>standing[i])).toBe(true);
    expect(a.frames[0].p[0].x).not.toBe(b.frames[0].p[0].x);
    expect(exact.frames[0].p[0].x).toBe(PINS[0][0]); // seed 0 keeps the unit tests exact
  });
  it("swept pins from the previous ball do not sit on the deck and block the next ball",()=>{
    const standing=[true,false,false,false,false,false,false,false,false,false];
    const t=simulateThrow(standing,0,0,11);
    const last=t.frames.at(-1)!;
    expect(last.p[1].x).toBe(PINS[1][0]);
    expect(last.p[1].z).toBe(PINS[1][1]);
    expect(t.standing).toEqual(standing);
  });
  it("off-centre hits leave pins; a second ball only hits what is still standing",()=>{
    const first=simulateThrow(full,0.7,0,11);
    expect(first.down.length).toBeGreaterThan(0);
    expect(first.down.length).toBeLessThan(10);
    const standing=full.map((v,i)=>v&&!first.down.includes(i));
    const second=simulateThrow(standing,0,0,11);
    expect(second.down.every(i=>standing[i])).toBe(true);
    expect(second.down.length).toBeGreaterThan(0);
  });
  it("hook changes the result and the path is monotonic down the lane",()=>{
    const a=simulateThrow(full,0.2,0,11), b=simulateThrow(full,0.2,1,11);
    expect(a.down.join(",")).not.toBe(b.down.join(","));
    for(const t of [a,b]){
      expect(t.frames.length).toBeGreaterThan(40);
      for(let i=1;i<t.frames.length;i++){
        expect(t.frames[i].t).toBeGreaterThan(t.frames[i-1].t);
        expect(t.frames[i].bz).toBeGreaterThanOrEqual(t.frames[i-1].bz);
      }
      expect(t.frames.at(-1)!.bz).toBeCloseTo(MAX_Z,5);
      const atPin=t.frames.find(f=>f.bz>=PIN_Z)!;
      expect(atPin.bx).toBeCloseTo(ballX(PIN_Z,.2,t.hook),1);
    }
  });
  it("a faster ball reaches the pins sooner",()=>{
    const slow=simulateThrow(full,0,0,SPEED_MIN), fast=simulateThrow(full,0,0,SPEED_MAX);
    const hit=(t:typeof slow)=>t.frames.find(f=>f.bz>=PIN_Z)!.t;
    expect(hit(fast)).toBeLessThan(hit(slow));
  });
});

describe("ten-pin scoring",()=>{
  it("three frames of strikes = 90 (the last frame gets two bonus balls)",()=>{
    const s=newSeries(1,3);
    for(let i=0;i<9;i++)throwN(s,10);
    expect(s.done).toBe(true);
    expect(s.frameRolls[0]).toEqual([[10],[10],[10,10,10]]);
    expect(scoreCard(s).totals[0]).toBe(90);
  });
  it("five frames of strikes = 150 (the 5-frame option uses the same last-frame rule)",()=>{
    const s=newSeries(1,5);
    for(let i=0;i<13;i++)throwN(s,10);
    expect(s.done).toBe(true);
    expect(s.frameRolls[0]).toEqual([[10],[10],[10],[10],[10,10,10]]);
    expect(scoreCard(s).totals[0]).toBe(150);
  });
  it("three frames of spares = 45",()=>{
    const s=newSeries(1,3);
    for(let f=0;f<3;f++){throwN(s,5);throwN(s,5)}
    throwN(s,5); // the last frame's bonus ball
    expect(s.done).toBe(true);
    expect(scoreCard(s).totals[0]).toBe(45);
  });
  it("open frames add up; a strike's bonus crosses frames",()=>{
    const open=newSeries(1,3);for(let i=0;i<3;i++){throwN(open,3);throwN(open,4)}
    expect(scoreCard(open).totals[0]).toBe(21);
    const mixed=newSeries(1,3);
    throwN(mixed,10);            // frame 1
    throwN(mixed,7);throwN(mixed,2); // frame 2
    throwN(mixed,9);throwN(mixed,0); // frame 3
    expect(scoreCard(mixed).totals[0]).toBe(19+9+9);
  });
  it("the last frame handles strike / spare / open bonus balls",()=>{
    const last=(rolls:number[])=>{
      const s=newSeries(1,3);
      for(let i=0;i<2;i++){throwN(s,0);throwN(s,0)} // 0,0 in the first two frames
      for(const n of rolls)throwN(s,n);
      return s;
    };
    expect(scoreCard(last([10,7,2])).totals[0]).toBe(19);
    expect(scoreCard(last([10,10,10])).totals[0]).toBe(30);
    expect(scoreCard(last([7,3,10])).totals[0]).toBe(20);
    expect(scoreCard(last([5,5,5])).totals[0]).toBe(15);
    expect(scoreCard(last([3,4])).totals[0]).toBe(7);
  });
  it("a pending strike bonus shows no total yet, then fills in",()=>{
    const s=newSeries(1,3);
    throwN(s,10);
    expect(scoreCard(s).frameScores[0][0]).toBeNull();
    expect(scoreCard(s).totals[0]).toBe(0);
    throwN(s,2);throwN(s,3);
    expect(scoreCard(s).frameScores[0][0]).toBe(15);
    expect(scoreCard(s).frameScores[0][1]).toBe(5);
    expect(scoreCard(s).totals[0]).toBe(20);
  });
});

describe("turns, marks and splits",()=>{
  it("2 players alternate frames: P1's two balls, P2's two balls, then the next frame",()=>{
    const s=newSeries(2,3), seq:string[]=[];
    while(!s.done){seq.push(`${s.p}:${s.f}`);throwN(s,3)}
    expect(seq).toEqual(["0:0","0:0","1:0","1:0","0:1","0:1","1:1","1:1","0:2","0:2","1:2","1:2"]);
    expect(scoreCard(s).totals).toEqual([18,18]);
  });
  it("a strike ends the frame and passes it on; the last frame's bonus balls stay with the same player",()=>{
    const s=newSeries(2,3);
    for(let f=0;f<2;f++){throwN(s,10);throwN(s,10)}
    expect(s.p).toBe(0);expect(s.f).toBe(2);
    throwN(s,10);expect(s.p).toBe(0);expect(s.frameRolls[0][2]).toEqual([10]);
    throwN(s,10);expect(s.p).toBe(0);expect(s.frameRolls[0][2]).toEqual([10,10]);
    throwN(s,10);expect(s.p).toBe(1);expect(s.frameRolls[0][2]).toEqual([10,10,10]);
    throwN(s,3);throwN(s,4);expect(s.done).toBe(true);
    expect(scoreCard(s).totals).toEqual([90,47]);
  });
  it("4 players take turns in every frame",()=>{
    const s=newSeries(4,3), order:number[]=[];
    while(!s.done){order.push(s.p);throwN(s,0);order.push(s.p);throwN(s,0)}
    expect(order).toEqual([0,0,1,1,2,2,3,3,0,0,1,1,2,2,3,3,0,0,1,1,2,2,3,3]);
  });
  it("scorecard marks: X, spare /, miss –, the last frame's bonus rack",()=>{
    expect(rollMarks([10])).toEqual(["X"]);
    expect(rollMarks([9,1])).toEqual(["9","/"]);
    expect(rollMarks([0,10])).toEqual(["–","/"]);
    expect(rollMarks([10,7,3])).toEqual(["X","7","/"]);
    expect(rollMarks([7,3,10])).toEqual(["7","/","X"]);
    expect(rollMarks([10,10,10])).toEqual(["X","X","X"]);
    expect(rollMarks([3,4])).toEqual(["3","4"]);
  });
  it("split = the head pin down with a gap between two standing pins",()=>{
    const up=(down:number[])=>full.map((v,i)=>v&&!down.includes(i));
    expect(isSplit(up([]))).toBe(false);                       // full rack
    expect(isSplit(up([0]))).toBe(false);                      // 2-3 still touch
    expect(isSplit(up([0,1,2,4,6,7,8,9]))).toBe(true);         // 4-6 split (the back row is gone)
    expect(isSplit(up([0,1,2,3,4,5,7,8]))).toBe(true);         // 7-10 split
    expect(isSplit(up([1,2]))).toBe(false);                    // head pin still up
    expect(isSplit(up([0,1,2,3,4,5,6,7]))).toBe(false);        // only the 9-10 on the right
  });
  it("rank: highest total first, ties share a place",()=>{
    expect(rank([120,90,150])).toEqual([{i:2,total:150,place:1},{i:0,total:120,place:2},{i:1,total:90,place:3}]);
    expect(rank([100,100,80])).toEqual([{i:0,total:100,place:1},{i:1,total:100,place:1},{i:2,total:80,place:3}]);
  });
  it("bestTotal compares the same number of frames only",()=>{
    const rows=[
      {mode:"bowling",players:1,bwFrames:3,bwTotals:[88]},
      {mode:"bowling",players:2,bwFrames:3,bwTotals:[75,102]},
      {mode:"bowling",players:1,bwFrames:5,bwTotals:[150]},
      {mode:"boxing",players:1,bwFrames:3,bwTotals:[999]},
    ];
    expect(bestTotal(rows,3)).toBe(102);
    expect(bestTotal(rows,5)).toBe(150);
    expect(bestTotal([],3)).toBe(0);
  });
});

describe("hand pick: 2 s, both directions, switchable",()=>{
  it("fills the held side over 2 s and drains the other when the player switches",()=>{
    let p:[number,number]=[0,0];
    for(let i=0;i<10;i++)p=pickStep(p,1,.1); // 1 s right
    expect(p[0]).toBeCloseTo(0,6);
    expect(p[1]).toBeCloseTo(.5,6);
    for(let i=0;i<10;i++)p=pickStep(p,0,.1); // switch: right drains, left fills
    expect(p[0]).toBeCloseTo(.5,6);
    expect(p[1]).toBeCloseTo(0,6);
    for(let i=0;i<10;i++)p=pickStep(p,0,.1); // left reaches a choice
    expect(p[0]).toBe(1);
    for(let i=0;i<10;i++)p=pickStep(p,null,.1); // no arm out: both drain
    expect(p[0]).toBeCloseTo(.5,6);
    p=pickStep(p,null,10); // one huge frame is clamped to 100 ms
    expect(p[0]).toBeCloseTo(.45,6);
  });
  it("a single side never overfills and a switch back is allowed",()=>{
    let p:[number,number]=[0,0];
    for(let i=0;i<30;i++)p=pickStep(p,0,.1);
    expect(p[0]).toBe(1);
    for(let i=0;i<5;i++)p=pickStep(p,1,.1); // switch before choosing
    expect(p[0]).toBeCloseTo(.75,6);
    expect(p[1]).toBeCloseTo(.25,6);
  });
});

describe("full back-to-front swing (not just a lowered hand)",()=>{
  const body={sy:.3,u:.3};
  const run=(samples:{t:number;y:number;z:number}[])=>{
    const st=swingState(),out:string[]=[];
    for(const s of samples)out.push(swing(st,{ok:true,y:s.y,z:s.z},body,s.t));
    return {st,out};
  };
  it("back behind the body, then forward/down fast -> release",()=>{
    const {st,out}=run([{t:0,y:.2,z:.4},{t:100,y:.2,z:.42},{t:200,y:.4,z:.1},{t:300,y:.75,z:-.2}]);
    expect(out[0]).toBe("back");
    expect(out[2]).toBe("forward");
    expect(out[3]).toBe("release");
    expect(st.peak).toBeGreaterThan(1.4);
  });
  it("holding the hand down never throws, even when it moves a little",()=>{
    const {out}=run([{t:0,y:.7,z:0},{t:100,y:.72,z:.02},{t:200,y:.75,z:.04},{t:300,y:.78,z:.06}]);
    expect(out).toEqual(["","","",""]);
  });
  it("aiming with the arm up then slowly lowering the hand does not throw",()=>{
    const slow=[];for(let i=0;i<=16;i++)slow.push({t:i*100,y:.2+i*.02,z:.4-i*.005}); // 0.2 u/s, a deliberate slow lower
    const {out}=run(slow);
    expect(out[0]).toBe("back");
    expect(out).not.toContain("release");
  });
  it("back then forward but the hand stays high does not throw",()=>{
    const {out}=run([{t:0,y:.2,z:.4},{t:200,y:.35,z:.05},{t:300,y:.42,z:-.2}]);
    expect(out).not.toContain("release");
  });
  it("the aim pose may be held long; the swing releases when the hand comes down",()=>{
    const {out}=run([{t:0,y:.2,z:.4},{t:3000,y:.2,z:.4},{t:3100,y:.8,z:.3}]);
    expect(out[0]).toBe("back");
    expect(out[1]).toBe("");
    expect(out[2]).toBe("release");
  });
  it("the raised aim pose is enough: hand up, then a fast downswing releases (no z needed)",()=>{
    const {out}=run([{t:0,y:.2,z:NaN},{t:100,y:.2,z:NaN},{t:200,y:.55,z:NaN}]);
    expect(out[0]).toBe("back");
    expect(out[1]).toBe("");
    expect(out[2]).toBe("release");
  });
  it("arms even with the throwing hand at shoulder height (the aim pose may be level)",()=>{
    const {out}=run([{t:0,y:.33,z:NaN},{t:100,y:.33,z:NaN},{t:200,y:.6,z:NaN}]);
    expect(out[0]).toBe("back");
    expect(out[2]).toBe("release");
  });
  it("a fast downswing that jumps from up to low in one camera frame still releases",()=>{
    const {out}=run([{t:0,y:.2,z:NaN},{t:100,y:.2,z:NaN},{t:200,y:.8,z:NaN}]);
    expect(out[0]).toBe("back");
    expect(out[2]).toBe("release");
  });
  it("without MediaPipe z, a raised arm then a fast low swing is the fallback",()=>{
    const {out}=run([{t:0,y:.2,z:NaN},{t:100,y:.4,z:NaN},{t:200,y:.55,z:NaN}]);
    expect(out[0]).toBe("back");
    expect(out[2]).toBe("release");
  });
  it("losing the hand resets the wind-up",()=>{
    const st=swingState();
    swing(st,{ok:true,y:.2,z:.4},body,0);
    expect(st.phase).toBe("back");
    swing(st,{ok:false,y:0,z:NaN},body,100);
    expect(st.phase).toBe("idle");
  });
});

describe("knuckle spin",()=>{
  it("turning the wrist/knuckle right spins right, left spins left, straight goes straight",()=>{
    expect(spinOf(.3)).toBeCloseTo(.345,6);
    expect(spinOf(-.3)).toBeLessThan(0);
    expect(spinOf(0,.5)).toBeCloseTo(.175,6);
    expect(spinOf(10,10)).toBe(1);
    expect(spinOf(-10,-10)).toBe(-1);
    expect(spinOf(0,0)).toBe(0);
  });
});

describe("a frame is two balls; the leaves stay for the second",()=>{
  it("three pins down -> seven remain for ball 2, then the next frame has a full rack",()=>{
    const s=newSeries(1,3);
    addRoll(s,[0,1,2]);
    expect(rackCount(s)).toBe(7);
    expect(turnOf(s)).toMatchObject({p:0,f:0,roll:1});
    expect(maxRolls(s)).toBe(2);
    addRoll(s,[3,4]);
    expect(s.f).toBe(1);
    expect(s.p).toBe(0);
    expect(rackCount(s)).toBe(10);
  });
  it("in a 2-player game the same player gets ball 2 before the turn passes",()=>{
    const s=newSeries(2,3);
    addRoll(s,[0,1,2]);
    expect(s.p).toBe(0);
    expect(turnOf(s).roll).toBe(1);
    addRoll(s,[3]);
    expect(s.p).toBe(1);
    expect(rackCount(s)).toBe(10);
  });
  it("the real physics path keeps the leaves too",()=>{
    const first=simulateThrow(full,0.6,0,11);
    expect(first.down.length).toBeGreaterThan(0);
    expect(first.down.length).toBeLessThan(10);
    const s=newSeries(1,3);
    addRoll(s,first.down);
    expect(rackCount(s)).toBe(10-first.down.length);
    const second=simulateThrow(s.rack,0,0,11);
    addRoll(s,second.down);
    expect(s.f).toBe(1);
    expect(rackCount(s)).toBe(10);
  });
  it("the last frame gets a third ball after a strike and resets only then",()=>{
    const s=newSeries(1,3);
    for(let f=0;f<2;f++){throwN(s,0);throwN(s,0)}
    expect(s.f).toBe(2);
    expect(maxRolls(s)).toBe(3);
    throwN(s,10);
    expect(rackCount(s)).toBe(10);
    expect(turnOf(s)).toMatchObject({p:0,f:2,roll:1});
    throwN(s,7);
    expect(rackCount(s)).toBe(3);
    expect(turnOf(s).roll).toBe(2);
    throwN(s,3);
    expect(s.done).toBe(true);
    expect(s.frameRolls[0][2]).toEqual([10,7,3]);
    expect(scoreCard(s).totals[0]).toBe(20);
  });
});

describe("camera control geometry",()=>{
  // 33 landmarks, only the torso/arms filled. ar=1, mirrored x = 1-x (screen: left wrist on the left).
  function pose():Lm[]{
    const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:1})) as Lm[];
    lm[11]={x:.6,y:.3,visibility:1};lm[12]={x:.4,y:.3,visibility:1}; // shoulders: mirrored 0.4 / 0.6
    lm[23]={x:.6,y:.62,visibility:1};lm[24]={x:.4,y:.62,visibility:1}; // hips
    lm[13]={x:.72,y:.24,visibility:1};lm[15]={x:.82,y:.16,visibility:1}; // left arm out to screen-left
    lm[14]={x:.44,y:.5,visibility:1};lm[16]={x:.5,y:.5,visibility:1};   // right arm down
    return lm;
  }
  it("picks the arm held out to its own side (and the other one down is ignored)",()=>{
    const c=control(pose(),1)!;
    expect(c).not.toBeNull();
    expect(c.body.u).toBeCloseTo(.32,6);
    expect(c.wrists[0].out).toBeGreaterThan(HAND_OUT);
    expect(c.wrists[0].up).toBe(true);
    expect(handChoice(c)).toBe(0);
    expect(aimOf(c,0)).toBeLessThan(-.5);
    expect(c.wrists[0].knuckle).toBeLessThan(0); // left wrist is screen-left of its elbow
    expect(c.lean).toBeCloseTo(0,6);
  });
  it("a right arm out picks the right hand and aims right; both out is not a choice",()=>{
    const lm=pose();
    lm[13]={x:.56,y:.5,visibility:1};lm[15]={x:.5,y:.5,visibility:1}; // left arm down
    lm[14]={x:.28,y:.24,visibility:1};lm[16]={x:.18,y:.16,visibility:1};
    const c=control(lm,1)!;
    expect(handChoice(c)).toBe(1);
    expect(aimOf(c,1)).toBeGreaterThan(.5);
    expect(c.wrists[1].knuckle).toBeGreaterThan(.2); // wrist outside the elbow = knuckle right
    lm[13]={x:.72,y:.24,visibility:1};lm[15]={x:.82,y:.16,visibility:1};
    const both=control(lm,1)!;
    expect(handChoice(both)).toBeNull();
  });
  it("reads the MediaPipe depth z relative to the shoulder for the full swing",()=>{
    const lm=pose();
    lm[11].z=0;lm[12].z=0;lm[15].z=.1;
    const c=control(lm,1)!;
    expect(c.wrists[0].z).toBeCloseTo(.1/.32,6);
    lm[15]={x:.82,y:.16,z:NaN,visibility:1};
    const noZ=control(lm,1)!;
    expect(Number.isNaN(noZ.wrists[0].z)).toBe(true);
  });
  it("lean comes from the shoulders vs the hips; a low-visibility wrist is not tracked",()=>{
    const lm=pose();
    lm[23]={x:.3,y:.62,visibility:1};lm[24]={x:.5,y:.62,visibility:1}; // hips shifted right on screen
    const c=control(lm,1)!;
    expect(c.lean).toBeLessThan(-.1);
    lm[15]={x:.82,y:.16,visibility:.2};
    const lost=control(lm,1)!;
    expect(lost.wrists[0].ok).toBe(false);
    expect(handChoice(lost)).toBeNull();
  });
  it("NaN landmarks never produce a fist / a choice",()=>{
    const lm=pose();
    lm[15]={x:NaN,y:.16,visibility:1};
    const c=control(lm,1)!;
    expect(c.wrists[0].ok).toBe(false);
    expect(handChoice(c)).toBeNull();
  });
  it("the lean constant leaves room for a full hook and the ball stays on the lane",()=>{
    expect(LEAN_MAX).toBeGreaterThan(0);
    expect(BALL_R).toBeLessThan(LANE_W/2);
  });
});
