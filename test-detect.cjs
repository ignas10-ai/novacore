// ponytail: vienas self-check – paleisti `node test-detect.cjs`
const fs=require("fs");const html=fs.readFileSync(__dirname+"/index.html","utf8");
const a=html.indexOf("const EX=["),b=html.indexOf("if(typeof module");
const m={};new Function("module",html.slice(a,b)+"\nmodule.exports={step,armsUp,sideCue,highlightSegments};")(m);const {step,armsUp,sideCue,highlightSegments}=m.exports;
const assert=require("assert");
const P=(y=0.9,vis=1)=>({x:0.5,y,visibility:vis});
function body(o={}){const lm=Array.from({length:33},()=>P());
  lm[0]=P(0.1);lm[11]={x:0.4,y:0.3,visibility:1};lm[12]={x:0.6,y:0.3,visibility:1};
  lm[23]={x:0.4,y:0.5,visibility:1};lm[24]={x:0.6,y:0.5,visibility:1};
  lm[25]={x:0.4,y:0.7,visibility:1};lm[26]={x:0.6,y:0.7,visibility:1};
  lm[27]={x:0.4,y:0.9,visibility:1};lm[28]={x:0.6,y:0.9,visibility:1};
  lm[15]={x:0.3,y:0.4,visibility:1};lm[16]={x:0.7,y:0.4,visibility:1};
  return Object.assign(lm,o)}
// ready gate: both wrists above the nose, all key points visible
const up=body();up[15].y=0.05;up[16].y=0.05;
assert.strictEqual(armsUp(up),true,"arms up");
assert.strictEqual(armsUp(body()),false,"arms down");
up[15].visibility=0.1;assert.strictEqual(armsUp(up),false,"invisible wrist");
// side cues: raw coordinates mirror to screen, so the arrow points toward the center
const atLeft=body();atLeft[11].x=0.95;atLeft[12].x=0.97;
const atRight=body();atRight[11].x=0.03;atRight[12].x=0.05;
assert.strictEqual(sideCue(body()),"");
assert.strictEqual(sideCue(atLeft),"right","move right from left edge");
assert.strictEqual(sideCue(atRight),"left","move left from right edge");
// highlight reel: high-scoring bins, 15-30 s total, ordered non-overlapping segments
const hot=highlightSegments([{t:2,points:2},{t:3,points:4},{t:50,points:9}],60);
const hotLen=hot.reduce((n,s)=>n+s.end-s.start,0);
assert(hotLen>=15&&hotLen<=30,"highlight length");
assert(hot.some(s=>s.start<=3&&s.end>=3),"hot spot included");
assert(hot.some(s=>s.start<=50&&s.end>=50),"late hot spot included");
assert(hot.every((s,i)=>s.start<s.end&&(!i||s.start>=hot[i-1].end)),"highlight order");
const cover=highlightSegments([{t:2,points:3}],180),covered=new Set();
for(let t=0;t<180;t++)if(cover.some(s=>s.start<=t&&t<=s.end))covered.add(Math.floor(t/30)%3);
assert.strictEqual(covered.size,3,"all exercises represented");
// custom exercise set: the reel still reserves a slot for the second selected exercise
const pair=highlightSegments([],180,4,16,2);
assert(pair.some(s=>s.start<=31&&31<=s.end),"second selected exercise covered");
const cold=highlightSegments([],60);
assert(cold.reduce((n,s)=>n+s.end-s.start,0)>=15,"fallback highlight length");
assert.deepStrictEqual(highlightSegments([],0),[],"empty timeline");
// squat: stand -> deep -> stand = 1 rep (needs several frames for EMA)
let s={},t=0,reps=0;const stand=body();const deep=body();deep[25]={x:0.4,y:0.62,visibility:1};deep[26]={x:0.6,y:0.62,visibility:1};deep[27]={x:0.6,y:0.64,visibility:1};deep[28]={x:0.4,y:0.64,visibility:1};
for(const f of [...Array(5).fill(stand),...Array(8).fill(deep),...Array(8).fill(stand)]) if(step(s,f,"squat",t+=50))reps++;
assert.strictEqual(reps,1,"squat rep");
// invisible legs -> no count, lost flag
s={};const hidden=body();hidden[27].visibility=0.1;assert.strictEqual(step(s,hidden,"squat",0),false);assert.strictEqual(s.lost,true);
// jack: both arms out/up and both legs apart -> closed = 1 rep
s={};t=0;const open=body();open[15]={x:0.2,y:0.05,visibility:1};open[16]={x:0.8,y:0.05,visibility:1};open[27].x=0.2;open[28].x=0.8;
assert.strictEqual(step(s,open,"jack",t+=50),false);assert.strictEqual(step(s,stand,"jack",t+=400),true);
// bypass guard: hands up without swinging out, and one leg staying under the hip
s={};const handsUp=body();handsUp[15]={x:0.38,y:0.05,visibility:1};handsUp[16]={x:0.62,y:0.05,visibility:1};
assert.strictEqual(step(s,handsUp,"jack",0),false);assert.strictEqual(step(s,stand,"jack",400),false,"hands-up bypass");
s={};const oneLeg=body();oneLeg[15]={x:0.2,y:0.05,visibility:1};oneLeg[16]={x:0.8,y:0.05,visibility:1};oneLeg[27].x=0.2;
assert.strictEqual(step(s,oneLeg,"jack",0),false);assert.strictEqual(step(s,stand,"jack",400),false,"one-leg bypass");
// high knees: left lift, right lift = 2 reps; second lift of same leg without lowering = 0
s={};t=0;const L=body();L[25]={x:0.4,y:0.44,visibility:1};const R=body();R[26]={x:0.6,y:0.44,visibility:1};
assert.strictEqual(step(s,L,"knees",t+=400),true);assert.strictEqual(step(s,L,"knees",t+=400),false);assert.strictEqual(step(s,R,"knees",t+=400),true);
// debounce: two reps 100 ms apart -> second ignored
s={};t=0;step(s,open,"jack",t);assert.strictEqual(step(s,stand,"jack",t+=400),true);step(s,open,"jack",t+=50);assert.strictEqual(step(s,stand,"jack",t+=50),false);
console.log("OK");
