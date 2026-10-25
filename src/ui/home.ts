// Pradžia (#home): greeting, streak, weekly goal, "Žaisti" -> setup, quick starts that skip the setup.
// The group rank card and the challenge card are filled by social.ts.
import {S} from "../game/state.ts";
import {startFlow} from "../game/game.ts";
import {loadHist} from "../history/history.ts";
import {streak,weekGames,WEEK_GOAL} from "../history/stats.ts";
import {cachedNick} from "../online/api.ts";
import {$,plural} from "./dom.ts";
import {onView,go} from "./router.ts";
import {renderHomeRank} from "./social.ts";

const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
function render(){
  const now=Date.now(), h=loadHist(), nick=cachedNick();
  $("#homeDate").textContent=cap(new Date(now).toLocaleDateString("lt-LT",{weekday:"long",month:"long",day:"numeric"}));
  const title=$("#homeTitle");
  title.replaceChildren(nick?"Labas, ":"Labas!");
  if(nick)title.append(Object.assign(document.createElement("span"),{textContent:nick}),"!");
  $("#homeAv").textContent=nick?[...nick][0].toUpperCase():"?";
  const n=streak(h,now), today=h.some(g=>new Date(g.t).toDateString()===new Date(now).toDateString());
  $("#streakN").textContent=String(n);
  $("#streakTxt").textContent=!n?"Pradėk seriją šiandien":`${plural(n,["diena","dienos","dienų"])} iš eilės${today?"":" · žaisk šiandien"}`;
  $("#streakCard").classList.toggle("hot",n>0&&today);
  const w=weekGames(h,now), left=WEEK_GOAL-w;
  $("#goalN").textContent=`${Math.min(w,WEEK_GOAL)} / ${WEEK_GOAL}`;
  $("#goalBar").querySelectorAll("i").forEach((el,i)=>el.classList.toggle("on",i<w));
  $("#goalTxt").textContent=left<=0?"Tikslas pasiektas! Žaisk toliau.":`Liko ${left} ${plural(left,["žaidimas","žaidimai","žaidimų"])} iki savaitės tikslo`;
  $("#quickFast").textContent=S.players===1?"1 min solo":"1 min";
  renderHomeRank();
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
