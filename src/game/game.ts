// Game flow: startFlow() → #loading → #ready (arm-hold gate, readyLoop) → loop() with rounds/scoring → finish() → #end → #clips.
// Not routed: entering #ready pushes one history entry (#/zaidimas, state.game) so Android back = "Atgal į nustatymus";
// back mid-game is swallowed, back on results/clips returns to the app. resetGame() makes "Žaisti dar kartą" reload-free.
import {ROUND_SECS,type Exercise} from "../detect/exercises.ts";
import {step,armsUp,sideCue} from "../detect/step.ts";
import type {Lm} from "../detect/classifier.ts";
import {highlightSegments} from "../clips/highlight.ts";
import {startRec,finishClips} from "../clips/clips.ts";
import {cam,detCv,openCamera,loadModel,sampleCamera,lastPoses,resetTracking,stopCamera,draw} from "../camera/camera.ts";
import {resetClips} from "../clips/clips.ts";
import {leaveApp,render,home,setBackHandler,depth} from "../ui/router.ts";
import {ensureAudio,sfx} from "../audio/sound.ts";
import {keepScreenAwake,releaseWakeLock} from "../ui/wakelock.ts";
import {demoRoot,showDemo,hideDemo} from "../ui/coach.ts";
import {renderResults} from "../ui/results.ts";
import {$,replay,setDigits,setCue,toast} from "../ui/dom.ts";
import {S} from "./state.ts";

const IDLE_DEMO_SECS=5; // re-show the coach card after this long without points
const READY_MS=3000, READY_GRACE=300; // hold arms up this long before the game starts
let readying=false, readyRaf=0, holdStart=0, lastReady=0, lastReadyDigit="", raf=0;
let lastRound=0, exShift=0, startTimer=0, nudgedRound=-1;
let lastHudSec=-1, lastBarAt=0;
const shown=["0","0"];

const readyRoot=$("#ready"), rdRing=$<SVGElement>("#rdRing"), rdCount=$("#rdCount"), readyHint=$("#readyHint"), rdChips=[$("#rd1"),$("#rd2")];
const loadingRoot=$("#loading"), loadMsg=$("#loadMsg");
const readyCue=$("#readyCue"), readyCueText=$("#readyCueText"), hintCue=$("#hintCue"), hintCueText=$("#hintCueText");
const hudRoot=$("#hud"), timerEl=$("#timer"), tbarEl=$("#tbar"), multEl=$("#mult"), exNameEl=$("#exName"), roundEl=$("#round"), hintEl=$("#hint"), scoreEls=[$("#s1"),$("#s2")];

function flash(i:number){S.fl[i]=performance.now();const f=$(`#f${i+1}`);f.textContent=`+${S.curMult}`;replay(f,"go-pop");replay($(`#e${i+1}`),"go-pop");sfx.rep(i)}
function detect(lm:Lm[],i:number,ex:string,mult:number){
  const now=performance.now();
  S.st[i].ar=detCv.width/detCv.height||1; // pose classifier needs the frame aspect (x/y are normalized separately)
  if(step(S.st[i],lm,ex,now)){
    const t=(now-S.t0)/1000;
    S.score[i]+=mult;
    S.scoreEvents.push({t,points:mult,player:i,ex});
    S.lastPointAt[i]=t;
    flash(i);
  }
}

const inGameEntry=()=>!!history.state?.game;
export async function startFlow(){
  $("#goTxt").textContent="Kraunama…";$("#go").setAttribute("aria-busy","true");
  document.body.classList.add("ingame"); // hides the tab bar; the current screen stays under #loading
  ensureAudio(); // user gesture: the only place an AudioContext may be created
  loadMsg.textContent="Ruošiama kamera ir judesio modelis";
  loadingRoot.classList.remove("hide");
  const loadingSince=performance.now();
  try{
    const sizeLabel=await openCamera();
    loadMsg.textContent=`Kamera ${sizeLabel} · ${Math.round(S.camFps)} fps · ruošiamas modelis`;
    console.info(`NovaCore kamera: ${cam.videoWidth}×${cam.videoHeight} @ ${Math.round(S.camFps)} fps`);
    await loadModel(S.players);
    const wait=700-(performance.now()-loadingSince);
    if(wait>0)await new Promise(r=>setTimeout(r,wait));
    leaveApp();
    if(!inGameEntry())history.pushState({d:depth()+1,game:1},"","#/zaidimas");
    document.body.classList.toggle("solo",S.players===1);
    readyRoot.classList.remove("hide");
    keepScreenAwake();
    loadingRoot.classList.add("hide");
    readying=true;
    readyLoop();
  }catch(e){
    console.error("Nepavyko paleisti žaidimo:",e);
    releaseWakeLock();
    stopCamera();
    cam.srcObject=null;
    readying=false;
    readyRoot.classList.add("hide");
    loadingRoot.classList.add("hide");
    $("#go").removeAttribute("aria-busy");
    $("#goTxt").textContent="Bandykite dar kartą";
    toast((e as Error)?.name==="NotAllowedError"?"Kamera neleista – leisk ją naršyklės nustatymuose.":"Nepavyko įjungti kameros ar modelio. Bandyk dar kartą.");
    exitGame();
  }
}
$("#go").onclick=startFlow;
// back into the app (router shows the screen of the current URL)
function exitGame(){
  S.duel?.end();
  document.body.classList.remove("ingame","playing");
  if(inGameEntry())history.back(); else render();
}

function startGame(){
  if(S.running)return;
  clearTimeout(startTimer);startTimer=0;
  nudgedRound=-1;S.lastPointAt[0]=S.lastPointAt[1]=0;
  lastHudSec=-1;lastBarAt=0;
  readyRoot.classList.add("hide");
  readyRoot.classList.remove("done","holding");
  setCue(readyCue,readyCueText,"","");setCue(hintCue,hintCueText,"","");
  keepScreenAwake();
  hudRoot.classList.add("on");
  document.body.classList.add("playing");
  lastRound=-1;
  // more selected exercises than 30 s rounds -> rotate the skipped one between games
  exShift=S.duel?S.duel.shift():S.activeEX.length>1?Math.floor(Math.random()*S.activeEX.length):0; // duel: same order on both phones
  startRec();
  S.lastRecDrawAt=performance.now();
  $("#recInd").hidden=!S.rec;
  S.running=true;S.t0=performance.now();
  loop();
}

function finishReady(){
  if(S.duel){S.duel.ready(startGame);return} // remote duel: both phones start at the same moment
  rdCount.textContent="Pirmyn!";
  rdCount.classList.add("word");
  replay(rdCount,"pop");
  readyHint.textContent="Puiku!";
  readyRoot.classList.add("done");
  startTimer=setTimeout(startGame,520);
}

function backToSettings(){
  readying=false;
  S.duel?.end();
  releaseWakeLock();
  clearTimeout(startTimer);startTimer=0;
  hideDemo();
  cancelAnimationFrame(readyRaf);
  holdStart=0;lastReady=0;lastReadyDigit="";
  readyRoot.classList.add("hide");
  readyRoot.classList.remove("holding","done");
  setCue(readyCue,readyCueText,"","");setCue(hintCue,hintCueText,"","");
  rdRing.style.strokeDashoffset="100";
  rdCount.textContent="3";
  rdCount.classList.remove("word","pop");
  rdChips.forEach(el=>el.dataset.ok="0");
  readyHint.textContent="Atsistokite taip, kad matytųsi visas kūnas";
  loadingRoot.classList.add("hide");
  stopCamera();
  cam.srcObject=null;
  resetTracking();
  $("#goTxt").textContent="Pradėti";
  $("#go").removeAttribute("aria-busy");
  document.body.classList.remove("ingame");
}
// the on-screen back button and Android back take the same path (popstate -> handler below)
$("#readyBack").onclick=()=>inGameEntry()?history.back():(backToSettings(),render());

// a finished game -> clean state for the next one without reloading the page
export function resetGame(){
  S.duel?.end();
  S.score=[0,0];S.scoreEvents=[];S.lastPointAt=[0,0];S.st=[{},{}] as typeof S.st;S.fl=[0,0];S.rec=null;
  shown[0]=shown[1]="0";scoreEls.forEach(e=>e.textContent="0");
  stopCamera();cam.srcObject=null;resetTracking();
  resetClips();
  $("#end").classList.add("hide");$("#clips").classList.add("hide");
  $("#goTxt").textContent="Pradėti";$("#go").removeAttribute("aria-busy");
}
const afterGameShown=()=>!$("#end").classList.contains("hide")||!$("#clips").classList.contains("hide");
document.querySelectorAll<HTMLElement>("[data-again]").forEach(b=>b.onclick=()=>{resetGame();startFlow()});
document.querySelectorAll<HTMLElement>("[data-home]").forEach(b=>b.onclick=()=>{resetGame();document.body.classList.remove("ingame");home()});
setBackHandler(()=>{
  if(S.running){history.pushState({d:depth()+1,game:1},"","#/zaidimas");return true} // ponytail: no exit mid-game (max 3 min)
  if(readying||!readyRoot.classList.contains("hide")){backToSettings();return false}
  if(afterGameShown()){resetGame();document.body.classList.remove("ingame");return false}
  return false;
});

function readyLoop(){
  if(!readying)return;
  const {players}=S;
  const now=performance.now();
  const sampled=sampleCamera(now);
  const poses=sampled||lastPoses;
  if(sampled)poses.forEach((p,i)=>draw(p.lm,i));

  const up=poses.map(p=>armsUp(p.lm));
  rdChips.forEach((el,i)=>el.dataset.ok=(i<poses.length&&up[i])?"1":"0");

  const allVisible=poses.length===players;
  const allReady=allVisible&&up.slice(0,players).every(Boolean);
  const sides=poses.map(p=>sideCue(p.lm));
  if(!allVisible)setCue(readyCue,readyCueText,"back","Atsitrauk");
  else if(sides.some(Boolean)){
    const k=sides.findIndex(Boolean),dir=sides[k];
    setCue(readyCue,readyCueText,dir,`P${k+1} · ${dir==="left"?"į kairę":"į dešinę"}`);
  }else if(!allReady)setCue(readyCue,readyCueText,"arms","Rankos aukštyn");
  else setCue(readyCue,readyCueText,"","");
  if(allReady){
    lastReady=now;
    if(!holdStart)holdStart=now;
  }else if(holdStart&&now-lastReady>READY_GRACE){
    holdStart=0;
  }

  const held=holdStart?Math.min(READY_MS,now-holdStart):0;
  const pct=held/READY_MS;
  rdRing.style.strokeDashoffset=String(100-pct*100);

  const digit=holdStart?String(Math.max(1,Math.ceil((READY_MS-held)/1000))):"3";
  if(digit!==lastReadyDigit){lastReadyDigit=digit;rdCount.textContent=digit;replay(rdCount,"pop")}
  readyRoot.classList.toggle("holding",allReady);
  readyRoot.classList.toggle("done",pct>=1);

  let msg;
  if(!allVisible){
    const missing=players-poses.length;
    msg=missing===1?"Nematau žaidėjo – įsirikiuokite, kad matytųsi visas kūnas":`Nematau ${missing} žaidėjų – įsirikiuokite, kad matytųsi visi`;
  }else if(!allReady){
    const waiting=up.slice(0,players).map((ok,i)=>ok?null:`P${i+1}`).filter(Boolean);
    msg=waiting.length===1?`${waiting[0]}: pakelkite abi rankas virš galvos`:"Pakelkite abi rankas virš galvos";
  }else msg="Puiku – laikykite rankas virš galvos";
  if(readyHint.textContent!==msg)readyHint.textContent=msg;

  if(pct>=1){readying=false;cancelAnimationFrame(readyRaf);finishReady();return}
  readyRaf=requestAnimationFrame(readyLoop);
}

function loop(){
  if(!S.running)return;
  const {players,duration,score,st,lastPointAt}=S;
  const now=performance.now();
  const el=(now-S.t0)/1000, left=Math.max(0,duration-el);
  const round=Math.floor(el/ROUND_SECS), mult=1+round, ex:Exercise=S.activeEX[(round+exShift)%S.activeEX.length];
  const sec=Math.floor(left);
  if(sec!==lastHudSec){lastHudSec=sec;timerEl.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;if(sec>0&&sec<=10)sfx.tick()}
  if(now-lastBarAt>=100){lastBarAt=now;tbarEl.style.transform=`scaleX(${left/duration})`}
  S.curMult=mult;
  if(round!==lastRound){lastRound=round;multEl.textContent=`×${mult}`;exNameEl.textContent=ex.name;roundEl.textContent=`${ex.name} · ×${mult}`;replay(roundEl,"go-pop");showDemo(ex);sfx.round()}
  // the camera is slower than the screen: skip all pose work until a new frame arrives
  const poses=sampleCamera(now);
  if(poses){
    // assign by x: leftmost on screen (mirrored) = player 1
    poses.forEach((p,i)=>{detect(p.lm,i,ex.id,mult);draw(p.lm,i)});
    const lost=poses.map((p,i)=>st[i].lost?i+1:0).filter(Boolean);
    const missing=poses.length<players?`Nematau ${players-poses.length===2?"žaidėjų":"žaidėjo "+(poses.length+1)}`:lost.length?`P${lost.join(" ir P")}: atsitrauk, nesimato viso kūno`:"";
    if(hintEl.textContent!==missing)hintEl.textContent=missing;
    const sides=poses.map(p=>sideCue(p.lm));
    if(poses.length<players)setCue(hintCue,hintCueText,"back","Įsirikiuok");
    else if(sides.some(Boolean)){
      const k=sides.findIndex(Boolean),dir=sides[k];
      setCue(hintCue,hintCueText,dir,`P${k+1} · ${dir==="left"?"į kairę":"į dešinę"}`);
    }else if(lost.length)setCue(hintCue,hintCueText,"back",`P${lost.join(" ir P")} · atsitrauk`);
    else setCue(hintCue,hintCueText,"","");
  }
  [0,1].forEach(i=>{const v=String(score[i]);if(v!==shown[i]){shown[i]=v;setDigits(scoreEls[i],v)}});
  const roundStart=round*ROUND_SECS;
  if(nudgedRound!==round&&el-roundStart>IDLE_DEMO_SECS&&!demoRoot.classList.contains("on")){
    let idle=false;
    for(let i=0;i<players;i++)if(el-Math.max(lastPointAt[i],roundStart)>IDLE_DEMO_SECS)idle=true;
    if(idle){showDemo(ex);nudgedRound=round}
  }
  if(left<=0){finish();return}
  raf=requestAnimationFrame(loop);
}

function finish(){
  S.running=false;cancelAnimationFrame(raf);
  releaseWakeLock();
  hideDemo();
  setCue(hintCue,hintCueText,"","");setCue(readyCue,readyCueText,"","");
  document.body.classList.remove("playing");
  if(S.players===1)S.score[1]=0;
  const end=renderResults();
  S.duel?.finish(); // remote duel: send the final score, show both on #end
  sfx.finish();
  const highlightTotal=Math.min(S.duration,Math.max(0,(performance.now()-S.t0)/1000));
  const highlightPlan=highlightSegments(S.scoreEvents,highlightTotal,4,16,S.activeEX.length);
  hudRoot.classList.remove("on");end.classList.remove("hide");
  stopCamera();
  finishClips(highlightPlan,highlightTotal);
}
