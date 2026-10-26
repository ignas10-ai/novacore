// Edge cases of the pure detector that test-detect.cjs does not cover: broken landmarks (NaN, visibility lost
// mid-rep), two players with separate state, exercise switches and the shared debounce.
import {describe,it,expect} from "vitest";
import {step,armsUp,sideCue,visible,ang,ang3,type StepState} from "../../src/detect/step.ts";
import {poseEmbed,poseClassify} from "../../src/detect/classifier.ts";
import {EX,NEED,MIN_GAP} from "../../src/detect/exercises.ts";
import type {Lm} from "../../src/detect/classifier.ts";

// same standing figure as test-detect.cjs (front view, normalized coordinates)
function body():Lm[]{
  const P=(x:number,y:number):Lm=>({x,y,visibility:1});
  const lm=Array.from({length:33},()=>P(0.5,0.9));
  lm[0]=P(0.5,0.1);lm[11]=P(0.4,0.3);lm[12]=P(0.6,0.3);lm[13]=P(0.35,0.35);lm[14]=P(0.65,0.35);
  lm[15]=P(0.3,0.4);lm[16]=P(0.7,0.4);lm[23]=P(0.4,0.5);lm[24]=P(0.6,0.5);
  lm[25]=P(0.4,0.7);lm[26]=P(0.6,0.7);lm[27]=P(0.4,0.9);lm[28]=P(0.6,0.9);
  return lm;
}
const stand=body();
const deep=body();deep[25]={x:0.4,y:0.62,visibility:1};deep[26]={x:0.6,y:0.62,visibility:1};deep[27]={x:0.6,y:0.64,visibility:1};deep[28]={x:0.4,y:0.64,visibility:1};
const squatFrames=[...Array(5).fill(stand),...Array(8).fill(deep),...Array(8).fill(stand)];
const fresh=()=>({}) as StepState;
function count(s:StepState,frames:Lm[][],ex:string,t0=0,dt=50){let n=0,t=t0;for(const f of frames)if(step(s,f,ex,t+=dt))n++;return n}

describe("visibility gate",()=>{
  it("every exercise has a NEED list over real landmark indices",()=>{
    for(const e of EX){expect(NEED[e.id],e.id).toBeDefined();expect(NEED[e.id].every(j=>j>=0&&j<33)).toBe(true)}
  });
  it("missing visibility counts as visible (MediaPipe world landmarks have none)",()=>{
    const lm=body().map(({x,y})=>({x,y}));
    expect(visible(lm,"squat")).toBe(true);
  });
  it("NaN visibility = not visible -> lost, no rep",()=>{
    const s=fresh(),lm=body();lm[27].visibility=NaN;
    expect(step(s,lm,"squat",0)).toBe(false);expect(s.lost).toBe(true);
  });
  it("losing the legs mid-squat does not count, and the rep completes once they are back",()=>{
    const s=fresh(),hidden=deep.map((p,i)=>i===27?{...p,visibility:0.1}:p);
    const frames=[...Array(5).fill(stand),...Array(8).fill(deep),...Array(6).fill(hidden),...Array(8).fill(stand)];
    let t=0,reps=0,lostSeen=false;
    for(const f of frames){if(step(s,f,"squat",t+=50))reps++;lostSeen||=!!s.lost}
    expect(lostSeen).toBe(true);expect(s.lost).toBe(false);expect(reps).toBe(1);
  });
  it("armsUp is false when the nose is not visible",()=>{
    const up=body();up[15].y=0.05;up[16].y=0.05;expect(armsUp(up)).toBe(true);
    up[0].visibility=0.2;expect(armsUp(up)).toBe(false);
  });
  it("sideCue needs two visible core points",()=>{
    const lm=body().map(p=>({...p,visibility:0}));lm[11]={x:0.99,y:0.3,visibility:1};
    expect(sideCue(lm)).toBe("");
  });
});

describe("NaN landmarks (detector glitch frame)",()=>{
  it("angles stay finite for degenerate (zero-length) limbs",()=>{
    const p={x:0.5,y:0.5,z:0};
    expect(Number.isFinite(ang(p,p,p))).toBe(true);expect(Number.isFinite(ang3(p,p,p))).toBe(true);
  });
  it("a NaN frame never counts a rep",()=>{
    const nan=body().map(p=>({...p,x:NaN,y:NaN}));
    for(const e of EX)expect(step(fresh(),nan,e.id,0),e.id).toBe(false);
  });
  // was a bug (tests branch): one NaN frame turned the squat EMA (s.k / s.k3) into NaN for the rest of the round.
  // step() now skips non-finite frames before any state is touched.
  it("one NaN frame does not break squat counting for the rest of the round",()=>{
    const s=fresh(),nan=body().map(p=>({...p,x:NaN,y:NaN}));
    step(s,nan,"squat",0);
    expect(count(s,squatFrames,"squat",100)).toBe(1);
  });
  it("embedding of a NaN pose is NaN, not a throw (classifier input)",()=>{
    const e=poseEmbed(body().map(p=>({...p,x:NaN})));
    expect(e.length).toBe(23*3);
  });
});

describe("state machine",()=>{
  it("two players keep separate state (P2 standing still does not get P1's rep)",()=>{
    const st=[fresh(),fresh()];let p1=0,p2=0,t=0;
    for(const f of squatFrames){t+=50;if(step(st[0],f,"squat",t))p1++;if(step(st[1],stand,"squat",t))p2++}
    expect([p1,p2]).toEqual([1,0]);
  });
  it("switching the exercise resets a half-done rep",()=>{
    const s=fresh();
    count(s,Array(8).fill(deep),"squat");      // down, not up yet
    step(s,stand,"jack",1000);                   // round change
    expect(count(s,Array(8).fill(stand),"squat",2000)).toBe(0);
  });
  it(`reps closer than MIN_GAP (${MIN_GAP} ms) are dropped`,()=>{
    const s=fresh();
    expect(count(s,squatFrames,"squat",0,50)).toBe(1);
    // the next full squat again, but only finishing < MIN_GAP after the first: squeeze all frames into 10 ms steps
    const s2=fresh();let t=0,n=0;
    for(const f of [...squatFrames,...squatFrames])if(step(s2,f,"squat",t+=10))n++;
    expect(n).toBe(1);
  });
  it("classifier votes add up to the 10 nearest neighbours",()=>{
    const cfg={flip:false,count:["down"],samples:[...Array(8).fill(["down",...poseEmbed(deep)]),...Array(8).fill(["up",...poseEmbed(stand)])] as any};
    const v=poseClassify(deep,cfg,1);
    expect(Object.values(v).reduce((a,b)=>a+b,0)).toBe(10);expect(v.down).toBe(8);
  });
});
