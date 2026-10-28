// Iečio metimas (spec: Martynas, issue #4, implementation #31): pick the throwing hand by holding an arm out to its
// side (two rings fill in 2 s) -> short run-up with the javelin at the shoulder -> swing the arm forward before the
// line -> the javelin flies down the sector -> 3 attempts each, the biggest TOTAL wins.
// Flow: Pradžia tile -> #/ietis (setup) -> startFlow(JAVELIN) -> #loading -> #ready (arms-up gate, 1 pose) ->
// JAVELIN.start(): per turn card (+ arms-up gate from the 2nd turn) -> hand pick -> "Pasiruošk… 3 2 1 Bėk!" ->
// run -> throw/foul -> flight -> landing + tape -> next turn ... -> #jvEnd.
// Rules are PURE in logic.ts (unit tests), the field is in field.ts, the runner rig is src/sprint/runner.ts.
import "./javelin.css";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {step,armsUp} from "../detect/step.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import {sfx} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import type {Game} from "../history/stats.ts";
import {$} from "../ui/dom.ts";
import {t as tr,tn,dec} from "../i18n/i18n.ts";
import {mascot,avatar} from "../ui/mascots.ts";
import {cachedNick} from "../online/api.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import type {ScreenState} from "../cast/room.ts";
import {V_MAX} from "../sprint/speed.ts";
import {LOOKS,newPose,runPose,standPose,winPose,drawRunner,handScreen,javelinPose} from "../sprint/runner.ts";
import {layout,build,type Layout} from "../sprint/scene.ts";
import {WHO,TONE,TONE_INK,DEF,NAME_MAX,face} from "../longjump/longjump.ts";
import {
  LINE_M,ZONE_M,APPROACH_M,ATTEMPTS,LIMIT_S,EARLY_M,newAttempt,newHandPick,updateHandPick,activeHand,readBody,
  stepAt,tick,throwArm,total,turnOf,rank,totalOf,throwDist,throwScore,flightS,apexM,
} from "./logic.ts";
import type {Attempt,HandPick,Body} from "./logic.ts";
import {geom,drawField,drawFront,worldX,mLabel,type View,type FieldInfo} from "./field.ts";

const store={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};
const app=document.getElementById("app")??document.body;

// ---------- Pradžia tile (after Siena) ----------
const tile=document.createElement("a");
tile.className="sp-tile jv-tile tap";tile.href="#/ietis";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("jv.title")}</b><small>${tr("jv.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true">${mascot("r","javelin",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".wl-tile")??document.querySelector(".sp-tile")??document.getElementById("rankCard"))?.after(tile);

// ---------- setup ----------
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="javelin" aria-labelledby="jvTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="jvTitle" tabindex="-1">${tr("jv.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    <div class="jv-hero" aria-hidden="true">
      <span class="jv-hero-big">${tr("jv.heroBig")}</span><span class="jv-hero-sub">${tr("jv.hero")}</span>
      <span class="jv-hero-line"><i></i><i></i><i></i></span>
      <span class="jv-hero-m">${mascot("r","javelin",{anim:true})}</span>
    </div>
    <section class="pick" aria-label="${tr("jv.players")}">
      <div class="seg sp-seg lj-seg" role="group" aria-label="${tr("jv.players")}">
        ${[1,2,3,4].map(k=>`<button data-jv="${k}" aria-pressed="false"><span><b class="d">${k}</b><small>${k===1?tr("mode.solo"):tn("jv.pl",k)}</small></span></button>`).join("")}
      </div>
      <p class="help jv-party">${tr("jv.party")}</p>
    </section>
    <section class="box lj-names" aria-labelledby="jvNamesT">
      <h2 class="card-title" id="jvNamesT">${tr("jv.names")}</h2>
      <ol id="jvNames">${[0,1,2,3].map(i=>`<li class="lj-nrow" data-i="${i}">${face(i,"lj-nface")}<input class="lj-name" id="jvN${i+1}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false" aria-label="${tr("jv.nameOf",{n:i+1})}"></li>`).join("")}</ol>
    </section>
    <div class="box sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("jv.pb")}</small><b class="d" id="jvPb">–</b><p class="help" id="jvPbTxt"></p></div></div>
    <section class="box sp-how" aria-labelledby="jvHowT">
      <h2 class="card-title" id="jvHowT">${tr("jv.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("jv.how1")}</span></li>
        <li><span data-icon="target"></span><span>${tr("jv.how2")}</span></li>
        <li><span data-icon="zap"></span><span>${tr("jv.how3")}</span></li>
      </ol>
      <p class="help jv-rules">${tr("jv.rules")}</p>
    </section>
    <div class="cta">
      <button class="go tap" id="jvGo" type="button"><span>${tr("jv.toRunway")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);

// ---------- run + results ----------
document.body.insertAdjacentHTML("beforeend",`
<div class="screen sp-run jv-run hide" id="jvRun">
  <canvas id="jvCv" role="img" aria-label="${tr("jv.runway")}"></canvas>
  <div class="sp-hud">
    <div class="sp-top lj-top jv-top">
      <div class="sp-card lj-me" id="jvMe"><span class="sp-face" id="jvMeFace"></span><div class="sp-card-in"><b class="lj-me-n" id="jvMeN"></b><small class="lj-me-a" id="jvMeA"></small><span class="sp-bar"><i id="jvV"></i></span></div></div>
      <div class="sp-clock lj-gap"><span class="d" id="jvGap">${LINE_M} m</span><small id="jvGapL">${tr("jv.toLineL")}</small></div>
      <div class="sp-card p2 lj-lead" id="jvLead"><span class="sp-face lj-tro" data-icon="trophy"></span><div class="sp-card-in"><b class="d" id="jvLeadD">–</b><small class="lj-me-a" id="jvLeadN">${tr("jv.leader")}</small></div></div>
    </div>
    <div class="sp-map lj-map jv-map" aria-hidden="true"><span class="lj-map-zone"></span><span class="sp-dotw" id="jvDot"><b class="sp-dot" id="jvDotB"></b></span><span class="lj-map-line"></span></div>
    <span class="lj-jump" id="jvCue" aria-hidden="true"></span>
    <span class="jv-arm" id="jvArm" hidden></span>
  </div>
  <div class="sp-call lj-call jv-call" id="jvCall" aria-live="assertive"><b class="d" id="jvCallT"></b><small id="jvCallS"></small></div>
  <div class="jv-pick" id="jvPick" hidden>
    <div class="jv-pick-top"><b class="d" id="jvPickT"></b><small id="jvPickS"></small></div>
    <div class="jv-hand jv-hand-l" id="jvPickL"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="jv-ring" id="jvFillL" cx="18" cy="18" r="15.9" pathLength="100"/></svg><b>${tr("jv.pickLeft")}</b><span id="jvPctL">0%</span></div>
    <div class="jv-hand jv-hand-r" id="jvPickR"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="jv-ring" id="jvFillR" cx="18" cy="18" r="15.9" pathLength="100"/></svg><b>${tr("jv.pickRight")}</b><span id="jvPctR">0%</span></div>
  </div>
  <div class="lj-turn jv-turn" id="jvTurn" hidden>
    <div class="lj-turn-card" role="dialog" aria-labelledby="jvTurnN">
      <span class="lj-turn-art" id="jvTurnArt" aria-hidden="true"></span>
      <span class="eyebrow">${tr("jv.now")}</span>
      <b class="d lj-turn-n" id="jvTurnN"></b>
      <span class="lj-turn-a" id="jvTurnA"></span>
      <div class="lj-gate" id="jvGate"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="lj-ring" id="jvRing" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span id="jvGateT">${tr("jv.armsUp")}</span></div>
      <ol class="lj-mini" id="jvMini" aria-label="${tr("jv.standings")}"></ol>
    </div>
  </div>
</div>
<section class="screen hide" id="jvEnd" aria-labelledby="jvWin">
  <div class="wrap">
    <header class="sp-res-head jv-res-head" id="jvResHead">
      <span class="sp-res-art" id="jvResArt" aria-hidden="true"></span>
      <span class="wl">${tr("jv.title")}</span>
      <h2 class="d" id="jvWin"></h2>
      <p id="jvSub"></p>
      <span class="rec-badge" id="jvRec" hidden>${tr("jv.newPb")}</span>
    </header>
    <ol class="sp-rows lj-rows jv-rows" id="jvRows" aria-label="${tr("jv.results")}"></ol>
    <div class="cta">
      <button class="go" id="jvAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("jv.again")}</button>
      <button class="go alt" id="jvHome" type="button"><span data-icon="house"></span>${tr("jv.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#jvRun"), endRoot=$("#jvEnd"), cvs=$<HTMLCanvasElement>("#jvCv"), ctx=cvs.getContext("2d",{alpha:false})!;
const callRoot=$("#jvCall"), callT=$("#jvCallT"), callS=$("#jvCallS");
const turnRoot=$("#jvTurn"), gateRoot=$("#jvGate"), ring=$("#jvRing"), gateT=$("#jvGateT");
const pickRoot=$("#jvPick"), pickT=$("#jvPickT"), pickS=$("#jvPickS"), pickL=$("#jvPickL"), pickR=$("#jvPickR");
const fillL=$<SVGCircleElement>("#jvFillL"), fillR=$<SVGCircleElement>("#jvFillR"), pctL=$("#jvPctL"), pctR=$("#jvPctR");
const gapEl=$("#jvGap"), gapL=$("#jvGapL"), vEl=$("#jvV"), dotEl=$("#jvDot"), cueEl=$("#jvCue"), armEl=$("#jvArm");

// ---------- history: rows with mode "javelin", throws[player] = 3 results in m (null = foul) ----------
const bestEver=(h:Game[])=>h.reduce((m,g)=>g.mode==="javelin"?Math.max(m,...(g.throws||[]).flat().map(d=>d??0)):m,0);

// ---------- setup: players 1-4 + names (local only) ----------
let n=2;
const names=["","","",""];
{const k=Number(store.get("novacore.jvN"));if(k>=1&&k<=4)n=k;
 try{const a=JSON.parse(store.get("novacore.jvNames")||"[]");if(Array.isArray(a))a.slice(0,4).forEach((v,i)=>{if(typeof v==="string")names[i]=v.slice(0,NAME_MAX)})}catch(e){}}
const nameOf=(i:number)=>names[i].trim()||DEF[i];
const segBtns=[...document.querySelectorAll<HTMLElement>("[data-jv]")], inputs=[0,1,2,3].map(i=>$<HTMLInputElement>(`#jvN${i+1}`));
function syncSetup(){
  segBtns.forEach(b=>{const on=Number(b.dataset.jv)===n;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  document.querySelectorAll<HTMLElement>("#jvNames .lj-nrow").forEach(r=>r.hidden=Number(r.dataset.i)>=n);
  if(!names[0]&&cachedNick())inputs[0].placeholder=cachedNick()!;
  inputs.forEach((el,i)=>{el.placeholder=i===0&&cachedNick()?cachedNick()!:DEF[i];if(document.activeElement!==el)el.value=names[i]});
}
const P1=()=>names[0].trim()||cachedNick()||DEF[0];
const nameAt=(i:number)=>i===0?P1():nameOf(i);
segBtns.forEach(b=>b.onclick=()=>{n=Number(b.dataset.jv);store.set("novacore.jvN",String(n));syncSetup()});
inputs.forEach((el,i)=>{
  el.oninput=()=>{names[i]=el.value.slice(0,NAME_MAX);store.set("novacore.jvNames",JSON.stringify(names))};
  el.onkeydown=e=>{if(e.key==="Enter")el.blur()};
});
function renderPb(){
  const b=bestEver(loadHist());
  $("#jvPb").textContent=b?mLabel(b):"–";
  $("#jvPbTxt").textContent=tr(b?"jv.pbTxt":"jv.pbNone");
}
onView("javelin",()=>{syncSetup();renderPb()});
function go(){document.querySelector<HTMLElement>('[data-p="1"]')?.click();S.players=1;startFlow(JAVELIN)}
$("#jvGo").onclick=go;

// ---------- session state ----------
type Phase="off"|"card"|"pick"|"count"|"run"|"fly"|"land"|"foul";
let phase:Phase="off",phaseAt=0,t0=0,raf=0,last=0,hudAt=0,callTimer=0,k=0,holdAt=0,holdOk=0,beat=-1,pb=0,startedAt=0;
let A:Attempt=newAttempt(1),pick:HandPick=newHandPick(),throws:(number|null)[][]=[],steps:number[]=[],names0:string[]=[];
let L:Layout,V:View,zoom=1,flagAt=0,flag:""|"ok"|"foul"="",landX=0,airFrom=0,airLen=0,airT=0,feedCad=0,feedAt=0,feedLeg=0,autoX=-1;
let pickHandled=false,lastBody:Body|null=null,lastPoseAt=0,lmKeep:any[]|null=null,lastPs:any[]|null=null,scripted=false;
const pose=newPose();let cyc=0;
const cur=()=>turnOf(k,n);

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call lj-call jv-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  L=layout(W,H,dpr);build(ctx,L,[tr("jv.board1"),tr("jv.board2")]);
  if(cv.width)document.body.style.setProperty("--sp-cam-ar",String(cv.width/cv.height));
}
addEventListener("resize",()=>{if(phase!=="off")resize()});
const viewM=()=>L.portrait?9:14;

function begin(){
  throws=Array.from({length:n},()=>[]);steps=Array(n).fill(0);names0=[...Array(n).keys()].map(nameAt);
  k=0;pb=bestEver(loadHist());startedAt=performance.now();
  runRoot.classList.remove("hide");endRoot.classList.add("hide");
  document.body.classList.add("sprinting","javelining");
  resize();
  document.fonts?.load("400 40px \"Titan One\"",`${tr("jv.board1")} 0123456789 m`).then(()=>{if(phase!=="off")build(ctx,L,[tr("jv.board1"),tr("jv.board2")])}).catch(()=>{});
  setScreenMode(tvState);screenPhase("play");
  last=performance.now();card(last);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}
// ---------- turn card + gate ----------
function card(now:number){
  phase="card";phaseAt=now;holdAt=0;holdOk=0;S.running=false; // back between turns = leave the series (game.ts)
  A=newAttempt(1);pick=newHandPick();pickHandled=false;lastBody=null;S.st[0]={} as typeof S.st[0];cyc=0;flag="";zoom=1;
  const {round,player:p}=cur();
  callRoot.className="sp-call lj-call jv-call";cueEl.classList.remove("on");
  $("#jvTurnArt").innerHTML=mascot(WHO[p],"javelin",{anim:true});
  const nm=$("#jvTurnN");nm.textContent=names0[p];nm.style.setProperty("--tone",TONE[p]);
  $("#jvTurnA").textContent=tr("jv.attempt",{n:round+1,total:ATTEMPTS});
  gateRoot.hidden=k===0; // the very first turn just passed game.ts's arms-up gate
  ring.style.strokeDashoffset="100";gateT.textContent=tr("jv.armsUp");
  const mini=$("#jvMini");mini.hidden=n<2;mini.classList.toggle("many",n>2);
  mini.replaceChildren(...rank(throws).map(r=>{const li=document.createElement("li");li.className=r.i===p?"now":"";
    li.innerHTML=`${face(r.i,"lj-mface")}<span class="lj-mname"></span><b class="d"></b>`;
    li.querySelector(".lj-mname")!.textContent=names0[r.i];
    li.querySelector("b")!.textContent=r.total>0?dec(r.total,1):throws[r.i].length?"X":"–";return li}));
  turnRoot.hidden=false;turnRoot.classList.remove("out");void turnRoot.offsetWidth;turnRoot.classList.add("in");
  pickRoot.hidden=true;pickRoot.classList.remove("in","out");document.body.classList.remove("javelin-picking");
  armEl.hidden=true;
  hudMe();sfx.round();
}
function hudMe(){
  const {round,player:p}=cur();
  $("#jvMeFace").innerHTML=avatar(WHO[p]);$("#jvMe").style.setProperty("--tone",TONE[p]);
  $("#jvMeN").textContent=names0[p];$("#jvMeA").textContent=`${round+1}/${ATTEMPTS}`;
  $("#jvDotB").style.background=TONE[p];
  const r=rank(throws),top=r[0];
  if(n===1){$("#jvLeadD").textContent=pb?mLabel(pb):"–";$("#jvLeadN").textContent=tr("jv.pbShort")}
  else{$("#jvLeadD").textContent=top&&top.total>0?mLabel(top.total):"–";$("#jvLeadN").textContent=top&&top.total>0?names0[top.i]:tr("jv.leader")}
}
function gate(now:number,lm:any[]|null){
  if(k===0){if(now-phaseAt>1200)toPick(now);return}
  const up=!!lm&&armsUp(lm);
  if(up){holdOk=now;if(!holdAt)holdAt=now}else if(holdAt&&now-holdOk>300)holdAt=0;
  const pct=holdAt?Math.min(1,(now-holdAt)/1100):0;
  ring.style.strokeDashoffset=String(100-pct*100);
  const msg=lm?tr(up?"jv.hold":"jv.armsUp"):tr("jv.stepIn");
  if(gateT.textContent!==msg)gateT.textContent=msg;
  gateRoot.classList.toggle("ok",up);
  if(pct>=1)toPick(now);
}
// ---------- hand pick (2 s rings) ----------
function toPick(now:number){
  phase="pick";phaseAt=now;S.running=false;pick=newHandPick();pick.last=now;pick.start=now;pickHandled=false;
  A=newAttempt(1);lastBody=null;
  turnRoot.classList.remove("in");turnRoot.classList.add("out");setTimeout(()=>{turnRoot.hidden=true},260);
  pickRoot.hidden=false;pickRoot.classList.remove("out");void pickRoot.offsetWidth;pickRoot.classList.add("in");
  document.body.classList.add("javelin-picking");armEl.hidden=true;
  callRoot.className="sp-call lj-call jv-call";cueEl.classList.remove("on");
  pickT.textContent=tr("jv.pickHand");pickS.textContent=tr("jv.pickHandSub");
  drawPickUi(null);
}
function drawPickUi(body:Body|null){
  const f0=pick.chosen===0?1:pick.fill[0],f1=pick.chosen===1?1:pick.fill[1];
  fillL.style.strokeDashoffset=String(100-f0*100);fillR.style.strokeDashoffset=String(100-f1*100);
  pctL.textContent=`${Math.round(f0*100)}%`;pctR.textContent=`${Math.round(f1*100)}%`;
  const active=activeHand(body),side=pick.chosen??active;
  pickL.classList.toggle("on",side===0);pickR.classList.toggle("on",side===1);
  pickL.classList.toggle("full",pick.chosen===0);pickR.classList.toggle("full",pick.chosen===1);
  if(pick.chosen!=null){pickT.textContent=tr("jv.pickChosen",{hand:tr(pick.chosen?"jv.pickRight":"jv.pickLeft")});pickS.textContent=pick.auto?tr("jv.pickAuto"):tr("jv.pickHandSub")}
  else if(!body){pickT.textContent=tr("jv.stepIn");pickS.textContent=tr("jv.noHand")}
  else if(active!=null){pickT.textContent=tr("jv.pickHold");pickS.textContent=tr(active?"jv.pickRight":"jv.pickLeft")}
  else{pickT.textContent=tr("jv.pickHand");pickS.textContent=tr("jv.pickHandSub")}
}
function choose(now:number,side:0|1,auto=false){
  if(pickHandled)return;
  pickHandled=true;A.side=side;pick.chosen=side;pick.at=now;pick.auto=auto;
  drawPickUi(lastBody);
  call(tr(side?"jv.pickRight":"jv.pickLeft"),auto?tr("jv.pickAuto"):"","is-go",900);
  sfx.rep(0);
}
function count(now:number){
  phase="count";phaseAt=now;beat=-1;S.running=true; // game.ts swallows Android back while running
  pickRoot.classList.remove("in");pickRoot.classList.add("out");setTimeout(()=>{pickRoot.hidden=true},240);
  document.body.classList.remove("javelin-picking");armEl.hidden=true;
  A=newAttempt(pick.chosen??1);S.st[0]={} as typeof S.st[0];
  call(tr("jv.getSet"),tr("jv.getSetSub"));sfx.tick();
}
// ---------- events ----------
function knee(now:number,leg:number){
  S.fl[0]=now;
  if(phase!=="run")return;
  stepAt(A,(now-t0)/1000,leg);steps[cur().player]++;
  if(A.state==="run")sfx.step(0);
}
function released(now:number){
  if(phase!=="run")return;
  const T=A.take!;
  phase="fly";phaseAt=now;
  airFrom=T.x;landX=LINE_M+T.dist;airLen=Math.max(.8,landX-airFrom);airT=flightS(airLen);
  callRoot.classList.remove("on");cueEl.classList.remove("on");armEl.hidden=true;
  sfx.leap();
}
function foul(now:number,why:string){
  if(phase!=="run")return;
  phase="foul";phaseAt=now;flag="foul";flagAt=now/1000;cueEl.classList.remove("on");armEl.hidden=true;
  throws[cur().player].push(null);
  const none=why==="none";
  call(tr(none?"jv.noThrow":"jv.foul"),tr(none?"jv.noThrowSub":"jv.foulSub"),"is-bad is-foul");
  sfx.horn();hudMe();
}
function early(now:number){
  call(tr("jv.early"),tr("jv.earlySub"),"is-bad",1100);sfx.tick();
}
function landed(now:number){
  if(phase!=="fly")return;
  phase="land";phaseAt=now;flag="ok";flagAt=now/1000;
  const d=A.take!.dist,p=cur().player;
  const prevTop=Math.max(0,...throws.flat().map(x=>x??0));
  throws[p].push(d);
  sfx.land();
  const lead=n>1&&d>prevTop&&d>0;
  setTimeout(()=>{if(phase==="land")call(mLabel(d),lead?tr("jv.lead"):tr("jv.landSub"),`is-dist${lead?" is-lead":""}`)},900);
  hudMe();
}
function next(now:number){
  k++;
  if(k>=total(n)){finish();return}
  card(now);
}
// ---------- frame ----------
function frame(now:number){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
  const ps=sampleCamera(now);
  let lm:any[]|null=null;
  if(ps&&ps.length){
    lm=ps[0].lm;
    S.st[0].ar=detCv.width/detCv.height||1;
    // Sprint-style running detection: call step() on EVERY camera frame (also when MediaPipe is throttled and
    // sampleCamera() returns the previous pose array). The old "fresh pose only" gate made the run feel unresponsive.
    const st=S.st[0],up0=st.leg?.[0];
    if(step(st,lm,"knees",now))knee(now,st.leg[0]&&!up0?0:1);
    const fresh=ps!==lastPs;lastPs=ps;
    if(fresh){
      if(phase==="pick"){
        lastBody=readBody(lm,S.st[0].ar);lastPoseAt=now;
      }else if(phase==="run"){
        // The throw gesture only needs fresh pose data (velocities); the arm is held, not re-sampled on stale frames.
        const body=readBody(lm,S.st[0].ar);
        const w=body?.wr[A.side];
        const armMsg=!w||!w.ok?tr("jv.noHand"):w.h<-0.06?tr("jv.lowArm"):"";
        if(armEl.textContent!==armMsg){armEl.textContent=armMsg;armEl.hidden=!armMsg}
        if(!scripted){
          const arm=w&&w.ok?{t:(now-t0)/1000,x:w.xr,h:w.h,z:w.z}:null;
          const ev=throwArm(A,arm);
          if(ev==="ok")released(now);
          else if(ev==="foul")foul(now,"line");
          else if(ev==="early")early(now);
        }
      }
    }
    if(phase!=="off")draw(lm,0);
    lmKeep=lm;
  }
  // the hand pick advances every screen frame (the ring fill must not depend on the pose rate); a stale pose is dropped
  if(phase==="pick"){
    if(lastPoseAt&&now-lastPoseAt>300)lastBody=null;
    const ch=updateHandPick(pick,lastBody,now);
    drawPickUi(lastBody);
    if(ch!=null&&!pickHandled)choose(now,ch,pick.auto);
  }
  // test hook: synthetic cadence (e2e / tools)
  if(feedCad>0&&phase==="run"&&now>=feedAt){feedLeg^=1;knee(now,feedLeg);feedAt=now+1000/feedCad}
  if(autoX>=0&&phase==="run"&&A.r.x>=autoX){autoX=-1;forceThrow(now,.5,7)}
  const tp=(now-phaseAt)/1000;
  if(phase==="card")gate(now,lmKeep);
  else if(phase==="pick"&&pick.chosen!=null&&now-pick.at>650)count(now);
  else if(phase==="count"){
    const b=tp<.9?-1:Math.floor((tp-.9)/.6);
    if(b!==beat&&b>=0){beat=b;
      if(b<3){call(String(3-b),"","is-num");sfx.tick()}
      else{phase="run";phaseAt=now;t0=now;call(tr("jv.go"),"","is-go",800);sfx.whistle();feedAt=now}
    }
  }else if(phase==="run"||phase==="foul"){
    const t=(now-t0)/1000;
    if(tick(A,t,dt)&&phase==="run")foul(now,A.why);
    if(phase==="foul"&&(now-phaseAt)/1000>2.6)next(now);
  }else if(phase==="fly"){if(tp>=airT)landed(now)}
  else if(phase==="land"){if(tp>3.4)next(now)}
  if(phase!=="off"){render(now,dt);if(now-hudAt>80){hudAt=now;hud()}}
}

// ---------- drawing ----------
const INK="#14183A",RED="#FF3B3B",YEL="#FFC61A";
function drawSpear(ctx:CanvasRenderingContext2D,x:number,y:number,ang:number,len:number){
  const L2=Math.max(16,len);
  ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.lineCap="round";
  ctx.strokeStyle=INK;ctx.lineWidth=Math.max(5,L2*.11);ctx.beginPath();ctx.moveTo(-L2*.62,0);ctx.lineTo(L2*.3,0);ctx.stroke();
  ctx.strokeStyle="#E9ECF5";ctx.lineWidth=Math.max(2.5,L2*.055);ctx.beginPath();ctx.moveTo(-L2*.62,0);ctx.lineTo(L2*.3,0);ctx.stroke();
  ctx.strokeStyle=RED;ctx.lineWidth=Math.max(3,L2*.09);ctx.beginPath();ctx.moveTo(-L2*.1,0);ctx.lineTo(L2*.05,0);ctx.stroke();
  ctx.fillStyle=INK;ctx.beginPath();ctx.moveTo(L2*.34,0);ctx.lineTo(L2*.25,-L2*.075);ctx.lineTo(L2*.25,L2*.075);ctx.closePath();ctx.fill();
  ctx.restore();
}
function render(now:number,dt:number){
  const t=now/1000,vm=viewM(),x=A.r.x;
  let want=1,target=x-vm*.32;
  if(phase==="fly"){
    const f=Math.min(1,(now-phaseAt)/1000/airT),jx=airFrom+airLen*f;
    want=1.8;target=jx-vm*want*.42;
  }
  if(phase==="land"){
    // a javelin lands 20-80 m out: do NOT fit the whole line -> the phone would show a 70 m wide strip of grass.
    // Show the landing + the tape + the mark (the HUD already says the distance), the thrower stays off-screen.
    want=2;target=landX-vm*2*.42;
  }
  if(phase==="foul")target=Math.min(x,LINE_M+4)-vm*.45;
  if(phase==="card"||phase==="pick"||phase==="count")target=-vm*.3;
  zoom+=(want-zoom)*(1-Math.exp(-dt*3));
  const ppm=L.W/(vm*zoom),g=geom(L,ppm),camT=target;
  V=V&&V.L===L?V:{L,cam:camT,ppm,gy:g.gy,h:g.h};
  if(phase==="card"||phase==="pick"||phase==="count")V.cam=camT;
  V.cam+=(camT-V.cam)*(1-Math.exp(-dt*(phase==="run"?8:phase==="fly"?10:3.5)));V.ppm=ppm;V.gy=g.gy;V.h=g.h;
  const p=cur().player;
  // farthest valid throw = the mark on the field (the competition itself is ranked by the total)
  let leadI=-1,leadD=0;
  throws.forEach((js,i)=>js.forEach(d=>{if(d!=null&&d>leadD){leadD=d;leadI=i}}));
  const lead=leadD>0?{d:leadD,label:`${names0[leadI]} ${mLabel(leadD)}`,tone:TONE[leadI]}:null;
  const F:FieldInfo={zone:phase==="run"&&LINE_M-x<ZONE_M+1?.5+.5*Math.sin(t*12):0,leader:lead,mark:phase==="land"?A.take!.dist:null,
    tape:phase==="land"?Math.min(1,Math.max(0,((now-phaseAt)/1000-.4)/.7)):0,tapeD:phase==="land"?A.take!.dist:0,flag,flagAt,t};
  drawField(ctx,V,F);
  // the thrower: stand / run / release / win
  let X=x,lift=0,sq=1;
  if(phase==="card"||phase==="pick"||phase==="count"){standPose(pose,t);javelinPose(pose,A.side,0)}
  else if(phase==="fly"){X=A.take!.x;standPose(pose,t);javelinPose(pose,A.side,1);pose.lean=18}
  else if(phase==="land"){
    X=A.take!.x; // the thrower stays at the release point; the camera is at the landing
    if((now-phaseAt)/1000>2)winPose(pose,t);
    else{standPose(pose,t);javelinPose(pose,A.side,1);pose.lean=16}
  }else if(phase==="foul"){X=Math.min(x,LINE_M+1);standPose(pose,t);javelinPose(pose,A.side,0)}
  else{
    const v=A.r.v;
    if(v<.35)standPose(pose,t);else{cyc+=dt*v*.2;runPose(pose,cyc%1,Math.min(1,.3+v/9))}
    javelinPose(pose,A.side,0);
  }
  const sx=worldX(V,X,V.gy),gy=V.gy-lift,h=V.h;
  ctx.fillStyle="rgba(20,24,58,.18)";ctx.beginPath();ctx.ellipse(sx,V.gy+2,h*.2*(1-Math.min(.6,lift/(h*2))),h*.035,0,0,Math.PI*2);ctx.fill();
  if(phase!=="fly"&&phase!=="land"){
    const hand=handScreen(pose,sx,V.gy,h,A.side);
    drawSpear(ctx,hand.x,hand.y,-0.35,Math.max(22,ppm*2.6));
  }
  drawRunner(ctx,LOOKS[p],pose,sx,gy,h,sq);
  if(phase==="fly"){
    const f=Math.min(1,(now-phaseAt)/1000/airT),jx=airFrom+airLen*f;
    const apex=Math.min(apexM(airLen)*ppm,L.H*.25),jy=V.gy-4*f*(1-f)*apex;
    const ang=Math.atan2(-4*(1-2*f)*apexM(airLen),airLen);
    drawSpear(ctx,worldX(V,jx,V.gy),jy,ang,Math.max(20,ppm*2.6));
  }else if(phase==="land"){
    drawSpear(ctx,worldX(V,landX,V.gy),V.gy,-1.15,Math.max(22,ppm*2.6));
  }
  drawFront(ctx,V.cam*V.ppm/L.ppm);
}
// HUD: text only when it changes
const shown={gap:"",gapL:"",cue:""};
function hud(){
  const x=A.r.x,toLine=LINE_M-x;
  let gtxt:string,gl:string;
  if(phase==="land"){gtxt=dec(A.take!.dist,2);gl=tr("jv.metres")}
  else if(phase==="fly"){
    const f=Math.min(1,(performance.now()-phaseAt)/1000/airT),jx=airFrom+airLen*f;
    gtxt=`${dec(Math.max(0,jx-LINE_M),1)} m`;gl=tr("jv.flyL");
  }
  else if(phase==="foul"){gtxt="X";gl=tr("jv.foulL")}
  else{gtxt=`${Math.max(0,Math.ceil(toLine))} m`;gl=tr("jv.toLineL")}
  if(gtxt!==shown.gap){shown.gap=gtxt;gapEl.textContent=gtxt}
  if(gl!==shown.gapL){shown.gapL=gl;gapL.textContent=gl}
  vEl.style.transform=`scaleX(${Math.min(1,A.r.v/V_MAX).toFixed(3)})`;
  const travel=phase==="fly"?airFrom+airLen*Math.min(1,(performance.now()-phaseAt)/1000/airT):phase==="land"?landX:x;
  dotEl.style.transform=`translateX(${(Math.min(1,Math.max(0,travel/(LINE_M+80)))*100).toFixed(1)}%)`;
  const cue=phase!=="run"||toLine<=-.2?"":toLine<=ZONE_M?"go":toLine<=ZONE_M+APPROACH_M?"ready":"";
  if(cue!==shown.cue){shown.cue=cue;cueEl.className=`lj-jump${cue?" on "+cue:""}`;if(cue)cueEl.textContent=tr(cue==="go"?"jv.throwNow":"jv.getReady")}
  runRoot.classList.toggle("is-foul",phase==="foul");
}
// what the TV board shows (cast.ts merges it over the rep-game state): 1-2 players = their TOTAL in whole metres
// (3 throws can sum to >9999 cm, so cm would clamp; the ex.name carries the exact total + the current attempt);
// 3-4 players = the current thrower's total (the protocol has two score slots).
function tvState():Partial<ScreenState>{
  const {round,player:p}=cur(),done=phase==="off"&&!endRoot.classList.contains("hide");
  const running=phase==="run"||phase==="fly"||phase==="land"||phase==="foul";
  const left=done?0:running?Math.max(0,LIMIT_S-A.t):LIMIT_S; // attempt clock: stops at the release
  const totalM=(i:number)=>Math.round(totalOf(throws[i]||[]));
  const live=phase==="land"&&A.take?` · ${mLabel(A.take.dist)}`:phase==="foul"?" · X":"";
  const r=rank(throws);
  return {players:n===2?2:1,duration:LIMIT_S,left,round,mult:1,ex:{id:"javelin",name:done?tr("jv.title"):`${names0[p]} · ${round+1}/${ATTEMPTS}${live}`.slice(0,40)},
    score:n===2?[totalM(0),totalM(1)]:[totalM(n===1?0:p),0],reps:throws.flat().filter(d=>d!=null).length,
    winner:done&&n===2&&r[0].place===1&&r[1].place!==1?(r[0].i+1) as 1|2:0};
}

// ---------- results ----------
function finish(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  turnRoot.hidden=true;pickRoot.hidden=true;document.body.classList.remove("javelin-picking");
  const h=loadHist();
  h.unshift({t:Date.now(),players:n,duration:Math.round((performance.now()-startedAt)/1000),ex:["javelin"],score:[0,0],reps:steps.slice(),mode:"javelin",throws:throws.map(j=>j.slice())});
  saveHist(h);
  const r=rank(throws),top=r[0],winners=r.filter(x=>x.place===1);
  const newPb=top?.best!=null&&top.best>pb;
  const allFoul=r.every(x=>x.place==null);
  const head=$("#jvResHead"),win=$("#jvWin"),sub=$("#jvSub");
  const w=winners.length===1?winners[0].i:-1;
  if(allFoul){win.textContent=tr("jv.allFoul");sub.textContent=tr("jv.allFoulSub")}
  else if(n===1){win.textContent=mLabel(r[0].total);sub.textContent=tr("jv.soloSub",{total:dec(r[0].total,2),best:mLabel(r[0].best??0)})}
  else if(w<0){win.textContent=tr("res.tie");sub.textContent=tr("jv.winSub",{total:dec(top.total,2),best:mLabel(top.best??0)})}
  else{win.textContent=tr("jv.wins",{name:names0[w]});sub.textContent=tr("jv.winSub",{total:dec(top.total,2),best:mLabel(top.best??0)})}
  head.style.setProperty("--c",allFoul?"var(--ink)":TONE[w<0?r[0].i:w]);
  head.dataset.c=allFoul?"ink":WHO[w<0?r[0].i:w];
  $("#jvResArt").innerHTML=mascot(WHO[w<0?r[0].i:w],allFoul?"lose":w<0?"idle":"win",{anim:true});
  const rb=$("#jvRec");rb.hidden=!newPb;rb.textContent=tr(pb?"jv.newPb":"jv.firstPb");
  $("#jvRows").replaceChildren(...r.map((x2,j)=>{
    const li=document.createElement("li");li.className="sp-row lj-row jv-row";li.style.setProperty("--i",String(j));li.style.setProperty("--tone",TONE[x2.i]);li.style.setProperty("--tone-ink",TONE_INK[x2.i]);
    const mood=n>1?(x2.place===1?"happy":"sad"):undefined;
    li.innerHTML=`<span class="sp-place d">${x2.place??"–"}</span>${face(x2.i,"sp-row-face",mood)}<span class="sp-row-txt"><b></b><small class="jv-row-b"></small><ol class="lj-tries"></ol></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=names0[x2.i];
    li.querySelector(".jv-row-b")!.textContent=x2.best!=null?tr("jv.rowBest",{d:mLabel(x2.best)}):"";
    li.querySelector(".lj-tries")!.replaceChildren(...throws[x2.i].map((d,a)=>{const c=document.createElement("li");
      c.className=d==null?"x":d===x2.best?"best":"";c.textContent=d==null?"X":dec(d,2);c.setAttribute("aria-label",`${tr("jv.attemptN",{n:a+1})}: ${d==null?tr("jv.foulL"):mLabel(d)}`);return c}));
    li.querySelector(".sp-row-t")!.textContent=x2.total>0?mLabel(x2.total):"X";
    return li;
  }));
  runRoot.classList.add("hide");document.body.classList.remove("sprinting","javelining");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
  sfx.finish();
}
$("#jvAgain").onclick=()=>{resetGame();go()};
$("#jvHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// test hooks (e2e / tools): state probe, synthetic cadence, forced hand, throw at a distance / now
function forceThrow(now:number,h:number,s:number){
  if(phase!=="run")return;
  const x=A.r.x,gap=LINE_M-x;
  if(gap<0){A.state="foul";A.why="line";foul(now,"line");return}
  if(gap>EARLY_M){early(now);return}
  const v=A.r.v,raw=throwDist(h,s,v),dist=throwScore(h,s,v,gap)!;
  A.state="fly";A.take={t:(now-t0)/1000,x,v,h,s,gap,dist,raw};
  released(now);
}
(window as any).__jv={
  state:()=>({phase,k,n,player:cur().player,round:cur().round,x:A.r.x,v:A.r.v,t:A.t,why:A.why,throws:throws.map(j=>j.slice()),side:A.side,fill:pick.fill.slice(),chosen:pick.chosen,take:A.take}),
  feed:(cad:number)=>{feedCad=cad;feedAt=performance.now();scripted=true},
  hand:(side:0|1)=>{if(phase==="pick")choose(performance.now(),side,false)},
  ready:()=>{const now=performance.now();if(phase==="card")toPick(now);else if(phase==="pick"&&!pickHandled)choose(now,1,false)},
  throwAt:(x:number)=>{autoX=x},
  throw:()=>forceThrow(performance.now(),.5,7),
};

export const JAVELIN:GameMode={
  start:begin,
  tv:true,
  reset(){
    cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);callRoot.className="sp-call lj-call jv-call";
    setScreenMode(null);feedCad=0;autoX=-1;scripted=false;pickHandled=false;
    turnRoot.hidden=true;pickRoot.hidden=true;
    runRoot.classList.add("hide");endRoot.classList.add("hide");
    document.body.classList.remove("sprinting","javelining","javelin-picking");
  },
  shown:()=>!endRoot.classList.contains("hide")||phase==="card"||phase==="pick",
};
