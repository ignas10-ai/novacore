// Camera + pose inference + drawing. MediaPipe JS is bundled from npm (@mediapipe/tasks-vision, pinned);
// the wasm and the model still load from the CDN at runtime.
import {PoseLandmarker, FilesetResolver} from "@mediapipe/tasks-vision";
import type {Lm} from "../detect/classifier.ts";
import {S} from "../game/state.ts";
import {$} from "../ui/dom.ts";

const MP_VERSION="0.10.14"; // keep equal to package.json
// lite on purpose: on the real-person fixtures `full` was not better overall (tools/README.md, 2026-10-25) and is a 1.6x larger download (9.4 vs 5.8 MB)
const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export const cam=$<HTMLVideoElement>("#cam"), cv=$<HTMLCanvasElement>("#cv"), ctx=cv.getContext("2d",{alpha:false})!;
// offscreen canvas -> clips contain the raw camera only, no skeleton overlay
export const recCv=document.createElement("canvas"), recCtx=recCv.getContext("2d",{alpha:false})!;
// pose inference runs on a smaller copy; the visible canvas keeps the full camera resolution
export const detCv=document.createElement("canvas"), detCtx=detCv.getContext("2d",{alpha:false})!;
let landmarker:PoseLandmarker|null=null;

export interface Pose{lm:Lm[];x:number}
export const camStream=()=>cam.srcObject as MediaStream|null;
export function stopCamera(){camStream()?.getTracks().forEach(t=>t.stop())}

// ask for the best mode; the browser falls back to the closest one it can deliver. Returns e.g. "1080p".
export async function openCamera(){
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60}},audio:false});
  cam.srcObject=stream; await new Promise(r=>cam.onloadedmetadata=r); await cam.play();
  cv.width=cam.videoWidth; cv.height=cam.videoHeight;
  const track=stream.getVideoTracks()[0],settings=track?.getSettings?.()||{};
  S.camFps=Math.max(1,+(settings.frameRate||0)||30);
  const shortSide=Math.min(cam.videoWidth,cam.videoHeight);
  return shortSide>=1080?"1080p":shortSide>=720?"720p":`${shortSide}p`;
}
export async function loadModel(numPoses:number){
  const fs=await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);
  landmarker=await PoseLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:POSE_MODEL,delegate:"GPU"},runningMode:"VIDEO",numPoses});
}

export function readCameraInfo(){
  const track=camStream()?.getVideoTracks?.()[0];
  const settings=track?.getSettings?.()||{};
  return {
    w:cam.videoWidth||settings.width||1280,
    h:cam.videoHeight||settings.height||720,
    fps:Math.max(1,+(settings.frameRate||0)||S.camFps||30)
  };
}
function drawMirrored(target:CanvasRenderingContext2D,targetCanvas:HTMLCanvasElement){
  target.save();target.translate(targetCanvas.width,0);target.scale(-1,1);target.drawImage(cam,0,0);target.restore();
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
function detectFrame(){
  const sw=cam.videoWidth,sh=cam.videoHeight;
  const scale=Math.min(1,1280/Math.max(sw,sh));
  const w=Math.max(2,Math.round(sw*scale)),h=Math.max(2,Math.round(sh*scale));
  if(detCv.width!==w||detCv.height!==h){detCv.width=w;detCv.height=h}
  detCtx.drawImage(cam,0,0,w,h);
  return detCv;
}
// The camera can deliver up to ~60 new frames/s while a phone screen refreshes at 60-120 Hz.
// Only work on fresh camera frames, let inference follow the camera rate, and back off on slow devices.
const DETECT_TARGET=16, DETECT_MAX_GAP=120;
let lastVideoTime=-1, lastDetectAt=0, detectGap=0, detectCost=0;
export let lastPoses:Pose[]=[];
export function sampleCamera(now:number):Pose[]|null{
  if(!cam.videoWidth)return null;
  const vt=cam.currentTime;
  if(vt===lastVideoTime)return null; // same frame as last refresh: nothing new to draw or infer
  lastVideoTime=vt;
  if(cv.width!==cam.videoWidth||cv.height!==cam.videoHeight){cv.width=cam.videoWidth;cv.height=cam.videoHeight}
  drawCamera();
  // record before inference so a slow detection cannot delay the recorder frame
  if(S.rec&&now-S.lastRecDrawAt>=S.recFrameMs){S.lastRecDrawAt=now;drawRecordFrame()}
  if(now-lastDetectAt<detectGap)return lastPoses;
  lastDetectAt=now;
  const started=performance.now();
  const res=landmarker!.detectForVideo(detectFrame(),now);
  const cost=performance.now()-started;
  detectCost=detectCost?detectCost*0.5+cost*0.5:cost;
  // aim for ~60 fps inference; detection cost widens the gap on slower phones
  detectGap=Math.max(DETECT_TARGET,Math.min(DETECT_MAX_GAP,detectCost*1.25));
  const poses=(res.landmarks||[]).map(lm=>({lm,x:1-lm[0].x})).sort((a,b)=>a.x-b.x);
  if(poses.length>S.players)poses.length=S.players;
  lastPoses=poses;
  return poses;
}
// back to settings: forget tracking state and free the model
export function resetTracking(){
  lastVideoTime=-1;lastPoses=[];lastDetectAt=0;detectGap=0;detectCost=0;
  try{landmarker?.close?.()}catch(e){}
  landmarker=null;
}

const COL=["#ff2e7e","#1fd8ff"];
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
export function draw(lm:Lm[],i:number){
  const W=cv.width,H=cv.height,scale=Math.max(1,Math.min(W,H)/720),c=COL[i];const hot=performance.now()-S.fl[i]<250;
  ctx.lineWidth=(hot?10:5)*scale;ctx.lineCap="round";ctx.strokeStyle=c;ctx.fillStyle=c;
  ctx.beginPath(); // one stroke for the whole skeleton, not one per bone
  for(const[a,b]of EDGES){ctx.moveTo((1-lm[a].x)*W,lm[a].y*H);ctx.lineTo((1-lm[b].x)*W,lm[b].y*H)}
  ctx.stroke();
  ctx.font=`italic 900 ${Math.round(34*scale)}px 'Barlow Condensed',system-ui`;
  ctx.fillText(`P${i+1}`,(1-lm[0].x)*W-18*scale,lm[0].y*H-30*scale);
}
