// Pratimai (#library): every EX with its animated coach figure, how-to + tip, BETA badge and this phone's stats.
import {EX} from "../detect/exercises.ts";
import {loadHist} from "../history/history.ts";
import {exTotals} from "../history/stats.ts";
import {DEMO,coachSvg} from "./coach.ts";
import {$} from "./dom.ts";
import {onView} from "./router.ts";

const lib=$("#lib");
const el=(tag:string,cls:string,text="")=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
lib.replaceChildren(...EX.map((e,i)=>{
  const d=DEMO[e.id];
  const card=el("article","card ex-card");
  card.style.setProperty("--i",String(i));
  const art=el("div","ex-art "+(i%2?"p2":"p1"));art.append(coachSvg(e.id));
  const head=el("h2","ex-name",d?.name||e.name);
  if(e.beta)head.append(el("span","beta","beta"));
  const stats=el("dl","ex-stats");stats.dataset.ex=e.id;
  stats.innerHTML='<div><dt>Iš viso</dt><dd class="d" data-k="total">0</dd></div><div><dt>Rekordas</dt><dd class="d" data-k="best">0</dd></div>';
  card.append(art,head,el("p","ex-cue",d?.cue||""),el("p","ex-tip",d?.tip||""),stats);
  return card;
}));
onView("library",()=>{
  const t=exTotals(loadHist());
  lib.querySelectorAll<HTMLElement>(".ex-stats").forEach(s=>{
    const v=t[s.dataset.ex!]||{total:0,best:0};
    s.querySelector("[data-k=total]")!.textContent=String(v.total);
    s.querySelector("[data-k=best]")!.textContent=String(v.best);
  });
});
