// In-game exercise coach card (#demo). The animated SVGs live in index.html, one per exercise (`data-ex`);
// coachSvg() clones one for the exercise library and the onboarding.
import type {Exercise} from "../detect/exercises.ts";
import {$,replay} from "./dom.ts";

const DEMO_SHOW_MS=5100;
// cue = what to do (shown in-game); tip = what the counter actually checks (exercise library)
export const DEMO:Record<string,{name:string;cue:string;tip:string}>={
 squat:{name:"Pritūpimai",cue:"Sulenk kelius ir vėl atsistok",tip:"Leiskis lyg sėstum ant kėdės, kulnai lieka ant žemės."},
 jack:{name:"Pašokimai",cue:"Rankos aukštyn, kojos plačiau",tip:"Abi rankos virš galvos ir abi kojos į šonus – kitaip neužskaitoma."},
 knees:{name:"Aukšti keliai",cue:"Bėk vietoje ir kelk kelius aukštyn",tip:"Kelius kelk bent iki klubų aukščio."},
 squatjump:{name:"Pritūpimai su šuoliuku",cue:"Pritūpk ir šok aukštyn",tip:"Pirma gilus pritūpimas, tada tikras šuolis – vien atsistoti neužtenka."},
 sidestep:{name:"Šoniniai žingsniai",cue:"Pritūpk ir ženk į šoną, tada prikelk kitą koją",tip:"Likdamas pritūpęs judėk į šoną. Žingsnis ir atgal į vietą neskaičiuojamas."},
 lunge:{name:"Atvirkštiniai įtūpstai",cue:"Ženk viena koja atgal ir nusileisk",tip:"Nusileisk tiek, kad priekinis kelis sulinktų maždaug stačiu kampu."},
 crunch:{name:"Įstriži atsilenkimai stovint",cue:"Kelk kelį ir liesk jį priešingu alkūniu",tip:"Kelk kelį aukštai, alkūnę nuleisk iki jo aukščio, keisk puses."},
};
export const demoRoot=$("#demo");
const demoName=$("#demoName"), demoCue=$("#demoCue");
let demoTimer=0;
export function showDemo(ex:Exercise){
  const info=DEMO[ex.id];
  if(!info){clearTimeout(demoTimer);demoRoot.classList.remove("on");return}
  demoRoot.dataset.ex=ex.id;
  demoName.textContent=info.name;
  demoCue.textContent=info.cue;
  replay(demoRoot,"on");
  clearTimeout(demoTimer);
  demoTimer=setTimeout(()=>demoRoot.classList.remove("on"),DEMO_SHOW_MS);
}
export function hideDemo(){clearTimeout(demoTimer);demoRoot.classList.remove("on")}
export function coachSvg(id:string){
  const svg=demoRoot.querySelector(`.demo-svg[data-ex="${id}"]`)?.cloneNode(true) as SVGElement|undefined;
  svg?.setAttribute("aria-hidden","true");
  return svg||document.createElement("span");
}
// any [data-coach="id"] placeholder gets its figure
document.querySelectorAll<HTMLElement>("[data-coach]").forEach(el=>el.append(coachSvg(el.dataset.coach!)));
