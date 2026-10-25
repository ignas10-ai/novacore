// Remote duel: two phones, two places, the same game at the same moment, live scores. NO video is ever sent.
// Invite: Kompanijos → group → swords button on a member → #duelSheet (duration) → invite_duel RPC.
// The invitee gets it live (postgres_changes on `duels`, inbox channel) or on Pradžia (#duelInv, pending_duels RPC).
// After "Priimti" both join the PRIVATE Realtime channel `duel:<id>` (presence = online; broadcast = ping/pong, ready,
// start, score, final, bye). Each phone runs the normal solo game flow (S.players=1, the same duration/exercises/seed);
// S.duel (state.ts) is the only hook into game.ts. The host (inviter) announces start = its clock + 3 s; the guest
// converts it with the ping/pong clock offset, so both start together even if the phone clocks differ.
// Messages: own score max 4x/s and only when it changed (dv.SCORE_MS). Budget in AGENTS.md.
import type {RealtimeChannel} from "@supabase/supabase-js";
import {EX,type Exercise} from "../detect/exercises.ts";
import {S} from "../game/state.ts";
import {startFlow,resetGame} from "../game/game.ts";
import {sampleCamera,draw} from "../camera/camera.ts";
import * as api from "../online/api.ts";
import * as dv from "./api.ts";
import {$,toast,setDigits,replay} from "../ui/dom.ts";
import {parse} from "../ui/router.ts";
import {onbDone} from "../ui/onboarding.ts";
import {icon} from "../ui/icons.ts";

type Phase="wait"|"lobby"|"camera"|"play"|"done";
interface Duel{
  id:string;host:boolean;group:string;opp:{id:string;nick:string};settings:dv.DuelSettings;phase:Phase;
  ch:RealtimeChannel|null;joined:boolean;oppOn:boolean;oppReady:boolean;meReady:boolean;gone:boolean;timedOut:boolean;
  off:number|null;samples:{t0:number;t:number;t1:number}[];syncing:boolean;
  startAt:number;oppScore:number;oppFinal:number|null;myFinal:number|null;sent:number;timers:number[];
}
let me:string|null=null, cur:Duel|null=null, bound:Duel|null=null, inbox:RealtimeChannel|null=null, inboxRetry=0;
let invites:dv.Invite[]=[], view:""|"pick"|"wait"|"incoming"|"lobby"="", shownInvite:dv.Invite|null=null;
let pick:{group:string;id:string;nick:string}|null=null, pickDur=180;
let saved:{players:number;duration:number;activeEX:Exercise[]}|null=null, startFn:(()=>void)|null=null, waitRaf=0;

const online=()=>!!api.sb&&navigator.onLine!==false;
const OFFLINE="Dvikovai reikia interneto. Solo ir dviese viename telefone gali žaisti ir be jo.";
const sc=(v:any)=>Math.min(2000,Math.max(0,v|0)); // never trust the other phone's numbers
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const fmtMin=(d:number)=>`${d/60} min`;
const exNames=(ids:string[])=>ids.map(id=>EX.find(e=>e.id===id)?.name).filter(Boolean).join(", ");
const ensureMe=async()=>me||=await api.userId();
const busyGame=()=>S.running||!$("#ready").classList.contains("hide")||!$("#loading").classList.contains("hide");

// ---------- sheet (own open/close: X = cancel, backdrop/Esc never cancel a duel by accident) ----------
const dlg=$<HTMLDialogElement>("#duelSheet"), eye=$("#duelEye"), title=$("#duelTitle"), sub=$("#duelSub"), pickBox=$("#duelPick"),
  exTxt=$("#duelEx"), note=$("#duelNote"), no=$<HTMLButtonElement>("#duelNo"), yes=$<HTMLButtonElement>("#duelYes"),
  dvOpp=$("#dvOpp"), dvOppName=$("#dvOppName"), dvOppSt=$("#dvOppSt");
let closeT=0;
function openSheet(){clearTimeout(closeT);dlg.classList.remove("closing");if(!dlg.open)dlg.showModal()}
function closeSheet(){view="";shownInvite=null;if(!dlg.open||dlg.classList.contains("closing"))return;dlg.classList.add("closing");clearTimeout(closeT);closeT=setTimeout(()=>{dlg.classList.remove("closing");if(dlg.open)dlg.close()},210)}
dlg.addEventListener("cancel",e=>{e.preventDefault();if(view==="pick"||view==="incoming")closeSheet()});
dlg.addEventListener("click",e=>{if(e.target===dlg&&(view==="pick"||view==="incoming"))closeSheet()});
$("#duelClose").onclick=()=>view==="wait"||view==="lobby"?leaveDuel():closeSheet();
function setTitle(a:string,b:string){title.replaceChildren(a+" ",Object.assign(document.createElement("span"),{textContent:b}))}
function btn(el:HTMLButtonElement,label:string,ic:string){el.hidden=false;el.disabled=false;el.innerHTML=icon(ic);el.append(label)}
function paintSheet(){
  const D=cur;
  if(view==="pick"&&pick){
    eye.textContent="Dvikova";setTitle("Dvikova","per atstumą");
    sub.textContent=`${pick.nick} gaus kvietimą. Žaisite vienu metu, kiekvienas savo telefonu, ir matysite vienas kito taškus.`;
    pickBox.hidden=false;exTxt.textContent=`Pratimai: ${exNames(S.activeEX.map(e=>e.id))}`;
    dvOppName.textContent=pick.nick;dvOppSt.textContent="kviečiamas";dvOpp.dataset.on="0";
    no.hidden=true;btn(yes,"Kviesti","swords");
  }else if(view==="incoming"&&shownInvite){
    const i=shownInvite;
    eye.textContent="Kvietimas";setTitle(i.nickname,"kviečia");
    sub.textContent=`Dvikova per atstumą · ${fmtMin(i.settings.duration)}. Žaisite vienu metu, kiekvienas savo telefonu.`;
    pickBox.hidden=true;dvOppName.textContent=i.nickname;dvOppSt.textContent="laukia atsakymo";dvOpp.dataset.on="1";
    btn(no,"Atmesti","x");btn(yes,"Priimti","check");
  }else if((view==="wait"||view==="lobby")&&D){
    pickBox.hidden=true;dvOppName.textContent=D.opp.nick;
    if(view==="wait"){
      eye.textContent="Kvietimas išsiųstas";setTitle("Laukiam","atsakymo");
      sub.textContent=`${D.opp.nick} gaus kvietimą, jei programėlė atidaryta, arba pamatys jį Pradžioje. Galioja 10 min.`;
      dvOppSt.textContent="dar neatsakė";dvOpp.dataset.on="0";yes.hidden=true;
    }else{
      eye.textContent=`Dvikova · ${fmtMin(D.settings.duration)}`;setTitle("Pasiruošk","startui");
      sub.textContent="Pastatyk telefoną, atsitrauk, kad matytųsi visas kūnas, ir pakelk rankas. Startas – abiem tuo pačiu metu.";
      dvOppSt.textContent=D.oppOn?"prisijungęs":"jungiasi…";dvOpp.dataset.on=D.oppOn?"1":"0";
      btn(yes,"Į kamerą","play");
    }
    btn(no,"Atšaukti","x");
  }
}
$("[data-dd]")?.parentElement?.addEventListener("click",e=>{
  const b=(e.target as Element).closest<HTMLElement>("[data-dd]");if(!b)return;
  pickDur=+b.dataset.dd!;b.parentElement!.querySelectorAll<HTMLElement>("[data-dd]").forEach(x=>{x.classList.toggle("on",x===b);x.setAttribute("aria-pressed",String(x===b))});
});
yes.onclick=()=>{
  if(view==="pick")sendInvite();
  else if(view==="incoming"&&shownInvite)accept(shownInvite);
  else if(view==="lobby"&&cur)enterCamera(cur);
};
no.onclick=()=>{
  if(view==="incoming"&&shownInvite)decline(shownInvite);
  else if(view==="wait"||view==="lobby")leaveDuel();
  else closeSheet();
};

// ---------- invites ----------
$("#lb").addEventListener("click",e=>{
  const b=(e.target as Element).closest<HTMLElement>("[data-duel]");if(!b)return;
  if(!online()){toast(OFFLINE);return}
  if(cur&&cur.phase!=="done"){toast("Jau esi dvikovoje.");return}
  pick={group:parse(location.hash).arg,id:b.dataset.duel!,nick:b.dataset.nick!};
  view="pick";note.textContent="";paintSheet();openSheet();
});
async function sendInvite(again?:Duel){
  const target=again?{group:again.group,id:again.opp.id,nick:again.opp.nick}:pick;
  if(!target)return;
  if(!online()){again?toast(OFFLINE):(note.textContent=OFFLINE);return}
  const dur=again?again.settings.duration:pickDur, ex=again?again.settings.exercises:S.activeEX.map(e=>e.id);
  yes.disabled=true;note.textContent="Siunčiama…";
  try{
    await ensureMe();startInbox();
    const d=await dv.invite(target.group,target.id,dur,ex);
    if(again)drop(again);
    cur=mk(d,true,target.nick);join(cur);
    view="wait";note.textContent="";paintSheet();openSheet();
  }catch(e){const m=dv.duelErr(e,api.errText);if(again)toast(m);else{note.textContent=m;yes.disabled=false}}
}
async function accept(i:dv.Invite){
  if(!online()){toast(OFFLINE);return}
  yes.disabled=true;
  try{
    await ensureMe();
    const d=await dv.respond(i.id,true);
    invites=invites.filter(x=>x.id!==i.id);paintCard();
    if(d.status!=="accepted"){toast("Kvietimas nebegalioja.");closeSheet();return}
    if(cur)drop(cur); // the finished previous duel (rematch from the results screen)
    cur=mk(d,false,i.nickname);join(cur);
    view="lobby";note.textContent="";paintSheet();openSheet();
  }catch(e){toast(dv.duelErr(e,api.errText));closeSheet();loadInvites()}
}
async function decline(i:dv.Invite){
  invites=invites.filter(x=>x.id!==i.id);paintCard();closeSheet();
  try{await dv.respond(i.id,false)}catch(e){}
}
function showInvite(i:dv.Invite){
  if(dlg.open||busyGame()||(cur&&cur.phase!=="done"))return; // never interrupt a game; Pradžia shows it later
  shownInvite=i;view="incoming";note.textContent="";paintSheet();openSheet();
}
// Pradžia card with the newest valid invite
const card=$("#duelInv"), cardTxt=$("#duelInvTxt");
function paintCard(){
  const i=invites.find(x=>dv.fresh(x.created_at,Date.now()));
  card.hidden=!i;
  if(i)cardTxt.replaceChildren(Object.assign(document.createElement("b"),{textContent:i.nickname}),` kviečia į dvikovą · ${fmtMin(i.settings.duration)}`);
}
$("#duelInvGo").onclick=()=>{const i=invites.find(x=>dv.fresh(x.created_at,Date.now()));if(i)accept(i)};
$("#duelInvX").onclick=()=>{const i=invites.find(x=>dv.fresh(x.created_at,Date.now()));if(i)decline(i)};
async function loadInvites(){
  if(!online())return;
  try{invites=(await dv.pending()).filter(i=>dv.fresh(i.created_at,Date.now()));paintCard()}catch(e){} // 002 not run yet: no card
}
// inbox: live invites + answers (RLS: only my duels). Started only when 002 exists, so a missing table never loops rejoins.
async function startInbox(){
  if(inbox||!online()||Date.now()<inboxRetry||!api.cachedNick())return;
  me=await api.userId();if(!me)return;
  try{await dv.pending()}catch(e){inboxRetry=Date.now()+60e3;return}
  if(inbox)return;
  const f=(event:"INSERT"|"UPDATE",col:string)=>({event,schema:"public",table:"duels",filter:`${col}=eq.${me}`});
  inbox=api.sb!.channel(`inbox:${me}`)
    .on("postgres_changes",f("INSERT","to_user"),p=>loadInvites().then(()=>onInvite((p.new as dv.Duel).id)))
    .on("postgres_changes",f("UPDATE","from_user"),p=>onRow(p.new as dv.Duel))
    .on("postgres_changes",f("UPDATE","to_user"),p=>onRow(p.new as dv.Duel))
    .subscribe();
  loadInvites();
}
function onInvite(id:string){
  const i=invites.find(x=>x.id===id);if(!i)return;
  // both pressed "Revanšas" at once: drop my own invite and take theirs
  if(cur?.phase==="wait"&&cur.opp.id===i.from_user){const D=cur;dv.cancel(D.id).catch(()=>{});drop(D);closeSheet();accept(i);return}
  showInvite(i);
}
function onRow(d:dv.Duel){
  if(d.status==="cancelled"||d.status==="expired"){
    if(invites.some(i=>i.id===d.id)){invites=invites.filter(i=>i.id!==d.id);paintCard()}
    if(view==="incoming"&&shownInvite?.id===d.id){closeSheet();toast("Kvietimas atšauktas.")}
  }
  const D=cur;if(!D||D.id!==d.id||!D.host)return;
  if(d.status==="accepted"&&D.phase==="wait")accepted(D);
  else if(D.phase==="wait"&&(d.status==="declined"||d.status==="expired")){toast(d.status==="declined"?`${D.opp.nick} atmetė kvietimą.`:"Kvietimas nebegalioja.");drop(D);closeSheet()}
}

// ---------- channel ----------
function mk(d:dv.Duel,host:boolean,nick:string):Duel{
  return {id:d.id,host,group:d.group_id,opp:{id:host?d.to_user:d.from_user,nick},settings:d.settings,phase:host?"wait":"lobby",
    ch:null,joined:false,oppOn:false,oppReady:false,meReady:false,gone:false,timedOut:false,off:null,samples:[],syncing:false,
    startAt:0,oppScore:0,oppFinal:null,myFinal:null,sent:-1,timers:[]};
}
const send=(D:Duel,event:string,payload:Record<string,unknown>={})=>{D.ch?.send({type:"broadcast",event,payload}).catch(()=>{})};
function join(D:Duel){
  const ch=api.sb!.channel(`duel:${D.id}`,{config:{private:true,broadcast:{self:false},presence:{key:me||""}}});
  D.ch=ch;
  const on=(event:string,fn:(p:any)=>void)=>ch.on("broadcast",{event},({payload})=>{if(cur===D)fn(payload||{})});
  ch.on("presence",{event:"sync"},()=>{if(cur===D)presence(D)});
  on("ping",p=>{if(D.host)send(D,"pong",{t0:+p.t0||0,t:Date.now()})});
  on("pong",p=>D.samples.push({t0:+p.t0||0,t:+p.t||0,t1:Date.now()}));
  on("ready",()=>{D.oppReady=true;maybeStart(D);paint(D)});
  on("start",p=>{if(!D.host&&D.meReady)schedule(D,(+p.at||Date.now())-(D.off??0))});
  on("score",p=>{D.oppScore=sc(p.s);if(D.phase==="play")S.score[1]=D.oppScore});
  on("final",p=>{D.oppFinal=D.oppScore=sc(p.s);if(D.phase==="done")paintEnd(D)});
  on("bye",()=>{
    if(D.phase==="wait"||D.phase==="lobby"){toast(`${D.opp.nick} atšaukė dvikovą.`);drop(D);closeSheet();return}
    if(D.phase==="camera")toast(`${D.opp.nick} išėjo iš dvikovos.`);
    D.gone=true;paint(D);
  });
  ch.subscribe(async(st)=>{
    if(cur!==D)return;
    if(st==="SUBSCRIBED"){D.joined=true;try{await ch.track({n:api.cachedNick()||""})}catch(e){}paint(D)}
    else if(st==="CHANNEL_ERROR"||st==="TIMED_OUT"){if(view)note.textContent="Nepavyko prisijungti prie dvikovos. Patikrink ryšį.";}
  });
}
function presence(D:Duel){
  const on=!!(D.ch!.presenceState() as Record<string,unknown[]>)[D.opp.id]?.length;
  if(on!==D.oppOn){
    D.oppOn=on;
    if(on){
      D.gone=false;
      if(D.phase==="wait")accepted(D); // the invitee joins only after accepting
      if(!D.host&&D.off==null)sync(D);
      if(D.meReady)send(D,"ready");
      if(D.host&&D.startAt&&D.phase==="camera")send(D,"start",{at:D.startAt}); // guest reconnected before the start
    }else if(D.phase!=="wait"&&D.phase!=="lobby")D.gone=true;
  }
  paint(D);
}
function accepted(D:Duel){D.phase="lobby";if(view==="wait"){view="lobby";paintSheet()}}
// guest: 5 pings, the fastest round trip gives (host clock - my clock)
async function sync(D:Duel){
  if(D.syncing)return;D.syncing=true;D.samples=[];
  for(let i=0;i<5&&cur===D;i++){send(D,"ping",{t0:Date.now()});await wait(150)}
  await wait(400);
  const b=dv.clockOffset(D.samples);
  if(b)D.off=b.off;
  D.syncing=false;
  console.info(`NovaCore dvikova: laikrodžio skirtumas ${b?`${Math.round(b.off)} ms (RTT ${Math.round(b.rtt)} ms)`:"nežinomas"}`);
}
function leaveDuel(){
  const D=cur;closeSheet();if(!D)return;
  send(D,"bye");
  if(D.phase==="wait"||D.phase==="lobby")dv.cancel(D.id).catch(()=>{});
  drop(D);
}
function drop(D:Duel){
  D.timers.forEach(t=>{clearTimeout(t);clearInterval(t)});D.timers=[];
  if(D.ch)api.sb?.removeChannel(D.ch).catch(()=>{});
  D.ch=null;
  if(cur===D)cur=null;
}

// ---------- game binding (S.duel) ----------
function enterCamera(D:Duel){
  if(!online()){toast(OFFLINE);return}
  if(!$("#end").classList.contains("hide")||!$("#clips").classList.contains("hide"))resetGame(); // rematch from the results
  closeSheet();
  saved={players:S.players,duration:S.duration,activeEX:S.activeEX};
  const ex=D.settings.exercises.map(id=>EX.find(e=>e.id===id)).filter(Boolean) as Exercise[];
  S.players=1;S.duration=D.settings.duration;S.activeEX=ex.length?ex:saved.activeEX; // ponytail: an unknown exercise id (older app) is skipped
  D.phase="camera";bound=D;
  S.duel={ready:fn=>ready(D,fn),shift:()=>dv.seedShift(D.settings.seed,S.activeEX.length),finish:()=>finished(D),end};
  labels(D.opp.nick);document.body.classList.add("duel");paint(D);
  startFlow();
}
function end(){ // game.ts: back during ready, startup error, results → again / home
  const D=bound;if(!D)return;
  cancelAnimationFrame(waitRaf);
  S.duel=null;bound=null;startFn=null;
  if(saved){S.players=saved.players;S.duration=saved.duration;S.activeEX=saved.activeEX;saved=null}
  document.body.classList.remove("duel");labels("");
  $(".pl.p2").classList.remove("gone");$("#duelRes").hidden=true;
  if(D===cur){
    if(D.phase==="camera"){send(D,"bye");dv.cancel(D.id).catch(()=>{})} // left before the start
    drop(D);
  }
}
function labels(nick:string){
  const [p1,p2]=nick?["Tu",nick]:["P1","P2"];
  document.querySelectorAll(".pl.p1 .chip,.bar.p1 .chip").forEach(e=>e.textContent=p1);
  document.querySelectorAll(".pl.p2 .chip,.bar.p2 .chip").forEach(e=>e.textContent=p2);
  $("#rd1 b").textContent=p1;
}
const rdCount=$("#rdCount");
function ready(D:Duel,fn:()=>void){ // my arms-up gate passed
  startFn=fn;D.meReady=true;send(D,"ready");
  rdCount.textContent="Laukiam";rdCount.classList.add("word");replay(rdCount,"pop");
  $("#readyHint").textContent=`Laukiam, kol ${D.opp.nick} pasiruoš`;
  const live=()=>{const p=sampleCamera(performance.now());if(p)p.forEach((x,i)=>draw(x.lm,i));waitRaf=requestAnimationFrame(live)};
  live(); // keep the camera image moving while we wait
  maybeStart(D);paint(D);
}
function maybeStart(D:Duel){
  if(!D.host||!D.meReady||!D.oppReady||D.startAt||cur!==D)return;
  const at=Date.now()+dv.START_LEAD_MS;
  send(D,"start",{at});schedule(D,at);
  dv.start(D.id).catch(()=>{});
}
function schedule(D:Duel,at:number){
  if(D.startAt||D.phase!=="camera")return;
  D.startAt=at;let last="";
  const t=setInterval(()=>{
    const left=at-Date.now();
    if(left<=0){clearInterval(t);go(D);return}
    const s=String(Math.ceil(left/1000));
    if(s!==last){last=s;rdCount.classList.remove("word");rdCount.textContent=s;replay(rdCount,"pop")}
  },20) as unknown as number;
  D.timers.push(t);
}
function go(D:Duel){
  if(cur!==D||!startFn)return;
  cancelAnimationFrame(waitRaf);
  rdCount.textContent="Pirmyn!";rdCount.classList.add("word");
  D.phase="play";S.score[1]=D.oppScore;
  startFn();
  D.timers.push(setInterval(()=>{ // own score -> opponent, max 4x/s, only on change
    if(D.phase!=="play")return;
    const s=S.score[0];if(s!==D.sent){D.sent=s;send(D,"score",{s})}
  },dv.SCORE_MS) as unknown as number);
}
function finished(D:Duel){ // game.ts finish(), after renderResults()
  D.phase="done";D.myFinal=S.score[0];
  send(D,"final",{s:D.myFinal});
  dv.finish(D.id,D.myFinal).then(row=>{
    if(row.from_score!=null&&row.to_score!=null&&D.oppFinal==null){D.oppFinal=D.host?row.to_score:row.from_score;paintEnd(D)}
  }).catch(()=>{});
  D.timers.push(setTimeout(()=>{if(D.oppFinal==null){D.timedOut=true;paintEnd(D)}},8000) as unknown as number);
  paintEnd(D);
}

// ---------- painting ----------
function paint(D:Duel){
  if(view==="lobby"&&D===cur)paintSheet();
  if(bound!==D)return;
  const st=D.gone?"atsijungė":D.oppReady?"pasiruošęs":D.oppOn?"ruošiasi":"jungiasi…";
  $("#rdOppName").textContent=D.opp.nick;$("#rdOppSt").textContent=st;$("#rdOpp").dataset.ok=D.oppReady&&!D.gone?"1":"0";
  const p2=$(".pl.p2");p2.classList.toggle("gone",D.gone);p2.querySelector(".chip")!.textContent=D.gone?"Atsijungė":D.opp.nick;
}
function paintEnd(D:Duel){
  if(bound!==D)return;
  const mine=D.myFinal??0, opp=D.oppFinal??D.oppScore, nick=D.opp.nick;
  setDigits($("#r2"),String(opp));
  const top=Math.max(mine,opp,1);
  requestAnimationFrame(()=>{$("#b1").style.width=`${mine/top*100}%`;$("#b2").style.width=`${opp/top*100}%`});
  const end=$("#end"),w=mine>opp?"1":opp>mine?"2":"0";
  $("#wl").textContent=w==="2"?"Laimėjo":"Dvikova";
  $("#winner").textContent=w==="1"?"Laimėjai!":w==="2"?nick:"Lygiosios!";
  end.dataset.w=w;
  const pending=D.oppFinal==null;
  $("#duelResTxt").textContent=!pending?`Tu ${mine} : ${opp} ${nick}`
    :D.gone||D.timedOut?`${nick} atsijungė – rodomas paskutinis gautas rezultatas (${opp}).`:`Laukiam galutinio ${nick} rezultato…`;
  $("#duelRes").hidden=false;
}
$("#duelAgain").onclick=()=>{const D=bound||cur;if(D)sendInvite(D)};

// ---------- start ----------
(async()=>{
  if(!api.sb)return;
  await onbDone;
  await wait(1500); // social.ts signs in / syncs the profile first
  startInbox();
  addEventListener("hashchange",()=>{if(parse(location.hash).v==="home"){startInbox();loadInvites()}});
  addEventListener("online",()=>startInbox());
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){startInbox();loadInvites()}});
})();
