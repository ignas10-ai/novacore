// Game history: localStorage only, newest first, capped. Start-screen records card + history sheet.
import {EX} from "../detect/exercises.ts";
import {S} from "../game/state.ts";
import {$} from "../ui/dom.ts";

interface Game{t:number;players:number;duration:number;ex:string[];score:number[];reps:number[]}
const HIST_KEY="novacore.history", HIST_MAX=50, HIST_SHOW=10;
function loadHist():Game[]{try{const h=JSON.parse(localStorage.getItem(HIST_KEY)||"[]");return Array.isArray(h)?h:[]}catch(e){return []}}
function saveHist(h:Game[]){try{localStorage.setItem(HIST_KEY,JSON.stringify(h.slice(0,HIST_MAX)))}catch(e){}}
// best single-player score among games with this player count
function bestScore(h:Game[],p:number){return h.filter(g=>g.players===p).reduce((m,g)=>Math.max(m,...(g.score||[]).slice(0,p)),0)}
const recRoot=$("#records"), histSheet=$<HTMLDialogElement>("#histSheet"), histList=$("#histList"), histOpen=$("#histOpen"), histClose=$("#histClose"), histDone=$("#histDone"), histClear=$("#histClear"), histNote=$("#histNote");
let histCloseTimer=0;
const exName=(id:string)=>EX.find(e=>e.id===id)?.name||id;
function renderRecords(){
  const h=loadHist();
  recRoot.hidden=!h.length;
  if(!h.length)return;
  $("#recBest1").textContent=String(bestScore(h,1));
  $("#recBest2").textContent=String(bestScore(h,2));
  $("#recGames").textContent=String(h.length);
  $("#recReps").textContent=String(h.reduce((n,g)=>n+(g.reps||[]).reduce((a,b)=>a+b,0),0));
  $("#histCount").textContent=String(Math.min(h.length,HIST_SHOW));
  const last=h[0];
  $("#recSummary").textContent=`Paskutinis: ${last.score.slice(0,last.players).join(" : ")} tšk.`;
}
function renderHist(){
  const h=loadHist(), best=[0,bestScore(h,1),bestScore(h,2)];
  histNote.textContent=h.length?`Saugoma ${h.length} iš ${HIST_MAX}`:"";
  histClear.hidden=!h.length;
  if(!h.length){histList.replaceChildren(Object.assign(document.createElement("li"),{className:"hist-empty",textContent:"Dar nė vieno žaidimo."}));return}
  histList.replaceChildren(...h.slice(0,HIST_SHOW).map((g,i)=>{
    const li=document.createElement("li");
    li.className="hist-item";
    li.style.setProperty("--i",String(i%10));
    const top=Math.max(...g.score.slice(0,g.players));
    if(top&&top===best[g.players])li.classList.add("best");
    const when=document.createElement("span");when.className="when";
    when.textContent=new Date(g.t).toLocaleString("lt-LT",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    const what=document.createElement("span");what.className="what";
    what.textContent=`${g.players===1?"Solo":"Dvikova"} · ${Math.round(g.duration/60)} min · ${(g.ex||[]).map(exName).join(", ")}`;
    const pts=document.createElement("span");pts.className="pts";
    for(let p=0;p<g.players;p++){const b=document.createElement("b");b.className=`d p${p+1}`;b.textContent=String(g.score[p]??0);pts.append(b)}
    li.append(when,what,pts);
    return li;
  }));
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
histClear.addEventListener("click",()=>{saveHist([]);renderHist();renderRecords()});
histSheet.addEventListener("cancel",e=>{e.preventDefault();closeHist()});
histSheet.addEventListener("click",e=>{if(e.target===histSheet)closeHist()});
histSheet.addEventListener("close",()=>{clearTimeout(histCloseTimer);histSheet.classList.remove("closing");histOpen.setAttribute("aria-expanded","false")});
renderRecords();
// returns true when this game beat the stored best for its player count (never on the very first game)
export function recordGame(){
  const {players,score,scoreEvents}=S;
  const h=loadHist(), prev=bestScore(h,players), top=Math.max(...score.slice(0,players));
  const reps=[0,1].map(i=>scoreEvents.filter(e=>e.player===i).length);
  h.unshift({t:Date.now(),players,duration:S.duration,ex:S.activeEX.map(e=>e.id),score:score.slice(0,2),reps});
  saveHist(h);
  renderRecords();
  return prev>0&&top>prev;
}
