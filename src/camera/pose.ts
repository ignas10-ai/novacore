// Pose inference facade for the main thread. All heavy MediaPipe work happens in pose-worker.ts (its own core);
// this module only copies the current camera frame, throttles inference and publishes the latest landmarks.
// When a worker cannot run (old iOS/WebView without OffscreenCanvas/WebGL2) it falls back to the original
// synchronous main-thread PoseLandmarker, so every game keeps working exactly as before.
import type {Lm} from "../detect/classifier.ts";
import {detectSize} from "./sizes.ts";
// Vite: module worker in dev (vite dev always serves workers as ES modules), bundled classic worker in the build.
// pose-worker.ts installs the importScripts shim only when it is missing (dev module worker).
import PoseWorker from "./pose-worker.ts?worker";

const MP_VERSION="0.10.14"; // keep equal to package.json
const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const TARGET=16; // aim for ~60 fps inference; the measured cost widens the gap
const MAX_GAP=120;
const IDLE_RELEASE_MS=120_000; // free the model/GPU memory after two minutes out of a game

export interface Pose{lm:Lm[];x:number}
export type PoseMode="worker"|"main"|"off";

// inference copy (mode-independent): the game code reads its aspect ratio for pose math
export const detCv=document.createElement("canvas"),detCtx=detCv.getContext("2d",{alpha:false})!;
export let latestPoses:Pose[]=[];
export let poseMode:PoseMode="off";
export let poseEngine="";

let worker:Worker|null=null;
let mainMod:any=null,mainLandmarker:any=null;
let want=1,have=0,starting=false;
let init:Promise<void>|null=null;
let pending=false,pendingSince=0;
let generation=0;
let lastSent=0,gap=TARGET,cost=0,results=0,errors=0,sent=0;
let offscreen:OffscreenCanvas|null=null,offCtx:OffscreenCanvasRenderingContext2D|null=null;
let idleTimer:ReturnType<typeof setTimeout>|0=0;
let rid=0;
const pendingRpc=new Map<number,{ok:(engine:string)=>void;fail:(e:Error)=>void}>();

const errText=(e:unknown)=>String((e as Error)?.message??e);

// ?posemode=main|worker: main forces the old path (fallback test), worker forces the off-thread path even on a
// software GL renderer (the perf spec). Real games on a software renderer (headless CI, llvmpipe) use the main
// thread automatically: there a worker GPU context is slower per frame than the old path, while phones' hardware
// GPUs benefit from the worker.
function forcedMode(): "main"|"worker"|null{
  try{
    const v=new URLSearchParams(location.search).get("posemode");
    return v==="main"||v==="worker"?v:null;
  }catch(e){
    return null;
  }
}
let software:boolean|null=null;
function isSoftwareRenderer(){
  if(software!=null)return software;
  try{
    const c=document.createElement("canvas");
    const gl=c.getContext("webgl2")||c.getContext("webgl");
    if(!gl)return software=false;
    const ext=gl.getExtension("WEBGL_debug_renderer_info");
    const renderer=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):"";
    return software=/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  }catch(e){
    return software=false;
  }
}

// ---------- worker lifecycle ----------
function canWorker(){
  if(typeof Worker==="undefined"||typeof OffscreenCanvas==="undefined")return false;
  try{
    const c=new OffscreenCanvas(2,2);
    return !!c.getContext("2d")&&typeof c.transferToImageBitmap==="function";
  }catch(e){
    return false;
  }
}
function makeWorker(){
  const w=new PoseWorker();
  w.onmessage=(e)=>onMessage(e.data);
  w.onerror=(e)=>onFatal(e.message||"pose worker error");
  w.onmessageerror=()=>onFatal("pose worker message error");
  return w;
}
function failRpcs(reason:string){
  for(const p of pendingRpc.values())p.fail(new Error(reason));
  pendingRpc.clear();
}
function rpc(msg:{type:"init"|"num";numPoses:number},timeout=120_000):Promise<string>{
  return new Promise((resolve,reject)=>{
    if(!worker)return reject(new Error("no pose worker"));
    const id=++rid;
    const t=setTimeout(()=>{pendingRpc.delete(id);reject(new Error("pose worker timeout"))},timeout);
    pendingRpc.set(id,{ok:v=>{clearTimeout(t);resolve(v)},fail:e=>{clearTimeout(t);reject(e)}});
    try{worker.postMessage({...msg,id})}catch(e){clearTimeout(t);pendingRpc.delete(id);reject(e as Error)}
  });
}
function onMessage(m:any){
  if(m.type==="ok"||m.type==="err"){
    const p=pendingRpc.get(m.id);
    if(!p)return;
    pendingRpc.delete(m.id);
    if(m.type==="ok")p.ok(String(m.engine??""));
    else p.fail(new Error(String(m.error??"pose worker error")));
    return;
  }
  if(m.type==="fatal"){onFatal(String(m.error??"pose worker fatal"));return}
  if(m.type==="poses"){
    if(m.gen!==generation){pending=false;return}
    pending=false;
    errors=0;
    latestPoses=Array.isArray(m.poses)?m.poses as Pose[]:[];
    results++;
    cost=+m.cost||0;
    gap=Math.max(TARGET,Math.min(MAX_GAP,cost*1.25));
    return;
  }
  if(m.type==="error"){
    if(m.gen!==generation)return;
    pending=false;
    errors++;
    console.warn("Pose worker frame failed:",m.error);
  }
}
// The worker died mid-game (GPU context lost, OOM): keep the game running and switch to the main thread in the
// background. Until it is ready sampleCamera() returns the last landmarks.
function onFatal(reason:string){
  console.warn("Pose worker stopped, falling back to the main thread:",reason);
  failRpcs(reason);
  try{worker?.terminate()}catch(e){}
  worker=null;
  pending=false;
  if(starting||poseMode!=="worker")return;
  poseMode="off";
  have=0;
  init=null;
  void initMain(want).then(()=>{poseMode="main";have=want}).catch(e=>console.error("Pose fallback failed:",e));
}

// ---------- main-thread fallback (the original 2026-10 code path) ----------
async function initMain(n:number){
  mainMod??=await import("@mediapipe/tasks-vision");
  const fs=await mainMod.FilesetResolver.forVisionTasks(WASM_URL);
  const common={runningMode:"VIDEO",numPoses:n};
  try{
    mainLandmarker=await mainMod.PoseLandmarker.createFromOptions(fs,{...common,baseOptions:{modelAssetPath:POSE_MODEL,delegate:"GPU"}});
    poseEngine="main-GPU";
  }catch(e){
    console.warn("Pose GPU delegate failed on the main thread, using CPU:",errText(e));
    mainLandmarker=await mainMod.PoseLandmarker.createFromOptions(fs,{...common,baseOptions:{modelAssetPath:POSE_MODEL,delegate:"CPU"}});
    poseEngine="main-CPU";
  }
  have=n;
}
async function initMainAndUse(n:number){
  await initMain(n);
  poseMode="main";
}
async function mainSetOptions(n:number){
  if(!mainLandmarker)throw new Error("pose model not ready");
  await mainLandmarker.setOptions({numPoses:n});
  have=n;
}

// ---------- public API ----------
function clearIdle(){
  if(idleTimer)clearTimeout(idleTimer);
  idleTimer=0;
}
function scheduleIdle(){
  clearIdle();
  idleTimer=setTimeout(()=>{idleTimer=0;release()},IDLE_RELEASE_MS);
}
export function release(){
  clearIdle();
  failRpcs("pose released");
  try{worker?.terminate()}catch(e){}
  worker=null;
  try{mainLandmarker?.close?.()}catch(e){}
  mainLandmarker=null;
  latestPoses=[];
  pending=false;
  poseMode="off";
  poseEngine="";
  have=0;
  init=null;
  offscreen=null;
  offCtx=null;
  generation++;
}

/** Load (or reuse) the pose model for this player count. Resolves once detection can run. */
export async function ensureModel(numPoses:number){
  const n=Math.max(1,Math.min(4,Math.round(numPoses)||1));
  want=n;
  clearIdle();
  if(poseMode==="worker"){
    if(have!==n){
      try{await rpc({type:"num",numPoses:n});have=n}
      catch(e){
        // a failed setOptions must not block the game: rebuild the worker once with the new player count
        console.warn("Pose worker numPoses change failed, rebuilding:",errText(e));
        release();
        init=start(n).catch(err=>{init=null;throw err});
        await init;
      }
    }
    return;
  }
  if(poseMode==="main"){
    if(have!==n){
      try{await mainSetOptions(n)}
      catch(e){
        console.warn("Pose main numPoses change failed, rebuilding:",errText(e));
        try{mainLandmarker?.close?.()}catch(e2){}
        mainLandmarker=null;
        await initMain(n);
        poseMode="main";
      }
    }
    return;
  }
  if(!init){
    init=start(n).catch(e=>{init=null;throw e});
  }
  await init;
  if(poseMode==="off")throw new Error("pose engine unavailable");
}

async function start(n:number){
  const forced=forcedMode();
  if(forced!=="main"&&(forced==="worker"||!isSoftwareRenderer())&&canWorker()){
    starting=true;
    try{
      worker=makeWorker();
      const engine=await rpc({type:"init",numPoses:n});
      starting=false;
      poseEngine=engine;
      poseMode="worker";
      have=n;
      console.info(`MoveClash pose: Web Worker (${engine})`);
      return;
    }catch(e){
      starting=false;
      console.warn("Pose worker unavailable, using the main thread:",errText(e));
      failRpcs("pose worker init failed");
      try{worker?.terminate()}catch(e2){}
      worker=null;
    }
  }
  await initMainAndUse(n);
  console.info(`MoveClash pose: main thread fallback${isSoftwareRenderer()?" (software GL)":""}`);
}

/** Hand the newest camera frame to the engine. Throttled and non-blocking in worker mode. */
export function submit(video:HTMLVideoElement,now:number){
  if(poseMode==="main"){mainDetect(video,now);return}
  if(poseMode!=="worker"||!worker)return;
  if(pending){
    // a hung GPU/graph must not freeze detection for the rest of the game: fall back to the main thread.
    // A cold model can take tens of seconds for its first frame on a loaded device/CI (the old synchronous code
    // did too), so only a warm worker gets the 5 s stall timeout.
    const cold=results===0?60_000:5000;
    if(now-pendingSince>cold)onFatal("pose worker stalled");
    return;
  }
  if(now-lastSent<gap)return;
  lastSent=now;
  pending=true;
  pendingSince=now;
  sent++;
  const gen=generation;
  const [w,h]=detectSize(video.videoWidth,video.videoHeight);
  if(detCv.width!==w||detCv.height!==h){detCv.width=w;detCv.height=h}
  try{
    if(!offscreen||offscreen.width!==w||offscreen.height!==h){
      offscreen=new OffscreenCanvas(w,h);
      offCtx=offscreen.getContext("2d",{alpha:false});
    }
    offCtx!.drawImage(video,0,0,w,h);
    const bitmap=offscreen.transferToImageBitmap();
    worker.postMessage({type:"frame",bitmap,ts:now,gen},[bitmap]);
  }catch(e){
    pending=false;
    console.warn("Pose frame skipped:",errText(e));
  }
}

function publish(lm:any[][]|undefined,ms:number){
  latestPoses=(lm||[]).slice(0,want).map(p=>({
    lm:p.map((q:any)=>({x:q.x,y:q.y,z:q.z,visibility:q.visibility})),
    x:1-(p[0]?.x??0),
  })).sort((a,b)=>a.x-b.x);
  results++;
  errors=0;
  cost=ms;
  gap=Math.max(TARGET,Math.min(MAX_GAP,ms*1.25));
}

function mainDetect(video:HTMLVideoElement,now:number){
  if(!mainLandmarker||now-lastSent<gap)return;
  lastSent=now;
  const [w,h]=detectSize(video.videoWidth,video.videoHeight);
  if(detCv.width!==w||detCv.height!==h){detCv.width=w;detCv.height=h}
  detCtx.drawImage(video,0,0,w,h);
  const t0=performance.now();
  try{
    const res=mainLandmarker.detectForVideo(detCv,now);
    publish(res.landmarks,performance.now()-t0);
  }catch(e){
    errors++;
    console.warn("Pose detect failed:",errText(e));
  }
}

/** Forget the current players (between games/gates); the model is kept warm for a fast restart. */
export function resetTracking(){
  generation++;
  pending=false;
  latestPoses=[];
  lastSent=0;
  gap=TARGET;
  cost=0;
  errors=0;
  scheduleIdle();
}

export function poseStats(){
  return {mode:poseMode,engine:poseEngine,software:isSoftwareRenderer(),detectMs:Math.round(cost*10)/10,results,errors,sent,pending,detectGap:Math.round(gap)};
}

// Diagnostics hook for the e2e perf spec and real-phone checks: window.__pose.stats()
(window as any).__pose={stats:poseStats};
