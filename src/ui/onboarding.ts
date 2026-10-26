// First-run onboarding (#onb, 3 steps, skippable): what it is -> how to place the phone -> nickname + camera.
// Not a route: shown over the app on the very first visit (or from Profilis -> "Kaip žaisti"), then the router
// shows the screen of the current URL. onbDone resolves when it is closed, so invite links (?g=) wait for the name.
import {$} from "./dom.ts";
import {render,showOnly} from "./router.ts";
import * as api from "../online/api.ts";
import {t} from "../i18n/i18n.ts";

const KEY="novacore.onb";
const ls={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};
const root=$("#onb"), steps=[...root.querySelectorAll<HTMLElement>(".onb-step")], dots=$(".onb-dots"), back=$("#onbBack"), nextTxt=$("#onbNextTxt"), nickIn=$<HTMLInputElement>("#onbNick"), camBtn=$<HTMLButtonElement>("#onbCam");
let i=0, done:()=>void=()=>{};
export const onbDone=new Promise<void>(r=>done=r);

function step(n:number){
  i=n;
  root.dataset.step=String(n); // full-bleed colour per step (red / blue / yellow)
  steps.forEach((s,k)=>s.hidden=k!==n);
  dots.setAttribute("aria-valuenow",String(n+1));
  dots.style.setProperty("--n",String(n));
  back.hidden=n===0;
  nextTxt.textContent=t(n===steps.length-1?"setup.start":"app.next");
  steps[n].querySelector<HTMLElement>("h1,h2")?.focus?.({preventScroll:true});
}
function finish(){
  const v=nickIn.value.trim().replace(/\s+/g," ");
  if([...v].length>=2&&[...v].length<=20)api.setCachedNick(v); // name is local first; social.ts syncs it to the server
  ls.set(KEY,"1");
  render();
  done();
}
$("#onbNext").onclick=()=>i<steps.length-1?step(i+1):finish();
back.onclick=()=>step(Math.max(0,i-1));
$("#onbSkip").onclick=finish;
nickIn.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();finish()}});
// ask for the camera here (with the reason on screen) instead of in the middle of the first game
camBtn.onclick=async()=>{
  camBtn.setAttribute("aria-busy","true");
  try{
    const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
    s.getTracks().forEach(t=>t.stop());
    camBtn.textContent=t("onb.allowed");camBtn.classList.add("ok");camBtn.disabled=true;
  }catch(e){camBtn.textContent=t("onb.denied");camBtn.classList.add("warn")}
  finally{camBtn.removeAttribute("aria-busy")}
};
steps.forEach(s=>s.querySelector("h1,h2")?.setAttribute("tabindex","-1"));

export function showOnb(){
  nickIn.value=api.cachedNick()||"";
  showOnly("onb");
  step(0);
}
// true when the onboarding is shown now (first visit). Earlier players (history or a nickname) skip it.
export function firstRun(){
  if(ls.get(KEY)||ls.get("novacore.history")||api.cachedNick()){ls.set(KEY,"1");done();return false}
  showOnb();
  return true;
}
