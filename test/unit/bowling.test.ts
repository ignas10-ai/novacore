// Boulingas (src/bowling/logic.ts): real ten-pin scoring (strike / spare / bonus balls), turn rotation for 1-4
// players, split detection, the aim/lean geometry and the deterministic ball + pin physics.
import {describe,it,expect} from "vitest";
import {
  PINS, PIN_Z, PIN_GAP, MAX_Z, FRAME_W, LANE_W, BALL_R, SPEED_MIN, SPEED_MAX, HAND_OUT, LEAN_MAX,
  newSeries, turnOf, addRoll, scoreCard, rank, rollMarks, isSplit, simulateThrow, control, handChoice, aimOf,
  ballX, targetX, throwSpeed, bestTotal, type Series,
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
  it("a ball down the middle knocks most pins; a gutter ball knocks none",()=>{
    const centre=simulateThrow(full,0,0,11), left=simulateThrow(full,-1,0,11), right=simulateThrow(full,1,0,11);
    expect(centre.down.length).toBeGreaterThanOrEqual(8);
    expect(centre.down).toContain(0);
    expect(left.down).toEqual([]);
    expect(right.down).toEqual([]);
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
    expect(c.lean).toBeCloseTo(0,6);
  });
  it("a right arm out picks the right hand and aims right; both out is not a choice",()=>{
    const lm=pose();
    lm[13]={x:.56,y:.5,visibility:1};lm[15]={x:.5,y:.5,visibility:1}; // left arm down
    lm[14]={x:.28,y:.24,visibility:1};lm[16]={x:.18,y:.16,visibility:1};
    const c=control(lm,1)!;
    expect(handChoice(c)).toBe(1);
    expect(aimOf(c,1)).toBeGreaterThan(.5);
    lm[13]={x:.72,y:.24,visibility:1};lm[15]={x:.82,y:.16,visibility:1};
    const both=control(lm,1)!;
    expect(handChoice(both)).toBeNull();
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
