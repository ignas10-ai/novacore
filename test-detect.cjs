// ponytail: vienas self-check – paleisti `node test-detect.cjs`
const fs=require("fs");const html=fs.readFileSync(__dirname+"/index.html","utf8");
const a=html.indexOf("const EX=["),b=html.indexOf("if(typeof module");
const m={};new Function("module",html.slice(a,b)+"\nmodule.exports={step};")(m);const {step}=m.exports;
const assert=require("assert");
const P=(y=0.9,vis=1)=>({x:0.5,y,visibility:vis});
function body(o={}){const lm=Array.from({length:33},()=>P());
  lm[0]=P(0.1);lm[11]={x:0.4,y:0.3,visibility:1};lm[12]={x:0.6,y:0.3,visibility:1};
  lm[23]={x:0.4,y:0.5,visibility:1};lm[24]={x:0.6,y:0.5,visibility:1};
  lm[25]={x:0.4,y:0.7,visibility:1};lm[26]={x:0.6,y:0.7,visibility:1};
  lm[27]={x:0.4,y:0.9,visibility:1};lm[28]={x:0.6,y:0.9,visibility:1};
  lm[15]={x:0.3,y:0.4,visibility:1};lm[16]={x:0.7,y:0.4,visibility:1};
  return Object.assign(lm,o)}
// squat: stand -> deep -> stand = 1 rep (needs several frames for EMA)
let s={},t=0,reps=0;const stand=body();const deep=body();deep[25]={x:0.4,y:0.62,visibility:1};deep[26]={x:0.6,y:0.62,visibility:1};deep[27]={x:0.6,y:0.64,visibility:1};deep[28]={x:0.4,y:0.64,visibility:1};
for(const f of [...Array(5).fill(stand),...Array(8).fill(deep),...Array(8).fill(stand)]) if(step(s,f,"squat",t+=50))reps++;
assert.strictEqual(reps,1,"squat rep");
// invisible legs -> no count, lost flag
s={};const hidden=body();hidden[27].visibility=0.1;assert.strictEqual(step(s,hidden,"squat",0),false);assert.strictEqual(s.lost,true);
// jack: open -> closed = 1 rep
s={};t=0;const open=body();open[15].y=0.05;open[16].y=0.05;open[27].x=0.2;open[28].x=0.8;
assert.strictEqual(step(s,open,"jack",t+=50),false);assert.strictEqual(step(s,stand,"jack",t+=400),true);
// high knees: left lift, right lift = 2 reps; second lift of same leg without lowering = 0
s={};t=0;const L=body();L[25]={x:0.4,y:0.44,visibility:1};const R=body();R[26]={x:0.6,y:0.44,visibility:1};
assert.strictEqual(step(s,L,"knees",t+=400),true);assert.strictEqual(step(s,L,"knees",t+=400),false);assert.strictEqual(step(s,R,"knees",t+=400),true);
// debounce: two reps 100 ms apart -> second ignored
s={};t=0;step(s,open,"jack",t);assert.strictEqual(step(s,stand,"jack",t+=400),true);step(s,open,"jack",t+=50);assert.strictEqual(step(s,stand,"jack",t+=50),false);
console.log("OK");
