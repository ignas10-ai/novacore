// Tiny DOM helpers shared by the UI modules.
export const $=<T extends Element=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
export function replay(el:Element,cls:string){el.classList.remove(cls);void (el as HTMLElement).offsetWidth;el.classList.add(cls)}
export function setDigits(el:HTMLElement,str:string){ // transitions.dev number pop-in
  el.classList.remove("is-animating");
  el.replaceChildren(...[...str].map((ch,k,a)=>{const s=document.createElement("span");s.className="t-digit";s.textContent=ch;if(k===a.length-1&&a.length>1)s.dataset.stagger="1";return s}));
  void el.offsetWidth;el.classList.add("is-animating");
}
export function setCue(root:HTMLElement,label:HTMLElement,kind:string,text:string){
  kind=kind||"none";
  if(root.dataset.cue!==kind)root.dataset.cue=kind;
  const on=kind!=="none";
  if(root.classList.contains("on")!==on)root.classList.toggle("on",on);
  if(label.textContent!==text)label.textContent=text;
}
