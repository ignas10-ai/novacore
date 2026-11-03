// Slide to start (Martynas 11-03: no accidental taps on the big start buttons). slide(button) adds a knob to the button:
// drag it to the end = the button's click (its own onclick / listeners run as before). A tap only nudges the knob;
// the keyboard (Enter / Space, click.detail 0) still activates it directly, so it stays accessible and testable.
import {icon} from "./icons.ts";

export function slide(b:HTMLButtonElement,ic="arrow-right"){
  b.classList.add("slide");
  const k=document.createElement("span");k.className="slide-k";k.setAttribute("aria-hidden","true");k.innerHTML=icon(ic);
  b.prepend(k);
  let x0=0,max=1,dx=0,drag=false,moved=false;
  const move=(x:number)=>{dx=Math.max(0,Math.min(max,x));k.style.translate=`${dx}px 0`;b.style.setProperty("--p",String(dx/max))};
  b.addEventListener("pointerdown",e=>{
    if(b.disabled||b.getAttribute("aria-busy")==="true")return;
    drag=true;moved=false;x0=e.clientX;max=Math.max(1,b.clientWidth-k.offsetWidth-2*k.offsetLeft);k.style.transition="none";
    b.setPointerCapture(e.pointerId);
  });
  b.addEventListener("pointermove",e=>{if(!drag)return;move(e.clientX-x0);if(dx>6)moved=true});
  const end=()=>{
    if(!drag)return;drag=false;
    const done=dx>=max*.85;k.style.transition="";move(done?max:0);
    if(done){b.click();setTimeout(()=>move(0),400)} // a script click() has detail 0
  };
  b.addEventListener("pointerup",end);b.addEventListener("pointercancel",end);
  // capture on the button itself runs before its onclick: only a finished slide (script click) or the keyboard get through
  b.addEventListener("click",e=>{
    if(e.detail===0)return;
    e.stopImmediatePropagation();e.preventDefault();
    if(moved){moved=false;return} // the pointer's own click after a drag
    b.classList.remove("nudge");void b.offsetWidth;b.classList.add("nudge");
  },{capture:true});
}
