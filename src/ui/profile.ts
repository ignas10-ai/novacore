// Profilis (#profile): name, totals, 7-day activity, per-exercise totals, badges, recent games, settings.
// Everything is computed from the local history (works offline); the name edit opens the nickname sheet (social.ts).
import {EX} from "../detect/exercises.ts";
import {loadHist,histItem,bests} from "../history/history.ts";
import {totals,last7,exTotals,badges} from "../history/stats.ts";
import {cachedNick,sb,deleteMyData,errText} from "../online/api.ts";
import {WEB} from "./social.ts";
import {icon} from "./icons.ts";
import {$} from "./dom.ts";
import {t,tn,lang,weekday,isLang,LANG_KEY} from "../i18n/i18n.ts";
import {onView} from "./router.ts";
import {showOnb} from "./onboarding.ts";
import {toneOf} from "./coach.ts";
import {setChar,applyChar,type CharId} from "./chars.ts";

export const APP_VERSION="2.2"; // ponytail: bump by hand with user-visible releases
// medal colour per badge (locked badges are grey)
const BADGE_TONE:Record<string,string>={first:"yellow",duel:"blue",streak3:"red",squat100:"red",pts100:"yellow",beat:"blue",games10:"red",allex:"yellow"};
const el=(tag:string,cls:string,text="")=>Object.assign(document.createElement(tag),{className:cls,textContent:text});

function render(){
  const now=Date.now(), h=loadHist(), nick=cachedNick(), tot=totals(h,now);
  $("#profNick").textContent=nick||t("prof.noName");
  $("#profSub").textContent=t(!nick?"prof.subNoNick":sb?"prof.subOnline":"prof.local");
  $("#stGames").textContent=String(tot.games);$("#stReps").textContent=String(tot.reps);
  $("#stBest").textContent=String(tot.best);$("#stStreak").textContent=String(tot.streak);

  const days=last7(h,now), max=Math.max(1,...days.map(d=>d.reps));
  const sum=days.reduce((n,d)=>n+d.reps,0);
  $("#actSum").textContent=tn("u.moves",sum);
  $("#week").replaceChildren(...days.map((d,i)=>{
    const col=el("div","wk"+(i===6?" today":""));
    col.setAttribute("role","img");
    col.setAttribute("aria-label",t("prof.dayAria",{day:weekday(d.day,"long"),games:tn("u.games",d.games),moves:tn("u.moves",d.reps)}));
    const bar=el("span","wk-bar"+(d.reps?"":" zero"));bar.style.setProperty("--h",String(d.reps?Math.max(.06,d.reps/max):0));
    col.append(el("small","wk-n d",d.reps?String(d.reps):""),bar,el("small","wk-d",weekday(d.day,"short")));
    return col;
  }));

  const ex=exTotals(h), rows=EX.map(e=>({e,...ex[e.id]})).filter(r=>r.total).sort((a,b)=>b.total-a.total), top=rows[0]?.total||1;
  $("#exTot").replaceChildren(...(rows.length?rows.map(r=>{
    const li=el("li","ex-tot-row");li.dataset.tone=toneOf(r.e.id);
    const bar=el("span","ex-tot-bar");bar.style.setProperty("--w",String(r.total/top));
    li.append(el("span","ex-tot-dot"),el("span","ex-tot-name",r.e.name),el("b","d",String(r.total)),bar);
    return li;
  }):[el("li","ex-tot-empty",t("prof.exEmpty"))]));

  const bs=badges(h), on=bs.filter(b=>b.on).length;
  $("#badgeN").textContent=t("u.nOf",{n:on,total:bs.length});
  $("#badges").replaceChildren(...bs.map((b,i)=>{
    const li=el("li","badge"+(b.on?" on":""));li.dataset.tone=BADGE_TONE[b.id]||"red";
    li.style.setProperty("--i",String(i));
    li.setAttribute("aria-label",t("prof.badgeAria",{name:b.name,state:t(b.on?"prof.badgeOn":"prof.badgeOff"),desc:b.desc}));
    const ic=el("span","badge-ic medal");ic.innerHTML=`<i class="medal-ribbon"></i><span class="medal-disc">${icon(b.on?b.icon:"lock")}</span>`;
    li.append(ic,el("b","",b.name),el("small","",b.desc));
    return li;
  }));

  const best=bests(h);
  $("#histMini").replaceChildren(...(h.length?h.slice(0,3).map((g,i)=>histItem(g,i,best)):[el("li","hist-empty",t("hist.empty"))]));
  ($("#histOpen") as HTMLButtonElement).hidden=h.length<=3;
}
onView("profile",render);
$("#onbAgain").onclick=showOnb;
// language (Nustatymai): saved + reload with ?lang= (every module builds its text once on load)
const langBtns=document.querySelectorAll<HTMLElement>("[data-lang]");
langBtns.forEach(b=>{
  b.setAttribute("aria-checked",String(b.dataset.lang===lang));
  b.onclick=()=>{
    const l=b.dataset.lang;if(!isLang(l)||l===lang)return;
    try{localStorage.setItem(LANG_KEY,l)}catch(e){}
    const u=new URL(location.href);u.searchParams.set("lang",l); // the URL wins over storage, so this works without storage too
    location.replace(u);
  };
});
// privacy policy lives on the web build (public/privacy.html); the Android app opens the hosted copy
($("#policyLink") as HTMLAnchorElement).href=`${WEB}/privacy.html${lang==="en"?"#en":""}`;
// „Ištrinti mano duomenis": server first (if that fails, nothing local is touched), then every novacore.* / Supabase key
$("#delData").onclick=async()=>{
  if(!confirm(t("prof.delConfirm")))return;
  try{if(sb)await deleteMyData()}catch(e){alert(t("prof.delFail")+" "+errText(e));return}
  try{for(const k of Object.keys(localStorage))if(k.startsWith("novacore.")||k.startsWith("sb-"))localStorage.removeItem(k)}catch(e){}
  alert(t("prof.delDone"));
  location.replace(location.pathname);
};
$("#appVer").textContent=`MoveClash ${APP_VERSION} · Samsung Solve for Tomorrow 2026`;
document.querySelectorAll<HTMLElement>("[data-char]").forEach(b=>b.onclick=()=>setChar(b.dataset.char as CharId));
applyChar();
