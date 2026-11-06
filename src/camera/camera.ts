// Camera preview + skeleton drawing on the main thread. Pose inference itself lives in pose.ts/pose-worker.ts
// (its own core); this module only draws the current camera frame at preview resolution and hands a small copy to
// the engine. The recording canvas stays at the camera's own resolution (clips are unchanged).
import type {Lm} from "../detect/classifier.ts";
import {S} from "../game/state.ts";
import {$} from "../ui/dom.ts";
import {ensureModel,submit,latestPoses,resetTracking as resetPose,poseStats,type Pose} from "./pose.ts";
import {displaySize} from "./sizes.ts";

export {detCv,type Pose} from "./pose.ts";

export const cam=$<HTMLVideoElement>("#cam"), cv=$<HTMLCanvasElement>("#cv"), ctx=cv.getContext("2d",{alpha:false})!;
// offscreen canvas -> clips contain the raw camera only, no skeleton overlay
export const recCv=document.createElement("canvas"), recCtx=recCv.getContext("2d",{alpha:false})!;

export const camStream=()=>cam.srcObject as MediaStream|null;
export function stopCamera(){camStream()?.getTracks().forEach(t=>t.stop())}

// ask for the best mode; the browser falls back to the closest one it can deliver. Returns e.g. "1080p".
export async function openCamera(){
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60}},audio:false});
  cam.srcObject=stream; await new Promise(r=>cam.onloadedmetadata=r); await cam.play();
  sizePreview();
  const track=stream.getVideoTracks()[0],settings=track?.getSettings?.()||{};
  S.camFps=Math.max(1,+(settings.frameRate||0)||30);
  const shortSide=Math.min(cam.videoWidth,cam.videoHeight);
  return shortSide>=1080?"1080p":shortSide>=720?"720p":`${shortSide}p`;
}
export async function loadModel(numPoses:number){await ensureModel(numPoses)}

export function readCameraInfo(){
  const track=camStream()?.getVideoTracks?.()[0];
  const settings=track?.getSettings?.()||{};
  return {
    w:cam.videoWidth||settings.width||1280,
    h:cam.videoHeight||settings.height||720,
    fps:Math.max(1,+(settings.frameRate||0)||S.camFps||30)
  };
}

// The preview canvas never needs the full 1080p/2MP frame: it is letterboxed to the phone screen and the TV stream
// is capped at 720x1280 anyway. Capping the longest side cuts the per-frame drawImage cost ~3x on a 1080p camera.
let previewW=0,previewH=0;
function sizePreview(){
  const vw=cam.videoWidth,vh=cam.videoHeight;
  if(vw===previewW&&vh===previewH)return;
  previewW=vw;previewH=vh;
  const [w,h]=displaySize(vw,vh);
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
}
function drawMirrored(target:CanvasRenderingContext2D,targetCanvas:HTMLCanvasElement){
  target.save();target.translate(targetCanvas.width,0);target.scale(-1,1);target.drawImage(cam,0,0,targetCanvas.width,targetCanvas.height);target.restore();
}
function drawCamera(){drawMirrored(ctx,cv)}
export function drawRecordFrame(){
  const sw=cam.videoWidth,sh=cam.videoHeight;
  if(!recCv.width||!recCv.height||!sw||!sh)return;
  const scale=Math.max(recCv.width/sw,recCv.height/sh);
  const dw=sw*scale,dh=sh*scale;
  recCtx.save();
  recCtx.translate(recCv.width,0);recCtx.scale(-1,1);
  recCtx.drawImage(cam,(recCv.width-dw)/2,(recCv.height-dh)/2,dw,dh);
  recCtx.restore();
}

// The camera can deliver up to ~60 new frames/s while a phone screen refreshes at 60-120 Hz.
// Draw only fresh camera frames; the pose engine does its own throttling and runs off the main thread.
let lastVideoTime=-1;
export let lastPoses:Pose[]=latestPoses;
export function sampleCamera(now:number):Pose[]|null{
  if(!cam.videoWidth)return null;
  const vt=cam.currentTime;
  if(vt===lastVideoTime)return null; // same frame as last refresh: nothing new to draw or infer
  lastVideoTime=vt;
  sizePreview();
  drawCamera();
  // record before inference so a slow detection cannot delay the recorder frame
  if(S.rec&&now-S.lastRecDrawAt>=S.recFrameMs){S.lastRecDrawAt=now;drawRecordFrame()}
  submit(cam,now);
  lastPoses=latestPoses;
  return lastPoses;
}
// back to settings: forget tracking state and (after an idle period) free the model
export function resetTracking(){
  lastVideoTime=-1;
  lastPoses=[];
  resetPose();
}

// player colours come from the CSS tokens (--skel-p1/--skel-p2 in src/styles/main.css), read once on the first frame
let COL:string[]=[];
const playerColors=()=>{const cs=getComputedStyle(document.documentElement);return ["--skel-p1","--skel-p2"].map(v=>cs.getPropertyValue(v).trim())};
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
export function draw(lm:Lm[],i:number){
  if(!COL.length)COL=playerColors();
  const W=cv.width,H=cv.height,scale=Math.max(1,Math.min(W,H)/720),c=COL[i];const hot=performance.now()-S.fl[i]<250;
  ctx.lineWidth=(hot?10:5)*scale;ctx.lineCap="round";ctx.strokeStyle=c;ctx.fillStyle=c;
  ctx.beginPath(); // one stroke for the whole skeleton, not one per bone
  for(const[a,b]of EDGES){ctx.moveTo((1-lm[a].x)*W,lm[a].y*H);ctx.lineTo((1-lm[b].x)*W,lm[b].y*H)}
  ctx.stroke();
  ctx.font=`900 ${Math.round(32*scale)}px Inter,system-ui,sans-serif`;
  ctx.fillText(`P${i+1}`,(1-lm[0].x)*W-18*scale,lm[0].y*H-30*scale);
}

// diagnostics for the e2e perf spec / a real phone: window.__cam.stats()
(window as any).__cam={stats:()=>({display:[cv.width,cv.height],video:[cam.videoWidth,cam.videoHeight],...poseStats()})};
