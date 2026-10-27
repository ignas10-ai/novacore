// Slidinėjimas (issue #23, idea #4; two-player race #30): one phone. 1 and 3-4 players take turns downhill; 2
// players race at the same time with two MediaPipe poses, a split screen and their own skier/controls. Lean
// left/right to steer, pull arms down like ski poles to speed up, lean back to brake. Pass the slalom gates; hit
// a flag and you stop dead, go outside the boundary and every second is added to your time. Fastest final time wins.
// Flow: Pradžia tile -> #/slidinejimas (setup + names) -> startFlow(SKI) -> #loading + #ready arms-up gate ->
// SKI.start(): turn card (1/3-4) or straight to the shared countdown (2) -> "Pasiruošk… 3 2 1 Čiuožiam!" ->
// #skRun (turn / split) -> #skEnd. Rules, course and physics are PURE in logic.ts (test/unit/ski.test.ts), the
// downhill canvas is slope.ts.
import "./ski.css";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {armsUp} from "../detect/step.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import {sfx} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import type {Game} from "../history/stats.ts";
import {$} from "../ui/dom.ts";
import {t as tr,tn,dec} from "../i18n/i18n.ts";
import {mascot,avatar,type Who} from "../ui/mascots.ts";
import {cachedNick} from "../online/api.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import type {ScreenState} from "../cast/room.ts";
import {COURSE_M,LIMIT_S,MISS_PENALTY,PUSH_V,newCourse,newSkier,newPoleState,readControl,tick,rank,penalty,centerAt,total,turnOf,splitPoses,
  type Course,type Skier,type GateRes,type SkiInput,type PoleState} from "./logic.ts";
import {layout,buildSlope,drawSlope,type Layout,type Motion} from "./slope.ts";
import {LOOKS} from "../sprint/runner.ts";

const WHO:Who[]=["r","b","y","g"];
const TONE=["#FF3B3B","#2F6BFF","#FFC61A","#16B67A"], TONE_INK=["var(--red-ink)","var(--blue-ink)","var(--yellow-ink)","var(--green-ink)"];
const DEF=[tr("p.red"),tr("p.blue"),tr("p.yellow"),tr("p.green")];
const NAME_MAX=14;
const face=(i:number,cls="",mood?:"happy"|"sad")=>`<span class="${cls}" style="--tone:${TONE[i]}">${avatar(WHO[i],mood)}</span>`;
const kmh=(v:number)=>Math.round(v*3.6);
const store={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};

// ---------- markup (built here; index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile sk-tile tap";tile.href="#/slidinejimas";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("sk.title")}</b><small>${tr("sk.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true">${mascot("r","ski",{anim:true})}${mascot("b","ski",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".bw-tile")??document.querySelector(".hd-tile")??document.querySelector(".lj-tile")??document.querySelector(".sp-tile")??document.getElementById("rankCard"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="ski" aria-labelledby="skTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="skTitle" tabindex="-1">${tr("sk.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    <div class="sk-hero" aria-hidden="true">
      <span class="sk-hero-big">${tr("sk.heroBig")}</span><span class="sk-hero-sub">${tr("sk.hero")}</span>
      <span class="sk-hero-slope"></span>
      <span class="sk-hero-g" style="left:16%;top:66%"></span><span class="sk-hero-g" style="left:74%;top:58%"></span><span class="sk-hero-g" style="left:44%;top:74%"></span>
      <span class="sk-hero-m">${mascot("r","ski",{anim:true})}</span><span class="sk-hero-m2">${mascot("b","ski",{anim:true})}</span>
    </div>
    <section class="pick" aria-label="${tr("sk.players")}">
      <div class="seg sp-seg sk-seg" role="group" aria-label="${tr("sk.players")}">
        ${[1,2,3,4].map(k=>`<button data-sk="${k}" aria-pressed="false"><span><b class="d">${k}</b><small>${k===1?tr("mode.solo"):k===2?tr("mode.duel"):tn("sk.pl",k)}</small></span></button>`).join("")}
      </div>
      <p class="help sk-party">${tr("sk.party")}</p>
    </section>
    <section class="box sk-names" aria-labelledby="skNamesT">
      <h2 class="card-title" id="skNamesT">${tr("sk.names")}</h2>
      <ol id="skNames">${[0,1,2,3].map(i=>`<li class="sk-nrow" data-i="${i}">${face(i,"sk-nface")}<input class="sk-name" id="skN${i+1}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false" aria-label="${tr("sk.nameOf",{n:i+1})}"></li>`).join("")}</ol>
    </section>
    <div class="box sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("sk.pb")}</small><b class="d" id="skPb">–</b><p class="help" id="skPbTxt"></p></div></div>
    <section class="box sk-guide" aria-labelledby="skGuideT">
      <h2 class="card-title" id="skGuideT">${tr("sk.guide")}</h2>
      <ul>
        <li><span data-icon="chevron-left"></span><b>${tr("sk.lean")}</b></li>
        <li><span data-icon="arrow-down"></span><b>${tr("sk.push")}</b></li>
        <li><span data-icon="arrow-up"></span><b>${tr("sk.brake")}</b></li>
        <li><span data-icon="target"></span><b>${tr("sk.gatesGuide")}</b></li>
      </ul>
    </section>
    <section class="box sp-how" aria-labelledby="skHowT">
      <h2 class="card-title" id="skHowT">${tr("sk.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("sk.how1")}</span></li>
        <li><span data-icon="chevron-right"></span><span>${tr("sk.how2")}</span></li>
        <li><span data-icon="zap"></span><span>${tr("sk.how3")}</span></li>
      </ol>
      <p class="help sk-rules">${tr("sk.rules")}</p>
    </section>
    <div class="cta">
      <button class="go tap" id="skGo" type="button"><span>${tr("sk.toSlope")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
document.body.insertAdjacentHTML("beforeend",`
<div class="screen sp-run sk-run hide" id="skRun">
  <canvas id="skCv" role="img" aria-label="${tr("sk.course")}"></canvas>
  <div class="sp-hud">
    <div class="sp-top sk-top">
      <div class="sp-card sk-me" id="skMe"><span class="sp-face" id="skMeFace"></span><div class="sp-card-in"><span class="sk-me-top"><b class="sk-me-n" id="skMeN"></b><span class="sk-kmh" aria-label="${tr("sk.speed")}"><b class="d" id="skKmh">0</b><small>km/h</small></span></span><small class="sk-me-a" id="skMeA"></small><span class="sp-bar"><i id="skV"></i></span></div><span class="sk-boost" id="skBoost" aria-hidden="true">${tr("sk.boost")}</span></div>
      <div class="sp-clock sk-clock"><span class="d" id="skT">0,00</span><small class="sk-pen" id="skPen"></small></div>
      <div class="sp-card p2 sk-me sk-me2" id="skMe2" hidden><span class="sp-face" id="skMe2Face"></span><div class="sp-card-in"><span class="sk-me-top"><b class="sk-me-n" id="skMe2N"></b><span class="sk-kmh" aria-label="${tr("sk.speed")}"><b class="d" id="skKmh2">0</b><small>km/h</small></span></span><small class="sk-me-a" id="skMe2A"></small><span class="sp-bar"><i id="skV2"></i></span></div><span class="sk-boost" id="skBoost2" aria-hidden="true">${tr("sk.boost")}</span></div>
      <div class="sp-card p2 sk-best" id="skBestC"><span class="sp-face sk-tro" data-icon="trophy"></span><div class="sp-card-in"><b class="d" id="skPbL">–</b><small>${tr("sk.pbL")}</small></div></div>
    </div>
    <div class="sp-map sk-map" aria-hidden="true">
      <span class="sk-ticks" id="skTicks"></span>
      <span class="sp-dotw" id="skDot"><b class="sp-dot" id="skDotB"></b></span>
      <span class="sp-dotw sk-dotw2" id="skDot2" hidden><b class="sp-dot" id="skDotB2"></b></span>
      <span class="sp-flag sk-fin"></span>
    </div>
    <div class="sk-live"><b class="d" id="skGateN">0/0</b><small>${tr("sk.gatesShort")}</small></div>
  </div>
  <div class="sk-legend" id="skLegend">
    <span><i data-icon="chevron-left"></i>${tr("sk.leanShort")}</span><span><i data-icon="arrow-down"></i>${tr("sk.pushShort")}</span><span><i data-icon="arrow-up"></i>${tr("sk.brakeShort")}</span>
  </div>
  <div class="sp-call sk-call" id="skCall" aria-live="assertive"><b class="d" id="skCallT"></b><small id="skCallS"></small></div>
  <div class="sk-turn" id="skTurn" hidden>
    <div class="sk-turn-card" role="dialog" aria-labelledby="skTurnN">
      <span class="sk-turn-art" id="skTurnArt" aria-hidden="true"></span>
      <span class="eyebrow">${tr("sk.now")}</span>
      <b class="d sk-turn-n" id="skTurnN"></b>
      <span class="sk-turn-a" id="skTurnA"></span>
      <div class="sk-gate" id="skGate"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="sk-ring" id="skRing" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span id="skGateT">${tr("sk.armsUp")}</span></div>
      <ol class="sk-mini" id="skMini" aria-label="${tr("sk.standings")}"></ol>
      <p class="sk-controls"><span data-icon="chevron-left"></span>${tr("sk.lean")}<span data-icon="arrow-down"></span>${tr("sk.push")}<span data-icon="arrow-up"></span>${tr("sk.brake")}</p>
    </div>
  </div>
</div>
<section class="screen hide" id="skEnd" aria-labelledby="skWin">
  <div class="wrap">
    <header class="sp-res-head sk-res-head" id="skResHead">
      <span class="sp-res-art" id="skResArt" aria-hidden="true"></span>
      <span class="wl">${tr("sk.title")}</span>
      <h2 class="d" id="skWin"></h2>
      <p id="skSub"></p>
      <span class="rec-badge" id="skRec" hidden>${tr("sk.newPb")}</span>
    </header>
    <ol class="sp-rows sk-rows" id="skRows" aria-label="${tr("sk.results")}"></ol>
    <div class="cta">
      <button class="go" id="skAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("sk.again")}</button>
      <button class="go alt" id="skHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#skRun"), endRoot=$("#skEnd"), cvs=$<HTMLCanvasElement>("#skCv"), ctx=cvs.getContext("2d",{alpha:false})!;
const callRoot=$("#skCall"), callT=$("#skCallT"), callS=$("#skCallS"), turnRoot=$("#skTurn"), gateRoot=$("#skGate"), ring=$("#skRing"), gateT=$("#skGateT");
const clockEl=$("#skT"), penEl=$("#skPen"), gateN=$("#skGateN"), legend=$("#skLegend");
const kmhEls=[$("#skKmh"),$("#skKmh2")], vEls=[$("#skV"),$("#skV2")], dotEls=[$("#skDot"),$("#skDot2")], aEls=[$("#skMeA"),$("#skMe2A")];
const boostEls=[$("#skBoost"),$("#skBoost2")];

// ---------- history: rows with mode "ski", times = final time per player (incl. penalties, null = DNF) ----------
const bestEver=(h:Game[])=>h.reduce((m,g)=>g.mode==="ski"?Math.min(m,...(g.times||[]).map(t=>t??Infinity)):m,Infinity);

// ---------- setup: 1-4 players + names (local only, like Šuolis į tolį) ----------
let playerCount=2;
const names=["","","",""];
{const k=Number(store.get("novacore.skN"));if(k>=1&&k<=4)playerCount=k;
 try{const a=JSON.parse(store.get("novacore.skNames")||"[]");if(Array.isArray(a))a.slice(0,4).forEach((v,i)=>{if(typeof v==="string")names[i]=v.slice(0,NAME_MAX)})}catch(e){}}
const nameAt=(i:number)=>i===0?(names[0].trim()||cachedNick()||DEF[0]):(names[i].trim()||DEF[i]);
const segBtns=[...document.querySelectorAll<HTMLElement>("[data-sk]")], inputs=[0,1,2,3].map(i=>$<HTMLInputElement>(`#skN${i+1}`));
function syncSetup(){
  segBtns.forEach(b=>{const on=Number(b.dataset.sk)===playerCount;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  document.querySelectorAll<HTMLElement>(".sk-nrow").forEach(r=>r.hidden=Number(r.dataset.i)>=playerCount);
  if(!names[0]&&cachedNick())inputs[0].placeholder=cachedNick()!;
  inputs.forEach((el,i)=>{el.placeholder=i===0&&cachedNick()?cachedNick()!:DEF[i];if(document.activeElement!==el)el.value=names[i]});
}
function renderPb(){
  const b=bestEver(loadHist());
  $("#skPb").textContent=Number.isFinite(b)?`${dec(b,2)} s`:"–";
  $("#skPbTxt").textContent=tr(Number.isFinite(b)?"sk.pbTxt":"sk.pbNone");
}
segBtns.forEach(b=>b.onclick=()=>{playerCount=Number(b.dataset.sk);store.set("novacore.skN",String(playerCount));syncSetup()});
inputs.forEach((el,i)=>{
  el.oninput=()=>{names[i]=el.value.slice(0,NAME_MAX);store.set("novacore.skNames",JSON.stringify(names))};
  el.onkeydown=e=>{if(e.key==="Enter")el.blur()};
});
onView("ski",()=>{syncSetup();renderPb()});
// 2 players race together (both poses in front of the camera); 1 and 3-4 keep one skier in front of the camera at a time
function go(){
  const p=playerCount===2?2:1;
  document.querySelector<HTMLElement>(`[data-p="${p}"]`)?.click();
  S.players=p;
  startFlow(SKI);
}
$("#skGo").onclick=go;

// ---------- session state ----------
type Phase="off"|"card"|"count"|"run"|"over";
const RACE_WAIT=30; // seconds after the first finish before the other skier is marked DNF
const freshInput=():SkiInput=>({steer:0,brake:0,push:false,power:1});
let phase:Phase="off", phaseAt=0, beat=-1, k=0, holdAt=0, holdOk=0, raf=0, last=0, hudAt=0, callTimer=0, legendTimer=0;
let n=1, names0:string[]=[], course:Course|null=null, pb=Infinity, startedAt=0;
let race=false, firstFinAt=0;
// race = two skiers at once (index 0 = left/P1, 1 = right/P2); solo/turn-based use only index 0
let skiers:(Skier|null)[]=[null,null], poles:PoleState[]=[newPoleState(),newPoleState()], skiInputs:SkiInput[]=[freshInput(),freshInput()];
let lastLms:(any[]|null)[]=[null,null], lastCtrlAts=[0,0], camXs=[0,0], leans=[0,0], brakes=[0,0], pushAts=[-1e9,-1e9], pushHands:(-1|0|1)[]=[-1,-1], pushShowns=[0,0];
let autoAts=[0,0], boostTimers=[0,0];
let times:(number|null)[]=[], raws:(number|null)[]=[], pens:number[]=[], cleans:number[]=[], misses:number[]=[], hits:number[]=[], gateRes:(GateRes|null)[][]=[], storedP:boolean[]=[], dnfP:boolean[]=[];
let scripted=false, scriptSteer=0, auto=false;
let lmKeep:any[]|null=null, L:Layout, half:Layout, shown:Record<string,string>={};

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call sk-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function flashBoost(p=0){
  const el=boostEls[p];if(!el)return;
  clearTimeout(boostTimers[p]);
  el.classList.add("on");
  boostTimers[p]=window.setTimeout(()=>el.classList.remove("on"),420);
}
function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  L=layout(W,H,dpr);
  half=layout(W/2,H,dpr); // split-screen halves (both the same size, so slope.ts caches one background)
  buildSlope(race?half:L);
  if(cv.width)document.body.style.setProperty("--sp-cam-ar",String(cv.width/cv.height));
}
addEventListener("resize",()=>{if(phase!=="off")resize()});

function begin(){
  n=total(playerCount);race=n===2;names0=Array.from({length:n},(_,i)=>nameAt(i));
  course=newCourse((Math.random()*0xffffffff)>>>0);pb=bestEver(loadHist());
  times=Array(n).fill(null);raws=Array(n).fill(null);pens=Array(n).fill(0);cleans=Array(n).fill(0);misses=Array(n).fill(0);hits=Array(n).fill(0);
  gateRes=Array.from({length:n},()=>course!.gates.map(()=>null));storedP=Array(n).fill(false);dnfP=Array(n).fill(false);
  k=0;firstFinAt=0;scripted=false;auto=false;scriptSteer=0;shown={};
  skiers=[null,null];poles=[newPoleState(),newPoleState()];skiInputs=[freshInput(),freshInput()];
  lastLms=[null,null];lastCtrlAts=[0,0];camXs=[0,0];leans=[0,0];brakes=[0,0];pushAts=[-1e9,-1e9];pushHands=[-1,-1];pushShowns=[0,0];autoAts=[0,0];
  runRoot.classList.remove("hide");endRoot.classList.add("hide");
  runRoot.classList.toggle("race",race);
  $("#skMe2").hidden=!race;$("#skBestC").hidden=race;$("#skDot2").hidden=!race;
  boostEls.forEach(el=>el.classList.remove("on"));boostTimers.forEach(t=>clearTimeout(t));
  document.body.classList.add("sprinting","skiing"); // .sprinting = the corner camera preview (sprint.css)
  document.body.classList.toggle("sk-race",race);
  $("#skPbL").textContent=Number.isFinite(pb)?`${dec(pb,2)} s`:"–";
  $("#skTicks").replaceChildren(...course.gates.map(g=>Object.assign(document.createElement("i"),{style:`left:${(g.z/COURSE_M*100).toFixed(2)}%`})));
  resize();
  document.fonts?.load("400 40px \"Titan One\"",`${tr("sk.board")} ${tr("sk.finishBanner")} 0123456789`).then(()=>{if(phase!=="off")buildSlope(race?half:L)}).catch(()=>{});
  startedAt=performance.now();
  setScreenMode(tvState);
  screenPhase("play");
  last=performance.now();
  callRoot.className="sp-call sk-call";
  if(race){
    // both skiers stand at the start while the countdown runs; no turn card
    skiers[0]=newSkier(course);skiers[1]=newSkier(course);
    camXs=[skiers[0].x,skiers[1].x];
    hudMe();
    count(last);
  }else card(last);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}

// ---------- turn card + gate ----------
function card(now:number){
  phase="card";phaseAt=now;holdAt=0;holdOk=0;S.running=false; // back between turns = leave the series
  skiers[0]=newSkier(course!);skiers[1]=null;poles[0]=newPoleState();skiInputs[0]=freshInput();
  lastLms[0]=null;lastCtrlAts[0]=0;lmKeep=null;camXs[0]=skiers[0].x;leans[0]=0;brakes[0]=0;pushAts[0]=-1e9;pushHands[0]=-1;
  const {player:p}=turnOf(k,n);
  callRoot.className="sp-call sk-call";legend.classList.remove("on");
  $("#skTurnArt").innerHTML=mascot(WHO[p],"ski",{anim:true});
  const nm=$("#skTurnN");nm.textContent=names0[p];nm.style.setProperty("--tone",TONE[p]);
  $("#skTurnA").textContent=tr("sk.run",{n:k+1,total:n});
  gateRoot.hidden=k===0; // the very first run just passed game.ts's arms-up gate
  ring.style.strokeDashoffset="100";gateT.textContent=tr("sk.armsUp");
  const mini=$("#skMini");mini.hidden=n<2;mini.classList.toggle("many",n>2);
  mini.replaceChildren(...rank(times).map(r=>{const li=document.createElement("li");li.className=r.i===p?"now":"";
    li.innerHTML=`${face(r.i,"sk-mface")}<span class="sk-mname"></span><b class="d"></b>`;
    li.querySelector(".sk-mname")!.textContent=names0[r.i];
    li.querySelector("b")!.textContent=r.time!=null?`${dec(r.time,2)} s`:"–";return li}));
  turnRoot.hidden=false;turnRoot.classList.remove("out");void turnRoot.offsetWidth;turnRoot.classList.add("in");
  hudMe();
  sfx.round();
}
function paintCard(p:number,cardEl:HTMLElement,faceEl:HTMLElement,nameEl:HTMLElement){
  faceEl.innerHTML=avatar(WHO[p]);cardEl.style.setProperty("--tone",TONE[p]);
  nameEl.textContent=names0[p];
}
function hudMe(){
  if(race){
    paintCard(0,$("#skMe"),$("#skMeFace"),$("#skMeN"));
    paintCard(1,$("#skMe2"),$("#skMe2Face"),$("#skMe2N"));
    $("#skDotB").style.background=TONE[0];$("#skDotB2").style.background=TONE[1];
    return;
  }
  const {player:p}=turnOf(k,n);
  paintCard(p,$("#skMe"),$("#skMeFace"),$("#skMeN"));
  $("#skDotB").style.background=TONE[p];
}
function gate(now:number,lm:any[]|null){
  if(k===0){if(now-phaseAt>1700)count(now);return}
  const up=!!lm&&armsUp(lm);
  if(up){holdOk=now;if(!holdAt)holdAt=now}else if(holdAt&&now-holdOk>300)holdAt=0;
  const pct=holdAt?Math.min(1,(now-holdAt)/1100):0;
  ring.style.strokeDashoffset=String(100-pct*100);
  const msg=lm?tr(up?"sk.hold":"sk.armsUp"):tr("sk.stepIn");
  if(gateT.textContent!==msg)gateT.textContent=msg;
  gateRoot.classList.toggle("ok",up);
  if(pct>=1)count(now);
}
function count(now:number){
  phase="count";phaseAt=now;beat=-1;S.running=true; // game.ts swallows Android back while running
  turnRoot.classList.remove("in");turnRoot.classList.add("out");setTimeout(()=>{if(phase!=="card")turnRoot.hidden=true},260);
  call(tr("sk.ready"),tr(race?"sk.raceReadySub":"sk.readySub"));sfx.tick();
}
function startRun(now:number){
  phase="run";phaseAt=now;
  if(race){
    skiers=[newSkier(course!),newSkier(course!)];
    for(let p=0;p<2;p++){
      poles[p]=newPoleState();skiInputs[p]=freshInput();lastLms[p]=null;lastCtrlAts[p]=now;camXs[p]=skiers[p]!.x;leans[p]=0;brakes[p]=0;pushAts[p]=-1e9;pushHands[p]=-1;autoAts[p]=now+700;
      boostEls[p].classList.remove("on");clearTimeout(boostTimers[p]);
    }
  }else{
    skiers[0]=newSkier(course!);skiers[1]=null;skiInputs[0]=freshInput();poles[0]=newPoleState();
    lastLms[0]=null;lastCtrlAts[0]=now;camXs[0]=skiers[0].x;leans[0]=0;brakes[0]=0;pushAts[0]=-1e9;pushHands[0]=-1;autoAts[0]=now+700;
    boostEls[0].classList.remove("on");clearTimeout(boostTimers[0]);
  }
  call(tr("sk.go"),race?tr("sk.raceGoSub"):"", "is-go",900);sfx.whistle();
  legend.classList.add("on");clearTimeout(legendTimer);legendTimer=setTimeout(()=>legend.classList.remove("on"),9000);
}

// ---------- frame ----------
function frame(now:number){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
  const ps=sampleCamera(now);
  const assigned:(any[]|null)[]=[null,null];
  if(ps&&ps.length){
    const split=race?splitPoses(ps):[ps[0],null];
    split.forEach((p,i)=>{if(p){assigned[i]=p.lm;draw(p.lm,i)}});
    lmKeep=ps[0].lm;
  }
  if(phase==="run"&&skiers[0]){
    for(const p of (race?[0,1]:[0])){
      const s=skiers[p];if(!s)continue;
      if(scripted){
        skiInputs[p].steer=scriptSteer;leans[p]=scriptSteer;
        if(auto){
          const g=s.gate<course!.gates.length?course!.gates[s.gate]:null;
          const target=g?g.x:centerAt(course!,COURSE_M);
          skiInputs[p].steer=Math.max(-1,Math.min(1,(target-s.x)/3.5));leans[p]=skiInputs[p].steer;
          if(now>=autoAts[p]){skiInputs[p].push=true;skiInputs[p].power=1;pushAts[p]=now;pushHands[p]=-1;autoAts[p]=now+640}
        }
      }else if(assigned[p]&&assigned[p]!==lastLms[p]){
        lastLms[p]=assigned[p];
        const c=readControl(assigned[p],detCv.width/detCv.height||1,poles[p],now);
        lastCtrlAts[p]=now;
        skiInputs[p].steer=c.steer;skiInputs[p].brake=c.brake;skiInputs[p].push=c.push;skiInputs[p].power=c.power;
        leans[p]=c.steer;brakes[p]=c.brake;
        if(c.push){pushAts[p]=now;pushHands[p]=c.hand;sfx.push();flashBoost(p)}
      }
      if(!scripted&&now-lastCtrlAts[p]>650){skiInputs[p].steer=0;skiInputs[p].brake=0;leans[p]=0;brakes[p]=0}
      const ev=tick(s,course!,dt,skiInputs[p]);
      skiInputs[p].push=false;skiInputs[p].power=1;
      camXs[p]+=(s.x-camXs[p])*(1-Math.exp(-dt/.22));
      for(const e of ev)onEvent(e,now,p);
    }
    if(race)checkRaceOver(now);
  }else if(phase==="card")gate(now,lmKeep);
  else if(phase==="count"){
    const tp=(now-phaseAt)/1000;
    const b=tp<.9?-1:Math.floor((tp-.9)/.6);
    if(b!==beat&&b>=0){beat=b;
      if(b<3){call(String(3-b),"","is-num");sfx.tick()}
      else startRun(now);
    }
  }
  if(phase==="over"&&now-phaseAt>2800){
    if(race)finishRace();
    else{k++;if(k>=n)finishRace();else card(now)}
  }
  render(now,dt);
  if(now-hudAt>80){hudAt=now;hud()}
}
function onEvent(e:{type:string;gate?:number},now:number,p=0){
  const who=race?`${names0[p]} · `:"";
  if(e.type==="clean"){sfx.tick();call(tr("sk.gate"),`${who}${e.gate!+1}/${course!.gates.length}`,`is-gate${race?` p${p+1}`:""}`,650)}
  else if(e.type==="miss"){sfx.miss();call(tr("sk.miss"),`${who}${tr("sk.missSub",{n:MISS_PENALTY})}`,"is-bad",1100)}
  else if(e.type==="hit"){sfx.horn();call(tr("sk.hit"),`${who}${tr("sk.hitSub")}`,"is-bad",1300)}
  else if(e.type==="finish"){
    if(race){
      const s=skiers[p]!;storeRun(p,p);firstFinAt=firstFinAt||now;
      call(tr("sk.finish"),`${names0[p]} · ${tr("sk.finishSub",{t:dec(s.fin!,2)})}`,"is-fin",2200);sfx.finish();
      checkRaceOver(now);
    }else{
      storeRun(0,k);phase="over";phaseAt=now;S.running=true;
      const s=skiers[0]!;call(tr("sk.finish"),tr("sk.finishSub",{t:dec(s.fin!,2)}),"is-fin",2200);sfx.finish();
    }
  }else if(e.type==="dnf"){
    if(race){
      const s=skiers[p]!;dnfP[p]=true;storeRun(p,p);firstFinAt=firstFinAt||now;
      call(tr("sk.dnf"),`${names0[p]} · ${tr("sk.dnfSub",{n:LIMIT_S})}`,"is-bad",2200);sfx.horn();
      checkRaceOver(now);
    }else{
      storeRun(0,k);phase="over";phaseAt=now;S.running=true;
      call(tr("sk.dnf"),tr("sk.dnfSub",{n:LIMIT_S}),"is-bad",2200);sfx.horn();
    }
  }
}
function checkRaceOver(now:number){
  if(!race||phase!=="run")return;
  const done=(p:number)=>times[p]!=null||dnfP[p];
  if(firstFinAt&&now-firstFinAt>RACE_WAIT*1000){
    for(let p=0;p<2;p++)if(!done(p)){
      const s=skiers[p];if(!s)continue;
      s.dnf=true;dnfP[p]=true;storeRun(p,p);
    }
    phase="over";phaseAt=now;S.running=true;
    call(tr("sk.raceOver"),tr("sk.raceOverSub",{n:RACE_WAIT}),"is-bad",2200);sfx.horn();
    return;
  }
  if(done(0)&&done(1)){phase="over";phaseAt=now;S.running=true}
}
function storeRun(p:number,slot=p){
  const s=skiers[p];if(!s||storedP[slot])return;
  storedP[slot]=true;
  times[slot]=s.fin;raws[slot]=s.raw;pens[slot]=penalty(s);
  cleans[slot]=s.clean;misses[slot]=s.miss;hits[slot]=s.hit;
  gateRes[slot]=s.res.slice();
}

// ---------- drawing ----------
function motionAt(p:number,now:number):Motion{
  const s=skiers[p]!;
  const age=(now-pushAts[p])/1000;
  pushShowns[p]=age>=0&&age<.35?1-age/.35:0;
  const m:Motion={lean:leans[p],brake:brakes[p],push:pushShowns[p],pushSide:pushHands[p],crash:s.crash>0};
  if(phase==="card"||phase==="count"){
    // a calm preview at the start hut before the run
    m.lean=Math.sin(now/700)*.15+(p?-.12:.12);m.push=0;m.brake=0;m.crash=false;m.pushSide=-1;
  }
  return m;
}
function render(now:number,dt:number){
  if(!course||!skiers[0])return;
  if(race&&skiers[1]&&half){
    const W=innerWidth; // CSS px, same as the canvas after ctx.setTransform(dpr)
    const hw=W/2;
    ctx.save();ctx.beginPath();ctx.rect(0,0,hw,innerHeight);ctx.clip();
    drawSlope(ctx,half,course,skiers[0],camXs[0],now/1000,LOOKS[0],motionAt(0,now));
    ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(hw,0,hw,innerHeight);ctx.clip();ctx.translate(hw,0);
    drawSlope(ctx,half,course,skiers[1],camXs[1],now/1000,LOOKS[1],motionAt(1,now));
    ctx.restore();
    // a hard sticker divider between the two runs (same ink as the rest of the UI)
    ctx.fillStyle="rgba(255,255,255,.92)";ctx.fillRect(hw-3.5,0,7,innerHeight);
    ctx.fillStyle="#FF3B3B";ctx.fillRect(hw-5,0,2,innerHeight);
    ctx.fillStyle="#2F6BFF";ctx.fillRect(hw+3,0,2,innerHeight);
    ctx.fillStyle="#14183A";ctx.fillRect(hw-1,0,2,innerHeight);
    return;
  }
  const p=turnOf(k,n).player;
  drawSlope(ctx,L,course,skiers[0],camXs[0],now/1000,LOOKS[p],motionAt(0,now));
  void dt;
}

// HUD: text only when it changes
const setT=(el:HTMLElement|null,key:string,v:string)=>{if(shown[key]!==v){shown[key]=v;if(el)el.textContent=v}};
function hud(){
  const racing=phase==="run"||phase==="over";
  if(race){
    const t=racing?Math.max(skiers[0]?.t??0,skiers[1]?.t??0):0;
    setT(clockEl,"t",dec(t,2));
    const d=Math.abs((skiers[0]?.z??0)-(skiers[1]?.z??0));
    const gap=racing&&d>=1?tr("sk.gap",{p:(skiers[0]?.z??0)>=(skiers[1]?.z??0)?1:2,n:Math.min(99,Math.round(d))}):"";
    setT(penEl,"pen",gap);penEl.hidden=!gap;
    for(let p=0;p<2;p++){
      const s=skiers[p],fin=s?.fin??null;
      setT(kmhEls[p],"s"+p,String(kmh(racing&&s&&fin==null&&!s.dnf?s.v:0)));
      const pen=racing&&s?penalty(s):0;
      const a=!s?"":fin!=null?`${tr("sk.finish")} ${dec(fin,2)} s`:s.dnf?tr("sk.dnf"):`${s.clean}/${course!.gates.length}${pen>0?` · +${dec(pen,0)} s`:""}`;
      setT(aEls[p],"a"+p,a);
      const v=Math.min(1,(racing&&s&&fin==null&&!s.dnf?s.v:0)/26);
      vEls[p].style.transform=`scaleX(${v.toFixed(3)})`;
      dotEls[p].style.transform=`translateX(${Math.min(100,Math.max(0,(s?s.z:0)/COURSE_M*100)).toFixed(1)}%)`;
    }
    return;
  }
  const s=skiers[0];
  const t=racing&&s?s.t:0;
  setT(clockEl,"t",dec(t,2));
  const pen=racing&&s?penalty(s):0;
  const pt=pen>0?tr("sk.pen",{t:dec(pen,1)}):"";
  setT(penEl,"pen",pt);penEl.hidden=!pt;
  setT(kmhEls[0],"s0",String(kmh(racing&&s?s.v:0)));
  setT(aEls[0],"a0",s?tr("sk.gateOf",{n:s.clean,total:course!.gates.length}):"");
  setT(gateN,"d",course?`${s?s.clean:0}/${course.gates.length}`:"0/0");
  vEls[0].style.transform=`scaleX(${Math.min(1,(racing&&s?s.v:0)/26).toFixed(3)})`;
  dotEls[0].style.transform=`translateX(${Math.min(100,Math.max(0,(s?s.z:0)/COURSE_M*100)).toFixed(1)}%)`;
}

// ---------- TV board ----------
function tvState():Partial<ScreenState>{
  const done=phase==="off"&&!endRoot.classList.contains("hide");
  const on=phase==="run"||phase==="over"||phase==="count";
  const z=[0,1].map(p=>skiers[p]?Math.min(COURSE_M,Math.round(skiers[p]!.z)):0);
  const ts=(i:number)=>times[i]!=null?Math.round(times[i]!*100):0;
  const bestI=rank(times)[0]?.i??0;
  const slots=(p:number)=>{
    if(done)return n===2?ts(p):p===0?ts(bestI):0;
    if(n===2)return on?z[p]:ts(p);
    return p===0?(skiers[0]?z[0]:0):0;
  };
  const w:0|1|2=done&&n===2?(()=>{const r=rank(times);return r[0]?.place===1&&r[1]?.place!==1?(r[0].i+1) as 1|2:0})():0;
  const maxT=Math.max(skiers[0]?.t??0,skiers[1]?.t??0);
  const name=done?`${tr("sk.title")} · ${tr("sk.tvTime")}`:
    n===2?`${names0[0]} ${z[0]} m · ${names0[1]} ${z[1]} m`:
    `${names0[k]} · ${z[0]} m · ${skiers[0]?.gate??0}/${course?.gates.length??0}`;
  return {players:n===2?2:1,duration:LIMIT_S,left:done?0:on?Math.max(0,LIMIT_S-maxT):LIMIT_S,round:0,mult:1,
    ex:{id:"ski",name:name.slice(0,40)},score:[slots(0),slots(1)],reps:cleans.reduce((a,b)=>a+b,0),winner:w};
}

// ---------- results ----------
function finishRace(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  turnRoot.hidden=true;
  const h=loadHist();
  h.unshift({t:Date.now(),players:n,duration:Math.round((performance.now()-startedAt)/1000),ex:["ski"],score:[0,0],reps:Array(n).fill(0),
    mode:"ski",times:times.slice(),skiRaw:raws.slice(),skiPen:pens.slice(),skiGates:cleans.slice(),skiMiss:misses.slice(),skiHit:hits.slice()});
  saveHist(h);
  const r=rank(times),top=r[0].time,winners=r.filter(x=>x.place===1);
  const newPb=top!=null&&top<pb;
  const head=$("#skResHead"),win=$("#skWin"),sub=$("#skSub");
  const w=winners.length===1?winners[0].i:-1;
  if(top==null){win.textContent=tr("sk.allDnf");sub.textContent=tr("sk.allDnfSub")}
  else if(n===1){win.textContent=`${dec(top,2)} s`;sub.textContent=tr("sk.soloSub")}
  else if(w<0){win.textContent=tr("res.tie");sub.textContent=tr("sk.winSub",{t:dec(top,2)})}
  else{win.textContent=tr("sk.wins",{name:names0[w]});sub.textContent=tr("sk.winSub",{t:dec(top,2)})}
  head.style.setProperty("--c",top==null?"var(--ink)":TONE[w<0?r[0].i:w]);
  head.dataset.c=top==null?"ink":WHO[w<0?r[0].i:w];
  $("#skResArt").innerHTML=mascot(WHO[w<0?r[0].i:w],top==null?"lose":w<0?"idle":"win",{anim:true});
  const rb=$("#skRec");rb.hidden=!newPb;rb.textContent=tr(Number.isFinite(pb)?"sk.newPb":"sk.firstPb");
  $("#skRows").replaceChildren(...r.map((x,j)=>{
    const li=document.createElement("li");li.className=`sp-row sk-row p${x.i+1}`;li.style.setProperty("--i",String(j));
    li.style.setProperty("--tone",TONE[x.i]);li.style.setProperty("--tone-ink",TONE_INK[x.i]);
    const mood=n>1?(x.place===1?"happy":"sad"):undefined;
    const raw=raws[x.i],pen=pens[x.i],g=course?.gates.length??0;
    const info=x.time==null?tr("sk.dnf"):`${tr("sk.rowInfo",{t:dec(raw??0,2),p:dec(pen,1)})} · ${tr("sk.rowGates",{n:cleans[x.i],total:g,m:misses[x.i]})}${hits[x.i]?` · ${tr("sk.rowHits",{n:hits[x.i]})}`:""}`;
    li.innerHTML=`<span class="sp-place d">${x.place??"–"}</span>${face(x.i,"sp-row-face",mood)}<span class="sp-row-txt"><b></b><small></small><span class="sk-dots" aria-hidden="true"></span></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=names0[x.i];
    li.querySelector(".sp-row-txt small")!.textContent=info;
    const dots=li.querySelector(".sk-dots")!;
    (gateRes[x.i]||[]).forEach(v=>{const i=document.createElement("i");i.className=v??"";dots.append(i)});
    li.querySelector(".sp-row-t")!.textContent=x.time!=null?`${dec(x.time,2)} s`:tr("sk.dnfRow");
    return li;
  }));
  runRoot.classList.add("hide");document.body.classList.remove("sprinting","skiing","sk-race");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
}
$("#skAgain").onclick=()=>{resetGame();go()};
$("#skHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// test hooks (e2e / tools): state probe, skip the card/gate, drive without a camera, warp near the finish.
// p = 0/1 in a race, -1 (default) = every skier on the course (solo has just one).
function warpOne(p:number,z:number){
  const s=skiers[p];if(!s||!course)return;
  const to=Math.max(0,Math.min(COURSE_M-.02,z));
  if(to>s.z){s.z=to;s.x=centerAt(course,to);
    while(s.gate<course.gates.length&&course.gates[s.gate].z<to){s.clean++;s.res[s.gate]="ok";s.gate++}}
}
(window as any).__sk={
  state:()=>{
    const one=(p:number)=>{const s=skiers[p];return s?{t:s.t,x:s.x,z:s.z,v:s.v,kmh:kmh(s.v),gate:s.gate,clean:s.clean,miss:s.miss,hit:s.hit,oob:s.oob,pen:penalty(s),fin:s.fin,dnf:s.dnf}:null};
    return {phase,k,n,race,player:race?0:turnOf(k,n).player,...(one(0)??{}),racers:[one(0),one(1)],times:times.slice(),dnf:dnfP.slice()};
  },
  ready:()=>{if(phase==="card")count(performance.now())},
  script:(on=true)=>{scripted=on;if(!on){skiInputs.forEach(i=>{i.steer=0;i.brake=0})}},
  steer:(s:number)=>{scripted=true;scriptSteer=Math.max(-1,Math.min(1,s))},
  auto:(on=true)=>{scripted=true;auto=on},
  push:(p=-1)=>{if(phase!=="run")return;for(const i of (p>=0?[p]:(race?[0,1]:[0]))){const s=skiers[i];if(!s)continue;s.v=Math.min(26,s.v+PUSH_V);pushAts[i]=performance.now();pushHands[i]=-1;flashBoost(i)}},
  warp:(z:number,p=-1)=>{if(phase!=="run"||!course)return;for(const i of (p>=0?[p]:(race?[0,1]:[0])))warpOne(i,z)},
  finishNow:(p=-1)=>{if(phase!=="run")return;for(const i of (p>=0?[p]:(race?[0,1]:[0]))){const s=skiers[i];if(s)s.z=COURSE_M}},
};

export const SKI:GameMode={
  start:begin,
  tv:true,
  reset(){
    cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);clearTimeout(legendTimer);
    clearTimeout(boostTimers[0]);clearTimeout(boostTimers[1]);
    callRoot.className="sp-call sk-call";legend.classList.remove("on");boostEls.forEach(el=>el.classList.remove("on"));
    setScreenMode(null);scripted=false;auto=false;turnRoot.hidden=true;lmKeep=null;race=false;firstFinAt=0;
    skiers=[null,null];shown={};
    runRoot.classList.add("hide");runRoot.classList.remove("race");endRoot.classList.add("hide");document.body.classList.remove("sprinting","skiing","sk-race");
    screenPhase("idle");
  },
  shown:()=>!endRoot.classList.contains("hide")||(phase==="card"&&!runRoot.classList.contains("hide")),
};
