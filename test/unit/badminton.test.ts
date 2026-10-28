// Badmintonas (src/badminton/logic.ts): court geometry, flight physics (net / out / short serve), match scoring,
// the camera hand pick + three stroke classifiers, and the solo bot. Pure: no DOM.
import {describe,it,expect} from "vitest";
import {
  COURT_LEN,COURT_W,NET_Z,NET_H,SHORT_SERVICE,HIT_MAX_H,HIT_COOL,SMASH_MIN_H,
  sideOfZ,inCourt,serveIn,newShuttle,serveShuttle,hitShuttle,canHit,stepShuttle,
  newMatch,addPoint,countStroke,bestRally,newChoice,tickChoice,newSwingState,readSwing,
  newBot,botAct,control,CHOOSE_HOLD,SW_GAP,predictContact,hitQuality,newJumpState,readJump,countJump,
  CONTACT_H,HIT_EARLY,HIT_LATE,JUMP_UP,
  type Side,type Stroke,type Swing,type FlightEvent,
} from "../../src/badminton/logic.ts";
import type {Lm} from "../../src/detect/classifier.ts";

function fly(side:Side,stroke:Stroke,z:number,y:number,power=1,aim=0):FlightEvent|null{
  const s=newShuttle(side);
  if(stroke==="serve")serveShuttle(s,side,power,aim);
  else{s.z=z;s.y=y;s.live=true;s.t=1;s.from=side;expect(hitShuttle(s,side,stroke,power,aim)).toBe(true)}
  let ev:FlightEvent|null=null;
  for(let i=0;i<2000&&!ev;i++)ev=stepShuttle(s,1/120);
  return ev;
}
const land=(ev:FlightEvent|null)=>{expect(ev?.type).toBe("land");return ev as Extract<FlightEvent,{type:"land"}>};

// a synthetic front-view pose: mirrored shoulders 0.4 / 0.6, torso u ~ .32, arms down
function pose():Lm[]{
  const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:1})) as Lm[];
  lm[0]={x:.5,y:.12,visibility:1};
  lm[11]={x:.6,y:.3,visibility:1};lm[12]={x:.4,y:.3,visibility:1};
  lm[23]={x:.6,y:.62,visibility:1};lm[24]={x:.4,y:.62,visibility:1};
  lm[13]={x:.62,y:.38,visibility:1};lm[15]={x:.6,y:.5,visibility:1};
  lm[14]={x:.38,y:.38,visibility:1};lm[16]={x:.4,y:.5,visibility:1};
  return lm;
}
const move=(lm:Lm[],hand:0|1,y?:number,x?:number)=>{
  if(y!=null){lm[hand?16:15]={x:lm[hand?16:15].x,y,visibility:1};lm[hand?14:13]={x:lm[hand?14:13].x,y:.12,visibility:1}}
  if(x!=null){lm[hand?16:15]={x,y:lm[hand?16:15].y,visibility:1};lm[hand?14:13]={x:x+(hand?-.06:.06),y:lm[hand?14:13].y,visibility:1}}
};

describe("court geometry",()=>{
  it("sides, in/out and the short service line",()=>{
    expect(sideOfZ(0)).toBe(0);expect(sideOfZ(NET_Z-.01)).toBe(0);expect(sideOfZ(NET_Z+0.01)).toBe(1);expect(sideOfZ(COURT_LEN)).toBe(1);
    expect(inCourt(0,0)).toBe(true);expect(inCourt(COURT_LEN,COURT_W/2)).toBe(true);
    expect(inCourt(-.01,0)).toBe(false);expect(inCourt(COURT_LEN+.01,0)).toBe(false);
    expect(inCourt(5,COURT_W/2+.01)).toBe(false);expect(inCourt(5,-COURT_W/2-.01)).toBe(false);
    expect(serveIn(NET_Z+SHORT_SERVICE,0)).toBe(true);
    expect(serveIn(NET_Z+SHORT_SERVICE-.01,0)).toBe(false);
    expect(serveIn(NET_Z-SHORT_SERVICE+.01,0)).toBe(false);
    expect(serveIn(NET_Z-SHORT_SERVICE-.01,0)).toBe(true);
    expect(serveIn(COURT_LEN+.1,0)).toBe(false);
  });
});

describe("flight physics",()=>{
  it("a normal serve clears the net and lands in the receiver's service court (both sides)",()=>{
    for(const side of [0,1] as Side[]){
      const ev=land(fly(side,"serve",0,0,1,0));
      expect(ev.side).toBe(side===0?1:0);expect(ev.in).toBe(true);expect(ev.fault).toBe(false);expect(ev.winner).toBe(side);
      expect(Math.abs(ev.z-NET_Z)).toBeGreaterThan(SHORT_SERVICE);
      expect(ev.z>0&&ev.z<COURT_LEN).toBe(true);
    }
  });
  it("a weak serve is short: the receiver wins",()=>{
    const ev=land(fly(0,"serve",0,0,.8,0));
    expect(ev.in).toBe(true);expect(ev.fault).toBe(true);expect(ev.winner).toBe(1);
    expect(Math.abs(ev.z-NET_Z)).toBeLessThan(SHORT_SERVICE);
  });
  it("a clear from mid-court clears the net and lands deep in the opponent's court",()=>{
    const ev=land(fly(0,"clear",4,2.5,1,0));
    expect(ev.side).toBe(1);expect(ev.fault).toBe(false);expect(ev.winner).toBe(0);
    expect(ev.z).toBeGreaterThan(9);expect(ev.z).toBeLessThanOrEqual(COURT_LEN);
    const p2=land(fly(1,"clear",COURT_LEN-4,2.5,1,0));
    expect(p2.side).toBe(0);expect(p2.fault).toBe(false);expect(p2.winner).toBe(1);expect(p2.z).toBeLessThan(4.5);
  });
  it("a drop from a high shuttle lands short, just past the net",()=>{
    const ev=land(fly(0,"drop",4,3,1,0));
    expect(ev.side).toBe(1);expect(ev.fault).toBe(false);expect(ev.winner).toBe(0);
    expect(ev.z).toBeGreaterThan(NET_Z);expect(ev.z).toBeLessThan(NET_Z+3.4);
  });
  it("a smash from high is in; from low it hits the net (or lands back on your own side)",()=>{
    const high=land(fly(0,"smash",4,3,1,0));
    expect(high.side).toBe(1);expect(high.fault).toBe(false);expect(high.winner).toBe(0);
    const low=fly(0,"smash",4,1.5,1,0);
    expect(low?.type).toBe("net");if(low?.type==="net")expect(low.by).toBe(0);
    const own=land(fly(0,"smash",4,.6,1,0));
    expect(own.side).toBe(0);expect(own.fault).toBe(true);expect(own.winner).toBe(1);
  });
  it("a drop from below the tape hits the net",()=>{
    const ev=fly(0,"drop",4,1.5,1,0);
    expect(ev?.type).toBe("net");if(ev?.type==="net")expect(ev.by).toBe(0);
  });
  it("a full-power clear from near the net flies out; the receiver wins",()=>{
    const ev=land(fly(0,"clear",4,2.5,1.3,0));
    expect(ev.in).toBe(false);expect(ev.fault).toBe(true);expect(ev.winner).toBe(1);
  });
  it("large dt cannot tunnel the net",()=>{
    const s=newShuttle(0);s.z=4;s.y=1.6;s.live=true;s.t=1;s.from=0;hitShuttle(s,0,"drop",1,0);
    let ev:FlightEvent|null=null;
    for(let i=0;i<20&&!ev;i++)ev=stepShuttle(s,.5); // 500 ms per call
    expect(ev?.type).toBe("net");
  });
  it("a live shuttle can only be returned from its own half, below the ceiling and after the cooldown",()=>{
    const s=newShuttle(0);s.live=true;s.z=3;s.y=1.5;s.t=1; // P1's half
    expect(canHit(s,0)).toBe(true);expect(canHit(s,1)).toBe(false);
    s.y=HIT_MAX_H;expect(canHit(s,0)).toBe(false);
    s.y=1;s.t=HIT_COOL/2;expect(canHit(s,0)).toBe(false);
    s.t=HIT_COOL;expect(canHit(s,0)).toBe(true);
    expect(hitShuttle(s,1,"clear")).toBe(false);
    expect(hitShuttle(s,0,"clear")).toBe(true);
    expect(s.from).toBe(0);expect(s.t).toBe(0);
  });
  it("the smash threshold is a real high shuttle",()=>{
    expect(SMASH_MIN_H).toBeGreaterThan(NET_H); // a smash from below the tape is a net shot
    expect(NET_H).toBeGreaterThan(1.4);
  });
});

describe("match scoring",()=>{
  it("a point goes to the winner, who serves next; rally stats are kept",()=>{
    const m=newMatch(11);
    expect(m.target).toBe(11);expect(m.server).toBe(0);
    m.rally=5;expect(addPoint(m,1)).toBe(false);
    expect(m.score).toEqual([0,1]);expect(m.server).toBe(1);
    expect(m.lastRally).toBe(5);expect(m.longest).toBe(5);expect(m.rallies).toBe(1);expect(m.rally).toBe(0);
    m.rally=8;addPoint(m,1);
    expect(m.score).toEqual([0,2]);expect(m.longest).toBe(8);expect(m.rallies).toBe(2);expect(m.server).toBe(1);
  });
  it("the match ends exactly at the target; 21 is a valid target",()=>{
    const m=newMatch(11);
    for(let i=0;i<10;i++)addPoint(m,0);
    expect(m.done).toBe(false);expect(m.score).toEqual([10,0]);
    expect(addPoint(m,0)).toBe(true);
    expect(m.done).toBe(true);expect(m.winner).toBe(0);expect(m.server).toBe(0);
    const before=[...m.score];addPoint(m,1);expect(m.score).toEqual(before);
    expect(newMatch(21).target).toBe(21);expect(newMatch(7).target).toBe(11); // only 11 / 21 exist
  });
  it("stroke counts and the best rally record",()=>{
    const m=newMatch(11);
    countStroke(m,0,"serve");countStroke(m,0,"smash");countStroke(m,1,"clear");countStroke(m,1,"clear");
    expect(m.strokes[0]).toEqual({serve:1,clear:0,drop:0,smash:1});
    expect(m.strokes[1]).toEqual({serve:0,clear:2,drop:0,smash:0});
    expect(bestRally([{mode:"badminton",bdLongest:4},{mode:"badminton",bdLongest:9},{mode:"ski",bdLongest:99}])).toBe(9);
    expect(bestRally([])).toBe(0);
  });
});

describe("hand pick",()=>{
  const leftOut=()=>{const lm=pose();lm[13]={x:.72,y:.24,visibility:1};lm[15]={x:.82,y:.16,visibility:1};return lm};
  const rightOut=()=>{const lm=pose();lm[14]={x:.28,y:.24,visibility:1};lm[16]={x:.18,y:.16,visibility:1};return lm};
  it("holding one arm out for 2 s picks that hand; progress fills evenly",()=>{
    const st=newChoice(),c=control(leftOut(),1)!;
    let r:{pick:0|1|null;progress:[number,number]}={pick:null,progress:[0,0]};
    for(let i=0;i<7;i++)r=tickChoice(c,st,.25);
    expect(r.pick).toBeNull();expect(r.progress[0]).toBeGreaterThan(.8);expect(r.progress[1]).toBe(0);
    r=tickChoice(c,st,.25);
    expect(r.pick).toBe(0);expect(st.pick).toBe(0);
    expect(tickChoice(c,st,1).pick).toBe(0); // stays picked
  });
  it("the right arm picks the right hand; both arms out is not a choice",()=>{
    const st=newChoice(),c=control(rightOut(),1)!;
    let r:{pick:0|1|null;progress:[number,number]}={pick:null,progress:[0,0]};
    for(let i=0;i<8;i++)r=tickChoice(c,st,.25);
    expect(r.pick).toBe(1);
    const both=rightOut();both[13]={x:.72,y:.24,visibility:1};both[15]={x:.82,y:.16,visibility:1};
    const st2=newChoice();let q=r;for(let i=0;i<8;i++)q=tickChoice(control(both,1),st2,.25);
    expect(q.pick).toBeNull();expect(st2.held[0]).toBe(0);expect(st2.held[1]).toBe(0);
  });
  it("a dropped detection frame keeps the fill for a short grace, then resets",()=>{
    const st=newChoice(),c=control(leftOut(),1)!;
    for(let i=0;i<4;i++)tickChoice(c,st,.25); // 1 s held
    expect(st.held[0]).toBeCloseTo(1,5);
    tickChoice(null,st,.2);expect(st.held[0]).toBeCloseTo(1,5);
    tickChoice(null,st,.2);expect(st.held[0]).toBe(0);
    expect(CHOOSE_HOLD).toBe(2);
  });
  it("low-visibility arms and NaN never pick",()=>{
    const lm=leftOut();lm[15]={x:.82,y:.16,visibility:.2};
    expect(control(lm,1)!.wrists[0].ok).toBe(false);
    const nan=leftOut();nan[15]={x:NaN,y:.16,visibility:1};
    const st=newChoice();let r:{pick:0|1|null;progress:[number,number]}={pick:null,progress:[0,0]};
    for(let i=0;i<8;i++)r=tickChoice(control(nan,1),st,.25);
    expect(r.pick).toBeNull();
  });
});

describe("stroke recognition",()=>{
  function swing(kind:"clear"|"smash"|"drop"|"slow",hand:0|1=0){
    const st=newSwingState(),lm=pose();
    let out:Swing|null=null;
    for(let i=0;i<5;i++){
      const t=i*.05;
      if(kind==="clear")move(lm,hand,.58-.115*i);
      else if(kind==="smash")move(lm,hand,.12+.115*i);
      else if(kind==="drop")move(lm,hand,undefined,.75-.075*i);
      else move(lm,hand,.4+.006*i);
      const r=readSwing(lm,1,hand,st,t);
      if(r)out=r;
    }
    return out;
  }
  it("a fast upward swing is a clear, a fast downward swing from above the shoulder is a smash",()=>{
    const clear=swing("clear")!;
    expect(clear.stroke).toBe("clear");expect(clear.power).toBeGreaterThan(.8);
    const smash=swing("smash")!;
    expect(smash.stroke).toBe("smash");
  });
  it("a gentle sideways swing is a drop; a slow arm move is nothing",()=>{
    const drop=swing("drop")!;
    expect(drop.stroke).toBe("drop");expect(drop.power).toBe(1);
    expect(swing("slow")).toBeNull();
  });
  it("only the chosen hand is tracked",()=>{
    const st=newSwingState(),lm=pose();
    let fired=false;
    for(let i=0;i<5;i++){move(lm,0,.58-.115*i);if(readSwing(lm,1,1,st,i*.05))fired=true}
    expect(fired).toBe(false);
  });
  it("one swing per hand per cooldown",()=>{
    const st=newSwingState(),lm=pose();
    let first:Swing|null=null,second:Swing|null=null;
    for(let i=0;i<5;i++){move(lm,0,.58-.115*i);const r=readSwing(lm,1,0,st,i*.05);if(r)first=r}
    expect(first).not.toBeNull();
    for(let i=0;i<5;i++){move(lm,0,.58-.115*i);const r=readSwing(lm,1,0,st,.25+i*.05);if(r)second=r}
    expect(second).toBeNull(); // within SW_GAP
    for(let i=0;i<5;i++){move(lm,0,.58-.115*i);const r=readSwing(lm,1,0,st,SW_GAP+.3+i*.05);if(r)second=r}
    expect(second).not.toBeNull();
  });
  it("a low-visibility or NaN wrist resets the history and never swings",()=>{
    const st=newSwingState(),lm=pose();
    for(let i=0;i<3;i++){move(lm,0,.5-.1*i);readSwing(lm,1,0,st,i*.05)}
    lm[15]={x:NaN,y:.1,visibility:1};
    expect(readSwing(lm,1,0,st,.2)).toBeNull();
    expect(st.hist[0].length).toBe(0);
  });
});

describe("solo bot",()=>{
  const seq=(vals:number[])=>{let i=0;return()=>vals[i++%vals.length]};
  const live=(side:Side,y=3)=>{const s=newShuttle(side);s.z=side===0?4:COURT_LEN-4;s.y=y;s.live=true;s.t=1.2;s.from=side===0?1:0;return s};
  it("waits for a hittable shuttle on its own side, then returns a deterministic shot",()=>{
    const s=live(1),b=newBot(seq([.9,.1,.5,.5]));
    expect(botAct(s,1,b,.1,0)).toBeNull(); // 0.1 s < BOT_DELAY
    const shot=botAct(s,1,b,.3,0)!;
    expect(shot).not.toBeNull();expect(shot.stroke).toBe("smash");expect(shot.power).toBeGreaterThan(.9);expect(shot.aim).toBe(0);
    expect(botAct(s,1,b,.5,0)).toBeNull(); // only one swing per arrival
  });
  it("can miss (the shuttle lands and the player scores) once per arrival",()=>{
    const s=live(1),b=newBot(seq([.01]));
    expect(botAct(s,1,b,.4,0)).toBeNull();
    expect(botAct(s,1,b,.4,0)).toBeNull();
  });
  it("resets when the shuttle leaves its side; a low shuttle is lifted",()=>{
    const s=live(1),b=newBot(seq([.9,.9,.5,.5]));
    botAct(s,1,b,.2,0);botAct(s,1,b,.2,0); // wait is clamped per frame: .4 s total
    s.z=3;s.y=1; // now on the player's side
    expect(botAct(s,1,b,.2,0)).toBeNull();
    s.z=COURT_LEN-4;s.y=1;s.live=true;
    botAct(s,1,b,.2,0);const shot=botAct(s,1,b,.2,0)!;
    expect(["clear","drop"]).toContain(shot.stroke);
    expect(shot.stroke).not.toBe("smash");
  });
});

describe("third-person target + timing",()=>{
  it("predicts the receiver's contact on their side for a serve, a clear and a drop",()=>{
    const serve=newShuttle(0);serveShuttle(serve,0,1,0);
    const c1=predictContact(serve,1)!;
    expect(c1).not.toBeNull();expect(c1.z).toBeGreaterThan(NET_Z);expect(c1.z).toBeLessThan(COURT_LEN);
    expect(c1.t).toBeGreaterThan(.5);expect(c1.y).toBeGreaterThan(.15);expect(c1.y).toBeLessThanOrEqual(CONTACT_H+.01);
    expect(c1.x).toBeCloseTo(0,6);
    const clear=newShuttle(0);clear.z=4;clear.y=2.5;clear.live=true;clear.t=1;clear.from=0;hitShuttle(clear,0,"clear",1,0);
    const c2=predictContact(clear,1)!;
    expect(c2).not.toBeNull();expect(c2.z).toBeGreaterThan(NET_Z);expect(c2.t).toBeGreaterThan(.5);
    const drop=newShuttle(0);drop.z=4;drop.y=3;drop.live=true;drop.t=1;drop.from=0;hitShuttle(drop,0,"drop",1,0);
    const c3=predictContact(drop,1)!;
    expect(c3).not.toBeNull();expect(c3.z).toBeGreaterThan(NET_Z);expect(c3.z).toBeLessThan(NET_Z+4);
    const p2=newShuttle(1);serveShuttle(p2,1,1,0);const c4=predictContact(p2,0)!;
    expect(c4).not.toBeNull();expect(c4.z).toBeLessThan(NET_Z);expect(c4.z).toBeGreaterThan(0);
  });
  it("returns null for a net shot, a short serve and a shot that will land out",()=>{
    const low=newShuttle(0);low.z=4;low.y=1.5;low.live=true;low.t=1;low.from=0;hitShuttle(low,0,"drop",1,0);
    expect(predictContact(low,1)).toBeNull();
    const short=newShuttle(0);serveShuttle(short,0,.8,0);
    expect(predictContact(short,1)).toBeNull();
    const out=newShuttle(0);out.z=4;out.y=2.5;out.live=true;out.t=1;out.from=0;hitShuttle(out,0,"clear",1.3,0);
    expect(predictContact(out,1)).toBeNull();
  });
  it("the timing quality peaks at the contact and is zero outside the window",()=>{
    expect(hitQuality(0.04)).toBe(1);
    expect(hitQuality(0.3)).toBeGreaterThan(0);
    expect(hitQuality(HIT_EARLY+.01)).toBe(0);
    expect(hitQuality(-HIT_LATE-.01)).toBe(0);
    expect(hitQuality(HIT_EARLY)).toBeGreaterThan(0);
    expect(hitQuality(-HIT_LATE)).toBeGreaterThan(0);
    expect(hitQuality(0.3)).toBeGreaterThan(hitQuality(HIT_EARLY));
  });
});

describe("jump + jump smash",()=>{
  const jumpPose=(raise:number)=>{
    const lm=pose();
    lm[11]={x:.6,y:.3-raise,visibility:1};lm[12]={x:.4,y:.3-raise,visibility:1};
    lm[23]={x:.6,y:.62-raise,visibility:1};lm[24]={x:.4,y:.62-raise,visibility:1};
    lm[27]={x:.6,y:.9-raise,visibility:1};lm[28]={x:.4,y:.9-raise,visibility:1};
    return lm;
  };
  it("detects a standing jump after the hold, ignores a small bob and stays on cooldown",()=>{
    const st=newJumpState();
    expect(readJump(jumpPose(0),st,0)).toBe(false);
    expect(readJump(jumpPose(.02),st,.05)).toBe(false); // a small bob: hip < JUMP_UP
    let jumped=false;
    for(const t of [.05,.1,.15,.2])jumped=readJump(jumpPose(.18),st,t)||jumped;
    expect(jumped).toBe(true);
    expect(readJump(jumpPose(0),st,.25)).toBe(false);
    // a second jump within JUMP_COOL is ignored; after the cooldown it counts again
    expect(readJump(jumpPose(.18),st,.3)).toBe(false);
    readJump(jumpPose(0),st,.35);
    jumped=false;
    for(const t of [.8,.85,.9,.95])jumped=readJump(jumpPose(.18),st,t)||jumped;
    expect(jumped).toBe(true);
  });
  it("a lost / NaN body never jumps",()=>{
    const st=newJumpState();
    readJump(jumpPose(0),st,0);
    const bad=jumpPose(.18);bad[27]={x:.6,y:.72,visibility:.2};
    expect(readJump(bad,st,.1)).toBe(false);
    bad[27]={x:NaN,y:.72,visibility:1};
    expect(readJump(bad,st,.2)).toBe(false);
  });
  it("a jump smash is steeper and faster than a standing smash; jumps are counted on the match",()=>{
    const normal=newShuttle(0);normal.z=4;normal.y=3;normal.live=true;normal.t=1;normal.from=0;
    hitShuttle(normal,0,"smash",1,0,false);
    const jump=newShuttle(0);jump.z=4;jump.y=3;jump.live=true;jump.t=1;jump.from=0;
    hitShuttle(jump,0,"smash",1,0,true);
    expect(jump.vy).toBeLessThan(normal.vy); // more downward
    expect(jump.vz).toBeGreaterThan(normal.vz); // faster forward
    const m=newMatch(11);countJump(m,0);countJump(m,0);countJump(m,1);
    expect(m.jumps).toEqual([2,1]);
    expect(newMatch(11).jumps).toEqual([0,0]);
    expect(JUMP_UP).toBeGreaterThan(0);
  });
});

describe("a whole point",()=>{
  it("serve -> land -> point -> the winner serves next",()=>{
    const m=newMatch(11),s=newShuttle(0);
    serveShuttle(s,0,1,0);m.rally=1;countStroke(m,0,"serve");
    let ev:FlightEvent|null=null;
    for(let i=0;i<300&&!ev;i++)ev=stepShuttle(s,1/120);
    const e=land(ev);
    expect(e.winner).toBe(0);
    addPoint(m,e.winner);
    expect(m.score).toEqual([1,0]);expect(m.server).toBe(0);expect(m.longest).toBe(1);
  });
});
