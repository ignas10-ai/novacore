// Game history: localStorage only, newest first, capped. History sheet (#histSheet) + the row builder the profile
// reuses. Stats/streaks/badges are computed from it in stats.ts (pure).
import {EX} from "../detect/exercises.ts";
import {S} from "../game/state.ts";
import {$} from "../ui/dom.ts";
import {refresh} from "../ui/router.ts";
import type {Game} from "./stats.ts";
import {t,tn,dec,locale} from "../i18n/i18n.ts";

const HIST_KEY="novacore.history", HIST_MAX=50, HIST_SHOW=10;
export function loadHist():Game[]{try{const h=JSON.parse(localStorage.getItem(HIST_KEY)||"[]");return Array.isArray(h)?h:[]}catch(e){return []}}
export function saveHist(h:Game[]){try{localStorage.setItem(HIST_KEY,JSON.stringify(h.slice(0,HIST_MAX)))}catch(e){}}
// best single-player score among games with this player count
function bestScore(h:Game[],p:number){return h.filter(g=>g.players===p).reduce((m,g)=>Math.max(m,...(g.score||[]).slice(0,p)),0)}
const histSheet=$<HTMLDialogElement>("#histSheet"), histList=$("#histList"), histOpen=$("#histOpen"), histClose=$("#histClose"), histDone=$("#histDone"), histClear=$("#histClear"), histNote=$("#histNote");
let histCloseTimer=0;
const exName=(id:string)=>EX.find(e=>e.id===id)?.name||id;
export function histItem(g:Game,i:number,best:number[]){
  const li=document.createElement("li");
  li.className="hist-item";
  li.style.setProperty("--i",String(i%10));
  const top=Math.max(...g.score.slice(0,g.players));
  if(top&&top===best[g.players])li.classList.add("best");
  const when=document.createElement("span");when.className="when";when.dataset.rec=t("prof.best"); // .best badge (CSS ::after)
  when.textContent=new Date(g.t).toLocaleString(locale(),{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  const what=document.createElement("span");what.className="what";
  const sprint=g.mode==="sprint", boxing=g.mode==="boxing", lj=g.mode==="longjump", hd=g.mode==="hurdles", ski=g.mode==="ski";
  what.textContent=ski?tn("hist.ski",g.players):lj?tn("hist.longjump",g.players):boxing?t("hist.boxing",{mode:t(g.players===1?"mode.solo":"mode.duel"),n:g.duration}):sprint?t("hist.sprint",{mode:t(g.players===1?"mode.solo":"mode.duel")}):hd?t("hist.hurdles",{mode:t(g.players===1?"mode.solo":"mode.duel")}):t("hist.game",{mode:t(g.players===1?"mode.Solo":"mode.Duel"),min:Math.round(g.duration/60),ex:(g.ex||[]).map(exName).join(", ")});
  const pts=document.createElement("span");pts.className="pts";
  // long jump: 1-4 players -> one number, the longest valid jump of the series
  if(lj){const b=document.createElement("b");b.className="d p1";const d=Math.max(0,...(g.jumps||[]).flat().map(x=>x??0));b.textContent=d?`${dec(d,2)} m`:"X";pts.append(b)}
  // skiing with 3-4 players: the row stays readable -> one number, the fastest final time
  else if(ski&&g.players>2){const b=document.createElement("b");b.className="d p1";const best=Math.min(...(g.times||[]).map(t=>t??Infinity));b.textContent=Number.isFinite(best)?`${dec(best,2)} s`:"–";pts.append(b)}
  else for(let p=0;p<g.players;p++){const b=document.createElement("b");b.className=`d p${p+1}`;const s=g.times?.[p];b.textContent=boxing?String(g.pts?.[p]??0):sprint||hd||ski?(s!=null?`${dec(s,2)} s`:"–"):String(g.score[p]??0);pts.append(b)}
  li.append(when,what,pts);
  return li;
}
export const bests=(h:Game[])=>[0,bestScore(h,1),bestScore(h,2)];
function renderHist(){
  const h=loadHist(), best=bests(h);
  histNote.textContent=h.length?t("hist.count",{n:h.length,max:HIST_MAX}):"";
  histClear.hidden=!h.length;
  if(!h.length){histList.replaceChildren(Object.assign(document.createElement("li"),{className:"hist-empty",textContent:t("hist.empty")}));return}
  histList.replaceChildren(...h.slice(0,HIST_SHOW).map((g,i)=>histItem(g,i,best)));
}
function openHist(){
  clearTimeout(histCloseTimer);
  histSheet.classList.remove("closing");
  renderHist();
  histOpen.setAttribute("aria-expanded","true");
  if(!histSheet.open)histSheet.showModal();
}
function closeHist(){
  if(!histSheet.open||histSheet.classList.contains("closing"))return;
  histSheet.classList.add("closing");
  histOpen.setAttribute("aria-expanded","false");
  clearTimeout(histCloseTimer);
  histCloseTimer=setTimeout(()=>{histSheet.classList.remove("closing");if(histSheet.open)histSheet.close()},210);
}
histOpen.addEventListener("click",openHist);
histClose.addEventListener("click",closeHist);
histDone.addEventListener("click",closeHist);
let clearArmed=0; // two taps: clearing history also resets streaks and badges
histClear.addEventListener("click",()=>{
  if(!clearArmed){histClear.textContent=t("hist.sure");clearArmed=setTimeout(()=>{clearArmed=0;histClear.textContent=t("hist.clear")},3000);return}
  clearTimeout(clearArmed);clearArmed=0;histClear.textContent=t("hist.clear");
  saveHist([]);renderHist();refresh();
});
histSheet.addEventListener("cancel",e=>{e.preventDefault();closeHist()});
histSheet.addEventListener("click",e=>{if(e.target===histSheet)closeHist()});
histSheet.addEventListener("close",()=>{clearTimeout(histCloseTimer);histSheet.classList.remove("closing");histOpen.setAttribute("aria-expanded","false")});
// returns true when this game beat the stored best for its player count (never on the very first game)
export function recordGame(){
  const {players,score,scoreEvents}=S;
  const h=loadHist(), prev=bestScore(h,players), top=Math.max(...score.slice(0,players));
  const reps=[0,1].map(i=>scoreEvents.filter(e=>e.player===i).length);
  const exReps=[0,1].map(i=>{const r:Record<string,number>={};for(const e of scoreEvents)if(e.player===i)r[e.ex]=(r[e.ex]||0)+1;return r});
  h.unshift({t:Date.now(),players,duration:S.duration,ex:S.activeEX.map(e=>e.id),score:score.slice(0,2),reps,exReps});
  saveHist(h);
  return prev>0&&top>prev;
}
// the game just recorded beat an opened challenge (badge "Iššūkis įveiktas")
export function markBeat(){const h=loadHist();if(h[0]){h[0].beat=true;saveHist(h)}}
