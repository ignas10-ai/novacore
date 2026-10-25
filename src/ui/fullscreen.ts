// fullscreen: use vendor-prefixed fallback, hide the control when unsupported
import {$} from "./dom.ts";

const fsBtn=$("#fs"), fsRoot=document.documentElement as any, doc=document as any;
const fsApi=fsRoot.requestFullscreen||fsRoot.webkitRequestFullscreen;
if(!fsApi) fsBtn.hidden=true;
const fsElement=()=>doc.fullscreenElement||doc.webkitFullscreenElement||null;
function updateFs(){
  const on=!!fsElement();
  fsBtn.dataset.on=on?"1":"0";
  fsBtn.setAttribute("aria-pressed",on?"true":"false");
  const label=on?"Išeiti iš viso ekrano":"Visas ekranas";
  fsBtn.setAttribute("aria-label",label);fsBtn.title=label;
}
async function toggleFs(){
  try{
    if(fsElement()){
      if(doc.exitFullscreen) await doc.exitFullscreen();
      else doc.webkitExitFullscreen?.();
    }else if(fsRoot.requestFullscreen) await fsRoot.requestFullscreen({navigationUI:"hide"});
    else await fsRoot.webkitRequestFullscreen?.();
  }catch(e){/* browser may reject if the gesture was lost */}
  updateFs();
}
fsBtn.onclick=toggleFs;
["fullscreenchange","webkitfullscreenchange"].forEach(ev=>document.addEventListener(ev,updateFs));
updateFs();
