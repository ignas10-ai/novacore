// In-game exercise coach card (#demo): the animated vector mascot doing the exercise (src/ui/mascots.ts exArt) + cue.
// coachSvg() returns the same art for the exercise library and the detail sheet.
import type {Exercise} from "../detect/exercises.ts";
import {$,replay} from "./dom.ts";
import {exArt} from "./mascots.ts";
import {t,type Key} from "../i18n/i18n.ts";

const DEMO_SHOW_MS=5100;
// cue = what to do (shown in-game); tip = what the counter actually checks (exercise library)
// tone = the exercise's colour identity ([data-tone] in main.css): tiles, chips, bars, the detail sheet
const TONE:Record<string,string>={squat:"red",jack:"blue",knees:"yellow",squatjump:"red",sidestep:"blue",lunge:"yellow",crunch:"red"};
export const DEMO:Record<string,{name:string;cue:string;tip:string;tone:string}>=Object.fromEntries(Object.entries(TONE).map(([id,tone])=>
  [id,{name:t(`ex.${id}` as Key),cue:t(`cue.${id}` as Key),tip:t(`tip.${id}` as Key),tone}]));
export const toneOf=(id:string)=>DEMO[id]?.tone||"red";
export const demoRoot=$("#demo");
const demoName=$("#demoName"), demoCue=$("#demoCue"), demoArt=$("#demoArt");
let demoTimer=0;
export function showDemo(ex:Exercise){
  const info=DEMO[ex.id];
  if(!info){clearTimeout(demoTimer);demoRoot.classList.remove("on");return}
  if(demoRoot.dataset.ex!==ex.id||!demoArt.firstElementChild)demoArt.innerHTML=exArt(ex.id);
  demoRoot.dataset.ex=ex.id;
  demoName.textContent=info.name;
  demoCue.textContent=info.cue;
  replay(demoRoot,"on");
  clearTimeout(demoTimer);
  demoTimer=setTimeout(()=>demoRoot.classList.remove("on"),DEMO_SHOW_MS);
}
export function hideDemo(){clearTimeout(demoTimer);demoRoot.classList.remove("on")}
export function coachSvg(id:string,anim=true){
  const t=document.createElement("template");t.innerHTML=exArt(id,anim);
  return t.content.firstElementChild as SVGElement;
}
