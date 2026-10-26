// Recording (full clip, camera only) + highlight cut + the #clips screen (preview, download menu, share).
import {S} from "../game/state.ts";
import {cv,recCv,readCameraInfo,drawRecordFrame} from "../camera/camera.ts";
import {clipSpec,type ClipProfile,type Segment} from "./highlight.ts";
import {$,toast} from "../ui/dom.ts";
import {t} from "../i18n/i18n.ts";
import {Capacitor} from "@capacitor/core";
import {Filesystem,Directory} from "@capacitor/filesystem";
import {Share} from "@capacitor/share";

// prefer MP4 (universal playback); webm only as a last-resort fallback
// H.264 level 4.2 is the first candidate because 1080p60 exceeds level 3.0
const REC_MIME=(()=>{if(typeof MediaRecorder==="undefined")return "";for(const t of ["video/mp4;codecs=avc1.64002A","video/mp4;codecs=avc1.4D402A","video/mp4;codecs=avc1.42E02A","video/mp4;codecs=avc1.640028","video/mp4;codecs=avc1.42E01E","video/mp4;codecs=avc1","video/mp4","video/webm;codecs=vp8","video/webm"]){try{if(MediaRecorder.isTypeSupported(t))return t}catch(e){}}return ""})();
const REC_EXT=REC_MIME.includes("mp4")?"mp4":"webm";
let chunks:Blob[]=[];

const clipsRoot=$("#clips"), previewBox=$("#preview"), previewVid=$<HTMLVideoElement>("#previewVid"), previewLoad=$("#previewLoad"), previewSpin=$("#previewSpin"), previewMsg=$("#previewMsg"), dlPrev=$<HTMLAnchorElement>("#dlPrev"), dlFull=$<HTMLAnchorElement>("#dlFull"), dlToggle=$("#dlToggle"), dlMenu=$("#dlMenu"), sharePrev=$("#sharePrev");
dlPrev.download=`novacore-highlights.${REC_EXT}`;dlFull.download=`novacore-full.${REC_EXT}`;
let fullBlob:Blob|null=null, fullURL:string|null=null, previewBlob:Blob|null=null, previewURL:string|null=null, clipState="idle", highlightPlan:Segment[]=[], highlightTotal=0, clipPortrait=false;
let clipProfile:ClipProfile|null=null;
let gen=0; // bumped by resetClips(): late results of a previous game's recorder/highlight cut are ignored

function recorderOptions(profile:ClipProfile|null){
  const opts:MediaRecorderOptions={};
  if(REC_MIME)opts.mimeType=REC_MIME;
  if(profile?.bps)opts.videoBitsPerSecond=profile.bps;
  return opts;
}
function makeRecorder(stream:MediaStream,profile:ClipProfile|null){
  try{return new MediaRecorder(stream,recorderOptions(profile))}
  catch(e){return new MediaRecorder(stream,REC_MIME?{mimeType:REC_MIME}:undefined)}
}

export function startRec(){
  chunks=[];
  clipPortrait=innerHeight>innerWidth;
  const info=readCameraInfo();
  S.camFps=info.fps;
  clipProfile=clipSpec(info.w,info.h,info.fps,clipPortrait);
  S.recFrameMs=clipProfile.fps>=60?15:28;
  recCv.width=clipProfile.w;
  recCv.height=clipProfile.h;
  previewBox.classList.toggle("portrait",clipPortrait);
  let stream:MediaStream|null=null;
  try{
    drawRecordFrame();
    stream=recCv.captureStream(clipProfile.fps);
    const rec=S.rec=makeRecorder(stream,clipProfile);
    rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
    rec.start(1000);
    console.info(`NovaCore klipas: ${clipProfile.w}×${clipProfile.h} @ ${clipProfile.fps} fps, ${(clipProfile.bps/1e6).toFixed(1)} Mbps`);
  }catch(e){
    stream?.getTracks().forEach(t=>t.stop());
    S.rec=null;
  }
}

export function openClips(){ // also from Boksas results (src/boxing)
  $("#end").classList.add("hide");
  clipsRoot.classList.remove("hide");
  if(clipState==="ready"){
    previewVid.currentTime=0;
    previewVid.play().catch(()=>{});
  }
}
$("#toClips").onclick=openClips;
previewVid.onerror=()=>{if(clipState==="ready")setClipState("error",t("clip.playFail"))};

function setDlOpen(open:boolean){
  dlMenu.hidden=!open;
  dlToggle.setAttribute("aria-expanded",String(open));
}
dlToggle.onclick=e=>{e.stopPropagation();setDlOpen(dlMenu.hidden as boolean)};
document.addEventListener("click",e=>{if(!(e.target as Element).closest("#dlWrap"))setDlOpen(false)});
document.addEventListener("keydown",e=>{if(e.key==="Escape")setDlOpen(false)});
dlMenu.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>setTimeout(()=>setDlOpen(false),80)));

// Android app: a blob <a download> does nothing in the WebView and navigator.share is missing,
// so the clip is written to the app cache and handed to the native share sheet (save to Files/Photos, send, ...)
const native=Capacitor.isNativePlatform();
const b64=(b:Blob)=>new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok((r.result as string).split(",")[1]||"");r.onerror=()=>no(r.error);r.readAsDataURL(b)});
async function nativeShare(blob:Blob,name:string){
  const CH=3<<20; // 3 MB per bridge call: a full 1080p60 clip can be >100 MB, one base64 string that big crashes the WebView
  try{
    await Filesystem.writeFile({path:name,directory:Directory.Cache,data:await b64(blob.slice(0,CH))});
    for(let i=CH;i<blob.size;i+=CH)await Filesystem.appendFile({path:name,directory:Directory.Cache,data:await b64(blob.slice(i,i+CH))});
    const {uri}=await Filesystem.getUri({path:name,directory:Directory.Cache});
    await Share.share({title:"NovaCore",files:[uri]});
  }catch(e){if(!/cancel/i.test(String(e)))toast(t("clip.shareFail"))}
}
if(native){
  dlPrev.addEventListener("click",e=>{e.preventDefault();if(previewBlob)nativeShare(previewBlob,dlPrev.download)});
  dlFull.addEventListener("click",e=>{e.preventDefault();if(fullBlob)nativeShare(fullBlob,dlFull.download)});
}

async function sharePreviewClip(){
  if(!previewBlob)return;
  if(native)return nativeShare(previewBlob,`novacore-highlights.${REC_EXT}`);
  const type=(previewBlob.type||REC_MIME||"video/mp4").split(";")[0];
  const ext=type.includes("mp4")?"mp4":"webm";
  const file=new File([previewBlob],`novacore-highlights.${ext}`,{type});
  try{
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
      await navigator.share({files:[file],title:"NovaCore",text:t("clip.shareTxt")});
      return;
    }
  }catch(e){if((e as Error).name==="AbortError")return}
  const a=document.createElement("a");a.href=previewURL!;a.download=`novacore-highlights.${ext}`;
  document.body.appendChild(a);a.click();a.remove();
}
sharePrev.onclick=sharePreviewClip;

function setClipState(state:string,message?:string){
  clipState=state;
  const ready=state==="ready";
  // while the highlight is being cut (real-time replay, up to ~30 s) show the full clip PAUSED on a poster frame:
  // playing it would decode a second 1080p60 stream next to the cut's decode + encode and make phones stutter
  const showFull=state==="processing"&&!!fullURL;
  previewVid.hidden=!(ready||showFull);
  previewLoad.hidden=ready;
  previewLoad.classList.toggle("over",showFull);
  previewSpin.hidden=state!=="processing";
  if(showFull&&previewVid.src!==fullURL)previewVid.src=fullURL!; // no play(): the full clip plays only if the player taps it
  if(state==="processing")previewMsg.innerHTML=`${t("clip.cutting")}${showFull?`<small id="previewEta">${t("clip.prep")}</small>`:`<small>${t("clip.cutHint")}</small>`}`;
  else if(state==="error")previewMsg.innerHTML=`${message||t("clip.err")}<small>${t("clip.errFull")}</small>`;
  else if(state==="unavailable")previewMsg.innerHTML=`${t("clip.none")}<small>${t("clip.noRec")}</small>`;
  if(fullURL){dlFull.href=fullURL;dlFull.hidden=false}else{dlFull.hidden=true;dlFull.removeAttribute("href")}
  if(previewURL){dlPrev.href=previewURL;dlPrev.hidden=false}else{dlPrev.hidden=true;dlPrev.removeAttribute("href")}
  dlToggle.hidden=!(fullURL||previewURL);
  if(dlToggle.hidden)setDlOpen(false);
  sharePrev.hidden=!previewBlob;
  if(ready){
    if(previewVid.src!==previewURL)previewVid.src=previewURL!;
    if(!clipsRoot.classList.contains("hide"))previewVid.play().catch(()=>{});
  }
}

let etaTimer=0;
function preparePreview(){
  if(!fullBlob||!fullBlob.size){setClipState("unavailable");return}
  setClipState("processing");
  const plan=highlightPlan.length?highlightPlan:[{start:0,end:Math.min(16,Math.max(1,highlightTotal))}];
  // the cut replays the segments in real time, so the wait ≈ their total length – show it counting down
  const total=plan.reduce((n,s)=>n+Math.max(0,s.end-s.start),0),startedAt=performance.now();
  clearInterval(etaTimer);
  etaTimer=setInterval(()=>{
    const eta=document.getElementById("previewEta");
    if(!eta||clipState!=="processing"){clearInterval(etaTimer);return}
    const left=Math.max(1,Math.ceil(total-(performance.now()-startedAt)/1000));
    eta.textContent=t("clip.eta",{n:left});
  },500);
  const g=gen;
  makeHighlightClip(fullBlob,plan,poster=>{if(g===gen&&clipState==="processing")previewVid.poster=poster})
    .then(blob=>{if(g!==gen)return;previewBlob=blob;previewURL=URL.createObjectURL(blob);setClipState("ready")})
    .catch(err=>{if(g!==gen)return;console.error("Highlight preview:",err);setClipState("error")})
    .finally(()=>clearInterval(etaTimer));
}

function seekVideo(video:HTMLVideoElement,time:number){
  return new Promise<void>(resolve=>{
    const target=Math.max(0,time);
    if(Math.abs(video.currentTime-target)<0.02)return resolve();
    let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);video.removeEventListener("seeked",finish);resolve()};
    const timer=setTimeout(finish,2500);
    video.addEventListener("seeked",finish);
    try{video.currentTime=target}catch(e){finish()}
  });
}

const HAS_VFC=typeof HTMLVideoElement!=="undefined"&&"requestVideoFrameCallback" in HTMLVideoElement.prototype;
// draw once per DECODED frame (requestVideoFrameCallback), not once per screen refresh: rAF redraws duplicates and
// misses frames when the phone is busy. rAF stays as the fallback (old browsers, or rVFC never firing for the hidden video).
function playSegment(video:HTMLVideoElement,c:CanvasRenderingContext2D,canvas:HTMLCanvasElement,start:number,end:number){
  return new Promise<void>((resolve,reject)=>{
    let done=false,useVfc=HAS_VFC,gotFrame=false,vfcId=0,watch=0;
    const finish=()=>{if(done)return;done=true;clearTimeout(watch);video.removeEventListener("ended",finish);video.pause();resolve()};
    const next=()=>{if(useVfc)vfcId=video.requestVideoFrameCallback(draw);else requestAnimationFrame(()=>draw())};
    const draw=(_now?:number,meta?:VideoFrameCallbackMetadata)=>{
      if(done)return;
      if(meta)gotFrame=true;
      c.drawImage(video,0,0,canvas.width,canvas.height);
      if(video.ended||(meta?meta.mediaTime:video.currentTime)>=end){finish();return}
      next();
    };
    video.addEventListener("ended",finish); // rVFC does not fire after the last frame
    try{video.currentTime=Math.max(0,start)}catch(e){}
    video.play().then(()=>{
      next();
      if(useVfc)watch=setTimeout(()=>{if(!done&&!gotFrame){video.cancelVideoFrameCallback(vfcId);useVfc=false;next()}},500);
    }).catch(reject);
  });
}

function makeHighlightClip(source:Blob,segments:Segment[],onPoster?:(dataURL:string)=>void){
  return new Promise<Blob>((resolve,reject)=>{
    const src=document.createElement("video");
    src.muted=true;src.playsInline=true;src.preload="auto";src.setAttribute("aria-hidden","true");
    src.style.cssText="position:fixed;left:-20px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;display:block";
    const srcURL=URL.createObjectURL(source);
    src.src=srcURL;document.body.appendChild(src);
    const out=document.createElement("canvas");
    out.width=recCv.width||cv.width;out.height=recCv.height||cv.height;
    const outCtx=out.getContext("2d")!;
    // the highlight is a preview/share clip: 30 fps (and the 30 fps bitrate tier) halves the real-time re-encode;
    // the full clip keeps the camera fps
    const profile=clipSpec(out.width,out.height,30,out.height>out.width);
    const stream=out.captureStream(profile.fps);
    let recorder:MediaRecorder,parts:Blob[]=[],settled=false,guard=0;
    const cleanup=()=>{
      clearTimeout(guard);
      URL.revokeObjectURL(srcURL);
      src.remove();
      stream.getTracks().forEach(t=>t.stop());
    };
    const fail=(err:unknown)=>{
      if(settled)return;
      settled=true;
      try{recorder&&recorder.stop()}catch(e){}
      cleanup();reject(err);
    };
    try{recorder=makeRecorder(stream,profile)}catch(e){cleanup();reject(e);return}
    recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
    recorder.onerror=e=>fail((e as any).error||new Error("MediaRecorder error"));
    recorder.onstop=()=>{
      if(settled)return;
      settled=true;cleanup();
      const blob=new Blob(parts,{type:recorder.mimeType||REC_MIME||"video/webm"});
      blob.size?resolve(blob):reject(new Error("Empty highlight clip"));
    };
    guard=setTimeout(()=>fail(new Error("Highlight preview timeout")),120000);
    src.onerror=()=>fail(new Error("Could not load full clip"));
    src.onloadeddata=async()=>{
      if(settled)return;
      try{
        src.pause();
        await seekVideo(src,segments[0].start);
        outCtx.drawImage(src,0,0,out.width,out.height);
        try{onPoster?.(out.toDataURL("image/jpeg",0.8))}catch(e){}
        recorder.start(500);
        for(const seg of segments){
          await seekVideo(src,seg.start);
          await playSegment(src,outCtx,out,seg.start,seg.end);
        }
        recorder.stop();
      }catch(e){fail(e)}
    };
  });
}

// game over: finalize the full clip, then cut the highlight preview from it
export function finishClips(plan:Segment[],total:number){
  highlightTotal=total;highlightPlan=plan;
  const rec=S.rec;
  if(rec){
    setClipState("processing");
    const g=gen;
    rec.onstop=()=>{
      if(g!==gen)return;
      fullBlob=new Blob(chunks,{type:rec.mimeType||REC_MIME||"video/webm"});
      if(fullBlob.size){fullURL=URL.createObjectURL(fullBlob);preparePreview()}
      else setClipState("unavailable");
    };
    rec.stop();
  }else setClipState("unavailable");
}

// "Žaisti dar kartą" / "Į pradžią": drop this game's clips (object URLs freed) so the next game starts clean
export function resetClips(){
  gen++;clearInterval(etaTimer);
  try{if(S.rec&&S.rec.state!=="inactive")S.rec.stop()}catch(e){}
  for(const u of [fullURL,previewURL])if(u)URL.revokeObjectURL(u);
  chunks=[];fullBlob=previewBlob=null;fullURL=previewURL=null;highlightPlan=[];
  previewVid.pause();previewVid.removeAttribute("src");previewVid.removeAttribute("poster");previewVid.load();
  setDlOpen(false);setClipState("idle");
}
