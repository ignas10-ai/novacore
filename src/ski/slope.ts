// Slidinėjimas – the downhill canvas (issue #23). A tilted top-down view: the ribbon recedes to a vanishing point,
// the camera sits ~14 m behind the skier and follows the lateral position with a little lag, so carving reads.
// Static sky / mountains are painted once per resize; the ribbon, walls, gates, trees, finish banner and the
// skier are drawn every frame. World units are metres (x across the slope, z down it), screen units are CSS px.
import {COURSE_M,HALF_W,SOFT_W,centerAt,type Course,type Skier} from "./logic.ts";
import {LOOKS,type Look} from "../sprint/runner.ts";
import {t as tr} from "../i18n/i18n.ts";

export interface Layout{
  W:number;H:number;dpr:number;portrait:boolean;
  horizon:number;bottom:number;ppm:number;camBack:number;view:number;
}
export function layout(W:number,H:number,dpr:number):Layout{
  const portrait=H>W;
  return {
    W,H,dpr,portrait,
    horizon:H*(portrait?.155:.17),
    bottom:H*(portrait?.88:1.02),
    ppm:portrait?Math.min(W*.12,H*.07):Math.min(W*.075,H*.12),
    camBack:14,view:90,
  };
}

let bg:HTMLCanvasElement|null=null;
let bgW=0,bgH=0;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const C={skyTop:"#79BCFF",skyBot:"#E8F4FF",sun:"#FFF4BE",mtn:["#7E9BC9","#A9C2E1"],mtnSnow:"#F4FAFF",snow:"#EAF3FF",course:"#FAFDFF",
  wall:"#D3E5F8",wallEdge:"#8FB7DF",ink:"#14183A",line:"#B9D6F1",gateRed:"#FF3B3B",gateBlue:"#2F6BFF",pine:"#2F7D5B",pineDark:"#246348"};

// seeded mountain silhouettes, cached per size
let seed=11;
const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
function build(L:Layout){
  if(bg&&bgW===L.W&&bgH===L.H)return;
  bgW=L.W;bgH=L.H;seed=11;
  const c=document.createElement("canvas");
  c.width=Math.round(L.W*L.dpr);c.height=Math.round(L.H*L.dpr);
  const x=c.getContext("2d")!;x.scale(L.dpr,L.dpr);
  const g=x.createLinearGradient(0,0,0,L.horizon+2);g.addColorStop(0,C.skyTop);g.addColorStop(1,C.skyBot);
  x.fillStyle=g;x.fillRect(0,0,L.W,L.horizon+2);
  // sun + a soft halo
  x.fillStyle="rgba(255,244,190,.45)";x.beginPath();x.arc(L.W*.76,L.horizon*.42,L.W*.13,0,Math.PI*2);x.fill();
  x.fillStyle=C.sun;x.beginPath();x.arc(L.W*.76,L.horizon*.42,L.W*.07,0,Math.PI*2);x.fill();
  // two mountain ranges
  [0,1].forEach(k=>{
    const base=L.horizon+(k?0:-L.horizon*.02), h=L.horizon*(k?.5:.7);
    x.fillStyle=C.mtn[k];
    x.beginPath();x.moveTo(0,base);
    for(let px=0;px<=L.W+40;px+=L.W/9){
      const y=base-h*(.35+rnd()*.65);
      x.lineTo(px,y);
      x.lineTo(px+L.W/18,base-h*(.2+rnd()*.35));
    }
    x.lineTo(L.W,base);x.closePath();x.fill();
    // snow caps
    x.fillStyle=C.mtnSnow;
    for(let px=L.W/18;px<L.W;px+=L.W/9){
      const y=base-h*(.35+rnd()*.45);
      x.beginPath();x.moveTo(px-L.W/40,y+h*.16);x.lineTo(px,y);x.lineTo(px+L.W/40,y+h*.16);x.closePath();x.fill();
    }
  });
  // snow haze at the horizon
  const haze=x.createLinearGradient(0,L.horizon-L.horizon*.12,0,L.horizon+2);
  haze.addColorStop(0,"rgba(234,243,255,0)");haze.addColorStop(1,C.snow);
  x.fillStyle=haze;x.fillRect(0,L.horizon-L.horizon*.12,L.W,L.horizon*.12+2);
  x.fillStyle=C.snow;x.fillRect(0,L.horizon,L.W,L.H-L.horizon);
  bg=c;
}
export function buildSlope(L:Layout){build(L)}

interface P{x:number;y:number;s:number}
function proj(L:Layout,x:number,z:number,camX:number,camZ:number):P{
  const f=clamp((z-camZ)/L.view,0,1);
  const s=.28+.72*(1-f);
  return {x:L.W/2+(x-camX)*L.ppm*s,y:L.bottom-(L.bottom-L.horizon)*Math.pow(f,.92),s};
}

export interface Motion{lean:number;brake:number;push:number;crash:boolean}
// `push` = 0..1, 1 right after a pole push (gloves dive down), 0 at rest.
export function drawSlope(ctx:CanvasRenderingContext2D,L:Layout,course:Course,skier:Skier,camX:number,t:number,look:Look,motion:Motion){
  build(L);
  const camZ=skier.z-L.camBack;
  ctx.drawImage(bg!,0,0,L.W,L.H);
  // off-piste snow texture: a few soft drifts
  ctx.fillStyle="rgba(255,255,255,.35)";
  for(let i=0;i<5;i++){const px=(i*97+L.W*.13)%L.W,py=L.horizon+(i*53)%Math.max(1,L.bottom-L.horizon);ctx.beginPath();ctx.ellipse(px,py,L.W*.16,L.H*.018,0,0,Math.PI*2);ctx.fill()}
  // ---- the course ribbon ----
  const N=48,z0=camZ-2,z1=camZ+L.view;
  const Lp:P[]=[],Rp:P[]=[];
  for(let i=0;i<=N;i++){
    const z=z0+(z1-z0)*i/N,cx=centerAt(course,z);
    Lp.push(proj(L,cx-HALF_W,z,camX,camZ));
    Rp.push(proj(L,cx+HALF_W,z,camX,camZ));
  }
  const grad=ctx.createLinearGradient(0,L.horizon,0,L.bottom);
  grad.addColorStop(0,"#E4F1FF");grad.addColorStop(.35,C.course);grad.addColorStop(1,"#FFFFFF");
  ctx.beginPath();ctx.moveTo(Lp[0].x,Lp[0].y);
  for(const p of Lp)ctx.lineTo(p.x,p.y);
  for(let i=Rp.length-1;i>=0;i--)ctx.lineTo(Rp[i].x,Rp[i].y);
  ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  // groomed centre line: dashed, subtle
  ctx.strokeStyle="rgba(143,183,223,.5)";ctx.lineWidth=Math.max(1.5,L.ppm*.055);ctx.setLineDash([Math.max(6,L.ppm*.35),Math.max(6,L.ppm*.42)]);
  ctx.beginPath();
  for(let i=0;i<=N;i++){const z=z0+(z1-z0)*i/N,p=proj(L,centerAt(course,z),z,camX,camZ);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}
  ctx.stroke();ctx.setLineDash([]);
  // ---- snow walls outside the boundary ----
  for(const side of [-1,1]){
    const inner:P[]=[],outer:P[]=[];
    for(let i=0;i<=N;i++){
      const z=z0+(z1-z0)*i/N,cx=centerAt(course,z);
      inner.push(proj(L,cx+side*HALF_W,z,camX,camZ));
      outer.push(proj(L,cx+side*(HALF_W+SOFT_W),z,camX,camZ));
    }
    ctx.beginPath();ctx.moveTo(inner[0].x,inner[0].y);
    for(const p of inner)ctx.lineTo(p.x,p.y);
    for(let i=outer.length-1;i>=0;i--)ctx.lineTo(outer[i].x,outer[i].y);
    ctx.closePath();ctx.fillStyle=C.wall;ctx.fill();
    // outer lip
    ctx.strokeStyle=C.wallEdge;ctx.lineCap="round";
    for(let i=0;i<N;i++){ctx.lineWidth=Math.max(1.5,L.ppm*outer[i].s*.09);ctx.beginPath();ctx.moveTo(outer[i].x,outer[i].y);ctx.lineTo(outer[i+1].x,outer[i+1].y);ctx.stroke()}
    // boundary line (the blue/red line you must stay inside)
    for(let i=0;i<N;i++){
      const a=inner[i],b=inner[i+1];
      ctx.strokeStyle=i%2?"#2F6BFF":"#FF3B3B";ctx.lineWidth=Math.max(1.8,L.ppm*a.s*.08);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
  }
  // ---- trees outside the course (behind the gates) ----
  for(const tr0 of course.trees){
    if(tr0.z<camZ-2||tr0.z>camZ+L.view)continue;
    const p=proj(L,tr0.x,tr0.z,camX,camZ),h=L.ppm*p.s*3.1*tr0.s;
    if(p.x<-h||p.x>L.W+h)continue;
    ctx.fillStyle="rgba(20,24,58,.14)";ctx.beginPath();ctx.ellipse(p.x,p.y,h*.32,h*.05,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#6B4A2F";ctx.fillRect(p.x-h*.045,p.y-h*.28,h*.09,h*.28);
    for(let k=0;k<3;k++){
      const y=p.y-h*(.22+k*.24),w=h*(.5-k*.12);
      ctx.fillStyle=k?C.pine:C.pineDark;ctx.beginPath();ctx.moveTo(p.x,y-h*.34);ctx.lineTo(p.x+w,y+h*.06);ctx.lineTo(p.x-w,y+h*.06);ctx.closePath();ctx.fill();
      ctx.fillStyle="rgba(255,255,255,.85)";ctx.beginPath();ctx.moveTo(p.x-w*.35,y+h*.04);ctx.lineTo(p.x,y-h*.2);ctx.lineTo(p.x+w*.3,y+h*.02);ctx.closePath();ctx.fill();
    }
  }
  // ---- start + finish ----
  drawLine(ctx,L,course,0,camX,camZ,"#2F6BFF");
  drawFinish(ctx,L,course,camX,camZ,t);
  // ---- gates ----
  for(const g of course.gates){
    if(g.z<camZ-6||g.z>camZ+L.view)continue;
    const res=skier.res[g.i];
    const tone=g.i%2?C.gateRed:C.gateBlue;
    const base=L.ppm*proj(L,g.x,g.z,camX,camZ).s;
    const poleH=base*1.85;
    for(const side of [-1,1]){
      const p=proj(L,g.x+side*g.half,g.z,camX,camZ);
      if(res==="hit"){
        // fallen flag lying on the snow: a short tilted pole + flag patch
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(side*.95);
        ctx.strokeStyle="rgba(20,24,58,.5)";ctx.lineWidth=Math.max(2,poleH*.045);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-poleH*.38);ctx.stroke();
        ctx.fillStyle="rgba(20,24,58,.22)";ctx.beginPath();ctx.ellipse(0,2,poleH*.2,poleH*.045,0,0,Math.PI*2);ctx.fill();
        ctx.restore();continue;
      }
      const alpha=res==="ok"?.42:res==="miss"?.3:1;
      ctx.globalAlpha=alpha;
      // pole: white with team-coloured bands
      ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(2,poleH*.055);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-poleH);ctx.stroke();
      ctx.strokeStyle=tone;ctx.lineWidth=Math.max(2,poleH*.055);
      for(let k=0;k<3;k++){const y0=p.y-poleH*(.18+k*.25);ctx.beginPath();ctx.moveTo(p.x,y0);ctx.lineTo(p.x,y0-poleH*.1);ctx.stroke()}
      // flag at the top, pointing into the gate
      const fx=p.x-side*poleH*.52,fy=p.y-poleH*1.02;
      ctx.fillStyle=tone;ctx.beginPath();ctx.moveTo(p.x,p.y-poleH);ctx.lineTo(fx,fy);ctx.lineTo(fx,fy+poleH*.27);ctx.lineTo(p.x,p.y-poleH*.78);ctx.closePath();ctx.fill();
      ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(1,poleH*.018);ctx.stroke();
      ctx.globalAlpha=1;
    }
    // a soft yellow target ring on the snow while the gate is ahead
    if(res==null&&g.z-skier.z<34&&g.z>skier.z){
      const p=proj(L,g.x,g.z,camX,camZ),r=L.ppm*p.s*.32*(1+.08*Math.sin(t*7));
      ctx.strokeStyle="rgba(255,198,26,.75)";ctx.lineWidth=Math.max(1.5,L.ppm*p.s*.035);ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*.3,0,0,Math.PI*2);ctx.stroke();
    }
  }
  drawSkier(ctx,L,course,skier,camX,camZ,look,motion,t);
  // speed streaks at the screen edges
  if(skier.v>14&&!motion.crash){
    const a=Math.min(.45,(skier.v-14)/12*.45);
    ctx.strokeStyle=`rgba(255,255,255,${a})`;ctx.lineWidth=2;
    for(let k=0;k<7;k++){
      const y=((t*900+k*137)%L.H),x=k%2?L.W*(.04+.02*Math.sin(k+t)):L.W*(.94+.02*Math.cos(k+t));
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(k%2?18:-18),y+28);ctx.stroke();
    }
  }
}
function drawLine(ctx:CanvasRenderingContext2D,L:Layout,course:Course,z:number,camX:number,camZ:number,color:string){
  const a=proj(L,centerAt(course,z)-HALF_W,z,camX,camZ),b=proj(L,centerAt(course,z)+HALF_W,z,camX,camZ);
  ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,a.s*L.ppm*.09);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
}
function drawFinish(ctx:CanvasRenderingContext2D,L:Layout,course:Course,camX:number,camZ:number,t:number){
  const z=COURSE_M;
  if(z<camZ-4||z>camZ+L.view)return;
  const s=proj(L,centerAt(course,z),z,camX,camZ).s,ppm=L.ppm*s;
  // checkered band across the snow
  const a=proj(L,centerAt(course,z)-HALF_W,z,camX,camZ),b=proj(L,centerAt(course,z)+HALF_W,z,camX,camZ);
  const cells=12,cw=(b.x-a.x)/cells,ch=Math.max(3,ppm*.55);
  for(let i=0;i<cells;i++){ctx.fillStyle=i%2?C.ink:"#fff";ctx.fillRect(a.x+i*cw,a.y-ch*.5,cw+.5,ch*.5)}
  // posts + banner
  const yTop=a.y-ppm*2.5;
  ctx.strokeStyle="#E9ECF5";ctx.lineWidth=Math.max(3,ppm*.09);
  for(const p of [a,b]){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,yTop);ctx.stroke()}
  const w=Math.min(L.W*.72,Math.abs(b.x-a.x)* .95),cx=(a.x+b.x)/2;
  ctx.fillStyle=C.ink;ctx.beginPath();ctx.roundRect(cx-w/2,yTop-ppm*.55,w,ppm*.62,Math.max(4,ppm*.12));ctx.fill();
  ctx.fillStyle="#FFC61A";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font=`400 ${Math.max(9,ppm*.34)}px "Titan One",Impact,sans-serif`;
  ctx.fillText(tr("sk.finishBanner"),cx,yTop-ppm*.23,w*.9);
  // finish line glow pulse
  ctx.globalAlpha=.18+.1*Math.sin(t*3);ctx.fillStyle="#FFC61A";ctx.fillRect(a.x,a.y-ch*.7,b.x-a.x,ch*1.4);ctx.globalAlpha=1;
}

// ---------- the skier (back view) ----------
function leg(ctx:CanvasRenderingContext2D,x0:number,y0:number,x1:number,y1:number,w:number,color:string){
  ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
}
function drawSkier(ctx:CanvasRenderingContext2D,L:Layout,course:Course,s:Skier,camX:number,camZ:number,look:Look,m:Motion,t:number){
  const p=proj(L,s.x,s.z,camX,camZ),h=L.ppm*p.s*1.85;
  if(p.x<-h*2||p.x>L.W+h*2)return;
  ctx.save();ctx.translate(p.x,p.y);
  // shadow on the snow
  ctx.fillStyle="rgba(20,24,58,.16)";ctx.beginPath();ctx.ellipse(0,2,h*.34,h*.055,0,0,Math.PI*2);ctx.fill();
  // snow spray behind the skis
  const spray=m.crash?1:Math.min(1,Math.max(0,(s.v-10)/14)+m.brake*.5);
  if(spray>.08){
    ctx.fillStyle="rgba(255,255,255,.72)";
    for(let k=0;k<10;k++){
      const ph=(t*3.1+k*.37)%1,side=k%2?1:-1;
      ctx.globalAlpha=spray*.55*(1-ph);
      ctx.beginPath();ctx.ellipse(side*h*(.2+ph*.34),-h*.03-ph*h*.1,h*(.03+ph*.05),h*(.018+ph*.03),0,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  if(m.crash){
    // tumbling: the whole body tips over to one side
    ctx.rotate(.95);ctx.translate(0,-h*.06);
  }
  // skis (tail at the snow, tips up the slope), splayed when braking
  const splay=m.brake*.28;
  for(const side of [-1,1]){
    ctx.save();ctx.translate(side*h*.15,0);ctx.rotate(side*splay+m.lean*.06);
    const L0=h*1.03,w0=h*.075;
    ctx.beginPath();ctx.moveTo(-w0*.5,0);ctx.lineTo(-w0*.42,-L0*.92);
    ctx.quadraticCurveTo(0,-L0-h*.07,w0*.42,-L0*.92);ctx.lineTo(w0*.5,0);ctx.closePath();
    ctx.fillStyle=look.dark;ctx.fill();ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(1.5,h*.02);ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,.6)";ctx.lineWidth=Math.max(1,h*.014);ctx.beginPath();ctx.moveTo(0,-h*.08);ctx.lineTo(0,-L0*.9);ctx.stroke();
    ctx.restore();
  }
  const hip=-h*.4;
  // legs (navy, from hip to the boots)
  leg(ctx,-h*.075,hip,-h*.095,-h*.14,h*.085,C.ink);
  leg(ctx,h*.075,hip,h*.095,-h*.14,h*.085,C.ink);
  ctx.fillStyle="#fff";ctx.beginPath();ctx.roundRect(-h*.13,-h*.15,h*.1,h*.06,h*.02);ctx.fill();
  ctx.beginPath();ctx.roundRect(h*.03,-h*.15,h*.1,h*.06,h*.02);ctx.fill();
  ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(1.2,h*.014);ctx.strokeRect(-h*.13,-h*.15,h*.1,h*.06);ctx.strokeRect(h*.03,-h*.15,h*.1,h*.06);
  // upper body: rotate around the hip with the lean
  ctx.save();ctx.translate(0,hip);ctx.rotate(m.lean*.17+(m.brake>.3?-.09:0));
  // torso
  ctx.fillStyle=look.body;ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(1.5,h*.022);
  ctx.beginPath();ctx.roundRect(-h*.135,-h*.235,h*.27,h*.3,h*.09);ctx.fill();ctx.stroke();
  // shoulder/arm joints + gloves + poles
  const pull=m.push;
  for(const side of [-1,1]){
    const gx=side*h*(.21+.055*pull),gy=-h*(.16-.1*pull);
    leg(ctx,side*h*.11,-h*.2,gx,gy,h*.06,look.dark); // arm
    // glove
    ctx.beginPath();ctx.arc(gx,gy,h*.055,0,Math.PI*2);ctx.fillStyle=look.body;ctx.fill();ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(1,h*.014);ctx.stroke();
    // pole: from the glove to the snow out to the side
    const tx=side*h*(.46+.16*pull),ty=h*.03;
    ctx.strokeStyle="#FFC61A";ctx.lineWidth=Math.max(1,h*.013);ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(tx,ty);ctx.stroke();
    ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(.8,h*.006);ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(tx,ty);ctx.stroke();
  }
  // head + headband (back view)
  const hy=-h*.31;
  ctx.beginPath();ctx.arc(0,hy,h*.145,0,Math.PI*2);ctx.fillStyle=look.body;ctx.fill();ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(1.5,h*.022);ctx.stroke();
  ctx.save();ctx.beginPath();ctx.arc(0,hy,h*.145,0,Math.PI*2);ctx.clip();
  ctx.fillStyle=look.band;ctx.fillRect(-h*.15,hy-h*.06,h*.3,h*.055);
  ctx.fillStyle="rgba(255,255,255,.4)";ctx.beginPath();ctx.ellipse(-h*.05,hy-h*.09,h*.045,h*.025,-.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
  // headband knot tails on the side
  ctx.fillStyle=look.band;ctx.strokeStyle=C.ink;ctx.lineWidth=Math.max(1,h*.014);
  ctx.beginPath();ctx.moveTo(h*.1,hy-h*.03);ctx.lineTo(h*.22,hy-h*.08+Math.sin(t*6)*h*.012);ctx.lineTo(h*.18,hy+h*.01);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.restore();
  ctx.restore();
}
