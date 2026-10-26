// "Didelis ekranas" – the phone side. One room code, a big scoreboard page on the TV/laptop.
// Transport: Supabase Realtime broadcast (different devices, needs internet) + BroadcastChannel (same browser / an extra window,
// works offline). The phone keeps the camera/pose work; the TV only gets
// scores, the clock, the exercise name and the phase – never camera frames or the nickname.
// The game calls screenPhase() at ready/play/done; a 500 ms publisher keeps the clock and scores in sync.
import type {RealtimeChannel} from "@supabase/supabase-js";
import {S} from "../game/state.ts";
import {ROUND_SECS} from "../detect/exercises.ts";
import {sb} from "../online/api.ts";
import {t,lang} from "../i18n/i18n.ts";
import {$,sheet,toast} from "../ui/dom.ts";
import {WEB,share} from "../ui/social.ts";
import {channelName,isCode,makeCode,SCREEN_BC,type ScreenPhase,type ScreenState} from "./room.ts";

const KEY="novacore.screen"; // sessionStorage: a code lasts for this browser tab, not forever
const store={
  get(){try{return sessionStorage.getItem(KEY)}catch(e){return null}},
  set(v:string|null){try{v?sessionStorage.setItem(KEY,v):sessionStorage.removeItem(KEY)}catch(e){}},
};
// A TV tab opened from the phone may inherit sessionStorage; it must never become a second publisher.
const tvRoute=()=>/^#\/?ekranas(\/|$)/.test(location.hash);
let code:string|null=tvRoute()?null:store.get();
if(code&&!isCode(code)){code=null;store.set(null);}
let phase:ScreenPhase="idle";
let bc:BroadcastChannel|null=null, ch:RealtimeChannel|null=null, joined=false;
let timer=0, lastSent=0, tvSeen=0;
let camOn=false, camPeer:string|null=null;
let pc:RTCPeerConnection|null=null, camStream:MediaStream|null=null, camCv:HTMLCanvasElement|null=null;
let camDraw=0, camRemoteSet=false, camPendingIce:RTCIceCandidateInit[]=[], camGen=0;

const sheetEl=$<HTMLDialogElement>("#screenSheet"), offBox=$("#castOff"), onBox=$("#castOnBox"),
  codeEl=$("#castCode"), urlEl=$<HTMLInputElement>("#castUrl"), rowState=$("#castState"),
  liveEl=$("#castLive"), liveTxt=$("#castLiveTxt"), noteEl=$("#castNote"), netEl=$("#castNet"),
  readyEl=$("#readyCast"), readyCode=$("#readyCastCode"), homeCast=$("#homeCast"), setupCast=$("#setupCast"),
  camSwitch=$<HTMLButtonElement>("#camSwitch"), camState=$("#camState");
const castSheet=sheet(sheetEl);

const roomUrl=()=>code?`${WEB}/#/ekranas/${code}`:"";
const isOn=()=>!!code;

function refreshUI(){
  const on=isOn();
  offBox.hidden=on;onBox.hidden=!on;
  codeEl.textContent=code||"------";
  urlEl.value=roomUrl();
  rowState.textContent=on?t("cast.onState",{code:code!}):t("setup.tvSub");
  readyEl.hidden=!on;
  readyCode.textContent=code||"";
  homeCast.dataset.on=on?"1":"0";
  setupCast.dataset.on=on?"1":"0";
  refreshLive();
  refreshCamUI();
}
function refreshLive(){
  const live=isOn()&&tvSeen>0&&performance.now()-tvSeen<15000;
  const v=live?"1":"0";
  if(liveEl.dataset.on!==v)liveEl.dataset.on=v;
  const txt=t(live?"cast.tvOn":"cast.waitTv");
  if(liveTxt.textContent!==txt)liveTxt.textContent=txt;
}
function markTv(){tvSeen=performance.now();refreshLive()}
function refreshCamUI(){
  const on=camOn;
  if(camSwitch.getAttribute("aria-checked")!==String(on))camSwitch.setAttribute("aria-checked",String(on));
  const txt=t(!on?"cast.camOff":phase!=="ready"&&phase!=="play"?"cast.camLater":camRemoteSet?"cast.camLive":"app.connecting");
  if(camState.textContent!==txt)camState.textContent=txt;
}

function stopTransport(){
  clearInterval(timer);timer=0;
  if(bc){try{bc.close()}catch(e){}bc=null}
  if(ch&&sb){try{sb.removeChannel(ch).catch(()=>{})}catch(e){}}
  ch=null;joined=false;tvSeen=0;
}
function startTransport(){
  stopTransport();
  if(!code)return;
  try{
    if(typeof BroadcastChannel!=="undefined"){
      bc=new BroadcastChannel(SCREEN_BC);
      bc.onmessage=e=>{
        const d=e.data;
        if(!d||d.code!==code)return;
        if(d.hello)markTv();
        else if(d.signal)camSignal(d.signal,d.payload);
      };
    }
  }catch(e){bc=null}
  if(sb){
    try{
      ch=sb.channel(channelName(code),{config:{broadcast:{self:false}}});
      ch.on("broadcast",{event:"hello"},m=>{if((m.payload as any)?.code===code)markTv()});
      ch.on("broadcast",{event:"cam-request"},m=>{const p=m.payload as any;if(p?.code===code)camSignal("cam-request",p)});
      ch.on("broadcast",{event:"cam-answer"},m=>{const p=m.payload as any;if(p?.code===code)camSignal("cam-answer",p)});
      ch.on("broadcast",{event:"cam-ice"},m=>{const p=m.payload as any;if(p?.code===code)camSignal("cam-ice",p)});
      ch.subscribe(status=>{
        joined=status==="SUBSCRIBED";
        if(joined)publish(true);
      });
    }catch(e){ch=null;joined=false}
  }
  timer=window.setInterval(tick,500);
  publish(true);
}

// ---------- camera per TV (WebRTC, signalled over the same room) ----------
function camSignal(event:string,msg:any){
  if(!msg||msg.code!==code)return;
  if(event==="cam-request")onCamRequest(msg);
  else if(event==="cam-answer")onCamAnswer(msg);
  else if(event==="cam-ice")onCamIce(msg);
}
function sendCam(event:string,data:Record<string,any>={}){
  if(!code)return;
  const msg={code,peer:camPeer,...data};
  try{bc?.postMessage({code,signal:event,payload:msg})}catch(e){}
  if(ch&&joined){try{ch.send({type:"broadcast",event,payload:msg}).catch(()=>{})}catch(e){}}
}
// The phone's live canvas already has the camera + skeleton; copy it into a 720p canvas so the TV gets a small,
// stable 20 fps stream instead of the full camera resolution (the game/pose/clip work must stay smooth).
function drawCam(){
  const src=document.getElementById("cv") as HTMLCanvasElement|null;
  if(!camCv||!src||!src.width||!src.height)return;
  const c=camCv.getContext("2d");
  if(!c)return;
  const W=camCv.width,H=camCv.height;
  c.fillStyle="#0D1030";c.fillRect(0,0,W,H);
  const s=Math.min(W/src.width,H/src.height);
  const dw=Math.round(src.width*s),dh=Math.round(src.height*s);
  c.drawImage(src,(W-dw)/2,(H-dh)/2,dw,dh);
}
async function startCamCast(){
  if(!code||pc||!camOn||(phase!=="ready"&&phase!=="play"))return;
  const gen=++camGen;
  if(typeof RTCPeerConnection==="undefined"){camOn=false;refreshCamUI();return}
  const src=document.getElementById("cv") as HTMLCanvasElement|null;
  if(!src||typeof src.captureStream!=="function"){camOn=false;refreshCamUI();return}
  camCv=document.createElement("canvas");camCv.width=1280;camCv.height=720;
  const canvas=camCv;
  drawCam();
  camDraw=window.setInterval(drawCam,50);
  try{
    const stream=canvas.captureStream(20);
    camStream=stream;
    const connection=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    pc=connection;
    camRemoteSet=false;camPendingIce=[];
    connection.onicecandidate=e=>{if(e.candidate)sendCam("cam-ice",{candidate:e.candidate.toJSON()})};
    connection.onconnectionstatechange=()=>{
      if(connection.connectionState==="failed"&&pc===connection){
        stopCamCast(true);
        camOn=false;camPeer=null;
        publish(true);refreshCamUI();
      }
    };
    for(const t of stream.getTracks())connection.addTrack(t,stream);
    const offer=await connection.createOffer();
    await connection.setLocalDescription(offer);
    if(gen!==camGen||pc!==connection)return;
    sendCam("cam-offer",{sdp:connection.localDescription});
    refreshCamUI();
  }catch(e){
    if(gen!==camGen)return;
    stopCamCast(false);
    camOn=false;camPeer=null;
    publish(true);refreshCamUI();
  }
}
function stopCamCast(sendStop=true){
  camGen++;
  clearInterval(camDraw);camDraw=0;
  const had=!!pc;
  if(camStream){camStream.getTracks().forEach(t=>{try{t.stop()}catch(e){}});camStream=null}
  if(pc){try{pc.onicecandidate=null;pc.close()}catch(e){};pc=null}
  camCv=null;camRemoteSet=false;camPendingIce=[];
  if(had&&sendStop&&code)sendCam("cam-stop",{});
  refreshCamUI();
}
function onCamRequest(msg:any){
  if(!code||msg.code!==code)return;
  const peer=typeof msg.peer==="string"?msg.peer.slice(0,36):null;
  if(msg.on){
    if(pc)stopCamCast(true); // a new TV (or the same one reconnecting) always gets a fresh offer
    camOn=true;camPeer=peer;
    if(phase==="ready"||phase==="play")startCamCast();
    publish(true);refreshCamUI();
  }else if(camOn&&(!camPeer||!peer||camPeer===peer)){
    camOn=false;camPeer=null;
    stopCamCast(true);
    publish(true);refreshCamUI();
  }
}
async function onCamAnswer(msg:any){
  const connection=pc;
  if(!connection||!code||msg.code!==code||!msg.sdp)return;
  if(camPeer&&msg.peer!==camPeer)return;
  if(!camPeer&&typeof msg.peer==="string")camPeer=msg.peer;
  try{
    await connection.setRemoteDescription(msg.sdp);
    camRemoteSet=true;
    for(const c of camPendingIce)connection.addIceCandidate(c).catch(()=>{});
    camPendingIce=[];
    refreshCamUI();
  }catch(e){stopCamCast(true)}
}
function onCamIce(msg:any){
  const connection=pc;
  if(!connection||!code||msg.code!==code||!msg.candidate)return;
  if(camPeer&&msg.peer!==camPeer)return;
  if(!camRemoteSet){camPendingIce.push(msg.candidate);return}
  connection.addIceCandidate(msg.candidate).catch(()=>{});
}
function syncCamera(){
  if(camOn&&(phase==="ready"||phase==="play")){
    if(!pc)startCamCast();
  }else if(pc){
    stopCamCast(true);
  }
  refreshCamUI();
}
function toggleCam(){
  if(!code)return;
  if(camOn){
    camOn=false;camPeer=null;
    stopCamCast(true);
    publish(true);
  }else{
    camOn=true;camPeer=null;
    if(phase==="ready"||phase==="play")startCamCast();
    publish(true);
  }
  refreshCamUI();
}

// other game modes (src/boxing) override what the board shows (exercise, clock, scores); null = the rep game
let modeState:(()=>Partial<ScreenState>)|null=null;
export function setScreenMode(fn:(()=>Partial<ScreenState>)|null){modeState=fn}
function buildState():ScreenState{
  const now=performance.now();
  const playing=phase==="play", done=phase==="done";
  const elapsed=playing?Math.max(0,(now-S.t0)/1000):0;
  const round=playing?Math.floor(elapsed/ROUND_SECS):0;
  const players:1|2=S.players===1?1:2;
  const ex=playing&&S.activeEX.length?S.activeEX[(round+S.exShift)%S.activeEX.length]:null;
  const score:[number,number]=playing||done?[S.score[0]|0,S.score[1]|0]:[0,0];
  if(players===1)score[1]=0;
  return {
    v:1,
    code:code!,
    phase,
    players,
    duration:S.duration,
    left:playing?Math.max(0,S.duration-elapsed):done?0:S.duration,
    round,
    mult:1+round,
    ex:ex?{id:ex.id,name:ex.name}:null,
    score,
    reps:playing||done?S.scoreEvents.length:0,
    winner:done&&players===2?(score[0]===score[1]?0:score[0]>score[1]?1:2):0,
    cam:camOn,
    sent:Date.now(),
    lang,
    ...modeState?.(),
  };
}
function publish(force=false){
  if(!code||tvRoute())return;
  if(!force&&document.visibilityState==="hidden"&&phase==="play")return;
  const state=buildState();
  try{bc?.postMessage({code,state})}catch(e){}
  if(ch&&joined){
    try{ch.send({type:"broadcast",event:"state",payload:state}).catch(()=>{})}catch(e){}
  }
  lastSent=performance.now();
}
function tick(){
  if(!code)return;
  const fast=phase==="play"||phase==="ready";
  if(performance.now()-lastSent>=(fast?500:2000))publish();
  refreshLive();
}

function openCast(){
  refreshUI();
  castSheet.open();
  noteEl.textContent="";
  publish(true); // a TV that just connected gets the current phase immediately
}
function enable(){
  if(!code)code=makeCode();
  store.set(code);
  startTransport();
  refreshUI();
  noteEl.textContent="";
}
function disable(){
  if(code){
    camOn=false;
    stopCamCast(true);
    camPeer=null;
    publish(true);
  }
  stopTransport();
  code=null;store.set(null);
  refreshUI();
  noteEl.textContent="";
}
async function copyLink(){
  const url=roomUrl();
  if(!url)return;
  try{await navigator.clipboard.writeText(url);toast(t("cast.copied"))}
  catch(e){urlEl.focus();urlEl.select();noteEl.textContent=t("cast.copyManual")}
}

// game.ts calls this at ready / play / done (and at idle when leaving a finished game)
export function screenPhase(p:ScreenPhase){
  phase=p;
  syncCamera();
  publish(true);
  refreshCamUI();
}

// ---------- DOM wiring ----------
$("#castOpen").onclick=openCast;
// any header cast button, including ones built later by the minigame modules (src/sprint, src/boxing, src/longjump)
document.addEventListener("click",e=>{
  const b=(e.target as Element|null)?.closest?.("[data-tv]");
  if(b){e.preventDefault();openCast()}
});
homeCast.onclick=openCast;
setupCast.onclick=openCast;
$("#screenClose").onclick=castSheet.close;
$("#castOn").onclick=enable;
$("#castOffBtn").onclick=disable;
$("#castCopy").onclick=copyLink;
camSwitch.onclick=toggleCam;
$("#castShare").onclick=()=>{const url=roomUrl();if(url)share(url,t("cast.shareTxt",{code:code!}),noteEl)};
$("#castOpenPage").onclick=()=>{
  const url=roomUrl();
  if(!url)return;
  const w=window.open(url,"_blank");
  if(w){try{w.opener=null}catch(e){}}
  else noteEl.textContent=t("cast.popup");
};
if(!sb)netEl.hidden=false;
const host=`${WEB.replace(/^https?:\/\//,"")}/#/ekranas`; // the address to type on a TV without the link
document.querySelectorAll(".cast-host").forEach(e=>e.textContent=host);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&code)publish(true)});

if(code)startTransport();
refreshUI();
