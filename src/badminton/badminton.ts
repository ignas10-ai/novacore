// Badmintonas (idėja iš #4, issue #32): 2 players on one phone or solo against a bot. After the arms-up gate each
// player picks a hand (extend it to its own side, hold 2 s while the two bubbles fill). The server swings a hand up to
// serve; during the rally the camera recognises three strokes – clear (fast upward swing), smash (fast downward swing
// that started above the shoulder) and drop (a gentle swing) – and the PURE physics in logic.ts decides whether the
// shuttle clears the net and lands in court. The winner of a rally serves next; first to 11 or 21 points wins.
// Flow (mirrors sprint/boxing): Pradžia tile -> #/badmintonas (setup) -> startFlow(BADMINTON) -> #loading -> #ready
// (arms-up gate, game.ts) -> BADMINTON.start(): hand pick -> serve -> rally -> point ... -> #bdEnd results.
// The court is the main canvas; the camera becomes a small corner preview (body.badminton #stage) so players see they
// are tracked. Gestures + physics are PURE in logic.ts (unit tests); this file is screens, the frame loop and drawing.
import "./badminton.css";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import type {Lm} from "../detect/classifier.ts";
import {sfx} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import {$,replay,setDigits} from "../ui/dom.ts";
import {t as tr,tn} from "../i18n/i18n.ts";
import {mascot,avatar} from "../ui/mascots.ts";
import {cachedNick} from "../online/api.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import type {ScreenState} from "../cast/room.ts";
import {layout,drawBackground,drawNet,drawNearPlayer,drawFarPlayer,drawTarget,drawShuttle,drawLanding,type Layout,type RigPose,type ShuttleTrailPoint} from "./court.ts";
import {
  COURT_LEN,COURT_W,NET_Z,START_Z,newShuttle,serveShuttle,hitShuttle,canHit,stepShuttle,newMatch,addPoint,countStroke,countJump,control,
  newChoice,tickChoice,newSwingState,readSwing,newBot,botAct,bestRally,matchWinner,predictContact,hitQuality,newJumpState,readJump,
  SERVE_TIMEOUT,TARGET_S,JUMP_POWER,JUMP_WINDOW,type Ctrl,type Match,type Shuttle,type Side,type Stroke,type Swing,type SwingState,type ChoiceState,type FlightEvent,type StrokeCounts,type JumpState,
} from "./logic.ts";

const PICK_TIMEOUT=10, POINT_S=1.8, BOT_SERVE_S=1.0, SWING_ANIM_S=0.34;
const RUN_SPEED=9, RUN_Z_MIN=1.0, RUN_Z_MAX=6.0; // own-half metres; the net is at 6.7 so the near player can reach it
const STROKE_KEY:Record<Stroke,"bd.stClear"|"bd.stDrop"|"bd.stSmash"|"bd.stServe">={serve:"bd.stServe",clear:"bd.stClear",drop:"bd.stDrop",smash:"bd.stSmash"};
const reduced=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const face=(i:number,cls="",mood?:"happy"|"sad")=>`<span class="${cls}">${avatar(i?"b":"r",mood)}</span>`;
const store={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};

// ---------- markup (built here, shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile bd-tile tap";tile.href="#/badmintonas";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("bd.title")}</b><small>${tr("bd.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true"><span class="bd-tile-net"></span><span class="bd-tile-shuttle"></span>${mascot("r","badminton",{anim:true})}${mascot("b","badminton",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".wl-tile")??document.querySelector(".sk-tile")??document.querySelector(".bw-tile")??document.getElementById("rankCard"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="badminton" aria-labelledby="bdTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="bdTitle" tabindex="-1">${tr("bd.title")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    <div class="bd-hero" aria-hidden="true">
      <span class="bd-hero-big">${tr("bd.heroBig")}</span><span class="bd-hero-sub">${tr("bd.heroSub")}</span>
      <span class="bd-hero-net"></span><span class="bd-hero-shuttle"></span>
      <span class="bd-hero-m r">${mascot("r","badminton",{anim:true})}</span><span class="bd-hero-m b">${mascot("b","badminton",{anim:true})}</span>
    </div>
    <section class="pick" aria-label="${tr("bd.players")}">
      <div class="seg sp-seg" role="group" aria-label="${tr("bd.players")}">
        <button data-bd="2" aria-pressed="true"><span><b class="d">2</b><small>${tr("mode.duel")}</small></span></button>
        <button data-bd="1" aria-pressed="false"><span><b class="d">1</b><small>${tr("bd.vsBot")}</small></span></button>
      </div>
    </section>
    <section class="pick" aria-label="${tr("bd.toN")}">
      <div class="seg sp-seg" role="group" aria-label="${tr("bd.toN")}">
        <button data-bdt="11" aria-pressed="true"><span><b class="d">11</b><small>${tr("bd.quick")}</small></span></button>
        <button data-bdt="21" aria-pressed="false"><span><b class="d">21</b><small>${tr("bd.classic")}</small></span></button>
      </div>
    </section>
    <div class="box sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("sp.pb")}</small><b class="d" id="bdPb">–</b><p class="help" id="bdPbTxt"></p></div></div>
    <section class="box sp-how" aria-labelledby="bdHowT">
      <h2 class="card-title" id="bdHowT">${tr("bd.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("bd.how1")}</span></li>
        <li><span data-icon="hand"></span><span>${tr("bd.how2")}</span></li>
        <li><span data-icon="target"></span><span>${tr("bd.how3")}</span></li>
        <li><span data-icon="arrow-up"></span><span>${tr("bd.how4")}</span></li>
      </ol>
    </section>
    <div class="cta">
      <button class="go tap" id="bdGo" type="button"><span>${tr("bd.toCourt")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
const pickRow=(i:number,label:string)=>`<div class="bd-prow" data-p="${i}" id="bdPr${i}">
  ${face(i,"bd-pface")}
  <div class="bd-pinfo"><b id="bdPn${i}">${label}</b><small>${tr("bd.pickSub")}</small>
    <div class="bd-bubs">
      <span class="bd-bub" data-h="0"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="bd-arc" id="bdArc${i}0" cx="18" cy="18" r="15.9" pathLength="100"/></svg><b>${tr("bd.left")}</b></span>
      <span class="bd-bub" data-h="1"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="bd-arc" id="bdArc${i}1" cx="18" cy="18" r="15.9" pathLength="100"/></svg><b>${tr("bd.right")}</b></span>
    </div>
    <span class="bd-pdone" id="bdDone${i}" hidden>${tr("bd.picked")}</span>
  </div>
</div>`;
document.body.insertAdjacentHTML("beforeend",`
<div class="bd-run hide" id="bdRun">
  <canvas id="bdCv" role="img" aria-label="${tr("bd.court")}"></canvas>
  <div class="bd-hud">
    <div class="bd-top">
      <div class="bd-card p1" id="bdC1"><span class="bd-face" id="bdF1"></span><div class="bd-card-in"><b class="d bd-score t-digit-group" id="bdS1" aria-live="polite">0</b><span class="bd-name" id="bdN1"></span></div><span class="bd-srv" id="bdSv1" aria-hidden="true"></span></div>
      <div class="bd-mid"><span class="bd-target" id="bdTarget"></span><span class="bd-rally" id="bdRally"></span></div>
      <div class="bd-card p2" id="bdC2"><span class="bd-face" id="bdF2"></span><div class="bd-card-in"><b class="d bd-score t-digit-group" id="bdS2" aria-live="polite">0</b><span class="bd-name" id="bdN2"></span></div><span class="bd-srv" id="bdSv2" aria-hidden="true"></span></div>
    </div>
  </div>
  <div class="bd-foot"><span class="bd-stroke" id="bdStroke"></span><span class="bd-long" id="bdLong"></span></div>
  <div class="bd-note" id="bdNote" aria-live="polite"></div>
  <div class="bd-pick" id="bdPick" role="dialog" aria-labelledby="bdPickT">
    <div class="bd-pick-card">
      <span class="eyebrow" id="bdPickT">${tr("bd.pickTitle")}</span>
      <p class="bd-pick-help">${tr("bd.pickHelp")}</p>
      ${pickRow(0,"P1")}${pickRow(1,"P2")}
      <p class="bd-pick-auto" id="bdPickAuto">${tr("bd.pickAuto")}</p>
    </div>
  </div>
  <div class="sp-call bd-call" id="bdCall" aria-live="assertive"><b class="d" id="bdCallT"></b><small id="bdCallS"></small></div>
</div>
<section class="screen hide" id="bdEnd" aria-labelledby="bdWin">
  <div class="wrap">
    <header class="sp-res-head bd-res-head" id="bdResHead">
      <span class="sp-res-art" id="bdResArt" aria-hidden="true"></span>
      <span class="wl" id="bdResWl"></span>
      <h2 class="d" id="bdWin"></h2>
      <p id="bdSub"></p>
      <span class="rec-badge" id="bdRec" hidden></span>
    </header>
    <div class="bd-final" id="bdFinal" aria-hidden="true"><b class="d p1" id="bdF1S">0</b><span id="bdColon">:</span><b class="d p2" id="bdF2S">0</b></div>
    <ol class="sp-rows" id="bdRows" aria-label="${tr("bd.results")}"></ol>
    <p class="bd-stats" id="bdStats"></p>
    <div class="cta">
      <button class="go" id="bdAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("app.again")}</button>
      <button class="go alt" id="bdHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#bdRun"), endRoot=$("#bdEnd"), pickRoot=$("#bdPick"), callRoot=$("#bdCall"), callT=$("#bdCallT"), callS=$("#bdCallS"), noteEl=$("#bdNote");
const cvs=$<HTMLCanvasElement>("#bdCv"), ctx=cvs.getContext("2d",{alpha:false})!;
const scoreEl=[$("#bdS1"),$("#bdS2")], nameEl=[$("#bdN1"),$("#bdN2")], cardEl=[$("#bdC1"),$("#bdC2")], srvEl=[$("#bdSv1"),$("#bdSv2")], faceEl=[$("#bdF1"),$("#bdF2")];

// ---------- setup ----------
let n=2, target=11;
{const k=Number(store.get("novacore.bdN"));if(k===1||k===2)n=k}
if(store.get("novacore.bdTarget")==="21")target=21;
const pBtns=[...document.querySelectorAll<HTMLElement>("[data-bd]")], tBtns=[...document.querySelectorAll<HTMLElement>("[data-bdt]")];
function syncSetup(){
  pBtns.forEach(b=>{const on=Number(b.dataset.bd)===n;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  tBtns.forEach(b=>{const on=Number(b.dataset.bdt)===target;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});
  $("#bdTarget").textContent=tr("bd.toShort",{n:target});
}
pBtns.forEach(b=>b.onclick=()=>{
  n=Number(b.dataset.bd);store.set("novacore.bdN",String(n));
  document.querySelector<HTMLElement>(`[data-p="${n}"]`)?.click(); // the shared setup state (game.ts reads S.players)
  if(S.players!==n)S.players=n;
  syncSetup();renderPb();
});
tBtns.forEach(b=>b.onclick=()=>{target=Number(b.dataset.bdt);store.set("novacore.bdTarget",String(target));syncSetup();renderPb()});
function renderPb(){
  const b=bestRally(loadHist());
  $("#bdPb").textContent=b?tn("bd.rallyN",b):"–";
  $("#bdPbTxt").textContent=b?tr("bd.pbTxt"):tr("bd.pbNone");
}
onView("badminton",()=>{syncSetup();renderPb()});
$("#bdGo").onclick=()=>{
  document.querySelector<HTMLElement>(`[data-p="${n}"]`)?.click();
  S.players=n;
  startFlow(BADMINTON);
};

// ---------- run state ----------
type Phase="off"|"pick"|"serve"|"rally"|"point";
let phase:Phase="off", phaseAt=0, raf=0, last=0, hudAt=0, callTimer=0, noteTimer=0, startedAt=0, pointAt=0, serveAt=0, pickAt=0;
let solo=true, M:Match|null=null, s:Shuttle|null=null;
let chosen:[0|1,0|1]=[1,1], picked:[boolean,boolean]=[false,false], choice:[ChoiceState,ChoiceState]=[newChoice(),newChoice()];
let swing:[SwingState,SwingState]=[newSwingState(),newSwingState()];
let bot=newBot();
let names=["",""], lmKeep:[Lm[]|null,Lm[]|null]=[null,null], lastPs:unknown=null, ctrls:[Ctrl|null,Ctrl|null]=[null,null];
let layoutNow:Layout|null=null, bg:HTMLCanvasElement|null=null, bgKey="";
let trail:ShuttleTrailPoint[]=[], landFx:{z:number;x:number;ok:boolean;at:number}|null=null;
let swingAnim:[number,number]=[0,0], swingKind:[Stroke,Stroke]=["clear","clear"], hitFlash:[number,number]=[0,0];
let shownScore=["",""], shownRally="", shownStroke="", strokeTimer=0, shownLong="";
let matchOver=false;
// third person: the near side, the receiver's target mark, the auto-run positions (own-side coords) and the jumps
let viewSide:Side=0, activeSide:Side=0, scripted=false; // scripted = test hook: ignore the camera swings/jumps
let mark:{side:Side;x:number;z:number;y:number;at:number}|null=null;
interface Run{x:number;z:number;tx:number;tz:number;phase:number;moving:boolean}
const newRun=():Run=>({x:0,z:1.4,tx:0,tz:1.4,phase:0,moving:false});
let run:[Run,Run]=[newRun(),newRun()];
let jumps:[JumpState,JumpState]=[newJumpState(),newJumpState()];
let jumpAt:[number,number]=[-1e9,-1e9], jumpFx:[number,number]=[0,0];
const arOf=()=>(detCv.width/detCv.height)||(cv.width/cv.height)||16/9;
const ownX=(side:Side,x:number)=>side===0?x:-x;
const ownZ=(side:Side,z:number)=>side===0?z:COURT_LEN-z;

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call bd-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function clearCall(){clearTimeout(callTimer);callRoot.className="sp-call bd-call"}
function note(text:string,ms=0){
  clearTimeout(noteTimer);noteEl.textContent=text;noteEl.classList.toggle("on",!!text);
  if(ms)noteTimer=setTimeout(()=>{noteEl.textContent="";noteEl.classList.remove("on")},ms);
}
function paintActive(){cardEl.forEach((e,i)=>e.classList.toggle("active",i===activeSide))}

// the near player's auto-run: each side has its own position in its own half (z from its baseline); the camera is
// behind the near side, so its own coordinates are exactly the screen's near-half coordinates.
function setRun(side:Side,x:number,z:number){
  const r=run[side];
  r.tx=Math.max(-COURT_W/2,Math.min(COURT_W/2,x));
  r.tz=Math.max(RUN_Z_MIN,Math.min(RUN_Z_MAX,z));
}
function homeRun(side:Side){setRun(side,0,1.4)}
function stepRuns(dt:number){
  for(const r of run){
    const dx=r.tx-r.x,dz=r.tz-r.z,d=Math.hypot(dx,dz),step=Math.min(d,RUN_SPEED*dt);
    if(step>0.001){const k=step/d;r.x+=dx*k;r.z+=dz*k;r.phase=(r.phase+step*2.2)%1;r.moving=true}
    else r.moving=false;
  }
}
// the receiver's target: predict the contact, move the view to that side and place the auto-run + red bubble there
let hintedTarget=false;
function setIncoming(receiver:Side,now:number){
  if(!M||!s)return;
  const c=predictContact(s,receiver);
  mark=null;
  viewSide=solo?0:receiver;
  activeSide=receiver;
  if(c){
    mark={side:receiver,x:c.x,z:c.z,y:c.y,at:now+c.t*1000};
    setRun(receiver,ownX(receiver,c.x),ownZ(receiver,c.z));
    if(mark.side===viewSide&&!hintedTarget){hintedTarget=true;note(tr("bd.hitHint"),1600)}
  }else homeRun(receiver);
  paintActive();
}

// poses -> players: camera.ts sorts them by mirrored x (P1 leftmost); a lone pose in a 2-player game goes to the
// half its shoulders are in (the same rule as boxing)
function assign(poses:{lm:Lm[]}[]):[Lm[]|null,Lm[]|null]{
  const out:[Lm[]|null,Lm[]|null]=[null,null];
  if(solo){out[0]=poses[0]?.lm??null;return out}
  if(poses.length>=2){out[0]=poses[0].lm;out[1]=poses[1].lm}
  else if(poses.length===1){
    const sx=poses[0].lm[11]?1-poses[0].lm[11].x:.5, sy=poses[0].lm[12]?1-poses[0].lm[12].x:.5;
    out[(sx+sy)/2<.5?0:1]=poses[0].lm;
  }
  return out;
}

// ---------- hand pick ----------
const arcEl=[["bdArc00","bdArc01"],["bdArc10","bdArc11"]].map(a=>a.map(id=>document.getElementById(id) as unknown as SVGElement)) as [SVGElement[],SVGElement[]];
const progShown=[[-1,-1],[-1,-1]];
function paintPick(){
  if(!M)return;
  const rows=solo?1:2; // solo: only the human row (the bot "picks" right automatically)
  for(let i=0;i<2;i++){
    const row=$("#bdPr"+i);row.hidden=i>=rows;
    if(i>=rows)continue;
    for(const k of [0,1]){
      const v=Math.round(choice[i].held[k]/2*100);
      if(v!==progShown[i][k]){progShown[i][k]=v;arcEl[i][k].style.strokeDashoffset=String(100-v)}
    }
    $("#bdDone"+i).hidden=!picked[i];
    row.classList.toggle("ok",picked[i]);
    row.querySelectorAll(".bd-bub").forEach((b,k)=>b.classList.toggle("on",picked[i]&&chosen[i]===k));
    $("#bdPn"+i).textContent=picked[i]?`${names[i]} · ${tr(chosen[i]?"bd.right":"bd.left")}`:names[i];
  }
}
const allPicked=()=>picked[0]&&(solo||picked[1]);
function pickTick(dt:number,now:number){
  if(!M)return;
  const humans=solo?1:2;
  for(let i=0;i<humans;i++){
    if(picked[i])continue;
    const r=tickChoice(ctrls[i]??null,choice[i],dt);
    if(r.pick!=null){chosen[i]=r.pick;picked[i]=true;sfx.rep(i)}
  }
  paintPick();
  if(allPicked()){hidePick();startServe(now);return}
  if(now-pickAt>PICK_TIMEOUT*1000){
    for(let i=0;i<humans;i++)if(!picked[i]){chosen[i]=1;picked[i]=true}
    paintPick();call(tr("bd.autoHand"),"","is-hint",900);
    hidePick();startServe(now);
  }
}
function hidePick(){pickRoot.classList.add("hide")}

// ---------- serve / rally ----------
function startServe(now:number){
  if(!M)return;
  s=newShuttle(M.server);s.live=false;
  phase="serve";phaseAt=now;serveAt=now;trail=[];landFx=null;mark=null;
  viewSide=solo?0:M.server;activeSide=M.server;
  homeRun(0);homeRun(1);paintActive();
  call(tr("bd.serveWho",{name:names[M.server]}),solo&&M.server===1?tr("bd.botServe"):tr("bd.serveHint"),"is-serve");
  paintServe();
  hud(now);
}
function paintServe(){
  if(!M)return;
  srvEl.forEach((e,i)=>{e.dataset.on=String(M!.server===i)});
  cardEl.forEach((e,i)=>e.dataset.serve=String(M!.server===i));
}
function doServe(side:Side,power=1,aim=0){
  if(!M)return;
  const now=performance.now();
  s=newShuttle(side);
  serveShuttle(s,side,Math.min(1.06,Math.max(.9,.95+(power-1)*.3)),Math.max(-.55,Math.min(.55,aim)));
  M.rally=1;countStroke(M,side,"serve");
  trail=[];landFx=null;phase="rally";phaseAt=now;
  swingKind[side]="serve";swingAnim[side]=1;hitFlash[side]=1;
  setIncoming(side===0?1:0,now); // the view cuts to the receiver and the red bubble appears
  sfx.whistle();
  call(tr("bd.serveCall"),names[side],"is-go",800);
  paintServe();
}
function tryHit(side:Side,sw:Swing,forced=false){
  if(!M||!s||phase!=="rally"||!canHit(s,side))return false;
  const isBot=side===1&&solo;
  // the receiver must swing inside the shrinking ring; the bot (and the deterministic test hooks) do not
  let q=1;
  if(!isBot&&!forced){
    if(!mark||mark.side!==side){note(tr("bd.wait"),650);return false}
    const tLeft=(mark.at-performance.now())/1000;
    q=hitQuality(tLeft);
    if(q<=0){note(tr(tLeft>0?"bd.early":"bd.late"),700);return false}
  }
  const jumped=performance.now()-jumpAt[side]<=JUMP_WINDOW*1000;
  const power=sw.power*(jumped?JUMP_POWER:1)*(isBot?1:.9+.15*q);
  if(!hitShuttle(s,side,sw.stroke,power,sw.aim,jumped&&sw.stroke==="smash"))return false;
  countStroke(M,side,sw.stroke);M.rally++;
  swingKind[side]=sw.stroke;swingAnim[side]=1;hitFlash[side]=1;
  S.fl[side]=performance.now();
  trail=[];
  if(jumped){countJump(M,side);call(tr(sw.stroke==="smash"?"bd.jumpSmash":"bd.jumpShot"),"","is-jump",800);sfx.gold()}
  else if(sw.stroke==="smash"){sfx.gold();call(tr("bd.stSmashUpper"),"","is-smash",700)}
  else sfx.punch(side);
  const key=tr(STROKE_KEY[sw.stroke]);
  if(key!==shownStroke){shownStroke=key;$("#bdStroke").textContent=key;$("#bdStroke").dataset.kind=sw.stroke;replay($("#bdStroke"),"go-pop")}
  clearTimeout(strokeTimer);strokeTimer=setTimeout(()=>{shownStroke="";$("#bdStroke").textContent=""},1100);
  setIncoming(side===0?1:0,performance.now()); // the other side receives: camera cuts, bubble appears
  hud(performance.now());
  return true;
}
function serveTick(dt:number,now:number,fresh:boolean){
  if(!M)return;
  const side=M.server;
  if(solo&&side===1){
    if(now-serveAt>=BOT_SERVE_S*1000)doServe(1,.95,(bot.rng()-.5)*.4);
    return;
  }
  if(!scripted&&fresh&&lmKeep[side]&&picked[side]){
    const sw=readSwing(lmKeep[side],arOf(),chosen[side],swing[side],now/1000);
    if(sw){
      if(sw.stroke==="clear")doServe(side,sw.power,sw.aim*.6);
      else call(tr("bd.serveUp"),"","is-hint",900);
    }
  }
  if(now-phaseAt>SERVE_TIMEOUT*1000){call(tr("bd.autoServe"),"","is-hint",900);doServe(side,1,0)}
  void dt;
}
function rallyTick(dt:number,now:number,fresh:boolean){
  if(!M||!s)return;
  if(!scripted&&fresh){
    const humans=solo?1:2;
    for(let i=0;i<humans;i++){
      if(picked[i]&&lmKeep[i]){
        const sw=readSwing(lmKeep[i],arOf(),chosen[i],swing[i],now/1000);
        if(sw)tryHit(i as Side,sw);
      }
    }
  }
  if(solo&&s.live){
    const ba=botAct(s,1,bot,dt,M.rally);
    if(ba)tryHit(1,ba);
  }
  const ev=stepShuttle(s,Math.min(.12,dt));
  if(ev)flightEvent(ev,now);
}
function flightEvent(ev:FlightEvent,now:number){
  if(!M)return;
  if(ev.type==="net"){
    const winner:Side=ev.by===0?1:0;
    landFx={z:NET_Z,x:0,ok:false,at:now};
    endPoint(winner,tr("bd.rNet"),now);
    return;
  }
  landFx={z:ev.z,x:ev.x,ok:ev.in&&!ev.fault,at:now};
  const reason=!ev.fault?tr("bd.rIn"):!ev.in?tr("bd.rOut"):ev.serve&&ev.in?tr("bd.rShort"):tr("bd.rOwn");
  endPoint(ev.winner,reason,now);
}
function endPoint(winner:Side,reason:string,now:number){
  if(!M)return;
  M.rally=Math.max(1,M.rally); // a serve that faults still counts as one shot
  matchOver=addPoint(M,winner);
  pointAt=now;phase="point";mark=null;note("");
  activeSide=winner;paintActive();
  S.score=[M.score[0],M.score[1]];
  call(tr("bd.pointCall"),`${names[winner]} · ${reason}`,winner===0?"is-p1":"is-p2");
  if(matchOver)sfx.finish();else sfx.round();
  if(!reduced())replay($("#stage"),"bd-shake");
  hud(now);
}
function nextPoint(now:number){
  if(!M)return;
  if(matchOver){finish();return}
  startServe(now);
}

// ---------- frame ----------
function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  layoutNow=layout(W,H);
  const key=`${W}x${H}@${dpr}`;
  if(key!==bgKey){
    bgKey=key;bg=document.createElement("canvas");bg.width=cvs.width;bg.height=cvs.height;
    const c=bg.getContext("2d")!;c.setTransform(dpr,0,0,dpr,0,0);drawBackground(c,layoutNow);
  }
  document.body.style.setProperty("--bd-cam-ar",cv.width&&cv.height?String(cv.width/cv.height):"1.78");
}
addEventListener("resize",()=>{if(phase!=="off")resize()});

function begin(){
  solo=S.players===1;
  M=newMatch(target);s=newShuttle(0);
  chosen=[1,1];picked=[false,solo];choice=[newChoice(),newChoice()]; // the bot's hand is picked automatically
  swing=[newSwingState(),newSwingState()];bot=newBot();
  names=solo?[cachedNick()||tr("bd.you"),tr("bd.bot")]:[tr("p.red"),tr("p.blue")];
  trail=[];landFx=null;swingAnim=[0,0];hitFlash=[0,0];swingKind=["clear","clear"];
  shownScore=["",""];shownRally="";shownStroke="";shownLong="";strokeTimer=0;matchOver=false;
  lmKeep=[null,null];lastPs=null;ctrls=[null,null];progShown[0]=[-1,-1];progShown[1]=[-1,-1];
  run=[newRun(),newRun()];jumps=[newJumpState(),newJumpState()];jumpAt=[-1e9,-1e9];jumpFx=[0,0];
  mark=null;viewSide=0;activeSide=0;hintedTarget=false;scripted=false;note("");homeRun(0);homeRun(1);
  pickRoot.classList.toggle("hide",allPicked());
  $("#bdFinal").classList.toggle("solo",solo);
  for(let i=0;i<2;i++){
    $("#bdPr"+i).hidden=solo&&i===1;
    $("#bdPr"+i).classList.remove("ok");
    $("#bdDone"+i).hidden=true;
    nameEl[i].textContent=solo?names[i]:`P${i+1}`; // the full mascot names would truncate in the small HUD chip
    faceEl[i].innerHTML=avatar(i?"b":"r");
    cardEl[i].classList.toggle("bot",solo&&i===1);
    scoreEl[i].textContent="0";scoreEl[i].dataset.len="1";
    $("#bdPn"+i).textContent=names[i];
  }
  paintActive();
  $("#bdPickAuto").textContent=tr("bd.pickAuto");
  $("#bdLong").textContent="";
  syncSetup();
  runRoot.classList.remove("hide");endRoot.classList.add("hide");
  document.body.classList.add("badminton");
  resize();
  document.fonts?.load("400 40px \"Titan One\"","0123456789:·").catch(()=>{});
  setScreenMode(tvState);
  screenPhase("play");
  S.running=true; // game.ts swallows Android back while playing
  startedAt=performance.now();last=startedAt;hudAt=0;
  if(allPicked())startServe(last);
  else{
    phase="pick";phaseAt=last;pickAt=last;
    paintPick();
    clearCall();
  }
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}

function frame(now:number){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(.12,Math.max(0,(now-last)/1000));last=now; // the shuttle is simulated in 1/240 s sub-steps; a slow frame must not lag the wall-clock target
  const ps=sampleCamera(now);
  const fresh=!!ps&&ps!==lastPs;
  if(ps){
    lastPs=ps;
    for(let i=0;i<ps.length;i++)draw(ps[i].lm,i);
    if(fresh){
      lmKeep=assign(ps);
      for(let i=0;i<(solo?1:2);i++){
        const lm=lmKeep[i];
        ctrls[i]=lm?control(lm,arOf()):null;
        if(!scripted&&lm&&readJump(lm,jumps[i],now/1000)){
          jumpAt[i]=now;jumpFx[i]=1;sfx.leap();note(tr("bd.jump"),650);
        }
      }
    }
  }
  for(let i=0;i<2;i++)if(jumpFx[i]>0)jumpFx[i]=Math.max(0,jumpFx[i]-dt/0.7);
  stepRuns(dt);
  if(phase==="pick")pickTick(dt,now);
  else if(phase==="serve")serveTick(dt,now,fresh);
  else if(phase==="rally")rallyTick(dt,now,fresh);
  else if(phase==="point"&&now-pointAt>POINT_S*1000)nextPoint(now);
  if(phase!=="off"){
    for(let i=0;i<2;i++){
      if(swingAnim[i]>0)swingAnim[i]=Math.max(0,swingAnim[i]-dt/SWING_ANIM_S);
      if(hitFlash[i]>0)hitFlash[i]=Math.max(0,hitFlash[i]-dt*3.2);
    }
    if(phase==="rally"&&s?.live){
      const lastT=trail[trail.length-1];
      if(!lastT||now-lastT.t>28){trail.push({x:s.x,z:s.z,t:now});if(trail.length>10)trail.shift()}
    }
    render(now);
    if(now-hudAt>80){hudAt=now;hud(now)}
  }
}
// ---------- drawing ----------
// the near/far rig: the arm follows the player's real wrist (dx/dy from the torso); a swing fallback when the hand is lost
function rigFor(side:Side):RigPose{
  const c=ctrls[side],hand=chosen[side];
  let wrist:[number,number]|null=null;
  if(c){const w=c.wrists[hand];if(w.ok)wrist=[(w.x-c.body.cx)/c.body.u,(w.y-c.body.sy)/c.body.u]}
  const t=swingAnim[side],k=swingKind[side];
  const target=k==="smash"?1.05:k==="clear"?-1.45:k==="drop"?.15:-.55;
  const arm=-.55+(target+.55)*Math.sin(Math.PI*(1-t));
  return {side,hand,wrist,arm,hit:hitFlash[side],jump:Math.sin(Math.PI*(1-jumpFx[side])),run:run[side].phase,moving:run[side].moving};
}
function render(now:number){
  const L=layoutNow;if(!L)return;
  const W=cvs.width,H=cvs.height;
  ctx.setTransform(1,0,0,1,0,0);
  if(bg)ctx.drawImage(bg,0,0);else{ctx.fillStyle="#0B0F2A";ctx.fillRect(0,0,W,H)}
  const dpr=W/L.W;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const near=viewSide,far=(1-viewSide) as Side;
  drawFarPlayer(ctx,L,rigFor(far),run[far].z,run[far].x);
  drawNet(ctx,L,now);
  drawNearPlayer(ctx,L,rigFor(near),run[near].z,run[near].x);
  if(mark&&mark.side===near){
    const prog=1-Math.min(1,Math.max(0,(mark.at-now)/1000/TARGET_S));
    drawTarget(ctx,L,{x:ownX(near,mark.x),z:ownZ(near,mark.z),y:mark.y},prog,now);
  }
  if(s){
    if(phase==="serve"&&!s.live){
      const held=newShuttle(M?.server??0);held.y=4.2;held.z=START_Z[(M?.server??0) as Side];
      drawShuttle(ctx,L,viewSide,held,[],now);
    }else if(s.live||phase==="point"){
      drawShuttle(ctx,L,viewSide,s,trail,now);
    }
  }
  if(landFx&&now-landFx.at<900)drawLanding(ctx,L,viewSide,landFx.z,landFx.x,landFx.ok,(now-landFx.at)/1000);
  ctx.setTransform(1,0,0,1,0,0);
}

// HUD: text only when it changes
function hud(now:number){
  if(!M)return;
  for(let i=0;i<2;i++){
    const v=String(M.score[i]);
    if(v!==shownScore[i]){shownScore[i]=v;scoreEl[i].dataset.len=String(v.length);setDigits(scoreEl[i],v)}
  }
  const rally=`${tr("bd.rally")} ${phase==="point"?M.lastRally:M.rally||1}`;
  if(rally!==shownRally){shownRally=rally;$("#bdRally").textContent=rally}
  const lg=`${tr("bd.longest")} ${M.longest||0}`;
  if(lg!==shownLong){shownLong=lg;$("#bdLong").textContent=lg}
  paintServe();paintActive();
  if(!solo)cardEl[0].classList.toggle("lead",M.score[0]>M.score[1]),cardEl[1].classList.toggle("lead",M.score[1]>M.score[0]);
  void now;
}
// what the TV board shows (cast.ts merges it over the rep-game state): points as the score, rally as the "round"
function tvState():Partial<ScreenState>{
  if(!M)return {};
  const done=phase==="off"&&!endRoot.classList.contains("hide");
  const elapsed=startedAt?Math.max(1,Math.round((performance.now()-startedAt)/1000)):1;
  const shots=M.strokes.reduce((n,c)=>n+c.serve+c.clear+c.drop+c.smash,0);
  return {players:solo?1:2,duration:elapsed,left:0,round:Math.max(0,M.rally-1),mult:1,
    ex:{id:"badminton",name:`${tr("bd.title")} · ${tr("bd.toN",{n:M.target})}`.slice(0,40)},
    score:[M.score[0],solo?0:M.score[1]],reps:shots,winner:done?matchWinner(M):0};
}

// ---------- results ----------
function finish(){
  if(!M)return;
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  clearTimeout(strokeTimer);clearCall();
  const now=performance.now(),h=loadHist(),prev=bestRally(h);
  const score:[number,number]=[M.score[0],M.score[1]];
  const shots=(c:StrokeCounts)=>c.serve+c.clear+c.drop+c.smash;
  h.unshift({t:Date.now(),players:n,duration:Math.round((now-startedAt)/1000),ex:["badminton"],score:[0,0],
    reps:[shots(M.strokes[0]),shots(M.strokes[1])],mode:"badminton",bdScore:score,bdTarget:M.target,bdRallies:M.rallies,bdLongest:M.longest,
    bdStrokes:[{...M.strokes[0]},{...M.strokes[1]}],bdJumps:[...M.jumps]});
  saveHist(h);
  const w=M.winner as Side, head=$("#bdResHead");
  $("#bdResWl").textContent=`${tr("bd.title")} · ${tr("bd.toN",{n:M.target})}`;
  head.dataset.w=String(w+1);
  $("#bdWin").textContent=solo?(w===0?tr("bd.youWin"):tr("bd.botWins")):tr("bd.wins",{name:names[w]});
  $("#bdSub").textContent=solo
    ? `${tr("bd.longestIs")} ${tn("bd.rallyN",M.longest)}.`
    : tr("bd.gap",{n:Math.abs(score[0]-score[1])});
  $("#bdResArt").innerHTML=mascot(solo?"r":w===1?"b":"r",w===0||!solo?"win":"lose",{anim:true});
  const newPb=M.longest>0&&M.longest>prev;
  const rb=$("#bdRec");rb.hidden=!newPb;rb.textContent=tr(prev?"sp.newPb":"sp.firstPb");
  $("#bdF1S").textContent=String(score[0]);$("#bdF2S").textContent=String(score[1]);
  $("#bdF2S").hidden=false;$("#bdColon").hidden=false; // solo too: the bot's score is part of the final score
  const rows=[0,1].map(i=>{
    const li=document.createElement("li");li.className=`sp-row p${i+1}`;li.style.setProperty("--i",String(i));
    const st=M!.strokes[i];
    li.innerHTML=`<span class="sp-place d">${i===w?1:2}</span>${face(i,"sp-row-face",i===w?"happy":"sad")}<span class="sp-row-txt"><b></b><small></small></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=names[i];
    const parts=[`${tr("bd.smash")} ${st.smash}`,`${tr("bd.clear")} ${st.clear}`,`${tr("bd.drop")} ${st.drop}`];
    if(M!.jumps[i]>0)parts.push(tr("bd.jumpShort",{n:M!.jumps[i]}));
    li.querySelector(".sp-row-txt small")!.textContent=parts.join(" · ");
    li.querySelector(".sp-row-t")!.textContent=String(score[i]);
    return li;
  });
  $("#bdRows").replaceChildren(...rows);
  const jumpTotal=M.jumps[0]+M.jumps[1];
  $("#bdStats").textContent=`${tr("bd.ralliesLabel")}: ${tn("bd.rallyCount",M.rallies)} · ${tr("bd.longest")}: ${tn("bd.rallyN",M.longest)}${jumpTotal?` · ${tr("bd.jumpsLabel")}: ${jumpTotal}`:""}`;
  runRoot.classList.add("hide");document.body.classList.remove("badminton");
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cvs.width,cvs.height);
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
  sfx.finish();
}
$("#bdAgain").onclick=()=>{resetGame();startFlow(BADMINTON)};
$("#bdHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// ---------- test hooks (e2e / tools) ----------
(window as any).__bd={
  state:()=>({phase,players:n,target:M?.target,score:M?[...M.score]:[0,0],server:M?.server,rally:M?.rally??0,
    live:!!s?.live,shuttle:s?{x:s.x,y:s.y,z:s.z,vz:s.vz,vy:s.vy}:null,chosen:[...chosen],picked:[...picked],
    rallies:M?.rallies??0,longest:M?.longest??0,strokes:M?[{...M.strokes[0]},{...M.strokes[1]}]:[],
    near:viewSide,active:activeSide,hint:hintedTarget,
    mark:mark?{side:mark.side,x:mark.x,z:mark.z,y:mark.y,left:(mark.at-performance.now())/1000}:null,
    run:run.map(r=>({x:r.x,z:r.z,phase:r.phase,moving:r.moving})),jumps:M?[...M.jumps]:[0,0],jumpFx:[...jumpFx]}),
  pick:(p0:0|1=1,p1:0|1=1)=>{if(phase!=="pick")return;chosen=[p0,p1];picked=[true,true];hidePick();startServe(performance.now())},
  serve:()=>{if(phase==="serve"&&M)doServe(M.server,1,0)},
  point:(w:0|1)=>{if((phase==="rally"||phase==="serve")&&M)endPoint(w,tr("bd.rTest"),performance.now())},
  swing:(side:0|1,stroke:Swing["stroke"]="clear")=>{ // a real human swing through the timing window
    const sw:Swing={hand:chosen[side],stroke,power:1,aim:0,peak:0};
    return tryHit(side,sw);
  },
  hitNow:(side:0|1,stroke:Swing["stroke"]="clear")=>{ // deterministic timing for the e2e: put the contact at "now"
    if(mark&&mark.side===side&&s){s.x=mark.x;s.z=mark.z;s.y=Math.max(.4,mark.y);s.live=true;s.t=1;s.from=(side===0?1:0) as Side;mark.at=performance.now()}
    const sw:Swing={hand:chosen[side],stroke,power:1,aim:0,peak:0};
    return tryHit(side,sw,true);
  },
  jump:(side:0|1=0)=>{jumpAt[side]=performance.now();jumpFx[side]=1;note(tr("bd.jump"),700)},
  script:(on=true)=>{scripted=!!on}, // ignore the camera swings/jumps (deterministic e2e)
  
  toss:(side:0|1,stroke:Stroke="clear")=>{ // put the shuttle on a side and hit it (a deterministic physics probe)
    if(!M)return false;
    s=newShuttle(side);s.z=side===0?4.5:COURT_LEN-4.5;s.y=3;s.live=true;s.t=1;s.from=side;
    const sw:Swing={hand:side,stroke:stroke==="serve"?"clear":stroke,power:1,aim:0,peak:0};
    return tryHit(side,sw,true);
  },
  tossServe:(side:0|1)=>{if(M)doServe(side,1,0)},
};

export const BADMINTON:GameMode={
  start:begin,
  tv:true,
  reset(){
    cancelAnimationFrame(raf);phase="off";S.running=false;matchOver=false;
    clearTimeout(callTimer);clearTimeout(strokeTimer);clearCall();
    setScreenMode(null);screenPhase("idle");
    runRoot.classList.add("hide");endRoot.classList.add("hide");pickRoot.classList.add("hide");
    document.body.classList.remove("badminton");
    lmKeep=[null,null];lastPs=null;ctrls=[null,null];trail=[];landFx=null;s=null;M=null;
    mark=null;viewSide=0;activeSide=0;hintedTarget=false;note("");run=[newRun(),newRun()];jumpFx=[0,0];
    if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cvs.width,cvs.height)}
  },
  shown:()=>!endRoot.classList.contains("hide"),
};
