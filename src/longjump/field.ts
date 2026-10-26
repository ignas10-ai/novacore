// Šuolis į tolį – the side-view field on the canvas: the sprint stadium backdrop (scene.ts tiles: sky, stands, boards,
// grass) + a runway with the take-off zone, board and foul line, the sand pit with metre marks, the leader's mark,
// the landing print, the measuring tape and the judge's flag. World x in metres from the start; the foul line at
// LINE_M. Own zoom (ppm) so the whole jump fits; the backdrop tiles keep their own parallax.
import {SKEW,drawSky,drawFront,type Layout} from "../sprint/scene.ts";
import {LINE_M,ZONE_M,APPROACH_M,PIT_M} from "./logic.ts";
import {dec} from "../i18n/i18n.ts";

const GRASS="#7CC36E", GRASS_D="#71B964", TRACK="#D9604A", INK="#14183A", SAND="#F3D49C", SAND_D="#E2B978", EDGE="#B9844C", YEL="#FFC61A", RED="#FF3B3B";
const PIT_LEN=10;
export interface View{L:Layout;cam:number;ppm:number;gy:number;h:number}
// runway band (fractions of the track height): the jumper runs on gy; lines across lean with depth like the sprint
const R0=.46, R1=.94, P0=.36, P1=.99;
export function geom(L:Layout,ppm:number){
  const th=L.trackBot-L.trackTop;
  return {gy:L.trackTop+th*.71,h:Math.min(th*.66,ppm*2.6)};
}
const X=(V:View,m:number,y:number)=>(m-V.cam)*V.ppm+(V.L.trackBot-y)*SKEW;
// quad across the band between metres a..b and band fractions f0..f1
function quad(ctx:CanvasRenderingContext2D,V:View,a:number,b:number,f0:number,f1:number){
  const {trackTop:tt,trackBot:tb}=V.L,th=tb-tt,y0=tt+th*f0,y1=tt+th*f1;
  ctx.beginPath();ctx.moveTo(X(V,a,y0),y0);ctx.lineTo(X(V,b,y0),y0);ctx.lineTo(X(V,b,y1),y1);ctx.lineTo(X(V,a,y1),y1);ctx.closePath();
}
export interface FieldInfo{zone:number;leader:{d:number;label:string;tone:string}|null;mark:number|null;tape:number;tapeD:number;flag:""|"ok"|"foul";flagAt:number;t:number}
export function drawField(ctx:CanvasRenderingContext2D,V:View,F:FieldInfo){
  const {L}=V,{W,trackTop:tt,trackBot:tb}=L,th=tb-tt;
  drawSky(ctx,V.cam*V.ppm/L.ppm);
  // infield grass (mowing stripes every 2 m), the tartan runway strip on it from the start area to the pit
  ctx.fillStyle=GRASS;ctx.fillRect(0,tt,W,th);
  ctx.fillStyle=GRASS_D;const m0=Math.floor(V.cam/4)*4-4;for(let m=m0;m<V.cam+W/V.ppm+8;m+=4){quad(ctx,V,m,m+2,0,1);ctx.fill()}
  ctx.fillStyle="rgba(20,24,58,.12)";ctx.fillRect(0,tt,W,4);
  ctx.fillStyle=TRACK;quad(ctx,V,-40,LINE_M+PIT_M,R0-.04,R1+.04);ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.92)";
  for(const f of [R0,R1]){const y=tt+th*f;ctx.fillRect(Math.max(0,X(V,0,y)),y-1.5,Math.min(W,X(V,LINE_M+PIT_M,y))-Math.max(0,X(V,0,y)),3)}
  quad(ctx,V,-.08,0,R0,R1);ctx.fill(); // start line
  // metre ticks on the near edge every 5 m before the board
  ctx.fillStyle="rgba(255,255,255,.75)";
  for(let m=5;m<LINE_M;m+=5){const x=X(V,m,tb);if(x>-20&&x<W+20)ctx.fillRect(x,tb-th*.05,3,th*.05)}
  // approach band orange -> yellow, then the green take-off zone + chevrons, brighter while the jumper is in it (F.zone 0..1)
  const a0=LINE_M-ZONE_M-APPROACH_M, N=16;
  for(let i=0;i<N;i++){const f=i/(N-1);ctx.fillStyle=`rgba(255,${Math.round(138+60*f)},${Math.round(31-5*f)},${.55+.25*f})`;quad(ctx,V,a0+APPROACH_M*i/N,a0+APPROACH_M*(i+1)/N+.02,R0,R1);ctx.fill()}
  ctx.fillStyle=`rgba(22,182,122,${.8+.2*F.zone})`;quad(ctx,V,LINE_M-ZONE_M,LINE_M-.2,R0,R1);ctx.fill();
  ctx.strokeStyle=`rgba(255,255,255,${.55+.4*F.zone})`;ctx.lineWidth=Math.max(2,V.ppm*.06);ctx.lineCap="round";ctx.lineJoin="round";
  for(let k=0;k<3;k++){const m=LINE_M-ZONE_M+.35+k*.55,ym=tt+th*(R0+R1)/2,ya=tt+th*(R0+.12),yb=tt+th*(R1-.12);
    ctx.beginPath();ctx.moveTo(X(V,m,ya),ya);ctx.lineTo(X(V,m+.28,ym),ym);ctx.lineTo(X(V,m,yb),yb);ctx.stroke()}
  // board (white) + the foul line (red plasticine strip)
  ctx.fillStyle="#fff";quad(ctx,V,LINE_M-.2,LINE_M,R0,R1);ctx.fill();
  ctx.fillStyle=RED;quad(ctx,V,LINE_M,LINE_M+.1,R0,R1);ctx.fill();
  ctx.strokeStyle=INK;ctx.lineWidth=2;quad(ctx,V,LINE_M-.2,LINE_M+.1,R0,R1);ctx.stroke();
  // sand pit with a wooden edge and some grain
  const p0=LINE_M+PIT_M,p1=p0+PIT_LEN;
  ctx.fillStyle=EDGE;quad(ctx,V,p0-.12,p1+.12,P0-.03,P1);ctx.fill();
  ctx.fillStyle=SAND;quad(ctx,V,p0,p1,P0,P1-.025);ctx.fill();
  ctx.fillStyle=SAND_D;
  for(let i=0;i<70;i++){const m=p0+((i*7.31)%PIT_LEN),f=P0+.04+((i*.137)%1)*(P1-P0-.09),y=tt+th*f,x=X(V,m,y);if(x>-4&&x<W+4)ctx.fillRect(x,y,3,2)}
  // metre marks from the line: lines across the sand + numbers on the far edge
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`400 ${Math.round(Math.max(13,V.ppm*.34))}px "Titan One",Impact,sans-serif`;
  for(let d=2;d<=9;d++){
    const m=LINE_M+d,xs=X(V,m,tt+th*P0);if(xs<-40||xs>W+60)continue;
    ctx.fillStyle="rgba(185,132,76,.35)";quad(ctx,V,m-.02,m+.02,P0,P1-.03);ctx.fill();
    const y=tt+th*(P0-.1);ctx.fillStyle="rgba(255,255,255,.95)";ctx.fillText(`${d} m`,X(V,m,y),y);
  }
  // the leader's mark: a yellow line across the sand + a small flag with the distance
  if(F.leader&&F.leader.d>0){
    const m=LINE_M+F.leader.d,ya=tt+th*P0,yb=tt+th*(P1-.03);
    ctx.strokeStyle=YEL;ctx.lineWidth=Math.max(3,V.ppm*.07);ctx.setLineDash([V.ppm*.25,V.ppm*.15]);
    ctx.beginPath();ctx.moveTo(X(V,m,ya),ya);ctx.lineTo(X(V,m,yb),yb);ctx.stroke();ctx.setLineDash([]);
    pennant(ctx,X(V,m,ya),ya,F.leader.tone,F.leader.label,V.ppm);
  }
  // landing print in the sand
  if(F.mark!=null){
    const m=LINE_M+F.mark,y=tt+th*.66;
    ctx.fillStyle="rgba(150,100,50,.45)";ctx.beginPath();ctx.ellipse(X(V,m-.25,y),y+2,V.ppm*.42,V.ppm*.12,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(120,80,40,.35)";ctx.beginPath();ctx.ellipse(X(V,m-.05,y),y+3,V.ppm*.13,V.ppm*.07,0,0,Math.PI*2);ctx.fill();
  }
  // measuring tape from the line along the near edge, ticks every metre
  if(F.tape>0){
    const y=tt+th*(P1-.06),d=F.tapeD*F.tape,x0=X(V,LINE_M,y),x1=X(V,LINE_M+d,y),hw=Math.max(5,V.ppm*.14);
    ctx.fillStyle=INK;ctx.fillRect(x0,y-hw/2+2,x1-x0,hw);
    ctx.fillStyle=YEL;ctx.fillRect(x0,y-hw/2,x1-x0,hw);
    ctx.fillStyle=INK;for(let m=1;m<=d;m++){const x=X(V,LINE_M+m,y);ctx.fillRect(x-1,y-hw/2,2,hw)}
    ctx.beginPath();ctx.arc(x1,y,hw*.75,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=INK;ctx.stroke();
  }
  // judge's flag next to the board: white = valid, red = foul (pops up, cloth waves)
  if(F.flag){
    const age=Math.min(1,(F.t-F.flagAt)/.25),y0=tb-th*.02,x=X(V,LINE_M-.6,y0),ph=Math.max(46,V.h*.8)*age;
    ctx.fillStyle=INK;ctx.fillRect(x-2,y0-ph,4,ph);
    const w=ph*.5,hh=ph*.32,wv=Math.sin(F.t*9)*hh*.12;
    ctx.beginPath();ctx.moveTo(x+2,y0-ph);ctx.quadraticCurveTo(x+w*.5,y0-ph-wv,x+w,y0-ph+wv*.5);ctx.lineTo(x+w,y0-ph+hh+wv*.5);ctx.quadraticCurveTo(x+w*.5,y0-ph+hh-wv,x+2,y0-ph+hh);ctx.closePath();
    ctx.fillStyle=F.flag==="ok"?"#fff":RED;ctx.fill();ctx.lineWidth=3;ctx.strokeStyle=INK;ctx.stroke();
  }
}
const devicePixelRatioOf=(ctx:CanvasRenderingContext2D)=>ctx.getTransform().a||1; // css px = canvas px / the dpr transform
function pennant(ctx:CanvasRenderingContext2D,x:number,y:number,tone:string,label:string,ppm:number){
  const ph=Math.max(30,ppm*.9);
  ctx.fillStyle=INK;ctx.fillRect(x-1.5,y-ph,3,ph);
  ctx.font=`800 ${Math.round(Math.max(12,ppm*.26))}px Nunito,system-ui,sans-serif`;
  const w=ctx.measureText(label).width+16,hh=Math.max(20,ppm*.42),x0=x+w+8>ctx.canvas.width/devicePixelRatioOf(ctx)?x-1-w:x+1; // flag flies left near the edge
  ctx.beginPath();ctx.roundRect(x0,y-ph,w,hh,6);ctx.fillStyle=tone;ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle=INK;ctx.stroke();
  ctx.fillStyle=tone===YEL?INK:"#fff";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(label,x0+8,y-ph+hh/2+.5);
}
export const mLabel=(d:number)=>`${dec(d,2)} m`;
export {drawFront,X as worldX};
