// Profilis (#profile): name, totals, 7-day activity, per-exercise totals, badges, recent games, settings.
// Everything is computed from the local history (works offline); the name edit opens the nickname sheet (social.ts).
import {EX} from "../detect/exercises.ts";
import {loadHist,histItem,bests} from "../history/history.ts";
import {totals,last7,exTotals,badges} from "../history/stats.ts";
import {cachedNick,sb} from "../online/api.ts";
import {icon} from "./icons.ts";
import {$,plural} from "./dom.ts";
import {onView} from "./router.ts";
import {showOnb} from "./onboarding.ts";
import {toneOf} from "./coach.ts";

export const APP_VERSION="2.0"; // ponytail: bump by hand with user-visible releases
const DAY=["Sk","Pr","An","Tr","Kt","Pn","Š"];
const DAY_LONG=["sekmadienis","pirmadienis","antradienis","trečiadienis","ketvirtadienis","penktadienis","šeštadienis"];
// medal colour per badge (locked badges are grey)
const BADGE_TONE:Record<string,string>={first:"mint",duel:"blue",streak3:"yellow",squat100:"red",pts100:"pink",beat:"violet",games10:"sky",allex:"yellow"};
const el=(tag:string,cls:string,text="")=>Object.assign(document.createElement(tag),{className:cls,textContent:text});

function render(){
  const now=Date.now(), h=loadHist(), nick=cachedNick(), t=totals(h,now);
  $("#profAv").textContent=nick?[...nick][0].toUpperCase():"?";
  $("#profNick").textContent=nick||"Be vardo";
  $("#profSub").textContent=!nick?"Įrašyk vardą – jį matys draugai":sb?"Rodomas draugams kompanijose":"Saugoma šiame telefone";
  $("#stGames").textContent=String(t.games);$("#stReps").textContent=String(t.reps);
  $("#stBest").textContent=String(t.best);$("#stStreak").textContent=String(t.streak);

  const days=last7(h,now), max=Math.max(1,...days.map(d=>d.reps));
  const sum=days.reduce((n,d)=>n+d.reps,0);
  $("#actSum").textContent=`${sum} ${plural(sum,["judesys","judesiai","judesių"])}`;
  $("#week").replaceChildren(...days.map((d,i)=>{
    const wd=new Date(d.day).getDay(), col=el("div","wk"+(i===6?" today":""));
    col.setAttribute("role","img");
    col.setAttribute("aria-label",`${DAY_LONG[wd]}: ${d.games} ${plural(d.games,["žaidimas","žaidimai","žaidimų"])}, ${d.reps} ${plural(d.reps,["judesys","judesiai","judesių"])}`);
    const bar=el("span","wk-bar"+(d.reps?"":" zero"));bar.style.setProperty("--h",String(d.reps?Math.max(.06,d.reps/max):0));
    col.append(el("small","wk-n d",d.reps?String(d.reps):""),bar,el("small","wk-d",DAY[wd]));
    return col;
  }));

  const ex=exTotals(h), rows=EX.map(e=>({e,...ex[e.id]})).filter(r=>r.total).sort((a,b)=>b.total-a.total), top=rows[0]?.total||1;
  $("#exTot").replaceChildren(...(rows.length?rows.map(r=>{
    const li=el("li","ex-tot-row");li.dataset.tone=toneOf(r.e.id);
    const bar=el("span","ex-tot-bar");bar.style.setProperty("--w",String(r.total/top));
    li.append(el("span","ex-tot-dot"),el("span","ex-tot-name",r.e.name),el("b","d",String(r.total)),bar);
    return li;
  }):[el("li","ex-tot-empty","Sužaisk pirmą žaidimą – čia matysi, kiek ko padarei.")]));

  const bs=badges(h), on=bs.filter(b=>b.on).length;
  $("#badgeN").textContent=`${on} iš ${bs.length}`;
  $("#badges").replaceChildren(...bs.map((b,i)=>{
    const li=el("li","badge"+(b.on?" on":""));li.dataset.tone=BADGE_TONE[b.id]||"red";
    li.style.setProperty("--i",String(i));
    li.setAttribute("aria-label",`${b.name} – ${b.on?"gautas":"dar negautas"}. ${b.desc}`);
    const ic=el("span","badge-ic");ic.innerHTML=icon(b.on?b.icon:"lock");
    li.append(ic,el("b","",b.name),el("small","",b.desc));
    return li;
  }));

  const best=bests(h);
  $("#histMini").replaceChildren(...(h.length?h.slice(0,3).map((g,i)=>histItem(g,i,best)):[el("li","hist-empty","Dar nė vieno žaidimo.")]));
  ($("#histOpen") as HTMLButtonElement).hidden=h.length<=3;
}
onView("profile",render);
$("#onbAgain").onclick=showOnb;
$("#appVer").textContent=`NovaCore ${APP_VERSION} · Samsung Solve for Tomorrow 2026`;
