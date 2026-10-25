// Pose classifier – plain-JS port of Google MediaPipe "Pose classification" (Apache-2.0,
// github.com/google-ai-edge/mediapipe docs/solutions/pose_classification.md and its Colab): landmarks → normalized
// pair-difference embedding → k-NN (top 30 by max distance, then top 10 by mean) against labelled sample poses →
// EMA → RepetitionCounter with enter/exit hysteresis. Sample poses: tools/samples-spec.json → `node tools/samples.cjs`
// → public/pose-samples.json (loaded into POSE at startup). An exercise without samples uses its hand-written branch in step().
// PURE: no DOM.
export interface Lm{x:number;y:number;z?:number;visibility?:number}
export type Sample=[string,...number[]];
export interface PoseCfg{flip:boolean;count:string[];pairs?:number[];samples:Sample[];dims?:number[]}

export const POSE:Record<string,PoseCfg>={}; // id → {flip, count:[class...], pairs?:[EMB index...], samples:[[class, ...embedding]]}
const EMB:(number|number[])[][]=[[[23,24],[11,12]],[11,13],[12,14],[13,15],[14,16],[23,25],[24,26],[25,27],[26,28],[11,15],[12,16],[23,27],[24,28],[23,15],[24,16],[11,27],[12,28],[23,15],[24,16],[13,14],[25,26],[15,16],[27,28]]; // same 23 pairs as the Colab
export const CLS_ENTER=6, CLS_EXIT=4, CLS_TAU=150; // of 10 neighbours; EMA time constant (ms) ≈ Colab alpha 0.2 at 30 fps

// ar = frame width/height: MediaPipe x and y are normalized to different pixel lengths
export function poseEmbed(lm:Lm[],ar=1,flip=false):number[]{
  const P=lm.map(p=>[(flip?-p.x:p.x)*ar,p.y,(p.z||0)*ar]);
  const mid=(a:number,b:number)=>P[a].map((v,i)=>(v+P[b][i])/2), c=mid(23,24), sh=mid(11,12);
  let size=Math.hypot(sh[0]-c[0],sh[1]-c[1])*2.5;
  for(const p of P)size=Math.max(size,Math.hypot(p[0]-c[0],p[1]-c[1]));
  const at=(j:number|number[])=>Array.isArray(j)?mid(j[0],j[1]):P[j], e:number[]=[];
  for(const [a,b] of EMB){const A=at(a),B=at(b);for(let i=0;i<3;i++)e.push((B[i]-A[i])/size*100)}
  return e;
}
// → {class: votes of 10}
export function poseClassify(lm:Lm[],cfg:PoseCfg,ar:number):Record<string,number>{
  const e=poseEmbed(lm,ar),f=cfg.flip?poseEmbed(lm,ar,true):null;
  // cfg.pairs (optional): only these EMB pairs count, e.g. legs + torso for a squat so arm style does not matter
  const dims=cfg.dims||(cfg.dims=(cfg.pairs||EMB.map((_,i)=>i)).flatMap(p=>[p*3,p*3+1,p*3+2]));
  const dist=(s:Sample,q:number[])=>{let mx=0,sum=0;for(const i of dims){const d=Math.abs((s[i+1] as number)-q[i])*(i%3===2?0.2:1);sum+=d;if(d>mx)mx=d}return [mx,sum/dims.length]};
  const near=cfg.samples.map(s=>{const a=dist(s,e),b=f?dist(s,f):a;return {c:s[0],mx:Math.min(a[0],b[0]),mean:Math.min(a[1],b[1])}})
    .sort((a,b)=>a.mx-b.mx).slice(0,30).sort((a,b)=>a.mean-b.mean).slice(0,10);
  const votes:Record<string,number>={};for(const n of near)votes[n.c]=(votes[n.c]||0)+1;
  return votes;
}
