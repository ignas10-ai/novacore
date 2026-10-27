// Slidinėjimas (issue #23, idea #4): one phone, 1-4 players take turns downhill. Lean left/right to steer, pull
// both arms down like ski poles to speed up, lean back to brake. Pass the slalom gates; hit a flag and you stop
// dead, go outside the boundary and every second is added to your time. Fastest final time wins.
// Flow: Pradžia tile -> #/slidinejimas (setup + names) -> startFlow(SKI) -> #loading + #ready arms-up gate ->
// SKI.start(): turn card (+ gate from the 2nd player) -> "Pasiruošk… 3 2 1 Čiuožiam!" -> #skRun -> #skEnd.
// Rules, course and physics are PURE in logic.ts (test/unit/ski.test.ts), the downhill canvas is slope.ts.
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
import {COURSE_M,LIMIT_S,MISS_PENALTY,newCourse,newSkier,newPoleState,readControl,tick,rank,penalty,centerAt,total,turnOf,
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
        ${[1,2,3,4].map(k=>`<button data-sk="${k}" aria-pressed="false"><span><b class="d">${k}</b><small>${k===1?tr("mode.solo"):tn("sk.pl",k)}</small></span></button>`).join("")}
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
      <div class="sp-card sk-me" id="skMe"><span class="sp-face" id="skMeFace"></span><div class="sp-card-in"><b class="sk-me-n" id="skMeN"></b><small class="sk-me-a" id="skMeA"></small><span class="sp-bar"><i id="skV"></i></span></div></div>
      <div class="sp-clock sk-clock"><span class="d" id="skT">0,00</span><small class="sk-pen" id="skPen"></small></div>
      <div class="sp-card p2 sk-best" id="skBestC"><span class="sp-face sk-tro" data-icon="trophy"></span><div class="sp-card-in"><b class="d" id="skPbL">–</b><small>${tr("sk.pbL")}</small></div></div>
    </div>
    <div class="sp-map sk-map" aria-hidden="true">
      <span class="sk-ticks" id="skTicks"></span>
      <span class="sp-dotw" id="skDot"><b class="sp-dot" id="skDotB"></b></span>
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
const clockEl=$("#skT"), penEl=$("#skPen"), vEl=$("#skV"), dotEl=$("#skDot"), gateN=$("#skGateN"), legend=$("#skLegend");

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
// one skier in front of the camera at a time: the shared player count goes to 1 (like long jump / bowling)
function go(){
  document.querySelector<HTMLElement>('[data-p="1"]')?.click();
  S.players=1;
  startFlow(SKI);
}
$("#skGo").onclick=go;

// ---------- session state ----------
type Phase="off"|"card"|"count"|"run"|"over";
let phase:Phase="off", phaseAt=0, beat=-1, k=0, holdAt=0, holdOk=0, raf=0, last=0, hudAt=0, callTimer=0, legendTimer=0;
let n=2, names0:string[]=[], course:Course|null=null, skier:Skier|null=null, pb=Infinity, startedAt=0;
let times:(number|null)[]=[], raws:(number|null)[]=[], pens:number[]=[], cleans:number[]=[], misses:number[]=[], hits:number[]=[], gateRes:(GateRes|null)[][]=[];
let input:SkiInput={steer:0,brake:0,push:false}, pole:PoleState=newPoleState(), lastLm:any[]|null=null, lastCtrlAt=0;
let camX=0, lean=0, brakeNow=0, pushAt=-1e9, pushShown=0;
let scripted=false, scriptSteer=0, auto=false, autoAt=0;
let lmKeep:any[]|null=null, L:Layout, stored=false;

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call sk-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  L=layout(W,H,dpr);buildSlope(L);
  if(cv.width)document.body.style.setProperty("--sp-cam-ar",String(cv.width/cv.height));
}
addEventListener("resize",()=>{if(phase!=="off")resize()});

function begin(){
  n=total(playerCount);names0=Array.from({length:n},(_,i)=>nameAt(i));
  course=newCourse((Math.random()*0xffffffff)>>>0);pb=bestEver(loadHist());
  times=Array(n).fill(null);raws=Array(n).fill(null);pens=Array(n).fill(0);cleans=Array(n).fill(0);misses=Array(n).fill(0);hits=Array(n).fill(0);
  gateRes=Array.from({length:n},()=>course!.gates.map(()=>null));
  k=0;stored=false;scripted=false;auto=false;scriptSteer=0;
  runRoot.classList.remove("hide");endRoot.classList.add("hide");
  document.body.classList.add("sprinting","skiing"); // .sprinting = the corner camera preview (sprint.css)
  $("#skPbL").textContent=Number.isFinite(pb)?`${dec(pb,2)} s`:"–";
  $("#skTicks").replaceChildren(...course.gates.map(g=>Object.assign(document.createElement("i"),{style:`left:${(g.z/COURSE_M*100).toFixed(2)}%`})));
  resize();
  document.fonts?.load("400 40px \"Titan One\"",`${tr("sk.board")} ${tr("sk.finishBanner")} 0123456789`).then(()=>{if(phase!=="off")buildSlope(L)}).catch(()=>{});
  startedAt=performance.now();
  setScreenMode(tvState);
  screenPhase("play");
  last=performance.now();
  card(last);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}

// ---------- turn card + gate ----------
function card(now:number){
  phase="card";phaseAt=now;holdAt=0;holdOk=0;stored=false;S.running=false; // back between turns = leave the series
  skier=newSkier(course!);pole=newPoleState();input={steer:0,brake:0,push:false};lastLm=null;lastCtrlAt=0;lmKeep=null;camX=skier.x;lean=0;brakeNow=0;pushAt=-1e9;
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
function hudMe(){
  const {player:p}=turnOf(k,n);
  $("#skMeFace").innerHTML=avatar(WHO[p]);$("#skMe").style.setProperty("--tone",TONE[p]);
  $("#skDotB").style.background=TONE[p];
  $("#skMeN").textContent=names0[p];
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
  call(tr("sk.ready"),tr("sk.readySub"));sfx.tick();
}
function startRun(now:number){
  phase="run";phaseAt=now;skier=newSkier(course!);input={steer:0,brake:0,push:false};pole=newPoleState();
  lastLm=null;lastCtrlAt=now;camX=skier.x;lean=0;brakeNow=0;pushAt=-1e9;autoAt=now+700;
  call(tr("sk.go"),"","is-go",900);sfx.whistle();
  legend.classList.add("on");clearTimeout(legendTimer);legendTimer=setTimeout(()=>legend.classList.remove("on"),9000);
}

// ---------- frame ----------
function frame(now:number){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
  const ps=sampleCamera(now);
  let lm:any[]|null=null;
  if(ps&&ps.length){lm=ps[0].lm;draw(lm,0);lmKeep=lm}
  if(phase==="run"&&skier){
    if(scripted){
      input.steer=scriptSteer;
      if(auto){
        const g=skier.gate<course!.gates.length?course!.gates[skier.gate]:null;
        const target=g?g.x:centerAt(course!,COURSE_M);
        input.steer=Math.max(-1,Math.min(1,(target-skier.x)/3.5));
        lean=input.steer;
        if(now>=autoAt){input.push=true;pushAt=now;autoAt=now+640}
      }
    }else if(lm&&lm!==lastLm){
      lastLm=lm;
      const c=readControl(lm,detCv.width/detCv.height||1,pole,now);
      lastCtrlAt=now;
      input.steer=c.steer;input.brake=c.brake;input.push=c.push;
      lean=c.steer;brakeNow=c.brake;
      if(c.push){pushAt=now;sfx.step(k)}
    }
    if(!scripted&&now-lastCtrlAt>650){input.steer=0;input.brake=0;lean=0;brakeNow=0}
    const ev=tick(skier,course!,dt,input);
    input.push=false;
    camX+=(skier.x-camX)*(1-Math.exp(-dt/.22));
    for(const e of ev)onEvent(e,now);
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
    k++;
    if(k>=n)finishRace();else card(now);
  }
  render(now,dt);
  if(now-hudAt>80){hudAt=now;hud()}
}
function onEvent(e:{type:string;gate?:number},now:number){
  if(e.type==="clean"){sfx.tick();call(tr("sk.gate"),`${e.gate!+1}/${course!.gates.length}`,"is-gate",650)}
  else if(e.type==="miss"){sfx.miss();call(tr("sk.miss"),tr("sk.missSub",{n:MISS_PENALTY}),"is-bad",1100)}
  else if(e.type==="hit"){sfx.horn();call(tr("sk.hit"),tr("sk.hitSub"),"is-bad",1300)}
  else if(e.type==="finish"){
    storeRun();phase="over";phaseAt=now;S.running=true;
    call(tr("sk.finish"),tr("sk.finishSub",{t:dec(skier!.fin!,2)}),"is-fin",2200);sfx.finish();
  }else if(e.type==="dnf"){
    storeRun();phase="over";phaseAt=now;S.running=true;
    call(tr("sk.dnf"),tr("sk.dnfSub",{n:LIMIT_S}),"is-bad",2200);sfx.horn();
  }
}
function storeRun(){
  if(!skier||stored)return;
  stored=true;
  times[k]=skier.fin;raws[k]=skier.raw;pens[k]=penalty(skier);
  cleans[k]=skier.clean;misses[k]=skier.miss;hits[k]=skier.hit;
  gateRes[k]=skier.res.slice();
}

// ---------- drawing ----------
function render(now:number,dt:number){
  if(!course||!skier)return;
  const age=(now-pushAt)/1000;
  pushShown=age>=0&&age<.35?1-age/.35:0;
  const motion:Motion={lean,brake:brakeNow,push:pushShown,crash:skier.crash>0};
  if(phase==="card"||phase==="count"){
    // a calm preview at the start hut before the run
    motion.lean=Math.sin(now/700)*.15;motion.push=0;motion.brake=0;motion.crash=false;
  }
  drawSlope(ctx,L,course,skier,camX,now/1000,LOOKS[turnOf(k,n).player],motion);
  void dt;
}

// HUD: text only when it changes
const shown={t:"",pen:"",a:"",d:""};
function hud(){
  const racing=phase==="run"||phase==="over";
  const t=racing&&skier?skier.t:0;
  const tt=dec(t,2);
  if(tt!==shown.t){shown.t=tt;clockEl.textContent=tt}
  const pen=racing&&skier?penalty(skier):0;
  const pt=pen>0?tr("sk.pen",{t:dec(pen,1)}):"";
  if(pt!==shown.pen){shown.pen=pt;penEl.textContent=pt;penEl.hidden=!pt}
  const a=skier?`${tr("sk.gateOf",{n:skier.clean,total:course!.gates.length})} · ${kmh(racing?skier.v:0)} km/h`:"";
  if(a!==shown.a){shown.a=a;$("#skMeA").textContent=a}
  const d=course?`${skier?skier.clean:0}/${course.gates.length}`:"0/0";
  if(d!==shown.d){shown.d=d;gateN.textContent=d}
  vEl.style.transform=`scaleX(${Math.min(1,(racing&&skier?skier.v:0)/26).toFixed(3)})`;
  dotEl.style.transform=`translateX(${Math.min(100,Math.max(0,(skier?skier.z:0)/COURSE_M*100)).toFixed(1)}%)`;
}

// ---------- TV board ----------
function tvState():Partial<ScreenState>{
  const done=phase==="off"&&!endRoot.classList.contains("hide");
  const on=phase==="run"||phase==="over"||phase==="count";
  const cur=skier?Math.min(COURSE_M,Math.round(skier.z)):0;
  const ts=(i:number)=>times[i]!=null?Math.round(times[i]!*100):0;
  const bestI=rank(times)[0]?.i??0;
  const slots=(p:number)=>done?(n===2?ts(p):p===0?ts(bestI):0):n===2?(p===k&&on?cur:ts(p)):p===0?cur:0;
  const w:0|1|2=done&&n===2?(()=>{const r=rank(times);return r[0]?.place===1&&r[1]?.place!==1?(r[0].i+1) as 1|2:0})():0;
  return {players:n===2?2:1,duration:LIMIT_S,left:done?0:on&&skier?Math.max(0,LIMIT_S-skier.t):LIMIT_S,round:0,mult:1,
    ex:{id:"ski",name:(done?`${tr("sk.title")} · ${tr("sk.tvTime")}`:`${names0[k]} · ${cur} m · ${skier?.gate??0}/${course?.gates.length??0}`).slice(0,40)},
    score:[slots(0),slots(1)],reps:cleans.reduce((a,b)=>a+b,0),winner:w};
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
  runRoot.classList.add("hide");document.body.classList.remove("sprinting","skiing");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
}
$("#skAgain").onclick=()=>{resetGame();go()};
$("#skHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// test hooks (e2e / tools): state probe, skip the card/gate, drive without a camera, warp near the finish
(window as any).__sk={
  state:()=>({phase,k,n,player:turnOf(k,n).player,t:skier?.t??0,x:skier?.x??0,z:skier?.z??0,v:skier?.v??0,gate:skier?.gate??0,clean:skier?.clean??0,miss:skier?.miss??0,hit:skier?.hit??0,oob:skier?.oob??0,pen:skier?penalty(skier):0,fin:skier?.fin??null,times:times.slice()}),
  ready:()=>{if(phase==="card")count(performance.now())},
  script:(on=true)=>{scripted=on;if(!on){input.steer=0;input.brake=0}},
  steer:(s:number)=>{scripted=true;scriptSteer=Math.max(-1,Math.min(1,s))},
  auto:(on=true)=>{scripted=true;auto=on},
  push:()=>{if(phase==="run"&&skier){skier.v=Math.min(26,skier.v+2.2);pushAt=performance.now()}},
  warp:(z:number)=>{
    if(phase!=="run"||!skier||!course)return;
    const to=Math.max(0,Math.min(COURSE_M-.02,z));
    if(to>skier.z){skier.z=to;skier.x=centerAt(course,to);
      while(skier.gate<course.gates.length&&course.gates[skier.gate].z<to){skier.clean++;skier.res[skier.gate]="ok";skier.gate++}}
  },
  finishNow:()=>{if(phase==="run"&&skier)skier.z=COURSE_M},
};

export const SKI:GameMode={
  start:begin,
  tv:true,
  reset(){
    cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);clearTimeout(legendTimer);
    callRoot.className="sp-call sk-call";legend.classList.remove("on");
    setScreenMode(null);scripted=false;auto=false;turnRoot.hidden=true;lmKeep=null;
    runRoot.classList.add("hide");endRoot.classList.add("hide");document.body.classList.remove("sprinting","skiing");
    screenPhase("idle");
  },
  shown:()=>!endRoot.classList.contains("hide")||(phase==="card"&&!runRoot.classList.contains("hide")),
};
