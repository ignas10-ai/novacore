// Boksas – daužyk taikinius: pads pop up around each player (P1 red left half, P2 blue right half, solo = the whole
// frame); punch them fast, dodge the bombs, gold = ×3, hits in a row grow the multiplier. 60 s (or 30 s) round.
// Flow (mirrors src/sprint): Pradžia tile -> #/boksas (setup) -> startFlow(BOXING) -> #loading -> #ready (arms-up gate,
// game.ts) -> BOXING.start(): "Pasiruošk… 3 2 1 Kova!" -> round -> "Laikas!" -> #boxEnd results (+ highlight clip).
// The rules are PURE in logic.ts (unit tests); this file is the screens, the frame loop and the drawing. Pads and effects
// are drawn on #bxCv, a canvas laid over the camera canvas #cv inside #stage with the same aspect + object-fit, so
// frame coordinates map 1:1 without measuring the letterbox.
import "./boxing.css";
import {gallery} from "../ui/gallery.ts";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import type {Lm} from "../detect/classifier.ts";
import {sfx} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons,icon} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import type {Game as Row} from "../history/stats.ts";
import {$,replay,setDigits} from "../ui/dom.ts";
import {t as tr,tn} from "../i18n/i18n.ts";
import {mascot,avatar} from "../ui/mascots.ts";
import {startRec,finishClips,openClips} from "../clips/clips.ts";
import {highlightSegments} from "../clips/highlight.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import type {ScreenState} from "../cast/room.ts";
import {newGame,update,assign,fist,accuracy,winner,multOf,MIN_SPEED,ARM_S,type Game,type Ev,type Kind,type Target} from "./logic.ts";

const NAMES=[tr("p.red"),tr("p.blue")];
const INK="#14183A", TONE=["#FF3B3B","#2F6BFF"], GOLD="#FFC61A";
const READY_S=1.2, BEAT_S=0.7, END_S=1.7;
const reduced=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const face=(i:number,cls="",mood?:"happy"|"sad")=>`<span class="${cls}">${avatar(i?"b":"r",mood)}</span>`;
// glove icon (24×24 box): cuff, fist, thumb. Used by the DOM pads and, as Path2D, on the canvas
const GLOVE="M8 18.2h9.5v3.6H8z M9.2 3.5h6.3a5.5 5.5 0 0 1 5.5 5.5v4.6a5.4 5.4 0 0 1-5.4 5.4H10a4.5 4.5 0 0 1-4.5-4.5V7.2a3.7 3.7 0 0 1 3.7-3.7z M8.6 9H4.6a2.5 2.5 0 0 0 0 5h4z";
const STAR="M0 -10 2.9 -4 9.5 -3.1 4.7 1.5 5.9 8.1 0 5 -5.9 8.1 -4.7 1.5 -9.5 -3.1 -2.9 -4Z";
function padSvg(kind:Kind,tone=TONE[0]){
  const inner=kind==="gold"?`<circle r="34" fill="${GOLD}"/><path d="${STAR}" transform="scale(2.6)" fill="#fff" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
    :`<circle r="34" fill="${tone}"/><circle r="25" fill="none" stroke="#fff" stroke-width="3" opacity=".55"/><path d="${GLOVE}" transform="translate(-18.6 -20.2) scale(1.6)" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  if(kind==="bomb")return `<svg class="bx-pad bomb" viewBox="-50 -56 100 106" aria-hidden="true"><circle cy="5" r="40" fill="${INK}" stroke="${INK}" stroke-width="6"/><ellipse cx="-14" cy="-10" rx="11" ry="7" transform="rotate(-30 -14 -10)" fill="#fff" opacity=".35"/>`
    +`<rect x="10" y="-40" width="18" height="14" rx="3" transform="rotate(35 19 -33)" fill="#4A4F6E" stroke="${INK}" stroke-width="4"/><path d="M25 -40q8-10 18-6" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`
    +`<path d="${STAR}" transform="translate(44 -46) scale(1.1)" fill="${GOLD}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M-12 -6 12 18M12 -6 -12 18" stroke="${TONE[0]}" stroke-width="7" stroke-linecap="round"/></svg>`;
  return `<svg class="bx-pad ${kind}" viewBox="-50 -50 100 100" aria-hidden="true"><circle cy="5" r="46" fill="${INK}"/><circle r="46" fill="#fff" stroke="${INK}" stroke-width="6"/>${inner}</svg>`;
}

// ---------- markup (built here, the shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile bx-tile tap";tile.href="#/boksas";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("bx.title")}</b><small>${tr("bx.tileSub")}</small></span>
<span class="sp-tile-art bx-tile-art" aria-hidden="true">${mascot("r","guard",{anim:true})}${padSvg("hit")}${mascot("b","punch",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".sp-tile")??document.getElementById("rankCard")??document.querySelector("#home .col:last-child"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="boxing" aria-labelledby="bxTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="bxTitle" tabindex="-1">${tr("bx.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    ${gallery("bx",tr("bx.title").toUpperCase(),tr("bx.hero"))}
    <section class="pick" aria-label="${tr("setup.players")}">
      <div class="seg sp-seg" role="group" aria-label="${tr("bx.boxers")}">
        <button data-bx="2" aria-pressed="true"><span><b class="d">2</b><small>${tr("mode.duel")}</small></span></button>
        <button data-bx="1" aria-pressed="false"><span><b class="d">1</b><small>${tr("mode.solo")}</small></span></button>
      </div>
    </section>
    <section class="pick" aria-label="${tr("bx.len")}">
      <div class="seg sp-seg" role="group" aria-label="${tr("bx.len")}">
        <button data-bxd="60" aria-pressed="true"><span><b class="d">60 s</b><small>${tr("bx.long")}</small></span></button>
        <button data-bxd="30" aria-pressed="false"><span><b class="d">30 s</b><small>${tr("bx.short")}</small></span></button>
      </div>
    </section>
    <div class="card sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("sp.pb")}</small><b class="d" id="bxPb">–</b><p class="help" id="bxPbTxt"></p></div></div>
    <ul class="bx-legend" aria-label="${tr("bx.how")}">
      <li>${padSvg("hit")}<b class="d">+10</b><span>${tr("bx.lgHit")}</span></li>
      <li>${padSvg("gold")}<b class="d">+30</b><span>${tr("bx.lgGold")}</span></li>
      <li>${padSvg("bomb")}<b class="d">−15</b><span>${tr("bx.lgBomb")}</span></li>
    </ul>
    <section class="card sp-how" aria-labelledby="bxHowT">
      <h2 class="card-title" id="bxHowT">${tr("bx.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("bx.how1")}</span></li>
        <li><span data-icon="timer"></span><span>${tr("bx.how2")}</span></li>
        <li><span data-icon="zap"></span><span>${tr("bx.how3")}</span></li>
      </ol>
    </section>
    <div class="cta">
      <button class="go tap" id="bxGo" type="button"><span>${tr("bx.toRing")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
const card=(i:number)=>`<div class="bx-card p${i+1}" id="bxC${i+1}">${face(i,"bx-face")}<div class="bx-card-in"><b class="d bx-sc t-digit-group" id="bxS${i+1}">0</b><span class="bx-combo" id="bxK${i+1}"></span></div></div>`;
const masc=(i:number)=>`<div class="bx-mas p${i+1}" id="bxM${i+1}" aria-hidden="true"><span class="bx-guard">${mascot(i?"b":"r","guard",{anim:true})}</span><span class="bx-punch">${mascot(i?"b":"r","punch")}</span></div>`;
document.body.insertAdjacentHTML("beforeend",`
<div class="bx-run hide" id="boxRun">
  <div class="bx-top">
    ${card(0)}
    <div class="bx-clock"><span class="d" id="bxT">1:00</span><span class="bx-bar"><i id="bxBar"></i></span></div>
    ${card(1)}
    <div class="bx-card bx-pbc" id="bxPbC"><span class="bx-face bx-tro" data-icon="trophy"></span><div class="bx-card-in"><b class="d bx-sc" id="bxPbN">0</b><span class="bx-combo on">${tr("bx.best")}</span></div></div>
  </div>
  <span class="bx-edge p1" id="bxE1"></span><span class="bx-edge p2" id="bxE2"></span>
  ${masc(0)}${masc(1)}
  <div class="sp-call bx-call" id="bxCall" aria-live="assertive"><b class="d" id="bxCallT"></b><small id="bxCallS"></small></div>
</div>
<section class="screen hide" id="boxEnd" aria-labelledby="bxWin">
  <div class="wrap">
    <header class="sp-res-head bx-res-head" id="bxResHead">
      <span class="sp-res-art" id="bxResArt" aria-hidden="true"></span>
      <span class="wl" id="bxResWl">${tr("bx.title")}</span>
      <h2 class="d" id="bxWin"></h2>
      <p id="bxSub"></p>
      <span class="rec-badge" id="bxRec" hidden>${tr("bx.newPb")}</span>
    </header>
    <ol class="sp-rows" id="bxRows" aria-label="${tr("bx.results")}"></ol>
    <div class="cta">
      <button class="go" id="bxAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("app.again")}</button>
      <button class="go alt clip-btn" id="bxClip" type="button"><span class="clip-ic" data-icon="play"></span><span class="clip-txt"><b class="d">${tr("res.clip")}</b><small>${tr("bx.clipSub")}</small></span><span data-icon="arrow-right"></span></button>
      <button class="go alt" id="bxHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);
const ov=document.createElement("canvas");ov.id="bxCv";ov.setAttribute("role","img");ov.setAttribute("aria-label",tr("bx.ring"));
$("#stage").append(ov);
const oc=ov.getContext("2d")!;
const GLOVE_P=new Path2D(GLOVE), STAR_P=new Path2D(STAR);

const runRoot=$("#boxRun"), endRoot=$("#boxEnd"), callRoot=$("#bxCall"), callT=$("#bxCallT"), callS=$("#bxCallS");
const clock=$("#bxT"), bar=$("#bxBar"), scEl=[$("#bxS1"),$("#bxS2")], kEl=[$("#bxK1"),$("#bxK2")], cardEl=[$("#bxC1"),$("#bxC2")];
const edgeEl=[$("#bxE1"),$("#bxE2")], masEl=[$("#bxM1"),$("#bxM2")];

// ---------- history: boxing rows in novacore.history (mode "boxing"; points in pts, score stays [0,0]) ----------
const bestPts=(h:Row[],dur:number)=>h.reduce((m,g)=>g.mode==="boxing"&&g.duration===dur?Math.max(m,...(g.pts||[0]).slice(0,g.players)):m,0);

// ---------- setup ----------
let dur=60;
try{dur=localStorage.getItem("novacore.bxDur")==="30"?30:60}catch(e){}
const pBtns=[...document.querySelectorAll<HTMLElement>("[data-bx]")], dBtns=[...document.querySelectorAll<HTMLElement>("[data-bxd]")];
function syncSeg(){
  pBtns.forEach(b=>{const on=Number(b.dataset.bx)===S.players;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  dBtns.forEach(b=>{const on=Number(b.dataset.bxd)===dur;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
}
pBtns.forEach(b=>b.onclick=()=>{
  document.querySelector<HTMLElement>(`[data-p="${b.dataset.bx}"]`)?.click(); // same state as the rep game's setup
  if(S.players!==Number(b.dataset.bx))S.players=Number(b.dataset.bx);
  syncSeg();renderPb();
});
dBtns.forEach(b=>b.onclick=()=>{dur=Number(b.dataset.bxd);try{localStorage.setItem("novacore.bxDur",String(dur))}catch(e){}syncSeg();renderPb()});
function renderPb(){
  const b=bestPts(loadHist(),dur);
  $("#bxPb").textContent=b?tr("u.pts",{n:b}):"–";
  $("#bxPbTxt").textContent=b?tr("bx.pbTxt",{n:dur}):tr("bx.pbNone");
}
onView("boxing",()=>{syncSeg();renderPb()});
$("#bxGo").onclick=()=>startFlow(BOXING);

// ---------- round state ----------
type Phase="off"|"count"|"play"|"end";
let phase:Phase="off", phaseAt=0, t0=0, raf=0, hudAt=0, callTimer=0, lastPs:unknown=null, curLm:(Lm[]|null)[]=[null,null];
let G:Game=newGame(1,16/9,60), solo=true, pb=0, beat=-1, shownSec=-1, hadRec=false;
const shownSc=["",""], shownK=["",""], masTimer=[0,0];
const evLog:{t:number;points:number}[]=[];
// effects (frame-height units; drawn in canvas px = units × canvas height)
interface Fx{x:number;y:number;at:number;kind:string;p:number;r:number;txt?:string;tg?:Target}
let fx:Fx[]=[];
const PN=160, part=new Float32Array(PN*8); let partN=0; // x, y, vx, vy, age, life, size, colour
const PCOL=["#FFFFFF",GOLD,TONE[0],TONE[1],INK,"#A3A7C8"];
// frame timing for the headless report (window.__boxPerf) + a state probe for tools/boxing-check.cjs
const FT=new Float32Array(600); let fn=0, lastFrame=0;
(window as any).__boxPerf=()=>{const n=Math.min(fn,600);if(!n)return null;const a=[...FT.slice(0,n)].sort((x,y)=>x-y),avg=a.reduce((s,v)=>s+v,0)/n;
  return {frames:fn,fps:Math.round(1000/avg*10)/10,p95FrameMs:Math.round(a[Math.floor(n*.95)]*10)/10}};
(window as any).__boxState=()=>({phase,t:G.t,players:G.players,p:G.p.slice(0,G.players).map(P=>({score:P.score,hits:P.hits,misses:P.misses,bombs:P.bombs,combo:P.combo,best:P.best,targets:P.targets.length}))});

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call bx-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}

// overlay canvas: same aspect as #cv (object-fit:contain on both), at most 720 px tall
function syncSize(){
  if(!cv.width||!cv.height)return false;
  const k=Math.min(1,720/cv.height),w=Math.round(cv.width*k),h=Math.round(cv.height*k);
  if(ov.width!==w||ov.height!==h){ov.width=w;ov.height=h;topBand()}
  return true;
}
// frame band under the HUD top bar (no pads up there): screen px -> frame units through the contain letterbox
function topBand(){
  const r=ov.getBoundingClientRect(),hud=$(".bx-top").getBoundingClientRect();
  if(!r.width||!ov.width)return;
  const sc=Math.min(r.width/ov.width,r.height/ov.height),boxH=ov.height*sc,y0=r.top+(r.height-boxH)/2;
  G.top=Math.min(.3,Math.max(0,(hud.bottom+6-y0)/boxH));
}
addEventListener("resize",()=>{if(phase!=="off")topBand()});

function begin(){
  solo=S.players===1;
  const ar=(detCv.width/detCv.height)||(cv.width/cv.height)||16/9;
  G=newGame(S.players,ar,dur);
  fx=[];part.fill(0);partN=0;evLog.length=0;beat=-1;shownSec=-1;hadRec=false;
  shownSc[0]=shownSc[1]=shownK[0]=shownK[1]="";
  pb=bestPts(loadHist(),dur);
  runRoot.classList.remove("hide");runRoot.classList.toggle("solo",solo);
  $("#bxPbN").textContent=String(pb);
  scEl.forEach(e=>{e.textContent="0"});kEl.forEach(e=>e.classList.remove("on"));
  clock.textContent=fmtClock(dur);bar.style.transform="scaleX(1)";
  document.body.classList.add("boxing");
  syncSize();topBand();
  document.fonts?.load("400 40px \"Titan One\"","+0123456789−×!").catch(()=>{});
  setScreenMode(tvState);
  S.running=true; // game.ts swallows Android back while running
  phase="count";phaseAt=performance.now();
  call(tr("bx.getReady"),tr("bx.readySub"));sfx.tick();
  cancelAnimationFrame(raf);lastFrame=performance.now();fn=0;raf=requestAnimationFrame(frame);
}
const fmtClock=(s:number)=>`${Math.floor(s/60)}:${String(Math.max(0,Math.ceil(s))%60).padStart(2,"0")}`.replace(/^0:60$/,"1:00");

function frame(now:number){
  raf=requestAnimationFrame(frame);
  if(fn>0)FT[(fn-1)%600]=now-lastFrame;
  lastFrame=now;fn++;
  syncSize();
  const ps=sampleCamera(now);
  const fresh=!!ps&&ps!==lastPs; // sampleCamera returns the previous array when only the camera frame is new
  if(ps){
    lastPs=ps;
    for(let i=0;i<ps.length;i++)draw(ps[i].lm,i);
    if(fresh)curLm=assign(ps.map(p=>p.lm),S.players,G.ar);
  }
  const tp=(now-phaseAt)/1000;
  if(phase==="count"){
    const k=Math.floor((tp-READY_S)/BEAT_S); // 0,1,2 = 3,2,1; 3 = Kova!
    if(tp>=READY_S&&k!==beat){
      beat=k;
      if(k<3){call(String(3-k),"","is-num");sfx.tick()}
      else{call(tr("bx.fight"),"","is-go",900);sfx.bell();startRound(now)}
    }
  }else if(phase==="play"){
    const t=(now-t0)/1000;
    const evs=update(G,Math.min(t,dur),fresh?ps!.map(p=>p.lm):null);
    for(const e of evs)onEv(e,now);
    if(t>=dur)endRound(now);
  }else if(phase==="end"&&tp>END_S){finishRound();return}
  render(now);
  if(now-hudAt>80){hudAt=now;hud(now)}
}
function startRound(now:number){
  phase="play";t0=now;phaseAt=now;
  startRec();S.lastRecDrawAt=now;hadRec=!!S.rec; // highlight clip like the rep game (camera only, no pads)
  S.t0=now;
  screenPhase("play");
}
function endRound(now:number){
  phase="end";phaseAt=now;
  for(let i=0;i<G.players;i++){for(const tg of G.p[i].targets)fx.push({x:tg.x,y:tg.y,r:tg.r,at:now,kind:"fade",p:i,tg});G.p[i].targets=[]}
  call(tr("bx.time"),"","is-go");sfx.bell();
}

// ---------- events -> juice ----------
function onEv(e:Ev,now:number){
  const {tg,p}=e;
  if(e.type==="spawn")return;
  if(e.type==="hit"||e.type==="gold"){
    const gold=e.type==="gold";
    fx.push({x:tg.x,y:tg.y,r:tg.r,at:now,kind:"ring",p,tg},{x:tg.x,y:tg.y-tg.r*.6,r:tg.r,at:now,kind:"text",p,txt:`+${e.pts}`,tg});
    burst(tg.x,tg.y,tg.r,gold?18:12,gold?[1,1,0,p+2]:[0,p+2,1]);
    flash(p,gold?"gold":"hit");punch(p);S.fl[p]=now;
    gold?sfx.gold():sfx.punch(p);
    evLog.push({t:(now-t0)/1000,points:e.pts});
    if(e.combo>=5&&e.combo%5===0&&e.combo<=15)call(tr("bx.combo",{n:multOf(e.combo)}),solo?"":NAMES[p],`is-combo p${p+1}`,900);
  }else if(e.type==="bomb"){
    fx.push({x:tg.x,y:tg.y,r:tg.r,at:now,kind:"boom",p,tg},{x:tg.x,y:tg.y-tg.r*.6,r:tg.r,at:now,kind:"text",p:-1,txt:`−${-e.pts||0}`,tg});
    burst(tg.x,tg.y,tg.r,16,[4,5,4,0]);
    flash(p,"bomb");sfx.bomb();
    masEl[p].classList.remove("hurt");void masEl[p].offsetWidth;masEl[p].classList.add("hurt");
    if(!reduced())replay($("#stage"),"bx-shake");
  }else{ // miss / gone: the pad deflates (a miss also greys out)
    fx.push({x:tg.x,y:tg.y,r:tg.r,at:now,kind:e.type==="miss"?"miss":"fade",p,tg});
    if(e.type==="miss")sfx.miss();
  }
}
function burst(x:number,y:number,r:number,n:number,cols:number[]){
  if(reduced())return;
  for(let k=0;k<n;k++){
    const o=(partN++%PN)*8,a=Math.random()*Math.PI*2,v=r*(2.5+Math.random()*4);
    part[o]=x+Math.cos(a)*r*.5;part[o+1]=y+Math.sin(a)*r*.5;part[o+2]=Math.cos(a)*v;part[o+3]=Math.sin(a)*v-r*2;
    part[o+4]=0;part[o+5]=.45+Math.random()*.35;part[o+6]=r*(.08+Math.random()*.12);part[o+7]=cols[k%cols.length];
  }
}
function flash(p:number,kind:string){
  const el=solo?edgeEl[0]:edgeEl[p];
  el.dataset.k=kind;el.classList.remove("on");void el.offsetWidth;el.classList.add("on");
}
function punch(p:number){
  const el=masEl[p];el.classList.add("hit");
  clearTimeout(masTimer[p]);masTimer[p]=setTimeout(()=>el.classList.remove("hit"),300);
}

// ---------- drawing ----------
const easeBack=(x:number)=>{const c=1.70158;return 1+(c+1)*(x-1)**3+c*(x-1)**2};
function pad(x:number,y:number,r:number,kind:Kind,p:number,s:number,left:number,alpha=1,grey=false){
  if(s<=0.01||alpha<=0)return;
  const lw=Math.max(2,r*.13);
  oc.save();oc.translate(x,y);oc.scale(s,s);oc.globalAlpha=alpha;
  if(kind==="bomb"){
    const pulse=1+.06*Math.sin(performance.now()/90);
    oc.save();oc.scale(pulse,pulse);
    oc.fillStyle=INK;oc.beginPath();oc.arc(0,lw*.8,r*.92,0,Math.PI*2);oc.fill();
    oc.strokeStyle=TONE[0];oc.lineWidth=lw;oc.setLineDash([r*.32,r*.2]);oc.lineDashOffset=-performance.now()/30;
    oc.beginPath();oc.arc(0,0,r*1.08,0,Math.PI*2);oc.stroke();oc.setLineDash([]);
    oc.fillStyle=INK;oc.beginPath();oc.arc(0,0,r*.86,0,Math.PI*2);oc.fill();
    oc.fillStyle="rgba(255,255,255,.3)";oc.beginPath();oc.ellipse(-r*.3,-r*.32,r*.22,r*.13,-.6,0,Math.PI*2);oc.fill();
    oc.strokeStyle=INK;oc.lineWidth=lw;oc.lineCap="round";oc.beginPath();oc.moveTo(r*.45,-r*.62);oc.quadraticCurveTo(r*.65,-r*1.05,r*.95,-r*.95);oc.stroke();
    oc.save();oc.translate(r*.98,-r*1);oc.rotate(performance.now()/120);oc.scale(r*.045,r*.045);oc.fillStyle=GOLD;oc.fill(STAR_P);oc.restore();
    oc.strokeStyle=TONE[0];oc.lineWidth=lw*1.3;oc.beginPath();oc.moveTo(-r*.3,-r*.3);oc.lineTo(r*.3,r*.3);oc.moveTo(r*.3,-r*.3);oc.lineTo(-r*.3,r*.3);oc.stroke();
    oc.restore();
  }else{
    const tone=grey?"#A3A7C8":kind==="gold"?GOLD:TONE[p];
    if(kind==="gold"&&!grey){ // halo
      oc.fillStyle="rgba(255,198,26,.35)";oc.beginPath();oc.arc(0,0,r*(1.25+.08*Math.sin(performance.now()/120)),0,Math.PI*2);oc.fill();
    }
    oc.fillStyle=INK;oc.beginPath();oc.arc(0,lw*.9,r+lw/2,0,Math.PI*2);oc.fill(); // sticker shadow
    oc.fillStyle="#fff";oc.strokeStyle=INK;oc.lineWidth=lw;oc.beginPath();oc.arc(0,0,r,0,Math.PI*2);oc.fill();oc.stroke();
    oc.fillStyle=tone;oc.beginPath();oc.arc(0,0,r*.76,0,Math.PI*2);oc.fill();
    oc.strokeStyle="rgba(255,255,255,.5)";oc.lineWidth=lw*.5;oc.beginPath();oc.arc(0,0,r*.56,0,Math.PI*2);oc.stroke();
    oc.save();
    if(kind==="gold"){oc.scale(r*.05,r*.05);oc.fillStyle="#fff";oc.strokeStyle=INK;oc.lineWidth=1.4;oc.lineJoin="round";oc.fill(STAR_P);oc.stroke(STAR_P)}
    else{const k=r*.7/12;oc.scale(k,k);oc.translate(-11.6,-12.6);oc.fillStyle="#fff";oc.strokeStyle=INK;oc.lineWidth=1.8;oc.lineJoin="round";oc.fill(GLOVE_P);oc.stroke(GLOVE_P)}
    oc.restore();
  }
  // time left: a ring that empties clockwise, red in the last 30 %
  if(left>=0){
    oc.strokeStyle=left<.3?TONE[0]:kind==="bomb"?"#A3A7C8":"#fff";oc.lineWidth=lw*1.1;oc.lineCap="round";
    oc.beginPath();oc.arc(0,0,r+lw*1.8,-Math.PI/2,-Math.PI/2+Math.PI*2*left);oc.stroke();
  }
  oc.restore();
}
function text(x:number,y:number,txt:string,col:string,size:number,alpha:number){
  oc.save();oc.globalAlpha=alpha;oc.font=`400 ${size}px "Titan One",Nunito,sans-serif`;oc.textAlign="center";oc.textBaseline="middle";
  oc.lineJoin="round";oc.lineWidth=size*.22;oc.strokeStyle=INK;oc.strokeText(txt,x,y);oc.fillStyle=col;oc.fillText(txt,x,y);oc.restore();
}
function glove(x:number,y:number,r:number,p:number,hot:boolean){
  oc.save();oc.translate(x,y);
  oc.globalAlpha=hot?1:.75;
  if(hot){oc.fillStyle=p===0?"rgba(255,59,59,.35)":"rgba(47,107,255,.35)";oc.beginPath();oc.arc(0,0,r*1.6,0,Math.PI*2);oc.fill()}
  oc.fillStyle=TONE[p];oc.strokeStyle="#fff";oc.lineWidth=Math.max(2,r*.22);oc.beginPath();oc.arc(0,0,r,0,Math.PI*2);oc.fill();oc.stroke();
  const k=r*.62/12;oc.scale(k,k);oc.translate(-11.6,-12.6);oc.fillStyle="#fff";oc.fill(GLOVE_P);
  oc.restore();
}
let lastRender=0;
function render(now:number){
  const H=ov.height;if(!H)return;
  const dt=Math.min(.05,Math.max(0,(now-(lastRender||now))/1000));lastRender=now;
  oc.clearRect(0,0,ov.width,H);
  const t=phase==="play"?(now-t0)/1000:G.t, rm=reduced();
  // pads
  for(let i=0;i<G.players;i++)for(const tg of G.p[i].targets){
    const age=t-tg.born,left=1-age/tg.life;
    const s=rm?1:age<.25?easeBack(Math.min(1,age/.25)):1;
    const wob=!rm&&left<.3&&tg.kind!=="bomb"?Math.sin(now/45)*tg.r*.05*H:0;
    pad(tg.x*H+wob,tg.y*H,tg.r*H,tg.kind,i,s,Math.max(0,left),age<ARM_S?.85:1);
  }
  // effects
  fx=fx.filter(f=>{
    const a=(now-f.at)/1000,X=f.x*H,Y=f.y*H,R=f.r*H;
    if(f.kind==="ring"){if(a>.4)return false;const k=a/.4;
      oc.save();oc.globalAlpha=1-k;oc.strokeStyle=f.tg?.kind==="gold"?GOLD:TONE[f.p];oc.lineWidth=R*.28*(1-k)+1;oc.beginPath();oc.arc(X,Y,R*(1+k*1.2),0,Math.PI*2);oc.stroke();
      oc.strokeStyle="#fff";oc.lineWidth=R*.12*(1-k)+1;oc.beginPath();oc.arc(X,Y,R*(.8+k*.8),0,Math.PI*2);oc.stroke();oc.restore();
      if(a<.12)pad(X,Y,R,f.tg!.kind,f.p,1+a*4,-1,1-a/.12); // the pad itself pops
      return true}
    if(f.kind==="text"){const life=.8;if(a>life)return false;
      const s=rm?1:a<.15?easeBack(a/.15):1,col=f.p<0?TONE[0]:f.tg?.kind==="gold"?GOLD:"#fff";
      text(X,Y-(rm?0:a*R*1.6),f.txt!,col,Math.max(18,R*.95)*s,a>life-.25?(life-a)/.25:1);return true}
    if(f.kind==="boom"){if(a>.5)return false;const k=a/.5;
      oc.save();oc.globalAlpha=(1-k)*.85;oc.fillStyle=TONE[0];oc.beginPath();oc.arc(X,Y,R*(.6+k*1.6),0,Math.PI*2);oc.fill();
      oc.globalAlpha=(1-k);oc.fillStyle=GOLD;oc.beginPath();oc.arc(X,Y,R*(.3+k*.9),0,Math.PI*2);oc.fill();oc.restore();return true}
    // miss (greys + deflates) / fade (deflates)
    if(a>.3)return false;
    pad(X,Y,R,f.tg!.kind,f.p,1-a/.3*.6,-1,1-a/.3,f.kind==="miss");
    if(f.kind==="miss"&&a<.3)text(X,Y,"×",TONE[0],R*1.1,1-a/.3);
    return true;
  });
  // particles
  for(let k=0;k<PN;k++){const o=k*8;if(part[o+5]<=0)continue;part[o+4]+=dt;const a=part[o+4],life=part[o+5];if(a>life){part[o+5]=0;continue}
    part[o+3]+=dt*2.2;part[o]+=part[o+2]*dt;part[o+1]+=part[o+3]*dt;
    oc.globalAlpha=1-a/life;oc.fillStyle=PCOL[part[o+7]];const sz=part[o+6]*H*(1-a/life*.5);
    oc.beginPath();oc.arc(part[o]*H,part[o+1]*H,sz,0,Math.PI*2);oc.fill()}
  oc.globalAlpha=1;
  // glove cursors (where the game thinks each fist is), bright while the hand is moving fast enough to score
  for(let i=0;i<S.players;i++){
    const lm=curLm[i];if(!lm)continue;
    const b=G.p[i].body,r=Math.max(8,(b?b.u*.11:.03)*H);
    for(const k of [0,1] as const){
      const f=fist(lm,k,G.ar);if(!f)continue;
      const h=G.p[i].hands[k];
      glove(f[0]*H,f[1]*H,r,i,phase==="play"&&h.ok&&h.spd>=MIN_SPEED);
    }
  }
}

// HUD: text only when it changes
function hud(now:number){
  const left=phase==="play"?Math.max(0,dur-(now-t0)/1000):phase==="end"?0:dur;
  const sec=Math.ceil(left);
  if(sec!==shownSec){shownSec=sec;clock.textContent=fmtClock(sec);runRoot.classList.toggle("last",phase==="play"&&sec<=10);if(phase==="play"&&sec>0&&sec<=5)sfx.tick()}
  bar.style.transform=`scaleX(${(left/dur).toFixed(3)})`;
  for(let i=0;i<G.players;i++){
    const P=G.p[i],v=String(P.score);
    if(v!==shownSc[i]){shownSc[i]=v;setDigits(scEl[i],v)}
    const m=multOf(P.combo),k=P.combo>=2?`${P.combo}${m>1?` ×${m}`:""}`:"";
    if(k!==shownK[i]){shownK[i]=k;kEl[i].innerHTML=k?icon("flame")+k:"";kEl[i].setAttribute("aria-label",k?tr("bx.comboHud",{n:P.combo}):"");kEl[i].classList.toggle("on",!!k);kEl[i].classList.toggle("hot",m>1)}
  }
  if(!solo)runRoot.dataset.lead=String(winner(G));
}
// what the TV board shows (cast.ts merges it over the rep-game state)
function tvState():Partial<ScreenState>{
  const now=performance.now(),play=phase==="play",done=phase==="off"&&!endRoot.classList.contains("hide");
  const sc:[number,number]=[G.p[0].score,solo?0:G.p[1].score];
  return {duration:dur,left:play?Math.max(0,dur-(now-t0)/1000):done||phase==="end"?0:dur,round:0,
    mult:Math.max(...G.p.slice(0,G.players).map(P=>multOf(P.combo))),ex:{id:"boxing",name:tr("bx.title")},
    score:sc,reps:G.p[0].hits+(solo?0:G.p[1].hits),winner:done?winner(G):0};
}

// ---------- results ----------
function finishRound(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  if(hadRec)finishClips(highlightSegments(evLog,dur,4,12,1),dur);
  const h=loadHist(),n=G.players,P=G.p.slice(0,n);
  const pts=[0,1].map(i=>i<n?G.p[i].score:0);
  h.unshift({t:Date.now(),players:n,duration:dur,ex:["boxing"],score:[0,0],reps:[0,1].map(i=>i<n?G.p[i].hits:0),mode:"boxing",
    pts,acc:[0,1].map(i=>i<n?Math.round(accuracy(G.p[i])*100):0),combo:[0,1].map(i=>i<n?G.p[i].best:0)});
  saveHist(h);
  const top=Math.max(...pts.slice(0,n)), newPb=top>0&&top>pb;
  const w=winner(G), head=$("#bxResHead");
  $("#bxResWl").textContent=`${tr("bx.title")} · ${dur} s`;
  if(solo){
    $("#bxWin").textContent=tr("u.pts",{n:pts[0]});
    $("#bxSub").textContent=pb&&!newPb?tr("bx.prevPb",{n:pb}):`${tn("bx.hits",P[0].hits)} · ${tr("bx.acc",{n:Math.round(accuracy(P[0])*100)})}`;
    head.dataset.w=newPb?"1":"0";
    $("#bxResArt").innerHTML=mascot("r",newPb||pts[0]>0?"win":"lose",{anim:true});
  }else{
    $("#bxWin").textContent=w?tr("bx.wins",{name:NAMES[w-1]}):tr("res.tie");
    $("#bxSub").textContent=w?tr("bx.gap",{n:Math.abs(pts[0]-pts[1])}):tr("u.pts",{n:pts[0]});
    head.dataset.w=String(w);
    $("#bxResArt").innerHTML=mascot(w===2?"b":"r",w?"win":"guard",{anim:true});
  }
  const rb=$("#bxRec");rb.hidden=!newPb;rb.textContent=tr(pb?"bx.newPb":"bx.firstPb");
  const order=[...Array(n).keys()].sort((a,b)=>pts[b]-pts[a]);
  $("#bxRows").replaceChildren(...order.map((i,k)=>{
    const Q=G.p[i],li=document.createElement("li");
    li.className=`sp-row p${i+1}`;li.style.setProperty("--i",String(k));
    li.innerHTML=`<span class="sp-place d">${n>1&&pts[0]===pts[1]?"=":k+1}</span>${face(i,"sp-row-face",n===2&&w?(w-1===i?"happy":"sad"):undefined)}<span class="sp-row-txt"><b></b><small></small></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=`${NAMES[i]}${n===2?` · P${i+1}`:""}`;
    li.querySelector(".sp-row-txt small")!.textContent=[tn("bx.hits",Q.hits),tr("bx.acc",{n:Math.round(accuracy(Q)*100)}),tr("bx.bestCombo",{n:Q.best}),...(Q.bombs?[tr("bx.bombs",{n:Q.bombs})]:[])].join(" · ");
    li.querySelector(".sp-row-t")!.textContent=tr("u.pts",{n:pts[i]});
    return li;
  }));
  $("#bxClip").hidden=!hadRec;
  runRoot.classList.add("hide");document.body.classList.remove("boxing");
  oc.clearRect(0,0,ov.width,ov.height);
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
}
$("#bxAgain").onclick=()=>{resetGame();startFlow(BOXING)};
$("#bxHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};
$("#bxClip").onclick=()=>{endRoot.classList.add("hide");openClips()};

export const BOXING:GameMode={
  start:begin,
  tv:true,
  reset(){cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);callRoot.className="sp-call bx-call";
    setScreenMode(null);fx=[];part.fill(0);oc.clearRect(0,0,ov.width,ov.height);curLm=[null,null];lastPs=null;
    runRoot.classList.add("hide");endRoot.classList.add("hide");document.body.classList.remove("boxing")},
  shown:()=>!endRoot.classList.contains("hide"),
};
