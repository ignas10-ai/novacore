// Big-screen receiver (route #/ekranas/<code>): the TV/laptop page. It only listens – the phone publishes
// scores/clock/phase over Supabase Realtime (across devices) and BroadcastChannel (same browser). The first
// paint is a code entry screen so a TV without the link can still be connected with the 6-character code.
import type {RealtimeChannel} from "@supabase/supabase-js";
import {sb} from "../online/api.ts";
import {$,replay} from "../ui/dom.ts";
import {t,tn,lang,setLang} from "../i18n/i18n.ts";
import {translateDom} from "../i18n/dom.ts";
import {icon} from "../ui/icons.ts";
import {coachSvg} from "../ui/coach.ts";
import {onView,go} from "../ui/router.ts";
import {keepScreenAwake,releaseWakeLock} from "../ui/wakelock.ts";
import {channelName,isCode,leftAt,normCode,readState,SCREEN_BC,type ScreenState} from "./room.ts";

const root=$("#screen"), s1=$("#bsS1"), s2=$("#bsS2"), p1Label=$("#bsP1Label"),
  timerEl=$("#bsTimer"), barEl=$("#bsBar"), roundEl=$("#bsRound"), exEl=$("#bsEx"), multEl=$("#bsMult"),
  demoEl=$("#bsDemo"), verdict=$("#bsVerdict"), verdictTag=$("#bsVerdictTag"), verdictTxt=$("#bsVerdictTxt"), repsEl=$("#bsReps"),
  staleEl=$("#bsStale"), liveEl=$("#bsLive"), liveTxt=$("#bsLiveTxt"), footCode=$("#bsFootCode"),
  waitLine=$("#bsWaiting"), waitCode=$("#bsWaitCode"), errEl=$("#bsErr"),
  codeIn=$<HTMLInputElement>("#bsCodeIn"), form=$<HTMLFormElement>("#bsConnect"), fsBtn=$("#bsFs"),
  camVid=$<HTMLVideoElement>("#bsCamVid"), camBg=$<HTMLCanvasElement>("#bsCamBg"), camBtn=$<HTMLButtonElement>("#bsCam"), camBtnTxt=$("#bsCamTxt");

let room="", bc:BroadcastChannel|null=null, ch:RealtimeChannel|null=null;
let state:ScreenState|null=null, baseAt=0, baseLeft=0, lastSeenAt=0, seenAny=false, demoId="";
let hello=0, ticker=0, lastSecond=-1, prevScore:[number,number]=[0,0], mounted=false, tvJoined=false;
const tPeer=(globalThis.crypto?.randomUUID?.()||`tv-${Math.random().toString(36).slice(2,10)}`).slice(0,36);
let tpc:RTCPeerConnection|null=null, tCamWanted=false, tRemoteSet=false, tPending:RTCIceCandidateInit[]=[];
let bgTimer=0; // ambient blurred backdrop, sampled from the video at 2 fps (no second video decoder)
const fmt=(sec:number)=>{const n=Math.max(0,Math.ceil(sec));return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`};

function cleanup(){
  clearInterval(hello);hello=0;
  stopCamView();
  tCamWanted=false;tvJoined=false;
  if(bc){try{bc.close()}catch(e){}bc=null}
  if(ch&&sb){try{sb.removeChannel(ch).catch(()=>{})}catch(e){}ch=null}
  state=null;seenAny=false;demoId="";prevScore=[0,0];lastSecond=-1;
  releaseWakeLock();
}
function sendHello(){
  if(!room)return;
  try{bc?.postMessage({code:room,hello:1})}catch(e){}
  if(ch&&tvJoined){try{ch.send({type:"broadcast",event:"hello",payload:{code:room}}).catch(()=>{})}catch(e){}}
}

function receive(raw:any){
  state=readState(raw);
  if(!state||state.code!==room)return;
  baseAt=performance.now();baseLeft=state.left;lastSeenAt=baseAt;seenAny=true;
  render(state);
  tick();
}

function setScore(el:HTMLElement,i:number,value:number){
  const v=String(value);
  if(el.textContent!==v)el.textContent=v;
  if(el.dataset.d!==String(v.length))el.dataset.d=String(v.length); // 4-digit scores get a smaller font (main.css)
  if(seenAny&&value>prevScore[i]&&el.textContent===v)replay(el,"pop");
}

function setDemo(id:string,phase:string){
  if(phase==="done"){
    if(demoId==="done")return;
    demoId="done";
    demoEl.replaceChildren();
    demoEl.insertAdjacentHTML("beforeend",icon("crown","bs-crown"));
    replay(demoEl,"in");
    return;
  }
  if(!id){
    if(demoId!==""){demoId="";demoEl.replaceChildren()}
    return;
  }
  if(demoId===id)return;
  demoId=id;
  demoEl.replaceChildren(coachSvg(id));
  replay(demoEl,"in");
}

// ---------- camera per TV (WebRTC; the phone is the sender, the TV only answers) ----------
function sendCam(event:string,data:Record<string,any>={}){
  if(!room)return;
  const msg={code:room,peer:tPeer,...data};
  try{bc?.postMessage({code:room,signal:event,payload:msg})}catch(e){}
  if(ch&&tvJoined){try{ch.send({type:"broadcast",event,payload:msg}).catch(()=>{})}catch(e){}}
}
function camSignal(event:string,msg:any){
  if(!msg||msg.code!==room)return;
  if(event==="cam-offer")onCamOffer(msg);
  else if(event==="cam-ice")onCamIce(msg);
  else if(event==="cam-stop")onCamStop(msg);
}
function updateCamBtn(){
  const live=root.dataset.cam==="1";
  const on=tCamWanted||live||!!state?.cam;
  camBtn.setAttribute("aria-pressed",on?"true":"false");
  camBtn.disabled=!state;
  camBtn.setAttribute("aria-label",t(on?"tv.camOffAria":"tv.camAria"));
  const txt=t(on&&!live?"app.cameraDots":"app.camera");
  if(camBtnTxt.textContent!==txt)camBtnTxt.textContent=txt;
}
function stopCamView(){
  if(tpc){try{tpc.close()}catch(e){}tpc=null}
  const s=camVid.srcObject as MediaStream|null;
  if(s)s.getTracks().forEach(t=>{try{t.stop()}catch(e){}});
  camVid.srcObject=null;
  clearInterval(bgTimer);bgTimer=0;
  try{camBg.getContext("2d")?.clearRect(0,0,camBg.width,camBg.height)}catch(e){}
  root.dataset.cam="0";
  tCamWanted=false;tRemoteSet=false;tPending=[];
  updateCamBtn();
}
// The stream keeps its own (portrait) aspect now, so the TV shows the whole frame instead of a cropped/letterboxed
// strip. A 96×54 copy of the video, blurred and stretched behind it, fills the sides with the room itself.
function paintBg(){
  if(camVid.readyState<2)return;
  const vw=camVid.videoWidth,vh=camVid.videoHeight;
  if(!vw||!vh)return;
  const c=camBg.getContext("2d");
  if(!c||!camBg.width||!camBg.height)return;
  const s=Math.max(camBg.width/vw,camBg.height/vh),dw=vw*s,dh=vh*s;
  c.drawImage(camVid,(camBg.width-dw)/2,(camBg.height-dh)/2,dw,dh);
}
function startBg(){
  clearInterval(bgTimer);
  camBg.width=96;camBg.height=54;
  paintBg();
  bgTimer=window.setInterval(paintBg,500);
}
async function onCamOffer(msg:any){
  if(!room||msg.code!==room||!msg.sdp)return;
  if(msg.peer&&msg.peer!==tPeer)return;
  stopCamView();
  tCamWanted=true;
  let started:RTCPeerConnection|null=null;
  try{
    const connection=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    started=connection;
    tpc=connection;
    connection.onicecandidate=e=>{if(e.candidate)sendCam("cam-ice",{candidate:e.candidate.toJSON()})};
    connection.ontrack=e=>{
      if(tpc!==connection)return;
      camVid.srcObject=e.streams[0]||new MediaStream([e.track]);
      camVid.play().catch(()=>{});
      startBg();
      root.dataset.cam="1";
      updateCamBtn();
    };
    connection.onconnectionstatechange=()=>{
      if((connection.connectionState==="failed"||connection.connectionState==="closed")&&tpc===connection)stopCamView();
    };
    await connection.setRemoteDescription(msg.sdp);
    if(tpc!==connection)return;
    tRemoteSet=true;
    for(const c of tPending)connection.addIceCandidate(c).catch(()=>{});
    tPending=[];
    const answer=await connection.createAnswer();
    await connection.setLocalDescription(answer);
    if(tpc!==connection)return;
    sendCam("cam-answer",{sdp:connection.localDescription});
    updateCamBtn();
  }catch(e){if(started&&tpc===started)stopCamView()}
}
function onCamIce(msg:any){
  const connection=tpc;
  if(!connection||!room||msg.code!==room||!msg.candidate)return;
  if(msg.peer&&msg.peer!==tPeer)return;
  if(!tRemoteSet){tPending.push(msg.candidate);return}
  connection.addIceCandidate(msg.candidate).catch(()=>{});
}
function onCamStop(msg:any){
  if(msg.code!==room)return;
  if(msg.peer&&msg.peer!==tPeer)return;
  stopCamView();
}
function toggleCamTV(){
  if(!state)return;
  const on=!(tCamWanted||root.dataset.cam==="1"||!!state.cam);
  if(on){
    tCamWanted=true;
    sendCam("cam-request",{on:true});
    updateCamBtn();
  }else{
    tCamWanted=false;
    sendCam("cam-request",{on:false});
    stopCamView();
  }
}

function render(s:ScreenState){
  // the board speaks the phone's language (static text re-translated once per change; the rest is set below)
  if(s.lang!==lang){setLang(s.lang);document.documentElement.lang=s.lang;translateDom(root)}
  root.dataset.phase=s.phase;
  root.dataset.players=String(s.players);
  root.dataset.winner=s.phase==="done"?String(s.winner):"";
  if(!s.cam&&!tCamWanted&&root.dataset.cam==="1")stopCamView();
  updateCamBtn();
  footCode.textContent=room;
  waitCode.textContent=room;
  waitLine.hidden=s.phase!=="idle";
  p1Label.textContent=s.players===1?t("mode.Solo"):"P1";
  multEl.hidden=s.phase!=="play";
  staleEl.hidden=true;
  verdict.hidden=s.phase!=="done";
  if(s.phase==="idle"){
    s1.textContent="0";s2.textContent="0";s1.dataset.d="1";s2.dataset.d="1";
    verdictTxt.textContent="";repsEl.textContent="";
    setDemo("",s.phase);
    return;
  }
  setScore(s1,0,s.score[0]);setScore(s2,1,s.score[1]);
  prevScore=s.score;
  if(s.phase==="ready"){
    roundEl.hidden=false;exEl.hidden=false;
    roundEl.textContent=t("cue.arms");
    exEl.textContent=t("app.prep");
    setDemo("",s.phase);
    return;
  }
  if(s.phase==="done"){
    roundEl.hidden=true;exEl.hidden=true;
    setDemo("",s.phase);
    verdictTag.textContent=t("tv.end");
    verdictTxt.textContent=s.players===1?t("res.yours"):s.winner===0?t("res.tie"):t("tv.pWins",{n:s.winner});
    repsEl.textContent=`${tn("u.moves",s.reps)} · ${t("u.min",{n:s.duration/60})}`;
    timerEl.textContent="0:00";
    barEl.style.transform="scaleX(0)";
    root.dataset.low="0";
    return;
  }
  // play
  roundEl.hidden=false;exEl.hidden=false;
  roundEl.textContent=t("tv.round",{n:s.round+1});
  exEl.textContent=s.ex?.name||"";
  multEl.textContent=`×${s.mult}`;
  setDemo(s.ex?.id||"",s.phase);
}

function tick(){
  if(document.body.dataset.view!=="screen"){
    if(mounted){mounted=false;cleanup()}
    return;
  }
  mounted=true;
  const now=performance.now();
  if(state){
    const left=state.phase==="play"?leftAt(baseLeft,baseAt,now):state.phase==="ready"?state.duration:0;
    const sec=Math.ceil(left);
    if(sec!==lastSecond){
      lastSecond=sec;
      timerEl.textContent=fmt(left);
      root.dataset.low=state.phase==="play"&&left<=10&&left>0?"1":"0";
    }
    barEl.style.transform=`scaleX(${state.duration?Math.min(1,left/state.duration):0})`;
  }
  const recent=seenAny&&now-lastSeenAt<8000;
  const live=recent?"1":"0";
  if(liveEl.dataset.on!==live)liveEl.dataset.on=live;
  const txt=t(recent?"tv.connected":"tv.waitPhone");
  if(liveTxt.textContent!==txt)liveTxt.textContent=txt;
  const lost=seenAny&&state?.phase!=="idle"&&now-lastSeenAt>12000;
  if(staleEl.hidden===lost)staleEl.hidden=!lost;
}

function enter(arg:string){
  cleanup();
  mounted=true;
  const raw=normCode(arg||"");
  room=isCode(raw)?raw:"";
  root.dataset.phase=room?"idle":"connect";
  root.dataset.players="2";
  root.dataset.winner="";
  codeIn.value=raw;
  errEl.textContent=raw&&!room?t("tv.codeBad"):"";
  waitLine.hidden=!room;
  waitCode.textContent=room||"------";
  footCode.textContent=room||"------";
  updateCamBtn();
  if(!room)return;
  keepScreenAwake();
  try{
    bc=new BroadcastChannel(SCREEN_BC);
    bc.onmessage=e=>{
      const d=e.data;
      if(!d||d.code!==room)return;
      if(d.state)receive(d.state);
      else if(d.signal)camSignal(d.signal,d.payload);
    };
  }catch(e){bc=null}
  if(sb){
    try{
      ch=sb.channel(channelName(room),{config:{broadcast:{self:false}}});
      ch.on("broadcast",{event:"state"},m=>{const s=readState(m.payload);if(s&&s.code===room)receive(s)});
      ch.on("broadcast",{event:"cam-offer"},m=>{const p=m.payload as any;if(p?.code===room)camSignal("cam-offer",p)});
      ch.on("broadcast",{event:"cam-ice"},m=>{const p=m.payload as any;if(p?.code===room)camSignal("cam-ice",p)});
      ch.on("broadcast",{event:"cam-stop"},m=>{const p=m.payload as any;if(p?.code===room)camSignal("cam-stop",p)});
      ch.subscribe(status=>{tvJoined=status==="SUBSCRIBED"});
    }catch(e){ch=null}
  }
  sendHello();
  clearInterval(hello);hello=window.setInterval(sendHello,5000);
  if(!ticker)ticker=window.setInterval(tick,200);
}
onView("screen",enter);

// code entry (a TV remote can still type 6 characters); valid code -> replace the hash so a reload reconnects
form.addEventListener("submit",e=>{
  e.preventDefault();
  const c=normCode(codeIn.value);
  if(!isCode(c)){errEl.textContent=t("tv.codeBadHelp");codeIn.focus();return}
  errEl.textContent="";
  if(c===room)enter(c);else go(`#/ekranas/${c}`,true);
});

camBtn.onclick=toggleCamTV;
if(typeof RTCPeerConnection==="undefined")camBtn.hidden=true;

// fullscreen is a user gesture; on a TV browser the page usually already fills the screen
const fsRoot=document.documentElement as any;
if(!(fsRoot.requestFullscreen||fsRoot.webkitRequestFullscreen))fsBtn.hidden=true;
else fsBtn.onclick=async()=>{
  try{
    const d=document as any;
    if(d.fullscreenElement||d.webkitFullscreenElement){
      if(d.exitFullscreen)await d.exitFullscreen();else d.webkitExitFullscreen?.();
    }else if(fsRoot.requestFullscreen)await fsRoot.requestFullscreen({navigationUI:"hide"});
    else await fsRoot.webkitRequestFullscreen?.();
  }catch(e){/* rejected if the gesture was lost */}
};
window.addEventListener("pagehide",cleanup);
