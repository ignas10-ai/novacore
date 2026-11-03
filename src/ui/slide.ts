// Slide to start (Martynas 11-03: no accidental taps on the big start buttons). slide(button) adds a knob to the button:
// drag it to the end = the button's click (its own onclick / listeners run as before). A tap only nudges the knob;
// the keyboard (Enter / Space, click.detail 0) still activates it directly, so it stays accessible and testable.
import {icon} from "./icons.ts";
import {haptic} from "../audio/sound.ts";

export function slide(b:HTMLButtonElement,ic="arrow-right"){
  b.classList.add("slide");
  const k=document.createElement("span");k.className="slide-k";k.setAttribute("aria-hidden","true");k.innerHTML=icon(ic);
  b.prepend(k);
  // Turn the label into individual letters so the text can ripple while the knob is being dragged.
  const letters:HTMLElement[]=[],runs:HTMLElement[]=[];
  const split=(node:Node)=>{
    if(node.nodeType===Node.TEXT_NODE){
      const text=node.textContent||"",frag=document.createDocumentFragment();
      for(const ch of text){
        if(/\s/.test(ch)){frag.append(document.createTextNode(ch));continue}
        const span=document.createElement("span");span.className="slide-letter";span.textContent=ch;letters.push(span);frag.append(span);
      }
      const run=document.createElement("span");run.className="slide-text";run.append(frag);runs.push(run);
      node.parentNode?.replaceChild(run,node);
    }else if(node.nodeType===Node.ELEMENT_NODE&&!(node as Element).closest(".slide-k,[data-icon]")){
      [...node.childNodes].forEach(split);
    }
  };
  [...b.childNodes].forEach(split);
  const setLetters=(p:number)=>{
    const mid=(letters.length-1)/2, span=Math.max(1,mid);
    const lift=Math.min(23,23*Math.max(0,p/.18));
    runs.forEach(r=>{r.style.translate=`0 ${(-lift).toFixed(1)}px`;r.style.opacity="1"});
    letters.forEach((el,i)=>{
      const wave=Math.sin(p*Math.PI*1.6+i*.55)*7*p;
      el.style.translate=`0 ${wave.toFixed(2)}px`;
      el.style.rotate=`${(((i-mid)/span)*p*4).toFixed(2)}deg`;
      el.style.scale=`${(1+.055*p).toFixed(3)}`;
    });
  };
  const svg=k.querySelector<SVGElement>("svg");
  let x0=0,max=1,dx=0,drag=false,moved=false,tick=0;
  const root=document.documentElement;
  const charge=(p:number)=>{
    root.style.setProperty("--charge",p.toFixed(3));
    if(p>0){
      const r=k.getBoundingClientRect();
      root.style.setProperty("--charge-x",`${r.left+r.width/2}px`);
      root.style.setProperty("--charge-y",`${r.top+r.height/2}px`);
    }
  };
  const move=(x:number)=>{
    dx=Math.max(0,Math.min(max,x));
    k.style.translate=`${dx}px 0`;b.style.setProperty("--p",String(dx/max));
    if(svg)svg.style.rotate=`${Math.round(dx/max*360)}deg`;
    setLetters(dx/max);charge(dx/max);
    const t=Math.floor(dx/max*6);
    if(t!==tick){tick=t;if(t>0&&t<6)haptic(6+t*3)}
  };
  b.addEventListener("pointerdown",e=>{
    if(b.disabled||b.getAttribute("aria-busy")==="true")return;
    drag=true;moved=false;x0=e.clientX;max=Math.max(1,b.clientWidth-k.offsetWidth-2*k.offsetLeft);k.style.transition="none";b.classList.add("dragging");
    const gc=getComputedStyle(b).getPropertyValue("--gc").trim()||"#3DD6A8";
    root.style.setProperty("--charge-color",gc);
    document.body.classList.add("charging");charge(0.001);
    haptic(7);b.setPointerCapture(e.pointerId);
  });
  b.addEventListener("pointermove",e=>{if(!drag)return;move(e.clientX-x0);if(dx>6)moved=true});
  const end=()=>{
    if(!drag)return;drag=false;b.classList.remove("dragging");
    const done=dx>=max*.85;k.style.transition="";move(done?max:0);
    if(done){haptic([30,35,70]);b.click();setTimeout(()=>{if(svg)svg.style.rotate="0deg";setLetters(0);charge(0);document.body.classList.remove("charging");move(0)},400)} // a script click() has detail 0
    else {if(svg)svg.style.rotate="0deg";setLetters(0);charge(0);document.body.classList.remove("charging")}
  };
  b.addEventListener("pointerup",end);b.addEventListener("pointercancel",end);
  // capture on the button itself runs before its onclick: only a finished slide (script click) or the keyboard get through
  b.addEventListener("click",e=>{
    if(e.detail===0)return;
    e.stopImmediatePropagation();e.preventDefault();
    if(moved){moved=false;return} // the pointer's own click after a drag
    haptic(9);
    b.classList.remove("nudge");void b.offsetWidth;b.classList.add("nudge");
  },{capture:true});
}
