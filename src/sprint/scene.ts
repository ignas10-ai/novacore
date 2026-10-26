// Side-view stadium for the sprint: sky, stands with a blurred crowd, ad boards, two-lane track, markers, finish.
// Everything static is painted ONCE per resize into offscreen tiles; a frame is a few drawImage blits + the moving bits.
// World x is in metres; sx(m) = (m - cam) * ppm. Parallax layers scroll at a fraction of the track speed.
import {RACE_M} from "./speed.ts";
import {t as tr} from "../i18n/i18n.ts";

export interface Layout{W:number;H:number;dpr:number;standsTop:number;boardsTop:number;boardsH:number;trackTop:number;trackBot:number;
  lane:number[];charH:number[];ppm:number;portrait:boolean}
export function layout(W:number,H:number,dpr:number):Layout{
  const portrait=H>W;
  // portrait: HUD on top, track in the middle, grass at the bottom carries the camera preview
  const standsTop=H*(portrait?.15:.1), boardsTop=H*(portrait?.355:.43), boardsH=Math.max(22,H*(portrait?.032:.06));
  const trackTop=boardsTop+boardsH, trackBot=H*(portrait?.76:.985), th=trackBot-trackTop;
  const c=portrait?Math.min(W*.44,th*.62):H*.3;
  return {W,H,dpr,standsTop,boardsTop,boardsH,trackTop,trackBot,lane:[trackTop+th*.43,trackTop+th*.88],charH:[c*.9,c],ppm:c/1.9,portrait};
}
// palette (scene only; UI colours stay in main.css tokens)
const C={skyTop:"#A9D3FF",skyBot:"#E6F2FF",roof:"#1E2552",stand:["#2B3470","#323C7E","#28306A"],track:"#D9604A",trackDark:"#C24F3C",
  line:"rgba(255,255,255,.92)",grass:"#7CC36E",grassDark:"#6BB15F",ink:"#14183A",crowd:["#FF3B3B","#2F6BFF","#FFC61A","#FFFFFF","#FF4F93","#12B886","#1FB0EA","#F4C3A0","#A86A45"]};
const boardSet=(a:string,b:string):[string,string,string][]=>[["#14183A","#FFFFFF","NOVACORE"],["#FF3B3B","#FFFFFF",a],["#FFC61A","#14183A","NOVACORE"],["#2F6BFF","#FFFFFF",b]];
export const SKEW=.28; // lines across the lanes lean back with depth (x shift per px of track depth)

let L:Layout, skyG:CanvasGradient, trackG:CanvasGradient, stands:HTMLCanvasElement, boards:HTMLCanvasElement, grass:HTMLCanvasElement;
const off=(w:number,h:number)=>{const c=document.createElement("canvas");c.width=Math.ceil(w*L.dpr);c.height=Math.ceil(h*L.dpr);const x=c.getContext("2d")!;x.scale(L.dpr,L.dpr);return [c,x] as const};
// seeded random so the crowd looks the same every race
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;

// boardTexts = the two ad board texts (the long jump passes its own)
export function build(ctx:CanvasRenderingContext2D,l:Layout,boardTexts?:[string,string]){
  L=l;seed=7;
  const BOARDS=boardSet(...(boardTexts??[tr("sp.board"),tr("sp.boardRun")]));
  skyG=ctx.createLinearGradient(0,0,0,L.boardsTop);skyG.addColorStop(0,C.skyTop);skyG.addColorStop(1,C.skyBot);
  trackG=ctx.createLinearGradient(0,L.trackTop,0,L.trackBot);trackG.addColorStop(0,C.trackDark);trackG.addColorStop(.3,C.track);trackG.addColorStop(1,"#E2735C");
  // stands: stepped tiers, crowd heads + shirts, soft blur (depth of field), roof edge with floodlights
  const sh=L.boardsTop-L.standsTop, tw=1200;
  let x:CanvasRenderingContext2D;[stands,x]=off(tw,sh);
  const tiers=L.portrait?7:6;
  for(let i=0;i<tiers;i++){x.fillStyle=C.stand[i%3];x.fillRect(0,sh*(.16+.84*i/tiers),tw,sh*.84/tiers+1)}
  const blur="filter" in x;
  if(blur)x.filter=`blur(${Math.max(1,sh/150)}px)`;
  for(let i=0;i<tiers;i++){
    const y=sh*(.16+.84*(i+.55)/tiers), r=sh*.84/tiers*.22*(.8+.4*i/tiers);
    for(let px=r*1.2;px<tw;px+=r*(2.1+rnd()*1.4)){
      if(rnd()<.12)continue; // empty seats
      const cy=y+(rnd()-.5)*r*.6;
      x.fillStyle=C.crowd[Math.floor(rnd()*7)];x.beginPath();x.ellipse(px,cy+r*1.5,r*1.15,r*1.1,0,0,Math.PI*2);x.fill();
      x.fillStyle=C.crowd[7+Math.floor(rnd()*2)];x.beginPath();x.arc(px,cy,r*.85,0,Math.PI*2);x.fill();
      if(rnd()<.07){x.fillStyle=rnd()<.5?"#FF3B3B":"#2F6BFF";x.fillRect(px-r*.2,cy-r*4,r*.25,r*3.2);x.fillRect(px,cy-r*4,r*2.2,r*1.4)} // flags
    }
  }
  if(blur)x.filter="none";
  x.fillStyle=C.roof;x.fillRect(0,0,tw,sh*.15);
  x.fillStyle="rgba(255,255,255,.08)";x.fillRect(0,sh*.15,tw,sh*.02);
  for(let px=60;px<tw;px+=200){x.fillStyle="#FFF6D8";x.beginPath();x.roundRect(px,sh*.05,46,sh*.05,4);x.fill()}
  // ad boards
  const bw=L.boardsH*7.2;
  [boards,x]=off(bw*BOARDS.length,L.boardsH);
  x.textAlign="center";x.textBaseline="middle";x.font=`400 ${Math.round(L.boardsH*.62)}px "Titan One",Impact,sans-serif`;
  BOARDS.forEach(([bg,fg,t],i)=>{x.fillStyle=bg;x.fillRect(i*bw,0,bw,L.boardsH);x.fillStyle=fg;x.fillText(t,i*bw+bw/2,L.boardsH*.54,bw*.84);x.fillStyle="rgba(0,0,0,.12)";x.fillRect(i*bw,L.boardsH*.86,bw,L.boardsH*.14)});
  // infield grass with mowing stripes
  const gh=Math.max(1,L.H-L.trackBot);
  [grass,x]=off(400,gh);
  x.fillStyle=C.grass;x.fillRect(0,0,400,gh);x.fillStyle=C.grassDark;x.fillRect(0,0,200,gh);
  x.fillStyle="rgba(20,24,58,.12)";x.fillRect(0,0,400,Math.min(6,gh));
}
// tile horizontally with parallax factor f
function strip(ctx:CanvasRenderingContext2D,img:HTMLCanvasElement,cam:number,f:number,y:number,h:number){
  const w=img.width/L.dpr;let x=-((cam*L.ppm*f)%w+w)%w;
  for(;x<L.W;x+=w)ctx.drawImage(img,x,y,w,h);
}
export const sx=(m:number,cam:number)=>(m-cam)*L.ppm;
// a line across both lanes at metre m, leaning with depth
function across(ctx:CanvasRenderingContext2D,m:number,cam:number,w:number){
  const x=sx(m,cam),th=L.trackBot-L.trackTop;
  ctx.beginPath();ctx.moveTo(x+th*SKEW,L.trackTop);ctx.lineTo(x+th*SKEW+w,L.trackTop);ctx.lineTo(x+w,L.trackBot);ctx.lineTo(x,L.trackBot);ctx.closePath();ctx.fill();
}
const laneLines=[0,.5,1];
// sky, stands, ad boards and the track surface (also the long jump backdrop, src/longjump)
export function drawSky(ctx:CanvasRenderingContext2D,cam:number){
  const {W,trackTop:tt,trackBot:tb}=L;
  ctx.fillStyle=skyG;ctx.fillRect(0,0,W,L.standsTop+2);
  strip(ctx,stands,cam,.22,L.standsTop,L.boardsTop-L.standsTop);
  strip(ctx,boards,cam,.62,L.boardsTop,L.boardsH);
  ctx.fillStyle=trackG;ctx.fillRect(0,tt,W,tb-tt);
}
export function drawBack(ctx:CanvasRenderingContext2D,cam:number){
  const {W,trackTop:tt,trackBot:tb}=L,th=tb-tt;
  drawSky(ctx,cam);
  ctx.fillStyle=C.line;
  for(const f of laneLines)ctx.fillRect(0,tt+th*(.04+f*.9)-1.5,W,3);
  // 10 m ticks on the near edge, painted metre numbers at 25/50/75, start + finish lines
  const m0=Math.floor(cam/10)*10,m1=cam+W/L.ppm+10;
  ctx.fillStyle="rgba(255,255,255,.7)";
  for(let m=Math.max(10,m0);m<m1&&m<RACE_M;m+=10)ctx.fillRect(sx(m,cam),tb-th*.06,3,th*.06);
  ctx.fillStyle=C.line;
  if(sx(0,cam)>-th)across(ctx,0,cam,5);
  ctx.textAlign="center";ctx.textBaseline="middle";
  for(const m of [25,50,75])if(m>=cam-8&&m<=m1){
    across(ctx,m,cam,3);
    for(let k=0;k<2;k++){ // number painted flat on the lane (squashed vertically)
      const y=tt+th*(k?.72:.26),x=sx(m,cam)+(tb-y)*SKEW+L.ppm*1.1;
      ctx.save();ctx.translate(x,y);ctx.transform(1,0,-SKEW,.42,0,0);ctx.fillStyle="rgba(255,255,255,.85)";ctx.font=`400 ${Math.round(th*.62)}px "Titan One",Impact,sans-serif`;ctx.fillText(String(m),0,0);ctx.restore();
    }
  }
  if(sx(RACE_M,cam)<W+th){ // checkered finish band
    const x=sx(RACE_M,cam),n=8,cell=th/n;
    for(let r=0;r<n;r++)for(let c=0;c<2;c++){
      ctx.fillStyle=(r+c)%2?C.ink:"#fff";
      const y=tt+r*cell,xo=x+(tb-y-cell)*SKEW+c*cell*.55;
      ctx.beginPath();ctx.moveTo(xo+cell*SKEW,y);ctx.lineTo(xo+cell*SKEW+cell*.55,y);ctx.lineTo(xo+cell*.55,y+cell);ctx.lineTo(xo,y+cell);ctx.closePath();ctx.fill();
    }
  }
  // lane numbers at the start
  if(sx(0,cam)>-th*2){
    ctx.fillStyle="rgba(255,255,255,.9)";
    for(let k=0;k<2;k++){const y=tt+th*(k?.74:.28),x=sx(-1.4,cam)+(tb-y)*SKEW;ctx.save();ctx.translate(x,y);ctx.transform(1,0,-SKEW,.5,0,0);ctx.font=`400 ${Math.round(th*.5)}px "Titan One",Impact,sans-serif`;ctx.fillText(String(k+1),0,0);ctx.restore()}
  }
}
// far finish post + banner (behind the runners)
export function drawFinishBack(ctx:CanvasRenderingContext2D,cam:number){
  const x=sx(RACE_M,cam)+(L.trackBot-L.trackTop)*SKEW;
  if(x<-80||x>L.W+80)return;
  const top=L.trackTop-L.charH[1]*1.45;
  ctx.fillStyle="#E9ECF5";ctx.fillRect(x-4,top,8,L.trackTop-top);
  ctx.fillStyle=C.ink;ctx.beginPath();ctx.roundRect(x-L.charH[1]*.9,top-L.charH[1]*.34,L.charH[1]*1.8,L.charH[1]*.34,8);ctx.fill();
  ctx.fillStyle="#FFC61A";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`400 ${Math.round(L.charH[1]*.2)}px "Titan One",Impact,sans-serif`;ctx.fillText(tr("sp.finishLine"),x,top-L.charH[1]*.165);
}
// tape across the lanes at chest height + the near post (in front of the runners); broken = time since the tape broke
export function drawFinishFront(ctx:CanvasRenderingContext2D,cam:number,broken:number){
  const xb=sx(RACE_M,cam),th=L.trackBot-L.trackTop;
  if(xb<-th-60||xb>L.W+th+60)return;
  const xf=xb+th*SKEW, yf=L.trackTop-L.charH[0]*.45, xn=xb, yn=L.trackBot-L.charH[1]*.5;
  ctx.strokeStyle="#FFC61A";ctx.lineWidth=Math.max(3,th*.018);ctx.lineCap="round";
  ctx.beginPath();
  if(broken<0){ctx.moveTo(xf,yf);ctx.quadraticCurveTo((xf+xn)/2+6,(yf+yn)/2,xn,yn)}
  else{ // two halves flutter down from the posts
    const s=Math.min(1,broken/.6),w=Math.sin(broken*14)*(1-s)*10;
    ctx.moveTo(xf,yf);ctx.quadraticCurveTo(xf+18+w,yf+th*.2*s,xf+26,yf+th*.35*s+8);
    ctx.moveTo(xn,yn);ctx.quadraticCurveTo(xn+20-w,yn-th*.12*s+6,xn+30,yn+th*.08*s);
  }
  ctx.stroke();
  ctx.fillStyle="#E9ECF5";ctx.fillRect(xn-5,yn-L.charH[1]*.25,10,L.trackBot+6-yn+L.charH[1]*.25);
  ctx.fillStyle=C.ink;ctx.fillRect(xn-5,yn-L.charH[1]*.25,10,8);
}
export function drawFront(ctx:CanvasRenderingContext2D,cam:number){
  strip(ctx,grass,cam,1.25,L.trackBot,L.H-L.trackBot);
}
