// Pradžia banner (#38, 10-28 "nuotraukos negyvos"): the real sprint stadium, live – Raudonas and Mėlynas run while the
// crowd and the boards scroll past. Same scene/runner code as the race; rebuilt on every start because the race
// calls build() with its own layout. Runs only while Pradžia is on screen; reduced motion = one still frame.
import {layout,build,drawBack,drawFront} from "../sprint/scene.ts";
import {LOOKS,newPose,runPose,drawRunner} from "../sprint/runner.ts";

const cv=document.getElementById("homeScene") as HTMLCanvasElement|null, ctx=cv?.getContext("2d");
const poses=[newPose(),newPose()], still=matchMedia("(prefers-reduced-motion: reduce)").matches;
let raf=0, W=0, H=0, cam=0, last=0, L:ReturnType<typeof layout>;

function fit(){
  const r=cv!.getBoundingClientRect(), dpr=Math.min(2,devicePixelRatio||1);
  W=r.width;H=r.height;cv!.width=Math.round(W*dpr);cv!.height=Math.round(H*dpr);
  L=layout(W,H,dpr);build(ctx!,L);
}
function frame(now:number){
  if(document.body.dataset.view!=="home"||document.body.classList.contains("ingame")){raf=0;return}
  if(!still)raf=requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-(last||now))/1000);last=now;cam+=dt*7.5;
  const c=ctx!;c.setTransform(L.dpr,0,0,L.dpr,0,0);
  drawBack(c,cam);
  for(let k=0;k<2;k++){ // lane 0 is the far one: Mėlynas behind, Raudonas in front
    const who=1-k, o=poses[who], h=L.charH[k]*1.3, g=L.lane[k]-(k?H*.05:0);
    runPose(o,(now/1000*1.7+who*.37)%1,1);
    c.fillStyle="rgba(20,24,58,.16)";c.beginPath();c.ellipse(W*(who?.6:.42),g,h*.22,h*.04,0,0,Math.PI*2);c.fill();
    drawRunner(c,LOOKS[who],o,W*(who?.6:.42),g,h);
  }
  drawFront(c,cam);
}
export function startHomeScene(){
  if(!cv||!ctx||raf)return;
  fit();last=0;raf=requestAnimationFrame(frame);
}
addEventListener("resize",()=>{if(raf)fit()});
