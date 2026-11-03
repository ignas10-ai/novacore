// Pradžia (#home): today's game (hero + slide to play), streak, weekly goal, quick starts that skip the setup.
// Also fills the Rungtys tab (#rungtys: the games grid + filter).
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
import {POSE,GAME,applyChar} from "./chars.ts";
import {slide} from "./slide.ts";

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
  feature();
}
// game tiles are injected by each game module (anywhere in #home); move them into the Rungtys grid (#games, Rep Maratonas
// stays first), tag each with its key, colour and duo flag. Idempotent, so new tiles (Martynas' javelin, badminton) just appear.
export function games(){
  const grid=$("#games");
  document.querySelectorAll<HTMLAnchorElement>("#home .sp-tile").forEach(a=>grid.append(a));
  grid.querySelectorAll<HTMLAnchorElement>(".sp-tile:not([data-g])").forEach(a=>{
    const g=[...a.classList].find(c=>c!=="sp-tile"&&c.endsWith("-tile"))?.slice(0,-5)??"sp", m=GAME[g];
    a.dataset.g=g;if(!m)return;
    a.style.setProperty("--gc",m.color);a.dataset.duo=String(m.duo);
    a.querySelector(".sp-tile-art")?.insertAdjacentHTML("afterbegin",`<img class="sp-tile-img" alt="" src="/chars/${POSE[g]}.webp">`);
  });
}
onView("games",games);
// Rungtys filter: all / one player / two at the same time
document.querySelectorAll<HTMLButtonElement>("#gamesFilter [data-f]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#gamesFilter [data-f]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  const f=b.dataset.f;
  $("#games").querySelectorAll<HTMLElement>(".sp-tile").forEach(a=>a.hidden=!!f&&(a.dataset.duo==="true")!==(f==="duo"));
});
onView("home",render);
$("#homePlay").onclick=()=>go($<HTMLAnchorElement>("#homeFeat").getAttribute("href")!);
// quick start: set the same buttons the setup screen uses (keeps both in sync), then go straight to the camera
document.querySelectorAll<HTMLElement>("[data-quick]").forEach(b=>b.onclick=()=>{
  const [p,d]=b.dataset.quick!.split(",");
  if(+p)document.querySelector<HTMLElement>(`[data-p="${p}"]`)?.click();
  document.querySelector<HTMLElement>(`[data-d="${d}"]`)?.click();
  startFlow();
});
// today's game: the same one all day (day number mod the games), hero = its colour + character, slide = its setup
function feature(){
  const tiles=[...document.querySelectorAll<HTMLAnchorElement>("#games .sp-tile")].filter(a=>GAME[a.dataset.g!]);
  const a=tiles[Math.floor(Date.now()/864e5)%Math.max(1,tiles.length)];if(!a)return;
  const g=a.dataset.g!, name=a.querySelector(".sp-tile-txt b")?.textContent??"";
  $<HTMLAnchorElement>("#homeFeat").href=a.getAttribute("href")!;
  $("#home").style.setProperty("--gc",GAME[g].color);
  $("#home").querySelector<HTMLImageElement>(".today-img")!.src=`/chars/${POSE[g]}.webp`;
  $("#todayName").textContent=$("#todayBig").textContent=name;
  $("#todaySub").textContent=a.querySelector(".sp-tile-txt small")?.textContent??"";
}
slide($<HTMLButtonElement>("#homePlay"));
applyChar();
