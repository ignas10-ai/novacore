// Iečio metimas – the side-view field on the canvas: the sprint stadium backdrop (scene.ts tiles) + the grass infield,
// a SHORT tartan runway with the throw line, distance marks every 10 m, the leader's mark, the landing spear and the
// measuring tape. World x is in metres from the start; the throw line is at LINE_M. Own zoom (ppm) so the whole throw
// fits; the backdrop tiles keep their own parallax. (Same pattern as src/longjump/field.ts, different field.)
import {SKEW,drawSky,drawFront,type Layout} from "../sprint/scene.ts";
import {LINE_M,ZONE_M,APPROACH_M} from "./logic.ts";
import {dec} from "../i18n/i18n.ts";

const GRASS="#7CC36E", GRASS_D="#71B964", TRACK="#D9604A", INK="#14183A", YEL="#FFC61A", RED="#FF3B3B";
export interface View{L:Layout;cam:number;ppm:number;gy:number;h:number}
// runway band (fractions of the track height): the thrower runs on gy; lines across lean with depth like the sprint
const R0=.46, R1=.94, M0=.25, M1=.98;
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
  // grass infield with mowing stripes every 4 m
  ctx.fillStyle=GRASS;ctx.fillRect(0,tt,W,th);
  ctx.fillStyle=GRASS_D;const m0=Math.floor(V.cam/8)*8-8;for(let m=m0;m<V.cam+W/V.ppm+16;m+=8){quad(ctx,V,m,m+4,0,1);ctx.fill()}
  ctx.fillStyle="rgba(20,24,58,.12)";ctx.fillRect(0,tt,W,4);
  // the runway strip (start -> line), tartan with white edges
  ctx.fillStyle=TRACK;quad(ctx,V,-20,LINE_M+.35,R0-.04,R1+.04);ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.92)";
  for(const f of [R0,R1]){const y=tt+th*f;ctx.fillRect(Math.max(0,X(V,0,y)),y-1.5,Math.min(W,X(V,LINE_M+.35,y))-Math.max(0,X(V,0,y)),3)}
  quad(ctx,V,-.08,0,R0,R1);ctx.fill(); // start line
  // metre ticks on the near edge before the line
  ctx.fillStyle="rgba(255,255,255,.75)";
  for(let m=5;m<LINE_M;m+=5){const x=X(V,m,tb);if(x>-20&&x<W+20)ctx.fillRect(x,tb-th*.05,3,th*.05)}
  // approach band orange -> yellow, then the green throw zone + chevrons, brighter while the thrower is in it
  const a0=LINE_M-ZONE_M-APPROACH_M,N=16;
  for(let i=0;i<N;i++){const f=i/(N-1);ctx.fillStyle=`rgba(255,${Math.round(138+60*f)},${Math.round(31-5*f)},${.55+.25*f})`;quad(ctx,V,a0+APPROACH_M*i/N,a0+APPROACH_M*(i+1)/N+.02,R0,R1);ctx.fill()}
  ctx.fillStyle=`rgba(22,182,122,${.8+.2*F.zone})`;quad(ctx,V,LINE_M-ZONE_M,LINE_M-.25,R0,R1);ctx.fill();
  ctx.strokeStyle=`rgba(255,255,255,${.55+.4*F.zone})`;ctx.lineWidth=Math.max(2,V.ppm*.06);ctx.lineCap="round";ctx.lineJoin="round";
  for(let k=0;k<3;k++){const m=LINE_M-ZONE_M+.35+k*.55,ym=tt+th*(R0+R1)/2,ya=tt+th*(R0+.12),yb=tt+th*(R1-.12);
    ctx.beginPath();ctx.moveTo(X(V,m,ya),ya);ctx.lineTo(X(V,m+.28,ym),ym);ctx.lineTo(X(V,m,yb),yb);ctx.stroke()}
  // throw line: white board + red line, and the white throwing arc on the grass
  ctx.fillStyle="#fff";quad(ctx,V,LINE_M-.22,LINE_M,R0,R1);ctx.fill();
  ctx.fillStyle=RED;quad(ctx,V,LINE_M,LINE_M+.12,R0,R1);ctx.fill();
  ctx.strokeStyle=INK;ctx.lineWidth=2;quad(ctx,V,LINE_M-.22,LINE_M+.12,R0,R1);ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,.85)";ctx.lineWidth=Math.max(2,V.ppm*.05);
  ctx.beginPath();for(let d=-9;d<=9;d+=1){const m=LINE_M+d*.55,y=tt+th*(M0+.06+Math.cos(d*.2)*.02);if(d===-9)ctx.moveTo(X(V,m,y),y);else ctx.lineTo(X(V,m,y),y)}ctx.stroke();
  // distance marks every 10 m from the line: a subtle white line + a big number on the grass
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font=`400 ${Math.round(Math.max(13,V.ppm*.34))}px "Titan One",Impact,sans-serif`;
  for(let d=10;d<=80;d+=10){
    const m=LINE_M+d,xs=X(V,m,tt+th*.55);if(xs<-80||xs>W+80)continue;
    ctx.strokeStyle="rgba(255,255,255,.32)";ctx.lineWidth=Math.max(1,V.ppm*.025);
    ctx.beginPath();ctx.moveTo(X(V,m,tt+th*M0),tt+th*M0);ctx.lineTo(X(V,m,tt+th*(M1-.02)),tt+th*(M1-.02));ctx.stroke();
    const y=tt+th*(M1-.08);ctx.fillStyle="rgba(255,255,255,.95)";ctx.fillText(`${d}`,X(V,m,y),y);
  }
  // leader's mark: a yellow line + a pennant with the distance
  if(F.leader&&F.leader.d>0){
    const m=LINE_M+F.leader.d,ya=tt+th*M0,yb=tt+th*(M1-.03);
    ctx.strokeStyle=YEL;ctx.lineWidth=Math.max(3,V.ppm*.07);ctx.setLineDash([V.ppm*.25,V.ppm*.15]);
    ctx.beginPath();ctx.moveTo(X(V,m,ya),ya);ctx.lineTo(X(V,m,yb),yb);ctx.stroke();ctx.setLineDash([]);
    pennant(ctx,X(V,m,ya),ya,F.leader.tone,F.leader.label,V.ppm);
  }
  // landing: a divot + the javelin stuck in the grass (the flight tip is drawn by javelin.ts; this is the mark)
  if(F.mark!=null){
    const m=LINE_M+F.mark,y=tt+th*.66;
    ctx.fillStyle="rgba(20,24,58,.16)";ctx.beginPath();ctx.ellipse(X(V,m,y),y+3,V.ppm*.5,V.ppm*.13,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=YEL;ctx.beginPath();ctx.arc(X(V,m,y),y,Math.max(3,V.ppm*.12),0,Math.PI*2);ctx.fill();
  }
  // measuring tape from the line along the near edge, ticks every metre; the 10 m labels are enough elsewhere
  if(F.tape>0){
    const y=tt+th*(M1-.06),d=F.tapeD*F.tape,x0=X(V,LINE_M,y),x1=X(V,LINE_M+d,y),hw=Math.max(5,V.ppm*.14);
    ctx.fillStyle=INK;ctx.fillRect(x0,y-hw/2+2,x1-x0,hw);
    ctx.fillStyle=YEL;ctx.fillRect(x0,y-hw/2,x1-x0,hw);
    ctx.fillStyle=INK;for(let m=1;m<=d;m++){const x=X(V,LINE_M+m,y);ctx.fillRect(x-1,y-hw/2,2,hw)}
    ctx.beginPath();ctx.arc(x1,y,hw*.75,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=INK;ctx.stroke();
  }
  // judge's flag next to the line: white = valid, red = foul (pops up, cloth waves)
  if(F.flag){
    const age=Math.min(1,(F.t-F.flagAt)/.25),y0=tb-th*.02,x=X(V,LINE_M-.6,y0),ph=Math.max(46,V.h*.8)*age;
    ctx.fillStyle=INK;ctx.fillRect(x-2,y0-ph,4,ph);
    const w=ph*.5,hh=ph*.32,wv=Math.sin(F.t*9)*hh*.12;
    ctx.beginPath();ctx.moveTo(x+2,y0-ph);ctx.quadraticCurveTo(x+w*.5,y0-ph-wv,x+w,y0-ph+wv*.5);ctx.lineTo(x+w,y0-ph+hh+wv*.5);ctx.quadraticCurveTo(x+w*.5,y0-ph+hh-wv,x+2,y0-ph+hh);ctx.closePath();
    ctx.fillStyle=F.flag==="ok"?"#fff":RED;ctx.fill();ctx.lineWidth=3;ctx.strokeStyle=INK;ctx.stroke();
  }
}
const devicePixelRatioOf=(ctx:CanvasRenderingContext2D)=>ctx.getTransform().a||1;
function pennant(ctx:CanvasRenderingContext2D,x:number,y:number,tone:string,label:string,ppm:number){
  const ph=Math.max(30,ppm*.9);
  ctx.fillStyle=INK;ctx.fillRect(x-1.5,y-ph,3,ph);
  ctx.font=`800 ${Math.round(Math.max(12,ppm*.26))}px Nunito,system-ui,sans-serif`;
  const w=ctx.measureText(label).width+16,hh=Math.max(20,ppm*.42),x0=x+w+8>ctx.canvas.width/devicePixelRatioOf(ctx)?x-1-w:x+1;
  ctx.beginPath();ctx.roundRect(x0,y-ph,w,hh,6);ctx.fillStyle=tone;ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle=INK;ctx.stroke();
  ctx.fillStyle=tone===YEL?INK:"#fff";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(label,x0+8,y-ph+hh/2+.5);
}
export const mLabel=(d:number)=>`${dec(d,2)} m`;
export {drawFront,X as worldX};
