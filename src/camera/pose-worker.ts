// Pose inference worker: MediaPipe (wasm + GPU) runs on its own thread/core, so detectForVideo() never blocks the
// game's requestAnimationFrame loop. The main thread only copies the current video frame (640 px) and receives the
// landmarks. A CLASSIC worker on purpose: FilesetResolver loads the wasm loader with importScripts(), which does not
// exist in module workers. When this worker cannot start (old iOS/WebView without OffscreenCanvas WebGL) pose.ts
// falls back to the old synchronous main-thread path.
import {PoseLandmarker,FilesetResolver} from "@mediapipe/tasks-vision";

// The MediaPipe wasm loader is a classic script loaded with importScripts(); a module worker (Vite dev) has an
// importScripts that throws instead, so replace it there with the same effect: synchronous fetch + indirect eval
// (worker-only, no CSP in the app). The production build is a classic worker: DEV is false and the native
// importScripts is used.
if(import.meta.env.DEV){
  (self as any).importScripts=(url:string)=>{
    const xhr=new XMLHttpRequest();
    xhr.open("GET",String(url),false);
    xhr.send(null);
    if(xhr.status&&xhr.status>=400)throw new Error(`importScripts ${xhr.status}: ${url}`);
    (0,eval)(xhr.responseText); // indirect eval -> global scope, like importScripts
  };
}

const MP_VERSION="0.10.14"; // keep equal to package.json
const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

interface Init{type:"init";id:number;numPoses:number}
interface Num{type:"num";id:number;numPoses:number}
interface Frame{type:"frame";bitmap:ImageBitmap;ts:number;gen:number}
interface Close{type:"close"}
type In=Init|Num|Frame|Close;

// `any` is allowed at the worker boundary; the message shapes are our own (pose.ts).
const scope=self as any;
const post=(m:unknown)=>scope.postMessage(m);
const errText=(e:unknown)=>String((e as Error)?.message??e);

let landmarker:PoseLandmarker|null=null;
let engine="";
let want=1;
let lastTs=-1;
let chain=Promise.resolve();

async function build(n:number):Promise<string>{
  const fs=await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);
  const common={runningMode:"VIDEO" as const,numPoses:n};
  try{
    landmarker=await PoseLandmarker.createFromOptions(fs,{...common,baseOptions:{modelAssetPath:POSE_MODEL,delegate:"GPU"}});
    return "GPU";
  }catch(e){
    console.warn("Pose worker: GPU delegate failed, using CPU:",errText(e));
    landmarker=await PoseLandmarker.createFromOptions(fs,{...common,baseOptions:{modelAssetPath:POSE_MODEL,delegate:"CPU"}});
    return "CPU";
  }
}

function frames(lm:any[][]|undefined):{lm:unknown[];x:number}[]{
  return (lm||[]).slice(0,want).map(p=>({
    lm:p.map(q=>({x:q.x,y:q.y,z:q.z,visibility:q.visibility})),
    x:1-(p[0]?.x??0),
  })).sort((a,b)=>a.x-b.x);
}

async function handle(m:In){
  if(m.type==="init"){
    try{
      try{await landmarker?.close?.()}catch(e){}
      landmarker=null;
      want=m.numPoses;
      engine=await build(want);
      lastTs=-1;
      post({type:"ok",id:m.id,engine});
    }catch(e){
      post({type:"err",id:m.id,error:errText(e)});
    }
    return;
  }
  if(m.type==="num"){
    try{
      if(!landmarker)throw new Error("pose model not ready");
      want=m.numPoses;
      await landmarker.setOptions({numPoses:want});
      post({type:"ok",id:m.id,engine});
    }catch(e){
      post({type:"err",id:m.id,error:errText(e)});
    }
    return;
  }
  if(m.type==="frame"){
    const {bitmap,ts,gen}=m;
    try{
      if(!landmarker)throw new Error("pose model not ready");
      if(ts<=lastTs)lastTs+=1; else lastTs=ts; // VIDEO mode requires strictly increasing timestamps
      const t0=performance.now();
      const res=landmarker.detectForVideo(bitmap,lastTs);
      const cost=performance.now()-t0;
      post({type:"poses",poses:frames(res.landmarks),cost,gen});
    }catch(e){
      post({type:"error",gen,error:errText(e)});
    }finally{
      try{bitmap.close()}catch(e){}
    }
    return;
  }
  if(m.type==="close"){
    try{await landmarker?.close?.()}catch(e){}
    landmarker=null;
    lastTs=-1;
  }
}

// Serialise messages: setOptions/init must finish before the next frame is processed.
scope.onmessage=(e:MessageEvent<In>)=>{
  chain=chain.then(()=>handle(e.data)).catch(e=>post({type:"fatal",error:errText(e)}));
};
