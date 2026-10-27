// Boulingas (issue #20, idea from #4; tuning #26): pick a hand with the camera (2 s rings, switchable), aim with the
// hand, turn the knuckle to spin, make a full back-to-front swing to release. 1-4 players take turns (only the thrower
// stands in front of the phone); 3 or 5 frames, real ten-pin
// scoring (strike / spare / split / miss), the last frame gets bonus balls. Rules + pin physics are PURE in logic.ts
// (test/unit/bowling.test.ts); this file is the screens, the camera gesture, the lane rendering and the flow.
// Flow: Pradžia tile -> #/boulingas (setup) -> startFlow(BOWLING) -> #loading -> #ready (arms-up gate, game.ts) ->
// BOWLING.start(): turn card -> hand -> aim -> throw -> pins -> next ball / next player -> #bwEnd results.
import "./bowling.css";
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
import type {Game as Row} from "../history/stats.ts";
import {$} from "../ui/dom.ts";
import {t as tr,tn} from "../i18n/i18n.ts";
import {mascot,avatar,type Who} from "../ui/mascots.ts";
import {cachedNick} from "../online/api.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import type {ScreenState} from "../cast/room.ts";
import {
  PINS, LANE_W, BALL_R, PIN_H, PIN_Z, MAX_Z, DEFAULT_FRAMES, SPEED_MIN, SPEED_MAX,
  control, handChoice, aimOf, ballX, throwSpeed, simulateThrow, newSeries, turnOf, rackCount, maxRolls, addRoll,
  isSplit, scoreCard, rank, rollMarks, bestTotal, pickStep, spinOf, swing, swingState, type Series, type Throw, type SwingState,
} from "./logic.ts";

const WHO:Who[]=["r","b","y","g"];
const TONE=["#FF3B3B","#2F6BFF","#FFC61A","#16B67A"], TONE_INK=["var(--red-ink)","var(--blue-ink)","var(--yellow-ink)","var(--green-ink)"];
const DEF=[tr("p.red"),tr("p.blue"),tr("p.yellow"),tr("p.green")];
const NAME_MAX=14, GATE_MS=1100, GATE_GRACE=300, CARD_MS=1100, RESULT_EXTRA=1800, GAME_CLOCK=600;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const reduced=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const face=(i:number,cls="",mood?:"happy"|"sad")=>`<span class="${cls}" style="--tone:${TONE[i]}">${avatar(WHO[i],mood)}</span>`;
const store={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};
const PIN_SVG=`<svg viewBox="0 0 24 42" aria-hidden="true"><path d="M12 1c3.8 0 6 2.4 6 5.6 0 2.2-1 3.6-2.2 5.2-1.2 1.7-1.9 3.5-1.6 5.6h1.1c2.8 1.7 4.4 5.2 4.4 10.1C19.7 35 16.5 41 12 41S4.3 35 4.3 27.5c0-4.9 1.6-8.4 4.4-10.1h1.1c.3-2.1-.4-3.9-1.6-5.6C7 10.2 6 8.8 6 6.6 6 3.4 8.2 1 12 1Z" fill="#fff" stroke="#14183A" stroke-width="2.6"/><path d="M7.6 10.4h8.8M7.1 14.2h9.8" stroke="#FF3B3B" stroke-width="2.4" stroke-linecap="round"/></svg>`;

// ---------- markup (built here, the shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile bw-tile tap";tile.href="#/boulingas";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("bw.title")}</b><small>${tr("bw.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true">${mascot("r","guard",{anim:true})}<span class="bw-tile-pins">${PIN_SVG}${PIN_SVG}${PIN_SVG}</span></span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".hd-tile")??document.querySelector(".lj-tile")??document.querySelector(".sp-tile")??document.getElementById("rankCard"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="bowling" aria-labelledby="bwTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="bwTitle" tabindex="-1">${tr("bw.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    <div class="bw-hero" aria-hidden="true">
      <span class="bw-hero-big">${tr("bw.heroBig")}</span><span class="bw-hero-sub">${tr("bw.hero")}</span>
      <span class="bw-hero-lane"></span><span class="bw-hero-pins">${PIN_SVG}${PIN_SVG}${PIN_SVG}${PIN_SVG}${PIN_SVG}</span><span class="bw-hero-ball"></span>
      <span class="bw-hero-m">${mascot("b","guard",{anim:true})}</span>
    </div>
    <section class="pick" aria-label="${tr("bw.players")}">
      <div class="seg sp-seg bw-seg" role="group" aria-label="${tr("bw.players")}">
        ${[1,2,3,4].map(k=>`<button data-bw="${k}" aria-pressed="false"><span><b class="d">${k}</b><small>${k===1?tr("mode.solo"):tn("bw.pl",k)}</small></span></button>`).join("")}
      </div>
      <p class="help bw-party">${tr("bw.party")}</p>
    </section>
    <section class="box bw-names" aria-labelledby="bwNamesT">
      <h2 class="card-title" id="bwNamesT">${tr("bw.names")}</h2>
      <ol id="bwNames">${[0,1,2,3].map(i=>`<li class="bw-nrow" data-i="${i}">${face(i,"bw-nface")}<input class="bw-name" id="bwN${i+1}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false" aria-label="${tr("bw.nameOf",{n:i+1})}"></li>`).join("")}</ol>
    </section>
    <section class="pick" aria-label="${tr("bw.frames")}">
      <div class="seg sp-seg bw-fseg" role="group" aria-label="${tr("bw.frames")}">
        <button data-bwf="3" aria-pressed="true"><span><b class="d">3</b><small>${tn("bw.rounds",3)}</small></span></button>
        <button data-bwf="5" aria-pressed="false"><span><b class="d">5</b><small>${tn("bw.rounds",5)}</small></span></button>
      </div>
      <p class="help">${tr("bw.framesHelp")}</p>
    </section>
    <div class="box sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("bw.pb")}</small><b class="d" id="bwPb">–</b><p class="help" id="bwPbTxt"></p></div></div>
    <section class="box sp-how" aria-labelledby="bwHowT">
      <h2 class="card-title" id="bwHowT">${tr("bw.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("bw.how1")}</span></li>
        <li><span data-icon="arrow-up"></span><span>${tr("bw.how2")}</span></li>
        <li><span data-icon="target"></span><span>${tr("bw.how3")}</span></li>
      </ol>
      <p class="help bw-rules">${tr("bw.rules")}</p>
    </section>
    <div class="cta">
      <button class="go tap" id="bwGo" type="button"><span>${tr("bw.toLane")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
document.body.insertAdjacentHTML("beforeend",`
<div class="screen sp-run bw-run hide" id="bwRun">
  <canvas id="bwCv" role="img" aria-label="${tr("bw.lane")}"></canvas>
  <div class="bw-hud">
    <div class="bw-scoreboard" id="bwBoard" aria-label="${tr("bw.standings")}"></div>
    <div class="bw-status" id="bwStatus"><span class="bw-frame-pill" id="bwFrame"></span><span class="bw-left-pill" id="bwLeft"></span></div>
  </div>
  <div class="bw-hand" id="bwHand" aria-live="polite">
    <div class="bw-picks">
      <span class="bw-pick" id="bwPickL" aria-hidden="true"><svg viewBox="0 0 36 36"><circle class="bw-pick-bg" cx="18" cy="18" r="15.9"/><circle class="bw-pick-ring" id="bwRingL" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span>${tr("bw.sideLeft")}</span></span>
      <span class="bw-hand-txt"><b id="bwHandT"></b><small id="bwHandS"></small></span>
      <span class="bw-pick" id="bwPickR" aria-hidden="true"><svg viewBox="0 0 36 36"><circle class="bw-pick-bg" cx="18" cy="18" r="15.9"/><circle class="bw-pick-ring" id="bwRingR" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span>${tr("bw.sideRight")}</span></span>
    </div>
    <span class="bw-hand-bar"><i id="bwHBar"></i></span>
  </div>
  <div class="bw-aim" id="bwAim"><span class="bw-aim-dot"></span><b id="bwAimT"></b></div>
  <div class="sp-call bw-call" id="bwCall" aria-live="assertive"><b class="d" id="bwCallT"></b><small id="bwCallS"></small></div>
  <div class="bw-turn" id="bwTurn" hidden>
    <div class="bw-turn-card" role="dialog" aria-labelledby="bwTurnN">
      <span class="bw-turn-art" id="bwTurnArt" aria-hidden="true"></span>
      <span class="eyebrow">${tr("bw.now")}</span>
      <b class="d bw-turn-n" id="bwTurnN"></b>
      <span class="bw-turn-a" id="bwTurnA"></span>
      <div class="bw-gate" id="bwGate"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="bw-ring" id="bwRing" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span id="bwGateT">${tr("bw.armsUp")}</span></div>
      <ol class="bw-mini" id="bwMini" aria-label="${tr("bw.standings")}"></ol>
    </div>
  </div>
</div>
<section class="screen hide" id="bwEnd" aria-labelledby="bwWin">
  <div class="wrap">
    <header class="sp-res-head bw-res-head" id="bwResHead">
      <span class="sp-res-art" id="bwResArt" aria-hidden="true"></span>
      <span class="wl">${tr("bw.title")}</span>
      <h2 class="d" id="bwWin"></h2>
      <p id="bwSub"></p>
      <span class="rec-badge" id="bwRec" hidden>${tr("bw.newPb")}</span>
    </header>
    <ol class="sp-rows bw-rows" id="bwRows" aria-label="${tr("bw.results")}"></ol>
    <div class="cta">
      <button class="go" id="bwAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("app.again")}</button>
      <button class="go alt" id="bwHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#bwRun"), endRoot=$("#bwEnd"), cvs=$<HTMLCanvasElement>("#bwCv"), ctx=cvs.getContext("2d",{alpha:false})!;
const callRoot=$("#bwCall"), callT=$("#bwCallT"), callS=$("#bwCallS"), turnRoot=$("#bwTurn"), gateRoot=$("#bwGate"), ring=$("#bwRing"), gateT=$("#bwGateT");
const boardEl=$("#bwBoard"), frameEl=$("#bwFrame"), leftEl=$("#bwLeft"), handEl=$("#bwHand"), handT=$("#bwHandT"), handS=$("#bwHandS"), hbar=$("#bwHBar"), aimEl=$("#bwAim"), aimT=$("#bwAimT");
const pickEls=[$("#bwPickL"),$("#bwPickR")], pickRings=[$("#bwRingL"),$("#bwRingR")];

// ---------- history (mode "bowling", bwTotals / bwRolls / bwFrames) ----------
// ---------- setup: 1-4 players, names, 3/5 frames ----------
let n=2, frames=DEFAULT_FRAMES;
const names=["","","",""];
{const k=Number(store.get("novacore.bwN"));if(k>=1&&k<=4)n=k;
 const f=Number(store.get("novacore.bwFrames"));if(f===5)frames=5;
 try{const a=JSON.parse(store.get("novacore.bwNames")||"[]");if(Array.isArray(a))a.slice(0,4).forEach((v,i)=>{if(typeof v==="string")names[i]=v.slice(0,NAME_MAX)})}catch(e){}}
const nameAt=(i:number)=>i===0?names[0].trim()||cachedNick()||DEF[0]:names[i].trim()||DEF[i];
const segBtns=[...document.querySelectorAll<HTMLElement>("[data-bw]")], fBtns=[...document.querySelectorAll<HTMLElement>("[data-bwf]")], inputs=[0,1,2,3].map(i=>$<HTMLInputElement>(`#bwN${i+1}`));
function syncSetup(){
  segBtns.forEach(b=>{const on=Number(b.dataset.bw)===n;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  fBtns.forEach(b=>{const on=Number(b.dataset.bwf)===frames;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  document.querySelectorAll<HTMLElement>(".bw-nrow").forEach(r=>r.hidden=Number(r.dataset.i)>=n);
  if(!names[0]&&cachedNick())inputs[0].placeholder=cachedNick()!;
  inputs.forEach((el,i)=>{el.placeholder=i===0&&cachedNick()?cachedNick()!:DEF[i];if(document.activeElement!==el)el.value=names[i]});
}
segBtns.forEach(b=>b.onclick=()=>{n=Number(b.dataset.bw);store.set("novacore.bwN",String(n));syncSetup();renderPb()});
fBtns.forEach(b=>b.onclick=()=>{frames=Number(b.dataset.bwf)===5?5:3;store.set("novacore.bwFrames",String(frames));syncSetup();renderPb()});
inputs.forEach((el,i)=>{
  el.oninput=()=>{names[i]=el.value.slice(0,NAME_MAX);store.set("novacore.bwNames",JSON.stringify(names))};
  el.onkeydown=e=>{if(e.key==="Enter")el.blur()};
});
function renderPb(){
  const b=bestTotal(loadHist(),frames);
  $("#bwPb").textContent=b?tr("bw.total",{n:b}):"–";
  $("#bwPbTxt").textContent=b?tr("bw.pbTxt",{n:frames}):tr("bw.pbNone");
}
onView("bowling",()=>{syncSetup();renderPb()});
// one thrower in front of the camera at a time (same as Šuolis į tolį): the shared pose count goes to 1
function go(){document.querySelector<HTMLElement>('[data-p="1"]')?.click();S.players=1;startFlow(BOWLING)}
$("#bwGo").onclick=go;

// ---------- session state ----------
type Phase="off"|"card"|"hand"|"aim"|"roll";
let phase:Phase="off", phaseAt=0, raf=0, last=0, hudAt=0, callTimer=0, startAt=0, cardUntil=0, firstTurn=true, lastPlayer=-1;
let series:Series=newSeries(2,DEFAULT_FRAMES), names0:string[]=[], pb=0;
let sim:Throw|null=null, throwAt=0, resultAt=0, nextAt=0, resultShown=false, lastThrow:number[]=[], throwSpeedUsed=0;
let chosen:0|1=1, aim=0, spin=0, aimLocked=false, prevWrist:{x:number;y:number;t:number}|null=null;
let pickProg:[number,number]=[0,0], lastPickAt=0;
let SW:SwingState=swingState();
let lmKeep:Lm[]|null=null, scripted=false, forceHand:0|1|null=null, gateHold=0, gateLast=0;
let L:LaneLayout, bg:HTMLCanvasElement|null=null, lastAimText="", lastFrameText="", lastLeftText="";
const PN=90, part=new Float32Array(PN*6); let partN=0; // x,y,vx,vy,age,life (screen px)
const PCOL=["#FF3B3B","#2F6BFF","#FFC61A","#16B67A","#FFFFFF","#5B8CFF"];

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call bw-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
const ar=()=>detCv.width/detCv.height||cv.width/cv.height||16/9;
const cur=()=>turnOf(series);

// ---------- flow ----------
function begin(){
  names0=[...Array(n).keys()].map(nameAt);
  series=newSeries(n,frames);firstTurn=true;lastPlayer=-1;
  pb=bestTotal(loadHist(),frames);
  sim=null;resultShown=false;part.fill(0);partN=0;lastAimText=lastFrameText=lastLeftText="";
  runRoot.classList.remove("hide");endRoot.classList.add("hide");
  document.body.classList.add("sprinting","bowling"); // .sprinting = the corner camera preview (sprint.css)
  startAt=performance.now();S.running=false;
  resize();
  document.fonts?.load("400 40px \"Titan One\"",`${tr("bw.board")} 0123456789`).then(()=>{if(phase!=="off")buildLane()}).catch(()=>{});
  setScreenMode(tvState);
  screenPhase("play");
  last=performance.now();
  showCard(last,false);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}

function showCard(now:number,needGate:boolean){
  phase="card";phaseAt=now;S.running=false;gateHold=0;gateLast=0;
  const t=cur(),p=t.p,roll=t.roll;
  callRoot.className="sp-call bw-call";handEl.classList.remove("on");aimEl.classList.remove("on");
  const turnN=$("#bwTurnN");turnN.textContent=names0[p];turnN.style.setProperty("--tone",TONE[p]);
  $("#bwTurnArt").innerHTML=mascot(WHO[p],"guard",{anim:true});
  $("#bwTurnA").textContent=`${tr("bw.frame",{n:t.f+1,total:series.frames})} · ${tr("bw.throwOf",{n:roll+1,total:maxRolls(series)})}`;
  gateRoot.hidden=!needGate;ring.style.strokeDashoffset="100";gateT.textContent=tr("bw.armsUp");
  const mini=$("#bwMini");mini.hidden=n<2;mini.classList.toggle("many",n>2);
  const cardNow=scoreCard(series);
  mini.replaceChildren(...rank(cardNow.totals).map(r=>{const li=document.createElement("li");li.className=r.i===p?"now":"";
    li.innerHTML=`${face(r.i,"bw-mface")}<span class="bw-mname"></span><b class="d"></b>`;
    li.querySelector(".bw-mname")!.textContent=names0[r.i];
    li.querySelector("b")!.textContent=String(cardNow.totals[r.i]);return li}));
  turnRoot.hidden=false;turnRoot.classList.remove("out");void turnRoot.offsetWidth;turnRoot.classList.add("in");
  cardUntil=needGate?0:now+CARD_MS;
  updateHud();
  sfx.round();
}
function gateStep(now:number,lm:Lm[]|null){
  if(!gateRoot.hidden){
    const up=!!lm&&armsUp(lm);
    if(up){gateLast=now;if(!gateHold)gateHold=now}else if(gateHold&&now-gateLast>GATE_GRACE)gateHold=0;
    const pct=gateHold?Math.min(1,(now-gateHold)/GATE_MS):0;
    ring.style.strokeDashoffset=String(100-pct*100);
    const msg=lm?tr(up?"bw.hold":"bw.armsUp"):tr("bw.stepIn");
    if(gateT.textContent!==msg)gateT.textContent=msg;
    gateRoot.classList.toggle("ok",up);
    if(pct>=1)startHand(now);
    return;
  }
  if(now>=cardUntil)startHand(now);
}
function startHand(now:number){
  if(phase!=="card")return;
  phase="hand";phaseAt=now;S.running=true;firstTurn=false;
  turnRoot.classList.remove("in");turnRoot.classList.add("out");
  setTimeout(()=>{if(phase!=="card")turnRoot.hidden=true},240);
  forceHand=null;prevWrist=null;aimLocked=false;
  pickProg=[0,0];lastPickAt=0;SW=swingState();
  handEl.dataset.mode="pick";handEl.style.setProperty("--tone",TONE[series.p]);handEl.style.setProperty("--tone-ink",TONE_INK[series.p]);
  setPicks(pickProg,null);
  clearTimeout(callTimer);callRoot.classList.remove("on"); // the bottom card with both rings is the instruction
  setHand(tr("bw.pickHand"),tr("bw.pickHint"),0,true);
}
function chooseHand(side:0|1,now:number){
  if(phase!=="hand")return;
  chosen=side;phase="aim";aim=0;spin=0;aimLocked=false;prevWrist=null;SW=swingState();
  handEl.dataset.mode="aim";
  clearTimeout(callTimer);callRoot.classList.remove("on"); // the big call hides, the bottom card takes over
  setHand(tr("bw.raise"),tr("bw.aimSub"),0,true);
  updateAimText();
  sfx.round();
}
function handStep(now:number,lm:Lm[]|null){
  if(scripted){if(forceHand!=null)chooseHand(forceHand,now);return} // the e2e camera never picks a hand
  const c=lm?control(lm,ar()):null;
  const dt=lastPickAt?Math.min(.1,(now-lastPickAt)/1000):0;lastPickAt=now;
  if(!c){
    pickProg=pickStep(pickProg,null,dt);setPicks(pickProg,null);
    setHand(tr("bw.noHand"),tr("bw.pickHint"),0,true);return;
  }
  const side=handChoice(c);
  pickProg=pickStep(pickProg,side,dt);setPicks(pickProg,side);
  if(side==null){setHand(tr("bw.pickHand"),tr("bw.pickHint"),0,true);return}
  setHand(side?tr("bw.pickRight"):tr("bw.pickLeft"),tr("bw.hold"),0,true);
  if(pickProg[side]>=1)chooseHand(side,now);
}
function aimStep(now:number,lm:Lm[]|null){
  if(scripted){setHand(tr("bw.aim"),tr("bw.aimSub"),1,true);return}
  const c=lm?control(lm,ar()):null;
  if(!c){prevWrist=null;SW=swingState();aimLocked=false;setHand(tr("bw.noHand"),tr("bw.aimSub"),0,true);return}
  const w=c.wrists[chosen];
  if(!w.ok){prevWrist=null;SW=swingState();aimLocked=false;setHand(tr("bw.noHand"),tr("bw.aimSub"),0,true);return}
  const dt=prevWrist?Math.min(.2,(now-prevWrist.t)/1000):0;
  const lateral=prevWrist&&dt>0?(w.x-prevWrist.x)/dt/c.body.u:0;
  spin=clamp(spin+(spinOf(w.knuckle,lateral)-spin)*0.28,-1,1);
  const r=swing(SW,{ok:true,y:w.y,z:w.z},c.body,now);
  if(r==="release"){launch(now,aim,spin,throwSpeed(SW.peak));return} // aim is the last up-pose line
  if(r==="forward")aimLocked=true; // lock at the up-pose line before this frame's hand position is read
  // the hand position aims while the arm is up; once the downswing starts the line is locked (and on a one-frame
  // release the aim stays the previous up-pose value, not the low hand position)
  if(!aimLocked){const a=aimOf(c,chosen);if(a!=null)aim=clamp(aim+(a-aim)*0.32,-1,1)}
  prevWrist={x:w.x,y:w.y,t:now};
  if(r==="back")setHand(tr("bw.aim"),tr("bw.swingHint"),1,true); // the raised arm is the aim pose; keep aiming
  else if(r==="forward")setHand(tr("bw.forward"),tr("bw.aimSub"),1,true); // the downswing starts
  if(SW.phase==="idle"){
    if(aimLocked)aimLocked=false;
    setHand(tr("bw.aim"),tr("bw.swingHint"),0,true);
  }
  updateAimText();
}
function launch(now:number,aimV:number,spinV:number,speed:number){
  if(phase!=="aim")return;
  aim=clamp(aimV,-1,1);spin=clamp(spinV,-1,1);throwSpeedUsed=clamp(speed,SPEED_MIN,SPEED_MAX);
  sim=simulateThrow(series.rack,aim,spin,throwSpeedUsed,(Math.floor(Math.random()*1e9)||1)); // tiny per-throw pin scatter
  phase="roll";phaseAt=now;throwAt=now;resultShown=false;
  resultAt=now+(PIN_Z/throwSpeedUsed)*1000+220;
  nextAt=now+Math.max(3300,(PIN_Z/throwSpeedUsed)*1000+RESULT_EXTRA+900);
  handEl.classList.remove("on");aimEl.classList.remove("on");
  callRoot.className="sp-call bw-call";
  sfx.leap();
  setTimeout(()=>{if(phase==="roll")sfx.punch(0)},Math.max(250,(PIN_Z/throwSpeedUsed)*1000-120));
}
function showThrowResult(now:number){
  if(!sim||resultShown)return;
  resultShown=true;
  const t=cur(),down=sim.down.length,beforeRack=rackCount(series);
  const r=addRoll(series,sim.down);
  lastThrow=sim.down.slice();
  const split=!r.strike&&!r.spare&&t.roll===0&&isSplit(series.rack);
  if(split)series.splits[t.p][t.f]=true;
  const leftAfter=Math.max(0,beforeRack-down); // the pins actually left on the lane after this ball
  lastPlayer=t.p;
  if(r.strike){
    call(tr("bw.strike"),tr("bw.strikeSub"),"is-big",2200);sfx.finish();burst();
  }else if(r.spare){
    call(tr("bw.spare"),tr("bw.spareSub"),"is-good",2000);sfx.round();
  }else if(down===0){
    const g=sim.gutter;
    call(tr(g?"bw.gutter":"bw.miss"),tr(g?"bw.gutterSub":"bw.missSub"),"is-bad",1900);sfx.miss();
  }else{
    const sub=split?tr("bw.splitSub"):tr("bw.pinsLeft",{n:leftAfter});
    call(tn("bw.pinsDown",down),sub,split?"is-split":"is-count",2000);sfx.rep(0);
  }
  updateHud(t,leftAfter);
  void now;
}
function nextTurn(now:number){
  if(series.done){finish();return}
  const needGate=!firstTurn&&series.p!==lastPlayer;
  showCard(now,needGate);
}
function finish(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  const cardNow=scoreCard(series),totals=cardNow.totals,r=rank(totals);
  const reps=totals.map((_,p)=>series.frameRolls[p].flat().reduce((a,b)=>a+b,0));
  const h=loadHist();
  const row:Row={t:Date.now(),players:n,duration:Math.round((performance.now()-startAt)/1000),ex:["bowling"],score:[0,0],reps,
    mode:"bowling",bwFrames:frames,bwRolls:series.frameRolls.map(fr=>fr.flat()),bwFrameRolls:series.frameRolls.map(fr=>fr.map(x=>x.slice())),bwTotals:totals.slice()};
  h.unshift(row);saveHist(h);
  const best=Math.max(0,...totals),newPb=best>pb;
  const winners=r.filter(x=>x.place===1),w=winners.length===1?winners[0].i:-1;
  const head=$("#bwResHead"),win=$("#bwWin"),sub=$("#bwSub");
  if(n===1){
    win.textContent=tr("bw.total",{n:totals[0]});
    sub.textContent=`${tr("bw.soloSub",{n:frames})} · ${tr("bw.strikes",{n:cardNow.strikes[0]})} · ${tr("bw.spares",{n:cardNow.spares[0]})}`;
  }else if(w<0){
    win.textContent=tr("bw.tie");
    sub.textContent=tr("bw.total",{n:totals[r[0].i]});
  }else{
    win.textContent=tr("bw.wins",{name:names0[w]});
    const runner=r.find(x=>x.i!==w);
    sub.textContent=runner?tr("bw.diff",{n:totals[w]-totals[runner.i]}):tr("bw.total",{n:totals[w]});
  }
  const tone=w<0?r[0].i:w;
  head.style.setProperty("--c",totals.every(t=>t===0)?TONE[0]:TONE[tone]);
  head.dataset.c=WHO[tone];
  $("#bwResArt").innerHTML=mascot(WHO[winners.length===1?tone:r[0].i],winners.length===1?"win":"idle",{anim:true});
  const rb=$("#bwRec");rb.hidden=!newPb;rb.textContent=tr(pb?"bw.newPb":"bw.firstPb");
  $("#bwRows").replaceChildren(...r.map((x,j)=>{
    const li=document.createElement("li");li.className="sp-row bw-row";li.style.setProperty("--i",String(j));li.style.setProperty("--tone",TONE[x.i]);li.style.setProperty("--tone-ink",TONE_INK[x.i]);
    const mood=n>1?(x.place===1?"happy":"sad"):undefined;
    li.innerHTML=`<span class="sp-place d">${x.place}</span>${face(x.i,"sp-row-face",mood)}<span class="sp-row-txt"><b></b><ol class="bw-frames"></ol></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=names0[x.i];
    const table=li.querySelector<HTMLOListElement>(".bw-frames")!;
    const marks=series.frameRolls[x.i].map(fr=>rollMarks(fr));
    table.replaceChildren(...marks.map((m,f)=>{
      const cell=document.createElement("li");cell.className="bw-fcell";
      const sc=cardNow.frameScores[x.i][f];
      cell.innerHTML=`<span class="bw-fm"></span><small>${sc==null?"·":sc}</small>`;
      cell.querySelector(".bw-fm")!.replaceChildren(...m.map(txt=>Object.assign(document.createElement("i"),{textContent:txt})));
      cell.setAttribute("aria-label",`${tr("bw.frame",{n:f+1,total:series.frames})}: ${m.join(" ")}${sc==null?"":" · "+sc}`);
      return cell;
    }));
    li.querySelector(".sp-row-t")!.textContent=tr("bw.total",{n:x.total});
    return li;
  }));
  runRoot.classList.add("hide");document.body.classList.remove("sprinting","bowling");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
  sfx.finish();
}
$("#bwAgain").onclick=()=>{resetGame();go()};
$("#bwHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// ---------- HUD + prompts ----------
const totalCache=new Map<number,string>();
// turn/leftOverride: during the result call keep the THROWER's frame/ball and the pins left by that ball, while the
// scorecard totals/frames already include the throw (the next player's card starts only on the next turn card)
function updateHud(turn?:{p:number;f:number;roll:number},leftOverride?:number){
  const cardNow=scoreCard(series),t=turn??cur();
  if(boardEl.dataset.n!==String(n))buildBoard();
  for(let i=0;i<n;i++){
    const v=String(cardNow.totals[i]);
    if(totalCache.get(i)!==v){totalCache.set(i,v);const el=$(`#bwT${i}`);if(el)el.textContent=v}
    const cardEl=$(`#bwP${i}`);if(cardEl)cardEl.classList.toggle("now",i===t.p&&!series.done);
    const fr=$(`#bwF${i}`);if(fr){const m=series.frameRolls[i].map((x,f)=>x.length?rollMarks(x).join(""):"").filter(Boolean).join(" ");if(fr.textContent!==m)fr.textContent=m||"–"}
  }
  const total=t.f===series.frames-1?3:2;
  const ft=`${tr("bw.frame",{n:Math.min(series.frames,t.f+1),total:series.frames})} · ${tr("bw.throwOf",{n:t.roll+1,total})}`;
  if(ft!==lastFrameText){lastFrameText=ft;frameEl.textContent=ft}
  const nLeft=leftOverride??rackCount(series);
  const left=series.done||nLeft<=0?"":tr("bw.left",{n:nLeft});
  if(left!==lastLeftText){lastLeftText=left;leftEl.textContent=left;leftEl.hidden=!left}
}
function buildBoard(){
  boardEl.dataset.n=String(n);
  boardEl.replaceChildren(...[...Array(n).keys()].map(i=>{
    const el=document.createElement("div");el.className=`bw-pc p${i+1}`;el.id=`bwP${i}`;
    el.innerHTML=`<span class="bw-pc-face">${avatar(WHO[i])}</span><span class="bw-pc-txt"><b>${names0[i]??DEF[i]}</b><small id="bwF${i}">–</small></span><b class="d bw-pc-total" id="bwT${i}">0</b>`;
    return el;
  }));
  totalCache.clear();
}
function setPicks(p:[number,number],side:0|1|null){
  for(let i=0;i<2;i++){
    pickRings[i].style.strokeDashoffset=String(100-clamp(p[i],0,1)*100);
    pickEls[i].classList.toggle("on",side===i);
    pickEls[i].classList.toggle("done",p[i]>=1);
  }
}
function setHand(title:string,sub:string,pct:number,on:boolean){
  handEl.classList.toggle("on",on);
  if(handT.textContent!==title)handT.textContent=title;
  if(handS.textContent!==sub)handS.textContent=sub;
  hbar.style.transform=`scaleX(${clamp(pct,0,1).toFixed(3)})`;
  handEl.classList.toggle("ok",pct>=1);
}
function updateAimText(){
  const boards=Math.round((aim*0.5+0.5)*39);
  const side=spin<-0.12?tr("bw.spinLeft"):spin>0.12?tr("bw.spinRight"):"";
  const txt=`${tr("bw.aimBoard",{n:clamp(boards,1,39)})}${side}`;
  if(txt!==lastAimText){lastAimText=txt;aimT.textContent=txt}
  aimEl.classList.add("on");
}

// ---------- TV board (cast.ts merges this over the rep-game state) ----------
function tvState():Partial<ScreenState>{
  const cardNow=scoreCard(series),t=cur(),done=series.done;
  const score:[number,number]=n===2?[cardNow.totals[0],cardNow.totals[1]]:[cardNow.totals[t.p]??0,0];
  const winner=done&&n===2?(()=>{const r=rank(cardNow.totals);return r[0].place===1&&r[1].place!==1?(r[0].i+1) as 1|2:0})():0;
  return {players:n===2?2:1,duration:GAME_CLOCK,left:Math.max(0,GAME_CLOCK-(performance.now()-startAt)/1000),round:t.f,mult:1,
    ex:{id:"bowling",name:done?tr("bw.title"):`${names0[t.p]??""} · ${tr("bw.throwOf",{n:t.roll+1,total:maxRolls(series)})}`.slice(0,40)},
    score,reps:cardNow.totals.reduce((a,_,i)=>a+series.frameRolls[i].flat().reduce((x,y)=>x+y,0),0),winner};
}

// ---------- test hooks (e2e / headless tools) ----------
function fakeRoll(ids:number[]){
  if(phase!=="aim")return;
  sim={down:ids.slice(),frames:[],endT:0,speed:0,aim,hook:spin,standing:series.rack.slice(),gutter:false};
  phase="roll";phaseAt=performance.now();throwAt=phaseAt;resultAt=phaseAt+200;nextAt=phaseAt+2400;resultShown=false;
  setHand("","",0,false);aimEl.classList.remove("on");
}
(window as any).__bw={
  state:()=>({phase,p:series.p,f:series.f,roll:turnOf(series).roll,rack:rackCount(series),rackIds:series.rack.map((v,i)=>v?i:-1).filter(i=>i>=0),
    totals:scoreCard(series).totals,rolls:series.frameRolls.map(fr=>fr.map(x=>x.slice())),done:series.done,aim,spin,last:lastThrow.slice(),sim:sim?{down:sim.down.slice(),endT:sim.endT,standing:sim.standing.slice()}:null}),
  script:()=>{scripted=true}, // ignore the camera (the e2e fake camera cannot make the gestures)
  ready:()=>{if(phase==="card")startHand(performance.now())}, // skip the gate / card delay
  hand:(side:0|1)=>{forceHand=side;if(phase==="hand")chooseHand(side,performance.now())},
  pick:(side:0|1,p:number)=>{pickProg[side]=clamp(p,0,1);setPicks(pickProg,side)}, // visual/e2e ring check
  aim:(a:number,s=0)=>{aim=clamp(a,-1,1);spin=clamp(s,-1,1);updateAimText();if(phase==="aim")setHand(tr("bw.aim"),tr("bw.aimSub"),1,true)},
  throw:(speed=11)=>{if(phase==="aim")launch(performance.now(),aim,spin,speed)},
  // deterministic scoring path for the e2e: knock these pin ids (or the first N standing pins) now
  pins:(ids:number[])=>fakeRoll(ids),
  knock:(n:number)=>fakeRoll(series.rack.map((v,i)=>v?i:-1).filter(i=>i>=0).slice(0,n)),
};

// ---------- lane layout + drawing ----------
interface LaneLayout{W:number;H:number;cx:number;yNear:number;yFar:number;nearHalf:number;farHalf:number;top:number}
function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  L=laneLayout(W,H,n);
  buildLane();
  if(cv.width)document.body.style.setProperty("--sp-cam-ar",String(cv.width/cv.height));
}
addEventListener("resize",()=>{if(phase!=="off")resize()});
function laneLayout(W:number,H:number,players:number):LaneLayout{
  const yNear=H*0.955, yFar=H*(players>2?0.37:0.315), nearHalf=W*0.62, farHalf=Math.min(W*0.18, nearHalf*0.34);
  return {W,H,cx:W/2,yNear,yFar,nearHalf,farHalf,top:Math.max(8,H*0.03)};
}
const easeZ=(z:number)=>Math.pow(clamp(z/MAX_Z,0,1),0.72);
const halfAt=(z:number)=>L.nearHalf+(L.farHalf-L.nearHalf)*easeZ(z);
const yAt=(z:number)=>L.yNear+(L.yFar-L.yNear)*easeZ(z);
const pinHAt=(z:number)=>clamp((PIN_H/LANE_W)*(2*halfAt(z))*1.12,18,64);
const ballRAt=(z:number)=>clamp((BALL_R/LANE_W)*(2*halfAt(z)),7,28);
const sxAt=(x:number,z:number)=>L.cx+x*(2*halfAt(z)/LANE_W);
function buildLane(){
  const {W,H,cx,yNear,yFar,nearHalf,farHalf}=L;
  const dpr=Math.min(2,devicePixelRatio||1);
  const c=document.createElement("canvas");c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);
  const x=c.getContext("2d")!;x.setTransform(dpr,0,0,dpr,0,0);
  // dark hall
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,"#060A1C");g.addColorStop(.42,"#111637");g.addColorStop(1,"#070A20");
  x.fillStyle=g;x.fillRect(0,0,W,H);
  // neon strips on the ceiling
  x.fillStyle="rgba(91,140,255,.22)";x.fillRect(0,yFar-66,W,3);
  for(let i=0;i<9;i++){const px=W*(.08+i*.105);x.fillStyle=i%3===0?"#FFC61A":i%3===1?"#FF3B3B":"#5B8CFF";x.globalAlpha=.7;x.beginPath();x.arc(px,yFar-67,3,0,Math.PI*2);x.fill()}
  x.globalAlpha=1;
  // back wall + neon sign
  const wallY=Math.max(L.top,yFar-58);
  x.fillStyle="#0D1230";x.fillRect(0,wallY,W,yFar-wallY+2);
  x.strokeStyle="rgba(91,140,255,.35)";x.lineWidth=2;x.strokeRect(10,wallY+8,W-20,yFar-wallY-12);
  x.save();x.translate(cx,(wallY+yFar)/2);x.textAlign="center";x.textBaseline="middle";
  x.font=`400 ${clamp(W*.055,18,34)}px "Titan One",Nunito,sans-serif`;
  x.fillStyle="#FFC61A";x.strokeStyle="#FF3B3B";x.lineWidth=4;x.strokeText(tr("bw.board"),0,0);x.fillText(tr("bw.board"),0,0);
  x.restore();
  // side walls (perspective)
  x.fillStyle="#0B0F2A";
  x.beginPath();x.moveTo(0,yFar);x.lineTo(cx-farHalf,yFar);x.lineTo(cx-nearHalf,yNear);x.lineTo(0,yNear);x.closePath();x.fill();
  x.beginPath();x.moveTo(W,yFar);x.lineTo(cx+farHalf,yFar);x.lineTo(cx+nearHalf,yNear);x.lineTo(W,yNear);x.closePath();x.fill();
  x.strokeStyle="rgba(91,140,255,.28)";x.lineWidth=2;
  for(const s of [-1,1]){x.beginPath();x.moveTo(cx+s*farHalf,yFar);x.lineTo(cx+s*nearHalf,yNear);x.stroke()}
  // gutters
  const gutterN=W*0.08,gutterF=W*0.022;
  x.fillStyle="#1A2148";
  x.beginPath();x.moveTo(cx-nearHalf,yNear);x.lineTo(cx-nearHalf-gutterN,yNear);x.lineTo(cx-farHalf-gutterF,yFar);x.lineTo(cx-farHalf,yFar);x.closePath();x.fill();
  x.beginPath();x.moveTo(cx+nearHalf,yNear);x.lineTo(cx+nearHalf+gutterN,yNear);x.lineTo(cx+farHalf+gutterF,yFar);x.lineTo(cx+farHalf,yFar);x.closePath();x.fill();
  x.strokeStyle="rgba(255,255,255,.2)";x.lineWidth=2;x.beginPath();x.moveTo(cx-farHalf,yFar);x.lineTo(cx-nearHalf,yNear);x.stroke();
  x.beginPath();x.moveTo(cx+farHalf,yFar);x.lineTo(cx+nearHalf,yNear);x.stroke();
  // lane
  const wood=x.createLinearGradient(0,yFar,0,yNear);wood.addColorStop(0,"#F2C987");wood.addColorStop(.45,"#E8B266");wood.addColorStop(1,"#C98B45");
  x.fillStyle=wood;x.beginPath();x.moveTo(cx-nearHalf,yNear);x.lineTo(cx-farHalf,yFar);x.lineTo(cx+farHalf,yFar);x.lineTo(cx+nearHalf,yNear);x.closePath();x.fill();
  // boards (converging lines)
  x.strokeStyle="rgba(120,70,30,.18)";x.lineWidth=1;
  for(let i=1;i<39;i++){const u=i/39-.5;x.beginPath();x.moveTo(cx+u*2*nearHalf,yNear);x.lineTo(cx+u*2*farHalf,yFar);x.stroke()}
  // polish shine
  const shine=x.createLinearGradient(0,yFar,0,yNear);shine.addColorStop(0,"rgba(255,255,255,0)");shine.addColorStop(.55,"rgba(255,255,255,.18)");shine.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=shine;x.fillRect(cx-farHalf,yFar,farHalf*2,yNear-yFar);
  // pin deck + spots
  x.fillStyle="rgba(90,45,20,.12)";x.fillRect(cx-farHalf*1.03,yAt(19.7)-(yNear-yFar)*.02,farHalf*2.06,(yNear-yFar)*.09);
  for(const [px,pz] of PINS){const X=sxAt(px,pz),Y=yAt(pz),r=Math.max(1.2,pinHAt(pz)*.045);x.fillStyle="rgba(40,24,10,.35)";x.beginPath();x.ellipse(X,Y,r*1.7,r*.45,0,0,Math.PI*2);x.fill()}
  // aiming arrows at 4.5 m
  for(let i=-3;i<=3;i++){const z=4.5,X=sxAt(i*.14,z),Y=yAt(z),s=Math.max(2,pinHAt(z)*.055);
    x.fillStyle="#8A4E1E";x.beginPath();x.moveTo(X,Y-s*1.5);x.lineTo(X-s,Y+s*.7);x.lineTo(X+s,Y+s*.7);x.closePath();x.fill()}
  // foul line + approach
  const fy=yAt(.02),fh=Math.max(3,H*.006);
  x.fillStyle="#FF3B3B";x.fillRect(cx-nearHalf,fy-fh/2,nearHalf*2,fh);
  x.fillStyle="rgba(255,255,255,.7)";x.fillRect(cx-nearHalf,fy-fh/2-2,nearHalf*2,2);
  const ap=x.createLinearGradient(0,yNear,0,H);ap.addColorStop(0,"#1A1F45");ap.addColorStop(1,"#0C102B");x.fillStyle=ap;x.fillRect(0,yNear,W,H-yNear);
  x.strokeStyle="rgba(255,255,255,.08)";x.lineWidth=1;
  for(let i=-6;i<=6;i++){x.beginPath();x.moveTo(cx+i*W*.09,yNear);x.lineTo(cx+i*W*.11,H);x.stroke()}
  // approach dots (a bowler's starting boards)
  for(let i=-2;i<=2;i++){x.fillStyle="rgba(255,198,26,.55)";x.beginPath();x.arc(cx+i*W*.07,H*.975,2.4,0,Math.PI*2);x.fill()}
  bg=c;
}
function render(now:number,dt:number){
  if(!bg)return;
  ctx.drawImage(bg,0,0,L.W,L.H);
  // pins during a throw = the recorded simulation; otherwise the current rack
  let frames:any[]|null=null,k=0;
  if(phase==="roll"&&sim&&sim.frames.length){
    const tt=(now-throwAt)/1000;
    const idx=clamp(tt*60,0,sim.frames.length-1);
    frames=sim.frames;k=idx;
  }
  const simPin=(i:number)=>{
    if(!frames)return null;
    const a=frames[Math.floor(k)],b=frames[Math.min(frames.length-1,Math.floor(k)+1)],f=k-Math.floor(k);
    const pa=a.p[i],pb=b.p[i];
    return {x:pa.x+(pb.x-pa.x)*f,z:pa.z+(pb.z-pa.z)*f,down:pa.down||pb.down,fall:pa.fall+(pb.fall-pa.fall)*f,dx:pa.dx||pb.dx,dz:pa.dz||pb.dz};
  };
  // pins: back rows first, then the front ones
  const ps:any[]=[];
  const started=frames?sim!.standing:null; // pins already down before this throw stay swept: only the current rack is drawn
  for(let i=0;i<PINS.length;i++){
    const sp=simPin(i);
    if(sp){if(!started||started[i])ps.push({i,...sp})}
    else if(series.rack[i])ps.push({i,x:PINS[i][0],z:PINS[i][1],down:false,fall:0,dx:1,dz:1});
  }
  ps.sort((a,b)=>b.z-a.z);
  for(const p of ps)drawPin(p.x,p.z,p.fall,p.dx,p.dz);
  // the ball
  if(frames){
    const a=frames[Math.floor(k)],b=frames[Math.min(frames.length-1,Math.floor(k)+1)],f=k-Math.floor(k);
    const bx=a.bx+(b.bx-a.bx)*f,bz=a.bz+(b.bz-a.bz)*f;
    if(bz<MAX_Z)drawBall(bx,bz,series.p);
  }else if(phase==="hand"||phase==="aim"){
    drawGhost(series.p,phase==="aim"?aim:0,phase==="aim",now);
  }
  drawParts(dt);
}
function drawPin(x:number,z:number,fall:number,dx:number,dz:number){
  const X=sxAt(x,z),Y=yAt(z),h=pinHAt(z),w=h*.36;
  ctx.save();ctx.translate(X,Y);
  ctx.fillStyle="rgba(20,10,0,.28)";ctx.beginPath();ctx.ellipse(0,1,w*.75,w*.18,0,0,Math.PI*2);ctx.fill();
  if(fall>0){ctx.rotate(fall*Math.PI*.48*clamp(dx,-1,1));ctx.scale(1,1-fall*.22)}
  ctx.beginPath();
  ctx.moveTo(-w*.46,0);
  ctx.bezierCurveTo(-w*.6,-h*.18,-w*.26,-h*.42,-w*.2,-h*.6);
  ctx.bezierCurveTo(-w*.16,-h*.76,-w*.3,-h*.9,0,-h);
  ctx.bezierCurveTo(w*.3,-h*.9,w*.16,-h*.76,w*.2,-h*.6);
  ctx.bezierCurveTo(w*.26,-h*.42,w*.6,-h*.18,w*.46,0);
  ctx.closePath();
  ctx.fillStyle="#FFFDF6";ctx.fill();
  ctx.save();ctx.clip();
  ctx.fillStyle="#FF3B3B";ctx.fillRect(-w*.3,-h*.72,w*.6,h*.075);
  ctx.fillStyle="rgba(20,24,58,.08)";ctx.fillRect(-w*.6,-h*.3,w*.25,h*.5);
  ctx.restore();
  ctx.lineWidth=Math.max(1.4,w*.09);ctx.strokeStyle="#14183A";ctx.stroke();
  ctx.beginPath();ctx.ellipse(-w*.08,-h*.84,w*.16,w*.08,-.5,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,.9)";ctx.fill();
  ctx.restore();
  void dz;
}
function drawBall(x:number,z:number,p:number){
  const X=sxAt(x,z),Y=yAt(z),r=ballRAt(z);
  ctx.save();
  ctx.fillStyle="rgba(20,10,0,.3)";ctx.beginPath();ctx.ellipse(X,Y+r*.4,r*1.5,r*.45,0,0,Math.PI*2);ctx.fill();
  const g=ctx.createRadialGradient(X-r*.35,Y-r*.4,r*.15,X,Y,r);
  g.addColorStop(0,"#FFFFFF");g.addColorStop(.18,TONE[p]);g.addColorStop(1,"#070A20");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(X,Y-r*.75,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#070920";ctx.lineWidth=Math.max(1,r*.12);ctx.stroke();
  if(r>10){ctx.fillStyle="#070A20";for(const a of [-.45,0,.45]){ctx.beginPath();ctx.arc(X+a*r*.38,Y-r*.98,r*.13,0,Math.PI*2);ctx.fill()}}
  ctx.restore();
}
// Perspective aiming: no lines and no crosshairs. A trail of translucent balls follows the predicted curve and a
// bigger ghost ball sits where the ball crosses the head pin (the hand's line). The near balls are large / faint,
// the far ones small / clearer, so the lane depth reads on its own.
function drawAimPath(gx:number,gy:number,gh:number,aimV:number,spinV:number,on:boolean){
  // the ghost bowler: a translucent body + the throwing arm reaching toward the aim
  const p=series.p,handX=gx+aimV*gh*.42,handY=gy-gh*.62;
  ctx.save();
  ctx.globalAlpha=on?.5:.34;
  ctx.fillStyle=TONE[p];ctx.strokeStyle=on?"rgba(255,255,255,.85)":"rgba(255,255,255,.5)";ctx.lineWidth=2;
  const hr=gh*.115,hy=gy-gh*.83;
  ctx.beginPath();ctx.arc(gx,hy,hr,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.roundRect(gx-gh*.12,hy+hr*.7,gh*.24,gh*.3,gh*.1);ctx.fill();ctx.stroke();
  // legs
  ctx.lineWidth=Math.max(3,gh*.035);ctx.strokeStyle=TONE[p];
  ctx.beginPath();ctx.moveTo(gx-gh*.07,hy+hr*.7+gh*.29);ctx.lineTo(gx-gh*.11,gy);ctx.moveTo(gx+gh*.07,hy+hr*.7+gh*.29);ctx.lineTo(gx+gh*.11,gy);ctx.stroke();
  // both arms (before the choice) / the chosen arm up (aiming)
  if(on){
    ctx.lineWidth=Math.max(4,gh*.045);ctx.strokeStyle="#fff";
    ctx.beginPath();ctx.moveTo(gx+(chosen?1:-1)*gh*.08,hy+hr*.9);ctx.lineTo(handX,handY);ctx.stroke();
    // the other arm hangs at the side
    ctx.lineWidth=Math.max(3,gh*.035);ctx.strokeStyle=TONE[p];
    ctx.beginPath();ctx.moveTo(gx+(chosen?-1:1)*gh*.08,hy+hr*.9);ctx.lineTo(gx+(chosen?-1:1)*gh*.16,hy+hr*.9+gh*.22);ctx.stroke();
    ctx.fillStyle=TONE[p];ctx.beginPath();ctx.arc(handX,handY,gh*.045,0,Math.PI*2);ctx.fill();
    // the ball in the hand (solid enough to see, still part of the hologram)
    drawGhostBall(handX,handY-gh*.02,gh*.055,TONE[p],.95,true);
  }else{
    ctx.lineWidth=Math.max(3,gh*.035);
    for(const s of [-1,1]){ctx.beginPath();ctx.moveTo(gx+s*gh*.08,hy+hr*.9);ctx.lineTo(gx+s*gh*.3,hy+hr*1.1);ctx.stroke()}
  }
  ctx.restore();
  if(!on)return;
  // the projected ball path as a trail of perspective spheres (no line)
  const inLane=Math.abs(ballX(PIN_Z,aimV,spinV))<LANE_W/2-BALL_R*.3;
  const tone=inLane?TONE[p]:"#FF3B3B";
  for(let i=1;i<=9;i++){
    const z=PIN_Z*i/9,X=sxAt(ballX(z,aimV,spinV),z),r=Math.max(2.2,ballRAt(z)*.56),Y=yAt(z)-r*.55;
    drawGhostBall(X,Y,r,tone,.10+.15*(i/9),false);
  }
  // the target: a bigger ghost ball at the head pin instead of a ring / crosshair
  const tx=ballX(PIN_Z,aimV,spinV),X=sxAt(tx,PIN_Z),Y=yAt(PIN_Z),r=Math.max(7,ballRAt(PIN_Z)*1.15);
  ctx.save();ctx.globalAlpha=.2;ctx.fillStyle="#070920";ctx.beginPath();ctx.ellipse(X,Y+r*.35,r*1.5,r*.36,0,0,Math.PI*2);ctx.fill();ctx.restore();
  drawGhostBall(X,Y-r*.55,r,tone,.62,true);
}
function drawGhostBall(X:number,Y:number,r:number,tone:string,alpha:number,glow:boolean){
  ctx.save();ctx.globalAlpha=alpha;
  if(glow){ctx.shadowColor=tone;ctx.shadowBlur=Math.max(8,r*2.2)}
  const g=ctx.createRadialGradient(X-r*.35,Y-r*.4,r*.08,X,Y,r);
  g.addColorStop(0,"#FFFFFF");g.addColorStop(.3,tone);g.addColorStop(1,"#070A20");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(X,Y,r,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.globalAlpha=alpha*.7;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(X-r*.32,Y-r*.38,Math.max(1,r*.16),0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawGhost(p:number,aimV:number,on:boolean,now:number){
  const gx=L.cx,gy=L.yNear-L.H*.20,gh=Math.min(L.H*.25,198);
  drawAimPath(gx,gy,gh,aimV,spin,on);
  void p;void now;
}
function burst(){
  if(reduced())return;
  for(let i=0;i<PN;i++){const o=i*6;part[o]=L.cx+(Math.random()-.5)*L.W*.5;part[o+1]=L.yFar+Math.random()*60;
    part[o+2]=(Math.random()-.5)*260;part[o+3]=-120-Math.random()*260;part[o+4]=0;part[o+5]=.8+Math.random()*.8}
  partN=PN;
}
function drawParts(dt:number){
  if(partN<=0)return;
  let alive=0;
  for(let i=0;i<PN;i++){const o=i*6;if(part[o+5]<=0)continue;alive++;
    part[o+4]+=dt;const a=part[o+4],life=part[o+5];if(a>life){part[o+5]=0;continue}
    part[o+3]+=520*dt;part[o]+=part[o+2]*dt;part[o+1]+=part[o+3]*dt;
    ctx.globalAlpha=1-a/life;ctx.fillStyle=PCOL[i%PCOL.length];ctx.fillRect(part[o],part[o+1],4,7);
  }
  ctx.globalAlpha=1;partN=alive;
}

// ---------- frame loop ----------
function frame(now:number){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
  const ps=sampleCamera(now);
  if(ps&&ps.length){
    lmKeep=ps[0].lm;
    S.st[0].ar=detCv.width/detCv.height||1;
    draw(ps[0].lm,0);
  }
  if(phase==="card")gateStep(now,lmKeep);
  else if(phase==="hand")handStep(now,lmKeep);
  else if(phase==="aim")aimStep(now,lmKeep);
  else if(phase==="roll"){
    if(!resultShown&&now>=resultAt)showThrowResult(now);
    if(now>=nextAt){nextTurn(now);if((phase as Phase)==="off")return}
  }
  if(phase!=="off"){render(now,dt);if(now-hudAt>80){hudAt=now;if(phase!=="roll"||!resultShown)updateHud()}}
}
function reset(){
  cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);
  callRoot.className="sp-call bw-call";turnRoot.hidden=true;handEl.classList.remove("on");aimEl.classList.remove("on");
  setScreenMode(null);sim=null;scripted=false;forceHand=null;lmKeep=null;lastPlayer=-1;firstTurn=true;
  pickProg=[0,0];lastPickAt=0;SW=swingState();aimLocked=false;handEl.dataset.mode="";
  part.fill(0);partN=0;bg=null;totalCache.clear();lastFrameText=lastLeftText=lastAimText="";
  runRoot.classList.add("hide");endRoot.classList.add("hide");document.body.classList.remove("sprinting","bowling");
}
export const BOWLING:GameMode={
  start:begin,
  tv:true,
  reset,
  shown:()=>!endRoot.classList.contains("hide")||(phase==="card"&&!runRoot.classList.contains("hide")),
};
