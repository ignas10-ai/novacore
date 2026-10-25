// Big-screen receiver (route #/ekranas/<code>): the TV/laptop page. It only listens – the phone publishes
// scores/clock/phase over Supabase Realtime (across devices) and BroadcastChannel (same browser). The first
// paint is a code entry screen so a TV without the link can still be connected with the 6-character code.
import type {RealtimeChannel} from "@supabase/supabase-js";
import {sb} from "../online/api.ts";
import {$,plural,replay} from "../ui/dom.ts";
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
  codeIn=$<HTMLInputElement>("#bsCodeIn"), form=$<HTMLFormElement>("#bsConnect"), fsBtn=$("#bsFs");

let room="", bc:BroadcastChannel|null=null, ch:RealtimeChannel|null=null;
let state:ScreenState|null=null, baseAt=0, baseLeft=0, lastSeenAt=0, seenAny=false, demoId="";
let hello=0, ticker=0, lastSecond=-1, prevScore:[number,number]=[0,0], mounted=false;
const fmt=(sec:number)=>{const n=Math.max(0,Math.ceil(sec));return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`};

function cleanup(){
  clearInterval(hello);hello=0;
  if(bc){try{bc.close()}catch(e){}bc=null}
  if(ch&&sb){try{sb.removeChannel(ch).catch(()=>{})}catch(e){}ch=null}
  state=null;seenAny=false;demoId="";prevScore=[0,0];lastSecond=-1;
  releaseWakeLock();
}
function sendHello(){
  if(!room)return;
  try{bc?.postMessage({code:room,hello:1})}catch(e){}
  if(ch){try{ch.send({type:"broadcast",event:"hello",payload:{code:room}}).catch(()=>{})}catch(e){}}
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

function render(s:ScreenState){
  root.dataset.phase=s.phase;
  root.dataset.players=String(s.players);
  root.dataset.winner=s.phase==="done"?String(s.winner):"";
  footCode.textContent=room;
  waitCode.textContent=room;
  waitLine.hidden=s.phase!=="idle";
  p1Label.textContent=s.players===1?"Solo":"P1";
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
    roundEl.textContent="Rankos aukštyn";
    exEl.textContent="Pasiruošimas";
    setDemo("",s.phase);
    return;
  }
  if(s.phase==="done"){
    roundEl.hidden=true;exEl.hidden=true;
    setDemo("",s.phase);
    verdictTag.textContent="Pabaiga";
    verdictTxt.textContent=s.players===1?"Tavo rezultatas":s.winner===0?"Lygiosios!":`Žaidėjas ${s.winner} laimi!`;
    repsEl.textContent=`${s.reps} ${plural(s.reps,["judesys","judesiai","judesių"])} · ${s.duration/60} min`;
    timerEl.textContent="0:00";
    barEl.style.transform="scaleX(0)";
    root.dataset.low="0";
    return;
  }
  // play
  roundEl.hidden=false;exEl.hidden=false;
  roundEl.textContent=`Raundas ${s.round+1}`;
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
  const txt=recent?"Prijungta":"Laukiama telefono";
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
  errEl.textContent=raw&&!room?"Kodas – 6 raidės arba skaičiai.":"";
  waitLine.hidden=!room;
  waitCode.textContent=room||"------";
  footCode.textContent=room||"------";
  if(!room)return;
  keepScreenAwake();
  try{
    bc=new BroadcastChannel(SCREEN_BC);
    bc.onmessage=e=>{const d=e.data;if(d?.code===room&&d.state)receive(d.state)};
  }catch(e){bc=null}
  if(sb){
    try{
      ch=sb.channel(channelName(room),{config:{broadcast:{self:false}}});
      ch.on("broadcast",{event:"state"},m=>{const s=readState(m.payload);if(s&&s.code===room)receive(s)});
      ch.subscribe();
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
  if(!isCode(c)){errEl.textContent="Kodas – 6 raidės arba skaičiai. Žiūrėk telefone: Nustatymai → Didelis ekranas.";codeIn.focus();return}
  errEl.textContent="";
  if(c===room)enter(c);else go(`#/ekranas/${c}`,true);
});

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
