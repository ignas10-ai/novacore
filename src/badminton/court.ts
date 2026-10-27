// Badmintono aikštė ant canvas: a hall, a perspective court (portrait = P1 at the bottom / P2 at the top, landscape =
// P1 left / P2 right), the net, the two player rigs and the shuttle. No DOM: the game (badminton.ts) owns the canvas and
// calls these draw functions. Metrics in metres, the projection is a simple trapezoid (enough depth for a phone game).
import {COURT_LEN,COURT_W,NET_Z,NET_H,SHORT_SERVICE,sideOfZ,type Shuttle,type Side} from "./logic.ts";

export interface Layout{
  W:number;H:number;portrait:boolean;
  // projection anchors (CSS px)
  bx:number;by:number;   // P1 baseline centre
  tx:number;ty:number;   // P2 baseline centre
  bHalf:number;tHalf:number; // court half-width at P1 / P2 baseline (px, portrait) or half-height (landscape)
  mPx:number;            // px per metre of height at the P1 baseline
}
export const layout=(W:number,H:number):Layout=>{
  const portrait=H>=W*.95;
  return portrait
    ? {W,H,portrait,bx:W/2,by:H*.905,tx:W/2,ty:H*.105,bHalf:W*.455,tHalf:W*.30,mPx:H*.054}
    : {W,H,portrait,bx:W*.055,by:H*.56,tx:W*.945,ty:H*.56,bHalf:H*.36,tHalf:H*.20,mPx:H*.068};
};
// t = 0 at the P1 baseline, 1 at the P2 baseline; x in metres across the court; h in metres above the floor
export function project(L:Layout,z:number,x:number,h=0){
  const t=Math.min(1.05,Math.max(-.05,z/COURT_LEN)),s=1-.36*t;
  if(L.portrait){
    const gx=L.bx+(L.tx-L.bx)*t,g=L.by+(L.ty-L.by)*t,half=L.bHalf+(L.tHalf-L.bHalf)*t;
    return {x:gx+(x/(COURT_W/2))*half,y:g-h*L.mPx*s,s};
  }
  const gx=L.bx+(L.tx-L.bx)*t,g=L.by+(L.ty-L.by)*t,half=L.bHalf+(L.tHalf-L.bHalf)*t;
  return {x:gx,y:g-(x/(COURT_W/2))*half-h*L.mPx*s,s};
}
// far -> near corners of the court polygon
const corners=(L:Layout)=>[
  project(L,COURT_LEN,-COURT_W/2),project(L,COURT_LEN,COURT_W/2),
  project(L,0,COURT_W/2),project(L,0,-COURT_W/2),
];
function poly(ctx:CanvasRenderingContext2D,pts:{x:number;y:number}[]){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}
function line(ctx:CanvasRenderingContext2D,a:{x:number;y:number},b:{x:number;y:number}){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}

const HALL_TOP="#0B0F2A", HALL_BOT="#232A5C", FLOOR="#176B52", FLOOR_2="#1C7C5E";
// the static hall + court floor + lines; render once into an offscreen canvas and blit every frame
export function drawBackground(ctx:CanvasRenderingContext2D,L:Layout){
  const g=ctx.createLinearGradient(0,0,L.portrait?0:L.W,L.portrait?L.H:0);
  g.addColorStop(0,HALL_TOP);g.addColorStop(.62,HALL_BOT);g.addColorStop(1,"#111638");
  ctx.fillStyle=g;ctx.fillRect(0,0,L.W,L.H);
  // spotlights over the court
  const lights=L.portrait?[.2,.5,.8]:[.25,.55,.82];
  for(const f of lights){
    const x=L.portrait?L.W*f:L.W*.55,y=L.portrait?L.H*.18:L.H*.1;
    const r=ctx.createRadialGradient(x,y,0,x,y,L.portrait?L.W*.7:L.H*1.1);
    r.addColorStop(0,"rgba(255,255,255,.12)");r.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=r;ctx.fillRect(0,0,L.W,L.H);
  }
  // crowd: a band of dots behind the far baseline (portrait top, landscape right)
  ctx.save();
  ctx.globalAlpha=.5;
  const bandY=L.portrait?L.ty-L.H*.075:L.ty-L.H*.5,bandH=L.portrait?L.H*.075:L.H;
  const bandX=L.portrait?0:L.tx,bandW=L.portrait?L.W:L.W*.055;
  ctx.fillStyle="#070A20";ctx.fillRect(bandX,bandY,bandW,bandH);
  ctx.globalAlpha=.8;
  for(let k=0;k<180;k++){
    const x=L.portrait?(k*97%1000)/1000*L.W:L.tx+8+(k%4)*5;
    const y=L.portrait?bandY+8+(k%7)*((bandH-16)/7):(k*53%1000)/1000*L.H;
    ctx.fillStyle=["#FF3B3B","#2F6BFF","#FFC61A","#FFFFFF","#16B67A"][k%5];
    ctx.beginPath();ctx.arc(x,y,1.6+(k%3)*.8,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  // court floor
  const cs=corners(L);
  ctx.save();poly(ctx,cs);ctx.clip();
  const fg=ctx.createLinearGradient(L.portrait?0:L.W*.1,L.portrait?L.H*.1:L.H*.2,L.portrait?0:L.W,L.portrait?L.H:L.H*.8);
  fg.addColorStop(0,FLOOR_2);fg.addColorStop(1,FLOOR);
  ctx.fillStyle=fg;ctx.fillRect(0,0,L.W,L.H);
  // mowing-like bands along the length
  ctx.globalAlpha=.07;ctx.fillStyle="#FFFFFF";
  for(let k=0;k<8;k++){const z0=COURT_LEN*k/8,z1=COURT_LEN*(k+.5)/8;if(k%2)continue;poly(ctx,[project(L,z0,-COURT_W/2),project(L,z0,COURT_W/2),project(L,z1,COURT_W/2),project(L,z1,-COURT_W/2)]);ctx.fill()}
  ctx.globalAlpha=1;
  // court lines
  ctx.strokeStyle="rgba(255,255,255,.92)";ctx.lineWidth=Math.max(2,L.W*.004);ctx.lineCap="round";
  for(const x of [-COURT_W/2,COURT_W/2])line(ctx,project(L,0,x),project(L,COURT_LEN,x));
  for(const z of [0,COURT_LEN,NET_Z-SHORT_SERVICE,NET_Z+SHORT_SERVICE])line(ctx,project(L,z,-COURT_W/2),project(L,z,COURT_W/2));
  line(ctx,project(L,0,0),project(L,NET_Z-SHORT_SERVICE,0));
  line(ctx,project(L,COURT_LEN,0),project(L,NET_Z+SHORT_SERVICE,0)); // the centre line, both service courts
  ctx.strokeStyle="rgba(255,255,255,.35)";ctx.lineWidth=Math.max(1,L.W*.0025);
  for(const z of [NET_Z-1.98-0.76,NET_Z+1.98+0.76])line(ctx,project(L,z,-COURT_W/2),project(L,z,COURT_W/2)); // doubles long service
  ctx.restore();
  // the floor edge / shadow
  ctx.strokeStyle="rgba(0,0,0,.45)";ctx.lineWidth=Math.max(3,L.W*.008);poly(ctx,cs);ctx.stroke();
}
// the net: a mesh band with two posts; drawn after the far player and before the near one
export function drawNet(ctx:CanvasRenderingContext2D,L:Layout,now:number){
  const top=project(L,NET_Z,0,NET_H),bottom=project(L,NET_Z,0,0);
  const l0=project(L,NET_Z,-COURT_W/2,0),r0=project(L,NET_Z,COURT_W/2,0);
  const l1=project(L,NET_Z,-COURT_W/2,NET_H),r1=project(L,NET_Z,COURT_W/2,NET_H);
  const post=Math.max(3,L.W*.009);
  // posts
  ctx.strokeStyle="#0B0F2A";ctx.lineWidth=post;ctx.lineCap="round";
  line(ctx,l0,l1);line(ctx,r0,r1);
  ctx.strokeStyle="#EAE7DF";ctx.lineWidth=post*.42;line(ctx,l0,l1);line(ctx,r0,r1);
  // mesh
  ctx.save();
  ctx.beginPath();
  if(L.portrait){
    ctx.moveTo(l1.x,l1.y);ctx.lineTo(r1.x,r1.y);ctx.lineTo(r0.x,r0.y);ctx.lineTo(l0.x,l0.y);
  }else{
    ctx.moveTo(l1.x,l1.y);ctx.lineTo(r1.x,r1.y);ctx.lineTo(r0.x,r0.y);ctx.lineTo(l0.x,l0.y);
  }
  ctx.closePath();ctx.clip();
  ctx.strokeStyle="rgba(255,255,255,.30)";ctx.lineWidth=Math.max(1,L.W*.0016);
  const n=14;
  for(let k=0;k<=n;k++){
    const a={x:l0.x+(r0.x-l0.x)*k/n,y:l0.y+(r0.y-l0.y)*k/n};
    const b={x:l1.x+(r1.x-l1.x)*k/n,y:l1.y+(r1.y-l1.y)*k/n};
    line(ctx,a,b);
  }
  for(let k=0;k<=5;k++){
    const a={x:l0.x+(l1.x-l0.x)*k/5,y:l0.y+(l1.y-l0.y)*k/5};
    const b={x:r0.x+(r1.x-r0.x)*k/5,y:r0.y+(r1.y-r0.y)*k/5};
    line(ctx,a,b);
  }
  ctx.restore();
  // the white tape on top, with a subtle highlight
  ctx.strokeStyle="#F7F5F2";ctx.lineWidth=Math.max(4,L.W*.012);ctx.lineCap="round";
  line(ctx,l1,r1);
  ctx.strokeStyle="rgba(255,198,26,.85)";ctx.lineWidth=Math.max(1.5,L.W*.004);
  line(ctx,{x:l1.x,y:l1.y+2},{x:r1.x,y:r1.y+2});
  // shadow under the net
  const g=ctx.createLinearGradient(0,bottom.y,0,bottom.y+L.H*.06);
  g.addColorStop(0,"rgba(0,0,0,.28)");g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g;
  if(L.portrait)ctx.fillRect(l0.x,bottom.y,r0.x-l0.x,L.H*.06);
  else{const gg=ctx.createLinearGradient(l0.x,0,l0.x+L.W*.04,0);gg.addColorStop(0,"rgba(0,0,0,.28)");gg.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gg;ctx.fillRect(l0.x,Math.min(l0.y,r0.y),L.W*.04,Math.abs(l0.y-r0.y))}
  void top;void now;
}

// ---------- players (simple vector mascot rigs in the brand colours) ----------
export interface PlayerPose{arm:number;lean:number;hit:number;mood:"fierce"|"smirk"|"happy"|"sad";hand:0|1}
export const restPose=(mood:"fierce"|"smirk"):PlayerPose=>({arm:-.55,lean:0,hit:0,mood,hand:1});
const TONE=["#FF3B3B","#2F6BFF"], BAND=["#FFC61A","#FFFFFF"], INK="#14183A";
export function drawPlayer(ctx:CanvasRenderingContext2D,L:Layout,side:Side,p:PlayerPose,now:number){
  const homeZ=side===0?1.15:COURT_LEN-1.15;
  const at=project(L,homeZ,0,0),sc=at.s;
  const h=(L.portrait?L.H*.185:L.H*.27)*sc;
  const bob=Math.sin(now/520+(side?1.7:0))*h*.018;
  const x=at.x,y=at.y+bob;
  const back=side===0;
  ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);
  // floor shadow
  ctx.fillStyle="rgba(0,0,0,.30)";ctx.beginPath();ctx.ellipse(0,0,h*.30,h*.055,0,0,Math.PI*2);ctx.fill();
  // legs
  ctx.fillStyle=INK;ctx.beginPath();ctx.roundRect(-h*.15,-h*.30,h*.12,h*.30,h*.06);ctx.fill();
  ctx.beginPath();ctx.roundRect(h*.03,-h*.30,h*.12,h*.30,h*.06);ctx.fill();
  // body
  ctx.fillStyle=TONE[side];ctx.strokeStyle=INK;ctx.lineWidth=h*.06;ctx.lineJoin="round";
  ctx.beginPath();ctx.roundRect(-h*.22,-h*.63,h*.44,h*.40,h*.15);ctx.fill();ctx.stroke();
  // head
  const hy=-h*.84;
  ctx.beginPath();ctx.arc(0,hy,h*.27,0,Math.PI*2);ctx.fill();ctx.stroke();
  // headband slice
  ctx.save();ctx.beginPath();ctx.arc(0,hy,h*.27,0,Math.PI*2);ctx.clip();
  ctx.fillStyle=BAND[side];ctx.fillRect(-h*.28,hy-h*.16,h*.56,h*.13);
  ctx.strokeStyle=INK;ctx.lineWidth=h*.045;ctx.beginPath();ctx.moveTo(-h*.28,hy-h*.03);ctx.lineTo(h*.28,hy-h*.03);ctx.stroke();
  ctx.restore();
  // headband tails on the facing side
  ctx.fillStyle=BAND[side];ctx.strokeStyle=INK;ctx.lineWidth=h*.04;
  const dir=back?1:-1;
  ctx.beginPath();ctx.moveTo(dir*h*.24,hy-h*.10);ctx.lineTo(dir*h*.40,hy-h*.16);ctx.lineTo(dir*h*.36,hy-h*.01);ctx.closePath();ctx.fill();ctx.stroke();
  // face (front player only; P1 sees the back of the head)
  if(!back){
    ctx.fillStyle=INK;ctx.beginPath();ctx.ellipse(-h*.09,hy+h*.02,h*.035,h*.05,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(h*.09,hy+h*.02,h*.035,h*.05,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=INK;ctx.lineWidth=h*.032;ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(-h*.08,hy+h*.12);ctx.quadraticCurveTo(0,hy+h*.17,h*.08,hy+h*.12);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-h*.17,hy-h*.03);ctx.lineTo(-h*.03,hy-h*.06);ctx.moveTo(h*.17,hy-h*.03);ctx.lineTo(h*.03,hy-h*.06);ctx.stroke();
  }
  // off-hand: a short bent arm with a glove on the other side (the mascot has two floating gloves)
  const ox=(p.hand?-1:1)*h*.20,oy=-h*.56,od=p.hand?-1:1;
  const oex=ox+od*h*.12,oey=oy+h*.20;
  ctx.strokeStyle=INK;ctx.lineWidth=h*.075;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(oex,oey);ctx.stroke();
  ctx.strokeStyle=TONE[side];ctx.lineWidth=h*.04;ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(oex,oey);ctx.stroke();
  ctx.fillStyle=TONE[side];ctx.strokeStyle=INK;ctx.lineWidth=h*.045;
  ctx.beginPath();ctx.arc(oex,oey,h*.075,0,Math.PI*2);ctx.fill();ctx.stroke();
  // racket arm: from the shoulder on the chosen side; arm=-.55 ready (up), +.9 swung down
  const sx=(p.hand?1:-1)*h*.20,sy=-h*.56;
  const a=p.arm, len=h*.42;
  const wx=sx+Math.cos(a+Math.PI*.12)*len*(p.hand?1:-1),wy=sy+Math.sin(a)*len;
  ctx.strokeStyle=INK;ctx.lineWidth=h*.075;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(wx,wy);ctx.stroke();
  ctx.strokeStyle=TONE[side];ctx.lineWidth=h*.04;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(wx,wy);ctx.stroke();
  // the glove
  ctx.fillStyle=TONE[side];ctx.strokeStyle=INK;ctx.lineWidth=h*.045;
  ctx.beginPath();ctx.arc(wx,wy,h*.075,0,Math.PI*2);ctx.fill();ctx.stroke();
  // racket: handle + oval head, angled along the arm
  const ra=a+(p.hand?-0.35:0.35),rl=h*.34;
  const ex=wx+Math.cos(ra)*rl,ey=wy+Math.sin(ra)*rl;
  ctx.strokeStyle=INK;ctx.lineWidth=h*.035;ctx.beginPath();ctx.moveTo(wx,wy);ctx.lineTo(ex,ey);ctx.stroke();
  ctx.save();ctx.translate(ex,ey);ctx.rotate(ra);
  ctx.fillStyle="rgba(255,255,255,.92)";ctx.strokeStyle=INK;ctx.lineWidth=h*.035;
  ctx.beginPath();ctx.ellipse(0,0,h*.13,h*.10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="rgba(20,24,58,.35)";ctx.lineWidth=h*.012;
  for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(-h*.10,k*h*.03);ctx.lineTo(h*.10,k*h*.03);ctx.stroke()}
  for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(k*h*.038,-h*.08);ctx.lineTo(k*h*.038,h*.08);ctx.stroke()}
  ctx.restore();
  // hit flash around the racket head
  if(p.hit>0){
    ctx.globalAlpha=Math.min(1,p.hit);ctx.strokeStyle="#FFC61A";ctx.lineWidth=h*.05;
    ctx.beginPath();ctx.arc(ex,ey,h*(.16+.10*(1-p.hit)),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.restore();
}

// ---------- shuttle ----------
export interface ShuttleTrailPoint{x:number;z:number;t:number}
export function drawShuttle(ctx:CanvasRenderingContext2D,L:Layout,s:Shuttle,trail:ShuttleTrailPoint[],now:number){
  const g=project(L,s.z,s.x,0),p=project(L,s.z,s.x,Math.max(0,s.y)),sc=p.s;
  const size=Math.max(5,L.W*.012)*sc;
  // shadow on the floor
  const k=Math.max(0,1-s.y/7);
  ctx.globalAlpha=.20+.20*k;ctx.fillStyle="#000";
  ctx.beginPath();ctx.ellipse(g.x,g.y,size*(1.2+.7*k),size*(.35+.2*k),0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
  // trail
  for(let i=0;i<trail.length;i++){
    const q=trail[i],a=(now-q.t)/280;
    if(a<0||a>1)continue;
    const qp=project(L,q.z,q.x,0);
    ctx.globalAlpha=(1-a)*.35;ctx.fillStyle="#fff";
    ctx.beginPath();ctx.arc(qp.x,qp.y,size*(1-a)*.45,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  // heading from the projected velocity
  const q=project(L,s.z+.02*s.vz,s.x+.02*s.vx,Math.max(0,s.y+.02*s.vy));
  const ang=Math.atan2(q.y-p.y,q.x-p.x)||0;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ang);
  // feathers (behind), then the cork (front)
  ctx.fillStyle="rgba(255,255,255,.92)";ctx.strokeStyle=INK;ctx.lineWidth=Math.max(1,size*.16);
  for(const a of [-.42,0,.42]){
    ctx.save();ctx.rotate(a);ctx.beginPath();ctx.moveTo(-size*.2,0);ctx.lineTo(-size*1.55,0);ctx.stroke();ctx.restore();
  }
  ctx.beginPath();ctx.moveTo(-size*.2,0);ctx.quadraticCurveTo(-size*.9,-size*.62,-size*1.65,0);ctx.quadraticCurveTo(-size*.9,size*.62,-size*.2,0);ctx.fill();
  ctx.fillStyle="#F7F5F2";ctx.beginPath();ctx.arc(size*.15,0,size*.42,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle="#FFC61A";ctx.beginPath();ctx.arc(size*.15,0,size*.22,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
// a landing marker: white ring in, red X out
export function drawLanding(ctx:CanvasRenderingContext2D,L:Layout,z:number,x:number,ok:boolean,age:number){
  const p=project(L,z,x,0),r=Math.max(10,L.W*.03)*(1+age*.6);
  ctx.save();ctx.globalAlpha=Math.max(0,1-age*1.6);
  ctx.strokeStyle=ok?"#fff":"#FF3B3B";ctx.lineWidth=Math.max(2,L.W*.005);
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
  if(!ok){ctx.beginPath();ctx.moveTo(p.x-r*.55,p.y-r*.55);ctx.lineTo(p.x+r*.55,p.y+r*.55);ctx.moveTo(p.x+r*.55,p.y-r*.55);ctx.lineTo(p.x-r*.55,p.y+r*.55);ctx.stroke()}
  ctx.restore();
}
export const sideLabel=(s:Side)=>s===0?"P1":"P2";
export {sideOfZ};
