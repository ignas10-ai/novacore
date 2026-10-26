// Start screen settings: player count, duration, exercise picker sheet.
import {EX,type Exercise} from "../detect/exercises.ts";
import {S} from "../game/state.ts";
import {$,replay,sheet} from "./dom.ts";
import {toneOf} from "./coach.ts";
import {exIcon} from "./mascots.ts";
import {t} from "../i18n/i18n.ts";

document.querySelectorAll<HTMLElement>("[data-p]").forEach(b=>b.onclick=()=>{S.players=+b.dataset.p!;sel(b);document.body.classList.toggle("solo",S.players===1)});
document.querySelectorAll<HTMLElement>("[data-d]").forEach(b=>b.onclick=()=>{S.duration=+b.dataset.d!;sel(b)});
function sel(b:HTMLElement){[...b.parentNode!.children].forEach(x=>{x.classList.toggle("on",x===b);x.setAttribute("aria-pressed",String(x===b))})}

// restore the last exercise selection
try{
  const saved=JSON.parse(localStorage.getItem("novacore.exercises")||"[]");
  const restored=Array.isArray(saved)?EX.filter(e=>saved.includes(e.id)||(e.id==="sidestep"&&saved.includes("skater"))):[];
  if(restored.length)S.activeEX=restored;
}catch(e){}

// exercise picker: generated from EX, multi-select, but never allow an empty game
const exOpen=$("#exOpen"), exSheet=$<HTMLDialogElement>("#exSheet"), exGrid=$("#exGrid"), exAll=$("#exAll"), exClose=$("#exClose"), exDone=$("#exDone"),
  exCount=$("#exCount"), exSummary=$("#exSummary"), exPreview=$("#exPreview"), exNote=$("#exNote"), exSheetNote=$("#exSheetNote");
const pickedEx=new Set(S.activeEX.map(e=>e.id));
let exNoteTimer=0, exCloseTimer=0;
const exPad=(n:number)=>String(n).padStart(2,"0");
function updateExUI(){
  const total=EX.length,n=pickedEx.size;
  exCount.textContent=String(n);
  exSummary.textContent=total===n?(total===1?t("ex.allOne"):t("ex.allN",{n:total})):t("ex.nOf",{n,total});
  exOpen.setAttribute("aria-label",t("ex.aria",{n,total}));
  exAll.hidden=total===n;
  const chosen=EX.filter(e=>pickedEx.has(e.id));
  const chips=chosen.slice(0,4).map(e=>{
    const chip=document.createElement("span");
    chip.className="ex-chip";
    chip.dataset.tone=toneOf(e.id);
    const label=document.createElement("span");
    label.textContent=e.name;
    chip.append(label);
    return chip;
  });
  if(chosen.length>4){
    const more=document.createElement("span");
    more.className="ex-chip more";
    const label=document.createElement("span");
    label.textContent=`+${chosen.length-4}`;
    more.append(label);
    chips.push(more);
  }
  exPreview.replaceChildren(...chips);
  replay(exCount,"bump");
}
function exNoteMessage(){
  return pickedEx.size===1?t("ex.note1"):t("ex.noteN",{n:pickedEx.size});
}
function syncExNotes(warn:boolean){
  clearTimeout(exNoteTimer);
  exNote.classList.toggle("warn",!!warn);
  exSheetNote.classList.toggle("warn",!!warn);
  if(warn){
    exNote.textContent=t("ex.keepOne");
    exSheetNote.textContent=t("ex.keepOneShort");
    exNoteTimer=setTimeout(()=>syncExNotes(false),2200);
    return;
  }
  exNote.textContent=exNoteMessage();
  exSheetNote.textContent=pickedEx.size===1?t("ex.sheet1"):t("ex.sheetN",{n:pickedEx.size});
}
function saveExPick(){try{localStorage.setItem("novacore.exercises",JSON.stringify([...pickedEx]))}catch(e){}}
function renderExGrid(){
  exGrid.replaceChildren(...EX.map((e,i)=>{
    const on=pickedEx.has(e.id);
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="ex-tile";
    btn.dataset.exPick=e.id;
    btn.style.setProperty("--i",String(i%8));
    btn.dataset.tone=toneOf(e.id);
    btn.classList.toggle("on",on);
    btn.setAttribute("aria-pressed",String(on));
    btn.innerHTML=`<span class="ex-n d" aria-hidden="true">${exPad(i+1)}</span><span class="ex-pose" aria-hidden="true">${exIcon(e.id)}</span><span class="ex-name"></span>${e.beta?`<span class="ex-beta">${t("u.beta")}</span>`:''}<span class="ex-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 13l5 5 9-12"/></svg></span>`;
    btn.querySelector(".ex-name")!.textContent=e.name;
    return btn;
  }));
}
function toggleEx(id:string,btn:HTMLElement){
  const on=pickedEx.has(id);
  if(on&&pickedEx.size===1){
    btn.classList.remove("bump");
    replay(btn,"deny");
    syncExNotes(true);
    return;
  }
  if(on)pickedEx.delete(id);else pickedEx.add(id);
  S.activeEX=EX.filter(e=>pickedEx.has(e.id));
  saveExPick();
  btn.classList.toggle("on",!on);
  btn.setAttribute("aria-pressed",String(!on));
  btn.classList.remove("deny");
  replay(btn,"bump");
  updateExUI();
  syncExNotes(false);
}
function selectAllEx(){
  if(pickedEx.size===EX.length)return;
  for(const e of EX)pickedEx.add(e.id);
  S.activeEX=EX.slice();
  saveExPick();
  exGrid.querySelectorAll(".ex-tile").forEach((btn,i)=>{
    btn.classList.add("on");
    btn.setAttribute("aria-pressed","true");
    setTimeout(()=>{btn.classList.remove("deny");replay(btn,"bump")},i*18);
  });
  updateExUI();
  syncExNotes(false);
  if(exAll.hidden)exClose.focus({preventScroll:true});
}
function openExSheet(){
  clearTimeout(exCloseTimer);
  exSheet.classList.remove("closing");
  renderExGrid();
  updateExUI();
  syncExNotes(false);
  exOpen.setAttribute("aria-expanded","true");
  if(!exSheet.open)exSheet.showModal();
}
function closeExSheet(){
  if(!exSheet.open||exSheet.classList.contains("closing"))return;
  exSheet.classList.add("closing");
  exOpen.setAttribute("aria-expanded","false");
  clearTimeout(exCloseTimer);
  exCloseTimer=setTimeout(()=>{
    exSheet.classList.remove("closing");
    if(exSheet.open)exSheet.close();
  },210);
}
exOpen.addEventListener("click",openExSheet);
exClose.addEventListener("click",closeExSheet);
exDone.addEventListener("click",closeExSheet);
exAll.addEventListener("click",selectAllEx);
exSheet.addEventListener("cancel",e=>{e.preventDefault();closeExSheet()});
exSheet.addEventListener("click",e=>{if(e.target===exSheet)closeExSheet()});
exGrid.addEventListener("click",e=>{
  const btn=(e.target as Element).closest<HTMLElement>(".ex-tile");
  if(btn)toggleEx(btn.dataset.exPick!,btn);
});
exSheet.addEventListener("close",()=>{
  clearTimeout(exCloseTimer);
  exSheet.classList.remove("closing");
  exOpen.setAttribute("aria-expanded","false");
});
renderExGrid();
updateExUI();
syncExNotes(false);

// "Rodyti per TV" (setup row #castOpen, Profilis [data-tv], nav cast icons) opens #screenSheet: src/cast/cast.ts
