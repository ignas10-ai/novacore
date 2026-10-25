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
// Lithuanian plural: plural(2,["diena","dienos","dienų"]) -> "dienos"
export function plural(n:number,[one,few,many]:[string,string,string]){
  const a=Math.abs(n)%10,b=Math.abs(n)%100;
  return a===1&&b!==11?one:a>=2&&(b<10||b>=20)?few:many;
}
// short status message at the bottom (aria-live polite, never steals focus)
let toastTimer=0;
export function toast(msg:string){
  const t=document.getElementById("toast")!;
  t.textContent=msg;t.classList.add("on");
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("on"),3200);
}
// fill every [data-tpl="id"] under root with a copy of <template id>
export function fillTpl(root:ParentNode){
  root.querySelectorAll<HTMLElement>("[data-tpl]").forEach(el=>{if(!el.firstElementChild)el.append((document.getElementById(el.dataset.tpl!) as HTMLTemplateElement).content.cloneNode(true))});
}
// bottom sheet on a native <dialog>: slides up, slides down on close (Esc, backdrop tap, close buttons)
export function sheet(d:HTMLDialogElement){ // same open/close animation as the exercise and history sheets
  let t=0;
  const close=()=>{if(!d.open||d.classList.contains("closing"))return;d.classList.add("closing");clearTimeout(t);t=setTimeout(()=>{d.classList.remove("closing");if(d.open)d.close()},210)};
  d.addEventListener("cancel",e=>{e.preventDefault();close()});
  d.addEventListener("click",e=>{if(e.target===d)close()});
  d.addEventListener("close",()=>{clearTimeout(t);d.classList.remove("closing")});
  return {open(){clearTimeout(t);d.classList.remove("closing");if(!d.open)d.showModal()},close};
}
