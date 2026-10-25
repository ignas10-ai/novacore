/// <reference types="vite/client" />
// Side-view runner. The profile head is a real render cut from the approved turnaround sheet (tools/art/sprint-heads.py);
// the body is a small canvas rig (capsule limbs with cylinder shading) so the run cycle follows the player's real cadence.
// ponytail: rig instead of generated run-cycle frames (Gemini credits were empty on 2026-10-25). Drop-in later: put
// src/art/sprint/<raudonas|melynas>-run-<1..6>.webp (frames listed in tools/art/jobs-sprint.json) and drawRunner() plays
// them by phase automatically (import.meta.glob below finds them at build time), keeping bob/lean/squash.
// Units: 1 = character height (hair top to sole), origin = hip joint, +x = running direction, +y = down.

export interface Look{
  name:string; head:HTMLImageElement; headW:number; headH:number; neckX:number; // head size in units, neck at this fraction of its width
  top:string[]; sleeve:string[]; arm:string[]; band:string; legTop:string[]; leg:string[]; sock:string|null;
  shoeUp:string; shoeToe:string; sole:string; lace:string; stripe:string|null; hemY:number; short:boolean;
  frames:HTMLImageElement[]; // optional generated run cycle (empty = rig)
}
const img=(u:string)=>{const i=new Image();i.decoding="async";i.src=u;return i};
const FRAMES=import.meta.glob("../art/sprint/*-run-*.webp",{eager:true,query:"?url",import:"default"}) as Record<string,string>;
const framesOf=(name:string)=>Object.keys(FRAMES).filter(k=>k.includes(`/${name}-run-`)).sort().map(k=>img(FRAMES[k]));
// colour triples = [light, base, dark]
export const LOOKS:Look[]=[
  { // Raudonas: red track jacket with yellow stripes, red shorts, white socks, red sneakers on yellow soles
    name:"raudonas",head:img(new URL("../art/sprint/raudonas-side.webp",import.meta.url).href),headW:.334,headH:.407,neckX:.6,
    top:["#FF6A5E","#F23B36","#C42029"],sleeve:["#FF6A5E","#F23B36","#C42029"],arm:["#FAD3B6","#F2BD9C","#D9977A"],band:"#FFC61A",
    legTop:["#F0414A","#D61F2C","#A8121E"],leg:["#FAD3B6","#F2BD9C","#D9977A"],sock:"#F6F4F0",
    shoeUp:"#EE3434",shoeToe:"#F7F4EE",sole:"#FFC61A",lace:"#FFFFFF",stripe:"#FFC61A",hemY:.03,short:false,frames:framesOf("raudonas"),
  },
  { // Mėlynas: boxy blue tee with yellow collar, short sleeves + yellow wristbands, blue joggers, blue sneakers on white soles
    name:"melynas",head:img(new URL("../art/sprint/melynas-side.webp",import.meta.url).href),headW:.329,headH:.396,neckX:.62,
    top:["#6492FF","#2F6BFF","#1B4AC9"],sleeve:["#6492FF","#2F6BFF","#1B4AC9"],arm:["#BD7E57","#A4683F","#7A4728"],band:"#FFC61A",
    legTop:["#4D7BFF","#2457E6","#163BB0"],leg:["#4D7BFF","#2457E6","#163BB0"],sock:null,
    shoeUp:"#2F6BFF",shoeToe:"#F7F4EE",sole:"#F7F4EE",lace:"#FFC61A",stripe:null,hemY:.04,short:true,frames:framesOf("melynas"),
  },
];

// proportions measured on sheet-r3 / sheet-b3 (side figure), in units
const HIP_H=.33, TORSO=.27, BACK=-.1, CHEST=.08, THIGH=.105, SHIN=.15, SOLE=.08, UARM=.12, FARM=.1;
const TW=.12, LW=.085, AW=.07; // thigh / shin / arm thickness
const INK=[20,24,58];
// far-side limbs: the same colours pulled toward the navy ink, so the two legs / arms read apart without overlays
function shade(hex:string,k:number){const n=parseInt(hex.slice(1),16),c=[n>>16,n>>8&255,n&255].map((v,i)=>Math.round(v+(INK[i]-v)*k));return `rgb(${c[0]},${c[1]},${c[2]})`}
interface Paint{torso:CanvasGradient;thigh:CanvasGradient;skinLeg:CanvasGradient;shin:CanvasGradient;sleeve:CanvasGradient;arm:CanvasGradient;
  skin:string;skinDark:string;sock:string;shoeUp:string;shoeToe:string;sole:string;lace:string;band:string;stripe:string;legDark:string;shorts:string}
function grad(ctx:CanvasRenderingContext2D,w:number,c:string[]){
  const g=ctx.createLinearGradient(-w/2,0,w/2,0);
  g.addColorStop(0,c[0]);g.addColorStop(.45,c[1]);g.addColorStop(1,c[2]);return g;
}
// gradients live in unit space, so one set per look is reused under every transform (no per-frame allocation)
function paint(ctx:CanvasRenderingContext2D,L:Look,k:number):Paint{
  const f=(c:string)=>k?shade(c,k):c, fa=(a:string[])=>a.map(f);
  const top=fa(L.top),t=ctx.createLinearGradient(BACK,0,CHEST,0);
  t.addColorStop(0,top[2]);t.addColorStop(.35,top[1]);t.addColorStop(.85,top[0]);t.addColorStop(1,top[1]);
  return {torso:t,thigh:grad(ctx,TW,fa(L.legTop)),skinLeg:grad(ctx,LW,fa(L.arm)),shin:grad(ctx,LW,fa(L.leg)),sleeve:grad(ctx,AW,fa(L.sleeve)),arm:grad(ctx,AW*.86,fa(L.arm)),
    skin:f(L.arm[1]),skinDark:f(L.arm[2]),sock:f(L.sock||"#FFFFFF"),shoeUp:f(L.shoeUp),shoeToe:f(L.shoeToe),sole:f(L.sole),lace:f(L.lace),band:f(L.band),
    stripe:f(L.stripe||"#FFFFFF"),legDark:f(L.leg[2]),shorts:f(L.legTop[1])};
}
const paints=new Map<Look,Paint[]>();
// capsule from (0,0) down to (0,len), width w
function cap(ctx:CanvasRenderingContext2D,len:number,w:number){
  const r=w/2;ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(-r,len);ctx.arc(0,len,r,Math.PI,0,true);ctx.lineTo(r,0);ctx.arc(0,0,r,0,Math.PI,true);ctx.fill();
}
const D=Math.PI/180;

export interface Pose{th:number[];kn:number[];sh:number[];el:number[];ft:number[];lean:number;bob:number;p:number}
export const newPose=():Pose=>({th:[0,0],kn:[0,0],sh:[0,0],el:[0,0],ft:[0,0],lean:0,bob:0,p:0});
// p = cycle phase 0..1 (one cycle = two steps), a = stride amplitude 0..1 (speed). Writes into `o` (no allocation).
export function runPose(o:Pose,p:number,a:number){
  for(let j=0;j<2;j++){
    const q=p+j*.5, s=Math.sin(2*Math.PI*q);
    o.th[j]=a*(14+52*s);                                          // thigh swing, forward positive (high knee at q=.25)
    o.kn[j]=6+a*104*Math.max(0,Math.cos(2*Math.PI*(q-.1)))**1.15; // knee folds on the way forward, straight at contact/push-off
    o.ft[j]=a*(-12*Math.cos(2*Math.PI*q))+(o.kn[j]>60?-15*a:0);   // toes point down after push-off
    o.sh[j]=-a*58*s+4;                                             // arms opposite the legs
    o.el[j]=78+a*18*Math.max(0,-s);
  }
  o.lean=a*11;o.p=p;
  o.bob=a*.032*(.5-.5*Math.cos(4*Math.PI*(p-.4)));                // two flights per cycle, lowest at foot contact
}
export function setPose(o:Pose,t:number){ // "Dėmesio": crouched sprint start, weight forward
  o.th[0]=64;o.kn[0]=100;o.ft[0]=-4;o.th[1]=-14;o.kn[1]=58;o.ft[1]=-22;
  o.sh[0]=48;o.el[0]=70;o.sh[1]=-34;o.el[1]=60;o.lean=28;o.bob=.003*Math.sin(t*9);o.p=0;
}
export function standPose(o:Pose,t:number){ // idle breathing
  o.th[0]=6;o.th[1]=-4;o.kn[0]=8;o.kn[1]=6;o.ft[0]=o.ft[1]=0;o.sh[0]=10;o.sh[1]=-6;o.el[0]=24;o.el[1]=18;o.lean=2;o.bob=.004*Math.sin(t*2.4);o.p=0;
}
export function winPose(o:Pose,t:number){ // arms up, little hops
  standPose(o,t);o.sh[0]=165;o.sh[1]=150;o.el[0]=-14;o.el[1]=-20;o.bob=.035*Math.abs(Math.sin(t*5));
}

// lowest sole point below the hip (units, +down): forward kinematics hip -> knee -> ankle -> heel / toe
function footDrop(th:number,kn:number,ft:number){
  const a1=-th*D,a2=a1+kn*D,a3=a2-ft*D,y=THIGH*Math.cos(a1)+SHIN*Math.cos(a2),c=SOLE*Math.cos(a3),s=Math.sin(a3);
  return y+Math.max(c-.07*s,c+.155*s);
}
function leg(ctx:CanvasRenderingContext2D,L:Look,P:Paint,j:number,o:Pose){
  ctx.save();
  ctx.rotate(-o.th[j]*D);
  if(L.sock){
    ctx.fillStyle=P.skinLeg;cap(ctx,THIGH,TW*.8);
    ctx.fillStyle=P.thigh;ctx.beginPath();ctx.roundRect(-TW*.56,-.03,TW*1.12,THIGH*.6+.03,[.02,.02,.035,.035]);ctx.fill(); // shorts leg
  }else{ctx.fillStyle=P.thigh;cap(ctx,THIGH,TW);ctx.fillStyle="#fff";ctx.fillRect(-.006,-.01,.012,THIGH)} // jogger + piping
  ctx.translate(0,THIGH);ctx.rotate(o.kn[j]*D);
  ctx.fillStyle=L.sock?P.skinLeg:P.shin;cap(ctx,SHIN,LW);
  if(L.sock){ctx.fillStyle=P.sock;ctx.beginPath();ctx.roundRect(-LW*.56,SHIN*.5,LW*1.12,SHIN*.5+.01,.02);ctx.fill()}
  else{ctx.fillStyle="#fff";ctx.fillRect(-.006,0,.012,SHIN*.8);ctx.fillStyle=P.legDark;ctx.beginPath();ctx.roundRect(-LW*.6,SHIN*.78,LW*1.2,.04,.015);ctx.fill()}
  // chunky toy sneaker, toe forward (+x)
  ctx.translate(0,SHIN);ctx.rotate(-o.ft[j]*D);
  ctx.fillStyle=P.sole;ctx.beginPath();ctx.roundRect(-.075,.03,.235,.05,.022);ctx.fill();
  ctx.fillStyle=P.shoeUp;ctx.beginPath();ctx.moveTo(-.07,.04);ctx.lineTo(-.065,-.025);ctx.quadraticCurveTo(-.02,-.05,.03,-.02);ctx.quadraticCurveTo(.13,-.005,.15,.04);ctx.closePath();ctx.fill();
  ctx.fillStyle=P.shoeToe;ctx.beginPath();ctx.moveTo(.06,.04);ctx.quadraticCurveTo(.075,-.01,.11,-.005);ctx.quadraticCurveTo(.15,.005,.155,.04);ctx.closePath();ctx.fill();
  ctx.strokeStyle=P.lace;ctx.lineWidth=.009;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(0,-.028);ctx.lineTo(.025,-.012);ctx.moveTo(.025,-.03);ctx.lineTo(.05,-.012);ctx.stroke();
  ctx.restore();
}
function arm(ctx:CanvasRenderingContext2D,L:Look,P:Paint,j:number,o:Pose){
  const sh=L.short;
  ctx.save();
  ctx.rotate(-o.sh[j]*D);
  if(sh){ctx.fillStyle=P.arm;cap(ctx,UARM,AW*.86)}
  ctx.fillStyle=P.sleeve;cap(ctx,sh?UARM*.6:UARM,AW*(sh?1.3:1));
  if(L.stripe){ctx.fillStyle=P.stripe;ctx.fillRect(-.013,0,.008,UARM);ctx.fillRect(.002,0,.008,UARM)}
  ctx.translate(0,UARM);ctx.rotate(-o.el[j]*D);
  ctx.fillStyle=sh?P.arm:P.sleeve;cap(ctx,FARM,sh?AW*.86:AW);
  if(L.stripe){ctx.fillStyle=P.stripe;ctx.fillRect(-.013,0,.008,FARM*.72);ctx.fillRect(.002,0,.008,FARM*.72)}
  ctx.fillStyle=P.band;ctx.beginPath();ctx.roundRect(-AW*.6,FARM*.72,AW*1.2,.032,.012);ctx.fill();
  ctx.fillStyle=P.skin;ctx.beginPath();ctx.ellipse(.004,FARM+.045,.036,.042,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=P.skinDark;ctx.beginPath();ctx.ellipse(.016,FARM+.05,.018,.03,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// draw standing on (x, groundY); h = character height in px; squash < 1 flattens (landing), > 1 stretches (flight)
export function drawRunner(ctx:CanvasRenderingContext2D,L:Look,o:Pose,x:number,groundY:number,h:number,squash=1){
  if(L.frames.length&&L.frames.every(f=>f.complete&&f.naturalWidth)){ // generated run cycle, when present
    const f=L.frames[Math.floor(o.p*L.frames.length)%L.frames.length],w=h*f.naturalWidth/f.naturalHeight;
    ctx.save();ctx.translate(x,groundY-o.bob*h);ctx.scale(1/Math.sqrt(squash),squash);ctx.rotate(o.lean*D*.4);ctx.drawImage(f,-w/2,-h,w,h);ctx.restore();
    return;
  }
  let PP=paints.get(L);
  if(!PP){PP=[paint(ctx,L,0),paint(ctx,L,.3)];paints.set(L,PP)}
  const P=PP[0],B=PP[1];
  const drop=Math.max(footDrop(o.th[0],o.kn[0],o.ft[0]),footDrop(o.th[1],o.kn[1],o.ft[1]),HIP_H*.6);
  ctx.save();
  ctx.translate(x,groundY);ctx.scale(h/Math.sqrt(squash),h*squash);
  ctx.translate(0,-drop-o.bob);
  // far-side limbs first (j=1)
  ctx.save();ctx.rotate(o.lean*D);ctx.translate(-.005,-TORSO+.03);arm(ctx,L,B,1,o);ctx.restore();
  leg(ctx,L,B,1,o);
  // torso leans around the hip, head rides on it
  ctx.save();ctx.rotate(o.lean*D);
  ctx.fillStyle=P.shorts;ctx.beginPath();ctx.roundRect(BACK+.005,-.05,CHEST-BACK-.01,.1,.04);ctx.fill();
  ctx.fillStyle=P.torso;ctx.beginPath();ctx.roundRect(BACK,-TORSO,CHEST-BACK,TORSO+L.hemY,[.07,.06,.04,.04]);ctx.fill();
  if(L.stripe){ctx.fillStyle="#F4F2EE";ctx.beginPath();ctx.roundRect(CHEST-.03,-TORSO+.01,.022,TORSO-.02,.01);ctx.fill()} // zip line + white tee
  ctx.fillStyle="rgba(20,24,58,.14)";ctx.fillRect(BACK+.01,L.hemY-.02,CHEST-BACK-.02,.02);
  if(L.head.complete&&L.head.naturalWidth)ctx.drawImage(L.head,-L.headW*L.neckX+.01,-TORSO-L.headH+.035,L.headW,L.headH);
  ctx.restore();
  leg(ctx,L,P,0,o);
  ctx.save();ctx.rotate(o.lean*D);ctx.translate(-.01,-TORSO+.035);arm(ctx,L,P,0,o);ctx.restore();
  ctx.restore();
}
