// Barjerinis bėgimas – what the sprint stadium (src/sprint/scene.ts) does not have: per lane the orange approach band +
// green take-off zone before every hurdle (the long jump's staged cue, src/longjump/field.ts) and the hurdles themselves
// (white/red bar on two navy posts, leaning with depth like every line across the track; a clipped one tips forward).
import {SKEW,type Layout} from "../sprint/scene.ts";
import {HURDLES,ZONE_M,APPROACH_M} from "./logic.ts";

const INK="#14183A", RED="#FF3B3B";
// lane k band on the track (fractions of the track height, the sprint lane lines sit at .04 / .49 / .94)
const band=(L:Layout,k:number)=>{const th=L.trackBot-L.trackTop;return [L.trackTop+th*(.045+.45*k),L.trackTop+th*(.485+.45*k)]};
const X=(L:Layout,cam:number,m:number,y:number)=>(m-cam)*L.ppm+(L.trackBot-y)*SKEW;
function quad(ctx:CanvasRenderingContext2D,L:Layout,cam:number,a:number,b:number,y0:number,y1:number){
  ctx.beginPath();ctx.moveTo(X(L,cam,a,y0),y0);ctx.lineTo(X(L,cam,b,y0),y0);ctx.lineTo(X(L,cam,b,y1),y1);ctx.lineTo(X(L,cam,a,y1),y1);ctx.closePath();
}
const seen=(L:Layout,cam:number,m:number)=>{const x=(m-cam)*L.ppm;return x>-L.W*.6&&x<L.W*1.6};

// zones painted on lane k; glow 0..1 = this lane's runner is in the green zone (it pulses)
export function drawZones(ctx:CanvasRenderingContext2D,L:Layout,cam:number,k:number,glow:number){
  const [y0,y1]=band(L,k),N=8;
  for(const h of HURDLES){
    if(!seen(L,cam,h))continue;
    const a0=h-ZONE_M-APPROACH_M;
    for(let i=0;i<N;i++){const f=i/(N-1);ctx.fillStyle=`rgba(255,${Math.round(138+60*f)},${Math.round(31-5*f)},${.5+.25*f})`;quad(ctx,L,cam,a0+APPROACH_M*i/N,a0+APPROACH_M*(i+1)/N+.02,y0,y1);ctx.fill()}
    ctx.fillStyle=`rgba(22,182,122,${.75+.25*glow})`;quad(ctx,L,cam,h-ZONE_M,h,y0,y1);ctx.fill();
    // chevrons pointing at the hurdle
    ctx.strokeStyle=`rgba(255,255,255,${.55+.4*glow})`;ctx.lineWidth=Math.max(2,L.ppm*.06);ctx.lineCap="round";ctx.lineJoin="round";
    const ym=(y0+y1)/2,ya=y0+(y1-y0)*.22,yb=y1-(y1-y0)*.22;
    for(let c=0;c<3;c++){const m=h-ZONE_M+.4+c*.7;ctx.beginPath();ctx.moveTo(X(L,cam,m,ya),ya);ctx.lineTo(X(L,cam,m+.3,ym),ym);ctx.lineTo(X(L,cam,m,yb),yb);ctx.stroke()}
  }
}
// hurdle i on lane k, standing on the runner's line (gy); tip = 0 standing .. 1 knocked flat (falls forward, +x).
// ponytail: drawn front-on (a striped board on two legs) - in this projection a true side view of the bar is a thin
// vertical sliver nobody reads as a hurdle
export function drawHurdle(ctx:CanvasRenderingContext2D,L:Layout,cam:number,k:number,i:number,tip:number){
  const m=HURDLES[i];if(!seen(L,cam,m))return;
  const gy=L.lane[k]-2,h=L.charH[k],hh=h*.4,w=h*.46,bt=hh*.3,lw=Math.max(3,h*.035),x=X(L,cam,m,gy);
  ctx.save();ctx.translate(x+w/2,gy);ctx.rotate(tip*1.45);ctx.translate(-w/2,0);
  ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=INK;ctx.lineWidth=lw;
  // legs with feet pointing back (-x)
  for(const lx of [w*.14,w*.86]){ctx.beginPath();ctx.moveTo(lx-w*.2,0);ctx.lineTo(lx,0);ctx.lineTo(lx,-hh+bt*.5);ctx.stroke()}
  // the board: white with red bands, navy outline
  ctx.beginPath();ctx.roundRect(0,-hh,w,bt,bt*.3);ctx.fillStyle="#fff";ctx.fill();
  ctx.save();ctx.clip();ctx.fillStyle=RED;for(let s=1;s<5;s+=2)ctx.fillRect(w*s/5,-hh,w/5,bt);ctx.restore();
  ctx.lineWidth=lw*.85;ctx.stroke();
  ctx.restore();
}
