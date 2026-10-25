// Pratimai (#library): one colourful tile per EX (its tone + animated coach figure, BETA, this phone's record);
// tapping a tile opens #exDetail (bottom sheet) with how-to, what the counter checks, total and record.
import {EX} from "../detect/exercises.ts";
import {loadHist} from "../history/history.ts";
import {exTotals} from "../history/stats.ts";
import {DEMO,coachSvg,toneOf} from "./coach.ts";
import {$,sheet} from "./dom.ts";
import {onView} from "./router.ts";

const lib=$("#lib"), det=$<HTMLDialogElement>("#exDetail"), detS=sheet(det);
const el=(tag:string,cls:string,text="")=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
let totals:Record<string,{total:number;best:number}>={};
// ui-v3 sample: 3D character art for some exercises (the rest still use the coach SVG)
const ART:Record<string,[string,string]>={
  squat:[new URL("../art/raudonas-squat.webp",import.meta.url).href,new URL("../art/raudonas-squat@2x.webp",import.meta.url).href],
  jack:[new URL("../art/melynas-jack.webp",import.meta.url).href,new URL("../art/melynas-jack@2x.webp",import.meta.url).href],
};
function artOf(id:string){
  const a=ART[id];
  if(!a)return coachSvg(id);
  return Object.assign(document.createElement("img"),{className:"ex-img",src:a[0],srcset:`${a[0]} 1x, ${a[1]} 2x`,alt:"",width:160,height:260,decoding:"async"});
}

lib.replaceChildren(...EX.map((e,i)=>{
  const card=el("button","ex-card tap") as HTMLButtonElement;
  card.type="button";card.dataset.ex=e.id;card.dataset.tone=toneOf(e.id);
  card.style.setProperty("--i",String(i));
  card.setAttribute("aria-haspopup","dialog");
  const art=el("span","ex-art"+(ART[e.id]?" has-img":""));art.append(artOf(e.id));
  if(e.beta)art.append(el("span","beta","beta"));
  card.append(art,el("span","ex-name",DEMO[e.id]?.name||e.name),el("span","ex-meta"));
  return card;
}));
function meta(card:HTMLElement){
  const v=totals[card.dataset.ex!];
  const m=card.querySelector(".ex-meta")!;
  m.replaceChildren(...(v?.best?["Rekordas ",Object.assign(document.createElement("b"),{textContent:String(v.best)})]:["Dar nedaryta"]));
}
onView("library",()=>{
  totals=exTotals(loadHist());
  lib.querySelectorAll<HTMLElement>(".ex-card").forEach(meta);
});
lib.addEventListener("click",e=>{
  const card=(e.target as Element).closest<HTMLElement>(".ex-card");
  if(!card)return;
  const id=card.dataset.ex!, d=DEMO[id], ex=EX.find(x=>x.id===id)!, v=totals[id]||{total:0,best:0};
  det.dataset.tone=toneOf(id);
  $("#exdArt").replaceChildren(artOf(id));
  const name=$("#exdName");name.replaceChildren(d?.name||ex.name);
  if(ex.beta)name.append(el("span","beta","beta"));
  $("#exdCue").textContent=d?.cue||"";
  $("#exdTip").textContent=d?.tip||"";
  $("#exdTotal").textContent=String(v.total);
  $("#exdBest").textContent=String(v.best);
  detS.open();
});
$("#exdClose").onclick=detS.close;
$("#exdDone").onclick=detS.close;
