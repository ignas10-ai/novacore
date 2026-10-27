// Pradžia (#home): greeting, streak, weekly goal, "Žaisti" -> setup, quick starts that skip the setup, the games grid.
// The group rank card and the challenge card are filled by social.ts.
import {S} from "../game/state.ts";
import {startFlow} from "../game/game.ts";
import {loadHist} from "../history/history.ts";
import {streak,weekGames,WEEK_GOAL} from "../history/stats.ts";
import {cachedNick} from "../online/api.ts";
import {$} from "./dom.ts";
import {t,tn} from "../i18n/i18n.ts";
import {onView,go} from "./router.ts";
import {renderHomeRank} from "./social.ts";
import {picto} from "./pictos.ts";

function render(){
  const now=Date.now(), h=loadHist(), nick=cachedNick();
  $("#homeTitle").textContent=nick?t("home.hi",{nick}):t("home.hello");
  const n=streak(h,now), today=h.some(g=>new Date(g.t).toDateString()===new Date(now).toDateString());
  $("#streakN").textContent=String(n);
  $("#streakTxt").textContent=!n?t("home.noStreak"):tn("home.streak",n)+(today?"":t("home.playToday"));
  $("#streakCard").classList.toggle("hot",n>0&&today);
  const w=weekGames(h,now), left=WEEK_GOAL-w;
  $("#goalN").textContent=`${Math.min(w,WEEK_GOAL)}/${WEEK_GOAL}`;
  $("#goalBar").querySelectorAll("i").forEach((el,i)=>el.classList.toggle("on",i<w));
  $("#goalTxt").textContent=left<=0?t("home.goalDone"):tn("home.goalLeft",left);
  $("#quickFast").textContent=t(S.players===1?"home.fastSolo":"u.min1");
  renderHomeRank();
  games();
}
// game tiles are injected by each game module (anywhere in #home); collect them into the grid, badge each with its
// pictogram and mirror them as the cover's icon row. Idempotent, so new tiles (Martynas' javelin, badminton) just appear.
function games(){
  const grid=$("#games");
  document.querySelectorAll<HTMLAnchorElement>("#home .sp-tile").forEach(a=>{
    const g=[...a.classList].find(c=>c!=="sp-tile"&&c.endsWith("-tile"))?.slice(0,-5)??"sp";
    if(!a.dataset.g){a.dataset.g=g;a.insertAdjacentHTML("afterbegin",`<span class="pic" aria-hidden="true">${picto(g)}</span>`)}
    grid.append(a);
  });
  $("#homePics").innerHTML=[...grid.querySelectorAll<HTMLAnchorElement>(".sp-tile")].map(a=>
    `<a class="pic tap" href="${a.getAttribute("href")}" aria-label="${a.querySelector(".sp-tile-txt b")?.textContent??""}">${picto(a.dataset.g!)}</a>`).join("");
}
onView("home",render);
$("#homePlay").onclick=()=>go("#/zaisti");
// quick start: set the same buttons the setup screen uses (keeps both in sync), then go straight to the camera
document.querySelectorAll<HTMLElement>("[data-quick]").forEach(b=>b.onclick=()=>{
  const [p,d]=b.dataset.quick!.split(",");
  if(+p)document.querySelector<HTMLElement>(`[data-p="${p}"]`)?.click();
  document.querySelector<HTMLElement>(`[data-d="${d}"]`)?.click();
  startFlow();
});
