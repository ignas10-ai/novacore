// Šokių kova – šok ir sustink (11-05): music plays -> dance (points from movement), the music cuts -> freeze
// (moving = penalty, still = bonus, every 3rd freeze asks for a pose). 1-2 players, 60 s / 30 s.
// Flow (mirrors src/boxing): Rungtys tile -> #/sokiai (setup) -> startFlow(DANCE) -> #loading -> #ready (arms-up gate)
// -> DANCE.start(): "Pasiruošk… 3 2 1 Šok!" -> round -> "Laikas!" -> #danceEnd results (+ highlight clip).
// Rules are PURE in logic.ts; this file = screens, frame loop, HUD and the beat. The HUD reuses boxing's sticker
// classes (.bx-run/.bx-card/.bx-clock/.bx-edge from boxing.css) and the skeleton is the camera module's own drawing.
// Music: synthesized here with Web Audio (kick/snare/hat + bass, 120 BPM) – no audio files, no licences.
import "./dance.css";
import {gallery} from "../ui/gallery.ts";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import {sfx,ensureAudio,soundIsOn} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import type {Game as Row} from "../history/stats.ts";
import {$,setDigits} from "../ui/dom.ts";
import {t as tr} from "../i18n/i18n.ts";
import {mascot,avatar} from "../ui/mascots.ts";
import {startRec,finishClips,openClips} from "../clips/clips.ts";
import {highlightSegments} from "../clips/highlight.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import {partyActive,partyLegDone} from "../party/bus.ts";
import type {PartyLegCfg} from "../party/logic.ts";
import type {ScreenState} from "../cast/room.ts";
import {newDance,update,winner,pts,HOLD_PTS,POSE_PTS,type Dance,type Ev,type PoseId} from "./logic.ts";

const NAMES=[tr("p.red"),tr("p.blue")];
const DEF_NAMES=[...NAMES];
const READY_S=1.2, BEAT_S=0.7, END_S=1.7;
const face=(i:number,cls="",mood?:"happy"|"sad")=>`<span class="${cls}">${avatar(i?"b":"r",mood)}</span>`;
// pose stick figures (64×80 box): head, torso, legs + the pose's arms
const ARMS:Record<PoseId,string>={up:"M24 30 16 6M40 30 48 6",plane:"M24 30H4M40 30H60",hips:"M24 30 14 42 24 50M40 30 50 42 40 50"};
const fig=(p:PoseId)=>`<svg class="dc-fig" viewBox="0 0 64 80" aria-hidden="true"><circle cx="32" cy="14" r="8"/><path d="M32 22V52M24 30H40M32 52 22 76M32 52 42 76 ${ARMS[p]}"/></svg>`;

// ---------- markup (built here, the shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile dc-tile tap";tile.href="#/sokiai";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("dc.title")}</b><small>${tr("dc.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true">${mascot("r","win",{anim:true})}${mascot("b","win",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".bx-tile")??document.querySelector(".sp-tile")??document.getElementById("rankCard"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="dance" aria-labelledby="dcTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="dcTitle" tabindex="-1">${tr("dc.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    ${gallery("dc",tr("dc.title").toUpperCase(),tr("dc.hero"))}
    <section class="pick" aria-label="${tr("dc.dancers")}">
      <div class="seg sp-seg" role="group" aria-label="${tr("dc.dancers")}">
        <button data-dc="2" aria-pressed="true"><span><b class="d">2</b><small>${tr("mode.duel")}</small></span></button>
        <button data-dc="1" aria-pressed="false"><span><b class="d">1</b><small>${tr("mode.solo")}</small></span></button>
      </div>
    </section>
    <section class="pick" aria-label="${tr("dc.len")}">
      <div class="seg sp-seg" role="group" aria-label="${tr("dc.len")}">
        <button data-dcd="60" aria-pressed="true"><span><b class="d">60 s</b><small>${tr("bx.long")}</small></span></button>
        <button data-dcd="30" aria-pressed="false"><span><b class="d">30 s</b><small>${tr("bx.short")}</small></span></button>
      </div>
    </section>
    <div class="card sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("sp.pb")}</small><b class="d" id="dcPb">–</b><p class="help" id="dcPbTxt"></p></div></div>
    <ul class="bx-legend dc-legend" aria-label="${tr("dc.how")}">
      <li><span class="dc-lg-ic" data-icon="music-notes"></span><b class="d">+</b><span>${tr("dc.lgDance")}</span></li>
      <li><span class="dc-lg-ic">${fig("hips")}</span><b class="d">+${HOLD_PTS}</b><span>${tr("dc.lgHold")}</span></li>
      <li><span class="dc-lg-ic">${fig("up")}</span><b class="d">+${POSE_PTS}</b><span>${tr("dc.lgPose")}</span></li>
    </ul>
    <section class="card sp-how" aria-labelledby="dcHowT">
      <h2 class="card-title" id="dcHowT">${tr("dc.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("dc.how1")}</span></li>
        <li><span data-icon="music-notes"></span><span>${tr("dc.how2")}</span></li>
        <li><span data-icon="zap"></span><span>${tr("dc.how3")}</span></li>
      </ol>
    </section>
    <div class="cta">
      <button class="go tap" id="dcGo" type="button"><span>${tr("dc.toFloor")}</span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
const card=(i:number)=>`<div class="bx-card p${i+1}" id="dcC${i+1}">${face(i,"bx-face")}<div class="bx-card-in"><b class="d bx-sc t-digit-group" id="dcS${i+1}">0</b><span class="dc-meter" role="meter" aria-label="${tr("dc.energy")}" aria-valuemin="0" aria-valuemax="100"><i id="dcE${i+1}"></i></span></div></div>`;
document.body.insertAdjacentHTML("beforeend",`
<div class="bx-run dc-run hide" id="danceRun" role="img" aria-label="${tr("dc.floor")}">
  <div class="bx-top">
    ${card(0)}
    <div class="bx-clock"><span class="d" id="dcT">1:00</span><span class="bx-bar"><i id="dcBar"></i></span></div>
    ${card(1)}
    <div class="bx-card bx-pbc" id="dcPbC"><span class="bx-face bx-tro" data-icon="trophy"></span><div class="bx-card-in"><b class="d bx-sc" id="dcPbN">0</b><span class="bx-combo on">${tr("dc.best")}</span></div></div>
  </div>
  <span class="bx-edge p1" id="dcE1f"></span><span class="bx-edge p2" id="dcE2f"></span>
  <span class="dc-tag p1" id="dcTag1"></span><span class="dc-tag p2" id="dcTag2"></span>
  <div class="dc-pose" id="dcPose" hidden><span id="dcPoseFig"></span><span><small>${tr("dc.poseSub")}</small><b class="d" id="dcPoseName"></b></span></div>
  <div class="sp-call bx-call" id="dcCall" aria-live="assertive"><b class="d" id="dcCallT"></b><small id="dcCallS"></small></div>
</div>
<section class="screen hide" id="danceEnd" aria-labelledby="dcWin">
  <div class="wrap">
    <header class="sp-res-head bx-res-head" id="dcResHead">
      <span class="sp-res-art" id="dcResArt" aria-hidden="true"></span>
      <span class="wl" id="dcResWl">${tr("dc.title")}</span>
      <h2 class="d" id="dcWin"></h2>
      <p id="dcSub"></p>
      <span class="rec-badge" id="dcRec" hidden>${tr("dc.newPb")}</span>
    </header>
    <ol class="sp-rows" id="dcRows" aria-label="${tr("dc.results")}"></ol>
    <div class="cta">
      <button class="go" id="dcAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("app.again")}</button>
      <button class="go alt clip-btn" id="dcClip" type="button"><span class="clip-ic" data-icon="play"></span><span class="clip-txt"><b class="d">${tr("res.clip")}</b><small>${tr("dc.clipSub")}</small></span><span data-icon="arrow-right"></span></button>
      <button class="go alt" id="dcHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#danceRun"), endRoot=$("#danceEnd"), callRoot=$("#dcCall"), callT=$("#dcCallT"), callS=$("#dcCallS");
const clock=$("#dcT"), bar=$("#dcBar"), scEl=[$("#dcS1"),$("#dcS2")], enEl=[$("#dcE1"),$("#dcE2")];
const edgeEl=[$("#dcE1f"),$("#dcE2f")], tagEl=[$("#dcTag1"),$("#dcTag2")], poseEl=$("#dcPose");

// ---------- the beat: 16 steps of 16th notes at 120 BPM; a fresh bus per dance part, so a cut silences queued notes ----------
const STEP=60/120/4, BASS=[45,0,45,57,48,0,45,0,43,0,43,55,48,0,50,52];
let bus:GainNode|null=null, nextAt=0, stepN=0, noiseBuf:AudioBuffer|null=null;
const hz=(m:number)=>440*2**((m-69)/12);
function voice(ac:AudioContext,t:number,dur:number,gain:number,src:AudioScheduledSourceNode,filter?:BiquadFilterNode){
  const g=ac.createGain();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  (filter?src.connect(filter):src).connect(g).connect(bus!);src.start(t);src.stop(t+dur+.02);
}
function noiseSrc(ac:AudioContext){
  if(!noiseBuf){const n=ac.sampleRate*.3;noiseBuf=ac.createBuffer(1,n,ac.sampleRate);const d=noiseBuf.getChannelData(0);for(let k=0;k<n;k++)d[k]=Math.random()*2-1}
  const s=ac.createBufferSource();s.buffer=noiseBuf;return s;
}
function hit(ac:AudioContext,s:number,t:number){
  if(s%4===0){const o=ac.createOscillator();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);voice(ac,t,.25,.9,o)}
  if(s%8===4){const f=ac.createBiquadFilter();f.type="highpass";f.frequency.value=1200;voice(ac,t,.16,.4,noiseSrc(ac),f)}
  if(s%2===1){const f=ac.createBiquadFilter();f.type="highpass";f.frequency.value=7000;voice(ac,t,.04,.14,noiseSrc(ac),f)}
  const m=BASS[s];if(m){const o=ac.createOscillator();o.type="sawtooth";o.frequency.value=hz(m);const f=ac.createBiquadFilter();f.type="lowpass";f.frequency.value=700;voice(ac,t,STEP*1.8,.22,o,f)}
}
function musicOn(){
  const ac=ensureAudio();if(!ac||!soundIsOn())return;
  musicOff();bus=ac.createGain();bus.gain.value=.55;bus.connect(ac.destination);nextAt=ac.currentTime+.05;stepN=0;
}
function musicOff(){
  if(!bus)return;
  const b=bus,ac=b.context;b.gain.cancelScheduledValues(ac.currentTime);b.gain.setValueAtTime(0,ac.currentTime);bus=null;
  setTimeout(()=>b.disconnect(),500);
}
function musicPump(){
  if(!bus)return;
  const ac=bus.context as AudioContext;
  while(nextAt<ac.currentTime+.12){hit(ac,stepN%16,nextAt);nextAt+=STEP;stepN++}
}

// ---------- history: dance rows in novacore.history (mode "dance"; points in pts, score stays [0,0]) ----------
const bestPts=(h:Row[],dur:number)=>h.reduce((m,g)=>g.mode==="dance"&&g.duration===dur?Math.max(m,...(g.pts||[0]).slice(0,g.players)):m,0);

// ---------- setup ----------
let dur=60;
try{dur=localStorage.getItem("novacore.dcDur")==="30"?30:60}catch(e){}
const pBtns=[...document.querySelectorAll<HTMLElement>("[data-dc]")], dBtns=[...document.querySelectorAll<HTMLElement>("[data-dcd]")];
function syncSeg(){
  pBtns.forEach(b=>{const on=Number(b.dataset.dc)===S.players;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  dBtns.forEach(b=>{const on=Number(b.dataset.dcd)===dur;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
}
pBtns.forEach(b=>b.onclick=()=>{
  document.querySelector<HTMLElement>(`[data-p="${b.dataset.dc}"]`)?.click(); // same state as the rep game's setup
  if(S.players!==Number(b.dataset.dc))S.players=Number(b.dataset.dc);
  syncSeg();renderPb();
});
dBtns.forEach(b=>b.onclick=()=>{dur=Number(b.dataset.dcd);try{localStorage.setItem("novacore.dcDur",String(dur))}catch(e){}syncSeg();renderPb()});
function renderPb(){
  const b=bestPts(loadHist(),dur);
  $("#dcPb").textContent=b?tr("u.pts",{n:b}):"–";
  $("#dcPbTxt").textContent=b?tr("dc.pbTxt",{n:dur}):tr("dc.pbNone");
}
onView("dance",()=>{syncSeg();renderPb()});
$("#dcGo").onclick=()=>startFlow(DANCE);

// ---------- round ----------
type Phase="off"|"count"|"play"|"end";
let phase:Phase="off", phaseAt=0, t0=0, raf=0, hudAt=0, callTimer=0, lastPs:unknown=null;
let G:Dance=newDance(1,16/9,60), solo=true, pb=0, beat=-1, shownSec=-1, hadRec=false, lastSec=0, secPts=0;
const shownSc=["",""], tagTimer=[0,0];
const evLog:{t:number;points:number}[]=[];
(window as any).__danceState=()=>({phase,t:G.t,dance:G.phase,freezes:G.freezes,pose:G.pose,p:G.p.slice(0,G.players).map(P=>({score:pts(P),energy:+P.energy.toFixed(2),motion:+P.motion.toFixed(1),held:P.held,moved:P.moved,poses:P.poses}))});

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call bx-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function tag(p:number,txt:string,kind:string){
  const el=tagEl[solo?0:p];el.textContent=txt;el.dataset.k=kind;el.classList.remove("on");void el.offsetWidth;el.classList.add("on");
  clearTimeout(tagTimer[p]);tagTimer[p]=setTimeout(()=>el.classList.remove("on"),1100);
  const ed=edgeEl[solo?0:p];ed.dataset.k=kind==="bad"?"bomb":kind==="gold"?"gold":"hit";ed.classList.remove("on");void ed.offsetWidth;ed.classList.add("on");
}
const fmtClock=(s:number)=>`${Math.floor(s/60)}:${String(Math.max(0,Math.ceil(s))%60).padStart(2,"0")}`.replace(/^0:60$/,"1:00");

function begin(){
  solo=S.players===1;
  const ar=(detCv.width/detCv.height)||(cv.width/cv.height)||16/9;
  G=newDance(S.players,ar,dur);
  evLog.length=0;beat=-1;shownSec=-1;hadRec=false;lastSec=0;secPts=0;shownSc[0]=shownSc[1]="";
  pb=bestPts(loadHist(),dur);
  runRoot.classList.remove("hide");runRoot.classList.toggle("solo",solo);runRoot.classList.remove("freeze");delete runRoot.dataset.lead;
  $("#dcPbN").textContent=String(pb);
  scEl.forEach(e=>{e.textContent="0"});enEl.forEach(e=>{e.style.transform="scaleX(0)"});poseEl.hidden=true;
  clock.textContent=fmtClock(dur);bar.style.transform="scaleX(1)";
  document.body.classList.add("dance");
  setScreenMode(tvState); // the TV board shows the dance energy/STOP state (src/cast)
  S.running=true; // game.ts swallows Android back while running
  phase="count";phaseAt=performance.now();
  call(tr("dc.getReady"),tr("dc.readySub"));sfx.tick();
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}

function frame(now:number){
  raf=requestAnimationFrame(frame);
  const ps=sampleCamera(now);
  const fresh=!!ps&&ps!==lastPs;
  if(ps){lastPs=ps;for(let i=0;i<ps.length;i++)draw(ps[i].lm,i)}
  const tp=(now-phaseAt)/1000;
  if(phase==="count"){
    const k=Math.floor((tp-READY_S)/BEAT_S);
    if(tp>=READY_S&&k!==beat){
      beat=k;
      if(k<3){call(String(3-k),"","is-num");sfx.tick()}
      else{call(tr("dc.go"),"","is-go",900);startRound(now)}
    }
  }else if(phase==="play"){
    const t=(now-t0)/1000;
    const before=G.p.reduce((s,P)=>s+P.score,0);
    for(const e of update(G,Math.min(t,dur),fresh?ps!.map(p=>p.lm):null))onEv(e);
    secPts+=G.p.reduce((s,P)=>s+P.score,0)-before;
    if(Math.floor(t)>lastSec){evLog.push({t:lastSec,points:Math.max(0,Math.round(secPts))});lastSec=Math.floor(t);secPts=0}
    musicPump();
    if(t>=dur)endRound(now);
  }else if(phase==="end"&&tp>END_S){finishRound();return}
  if(now-hudAt>80){hudAt=now;hud(now)}
}
function startRound(now:number){
  phase="play";t0=now;phaseAt=now;
  if(!partyActive())startRec(); // party legs do not record clips
  S.lastRecDrawAt=now;hadRec=!!S.rec;S.t0=now;
  musicOn();
  screenPhase("play");
}
function endRound(now:number){
  phase="end";phaseAt=now;musicOff();
  runRoot.classList.remove("freeze");poseEl.hidden=true;
  call(tr("dc.time"),"","is-go");sfx.bell();
}
function onEv(e:Ev){
  if(e.type==="freeze"){
    musicOff();runRoot.classList.add("freeze");sfx.horn();
    if(e.pose){$("#dcPoseFig").innerHTML=fig(e.pose);$("#dcPoseName").textContent=tr(`dc.pose.${e.pose}`);poseEl.hidden=false}
    call(tr("dc.stop"),e.pose?"":tr("dc.stopSub"),"is-go dc-stop");
  }else if(e.type==="resume"){
    runRoot.classList.remove("freeze");poseEl.hidden=true;musicOn();
    call(tr("dc.go"),"","is-go",700);
  }else if(e.type==="moved"){tag(e.p,tr("dc.moved"),"bad");sfx.miss()}
  else if(e.type==="held"){tag(e.p,tr("dc.held",{n:e.pts}),"ok");sfx.punch(e.p)}
  else if(e.type==="pose"){tag(e.p,tr("dc.poseOk",{n:e.pts}),"gold");sfx.gold()}
}
function hud(now:number){
  const left=phase==="play"?Math.max(0,dur-(now-t0)/1000):phase==="end"?0:dur, sec=Math.ceil(left);
  if(sec!==shownSec){shownSec=sec;clock.textContent=fmtClock(sec);runRoot.classList.toggle("last",phase==="play"&&sec<=10);if(phase==="play"&&sec>0&&sec<=5)sfx.tick()}
  bar.style.transform=`scaleX(${(left/dur).toFixed(3)})`;
  for(let i=0;i<G.players;i++){
    const v=String(pts(G.p[i]));if(v!==shownSc[i]){shownSc[i]=v;setDigits(scEl[i],v)}
    enEl[i].style.transform=`scaleX(${G.p[i].energy.toFixed(2)})`;
    enEl[i].parentElement!.setAttribute("aria-valuenow",String(Math.round(G.p[i].energy*100)));
  }
  if(!solo)runRoot.dataset.lead=String(winner(G));
}

// ---------- results ----------
function finishRound(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  if(hadRec)finishClips(highlightSegments(evLog,dur,4,12,1),dur);
  const h=loadHist(),n=G.players,P=G.p.slice(0,n), score=[0,1].map(i=>i<n?pts(G.p[i]):0);
  h.unshift({t:Date.now(),players:n,duration:dur,ex:["dance"],score:[0,0],reps:[0,1].map(i=>i<n?G.p[i].held:0),mode:"dance",pts:score});
  saveHist(h);
  if(partyActive()){
    runRoot.classList.add("hide");
    document.body.classList.remove("dance");
    screenPhase("done");
    partyLegDone();
    return;
  }
  const top=Math.max(...score.slice(0,n)), newPb=top>0&&top>pb, w=winner(G), head=$("#dcResHead");
  $("#dcResWl").textContent=`${tr("dc.title")} · ${dur} s`;
  if(solo){
    $("#dcWin").textContent=tr("u.pts",{n:score[0]});
    $("#dcSub").textContent=pb&&!newPb?tr("dc.prevPb",{n:pb}):tr("dc.heldN",{n:P[0].held,m:G.freezes});
    head.dataset.w=newPb?"1":"0";
    $("#dcResArt").innerHTML=mascot("r",newPb||score[0]>0?"win":"lose",{anim:true});
  }else{
    $("#dcWin").textContent=w?tr("dc.wins",{name:NAMES[w-1]}):tr("res.tie");
    $("#dcSub").textContent=w?tr("dc.gap",{n:Math.abs(score[0]-score[1])}):tr("u.pts",{n:score[0]});
    head.dataset.w=String(w);
    $("#dcResArt").innerHTML=mascot(w===2?"b":"r",w?"win":"idle",{anim:true});
  }
  const rb=$("#dcRec");rb.hidden=!newPb;rb.textContent=tr(pb?"dc.newPb":"dc.firstPb");
  const order=[...Array(n).keys()].sort((a,b)=>score[b]-score[a]);
  $("#dcRows").replaceChildren(...order.map((i,k)=>{
    const Q=G.p[i],li=document.createElement("li");
    li.className=`sp-row p${i+1}`;li.style.setProperty("--i",String(k));
    li.innerHTML=`<span class="sp-place d">${n>1&&score[0]===score[1]?"=":k+1}</span>${face(i,"sp-row-face",n===2&&w?(w-1===i?"happy":"sad"):undefined)}<span class="sp-row-txt"><b></b><small></small></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=`${NAMES[i]}${n===2?` · P${i+1}`:""}`;
    li.querySelector(".sp-row-txt small")!.textContent=[tr("dc.heldN",{n:Q.held,m:G.freezes}),...(Q.poses?[tr("dc.posesN",{n:Q.poses})]:[])].join(" · ");
    li.querySelector(".sp-row-t")!.textContent=tr("u.pts",{n:score[i]});
    return li;
  }));
  $("#dcClip").hidden=!hadRec;
  runRoot.classList.add("hide");document.body.classList.remove("dance");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
}
$("#dcAgain").onclick=()=>{resetGame();startFlow(DANCE)};
$("#dcHome").onclick=()=>{resetGame();document.body.classList.remove("ingame");home()};
$("#dcClip").onclick=()=>{endRoot.classList.add("hide");openClips()};

// what the TV board shows (cast.ts merges it over the rep-game state): live energy bars, the STOP/pose card, points
function tvState():Partial<ScreenState>{
  const now=performance.now(),on=phase==="play"||phase==="end",done=phase==="off"&&!endRoot.classList.contains("hide");
  return {
    duration:dur,
    left:on?Math.max(0,dur-(now-t0)/1000):done?0:dur,
    round:G.freezes,
    mult:1,
    ex:{id:"dance",name:tr("dc.title")},
    score:[pts(G.p[0]),G.players>1?pts(G.p[1]):0] as [number,number],
    reps:G.p.slice(0,G.players).reduce((n,P)=>n+P.held,0),
    energy:[G.p[0].energy,G.p[1].energy] as [number,number],
    stop:phase==="play"&&G.phase==="freeze",
    pose:phase==="play"&&G.phase==="freeze"?G.pose:null,
    winner:done?winner(G):0,
  };
}

export const DANCE:GameMode={
  start:begin,
  tv:true,
  party(cfg:PartyLegCfg){S.players=2;dur=30;NAMES[0]=cfg.names[0];NAMES[1]=cfg.names[1]}, // two reps, 30 s series rounds
  partyMusic:false, // Dance Clash has its own synthesized beat (the freeze depends on it)
  reset(){NAMES[0]=DEF_NAMES[0];NAMES[1]=DEF_NAMES[1];cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);callRoot.className="sp-call bx-call";musicOff();lastPs=null;
    setScreenMode(null);screenPhase("idle");delete runRoot.dataset.lead;
    runRoot.classList.add("hide");runRoot.classList.remove("freeze");endRoot.classList.add("hide");document.body.classList.remove("dance")},
  shown:()=>!endRoot.classList.contains("hide"),
};
