// "Didelis ekranas" – the phone side. One room code, a big scoreboard page on the TV/laptop.
// Transport: Supabase Realtime broadcast (different devices, needs internet) + BroadcastChannel (same browser / an extra window,
// works offline). The phone keeps the camera/pose work; the TV only gets
// scores, the clock, the exercise name and the phase – never camera frames or the nickname.
// The game calls screenPhase() at ready/play/done; a 500 ms publisher keeps the clock and scores in sync.
import type {RealtimeChannel} from "@supabase/supabase-js";
import {S} from "../game/state.ts";
import {ROUND_SECS} from "../detect/exercises.ts";
import {sb} from "../online/api.ts";
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

const sheetEl=$<HTMLDialogElement>("#screenSheet"), offBox=$("#castOff"), onBox=$("#castOnBox"),
  codeEl=$("#castCode"), urlEl=$<HTMLInputElement>("#castUrl"), rowState=$("#castState"),
  liveEl=$("#castLive"), liveTxt=$("#castLiveTxt"), noteEl=$("#castNote"), netEl=$("#castNet"),
  readyEl=$("#readyCast"), readyCode=$("#readyCastCode"), homeCast=$("#homeCast"), setupCast=$("#setupCast");
const castSheet=sheet(sheetEl);

const roomUrl=()=>code?`${WEB}/#/ekranas/${code}`:"";
const isOn=()=>!!code;

function refreshUI(){
  const on=isOn();
  offBox.hidden=on;onBox.hidden=!on;
  codeEl.textContent=code||"------";
  urlEl.value=roomUrl();
  rowState.textContent=on?`Įjungta · ${code}`:"Taškai per TV · nuoroda";
  readyEl.hidden=!on;
  readyCode.textContent=code||"";
  homeCast.dataset.on=on?"1":"0";
  setupCast.dataset.on=on?"1":"0";
  refreshLive();
}
function refreshLive(){
  const live=isOn()&&tvSeen>0&&performance.now()-tvSeen<15000;
  const v=live?"1":"0";
  if(liveEl.dataset.on!==v)liveEl.dataset.on=v;
  const txt=live?"TV prijungtas":"Laukiama TV";
  if(liveTxt.textContent!==txt)liveTxt.textContent=txt;
}
function markTv(){tvSeen=performance.now();refreshLive()}

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
      bc.onmessage=e=>{const d=e.data;if(d?.hello&&d.code===code)markTv()};
    }
  }catch(e){bc=null}
  if(sb){
    try{
      ch=sb.channel(channelName(code),{config:{broadcast:{self:false}}});
      ch.on("broadcast",{event:"hello"},m=>{if((m.payload as any)?.code===code)markTv()});
      ch.subscribe(status=>{
        joined=status==="SUBSCRIBED";
        if(joined)publish(true);
      });
    }catch(e){ch=null;joined=false}
  }
  timer=window.setInterval(tick,500);
  publish(true);
}

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
    sent:Date.now(),
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
  stopTransport();
  code=null;store.set(null);
  refreshUI();
  noteEl.textContent="";
}
async function copyLink(){
  const url=roomUrl();
  if(!url)return;
  try{await navigator.clipboard.writeText(url);toast("Nuoroda nukopijuota.")}
  catch(e){urlEl.focus();urlEl.select();noteEl.textContent="Nukopijuok nuorodą rankiniu būdu – ji pažymėta."}
}

// game.ts calls this at ready / play / done (and at idle when leaving a finished game)
export function screenPhase(p:ScreenPhase){
  phase=p;
  publish(true);
}

// ---------- DOM wiring ----------
$("#castOpen").onclick=openCast;
homeCast.onclick=openCast;
setupCast.onclick=openCast;
$("#screenClose").onclick=castSheet.close;
$("#castOn").onclick=enable;
$("#castOffBtn").onclick=disable;
$("#castCopy").onclick=copyLink;
$("#castShare").onclick=()=>{const url=roomUrl();if(url)share(url,`NovaCore didelis ekranas · kodas ${code}. Atidaryk televizoriuje ir žaisk.`,noteEl)};
$("#castOpenPage").onclick=()=>{
  const url=roomUrl();
  if(!url)return;
  const w=window.open(url,"_blank");
  if(w){try{w.opener=null}catch(e){}}
  else noteEl.textContent="Naršyklė užblokavo langą. Nukopijuok nuorodą ir atidaryk ją TV naršyklėje.";
};
if(!sb)netEl.hidden=false;
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&code)publish(true)});

if(code)startTransport();
refreshUI();
