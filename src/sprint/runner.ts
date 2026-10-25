// Side-view runner in the Claude Design mascot style (2026-10-26): round head with the headband and flying knot tails,
// a small body, floating boxing gloves on the arm swing, short navy legs with sneakers, thick navy outline – drawn in
// canvas so the run cycle follows the player's real cadence. Same pose rig as before (thigh/knee/foot, shoulder/elbow).
// Units: 1 = character height (head top to sole), origin = hip joint, +x = running direction, +y = down.

export interface Look{name:string;body:string;dark:string;band:string;bandEdge:string}
export const LOOKS:Look[]=[
  {name:"raudonas",body:"#FF3B3B",dark:"#C9202B",band:"#FFC61A",bandEdge:"#E0A800"},
  {name:"melynas",body:"#2F6BFF",dark:"#1B4AC9",band:"#FFFFFF",bandEdge:"#D9DEEA"},
];
const INK="#14183A", OL=.024;      // outline width in units
const HIP_H=.3, THIGH=.15, SHIN=.14, LW=.1, UARM=.13, FARM=.1, GLOVE=.075, BODY_W=.27, BODY_H=.24, HEAD_R=.25;
const HEAD_Y=-BODY_H-.15;          // head centre above the hip
const SHOULDER_Y=-BODY_H+.06;
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
  o.sh[0]=48;o.el[0]=70;o.sh[1]=-34;o.el[1]=60;o.lean=24;o.bob=.003*Math.sin(t*9);o.p=0;
}
export function standPose(o:Pose,t:number){ // idle breathing, gloves up in guard
  o.th[0]=6;o.th[1]=-4;o.kn[0]=8;o.kn[1]=6;o.ft[0]=o.ft[1]=0;o.sh[0]=30;o.sh[1]=10;o.el[0]=100;o.el[1]=110;o.lean=2;o.bob=.004*Math.sin(t*2.4);o.p=t;
}
export function winPose(o:Pose,t:number){ // gloves up, little hops
  standPose(o,t);o.sh[0]=165;o.sh[1]=150;o.el[0]=-14;o.el[1]=-20;o.bob=.035*Math.abs(Math.sin(t*5));
}

// lowest sole point below the hip (units, +down): forward kinematics hip -> knee -> ankle -> heel / toe
function footDrop(th:number,kn:number,ft:number){
  const a1=-th*D,a2=a1+kn*D,a3=a2-ft*D,y=THIGH*Math.cos(a1)+SHIN*Math.cos(a2),c=.05*Math.cos(a3),s=Math.sin(a3);
  return y+Math.max(c-.05*s,c+.12*s);
}
function capsule(ctx:CanvasRenderingContext2D,len:number,w:number){
  const r=w/2;ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(-r,len);ctx.arc(0,len,r,Math.PI,0,true);ctx.lineTo(r,0);ctx.arc(0,0,r,0,Math.PI,true);ctx.closePath();
}
function leg(ctx:CanvasRenderingContext2D,j:number,o:Pose,far:boolean){
  ctx.save();
  ctx.rotate(-o.th[j]*D);
  ctx.fillStyle=far?"#0B0E26":INK;
  capsule(ctx,THIGH,LW);ctx.fill();
  ctx.translate(0,THIGH);ctx.rotate(o.kn[j]*D);
  capsule(ctx,SHIN,LW*.92);ctx.fill();
  // chunky sneaker, toe forward (+x): white sole + coloured upper
  ctx.translate(0,SHIN);ctx.rotate(-o.ft[j]*D);
  ctx.beginPath();ctx.roundRect(-.06,-.035,.19,.085,.04);ctx.fillStyle=far?"#2A2F5A":INK;ctx.fill();
  ctx.beginPath();ctx.roundRect(-.06,.025,.19,.03,.015);ctx.fillStyle=far?"#C9CCE3":"#fff";ctx.fill();
  ctx.lineWidth=OL*.8;ctx.strokeStyle=INK;ctx.beginPath();ctx.roundRect(-.06,-.035,.19,.09,.04);ctx.stroke();
  ctx.restore();
}
// gloves float on the arm swing (no drawn arm, like the mascot art)
function glove(ctx:CanvasRenderingContext2D,L:Look,j:number,o:Pose,far:boolean){
  const a1=-o.sh[j]*D, a2=a1-o.el[j]*D;
  const x=Math.sin(-a1)*UARM+Math.sin(-a2)*FARM, y=Math.cos(a1)*UARM+Math.cos(a2)*FARM;
  ctx.beginPath();ctx.arc(x,y,GLOVE,0,Math.PI*2);
  ctx.fillStyle=far?L.dark:L.body;ctx.fill();ctx.lineWidth=OL;ctx.strokeStyle=INK;ctx.stroke();
  if(!far){ctx.beginPath();ctx.arc(x-.012,y-.012,GLOVE*.6,Math.PI*1.05,Math.PI*1.55);ctx.lineWidth=OL*.8;ctx.strokeStyle="rgba(255,255,255,.85)";ctx.lineCap="round";ctx.stroke()}
}
function head(ctx:CanvasRenderingContext2D,L:Look,o:Pose,t:number){
  const r=HEAD_R, cy=HEAD_Y;
  // knot tails fly behind (-x), flapping with the stride
  const fl=Math.sin(t*2)*.025;
  ctx.lineJoin="round";ctx.lineWidth=OL;ctx.strokeStyle=INK;ctx.fillStyle=L.band;
  ctx.beginPath();ctx.moveTo(-r*.8,cy-.06);ctx.lineTo(-r-.17,cy-.12+fl);ctx.lineTo(-r-.12,cy+.0+fl*.6);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-r*.8,cy-.02);ctx.lineTo(-r-.13,cy+.06-fl);ctx.lineTo(-r-.04,cy+.09-fl*.5);ctx.closePath();ctx.fill();ctx.stroke();
  // head
  ctx.beginPath();ctx.arc(0,cy,r,0,Math.PI*2);ctx.fillStyle=L.body;ctx.fill();
  // headband: the slice of the circle between two curved edges (wraps around the head)
  ctx.save();ctx.beginPath();ctx.arc(0,cy,r,0,Math.PI*2);ctx.clip();
  ctx.beginPath();ctx.moveTo(-r,cy-.1);ctx.quadraticCurveTo(0,cy-.13,r,cy-.07);ctx.lineTo(r,cy+.01);ctx.quadraticCurveTo(0,cy-.04,-r,cy-.01);ctx.closePath();
  ctx.fillStyle=L.band;ctx.fill();ctx.lineWidth=OL*.85;ctx.stroke();
  ctx.beginPath();ctx.ellipse(-r*.38,cy-r*.68,r*.26,r*.12,-.5,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,.4)";ctx.fill(); // shine
  ctx.restore();
  // face in profile, looking ahead (+x): brow, eye with a highlight, open "go!" mouth
  const ex=r*.5, ey=cy+.06;
  ctx.lineCap="round";ctx.strokeStyle=INK;ctx.lineWidth=OL*1.25;
  ctx.beginPath();ctx.moveTo(ex-.06,ey-.07);ctx.lineTo(ex+.05,ey-.05);ctx.stroke();
  ctx.beginPath();ctx.ellipse(ex,ey+.005,.032,.042,0,0,Math.PI*2);ctx.fillStyle=INK;ctx.fill();
  ctx.beginPath();ctx.arc(ex+.01,ey-.012,.012,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
  ctx.beginPath();ctx.moveTo(r*.42,cy+.13);ctx.quadraticCurveTo(r*.72,cy+.17,r*.9,cy+.1);ctx.quadraticCurveTo(r*.7,cy+.11,r*.42,cy+.13);ctx.closePath();
  ctx.fillStyle=INK;ctx.fill();ctx.lineWidth=OL*.7;ctx.stroke();
  // outline last, over the band edges
  ctx.beginPath();ctx.arc(0,cy,r,0,Math.PI*2);ctx.lineWidth=OL;ctx.stroke();
}

// draw standing on (x, groundY); h = character height in px; squash < 1 flattens (landing), > 1 stretches (flight)
export function drawRunner(ctx:CanvasRenderingContext2D,L:Look,o:Pose,x:number,groundY:number,h:number,squash=1){
  const drop=Math.max(footDrop(o.th[0],o.kn[0],o.ft[0]),footDrop(o.th[1],o.kn[1],o.ft[1]),HIP_H*.6);
  ctx.save();
  ctx.translate(x,groundY);ctx.scale(h/Math.sqrt(squash),h*squash);
  ctx.translate(0,-drop-o.bob);
  ctx.lineJoin="round";ctx.lineCap="round";
  // far side first (j=1)
  ctx.save();ctx.rotate(o.lean*D);ctx.translate(-.02,SHOULDER_Y);glove(ctx,L,1,o,true);ctx.restore();
  leg(ctx,1,o,true);
  ctx.save();ctx.rotate(o.lean*D);
  ctx.beginPath();ctx.roundRect(-BODY_W/2,-BODY_H,BODY_W,BODY_H+.06,.11);ctx.fillStyle=L.body;ctx.fill();ctx.lineWidth=OL;ctx.strokeStyle=INK;ctx.stroke();
  head(ctx,L,o,o.p*6.3);
  ctx.restore();
  leg(ctx,0,o,false);
  ctx.save();ctx.rotate(o.lean*D);ctx.translate(.02,SHOULDER_Y);glove(ctx,L,0,o,false);ctx.restore();
  ctx.restore();
}
