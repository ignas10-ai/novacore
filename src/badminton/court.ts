// Badmintono trečio asmens arena ant canvas: the camera sits behind the near (receiving) player. The near player is a
// large, semi-transparent mascot whose arm/racket follow the real wrist; the far opponent is small across the net. The
// red target bubble with a shrinking ring marks where/when to hit; the shuttle is projected from absolute court metres.
// No DOM: the game (badminton.ts) owns the canvas and calls these draw functions. Portrait = near at the bottom / far at
// the top; landscape = near at the left / far at the right. The court itself never flips: `view` only decides which
// player/colour is near and how the ABSOLUTE shuttle coordinates map into the near/far halves.
import {COURT_LEN,COURT_W,NET_Z,NET_H,SHORT_SERVICE,type Shuttle,type Side} from "./logic.ts";

export interface Layout{
  W:number;H:number;portrait:boolean;
  bx:number;by:number;   // near baseline centre
  tx:number;ty:number;   // far baseline centre
  bHalf:number;tHalf:number; // court half-width at the near / far baseline (px, portrait) or half-height (landscape)
  mPx:number;            // px per metre of height at the near baseline
}
export const layout=(W:number,H:number):Layout=>{
  const portrait=H>=W*.95;
  return portrait
    ? {W,H,portrait,bx:W/2,by:H*.96,tx:W/2,ty:H*.16,bHalf:W*.50,tHalf:W*.29,mPx:H*.058}
    : {W,H,portrait,bx:W*.03,by:H*.56,tx:W*.97,ty:H*.56,bHalf:H*.44,tHalf:H*.21,mPx:H*.075};
};
// near own coordinates: z = 0 at the near baseline .. NET_Z at the net, x = across the court (near player's right +)
const tAt=(z:number)=>Math.min(1.05,Math.max(-.05,z/COURT_LEN));
export function project(L:Layout,z:number,x:number,h=0){
  const t=tAt(z),s=1-.36*t;
  if(L.portrait){
    const gx=L.bx+(L.tx-L.bx)*t,g=L.by+(L.ty-L.by)*t,half=L.bHalf+(L.tHalf-L.bHalf)*t;
    return {x:gx+(x/(COURT_W/2))*half,y:g-h*L.mPx*s,s};
  }
  const gx=L.bx+(L.tx-L.bx)*t,g=L.by+(L.ty-L.by)*t,half=L.bHalf+(L.tHalf-L.bHalf)*t;
  return {x:gx,y:g-(x/(COURT_W/2))*half-h*L.mPx*s,s};
}
// near player's own coords -> screen
export const nearPoint=(L:Layout,z:number,x:number,h=0)=>project(L,z,x,h);
// far player's own coords (their own right = screen left when they face us) -> screen
export const farPoint=(L:Layout,z:number,x:number,h=0)=>project(L,COURT_LEN-z,-x,h);
// an ABSOLUTE court position seen from the near player's side
export const shuttlePoint=(L:Layout,view:Side,z:number,x:number,h=0)=>view===0?project(L,z,x,h):project(L,COURT_LEN-z,-x,h);

const corners=(L:Layout)=>[project(L,COURT_LEN,-COURT_W/2),project(L,COURT_LEN,COURT_W/2),project(L,0,COURT_W/2),project(L,0,-COURT_W/2)];
function poly(ctx:CanvasRenderingContext2D,pts:{x:number;y:number}[]){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}
function line(ctx:CanvasRenderingContext2D,a:{x:number;y:number},b:{x:number;y:number}){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}

const HALL_TOP="#0B0F2A", HALL_BOT="#232A5C", FLOOR="#176B52", FLOOR_2="#1C7C5E", INK="#14183A";
// the static hall + court floor + lines (the court is symmetric; the near half is always at the bottom/left)
export function drawBackground(ctx:CanvasRenderingContext2D,L:Layout){
  const g=ctx.createLinearGradient(0,0,L.portrait?0:L.W,L.portrait?L.H:0);
  g.addColorStop(0,HALL_TOP);g.addColorStop(.62,HALL_BOT);g.addColorStop(1,"#111638");
  ctx.fillStyle=g;ctx.fillRect(0,0,L.W,L.H);
  const lights=L.portrait?[.2,.5,.8]:[.25,.55,.82];
  for(const f of lights){
    const x=L.portrait?L.W*f:L.W*.55,y=L.portrait?L.H*.18:L.H*.1;
    const r=ctx.createRadialGradient(x,y,0,x,y,L.portrait?L.W*.7:L.H*1.1);
    r.addColorStop(0,"rgba(255,255,255,.12)");r.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=r;ctx.fillRect(0,0,L.W,L.H);
  }
  // crowd behind the FAR baseline (portrait top, landscape right): the far side is always the top/right
  ctx.save();ctx.globalAlpha=.5;
  const bandY=L.portrait?L.ty-L.H*.085:L.ty-L.H*.5,bandH=L.portrait?L.H*.085:L.H;
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
  ctx.globalAlpha=.07;ctx.fillStyle="#FFFFFF";
  for(let k=0;k<8;k++){const z0=COURT_LEN*k/8,z1=COURT_LEN*(k+.5)/8;if(k%2)continue;poly(ctx,[project(L,z0,-COURT_W/2),project(L,z0,COURT_W/2),project(L,z1,COURT_W/2),project(L,z1,-COURT_W/2)]);ctx.fill()}
  ctx.globalAlpha=1;
  ctx.strokeStyle="rgba(255,255,255,.92)";ctx.lineWidth=Math.max(2,L.W*.004);ctx.lineCap="round";
  for(const x of [-COURT_W/2,COURT_W/2])line(ctx,project(L,0,x),project(L,COURT_LEN,x));
  for(const z of [0,COURT_LEN,NET_Z-SHORT_SERVICE,NET_Z+SHORT_SERVICE])line(ctx,project(L,z,-COURT_W/2),project(L,z,COURT_W/2));
  line(ctx,project(L,0,0),project(L,NET_Z-SHORT_SERVICE,0));
  line(ctx,project(L,COURT_LEN,0),project(L,NET_Z+SHORT_SERVICE,0));
  ctx.strokeStyle="rgba(255,255,255,.35)";ctx.lineWidth=Math.max(1,L.W*.0025);
  for(const z of [NET_Z-1.98-0.76,NET_Z+1.98+0.76])line(ctx,project(L,z,-COURT_W/2),project(L,z,COURT_W/2));
  ctx.restore();
  ctx.strokeStyle="rgba(0,0,0,.45)";ctx.lineWidth=Math.max(3,L.W*.008);poly(ctx,cs);ctx.stroke();
}
// the net across the middle
export function drawNet(ctx:CanvasRenderingContext2D,L:Layout,now:number){
  const bottom=project(L,NET_Z,0,0);
  const l0=project(L,NET_Z,-COURT_W/2,0),r0=project(L,NET_Z,COURT_W/2,0);
  const l1=project(L,NET_Z,-COURT_W/2,NET_H),r1=project(L,NET_Z,COURT_W/2,NET_H);
  const post=Math.max(3,L.W*.009);
  ctx.strokeStyle="#0B0F2A";ctx.lineWidth=post;ctx.lineCap="round";
  line(ctx,l0,l1);line(ctx,r0,r1);
  ctx.strokeStyle="#EAE7DF";ctx.lineWidth=post*.42;line(ctx,l0,l1);line(ctx,r0,r1);
  ctx.save();
  ctx.beginPath();ctx.moveTo(l1.x,l1.y);ctx.lineTo(r1.x,r1.y);ctx.lineTo(r0.x,r0.y);ctx.lineTo(l0.x,l0.y);ctx.closePath();ctx.clip();
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
  ctx.strokeStyle="#F7F5F2";ctx.lineWidth=Math.max(4,L.W*.012);ctx.lineCap="round";
  line(ctx,l1,r1);
  ctx.strokeStyle="rgba(255,198,26,.85)";ctx.lineWidth=Math.max(1.5,L.W*.004);
  line(ctx,{x:l1.x,y:l1.y+2},{x:r1.x,y:r1.y+2});
  const g=ctx.createLinearGradient(0,bottom.y,0,bottom.y+L.H*.06);
  g.addColorStop(0,"rgba(0,0,0,.28)");g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g;
  if(L.portrait)ctx.fillRect(l0.x,bottom.y,r0.x-l0.x,L.H*.06);
  else{const gg=ctx.createLinearGradient(l0.x,0,l0.x+L.W*.04,0);gg.addColorStop(0,"rgba(0,0,0,.28)");gg.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gg;ctx.fillRect(l0.x,Math.min(l0.y,r0.y),L.W*.04,Math.abs(l0.y-r0.y))}
  void now;
}

const TONE=["#FF3B3B","#2F6BFF"], BAND=["#FFC61A","#FFFFFF"];
export interface RigPose{
  side:Side;hand:0|1;
  wrist:[number,number]|null; // (wrist - body centre)/torso, mirrored screen x (the player's own right = +)
  arm:number;                // fallback arm angle when the wrist is not tracked
  hit:number;jump:number;run:number;moving:boolean;
}
export const restRig=(side:Side):RigPose=>({side,hand:1,wrist:null,arm:-.55,hit:0,jump:0,run:0,moving:false});

// the shared mascot rig: `back` = seen from behind (the near player), `mirror` flips the wrist x for the far player
function rig(ctx:CanvasRenderingContext2D,h:number,p:RigPose,back:boolean,mirror:boolean){
  const alpha=back?.40:1; // the near (third-person) player stays see-through so the red target bubble reads
  const j=Math.min(1,Math.max(0,p.jump));
  const lift=j*h*.22;
  ctx.save();
  ctx.globalAlpha=back?.17:.30;
  ctx.fillStyle="#000";ctx.beginPath();ctx.ellipse(0,0,h*.31*(1-j*.4),h*.055*(1-j*.4),0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=alpha;
  ctx.translate(0,-lift);
  const rp=p.run*Math.PI*2, sw=p.moving?Math.sin(rp):0;
  const legL=Math.max(0,sw)*h*.10*(p.moving?1:0),legR=Math.max(0,-sw)*h*.10*(p.moving?1:0);
  // legs (drawn before the body so a lifted knee reads in front; they are in front in the mascots too)
  ctx.fillStyle=INK;
  ctx.beginPath();ctx.roundRect(-h*.16,-h*.30-legL,h*.12,h*.30+legL,h*.06);ctx.fill();
  ctx.beginPath();ctx.roundRect(h*.04,-h*.30-legR,h*.12,h*.30+legR,h*.06);ctx.fill();
  // body (leaning slightly toward the racket hand, bouncing while running)
  const bob=p.moving?Math.abs(sw)*h*.015:Math.sin(performance.now()/520+(p.side?1.7:0))*h*.008;
  const lean=p.wrist?Math.max(-.06,Math.min(.06,p.wrist[0]*.05)):0;
  ctx.save();ctx.translate(0,bob);ctx.rotate(lean);
  ctx.fillStyle=TONE[p.side];ctx.strokeStyle=INK;ctx.lineWidth=h*.06;ctx.lineJoin="round";
  ctx.beginPath();ctx.roundRect(-h*.23,-h*.64,h*.46,h*.42,h*.16);ctx.fill();ctx.stroke();
  // head
  const hy=-h*.86;
  ctx.beginPath();ctx.arc(0,hy,h*.28,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.save();ctx.beginPath();ctx.arc(0,hy,h*.28,0,Math.PI*2);ctx.clip();
  ctx.fillStyle=BAND[p.side];ctx.fillRect(-h*.30,hy-h*.17,h*.60,h*.13);
  ctx.strokeStyle=INK;ctx.lineWidth=h*.045;ctx.beginPath();ctx.moveTo(-h*.30,hy-h*.04);ctx.lineTo(h*.30,hy-h*.04);ctx.stroke();
  ctx.restore();
  // headband tails toward the facing side (XOR back: the far player faces us)
  const dir=back?1:-1;
  ctx.fillStyle=BAND[p.side];ctx.strokeStyle=INK;ctx.lineWidth=h*.04;
  ctx.beginPath();ctx.moveTo(dir*h*.25,hy-h*.11);ctx.lineTo(dir*h*.42,hy-h*.17);ctx.lineTo(dir*h*.37,hy-h*.01);ctx.closePath();ctx.fill();ctx.stroke();
  if(!back){ // front face for the far player
    ctx.fillStyle=INK;ctx.beginPath();ctx.ellipse(-h*.09,hy+h*.02,h*.035,h*.05,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(h*.09,hy+h*.02,h*.035,h*.05,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=INK;ctx.lineWidth=h*.03;ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(-h*.08,hy+h*.12);ctx.quadraticCurveTo(0,hy+h*.17,h*.08,hy+h*.12);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-h*.17,hy-h*.03);ctx.lineTo(-h*.03,hy-h*.06);ctx.moveTo(h*.17,hy-h*.03);ctx.lineTo(h*.03,hy-h*.06);ctx.stroke();
  }
  // off-hand
  const ox=(p.hand?-1:1)*h*.21,oy=-h*.56,od=p.hand?-1:1;
  const oex=ox+od*h*.13,oey=oy+h*.19;
  ctx.strokeStyle=INK;ctx.lineWidth=h*.075;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(oex,oey);ctx.stroke();
  ctx.strokeStyle=TONE[p.side];ctx.lineWidth=h*.04;ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(oex,oey);ctx.stroke();
  ctx.fillStyle=TONE[p.side];ctx.strokeStyle=INK;ctx.lineWidth=h*.045;ctx.beginPath();ctx.arc(oex,oey,h*.075,0,Math.PI*2);ctx.fill();ctx.stroke();
  // racket arm: follows the real wrist; falls back to the swing pose when the hand is lost
  const sx=(p.hand?1:-1)*h*.21,sy=-h*.56;
  let ax:number,ay:number;
  if(p.wrist){
    const dx=(mirror?-p.wrist[0]:p.wrist[0]),dy=p.wrist[1];
    ax=sx+Math.max(-1.25,Math.min(1.25,dx))*h*.36;
    ay=sy+Math.max(-1.25,Math.min(1.15,dy))*h*.36;
  }else{
    ax=sx+Math.cos(p.arm)*h*.42*(p.hand?1:-1);
    ay=sy+Math.sin(p.arm)*h*.42;
  }
  const ang=Math.atan2(ay-sy,ax-sx)||0;
  ctx.strokeStyle=INK;ctx.lineWidth=h*.078;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ax,ay);ctx.stroke();
  ctx.strokeStyle=TONE[p.side];ctx.lineWidth=h*.042;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ax,ay);ctx.stroke();
  ctx.fillStyle=TONE[p.side];ctx.strokeStyle=INK;ctx.lineWidth=h*.045;ctx.beginPath();ctx.arc(ax,ay,h*.078,0,Math.PI*2);ctx.fill();ctx.stroke();
  // racket: along the arm, oval head; strings
  const ex=ax+Math.cos(ang)*h*.34,ey=ay+Math.sin(ang)*h*.34;
  ctx.strokeStyle=INK;ctx.lineWidth=h*.035;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ex,ey);ctx.stroke();
  ctx.save();ctx.translate(ex,ey);ctx.rotate(ang);
  ctx.fillStyle="rgba(255,255,255,.92)";ctx.strokeStyle=INK;ctx.lineWidth=h*.035;
  ctx.beginPath();ctx.ellipse(0,0,h*.14,h*.105,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="rgba(20,24,58,.35)";ctx.lineWidth=h*.012;
  for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(-h*.11,k*h*.032);ctx.lineTo(h*.11,k*h*.032);ctx.stroke()}
  for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(k*h*.04,-h*.085);ctx.lineTo(k*h*.04,h*.085);ctx.stroke()}
  ctx.restore();
  if(p.hit>0){
    ctx.globalAlpha=alpha*Math.min(1,p.hit);ctx.strokeStyle="#FFC61A";ctx.lineWidth=h*.05;
    ctx.beginPath();ctx.arc(ex,ey,h*(.16+.10*(1-p.hit)),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=alpha;
  }
  ctx.restore();
  ctx.restore();
}
export function drawNearPlayer(ctx:CanvasRenderingContext2D,L:Layout,p:RigPose,z:number,x:number){
  const at=nearPoint(L,z,x,0),h=(L.portrait?L.H*.31:L.H*.40);
  ctx.save();ctx.translate(at.x,at.y);ctx.scale(at.s,at.s);
  rig(ctx,h,p,true,false);
  ctx.restore();
}
export function drawFarPlayer(ctx:CanvasRenderingContext2D,L:Layout,p:RigPose,z:number,x:number){
  const at=farPoint(L,z,x,0),h=(L.portrait?L.H*.15:L.H*.23);
  ctx.save();ctx.translate(at.x,at.y);ctx.scale(at.s,at.s);
  rig(ctx,h,p,false,true);
  ctx.restore();
}

// ---------- the red target bubble (the place and time to hit) ----------
export interface TargetMark{x:number;z:number;y:number} // near player's own coordinates
export function drawTarget(ctx:CanvasRenderingContext2D,L:Layout,t:TargetMark,progress:number,now:number){
  const p=nearPoint(L,t.z,t.x,0),pc=nearPoint(L,t.z,t.x,Math.max(.45,t.y));
  const base=Math.max(18,(L.portrait?L.W*.095:L.H*.15)*p.s);
  const rx=base,ry=base*.44,prog=Math.max(0,Math.min(1,progress));
  ctx.save();
  // dashed guide from the ground bubble up to the contact point
  if(t.y>.6){
    ctx.strokeStyle="rgba(255,59,59,.38)";ctx.lineWidth=Math.max(2,L.W*.003);ctx.setLineDash([5,7]);
    line(ctx,p,pc);ctx.setLineDash([]);
  }
  // red disc on the court (where the character must stand)
  ctx.fillStyle="rgba(255,59,59,.32)";ctx.beginPath();ctx.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="rgba(255,59,59,.95)";ctx.lineWidth=Math.max(3,L.W*.006);
  ctx.beginPath();ctx.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,.95)";ctx.lineWidth=Math.max(2,L.W*.004);
  ctx.beginPath();ctx.ellipse(p.x,p.y,rx*.68,ry*.68,0,0,Math.PI*2);ctx.stroke();
  const pulse=prog>.82?1+Math.sin(now/70)*.05:1;
  if(t.y>.6){
    // the red bubble in the air at the contact height + the shrinking timing ring around it (the user's reference)
    const cr=Math.max(12,base*.62)*pulse;
    ctx.fillStyle="rgba(255,59,59,.30)";ctx.beginPath();ctx.arc(pc.x,pc.y,cr,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="rgba(255,59,59,.98)";ctx.lineWidth=Math.max(3,L.W*.006);
    ctx.beginPath();ctx.arc(pc.x,pc.y,cr,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,.92)";ctx.lineWidth=Math.max(1.5,L.W*.0035);
    ctx.beginPath();ctx.arc(pc.x,pc.y,cr*.58,0,Math.PI*2);ctx.stroke();
    const rr=cr*(2.15-1.15*prog);
    ctx.strokeStyle="#FF3B3B";ctx.lineWidth=Math.max(4,L.W*.008);
    ctx.beginPath();ctx.arc(pc.x,pc.y,rr,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,.78)";ctx.lineWidth=Math.max(1.5,L.W*.003);
    ctx.beginPath();ctx.arc(pc.x,pc.y,rr,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.95)";ctx.beginPath();ctx.arc(pc.x,pc.y,cr*.22,0,Math.PI*2);ctx.fill();
  }else{
    // a ground-level contact: the timing ring closes on the disc
    const rr=rx*(1.85-.85*prog)*pulse;
    ctx.strokeStyle="#FF3B3B";ctx.lineWidth=Math.max(4,L.W*.009);
    ctx.beginPath();ctx.ellipse(p.x,p.y,rr,rr*.44,0,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,.75)";ctx.lineWidth=Math.max(1.5,L.W*.003);
    ctx.beginPath();ctx.ellipse(p.x,p.y,rr,rr*.44,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.95)";ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,L.W*.006),0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

// ---------- shuttle ----------
export interface ShuttleTrailPoint{x:number;z:number;t:number}
export function drawShuttle(ctx:CanvasRenderingContext2D,L:Layout,view:Side,s:Shuttle,trail:ShuttleTrailPoint[],now:number){
  const g=shuttlePoint(L,view,s.z,s.x,0),p=shuttlePoint(L,view,s.z,s.x,Math.max(0,s.y)),sc=p.s;
  const size=Math.max(6,L.W*.014)*sc;
  const k=Math.max(0,1-s.y/7);
  ctx.globalAlpha=.20+.20*k;ctx.fillStyle="#000";
  ctx.beginPath();ctx.ellipse(g.x,g.y,size*(1.2+.7*k),size*(.35+.2*k),0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
  for(let i=0;i<trail.length;i++){
    const q=trail[i],a=(now-q.t)/280;
    if(a<0||a>1)continue;
    const qp=shuttlePoint(L,view,q.z,q.x,0);
    ctx.globalAlpha=(1-a)*.35;ctx.fillStyle="#fff";
    ctx.beginPath();ctx.arc(qp.x,qp.y,size*(1-a)*.45,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  const q=shuttlePoint(L,view,s.z+.02*s.vz,s.x+.02*s.vx,Math.max(0,s.y+.02*s.vy));
  const ang=Math.atan2(q.y-p.y,q.x-p.x)||0;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ang);
  ctx.fillStyle="rgba(255,255,255,.92)";ctx.strokeStyle=INK;ctx.lineWidth=Math.max(1,size*.16);
  for(const a of [-.42,0,.42]){
    ctx.save();ctx.rotate(a);ctx.beginPath();ctx.moveTo(-size*.2,0);ctx.lineTo(-size*1.55,0);ctx.stroke();ctx.restore();
  }
  ctx.beginPath();ctx.moveTo(-size*.2,0);ctx.quadraticCurveTo(-size*.9,-size*.62,-size*1.65,0);ctx.quadraticCurveTo(-size*.9,size*.62,-size*.2,0);ctx.fill();
  ctx.fillStyle="#F7F5F2";ctx.beginPath();ctx.arc(size*.15,0,size*.42,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle="#FFC61A";ctx.beginPath();ctx.arc(size*.15,0,size*.22,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
// a landing marker: white ring in, red X out (absolute court coords from the near view)
export function drawLanding(ctx:CanvasRenderingContext2D,L:Layout,view:Side,z:number,x:number,ok:boolean,age:number){
  const p=shuttlePoint(L,view,z,x,0),r=Math.max(10,L.W*.03)*(1+age*.6);
  ctx.save();ctx.globalAlpha=Math.max(0,1-age*1.6);
  ctx.strokeStyle=ok?"#fff":"#FF3B3B";ctx.lineWidth=Math.max(2,L.W*.005);
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
  if(!ok){ctx.beginPath();ctx.moveTo(p.x-r*.55,p.y-r*.55);ctx.lineTo(p.x+r*.55,p.y+r*.55);ctx.moveTo(p.x+r*.55,p.y-r*.55);ctx.lineTo(p.x-r*.55,p.y+r*.55);ctx.stroke()}
  ctx.restore();
}
export const sideLabel=(s:Side)=>s===0?"P1":"P2";
