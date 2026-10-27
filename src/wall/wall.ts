// Siena (Hole in the wall; spec: Martynas #4, issue #21): a red wall slides over the camera picture, get your whole body
// out of it before the ring runs out (step aside, duck under the bar, lift a leg, get into the hole). Survived = the next
// wall, with less time; caught = your run is over. 1-4 players take turns on ONE phone like the long jump (only the
// player whose turn it is stands in front of the camera), every player gets the same walls (one seed per game).
// Most walls survived wins (faster escapes break a tie).
// Flow: Pradžia tile -> #/siena (setup) -> startFlow(WALL) -> #loading -> #ready (arms-up gate, game.ts, 1 pose) ->
// WALL.start(): per turn "Dabar žaidžia: <vardas>" card (+ arms-up gate from the 2nd turn) -> "Pasiruošk… 3 2 1" ->
// walls until caught -> next turn ... -> #wlEnd results.
// Rules + geometry are PURE in logic.ts (unit tests). The camera stays full screen like boxing; the walls are drawn on
// #wlCv, laid over #cv inside #stage with the same aspect + object-fit, so frame coordinates map 1:1.
import "./wall.css";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {armsUp} from "../detect/step.ts";
import type {Lm} from "../detect/classifier.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import {sfx} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import type {Game} from "../history/stats.ts";
import {$,replay} from "../ui/dom.ts";
import {t as tr,tn,dec,type Key} from "../i18n/i18n.ts";
import {VIS} from "../detect/exercises.ts";
import {mascot,avatar} from "../ui/mascots.ts";
import {cachedNick} from "../online/api.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import type {ScreenState} from "../cast/room.ts";
import {rngFrom} from "../boxing/logic.ts";
import {WHO,TONE,TONE_INK,DEF,NAME_MAX,face} from "../longjump/longjump.ts";
import {PTS,secsFor,bodyOf,wallFor,newRound,track,advance,newScore,addRound,rank,type Body,type Kind,type Round,type Score,type Verdict} from "./logic.ts";

const RED="#FF3B3B", INK="#14183A", GREEN="#16B67A";
const GAP_S=0.9, SLAM_S=0.35, OUT_S=2.6, IN_S=0.3; // pause between walls, wall hit, caught -> next turn, slide-in
const HINT:Record<Kind,Key>={left:"wl.k.right",right:"wl.k.left",duck:"wl.k.duck",pillar:"wl.k.side",duckL:"wl.k.duckRight",duckR:"wl.k.duckLeft",
  hole:"wl.k.hole",holeDuck:"wl.k.holeDuck",legL:"wl.k.legL",legR:"wl.k.legR"};
const store={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};
const reduced=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- markup (built here, the shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile wl-tile tap";tile.href="#/siena";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("wl.title")}</b><small>${tr("wl.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true"><span class="wl-tile-wall"></span>${mascot("r","sidestep",{anim:true})}${mascot("y","squat",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".bw-tile")??document.querySelector(".hd-tile")??document.querySelector(".lj-tile")??document.getElementById("rankCard"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="wall" aria-labelledby="wlTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="wlTitle" tabindex="-1">${tr("wl.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    <div class="wl-hero" aria-hidden="true">
      <span class="wl-hero-big">${tr("wl.heroBig")}</span><span class="wl-hero-sub">${tr("wl.hero")}</span>
      <span class="wl-hero-wall"><i></i></span><span class="wl-hero-m">${mascot("b","squat",{anim:true})}</span>
    </div>
    <section class="pick" aria-label="${tr("lj.jumpers")}">
      <div class="seg sp-seg lj-seg" role="group" aria-label="${tr("lj.jumpers")}">
        ${[1,2,3,4].map(k=>`<button data-wl="${k}" aria-pressed="false"><span><b class="d">${k}</b><small>${k===1?tr("mode.solo"):tn("lj.pl",k)}</small></span></button>`).join("")}
      </div>
      <p class="help lj-party">${tr("wl.party")}</p>
    </section>
    <section class="box lj-names" aria-labelledby="wlNamesT">
      <h2 class="card-title" id="wlNamesT">${tr("lj.names")}</h2>
      <ol id="wlNames">${[0,1,2,3].map(i=>`<li class="lj-nrow" data-i="${i}">${face(i,"lj-nface")}<input class="lj-name" id="wlN${i+1}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false" aria-label="${tr("lj.nameOf",{n:i+1})}"></li>`).join("")}</ol>
    </section>
    <div class="box sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("sp.pb")}</small><b class="d" id="wlPb">–</b><p class="help" id="wlPbTxt"></p></div></div>
    <section class="box sp-how" aria-labelledby="wlHowT">
      <h2 class="card-title" id="wlHowT">${tr("wl.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("lj.how1")}</span></li>
        <li><span data-icon="footprints"></span><span>${tr("wl.how2")}</span></li>
        <li><span data-icon="timer"></span><span>${tr("wl.how3")}</span></li>
      </ol>
    </section>
    <div class="cta">
      <button class="go tap" id="wlGo" type="button"><span>${tr("wl.toWall")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
document.body.insertAdjacentHTML("beforeend",`
<div class="wl-run hide" id="wlRun">
  <div class="bx-top wl-top">
    <div class="bx-card p1 wl-me" id="wlMe"><span class="bx-face" id="wlFace"></span><div class="bx-card-in"><b class="d bx-sc" id="wlR">0</b><span class="bx-combo on wl-name" id="wlName"></span></div></div>
    <div class="wl-ring" id="wlRing" role="timer" aria-label="${tr("wl.left")}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="wl-arc" id="wlArc" cx="18" cy="18" r="15.9" pathLength="100"/></svg><b class="d" id="wlT">5,0</b></div>
    <div class="bx-card p2 wl-best" id="wlBest"><span class="bx-face bx-tro" data-icon="trophy"></span><div class="bx-card-in"><b class="d bx-sc" id="wlBestR">0</b><span class="bx-combo on wl-name" id="wlBestN">${tr("bx.best")}</span></div></div>
  </div>
  <span class="wl-st" id="wlSt" aria-live="polite"></span>
  <div class="sp-call wl-call" id="wlCall" aria-live="assertive"><b class="d" id="wlCallT"></b><small id="wlCallS"></small></div>
  <div class="lj-turn wl-turn" id="wlTurn" hidden>
    <div class="lj-turn-card" role="dialog" aria-labelledby="wlTurnN">
      <span class="lj-turn-art" id="wlTurnArt" aria-hidden="true"></span>
      <span class="eyebrow">${tr("wl.now")}</span>
      <b class="d lj-turn-n" id="wlTurnN"></b>
      <span class="lj-turn-a" id="wlTurnA"></span>
      <div class="lj-gate" id="wlGate"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="lj-ring" id="wlGateR" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span id="wlGateT">${tr("lj.armsUp")}</span></div>
      <ol class="lj-mini" id="wlMini" aria-label="${tr("lj.standings")}"></ol>
    </div>
  </div>
</div>
<section class="screen hide" id="wlEnd" aria-labelledby="wlWin">
  <div class="wrap">
    <header class="sp-res-head lj-res-head" id="wlResHead">
      <span class="sp-res-art" id="wlResArt" aria-hidden="true"></span>
      <span class="wl">${tr("wl.title")}</span>
      <h2 class="d" id="wlWin"></h2>
      <p id="wlSub"></p>
      <span class="rec-badge" id="wlRec" hidden>${tr("sp.newPb")}</span>
    </header>
    <ol class="sp-rows lj-rows" id="wlRows" aria-label="${tr("lj.results")}"></ol>
    <div class="cta">
      <button class="go" id="wlAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("app.again")}</button>
      <button class="go alt" id="wlHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);
const ov=document.createElement("canvas");ov.id="wlCv";ov.setAttribute("role","img");ov.setAttribute("aria-label",tr("wl.cv"));
$("#stage").append(ov);
const oc=ov.getContext("2d")!;

const runRoot=$("#wlRun"), endRoot=$("#wlEnd"), callRoot=$("#wlCall"), callT=$("#wlCallT"), callS=$("#wlCallS");
const turnRoot=$("#wlTurn"), gateRoot=$("#wlGate"), gateRing=$("#wlGateR"), gateT=$("#wlGateT");
const arc=$("#wlArc"), ringEl=$("#wlRing"), tEl=$("#wlT"), stEl=$("#wlSt"), rEl=$("#wlR");

// ---------- history: rows with mode "wall", reps = walls survived per player, secs = time survived ----------
const bestEver=(h:Game[])=>h.reduce((m,g)=>g.mode==="wall"?Math.max(m,...(g.reps||[]).slice(0,g.players)):m,0);

// ---------- setup: players 1-4 + names (local only, like the long jump) ----------
let n=2;
const names=["","","",""];
{const k=Number(store.get("novacore.wlN"));if(k>=1&&k<=4)n=k;
 try{const a=JSON.parse(store.get("novacore.wlNames")||"[]");if(Array.isArray(a))a.slice(0,4).forEach((v,i)=>{if(typeof v==="string")names[i]=v.slice(0,NAME_MAX)})}catch(e){}}
const segBtns=[...document.querySelectorAll<HTMLElement>("[data-wl]")], inputs=[0,1,2,3].map(i=>$<HTMLInputElement>(`#wlN${i+1}`));
const nameAt=(i:number)=>names[i].trim()||(i===0&&cachedNick())||DEF[i]; // P1 = the profile nickname until edited
function syncSetup(){
  segBtns.forEach(b=>{const on=Number(b.dataset.wl)===n;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  document.querySelectorAll<HTMLElement>("#wlNames .lj-nrow").forEach(r=>r.hidden=Number(r.dataset.i)>=n);
  inputs.forEach((el,i)=>{el.placeholder=i===0&&cachedNick()?cachedNick()!:DEF[i];if(document.activeElement!==el)el.value=names[i]});
}
segBtns.forEach(b=>b.onclick=()=>{n=Number(b.dataset.wl);store.set("novacore.wlN",String(n));syncSetup()});
inputs.forEach((el,i)=>{
  el.oninput=()=>{names[i]=el.value.slice(0,NAME_MAX);store.set("novacore.wlNames",JSON.stringify(names))};
  el.onkeydown=e=>{if(e.key==="Enter")el.blur()};
});
function renderPb(){
  const b=bestEver(loadHist());
  $("#wlPb").textContent=b?tn("wl.rnd",b):"–";
  $("#wlPbTxt").textContent=tr(b?"wl.pbTxt":"wl.pbNone");
}
onView("wall",()=>{syncSetup();renderPb()});
// one player in front of the camera at a time: the shared player count goes to 1 (through the setup button, like the long jump)
function go(){document.querySelector<HTMLElement>('[data-p="1"]')?.click();S.players=1;startFlow(WALL)}
$("#wlGo").onclick=go;

// ---------- session state ----------
type Phase="off"|"card"|"count"|"gap"|"wall"|"slam"|"out";
let phase:Phase="off", phaseAt=0, raf=0, last=0, hudAt=0, callTimer=0, k=0, holdAt=0, holdOk=0, beat=-1, pb=0, startedAt=0, seed=1, seedFix=0;
let rng=rngFrom(1), round=0, prev:Kind|""="", R:Round|null=null, verdictV:Verdict="", spawnAt=0, lastPs:unknown=null, lmKeep:Lm[]|null=null, tickSec=-1;
let scores:Score[]=[], played:boolean[]=[], names0:string[]=[], force:Verdict="";

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call wl-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
// overlay canvas: same aspect as #cv (object-fit:contain on both), at most 720 px tall
function syncSize(){
  if(!cv.width||!cv.height)return;
  const s=Math.min(1,720/cv.height),w=Math.round(cv.width*s),h=Math.round(cv.height*s);
  if(ov.width!==w||ov.height!==h){ov.width=w;ov.height=h}
}
const arOf=()=>(detCv.width/detCv.height)||(cv.width/cv.height)||16/9;

function begin(){
  scores=Array.from({length:n},newScore);played=Array(n).fill(false);names0=[...Array(n).keys()].map(nameAt);
  k=0;pb=bestEver(loadHist());startedAt=performance.now();seed=seedFix||(Date.now()%2147483647)||1;
  runRoot.classList.remove("hide");endRoot.classList.add("hide");
  document.body.classList.add("walling");
  syncSize();
  document.fonts?.load("400 40px \"Titan One\"","0123456789,!").catch(()=>{});
  setScreenMode(tvState);
  screenPhase("play");
  last=performance.now();
  card(last);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}
// ---------- turn card + gate (the long jump's) ----------
function card(now:number){
  phase="card";phaseAt=now;holdAt=0;holdOk=0;S.running=false; // back between turns = leave the series (game.ts)
  R=null;round=0;prev="";rng=rngFrom(seed);hideSt(); // the same walls for every player
  const p=k;
  callRoot.className="sp-call wl-call";
  $("#wlTurnArt").innerHTML=mascot(WHO[p],"idle",{anim:true});
  const nm=$("#wlTurnN");nm.textContent=names0[p];nm.style.setProperty("--tone",TONE[p]);
  $("#wlTurnA").textContent=n>1?tr("wl.turnOf",{n:p+1,total:n}):tr("wl.soloTurn");
  gateRoot.hidden=k===0; // the very first turn just passed game.ts's arms-up gate
  gateRing.style.strokeDashoffset="100";gateT.textContent=tr("lj.armsUp");
  const mini=$("#wlMini");mini.hidden=n<2;mini.classList.toggle("many",n>2);
  mini.replaceChildren(...rank(scores).map(r=>{const li=document.createElement("li");li.className=r.i===p?"now":"";
    li.innerHTML=`${face(r.i,"lj-mface")}<span class="lj-mname"></span><b class="d"></b>`;
    li.querySelector(".lj-mname")!.textContent=names0[r.i];
    li.querySelector("b")!.textContent=played[r.i]?String(scores[r.i].rounds):"–";return li}));
  turnRoot.hidden=false;turnRoot.classList.remove("out");void turnRoot.offsetWidth;turnRoot.classList.add("in");
  tEl.textContent=shown.t=dec(secsFor(1),1);arc.style.strokeDashoffset="0";ringEl.classList.remove("hot","paused");
  hudMe();
  sfx.round();
}
function hudMe(){
  const p=k;
  $("#wlFace").innerHTML=avatar(WHO[p]);$("#wlMe").style.setProperty("--tone",TONE[p]);
  $("#wlName").textContent=names0[p];rEl.textContent=String(scores[p]?.rounds??0);
  const top=rank(scores)[0], lead=n>1&&played.some(Boolean)?top:null;
  $("#wlBestR").textContent=String(lead?scores[lead.i].rounds:pb);
  $("#wlBestN").textContent=lead?names0[lead.i]:tr("bx.best");
}
function gate(now:number,lm:Lm[]|null){
  if(k===0){if(now-phaseAt>1700)count(now);return}
  const up=!!lm&&armsUp(lm);
  if(up){holdOk=now;if(!holdAt)holdAt=now}else if(holdAt&&now-holdOk>300)holdAt=0;
  const pct=holdAt?Math.min(1,(now-holdAt)/1100):0;
  gateRing.style.strokeDashoffset=String(100-pct*100);
  const msg=lm?tr(up?"lj.hold":"lj.armsUp"):tr("lj.stepIn");
  if(gateT.textContent!==msg)gateT.textContent=msg;
  gateRoot.classList.toggle("ok",up);
  if(pct>=1)count(now);
}
function count(now:number){
  phase="count";phaseAt=now;beat=-1;S.running=true; // game.ts swallows Android back while running
  played[k]=true;
  turnRoot.classList.remove("in");turnRoot.classList.add("out");setTimeout(()=>{if(phase!=="card")turnRoot.hidden=true},260);
  call(tr("lj.getSet"),tr("wl.getSetSub"));sfx.tick();
}
// ---------- walls ----------
// ponytail: forced verdicts (test hooks) play on a stand-in body when the fake camera finds nobody
const STAND:Body={cx:0,sy:.3,u:.2,hw:.1,ky:.65,ay:.8};
function spawn(now:number){
  const ar=arOf(), b=bodyOf(lmKeep,ar)??(force?{...STAND,cx:ar/2}:null);
  if(!b)return false;
  round++;
  R=newRound(wallFor(round,rng,b,ar,prev));prev=R.w.kind;
  phase="wall";phaseAt=now;spawnAt=now;tickSec=-1;
  call(tr(HINT[R.w.kind]),tr("wl.round",{n:round}),"is-hint",1300);
  sfx.round();
  rEl.textContent=String(scores[k].rounds);
  return true;
}
function slam(now:number,v:"safe"|"caught"){
  phase="slam";phaseAt=now;verdictV=v;
  addRound(scores[k],R!,v);
  hideSt();
  if(v==="safe"){call(tr("wl.safe"),R!.safeAt>=0?tr("wl.react",{s:dec(R!.safeAt,1)}):"","is-safe",900);sfx.rep(0)}
  else{call(tr("wl.caught"),tn("wl.caughtSub",scores[k].rounds),"is-bad is-caught");sfx.bomb();if(!reduced())replay($("#stage"),"bx-shake")}
  rEl.textContent=String(scores[k].rounds);
  hudMe();
}
function next(now:number){
  k++;
  if(k>=n){finish();return}
  card(now);
}
const shown={st:"",t:""};
function setSt(cls:string,txt:string){if(shown.st!==cls+txt){shown.st=cls+txt;stEl.className=`wl-st on ${cls}`;stEl.textContent=txt}}
function hideSt(){shown.st="";stEl.className="wl-st";stEl.textContent=""}

// ---------- frame ----------
function frame(now:number){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
  syncSize();
  const ps=sampleCamera(now);
  const fr=!!ps&&ps!==lastPs; // sampleCamera returns the previous array when only the camera frame is new
  if(ps){lastPs=ps;if(ps[0])draw(ps[0].lm,0);if(fr)lmKeep=ps[0]?.lm??null}
  const tp=(now-phaseAt)/1000;
  if(phase==="card")gate(now,lmKeep);
  else if(phase==="count"){
    const b=tp<.9?-1:Math.floor((tp-.9)/.6);
    if(b!==beat&&b>=0){beat=b;
      if(b<3){call(String(3-b),"","is-num");sfx.tick()}
      else{phase="gap";phaseAt=now-GAP_S*1000;sfx.whistle()} // the first wall comes right away
    }
  }else if(phase==="gap"){
    if(tp>=GAP_S&&!spawn(now)&&tp>GAP_S+.5)setSt("lost",tr("wl.lost"));
  }else if(phase==="wall"){
    const r=R!;
    if(force){r.since=0;r.hits=force==="caught"?[0]:[];if(!r.hits.length&&r.safeAt<0)r.safeAt=r.t}
    else if(fr)track(r,lmKeep,arOf());
    let v=advance(r,dt);
    if(v&&force)v=r.res=force;
    if(v)slam(now,v);
    else if(!r.seen){setSt("lost",tr(r.w.feet&&bodyOf(lmKeep,arOf())?"wl.feet":"wl.lost"));if(!callRoot.classList.contains("is-lost"))call(tr("wl.lost"),tr("wl.lostSub"),"is-lost")}
    else{
      if(callRoot.classList.contains("is-lost"))callRoot.className="sp-call wl-call";
      setSt(r.hits.length?"out":"safe",tr(r.hits.length?"wl.out":"wl.safeHold"));
      const sec=Math.ceil(r.w.secs-r.t);if(sec!==tickSec){tickSec=sec;if(sec<=3&&sec>0)sfx.tick()}
    }
  }else if(phase==="slam"){if(tp>(verdictV==="safe"?SLAM_S:OUT_S)){if(verdictV==="safe"){phase="gap";phaseAt=now}else next(now)}}
  if(phase!=="off"){render(now);if(now-hudAt>60){hudAt=now;hud()}}
}

// ---------- drawing (frame px = frame-height units × canvas height) ----------
function stripes(x:number,y:number,w:number,h:number,H:number,t:number){
  const g=H*.07,off=reduced()?0:(t*H*.05)%g;
  oc.save();oc.beginPath();oc.rect(x,y,w,h);oc.clip();
  oc.strokeStyle="rgba(255,255,255,.22)";oc.lineWidth=H*.022;oc.beginPath();
  for(let s=-h-g;s<w+g;s+=g){oc.moveTo(x+s+off,y+h);oc.lineTo(x+s+off+h,y)}
  oc.stroke();oc.restore();
}
function render(now:number){
  const H=ov.height;if(!H)return;
  oc.clearRect(0,0,ov.width,H);
  if(!R||phase==="card"||phase==="count")return;
  const ar=ov.width/H,t=now/1000,rm=reduced();
  const age=(now-spawnAt)/1000, slide=rm?1:Math.min(1,age/IN_S), e=1-(1-slide)**3;
  const left=Math.max(0,1-R.t/R.w.secs);
  // after a survived wall it fades away; a catching wall stays solid
  let alpha=.5;
  if(phase==="slam"){const a=(now-phaseAt)/1000;alpha=verdictV==="caught"?.72:Math.max(0,.85*(1-a/SLAM_S))}
  else if(phase==="gap")alpha=Math.max(0,.5-(now-phaseAt)/1000*2);
  else if(left<.3&&!rm)alpha=.5+.2*Math.sin(t*18);
  if(alpha<=0)return;
  for(const q of R.w.rects){
    const dx=q.x0<=0&&q.x1<ar?-1:q.x1>=ar&&q.x0>0?1:0, dy=dx?0:q.y0>0?1:-1;
    const w=(q.x1-q.x0)*H,h=(q.y1-q.y0)*H;
    const x=q.x0*H+dx*(1-e)*w,y=q.y0*H+dy*(1-e)*h;
    oc.globalAlpha=alpha;oc.fillStyle=RED;oc.fillRect(x,y,w,h);
    oc.globalAlpha=Math.min(1,alpha*1.6);stripes(x,y,w,h,H,t);
    oc.strokeStyle=INK;oc.lineWidth=Math.max(3,H*.012);oc.strokeRect(x,y,w,h);
  }
  oc.globalAlpha=1;
  // the tracked points: red inside the wall, green out of it (where the game thinks the body is)
  const lm=lmKeep;
  if(lm&&(phase==="wall"||phase==="slam")){
    const hit=new Set(R.hits),rad=Math.max(4,H*.013);
    for(const i of PTS){const p=lm[i];if(!p||!((p.visibility??1)>VIS)||!Number.isFinite(p.x))continue;
      const X=(1-p.x)*ar*H,Y=p.y*H,bad=hit.has(i);
      oc.fillStyle=bad?RED:GREEN;oc.strokeStyle="#fff";oc.lineWidth=rad*.45;
      oc.beginPath();oc.arc(X,Y,bad&&!rm?rad*(1.25+.2*Math.sin(t*20)):rad,0,Math.PI*2);oc.fill();oc.stroke()}
  }
}
// HUD: text only when it changes
function hud(){
  const r=R, on=phase==="wall"&&!!r;
  ringEl.classList.toggle("on",on||phase==="slam");
  if(!r)return;
  const left=Math.max(0,r.w.secs-r.t), frac=left/r.w.secs;
  arc.style.strokeDashoffset=String(100-frac*100);
  ringEl.classList.toggle("hot",frac<.3);
  ringEl.classList.toggle("paused",on&&!r.seen);
  const txt=dec(Math.ceil(left*10)/10,1);
  if(txt!==shown.t){shown.t=txt;tEl.textContent=txt}
}
// what the TV board shows (cast.ts merges it over the rep-game state): 2 players = both walls survived; else the current player
function tvState():Partial<ScreenState>{
  const done=phase==="off"&&!endRoot.classList.contains("hide"), r=R;
  const secs=r?Math.ceil(r.w.secs):5, left=done?0:r&&phase==="wall"?Math.max(0,r.w.secs-r.t):secs;
  const rk=rank(scores);
  return {players:n===2?2:1,duration:secs,left,round:Math.max(0,round-1),mult:1,
    ex:{id:"wall",name:done?tr("wl.title"):`${names0[k]??""} · ${tr("wl.round",{n:Math.max(1,round)})}`.slice(0,40)},
    score:n===2?[scores[0].rounds,scores[1].rounds]:[scores[n===1?0:Math.min(k,n-1)]?.rounds??0,0],reps:scores.reduce((s,x)=>s+x.rounds,0),
    winner:done&&n===2&&rk[0].place===1&&rk[1].place!==1?(rk[0].i+1) as 1|2:0};
}

// ---------- results ----------
function finish(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  turnRoot.hidden=true;hideSt();oc.clearRect(0,0,ov.width,ov.height);
  const h=loadHist();
  h.unshift({t:Date.now(),players:n,duration:Math.round((performance.now()-startedAt)/1000),ex:["wall"],score:[0,0],reps:scores.map(s=>s.rounds),mode:"wall",secs:scores.map(s=>Math.round(s.secs*10)/10)});
  saveHist(h);
  const r=rank(scores), top=scores[r[0].i].rounds, winners=r.filter(x=>x.place===1), w=winners.length===1?winners[0].i:-1, lead=w<0?r[0].i:w;
  const head=$("#wlResHead"),win=$("#wlWin"),sub=$("#wlSub");
  if(!top){win.textContent=tr("wl.wallWins");sub.textContent=tr("wl.wallWinsSub")}
  else if(n===1){win.textContent=tn("wl.rnd",top);sub.textContent=tr("wl.soloSub",{s:dec(scores[0].secs,1)})}
  else if(w<0){win.textContent=tr("res.tie");sub.textContent=tn("wl.winSub",top)}
  else{win.textContent=tr("lj.wins",{name:names0[w]});sub.textContent=tn("wl.winSub",top)}
  head.style.setProperty("--c",top?TONE[lead]:"var(--ink)");head.dataset.c=top?WHO[lead]:"ink";
  $("#wlResArt").innerHTML=mascot(WHO[lead],!top?"lose":w<0?"idle":"win",{anim:true});
  const rb=$("#wlRec");rb.hidden=!(top>pb);rb.textContent=tr(pb?"sp.newPb":"sp.firstPb");
  $("#wlRows").replaceChildren(...r.map((x,j)=>{
    const s=scores[x.i],li=document.createElement("li");li.className="sp-row lj-row wl-row";li.style.setProperty("--i",String(j));li.style.setProperty("--tone",TONE[x.i]);li.style.setProperty("--tone-ink",TONE_INK[x.i]);
    li.innerHTML=`<span class="sp-place d">${x.place}</span>${face(x.i,"sp-row-face",n>1?(x.place===1&&top?"happy":"sad"):undefined)}<span class="sp-row-txt"><b></b><small></small></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=names0[x.i];
    li.querySelector(".sp-row-txt small")!.textContent=s.rounds?tr("wl.rowSub",{s:dec(s.secs,1),r:dec(s.react/s.rounds,1)}):tr("wl.rowSub0",{s:dec(s.secs,1)});
    li.querySelector(".sp-row-t")!.textContent=tn("wl.rnd",s.rounds);
    return li;
  }));
  runRoot.classList.add("hide");document.body.classList.remove("walling");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
  sfx.finish();
}
$("#wlAgain").onclick=()=>{resetGame();go()};
$("#wlHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// test hooks (e2e / tools/wall-check.mjs): state probe, skip the turn gate, force the next verdicts (the fake camera
// cannot dodge), fix the seed
(window as any).__wl={
  state:()=>({phase,k,n,round,kind:R?.w.kind??"",t:R?.t??0,secs:R?.w.secs??0,seen:R?.seen??false,hits:R?.hits.length??0,res:R?.res??"",
    rects:R?.w.rects??[],scores:scores.map(s=>({...s}))}),
  ready:()=>{if(phase==="card")count(performance.now())},
  force:(v:Verdict)=>{force=v},
  seed:(s:number)=>{seedFix=s}, // 0 = a random seed per game
};

export const WALL:GameMode={
  start:begin,
  tv:true,
  reset(){
    cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);callRoot.className="sp-call wl-call";
    setScreenMode(null);force="";R=null;lastPs=null;lmKeep=null;turnRoot.hidden=true;hideSt();oc.clearRect(0,0,ov.width,ov.height);
    runRoot.classList.add("hide");endRoot.classList.add("hide");document.body.classList.remove("walling");
  },
  shown:()=>!endRoot.classList.contains("hide")||(phase==="card"&&!runRoot.classList.contains("hide")),
};
