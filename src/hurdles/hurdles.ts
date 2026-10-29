// Barjerinis bėgimas (issue #14): the sprint with 8 hurdles. Run in place (the sprint cadence model), before every
// hurdle the long jump's staged cue (orange "Ruoškis…" -> green "Šok!"), jump (src/detect/takeoff.ts) -> the runner
// hops over; no jump -> the hurdle falls, the runner stumbles and slows down (never a disqualification). Score = the
// finish time + hurdles cleared x/8. 1 player (vs your record) or a 2-player duel on two lanes like the sprint.
// Flow: Pradžia tile -> #/barjerai (setup) -> startFlow(HURDLES_MODE) -> #loading -> #ready (arms-up gate, game.ts) ->
// start(): "Į starto pozicijas… Dėmesio… Marš!" -> race -> finish -> #hdEnd results.
// Rules are PURE in logic.ts (test/unit/hurdles.test.ts), lane zones + hurdles in track.ts, the stadium = src/sprint.
import "./hurdles.css";
import {gallery} from "../ui/gallery.ts";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {step} from "../detect/step.ts";
import {takeoff,takeoffState,type TakeoffState} from "../detect/takeoff.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import {sfx} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import type {Game} from "../history/stats.ts";
import {$} from "../ui/dom.ts";
import {t as tr,dec} from "../i18n/i18n.ts";
import {mascot,avatar} from "../ui/mascots.ts";
import {screenPhase,setScreenMode} from "../cast/cast.ts";
import type {ScreenState} from "../cast/room.ts";
import {RACE_M,V_MAX} from "../sprint/speed.ts";
import {LOOKS,newPose,runPose,setPose,standPose,winPose,hurdlePose,drawRunner,type Pose} from "../sprint/runner.ts";
import {layout,build,drawBack,drawFinishBack,drawFinishFront,drawFront,sx,SKEW,type Layout} from "../sprint/scene.ts";
import {HURDLES,N_HURDLES,GRACE_S,newRun,stepAt,tick,jump,cue,cleared,hopLift,type Run} from "./logic.ts";
import {drawZones,drawHurdle} from "./track.ts";

const NAMES=[tr("p.red"),tr("p.blue")];
const POS_S=1.7, SET_MIN=1.3, SET_MAX=2.3, END_AFTER=8, LIMIT_S=60, RESULTS_DELAY=2200, VIEW_M=8, STUMBLE_S=.6;
const fmt=(s:number)=>dec(s,2);
const kmh=(v:number)=>Math.round(v*3.6);
const face=(i:number,cls="")=>`<span class="${cls}">${avatar(i?"b":"r")}</span>`;
const dots=(id="")=>`<span class="hd-dots"${id?` id="${id}"`:""} aria-hidden="true">${"<i></i>".repeat(N_HURDLES)}</span>`;

// ---------- markup (built here, the shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile hd-tile tap";tile.href="#/barjerai";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">${tr("setup.title")}</span><b class="d">${tr("hd.title")}</b><small>${tr("hd.tileSub")}</small></span>
<span class="sp-tile-art" aria-hidden="true">${mascot("r","squatjump",{anim:true})}${mascot("b","knees",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.querySelector(".lj-tile")??document.querySelector(".sp-tile")??document.getElementById("rankCard"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="hurdles" aria-labelledby="hdTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="${tr("app.back")}"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="hdTitle" tabindex="-1">${tr("hd.short")}</h1><button class="icon-btn tap" data-tv type="button" aria-label="${tr("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button></div></header>
    ${gallery("hd",tr("hd.heroBig"),tr("hd.hero"))}
    <section class="pick" aria-label="${tr("setup.players")}">
      <div class="seg sp-seg" role="group" aria-label="${tr("sp.runners")}">
        <button data-hd="2" aria-pressed="true"><span><b class="d">2</b><small>${tr("mode.duel")}</small></span></button>
        <button data-hd="1" aria-pressed="false"><span><b class="d">1</b><small>${tr("mode.solo")}</small></span></button>
      </div>
    </section>
    <div class="card sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">${tr("sp.pb")}</small><b class="d" id="hdPb">–</b><p class="help" id="hdPbTxt"></p></div></div>
    <section class="card sp-how" aria-labelledby="hdHowT">
      <h2 class="card-title" id="hdHowT">${tr("hd.how")}</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>${tr("hd.how1")}</span></li>
        <li><span data-icon="footprints"></span><span>${tr("hd.how2")}</span></li>
        <li><span data-icon="zap"></span><span>${tr("hd.how3")}</span></li>
      </ol>
    </section>
    <div class="cta">
      <button class="go tap" id="hdGo" type="button"><span>${tr("sp.toStart")}</span><span data-icon="arrow-right"></span></button>
      <p class="fine">${tr("sp.private")}</p>
    </div>
  </div>
</section>`);
document.body.insertAdjacentHTML("beforeend",`
<div class="screen sp-run hd-run hide" id="hdRun">
  <canvas id="hdCv" role="img" aria-label="${tr("hd.track")}"></canvas>
  <div class="sp-hud">
    <div class="sp-top hd-top">
      <div class="sp-card p1" id="hdC1">${face(0,"sp-face")}<div class="sp-card-in"><b class="d" id="hdD1">0 m</b>${dots("hdK1")}<span class="sp-bar"><i id="hdV1"></i></span></div></div>
      <div class="sp-clock"><span class="d" id="hdT">0,00</span></div>
      <div class="sp-card p2" id="hdC2">${face(1,"sp-face")}<div class="sp-card-in"><b class="d" id="hdD2">0 m</b>${dots("hdK2")}<span class="sp-bar"><i id="hdV2"></i></span></div></div>
      <div class="sp-card p2 hd-pbc" id="hdPbC"><span class="sp-face lj-tro hd-tro" data-icon="trophy"></span><div class="sp-card-in"><b class="d" id="hdPbD">–</b><small>${tr("bx.best")}</small></div></div>
    </div>
    <div class="sp-map hd-map" aria-hidden="true">${HURDLES.map(m=>`<i style="left:${m}%"></i>`).join("")}
      <span class="sp-dotw" id="hdM2"><b class="sp-dot p2"></b></span><span class="sp-dotw" id="hdM1"><b class="sp-dot p1"></b></span><span class="sp-flag"></span></div>
    <div class="hd-cues" aria-hidden="true"><span class="hd-jump" id="hdQ1"></span><span class="hd-jump" id="hdQ2"></span></div>
  </div>
  <div class="sp-call" id="hdCall" aria-live="assertive"><b class="d" id="hdCallT"></b><small id="hdCallS"></small></div>
</div>
<section class="screen hide" id="hdEnd" aria-labelledby="hdWin">
  <div class="wrap">
    <header class="sp-res-head" id="hdResHead">
      <span class="sp-res-art" id="hdResArt" aria-hidden="true"></span>
      <span class="wl">${tr("hd.title")}</span>
      <h2 class="d" id="hdWin"></h2>
      <p id="hdSub"></p>
      <span class="rec-badge" id="hdRec" hidden>${tr("sp.newPb")}</span>
    </header>
    <ol class="sp-rows" id="hdRows" aria-label="${tr("sp.results")}"></ol>
    <div class="cta">
      <button class="go" id="hdAgain" type="button"><span data-icon="rotate-ccw"></span>${tr("sp.again")}</button>
      <button class="go alt" id="hdHome" type="button"><span data-icon="house"></span>${tr("app.home")}</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#hdRun"), endRoot=$("#hdEnd"), cvs=$<HTMLCanvasElement>("#hdCv"), ctx=cvs.getContext("2d",{alpha:false})!;
const callRoot=$("#hdCall"), callT=$("#hdCallT"), callS=$("#hdCallS"), clock=$("#hdT");
const dEl=[$("#hdD1"),$("#hdD2")], vEl=[$("#hdV1"),$("#hdV2")], mEl=[$("#hdM1"),$("#hdM2")], kEl=[$("#hdK1"),$("#hdK2")], qEl=[$("#hdQ1"),$("#hdQ2")];

// ---------- history: mode "hurdles", times in s (null = did not finish), clr = hurdles cleared per player ----------
const bestTime=(h:Game[])=>h.reduce((m,g)=>g.mode==="hurdles"?Math.min(m,...(g.times||[]).map(t=>t??1e9)):m,1e9);

// ---------- setup ----------
const segBtns=[...document.querySelectorAll<HTMLElement>("[data-hd]")];
function syncSeg(){segBtns.forEach(b=>{const on=Number(b.dataset.hd)===S.players;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))})}
segBtns.forEach(b=>b.onclick=()=>{
  document.querySelector<HTMLElement>(`[data-p="${b.dataset.hd}"]`)?.click(); // same state as the rep game's setup
  if(S.players!==Number(b.dataset.hd))S.players=Number(b.dataset.hd);
  syncSeg();
});
function renderPb(){
  const b=bestTime(loadHist());
  $("#hdPb").textContent=b<1e9?`${fmt(b)} s`:"–";
  $("#hdPbTxt").textContent=tr(b<1e9?"hd.pbTxt":"hd.pbNone");
}
onView("hurdles",()=>{syncSeg();renderPb()});
$("#hdGo").onclick=()=>startFlow(HURDLES_MODE);

// ---------- race state ----------
type Phase="off"|"pos"|"set"|"race"|"done";
let phase:Phase="off", phaseAt=0, setDur=0, t0=0, raceT=0, raf=0, last=0, firstFin=-1, doneAt=0, brokeAt=-1, cam=0, hudAt=0, callTimer=0, pb=1e9;
let L:Layout, solo=false, feedCad=0, feedAt=0, feedLeg=0;
const autoD=[-1,-1];
const R:Run[]=[newRun(),newRun()], TK:TakeoffState[]=[takeoffState(),takeoffState()];
const poses:Pose[]=[newPose(),newPose()], cyc=[0,0], lane=[0,1];
let order:number[]=[];

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function enter(p:Phase,now:number){
  phase=p;phaseAt=now;
  if(p==="pos"){call(tr("sp.marks"),tr("hd.marksSub"));sfx.tick()}
  else if(p==="set"){setDur=SET_MIN+Math.random()*(SET_MAX-SET_MIN);call(tr("sp.set"),"","is-set");sfx.tick()}
  else if(p==="race"){t0=now;feedAt=now;call(tr("sp.go"),"","is-go",900);sfx.gun()}
}
const who=(i:number)=>solo?"":NAMES[i];
function knee(i:number,now:number,leg:number){
  S.fl[i]=now; // skeleton glow in the camera corner
  if((phase==="race"||phase==="done")&&R[i].r.fin==null&&!R[i].hop){stepAt(R[i],(now-t0)/1000,leg);sfx.step(i)}
}
function doJump(i:number,tTake:number){
  if(phase!=="race")return;
  const r=jump(R[i],(tTake-t0)/1000);
  if(r==="ok")sfx.leap();
  else if(r==="early")call(tr("hd.early"),who(i)||tr("hd.earlySub"),"is-bad",800);
}

// portrait: the sprint zoom shows ~4 m, too little to see the next hurdle coming -> at least VIEW_M (smaller runners)
function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  L=layout(W,H,dpr);
  if(L.W/L.ppm<VIEW_M){L.ppm=L.W/VIEW_M;L.charH=[L.ppm*1.9*.9,L.ppm*1.9]}
  build(ctx,L,[tr("hd.board"),tr("sp.boardRun")]);
  if(cv.width)document.body.style.setProperty("--sp-cam-ar",String(cv.width/cv.height));
}
addEventListener("resize",()=>{if(phase!=="off")resize()});

function begin(){
  solo=S.players===1;
  for(let i=0;i<2;i++){R[i]=newRun();TK[i]=takeoffState()}
  lane[0]=solo?1:0;lane[1]=solo?0:1; // solo: you in the near lane
  cyc[0]=0;cyc[1]=.5;order=[];firstFin=-1;brokeAt=-1;raceT=0;pb=bestTime(loadHist());
  runRoot.classList.remove("hide");runRoot.classList.toggle("solo",solo);
  document.body.classList.add("sprinting","hurdling"); // .sprinting = the corner camera preview (sprint.css)
  $("#hdPbD").textContent=pb<1e9?`${fmt(pb)} s`:"–";
  for(const el of kEl)for(const d of el.children)d.className="";
  resize();
  cam=-(L.W/L.ppm)*.3;
  document.fonts?.load("400 40px \"Titan One\"",`${tr("sp.finishLine")} ${tr("hd.board")} 0123456789`).then(()=>{if(phase!=="off")build(ctx,L,[tr("hd.board"),tr("sp.boardRun")])}).catch(()=>{});
  S.running=true; // game.ts swallows Android back while running
  last=performance.now();
  setScreenMode(tvState);
  screenPhase("play");
  enter("pos",last);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}

function frame(now:number){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now; // .25: a slow phone (or CPU e2e, ~2 fps) still runs in real time
  const ps=sampleCamera(now);
  if(ps)for(let i=0;i<ps.length&&i<S.players;i++){
    S.st[i].ar=detCv.width/detCv.height||1;
    const st=S.st[i],up0=st.leg?.[0],lm=ps[i].lm; // which knee went up: speed.ts only counts alternating legs
    if(!feedCad){ // feeding = a scripted run (e2e / tools): steps and jumps only via the hooks
      if(step(st,lm,"knees",now))knee(i,now,st.leg[0]&&!up0?0:1);
      const tt=takeoff(TK[i],lm,now);if(tt)doJump(i,tt);
    }
    draw(lm,i);
  }
  if(feedCad>0&&(phase==="race"||phase==="done")&&now>=feedAt){feedLeg^=1;for(let i=0;i<S.players;i++)knee(i,now,feedLeg);feedAt=now+1000/feedCad}
  const tp=(now-phaseAt)/1000;
  if(phase==="pos"&&tp>POS_S)enter("set",now);
  else if(phase==="set"&&tp>setDur)enter("race",now);
  if(phase==="race"||phase==="done"){
    const t=raceT=(now-t0)/1000;
    for(let i=0;i<S.players;i++){
      const a=R[i],had=a.r.fin!=null;
      if(autoD[i]>=0&&!a.hop&&a.next<N_HURDLES&&a.r.x>=HURDLES[a.next]-autoD[i])doJump(i,now);
      const c=tick(a,t,dt);
      if(c>=0){sfx.land();call(tr("hd.clip"),who(i)||tr("hd.clipSub"),"is-bad",900)}
      if(!had&&a.r.fin!=null)finished(i);
    }
    if(phase==="race"){
      const all=R.slice(0,S.players).every(a=>a.r.fin!=null);
      if(all||(firstFin>=0&&t-firstFin>END_AFTER)||t>LIMIT_S){phase="done";doneAt=now;if(!all&&firstFin<0)call(tr("sp.timeUp"),"","is-bad")}
    }else if(now-doneAt>RESULTS_DELAY){finishRace();return}
  }
  render(now,dt);
  if(now-hudAt>80){hudAt=now;hud()}
}
function finished(i:number){
  order.push(i);
  if(firstFin<0){firstFin=R[i].r.fin!;brokeAt=raceT;sfx.finish()}
  else sfx.round();
  call(tr("sp.finish"),`${solo?"":NAMES[i]+" · "}${fmt(R[i].r.fin!)} s · ${cleared(R[i])}/${N_HURDLES}`,`is-fin p${i+1}`);
}

// ---------- drawing ----------
const laneY=(k:number)=>L.lane[k];
const screenX=(m:number,k:number)=>sx(m,cam)+(L.trackBot-laneY(k))*SKEW;
function animate(i:number,dt:number,t:number){
  const o=poses[i],a=R[i],v=a.r.v,fin=a.r.fin!=null;
  if(phase==="pos"||phase==="off"){standPose(o,t+i);return}
  if(phase==="set"){setPose(o,t+i);return}
  if(a.hop){hurdlePose(o,Math.min(1,Math.max(0,(a.r.x-a.hop.x0)/((a.hop.x1-a.hop.x0)||1))));return}
  if(v<.35||(fin&&v<1.6)){if(fin&&order[0]===i&&(!solo||a.r.fin!<=pb))winPose(o,t);else standPose(o,t);return}
  cyc[i]+=dt*v*.2;runPose(o,cyc[i]%1,Math.min(1,.3+v/9));
  // stumble after a clipped hurdle: thrown forward, gloves flailing
  const hit=a.res.lastIndexOf(false), s=hit>=0?(raceT-a.at[hit])/STUMBLE_S:1;
  if(s<1){const f=1-s;o.lean+=26*f;o.sh[0]+=90*f*Math.sin(t*22);o.sh[1]+=110*f;o.bob+=.02*f}
}
function body(i:number,k:number){
  const a=R[i],h=L.charH[k],gy=laneY(k),X=screenX(a.r.x,k),o=poses[i],v=a.r.v;
  if(X<-h||X>L.W+h){edge(i,k,X<0);return}
  const lift=a.hop?hopLift(a.hop,a.r.x)*h*.6:0;
  ctx.globalAlpha=.22*(1-Math.min(.7,lift/h));ctx.fillStyle="#14183A";ctx.beginPath();ctx.ellipse(X+h*.02,gy+2,h*.2*(1-Math.min(.5,lift/h)),h*.035,0,0,Math.PI*2);ctx.fill();
  if(v>5){
    const al=Math.min(.6,(v-5)/6.5*.6);ctx.globalAlpha=al;ctx.fillStyle="#FFFFFF";
    for(let j=0;j<4;j++){const y=gy-lift-h*(.28+j*.15),len=h*(.35+.5*al)*(1+.3*Math.sin(raceT*20+j*2)),x0=X-h*(.32+((j*37)%10)/40);ctx.fillRect(x0-len,y,len,Math.max(2,h*.018))}
  }
  ctx.globalAlpha=1;
  drawRunner(ctx,LOOKS[i],o,X,gy-lift,h);
}
// a runner outside the view: a pill on that edge of their lane with the gap in metres
function edge(i:number,k:number,left:boolean){
  const gap=Math.round(Math.abs(R[0].r.x-R[1].r.x)),y=laneY(k)-L.charH[k]*.5,txt=`${NAMES[i]} ${left?"−":"+"}${gap} m`;
  ctx.font="800 13px Nunito,system-ui,sans-serif";const w=ctx.measureText(txt).width+34,X=left?12:L.W-12-w;
  ctx.fillStyle=i?"#2F6BFF":"#FF3B3B";ctx.beginPath();ctx.roundRect(X,y-15,w,30,15);ctx.fill();
  ctx.fillStyle="#fff";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(txt,X+(left?24:12),y+.5);
  ctx.beginPath();const ax=left?X+12:X+w-12;ctx.moveTo(ax+(left?-5:5),y);ctx.lineTo(ax+(left?3:-3),y-6);ctx.lineTo(ax+(left?3:-3),y+6);ctx.fill();
}
// the clip is decided GRACE_S after the runner reached the bar (a late take-off may still clear it): while it is open the
// hurdle already tips as the runner goes through, then falls from about half down at the call
const tip=(a:Run,j:number)=>a.res[j]===false?Math.min(1,(raceT-a.at[j]+GRACE_S)/.5):a.res[j]==null&&a.r.x>HURDLES[j]?Math.min(.45,(a.r.x-HURDLES[j])*.4):0;
function render(now:number,dt:number){
  const t=now/1000, viewM=L.W/L.ppm;
  // camera: the runner(s) left of centre so the next hurdle is in view; both humans while close, else the leader
  let target=-viewM*.3,leadV=0;
  if(phase==="race"||phase==="done"){
    let lead=-1e9,trail=1e9;const racing=R.slice(0,S.players).some(a=>a.r.fin==null);
    for(let i=0;i<S.players;i++){const a=R[i];if(racing&&a.r.fin!=null)continue;if(a.r.x>lead){lead=a.r.x;leadV=a.r.v}trail=Math.min(trail,a.r.x)}
    target=lead-trail<viewM*.45?trail-viewM*.22:lead-viewM*.4;
    target=racing?Math.min(Math.max(target,-viewM*.3),RACE_M+2-viewM*.5):lead-viewM*.5;
  }
  if(cam<target)cam+=Math.min(leadV*dt,target-cam);
  cam+=(target-cam)*(1-Math.exp(-dt*3.5));
  drawBack(ctx,cam);drawFinishBack(ctx,cam);
  // far lane first: zones, hurdles, then that lane's runner
  for(const k of [0,1]){
    const i=lane.indexOf(k),a=i>=0&&i<S.players?R[i]:null;
    drawZones(ctx,L,cam,k,a&&cue(a)==="go"?.5+.5*Math.sin(t*12):0);
    for(let j=0;j<N_HURDLES;j++)drawHurdle(ctx,L,cam,k,j,a?tip(a,j):0);
    if(a){animate(i,dt,t);body(i,k)}
  }
  drawFinishFront(ctx,cam,brokeAt<0?-1:raceT-brokeAt);
  drawFront(ctx,cam);
}
// HUD: text only when it changes, bars/dots by transform (compositor only)
const shownD=["",""],shownT=[""],shownQ=["",""],shownK=["",""];
function hud(){
  let t=phase==="race"||phase==="done"?raceT:0;
  if(R.slice(0,S.players).every(a=>a.r.fin!=null))t=Math.max(...R.slice(0,S.players).map(a=>a.r.fin!)); // clock stops at the last finisher
  const tt=fmt(t);
  if(tt!==shownT[0]){shownT[0]=tt;clock.textContent=tt}
  for(let i=0;i<S.players;i++){
    const a=R[i],fin=a.r.fin;
    const d=fin!=null?`${fmt(fin)} s`:`${Math.min(RACE_M,Math.floor(a.r.x))} m`;
    if(d!==shownD[i]){shownD[i]=d;dEl[i].textContent=d;dEl[i].parentElement!.parentElement!.classList.toggle("fin",fin!=null)}
    const k=a.res.map(r=>r==null?"":r?"ok":"x").join(",");
    if(k!==shownK[i]){shownK[i]=k;a.res.forEach((r,j)=>kEl[i].children[j].className=r==null?"":r?"ok":"x")}
    vEl[i].style.transform=`scaleX(${Math.min(1,a.r.v/V_MAX).toFixed(3)})`;
    mEl[i].style.transform=`translateX(${Math.min(100,Math.max(0,a.r.x)).toFixed(1)}%)`;
    // orange "Ruoškis…" over the approach band, green "Šok!" over the take-off zone
    const q=phase==="race"?cue(a):"";
    if(q!==shownQ[i]){shownQ[i]=q;qEl[i].className=`hd-jump${q?" on hd-"+q:""}`;if(q)qEl[i].textContent=tr(q==="go"?"lj.jumpNow":"lj.getReady")}
  }
}

// ---------- results ----------
// what the TV board shows: live metres as the score, the 60 s race clock, the winner at the end (like the sprint)
function tvState():Partial<ScreenState>{
  const done=phase==="off"&&!endRoot.classList.contains("hide");
  const on=phase==="race"||phase==="done"||done;
  const metres=(i:number)=>Math.min(RACE_M,Math.max(0,Math.round(R[i].r.x)));
  const w:0|1|2=done&&!solo&&order.length?(order[0]+1) as 1|2:0;
  return {players:solo?1:2,duration:LIMIT_S,left:on?Math.max(0,LIMIT_S-raceT):LIMIT_S,round:0,mult:1,
    ex:{id:"hurdles",name:`${tr("hd.title")} · ${R.slice(0,S.players).map(a=>`${cleared(a)}/${N_HURDLES}`).join(" – ")}`.slice(0,40)},
    score:[metres(0),solo?0:metres(1)],reps:R.slice(0,S.players).reduce((n,a)=>n+a.r.steps,0),winner:w};
}
function finishRace(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  const n=S.players, h=loadHist();
  const times=[0,1].map(i=>i<n&&R[i].r.fin!=null?Math.round(R[i].r.fin!*100)/100:null), clr=R.map((a,i)=>i<n?cleared(a):0);
  h.unshift({t:Date.now(),players:n,duration:Math.round(raceT),ex:["knees"],score:[0,0],reps:R.map((a,i)=>i<n?a.r.steps:0),
    exReps:R.map((a,i)=>({knees:i<n?a.r.steps:0})),mode:"hurdles",times,clr});
  saveHist(h);
  const best=Math.min(...times.map(t=>t??1e9)), newPb=best<pb;
  const head=$("#hdResHead"),win=$("#hdWin"),sub=$("#hdSub");
  let w=-1;
  if(solo){
    const my=times[0];w=my!=null?0:-1;
    win.textContent=my!=null?`${fmt(my)} s`:tr("sp.dnf");
    sub.textContent=my==null?tr("sp.dnfSub"):tr("hd.clearedSub",{n:clr[0],total:N_HURDLES});
  }else{
    w=order.length?order[0]:-1;
    const tie=times[0]!=null&&times[0]===times[1];
    win.textContent=tie?tr("res.tie"):w<0?tr("sp.dnf"):tr("sp.wins",{name:NAMES[w]});
    sub.textContent=w<0?tr("sp.nobody"):times[1-w]!=null?tr("sp.gap",{t:fmt(Math.abs((times[0]??0)-(times[1]??0)))}):tr("sp.didNotFinish",{name:NAMES[1-w]});
    if(tie)w=-1;
  }
  head.dataset.w=String(w+1);
  $("#hdResArt").innerHTML=mascot(w===1?"b":"r",w<0?(solo?"lose":"idle"):"win",{anim:true});
  const rb=$("#hdRec");rb.hidden=!newPb;rb.textContent=tr(pb<1e9?"sp.newPb":"sp.firstPb");
  const rows=[...Array(n).keys()].sort((a,b)=>(times[a]??1e9)-(times[b]??1e9));
  $("#hdRows").replaceChildren(...rows.map((i,k)=>{
    const a=R[i],li=document.createElement("li");li.className=`sp-row hd-row p${i+1}`;li.style.setProperty("--i",String(k));
    li.innerHTML=`<span class="sp-place d">${times[i]!=null?k+1:"–"}</span>${face(i,"sp-row-face")}<span class="sp-row-txt"><b></b><small></small>${dots()}</span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=NAMES[i];
    li.querySelector(".sp-row-txt small")!.textContent=`${tr("hd.cleared",{n:clr[i],total:N_HURDLES})} · ${kmh(a.r.vTop)} km/h`;
    a.res.forEach((r,j)=>li.querySelectorAll(".hd-dots i")[j].className=r?"ok":"x");
    li.querySelector(".sp-row-t")!.textContent=times[i]!=null?`${fmt(times[i]!)} s`:tr("sp.dnfRow");
    return li;
  }));
  runRoot.classList.add("hide");document.body.classList.remove("sprinting","hurdling");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
  screenPhase("done");
}
$("#hdAgain").onclick=()=>{resetGame();startFlow(HURDLES_MODE)};
$("#hdHome").onclick=()=>{resetGame();screenPhase("idle");document.body.classList.remove("ingame");home()};

// test hooks (e2e / tools/hurdles-check.cjs): state probe, synthetic cadence, auto take-off d m before every hurdle
(window as any).__hd={
  state:()=>({phase,t:raceT,players:S.players,runs:R.slice(0,S.players).map(a=>({x:a.r.x,v:a.r.v,fin:a.r.fin,res:a.res.slice(),hop:!!a.hop,next:a.next}))}),
  feed:(cad:number)=>{feedCad=cad;feedAt=performance.now()}, // also ignores the camera (the e2e camera does jumping jacks)
  jumpAt:(d:number,i=-1)=>{if(i<0)autoD.fill(d);else autoD[i]=d}, // -1 = never (clip); i = one player, else both
};

export const HURDLES_MODE:GameMode={
  start:begin,
  tv:true,
  reset(){cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);callRoot.className="sp-call";
    setScreenMode(null);feedCad=0;autoD.fill(-1);
    runRoot.classList.add("hide");endRoot.classList.add("hide");document.body.classList.remove("sprinting","hurdling")},
  shown:()=>!endRoot.classList.contains("hide"),
};
