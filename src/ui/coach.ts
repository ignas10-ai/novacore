// In-game exercise coach card (#demo). The animated SVGs live in index.html, one per exercise (`data-ex`).
import type {Exercise} from "../detect/exercises.ts";
import {$,replay} from "./dom.ts";

const DEMO_SHOW_MS=5100;
const DEMO:Record<string,{name:string;cue:string}>={
 squat:{name:"Pritūpimai",cue:"Sulenk kelius ir vėl atsistok"},
 jack:{name:"Pašokimai",cue:"Rankos aukštyn, kojos plačiau"},
 knees:{name:"Aukšti keliai",cue:"Bėk vietoje ir kelk kelius aukštyn"},
 squatjump:{name:"Pritūpimai su šuoliuku",cue:"Pritūpk ir šok aukštyn"},
 sidestep:{name:"Šoniniai žingsniai",cue:"Pritūpk ir ženk į šoną, tada prikelk kitą koją"},
 lunge:{name:"Atvirkštiniai įtūpstai",cue:"Ženk viena koja atgal ir nusileisk"},
 crunch:{name:"Įstriži atsilenkimai stovint",cue:"Kelk kelį ir liesk jį priešingu alkūniu"},
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
