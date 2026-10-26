// Pratimai (#library, Claude Design): filter chips (Visi / Pagrindiniai / Beta), a featured card for the exercise this phone
// did most (mascot + total + record + what the camera checks), then numbered rows with a pose icon and a BETA pill.
// Every exercise (featured too) is a .ex-card[data-ex]; tapping one opens #exDetail with the animated mascot.
import {EX} from "../detect/exercises.ts";
import {loadHist} from "../history/history.ts";
import {exTotals} from "../history/stats.ts";
import {DEMO,coachSvg,toneOf} from "./coach.ts";
import {exIcon} from "./mascots.ts";
import {icon} from "./icons.ts";
import {$,sheet} from "./dom.ts";
import {onView} from "./router.ts";
import {t} from "../i18n/i18n.ts";

const lib=$("#lib"), filt=$("#libFilter"), det=$<HTMLDialogElement>("#exDetail"), detS=sheet(det);
const el=(tag:string,cls:string,text="")=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
const pad=(i:number)=>String(i+1).padStart(2,"0");
const nameOf=(id:string)=>DEMO[id]?.name||EX.find(e=>e.id===id)!.name;
let totals:Record<string,{total:number;best:number}>={}, mode="all";

const FILTERS:[string,string,(e:typeof EX[number])=>boolean][]=[
  ["all",t("app.all"),()=>true],["main",t("lib.main"),e=>!e.beta],["beta",t("u.Beta"),e=>!!e.beta],
];
filt.replaceChildren(...FILTERS.map(([id,label,f])=>{
  const b=el("button","chip-btn tap",`${label} · ${EX.filter(f).length}`) as HTMLButtonElement;
  b.type="button";b.dataset.f=id;b.setAttribute("aria-pressed",String(id===mode));
  return b;
}));
filt.addEventListener("click",e=>{
  const b=(e.target as Element).closest<HTMLElement>("[data-f]");if(!b)return;
  mode=b.dataset.f!;filt.querySelectorAll("[data-f]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  render();
});

function featured(id:string,i:number){
  const v=totals[id]||{total:0,best:0}, card=el("button","ex-card ex-feat tap") as HTMLButtonElement;
  card.type="button";card.dataset.ex=id;card.dataset.tone=toneOf(id);card.setAttribute("aria-haspopup","dialog");
  const art=el("span","feat-art");art.append(coachSvg(id,false));
  const txt=el("span","feat-txt");
  txt.append(el("span","feat-eye d",`${pad(i)} · ${t(v.total?"lib.top":"lib.startHere")}`),el("b","feat-name d",nameOf(id)),el("span","feat-cue",DEMO[id]?.cue||""));
  const st=el("span","feat-stats");
  const box=(cls:string,lbl:string,n:number)=>{const b=el("span","fs-box "+cls);b.append(el("small","",lbl),el("b","d",String(n)));return b};
  st.append(box("y",t("lib.total"),v.total),box("w",t("lib.best"),v.best));
  txt.append(st);
  const tip=el("span","feat-tip");const ic=el("span","feat-tip-ic");ic.innerHTML=icon("scan-face");
  const tt=el("span","feat-tip-txt");tt.append(el("b","",t("lib.checks")),el("span","",DEMO[id]?.tip||""));
  tip.append(ic,tt);
  card.append(art,txt,tip);
  return card;
}
function row(id:string,i:number,beta:boolean){
  const li=el("li","");
  const b=el("button","ex-card ex-row tap") as HTMLButtonElement;b.type="button";b.dataset.ex=id;b.dataset.tone=toneOf(id);
  b.setAttribute("aria-haspopup","dialog");b.style.setProperty("--i",String(i));
  const n=el("span","ex-num d",pad(i));if(!beta)n.classList.add("on");
  const ic=el("span","ex-pose");ic.innerHTML=exIcon(id);
  b.append(n,ic,el("span","ex-name",nameOf(id)));
  if(beta)b.append(el("span","beta",t("u.beta")));else{const c=el("span","chev");c.innerHTML=icon("chevron-right");b.append(c)}
  li.append(b);return li;
}
function render(){
  const shown=EX.filter(FILTERS.find(f=>f[0]===mode)![2]);
  // featured = the exercise done most on this phone (squat until there is history), from the current filter
  const top=[...shown].sort((a,b)=>(totals[b.id]?.total||0)-(totals[a.id]?.total||0))[0]||EX[0];
  const idx=(id:string)=>EX.findIndex(e=>e.id===id);
  const list=el("ol","ex-list");
  list.append(...shown.filter(e=>e.id!==top.id).map(e=>row(e.id,idx(e.id),!!e.beta)));
  lib.replaceChildren(featured(top.id,idx(top.id)),list);
}
onView("library",()=>{totals=exTotals(loadHist());render()});
render();
lib.addEventListener("click",e=>{
  const card=(e.target as Element).closest<HTMLElement>(".ex-card");
  if(!card)return;
  const id=card.dataset.ex!, d=DEMO[id], ex=EX.find(x=>x.id===id)!, v=totals[id]||{total:0,best:0};
  det.dataset.tone=toneOf(id);
  $("#exdArt").replaceChildren(coachSvg(id));
  $("#exdNo").textContent=pad(EX.indexOf(ex))+(ex.beta?` · ${t("u.Beta")}`:"");
  $("#exdName").textContent=d?.name||ex.name;
  $("#exdCue").textContent=d?.cue||"";
  $("#exdTip").textContent=d?.tip||"";
  $("#exdTotal").textContent=String(v.total);
  $("#exdBest").textContent=String(v.best);
  detS.open();
});
$("#exdClose").onclick=detS.close;
$("#exdDone").onclick=detS.close;
