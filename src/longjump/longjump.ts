// Šuolis į tolį (spec: Martynas, 2026-10-26): run in place -> the mascot runs down the runway -> jump before the
// foul line -> it flies into the sand pit -> distance measured from the line. 1-4 players take turns on ONE phone
// (only the jumper stands in front of the camera): round 1 = P1, P2, ..., then round 2, then round 3. Best valid
// jump wins. The first "party mode": names + 4 mascot colours.
// Flow: Pradžia tile -> #/tolis (setup) -> startFlow(LONGJUMP) -> #loading -> #ready (arms-up gate, game.ts, 1 pose)
// -> LONGJUMP.start(): per turn "Dabar šoka: <vardas>" card (+ arms-up gate from the 2nd turn) -> "Pasiruošk… 3 2 1
// Bėk!" (whistle) -> run -> jump/foul -> flight -> landing + tape -> next turn ... -> #ljEnd results.
// Rules are PURE in logic.ts (unit tests), the take-off detector in src/detect/takeoff.ts, drawing in field.ts.
import "./longjump.css";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {step,armsUp} from "../detect/step.ts";
import {takeoff,takeoffState,type TakeoffState} from "../detect/takeoff.ts";
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
import {V_MAX} from "../sprint/speed.ts";
import {LOOKS,newPose,runPose,setPose,standPose,winPose,jumpPose,landPose,drawRunner} from "../sprint/runner.ts";
import {layout,build,type Layout} from "../sprint/scene.ts";
import {LINE_M,ZONE_M,ATTEMPTS,LIMIT_S,bestJump,newAttempt,stepAt,tick,jump,total,turnOf,rank,bestOf,flightS,apexM,type Attempt} from "./logic.ts";
import {geom,drawField,drawFront,worldX,mLabel,type View,type FieldInfo} from "./field.ts";

const WHO:Who[]=["r","b","y","g"];
const TONE=["#FF3B3B","#2F6BFF","#FFC61A","#16B67A"], TONE_INK=["var(--red-ink)","var(--blue-ink)","var(--yellow-ink)","var(--green-ink)"];
const DEF=[tr("p.red"),tr("p.blue"),tr("p.yellow"),tr("p.green")];
const NAME_MAX=14;
const face=(i:number,cls="",mood?:"happy"|"sad")=>`<span class="${cls}" style="--tone:${TONE[i]}">${avatar(WHO[i],mood)}</span>`;
const store={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};

// ---------- markup (built here, the shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile lj-tile tap";tile.href="#/tolis";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("lj.title")}</b><small>${tr("lj.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true">${mascot("y","squatjump",{anim:true})}${mascot("g","knees",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".bx-tile")??document.querySelector(".sp-tile")??document.getElementById("rankCard"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="longjump" aria-labelledby="ljTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="ljTitle" tabindex="-1">${tr("lj.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    <div class="lj-hero" aria-hidden="true">
      <span class="lj-hero-big">${tr("lj.heroBig")}</span><span class="lj-hero-sub">${tr("lj.hero")}</span>
      <span class="lj-hero-pit"><i>4</i><i>5</i><i>6</i><i>7</i></span><span class="lj-hero-board"></span>
      <span class="lj-hero-m">${mascot("y","win",{anim:true})}</span>
    </div>
    <section class="pick" aria-label="${tr("lj.jumpers")}">
      <div class="seg sp-seg lj-seg" role="group" aria-label="${tr("lj.jumpers")}">
        ${[1,2,3,4].map(k=>`<button data-lj="${k}" aria-pressed="false"><span><b class="d">${k}</b><small>${k===1?tr("mode.solo"):tn("lj.pl",k)}</small></span></button>`).join("")}
      </div>
      <p class="help lj-party">${tr("lj.party")}</p>
    </section>
    <section class="box lj-names" aria-labelledby="ljNamesT">
      <h2 class="card-title" id="ljNamesT">${tr("lj.names")}</h2>
      <ol id="ljNames">${[0,1,2,3].map(i=>`<li class="lj-nrow" data-i="${i}">${face(i,"lj-nface")}<input class="lj-name" id="ljN${i+1}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false" aria-label="${tr("lj.nameOf",{n:i+1})}"></li>`).join("")}</ol>
    </section>
    <div class="box sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("sp.pb")}</small><b class="d" id="ljPb">–</b><p class="help" id="ljPbTxt"></p></div></div>
    <section class="box sp-how" aria-labelledby="ljHowT">
      <h2 class="card-title" id="ljHowT">${tr("lj.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("lj.how1")}</span></li>
        <li><span data-icon="footprints"></span><span>${tr("lj.how2")}</span></li>
        <li><span data-icon="zap"></span><span>${tr("lj.how3")}</span></li>
      </ol>
      <p class="help lj-rules">${tr("lj.rules")}</p>
    </section>
    <div class="cta">
      <button class="go tap" id="ljGo" type="button"><span>${tr("lj.toPit")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
document.body.insertAdjacentHTML("beforeend",`
<div class="screen sp-run lj-run hide" id="ljRun">
  <canvas id="ljCv" role="img" aria-label="${tr("lj.runway")}"></canvas>
  <div class="sp-hud">
    <div class="sp-top lj-top">
      <div class="sp-card lj-me" id="ljMe"><span class="sp-face" id="ljMeFace"></span><div class="sp-card-in"><b class="lj-me-n" id="ljMeN"></b><small class="lj-me-a" id="ljMeA"></small><span class="sp-bar"><i id="ljV"></i></span></div></div>
      <div class="sp-clock lj-gap"><span class="d" id="ljGap">${LINE_M} m</span><small id="ljGapL">${tr("lj.toLineL")}</small></div>
      <div class="sp-card p2 lj-lead" id="ljLead"><span class="sp-face lj-tro" data-icon="trophy"></span><div class="sp-card-in"><b class="d" id="ljLeadD">–</b><small class="lj-me-a" id="ljLeadN">${tr("lj.leader")}</small></div></div>
    </div>
    <div class="sp-map lj-map" aria-hidden="true"><span class="lj-map-zone"></span><span class="sp-dotw" id="ljDot"><b class="sp-dot" id="ljDotB"></b></span><span class="lj-map-line"></span></div>
    <span class="lj-jump" id="ljJump" aria-hidden="true">${tr("lj.jumpNow")}</span>
  </div>
  <div class="sp-call lj-call" id="ljCall" aria-live="assertive"><b class="d" id="ljCallT"></b><small id="ljCallS"></small></div>
  <div class="lj-turn" id="ljTurn" hidden>
    <div class="lj-turn-card" role="dialog" aria-labelledby="ljTurnN">
      <span class="lj-turn-art" id="ljTurnArt" aria-hidden="true"></span>
      <span class="eyebrow">${tr("lj.now")}</span>
      <b class="d lj-turn-n" id="ljTurnN"></b>
      <span class="lj-turn-a" id="ljTurnA"></span>
      <div class="lj-gate" id="ljGate"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="lj-ring" id="ljRing" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span id="ljGateT">${tr("lj.armsUp")}</span></div>
      <ol class="lj-mini" id="ljMini" aria-label="${tr("lj.standings")}"></ol>
    </div>
  </div>
</div>
<section class="screen hide" id="ljEnd" aria-labelledby="ljWin">
  <div class="wrap">
    <header class="sp-res-head lj-res-head" id="ljResHead">
      <span class="sp-res-art" id="ljResArt" aria-hidden="true"></span>
      <span class="wl">${tr("lj.title")}</span>
      <h2 class="d" id="ljWin"></h2>
      <p id="ljSub"></p>
      <span class="rec-badge" id="ljRec" hidden>${tr("sp.newPb")}</span>
    </header>
    <ol class="sp-rows lj-rows" id="ljRows" aria-label="${tr("lj.results")}"></ol>
    <div class="cta">
      <button class="go" id="ljAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("app.again")}</button>
      <button class="go alt" id="ljHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#ljRun"), endRoot=$("#ljEnd"), cvs=$<HTMLCanvasElement>("#ljCv"), ctx=cvs.getContext("2d",{alpha:false})!;
const callRoot=$("#ljCall"), callT=$("#ljCallT"), callS=$("#ljCallS"), turnRoot=$("#ljTurn"), gateRoot=$("#ljGate"), ring=$("#ljRing"), gateT=$("#ljGateT");
const gapEl=$("#ljGap"), gapL=$("#ljGapL"), vEl=$("#ljV"), dotEl=$("#ljDot"), jumpEl=$("#ljJump");

// ---------- history: rows with mode "longjump", jumps[player] = 3 results in m (null = foul) ----------
const bestEver=(h:Game[])=>h.reduce((m,g)=>g.mode==="longjump"?Math.max(m,...(g.jumps||[]).flat().map(d=>d??0)):m,0);

// ---------- setup: players 1-4 + names (local only) ----------
let n=2;
const names=["","","",""];
{const k=Number(store.get("novacore.ljN"));if(k>=1&&k<=4)n=k;
 try{const a=JSON.parse(store.get("novacore.ljNames")||"[]");if(Array.isArray(a))a.slice(0,4).forEach((v,i)=>{if(typeof v==="string")names[i]=v.slice(0,NAME_MAX)})}catch(e){}}
const nameOf=(i:number)=>names[i].trim()||DEF[i];
const segBtns=[...document.querySelectorAll<HTMLElement>("[data-lj]")], inputs=[0,1,2,3].map(i=>$<HTMLInputElement>(`#ljN${i+1}`));
function syncSetup(){
  segBtns.forEach(b=>{const on=Number(b.dataset.lj)===n;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  document.querySelectorAll<HTMLElement>(".lj-nrow").forEach(r=>r.hidden=Number(r.dataset.i)>=n);
  if(!names[0]&&cachedNick())inputs[0].placeholder=cachedNick()!; // P1 = the profile nickname until edited
  inputs.forEach((el,i)=>{el.placeholder=i===0&&cachedNick()?cachedNick()!:DEF[i];if(document.activeElement!==el)el.value=names[i]});
}
const P1=()=>names[0].trim()||cachedNick()||DEF[0];
const nameAt=(i:number)=>i===0?P1():nameOf(i);
segBtns.forEach(b=>b.onclick=()=>{n=Number(b.dataset.lj);store.set("novacore.ljN",String(n));syncSetup()});
inputs.forEach((el,i)=>{
  el.oninput=()=>{names[i]=el.value.slice(0,NAME_MAX);store.set("novacore.ljNames",JSON.stringify(names))};
  el.onkeydown=e=>{if(e.key==="Enter")el.blur()};
});
function renderPb(){
  const b=bestEver(loadHist());
  $("#ljPb").textContent=b?mLabel(b):"–";
  $("#ljPbTxt").textContent=tr(b?"lj.pbTxt":"lj.pbNone");
}
onView("longjump",()=>{syncSetup();renderPb()});
// one jumper in front of the camera at a time: the shared player count goes to 1 (like the sprint/boxing segments,
// through the setup button so the rep game's setup stays in sync)
function go(){document.querySelector<HTMLElement>('[data-p="1"]')?.click();S.players=1;startFlow(LONGJUMP)}
$("#ljGo").onclick=go;

// ---------- session state ----------
type Phase="off"|"card"|"count"|"run"|"air"|"land"|"foul"|"next";
let phase:Phase="off", phaseAt=0, t0=0, raf=0, last=0, hudAt=0, callTimer=0, k=0, holdAt=0, holdOk=0, beat=-1, pb=0, startedAt=0;
let A:Attempt=newAttempt(), tk:TakeoffState=takeoffState(), jumps:(number|null)[][]=[], steps:number[]=[], names0:string[]=[];
let L:Layout, V:View, zoom=1, flagAt=0, flag:""|"ok"|"foul"="", landX=0, airFrom=0, airLen=0, airT=0, feedCad=0, feedAt=0, feedLeg=0, autoX=-1;
const pose=newPose(); let cyc=0;
const PN=60, sand=new Float32Array(PN*6); // x m, y px offset, vx m/s, vy px/s, age, life
const cur=()=>turnOf(k,n);

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call lj-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  L=layout(W,H,dpr);build(ctx,L,[tr("lj.board1"),tr("lj.board2")]);
  if(cv.width)document.body.style.setProperty("--sp-cam-ar",String(cv.width/cv.height));
}
addEventListener("resize",()=>{if(phase!=="off")resize()});
const viewM=()=>L.portrait?9:14;

function begin(){
  jumps=Array.from({length:n},()=>[]);steps=Array(n).fill(0);names0=[...Array(n).keys()].map(nameAt);
  k=0;pb=bestEver(loadHist());startedAt=performance.now();
  runRoot.classList.remove("hide");endRoot.classList.add("hide");
  document.body.classList.add("sprinting","longjumping"); // .sprinting = the corner camera preview (sprint.css)
  resize();
  document.fonts?.load("400 40px \"Titan One\"",`${tr("lj.board1")} 0123456789 m`).then(()=>{if(phase!=="off")build(ctx,L,[tr("lj.board1"),tr("lj.board2")])}).catch(()=>{});
  setScreenMode(tvState);
  screenPhase("play");
  last=performance.now();
  card(last);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}
// ---------- turn card + gate ----------
function card(now:number){
  phase="card";phaseAt=now;holdAt=0;holdOk=0;S.running=false; // back between turns = leave the series (game.ts)
  A=newAttempt();tk=takeoffState();S.st[0]={} as typeof S.st[0];cyc=0;flag="";zoom=1;
  const {round,player:p}=cur();
  callRoot.className="sp-call lj-call";jumpEl.classList.remove("on");
  $("#ljTurnArt").innerHTML=mascot(WHO[p],"idle",{anim:true});
  const nm=$("#ljTurnN");nm.textContent=names0[p];nm.style.setProperty("--tone",TONE[p]);
  $("#ljTurnA").textContent=tr("lj.attempt",{n:round+1,total:ATTEMPTS});
  gateRoot.hidden=k===0; // the very first turn just passed game.ts's arms-up gate
  ring.style.strokeDashoffset="100";gateT.textContent=tr("lj.armsUp");
  const mini=$("#ljMini");mini.hidden=n<2;mini.classList.toggle("many",n>2);
  mini.replaceChildren(...rank(jumps).map(r=>{const li=document.createElement("li");li.className=r.i===p?"now":"";
    li.innerHTML=`${face(r.i,"lj-mface")}<span class="lj-mname"></span><b class="d"></b>`;
    li.querySelector(".lj-mname")!.textContent=names0[r.i];
    li.querySelector("b")!.textContent=r.best!=null?mLabel(r.best):jumps[r.i].length?"X":"–";return li}));
  turnRoot.hidden=false;turnRoot.classList.remove("out");void turnRoot.offsetWidth;turnRoot.classList.add("in");
  hudMe();
  sfx.round();
}
function hudMe(){
  const {round,player:p}=cur();
  $("#ljMeFace").innerHTML=avatar(WHO[p]);$("#ljMe").style.setProperty("--tone",TONE[p]);
  $("#ljMeN").textContent=names0[p];$("#ljMeA").textContent=`${round+1}/${ATTEMPTS}`;
  $("#ljDotB").style.background=TONE[p];
  const top=rank(jumps)[0];
  $("#ljLeadD").textContent=top?.best!=null?mLabel(top.best):"–";
  $("#ljLeadN").textContent=top?.best!=null&&n>1?names0[top.i]:tr(n>1?"lj.leader":"lj.best");
}
function gate(now:number,lm:any[]|null){
  if(k===0){if(now-phaseAt>1700)count(now);return}
  const up=!!lm&&armsUp(lm);
  if(up){holdOk=now;if(!holdAt)holdAt=now}else if(holdAt&&now-holdOk>300)holdAt=0;
  const pct=holdAt?Math.min(1,(now-holdAt)/1100):0;
  ring.style.strokeDashoffset=String(100-pct*100);
  const msg=lm?tr(up?"lj.hold":"lj.armsUp"):tr("lj.stepIn");
  if(gateT.textContent!==msg)gateT.textContent=msg;
  gateRoot.classList.toggle("ok",up);
  if(pct>=1)count(now);
}
function count(now:number){
  phase="count";phaseAt=now;beat=-1;S.running=true; // game.ts swallows Android back while running
  turnRoot.classList.remove("in");turnRoot.classList.add("out");setTimeout(()=>{if(phase!=="card")turnRoot.hidden=true},260);
  call(tr("lj.getSet"),tr("lj.getSetSub"));sfx.tick();
}
// ---------- events ----------
function knee(now:number,leg:number){
  S.fl[0]=now;
  if(phase!=="run")return;
  stepAt(A,(now-t0)/1000,leg);steps[cur().player]++;
  if(A.state==="run")sfx.step(0);
}
function doJump(tTake:number,now:number){
  if(phase!=="run")return;
  const r=jump(A,(tTake-t0)/1000);
  if(r==="early"){call(tr("lj.early"),tr("lj.earlySub"),"is-bad",1100);return}
  if(r==="foul"){foul(now);return}
  if(r!=="ok")return;
  const T=A.take!;
  // flight = best(v) from the take-off point, so the print lands exactly at line + distance (0 m: short of the pit)
  phase="air";phaseAt=now;airFrom=T.x;airLen=Math.max(.8,bestJump(T.v));airT=flightS(airLen);landX=T.dist>0?LINE_M+T.dist:T.x+airLen;
  callRoot.classList.remove("on");jumpEl.classList.remove("on");
  sfx.leap();
}
function foul(now:number){
  phase="foul";phaseAt=now;flag="foul";flagAt=now/1000;jumpEl.classList.remove("on");
  jumps[cur().player].push(null);
  const none=A.why==="none";
  call(tr(none?"lj.noJump":"lj.foul"),tr(none?"lj.noJumpSub":"lj.foulSub"),"is-bad is-foul");
  sfx.horn();
  hudMe();
}
function landed(now:number){
  phase="land";phaseAt=now;flag="ok";flagAt=now/1000;
  const d=A.take!.dist,p=cur().player,prevTop=rank(jumps)[0]?.best??0;
  jumps[p].push(d);
  for(let i=0;i<PN;i++){const o=i*6,a=Math.PI*(.15+.7*Math.random());sand[o]=landX-.2;sand[o+1]=0;sand[o+2]=Math.cos(a)*(1+Math.random()*2.4)*(Math.random()<.7?1:-1);sand[o+3]=-Math.sin(a)*(140+Math.random()*220);sand[o+4]=0;sand[o+5]=.5+Math.random()*.4}
  sfx.land();
  const T=A.take!,lead=n>1&&d>prevTop&&d>0;
  const sub=T.gap<.05?tr("lj.perfect"):tr("lj.gapSub",{cm:Math.round(T.gap*100)});
  setTimeout(()=>{if(phase==="land")call(mLabel(d),lead?`${tr("lj.lead")} · ${sub}`:sub,`is-dist${lead?" is-lead":""}`)},1100);
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
  const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now; // .25: a slow phone (or CPU e2e, ~2 fps) still runs in real time
  const ps=sampleCamera(now);
  let lm:any[]|null=null;
  if(ps&&ps.length){
    lm=ps[0].lm;
    S.st[0].ar=detCv.width/detCv.height||1;
    const st=S.st[0],up0=st.leg?.[0];
    if(step(st,lm,"knees",now))knee(now,st.leg[0]&&!up0?0:1);
    if(phase==="count"||phase==="run"){const tt=takeoff(tk,lm,now);if(tt&&phase==="run"&&!feedCad)doJump(tt,now)} // feeding = a scripted run: jumps only via the hooks
    draw(lm,0);
  }
  // test hook: synthetic cadence (e2e / tools)
  if(feedCad>0&&phase==="run"&&now>=feedAt){feedLeg^=1;knee(now,feedLeg);feedAt=now+1000/feedCad}
  if(autoX>=0&&phase==="run"&&A.r.x>=autoX)doJump(now,now);
  const tp=(now-phaseAt)/1000;
  if(ps)lmKeep=lm; // sampleCamera() = null between camera frames: the gate keeps the last pose
  if(phase==="card")gate(now,lmKeep);
  else if(phase==="count"){
    const b=tp<.9?-1:Math.floor((tp-.9)/.6);
    if(b!==beat&&b>=0){beat=b;
      if(b<3){call(String(3-b),"","is-num");sfx.tick()}
      else{phase="run";phaseAt=now;t0=now;call(tr("lj.go"),"","is-go",800);sfx.whistle();feedAt=now}
    }
  }else if(phase==="run"||phase==="foul"){
    const t=(now-t0)/1000;
    if(tick(A,t,dt)&&phase==="run")foul(now);
    if(phase==="foul"&&(now-phaseAt)/1000>2.6)next(now); // fresh: foul() may have just reset phaseAt this frame
  }else if(phase==="air"){if(tp>=airT)landed(now)}
  else if(phase==="land"){if(tp>3.4)next(now)}
  if(phase!=="off"){render(now,dt);if(now-hudAt>80){hudAt=now;hud()}}
}
let lmKeep:any[]|null=null;

// ---------- drawing ----------
function render(now:number,dt:number){
  const t=now/1000, vm=viewM(), x=A.r.x;
  // zoom out after the landing so the board and the mark fit, else the run view
  let want=1, target=x-vm*.32;
  if(phase==="air"){const f=Math.min(1,(now-phaseAt)/1000/airT);target=airFrom+airLen*f-vm*.42}
  if(phase==="land"){const span=landX+1.6-(LINE_M-1.4);want=Math.max(1,span/vm);target=LINE_M-1.4-(vm*want-span)/2}
  if(phase==="foul")target=Math.min(x,LINE_M+4)-vm*.45;
  if(phase==="card"||phase==="count")target=-vm*.3;
  zoom+=(want-zoom)*(1-Math.exp(-dt*3));
  const ppm=L.W/(vm*zoom), g=geom(L,ppm);
  const camT=target;
  V=V&&V.L===L?V:{L,cam:camT,ppm,gy:g.gy,h:g.h};
  if(phase==="card")V.cam=camT;
  V.cam+=(camT-V.cam)*(1-Math.exp(-dt*(phase==="run"?8:3.5)));V.ppm=ppm;V.gy=g.gy;V.h=g.h;
  const p=cur().player, top=rank(jumps)[0];
  const lead=top&&top.best!=null&&top.best>0?{d:top.best,label:n>1?`${names0[top.i]} ${mLabel(top.best)}`:mLabel(top.best),tone:TONE[top.i]}:null;
  const F:FieldInfo={zone:phase==="run"&&LINE_M-x<ZONE_M+1?.5+.5*Math.sin(t*12):0,leader:lead,mark:phase==="land"?A.take!.dist:null,
    tape:phase==="land"?Math.min(1,Math.max(0,((now-phaseAt)/1000-.4)/.7)):0,tapeD:phase==="land"?A.take!.dist:0,flag,flagAt,t};
  drawField(ctx,V,F);
  // the jumper: run / set / flight / landing poses
  let X=x, lift=0, sq=1;
  const v=A.r.v;
  if(phase==="card"){standPose(pose,t)}
  else if(phase==="count"){setPose(pose,t)}
  else if(phase==="air"){
    const f=Math.min(1,(now-phaseAt)/1000/airT);X=airFrom+airLen*f;lift=4*f*(1-f)*apexM(airLen)*ppm;jumpPose(pose,f);
  }else if(phase==="land"){X=landX-.25;landPose(pose,t);sq=(now-phaseAt)<120?.9:1}
  else if(v<.35)standPose(pose,t);
  else{cyc+=dt*v*.2;runPose(pose,cyc%1,Math.min(1,.3+v/9))}
  if(phase==="land"&&(now-phaseAt)/1000>2){winPose(pose,t);X=landX+.3} // up from the sand, gloves up
  const sx=worldX(V,X,V.gy), gy=V.gy-lift, h=V.h;
  ctx.fillStyle="rgba(20,24,58,.18)";ctx.beginPath();ctx.ellipse(sx,V.gy+2,h*.2*(1-Math.min(.6,lift/(h*2))),h*.035,0,0,Math.PI*2);ctx.fill();
  if(phase==="run"&&v>5){ctx.globalAlpha=Math.min(.55,(v-5)/6.5*.55);ctx.fillStyle="#fff";for(let j=0;j<3;j++){const y=gy-h*(.3+j*.17),len=h*(.4+.3*Math.sin(t*20+j));ctx.fillRect(sx-h*.35-len,y,len,Math.max(2,h*.02))}ctx.globalAlpha=1}
  drawRunner(ctx,LOOKS[p],pose,sx,gy,h,sq);
  // sand burst
  for(let i=0;i<PN;i++){const o=i*6;if(sand[o+5]<=0)continue;sand[o+4]+=dt;const a=sand[o+4];if(a>sand[o+5]){sand[o+5]=0;continue}
    sand[o]+=sand[o+2]*dt;sand[o+3]+=900*dt;sand[o+1]=Math.min(0,sand[o+1]+sand[o+3]*dt);
    ctx.globalAlpha=1-a/sand[o+5];ctx.fillStyle=i%3?"#E2B978":"#F3D49C";const px=worldX(V,sand[o],V.gy)+((i*13)%11-5);ctx.fillRect(px,V.gy+sand[o+1]-2,4,4)}
  ctx.globalAlpha=1;
  drawFront(ctx,V.cam*V.ppm/L.ppm);
}
// HUD: text only when it changes
const shown={gap:"",gapL:""};
function hud(){
  const x=A.r.x, toLine=LINE_M-x;
  let gtxt:string,gl:string;
  if(phase==="land"||phase==="air"){gtxt=phase==="land"?dec(A.take!.dist,2):"…";gl=tr("lj.metres")}
  else if(phase==="foul"){gtxt="X";gl=tr("lj.foulL")}
  else{gtxt=`${Math.max(0,Math.ceil(toLine))} m`;gl=tr("lj.toLineL")}
  if(gtxt!==shown.gap){shown.gap=gtxt;gapEl.textContent=gtxt}
  if(gl!==shown.gapL){shown.gapL=gl;gapL.textContent=gl}
  vEl.style.transform=`scaleX(${Math.min(1,A.r.v/V_MAX).toFixed(3)})`;
  dotEl.style.transform=`translateX(${(Math.min(1,Math.max(0,(phase==="air"?airFrom+airLen*Math.min(1,(performance.now()-phaseAt)/1000/airT):phase==="land"?landX:x)/(LINE_M+9)))*100).toFixed(1)}%)`;
  jumpEl.classList.toggle("on",phase==="run"&&toLine<ZONE_M+1.5&&toLine>-.2);
  runRoot.classList.toggle("is-foul",phase==="foul");
}
// what the TV board shows (cast.ts merges it over the rep-game state): 1-2 players = their best in cm;
// 3-4 players = the current jumper's best (the protocol has two score slots)
function tvState():Partial<ScreenState>{
  const {round,player:p}=cur(), done=phase==="off"&&!endRoot.classList.contains("hide");
  const running=phase==="run"||phase==="air"||phase==="land"||phase==="foul";
  const left=done?0:running?Math.max(0,LIMIT_S-(performance.now()-phaseAt)/1000):LIMIT_S;
  const cm=(i:number)=>Math.round((bestOf(jumps[i]||[])??0)*100);
  const live=phase==="land"&&A.take?` · ${mLabel(A.take.dist)}`:phase==="foul"?" · X":"";
  const r=rank(jumps);
  return {players:n===2?2:1,duration:LIMIT_S,left,round,mult:1,ex:{id:"longjump",name:done?tr("lj.title"):`${names0[p]} · ${round+1}/${ATTEMPTS}${live}`.slice(0,40)},
    score:n===2?[cm(0),cm(1)]:[cm(n===1?0:p),0],reps:jumps.flat().filter(d=>d!=null).length,
    winner:done&&n===2&&r[0].place===1&&r[1].place!==1?(r[0].i+1) as 1|2:0};
}

// ---------- results ----------
function finish(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  turnRoot.hidden=true;
  const h=loadHist();
  h.unshift({t:Date.now(),players:n,duration:Math.round((performance.now()-startedAt)/1000),ex:["longjump"],score:[0,0],reps:steps.slice(),mode:"longjump",jumps:jumps.map(j=>j.slice())});
  saveHist(h);
  const r=rank(jumps), top=r[0].best, winners=r.filter(x=>x.place===1);
  const newPb=top!=null&&top>pb;
  const head=$("#ljResHead"),win=$("#ljWin"),sub=$("#ljSub");
  const w=winners.length===1?winners[0].i:-1;
  if(top==null){win.textContent=tr("lj.allFoul");sub.textContent=tr("lj.allFoulSub")}
  else if(n===1){win.textContent=mLabel(top);sub.textContent=tr("lj.soloSub")}
  else if(w<0){win.textContent=tr("res.tie");sub.textContent=tr("lj.winSub",{d:dec(top,2)})}
  else{win.textContent=tr("lj.wins",{name:names0[w]});sub.textContent=tr("lj.winSub",{d:dec(top,2)})}
  head.style.setProperty("--c",top==null?"var(--ink)":TONE[w<0?r[0].i:w]);
  head.dataset.c=top==null?"ink":WHO[w<0?r[0].i:w];
  $("#ljResArt").innerHTML=mascot(WHO[w<0?r[0].i:w],top==null?"lose":w<0?"idle":"win",{anim:true});
  const rb=$("#ljRec");rb.hidden=!newPb;rb.textContent=tr(pb?"sp.newPb":"sp.firstPb");
  $("#ljRows").replaceChildren(...r.map((x,j)=>{
    const li=document.createElement("li");li.className="sp-row lj-row";li.style.setProperty("--i",String(j));li.style.setProperty("--tone",TONE[x.i]);li.style.setProperty("--tone-ink",TONE_INK[x.i]);
    const mood=n>1?(x.place===1?"happy":"sad"):undefined;
    const b=x.best;
    li.innerHTML=`<span class="sp-place d">${x.place??"–"}</span>${face(x.i,"sp-row-face",mood)}<span class="sp-row-txt"><b></b><ol class="lj-tries"></ol></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=names0[x.i];
    li.querySelector(".lj-tries")!.replaceChildren(...jumps[x.i].map((d,a)=>{const c=document.createElement("li");
      c.className=d==null?"x":d===b?"best":"";c.textContent=d==null?"X":dec(d,2);c.setAttribute("aria-label",`${tr("lj.attemptN",{n:a+1})}: ${d==null?tr("lj.foulL"):mLabel(d)}`);return c}));
    li.querySelector(".sp-row-t")!.textContent=b!=null?mLabel(b):"X";
    return li;
  }));
  runRoot.classList.add("hide");document.body.classList.remove("sprinting","longjumping");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
  sfx.finish();
}
$("#ljAgain").onclick=()=>{resetGame();go()};
$("#ljHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// test hooks (e2e / tools/longjump-check.cjs): state probe, synthetic cadence, a take-off now, skip the turn gate
(window as any).__lj={
  state:()=>({phase,k,n,player:cur().player,round:cur().round,x:A.r.x,v:A.r.v,t:A.t,why:A.why,jumps:jumps.map(j=>j.slice())}),
  feed:(cad:number)=>{feedCad=cad;feedAt=performance.now()}, // also ignores the camera's take-offs (the e2e camera does jumping jacks)
  jump:()=>{const now=performance.now();doJump(now,now)},
  ready:()=>{if(phase==="card")count(performance.now())},
  jumpAt:(x:number)=>{autoX=x}, // take off automatically once the runner reaches x m (-1 = never: the foul path)
};

export const LONGJUMP:GameMode={
  start:begin,
  tv:true,
  reset(){
    cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);callRoot.className="sp-call lj-call";
    setScreenMode(null);feedCad=0;autoX=-1;turnRoot.hidden=true;sand.fill(0);
    runRoot.classList.add("hide");endRoot.classList.add("hide");document.body.classList.remove("sprinting","longjumping");
  },
  shown:()=>!endRoot.classList.contains("hide")||(phase==="card"&&!runRoot.classList.contains("hide")),
};
