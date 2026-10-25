// Sprintas 100 m: run in place in front of the camera, every knee lift (step(...,"knees")) is a step, cadence -> speed
// (speed.ts) -> a side-view race on a canvas (scene.ts + runner.ts). Red P1 vs blue P2, or solo vs a ghost of the best run.
// Flow: Pradžia tile -> #/sprintas (setup) -> startFlow(SPRINT) -> #loading -> #ready (arms-up gate, game.ts) ->
// SPRINT.start(): #sprintRun countdown "Į starto pozicijas… Dėmesio… Marš!" -> race -> finish -> #sprintEnd results.
// Integration points stay small: the GameMode hook in game.ts, the "sprint" route in router.ts, one import in main.ts.
import "./sprint.css";
import {S} from "../game/state.ts";
import {startFlow,resetGame,type GameMode} from "../game/game.ts";
import {step} from "../detect/step.ts";
import {sampleCamera,draw,detCv,cv,stopCamera} from "../camera/camera.ts";
import {sfx} from "../audio/sound.ts";
import {releaseWakeLock} from "../ui/wakelock.ts";
import {onView,home} from "../ui/router.ts";
import {fillIcons} from "../ui/icons.ts";
import {loadHist,saveHist} from "../history/history.ts";
import type {Game} from "../history/stats.ts";
import {$,plural} from "../ui/dom.ts";
import {RACE_M,V_MAX,runner,onStep,advance,simulate,ghostX,type Runner} from "./speed.ts";
import {LOOKS,newPose,runPose,setPose,standPose,winPose,drawRunner,type Pose} from "./runner.ts";
import {mascot,avatar} from "../ui/mascots.ts";
import {layout,build,drawBack,drawFinishBack,drawFinishFront,drawFront,sx,SKEW,type Layout} from "./scene.ts";

const NAMES=["Raudonas","Mėlynas"];
const DEFAULT_GHOST=simulate(2.8).splits; // ~15 s: the target before the first run
const POS_S=1.7, SET_MIN=1.3, SET_MAX=2.3, END_AFTER=8, LIMIT_S=60, RESULTS_DELAY=2200;
const fmt=(s:number)=>s.toFixed(2).replace(".",",");
const kmh=(v:number)=>Math.round(v*3.6);
const face=(i:number,cls="")=>`<span class="${cls}">${avatar(i?"b":"r")}</span>`;

// ---------- markup (built here so the shared index.html stays untouched) ----------
const tile=document.createElement("a");
tile.className="sp-tile tap";tile.href="#/sprintas";tile.dataset.tone="yellow";
tile.innerHTML=`<span class="sp-tile-txt"><span class="eyebrow">Naujas žaidimas</span><b class="d">Sprintas 100&nbsp;m</b><small>Bėk vietoje – kas pirmas iki finišo?</small></span>
<span class="sp-tile-art" aria-hidden="true">${mascot("b","knees",{anim:true})}${mascot("r","knees",{anim:true})}</span><span class="sp-tile-go" data-icon="arrow-right"></span>`;
(document.getElementById("rankCard")??document.querySelector("#home .col:last-child"))?.after(tile);

const app=document.getElementById("app")??document.body;
app.insertAdjacentHTML("beforeend",`
<section class="screen app hide" id="sprint" aria-labelledby="spTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in"><a class="icon-btn tap" href="#/" data-back aria-label="Atgal"><span data-icon="chevron-left"></span></a><h1 class="nav-title" id="spTitle" tabindex="-1">Sprintas 100 m</h1><span class="nav-spacer"></span></div></header>
    <div class="sp-hero"><canvas id="spHeroCv" aria-hidden="true"></canvas><span class="sp-hero-big">100 M</span><span class="sp-hero-sub">Sprintas</span></div>
    <section class="pick" aria-label="Žaidėjai">
      <div class="seg sp-seg" role="group" aria-label="Bėgikų skaičius">
        <button data-sp="2" aria-pressed="true"><span><b class="d">2</b><small>dvikova</small></span></button>
        <button data-sp="1" aria-pressed="false"><span><b class="d">1</b><small>prieš šešėlį</small></span></button>
      </div>
    </section>
    <div class="card sp-pb"><span class="sp-pb-ic" data-icon="trophy"></span><div><small class="eyebrow">Tavo rekordas</small><b class="d" id="spPb">–</b><p class="help" id="spPbTxt"></p></div></div>
    <section class="card sp-how" aria-labelledby="spHowT">
      <h2 class="card-title" id="spHowT">Kaip bėgti</h2>
      <ol>
        <li><span data-icon="smartphone"></span><span>Pastatyk telefoną 2–3 m atstumu, kad matytųsi visas kūnas.</span></li>
        <li><span data-icon="timer"></span><span>Pakelk rankas – po šūvio „Marš!“ bėk vietoje.</span></li>
        <li><span data-icon="footprints"></span><span>Kuo dažniau keli kelius, tuo greičiau bėga tavo personažas.</span></li>
      </ol>
    </section>
    <div class="cta">
      <button class="go tap" id="spGo" type="button"><span>Į startą</span><span data-icon="arrow-right"></span></button>
      <p class="fine">Vaizdas apdorojamas tik telefone ir niekur nesiunčiamas.</p>
    </div>
  </div>
</section>`);
document.body.insertAdjacentHTML("beforeend",`
<div class="screen sp-run hide" id="sprintRun">
  <canvas id="spCv" role="img" aria-label="Bėgimo takas"></canvas>
  <div class="sp-hud">
    <div class="sp-top">
      <div class="sp-card p1" id="spC1">${face(0,"sp-face")}<div class="sp-card-in"><b class="d" id="spD1">0 m</b><span class="sp-bar"><i id="spV1"></i></span></div></div>
      <div class="sp-clock"><span class="d" id="spT">0,00</span></div>
      <div class="sp-card p2" id="spC2">${face(1,"sp-face")}<div class="sp-card-in"><b class="d" id="spD2">0 m</b><span class="sp-bar"><i id="spV2"></i></span></div></div>
    </div>
    <div class="sp-map" aria-hidden="true"><i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i>
      <span class="sp-dotw" id="spM2"><b class="sp-dot p2"></b></span><span class="sp-dotw" id="spM1"><b class="sp-dot p1"></b></span><span class="sp-flag"></span></div>
  </div>
  <div class="sp-call" id="spCall" aria-live="assertive"><b class="d" id="spCallT"></b><small id="spCallS"></small></div>
</div>
<section class="screen hide" id="sprintEnd" aria-labelledby="spWin">
  <div class="wrap">
    <header class="sp-res-head" id="spResHead">
      <span class="sp-res-art" id="spResArt" aria-hidden="true"></span>
      <span class="wl">Sprintas 100 m</span>
      <h2 class="d" id="spWin">Raudonas laimi!</h2>
      <p id="spSub"></p>
      <span class="rec-badge" id="spRec" hidden>Naujas rekordas!</span>
    </header>
    <ol class="sp-rows" id="spRows" aria-label="Rezultatai"></ol>
    <div class="cta">
      <button class="go" id="spAgain" type="button"><span data-icon="rotate-ccw"></span>Bėgti dar kartą</button>
      <button class="go alt" id="spHome" type="button"><span data-icon="house"></span>Į pradžią</button>
    </div>
  </div>
</section>`);
fillIcons(document);

const runRoot=$("#sprintRun"), endRoot=$("#sprintEnd"), cvs=$<HTMLCanvasElement>("#spCv"), ctx=cvs.getContext("2d",{alpha:false})!;
const callRoot=$("#spCall"), callT=$("#spCallT"), callS=$("#spCallS"), clock=$("#spT");
const dEl=[$("#spD1"),$("#spD2")], vEl=[$("#spV1"),$("#spV2")], mEl=[$("#spM1"),$("#spM2")], cardEl=[$("#spC1"),$("#spC2")];

// ---------- history: sprint games live in novacore.history with mode "sprint" (times in s, 10 m splits) ----------
function bestRun(h:Game[]){
  let best:{t:number;sp:number[]}|null=null;
  for(const g of h)if(g.mode==="sprint")(g.times||[]).forEach((t,i)=>{if(t!=null&&(!best||t<best.t))best={t,sp:g.splits?.[i]||[]}});
  return best as {t:number;sp:number[]}|null;
}

// ---------- setup screen ----------
const segBtns=[...document.querySelectorAll<HTMLElement>("[data-sp]")];
function syncSeg(){segBtns.forEach(b=>{const on=Number(b.dataset.sp)===S.players;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))})}
segBtns.forEach(b=>b.onclick=()=>{
  document.querySelector<HTMLElement>(`[data-p="${b.dataset.sp}"]`)?.click(); // same state as the rep game's setup
  if(S.players!==Number(b.dataset.sp))S.players=Number(b.dataset.sp);
  syncSeg();renderPb();
});
function renderPb(){
  const b=bestRun(loadHist());
  $("#spPb").textContent=b?`${fmt(b.t)} s`:"–";
  $("#spPbTxt").textContent=S.players===1?(b?"Šešėlis bėgs tavo rekordo tempu.":`Dar nebėgai. Šešėlis bėgs ${fmt(DEFAULT_GHOST[9])} s.`):(b?"Geriausias laikas šiame telefone.":"Dar nebėgai – nustatyk pirmą rekordą.");
}
let heroRaf=0;
const heroCv=$<HTMLCanvasElement>("#spHeroCv"), heroCtx=heroCv.getContext("2d")!, heroPose=newPose();
function hero(now:number){
  if(document.body.dataset.view!=="sprint"||document.body.classList.contains("ingame")){heroRaf=0;return}
  heroRaf=requestAnimationFrame(hero);
  const r=heroCv.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
  if(heroCv.width!==Math.round(r.width*dpr)){heroCv.width=Math.round(r.width*dpr);heroCv.height=Math.round(r.height*dpr)}
  const W=r.width,H=r.height,t=now/1000;
  heroCtx.setTransform(dpr,0,0,dpr,0,0);heroCtx.clearRect(0,0,W,H);
  const h=H*.62;
  for(let k=1;k>=0;k--){ // Mėlynas behind, Raudonas in front
    runPose(heroPose,(t*1.55+k*.37)%1,.95);
    const x=W*(k?.82:.62),g=H*(k?.8:.92);
    heroCtx.fillStyle="rgba(20,24,58,.16)";heroCtx.beginPath();heroCtx.ellipse(x,g,h*.2,h*.035,0,0,Math.PI*2);heroCtx.fill();
    drawRunner(heroCtx,LOOKS[k],heroPose,x,g,h*(k?.9:1));
  }
}
onView("sprint",()=>{syncSeg();renderPb();if(!heroRaf)heroRaf=requestAnimationFrame(hero)});
$("#spGo").onclick=()=>startFlow(SPRINT);

// ---------- race state ----------
type Phase="off"|"pos"|"set"|"race"|"done";
let phase:Phase="off", phaseAt=0, setDur=0, t0=0, raceT=0, falseStarts=0, raf=0, last=0, firstFin=-1, doneAt=0, brokeAt=-1, cam=0, hudAt=0, callTimer=0;
let L:Layout, ghost:number[]=[], solo=false;
const R:Runner[]=[runner(),runner()];
const G={x:0,v:0,fin:-1};
const poses:Pose[]=[newPose(),newPose()], cyc=[0,0], vis=[0,0], lane=[0,1], lastFrac=[0,0];
let order:number[]=[]; // finishing order (player index)
// pools (no per-frame allocation): dust puffs [x m, lane, age, size] and confetti [x, y, vx, vy, rot, colour, age]
const DUST=40, dust=new Float32Array(DUST*4).fill(-1); let dustN=0;
const CONF=90, conf=new Float32Array(CONF*7); let confOn=false;
const CONF_COL=["#FF3B3B","#2F6BFF","#FFC61A","#FFFFFF","#12B886","#FF4F93"];
// frame timing for the headless fps report (window.__sprintPerf)
const FT=new Float32Array(600), WT=new Float32Array(600), DT=new Float32Array(600); let fn=0;
(window as any).__sprintPerf=()=>{const n=Math.min(fn,600);if(!n)return null;const a=[...FT.slice(0,n)].sort((x,y)=>x-y),w=[...WT.slice(0,n)].sort((x,y)=>x-y),avg=a.reduce((s,v)=>s+v,0)/n;
  return {frames:fn,fps:Math.round(1000/avg*10)/10,p95FrameMs:Math.round(a[Math.floor(n*.95)]*10)/10,workMsAvg:Math.round(w.reduce((s,v)=>s+v,0)/n*100)/100,workMsP95:Math.round(w[Math.floor(n*.95)]*100)/100,drawMsAvg:Math.round([...DT.slice(0,n)].reduce((s,v)=>s+v,0)/n*100)/100,drawMsP95:Math.round([...DT.slice(0,n)].sort((x,y)=>x-y)[Math.floor(n*.95)]*100)/100}};

function call(t:string,s="",cls="",ms=0){
  clearTimeout(callTimer);
  callT.textContent=t;callS.textContent=s;callRoot.className=`sp-call on ${cls}`;
  void callRoot.offsetWidth;callRoot.classList.add("pop");
  if(ms)callTimer=setTimeout(()=>callRoot.classList.remove("on"),ms);
}
function enter(p:Phase,now:number){
  phase=p;phaseAt=now;
  if(p==="pos"){call("Į starto pozicijas","Bėk vietoje, kai nuskambės šūvis");sfx.tick()}
  else if(p==="set"){setDur=SET_MIN+Math.random()*(SET_MAX-SET_MIN);call("Dėmesio…","","is-set");sfx.tick()}
  else if(p==="race"){t0=now;call("Marš!","","is-go",900);sfx.gun()}
}
function knee(i:number,now:number){
  S.fl[i]=now; // skeleton glow in the camera corner
  if(phase==="set"&&falseStarts<2){
    falseStarts++;
    call("Per anksti!",`${S.players===2?`P${i+1} `:""}pajudėjo prieš šūvį – iš naujo`,"is-bad");
    sfx.round();phase="pos";phaseAt=now+700; // a beat longer on the false-start call
    return;
  }
  if((phase==="race"||phase==="done")&&R[i].fin==null){onStep(R[i],(now-t0)/1000);sfx.step(i)} // past the line: coast to a stop
}

function resize(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  L=layout(W,H,dpr);build(ctx,L);
  if(cv.width)document.body.style.setProperty("--sp-cam-ar",String(cv.width/cv.height));
}
addEventListener("resize",()=>{if(phase!=="off")resize()});

function begin(){
  solo=S.players===1;
  for(const r of R)Object.assign(r,runner());
  const b=bestRun(loadHist());
  ghost=b&&b.sp.length===10?b.sp:DEFAULT_GHOST;
  G.x=G.v=0;G.fin=-1;
  lane[0]=solo?1:0;lane[1]=solo?0:1; // solo: you in the near lane, the ghost behind
  cyc[0]=0;cyc[1]=.5;order=[];firstFin=-1;brokeAt=-1;falseStarts=0;raceT=0;confOn=false;dust.fill(-1);
  runRoot.classList.remove("hide");runRoot.classList.toggle("solo",solo);
  cardEl[1].classList.toggle("ghost",solo);
  document.body.classList.add("sprinting");
  resize();
  cam=-(L.W/L.ppm)*.3;
  document.fonts?.load("400 40px \"Titan One\"","FINIŠAS 0123456789").then(()=>{if(phase!=="off")build(ctx,L)}).catch(()=>{});
  S.running=true; // game.ts swallows Android back while running
  last=performance.now();fn=0;
  enter("pos",last);
  cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}

function frame(now:number){
  raf=requestAnimationFrame(frame);
  const work0=performance.now();
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));
  if(fn>0)FT[(fn-1)%600]=now-last;
  last=now;
  const ps=sampleCamera(now);
  if(ps)for(let i=0;i<ps.length;i++){
    S.st[i].ar=detCv.width/detCv.height||1;
    if(step(S.st[i],ps[i].lm,"knees",now))knee(i,now);
    draw(ps[i].lm,i);
  }
  const tp=(now-phaseAt)/1000;
  if(phase==="pos"&&tp>POS_S)enter("set",now);
  else if(phase==="set"&&tp>setDur)enter("race",now);
  if(phase==="race"||phase==="done"){
    const t=raceT=(now-t0)/1000;
    for(let i=0;i<S.players;i++){
      const r=R[i],had=r.fin!=null;
      advance(r,t,dt);
      if(!had&&r.fin!=null)finished(i,now);
    }
    if(solo){const x=ghostX(ghost,t);G.v=dt?(x-G.x)/dt:0;G.x=x;if(G.fin<0&&x>=RACE_M)G.fin=ghost[9]}
    if(phase==="race"){
      const all=R.slice(0,S.players).every(r=>r.fin!=null);
      if(all||(firstFin>=0&&t-firstFin>END_AFTER)||t>LIMIT_S){phase="done";doneAt=now;if(!all&&firstFin<0)call("Laikas baigėsi","","is-bad")}
    }else if(now-doneAt>RESULTS_DELAY){finishRace();return}
  }
  const d0=performance.now();render(now,dt);DT[fn%600]=performance.now()-d0;
  if(now-hudAt>80){hudAt=now;hud()}
  WT[fn%600]=performance.now()-work0;fn++;
}
function finished(i:number,now:number){
  order.push(i);
  if(firstFin<0){firstFin=R[i].fin!;brokeAt=raceT;confettiBurst();sfx.finish()}
  else sfx.round();
  call("Finišas!",`${NAMES[i]} · ${fmt(R[i].fin!)} s`,`is-fin p${i+1}`);
  void now;
}
function confettiBurst(){
  confOn=true;
  for(let k=0;k<CONF;k++){const o=k*7;conf[o]=L.W*(.2+Math.random()*.6);conf[o+1]=-10-Math.random()*L.H*.3;conf[o+2]=(Math.random()-.5)*120;conf[o+3]=80+Math.random()*160;conf[o+4]=Math.random()*6;conf[o+5]=k%CONF_COL.length;conf[o+6]=0}
}

// ---------- drawing ----------
const laneY=(k:number)=>L.lane[k];
const screenX=(m:number,k:number)=>sx(m,cam)+(L.trackBot-laneY(k))*SKEW;
function animate(k:number,v:number,fin:boolean,won:boolean,dt:number,t:number){
  const o=poses[k];
  if(phase==="pos"||phase==="off"){standPose(o,t+k);return}
  if(phase==="set"){setPose(o,t+k);return}
  if(v<.35||(fin&&v<1.6)){if(fin&&won)winPose(o,t);else standPose(o,t);return} // past the line: cheer or catch breath
  cyc[k]+=dt*v*.2;
  const p=cyc[k]%1;runPose(o,p,Math.min(1,.3+v/9));
  // dust at each foot contact (phase .4 / .9)
  const f=lastFrac[k];lastFrac[k]=p;
  if(v>2&&((f<.4&&p>=.4)||(f<.9&&p>=.9)||(f>p&&p>=.9)))puff(k,v);
}
function puff(k:number,v:number){
  const o=(dustN++%DUST)*4,x=(k===lane[0]?R[0].x:solo?G.x:R[1].x);
  dust[o]=x-.15;dust[o+1]=k;dust[o+2]=0;dust[o+3]=.6+v/V_MAX;
}
function body(k:number,look:number,x:number,v:number,alpha:number,label:string){
  const h=L.charH[k],gy=laneY(k),X=screenX(x,k),o=poses[k];
  if(X<-h||X>L.W+h){edge(k,look,X<0,x,label);return}
  // shadow (shrinks in flight), speed lines, the runner
  ctx.globalAlpha=alpha*(.22-o.bob*2);ctx.fillStyle="#14183A";ctx.beginPath();ctx.ellipse(X+h*.02,gy+2,h*.2,h*.035,0,0,Math.PI*2);ctx.fill();
  if(v>5){
    const a=Math.min(.6,(v-5)/6.5*.6)*alpha;ctx.globalAlpha=a;ctx.fillStyle="#FFFFFF";
    for(let j=0;j<4;j++){const y=gy-h*(.28+j*.15),len=h*(.35+.5*a)*(1+.3*Math.sin(raceT*20+j*2)),x0=X-h*(.32+((j*37)%10)/40);ctx.fillRect(x0-len,y,len,Math.max(2,h*.018))}
  }
  ctx.globalAlpha=alpha;
  const p=cyc[k]%1, sq=v>.35?1-.035*Math.min(1,v/8)*Math.cos(4*Math.PI*(p-.4)):1;
  drawRunner(ctx,LOOKS[look],o,X,gy,h,sq);
  if(label){ctx.globalAlpha=alpha*.95;tag(X,gy-h*1.08,label,look)}
  ctx.globalAlpha=1;
}
function tag(x:number,y:number,txt:string,look:number){
  ctx.font="800 13px Nunito,system-ui,sans-serif";
  const w=ctx.measureText(txt).width+18;
  ctx.fillStyle=look?"#2F6BFF":"#FF3B3B";ctx.beginPath();ctx.roundRect(x-w/2,y-12,w,24,12);ctx.fill();
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(txt,x,y+.5);
}
// a runner outside the view: a pill on that edge of their lane with the gap in metres
function edge(k:number,look:number,left:boolean,x:number,label:string){
  // gap to the humans' leader (the ghost's gap is to the player)
  let lead=-1e9;for(let i=0;i<S.players;i++)if(R[i].x!==x)lead=Math.max(lead,R[i].x);
  const gap=lead<-1e8?0:Math.round(Math.abs(lead-x));
  const y=laneY(k)-L.charH[k]*.5,txt=`${label||NAMES[look]} ${left?"−":"+"}${gap} m`;
  ctx.font="800 13px Nunito,system-ui,sans-serif";const w=ctx.measureText(txt).width+34;
  const X=left?12:L.W-12-w;
  ctx.fillStyle=look?"#2F6BFF":"#FF3B3B";ctx.beginPath();ctx.roundRect(X,y-15,w,30,15);ctx.fill();
  ctx.fillStyle="#fff";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(txt,X+(left?24:12),y+.5);
  ctx.beginPath();const ax=left?X+12:X+w-12;ctx.moveTo(ax+(left?-5:5),y);ctx.lineTo(ax+(left?3:-3),y-6);ctx.lineTo(ax+(left?3:-3),y+6);ctx.fill();
}
function render(now:number,dt:number){
  const t=now/1000, viewM=L.W/L.ppm;
  // camera: frame both humans when close, otherwise follow the leader; hold just past the finish
  let target=-viewM*.3,leadV=0;
  if(phase==="race"||phase==="done"){
    // follow whoever is still racing (after the winner crosses, the camera goes back for the other runner)
    let lead=-1e9,trail=1e9;const racing=R.slice(0,S.players).some(r=>r.fin==null);
    for(let i=0;i<S.players;i++){const r=R[i];if(racing&&r.fin!=null)continue;if(r.x>lead){lead=r.x;leadV=r.v}trail=Math.min(trail,r.x)}
    target=lead-trail<viewM*.5?(lead+trail)/2-viewM*.5:lead-viewM*(L.portrait?.6:.68);
    if(S.players===1)target=lead-viewM*(L.portrait?.5:.55);
    target=racing?Math.min(Math.max(target,-viewM*.3),RACE_M+2-viewM*.5):lead-viewM*.5; // all in: watch them coast and cheer
  }
  // move with the leader (no steady lag: the view is only ~4-15 m wide), then ease out the remaining error
  if(cam<target)cam+=Math.min(leadV*dt,target-cam);
  cam+=(target-cam)*(1-Math.exp(-dt*3.5));
  drawBack(ctx,cam);drawFinishBack(ctx,cam);
  // dust puffs (under the runners)
  for(let d=0;d<DUST;d++){const o=d*4;if(dust[o+2]<0)continue;dust[o+2]+=dt;const age=dust[o+2];if(age>.55){dust[o+2]=-1;continue}
    const k=dust[o+1],X=screenX(dust[o]-age*1.2,k),y=laneY(k),r=L.charH[k]*.035*dust[o+3]*(1+age*2.5);
    ctx.globalAlpha=.5*(1-age/.55)**2;ctx.fillStyle="#F2D9C4";ctx.beginPath();ctx.ellipse(X,y-r*.4,r*1.4,r*.7,0,0,Math.PI*2);ctx.fill()}
  ctx.globalAlpha=1;
  // far lane first
  const v0=solo?G.v:R[0].v, v1=solo?R[0].v:R[1].v;
  const won=(i:number)=>order[0]===i&&(!solo||R[0].fin!=null&&(G.fin<0||R[0].fin<=G.fin));
  if(solo){
    animate(0,G.v,G.fin>=0,false,dt,t);body(0,1,G.x,G.v,.42,"Šešėlis");
    animate(1,R[0].v,R[0].fin!=null,won(0),dt,t);body(1,0,R[0].x,R[0].v,1,"");
  }else{
    animate(0,v0,R[0].fin!=null,won(0),dt,t);body(0,0,R[0].x,v0,1,"");
    animate(1,v1,R[1].fin!=null,won(1),dt,t);body(1,1,R[1].x,v1,1,"");
  }
  drawFinishFront(ctx,cam,brokeAt<0?-1:raceT-brokeAt);
  drawFront(ctx,cam);
  if(confOn){
    let any=false;
    for(let k=0;k<CONF;k++){const o=k*7;conf[o+6]+=dt;if(conf[o+1]>L.H+20)continue;any=true;
      conf[o+3]+=dt*60;conf[o]+=conf[o+2]*dt+Math.sin(conf[o+6]*6+k)*.6;conf[o+1]+=conf[o+3]*dt;conf[o+4]+=dt*8;
      ctx.save();ctx.translate(conf[o],conf[o+1]);ctx.rotate(conf[o+4]);ctx.fillStyle=CONF_COL[conf[o+5]];ctx.fillRect(-4,-2.5,8,5);ctx.restore()}
    confOn=any;
  }
}
// HUD: text only when it changes, bars/dots by transform (compositor only)
const shownD=["",""],shownT=[""];
function hud(){
  let t=phase==="race"||phase==="done"?raceT:0;
  if(R.slice(0,S.players).every(r=>r.fin!=null))t=Math.max(...R.slice(0,S.players).map(r=>r.fin!)); // clock stops at the last finisher
  const tt=fmt(t);
  if(tt!==shownT[0]){shownT[0]=tt;clock.textContent=tt}
  for(let i=0;i<2;i++){
    const isGhost=solo&&i===1, x=isGhost?G.x:R[i].x, v=isGhost?G.v:R[i].v, fin=isGhost?(G.fin>=0?G.fin:null):R[i].fin;
    if(!solo&&i>=S.players)continue;
    const d=fin!=null?`${fmt(fin)} s`:`${Math.min(RACE_M,Math.floor(x))} m`;
    if(d!==shownD[i]){shownD[i]=d;dEl[i].textContent=d;cardEl[i].classList.toggle("fin",fin!=null)}
    vEl[i].style.transform=`scaleX(${Math.min(1,v/V_MAX).toFixed(3)})`;
    mEl[i].style.transform=`translateX(${Math.min(100,Math.max(0,x)).toFixed(1)}%)`;
  }
}

// ---------- results ----------
function finishRace(){
  cancelAnimationFrame(raf);
  phase="off";S.running=false;
  releaseWakeLock();stopCamera();
  const h=loadHist(), prev=bestRun(h);
  const times=[0,1].map(i=>i<S.players&&R[i].fin!=null?Math.round(R[i].fin!*100)/100:null);
  h.unshift({t:Date.now(),players:S.players,duration:Math.round(raceT),ex:["knees"],score:[0,0],reps:R.map((r,i)=>i<S.players?r.steps:0),
    exReps:R.map((r,i)=>({knees:i<S.players?r.steps:0})),mode:"sprint",times,splits:R.map(r=>r.splits.map(v=>Math.round(v*100)/100))});
  saveHist(h);
  const best=Math.min(...times.map(t=>t??1e9));
  const pb=best<1e9&&(!prev||best<prev.t);
  // header: who won
  const head=$("#spResHead"),win=$("#spWin"),sub=$("#spSub");
  let w=-1;
  if(solo){
    const t=times[0];
    w=t!=null&&t<=ghost[9]?0:1;
    win.textContent=t!=null?`${fmt(t)} s`:"Nebaigta";
    sub.textContent=t==null?"Iki finišo neprabėgta – bandyk dar kartą!":w===0?`Aplenkei šešėlį (${fmt(ghost[9])} s)!`:`Šešėlis buvo greitesnis: ${fmt(ghost[9])} s`;
  }else{
    w=order.length?order[0]:-1;
    const tie=times[0]!=null&&times[0]===times[1];
    win.textContent=tie?"Lygiosios!":w<0?"Nebaigta":`${NAMES[w]} laimi!`;
    sub.textContent=w<0?"Niekas nepasiekė finišo per minutę.":times[1-w]!=null?`Skirtumas ${fmt(Math.abs((times[0]??0)-(times[1]??0)))} s`:`${NAMES[1-w]} nepasiekė finišo`;
    if(tie)w=-1;
  }
  head.dataset.w=String(w+1);
  const artI=w<0?0:solo?0:w;
  $("#spResArt").innerHTML=mascot(artI?"b":"r",w<0&&!solo?"idle":"win",{anim:true});
  const rb=$("#spRec");rb.hidden=!pb;rb.textContent=prev?"Naujas rekordas!":"Pirmasis rekordas!";
  // rows: place, face, name, details, time
  const rows=[...Array(S.players).keys()].map(i=>({i,t:times[i],r:R[i],ghost:false}));
  if(solo)rows.push({i:1,t:ghost[9],r:runner(),ghost:true});
  rows.sort((a,b)=>(a.t??1e9)-(b.t??1e9));
  $("#spRows").replaceChildren(...rows.map((row,k)=>{
    const li=document.createElement("li");li.className=`sp-row p${row.i+1}${row.ghost?" ghost":""}`;li.style.setProperty("--i",String(k));
    const cad=row.r.steps&&row.t?row.r.steps/row.t:0;
    li.innerHTML=`<span class="sp-place d">${row.t!=null?k+1:"–"}</span>${face(row.i,"sp-row-face")}<span class="sp-row-txt"><b></b><small></small></span><b class="d sp-row-t"></b>`;
    li.querySelector(".sp-row-txt b")!.textContent=row.ghost?"Šešėlis":`${NAMES[row.i]}${S.players===2?` · P${row.i+1}`:""}`;
    li.querySelector(".sp-row-txt small")!.textContent=row.ghost?(bestRun(h.slice(1))?"Tavo ankstesnis rekordas":"Tikslinis laikas"):
      `${kmh(row.r.vTop)} km/h · ${row.r.steps} ${plural(row.r.steps,["žingsnis","žingsniai","žingsnių"])}${cad?` · ${cad.toFixed(1).replace(".",",")}/s`:""}`;
    li.querySelector(".sp-row-t")!.textContent=row.t!=null?`${fmt(row.t)} s`:"Nebaigė";
    return li;
  }));
  runRoot.classList.add("hide");document.body.classList.remove("sprinting");
  endRoot.classList.remove("hide");endRoot.scrollTop=0;
}
$("#spAgain").onclick=()=>{resetGame();startFlow(SPRINT)};
$("#spHome").onclick=()=>{resetGame();document.body.classList.remove("ingame");home()};

export const SPRINT:GameMode={
  start:begin,
  reset(){cancelAnimationFrame(raf);phase="off";S.running=false;clearTimeout(callTimer);callRoot.className="sp-call";
    runRoot.classList.add("hide");endRoot.classList.add("hide");document.body.classList.remove("sprinting")},
  shown:()=>!endRoot.classList.contains("hide"),
};
