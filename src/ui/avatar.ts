// Profile character (ui-v3): the avatar is the head of Raudonas (default) or Mėlynas, picked in Profilis → Nustatymai.
// ponytail: local only (novacore.char); add a profiles column if friends should see it in Kompanijos.
const KEY="novacore.char";
const HEAD={
  r:[new URL("../art/raudonas-head.webp",import.meta.url).href,new URL("../art/raudonas-head@2x.webp",import.meta.url).href],
  b:[new URL("../art/melynas-head.webp",import.meta.url).href,new URL("../art/melynas-head@2x.webp",import.meta.url).href],
};
export type Char="r"|"b";
export function getChar():Char{try{return localStorage.getItem(KEY)==="b"?"b":"r"}catch(e){return "r"}}
export function paintAvatars(){
  const c=getChar(), [x1,x2]=HEAD[c];
  document.querySelectorAll<HTMLElement>("[data-avatar]").forEach(el=>{
    el.dataset.char=c;
    const img=el.querySelector("img")||el.appendChild(Object.assign(document.createElement("img"),{alt:"",width:96,height:96,decoding:"async"}));
    if(img.getAttribute("src")!==x1){img.src=x1;img.srcset=`${x1} 1x, ${x2} 2x`}
  });
  document.querySelectorAll<HTMLElement>("[data-char][role=radio]").forEach(b=>b.setAttribute("aria-checked",String(b.dataset.char===c)));
}
document.querySelectorAll<HTMLElement>("[data-char][role=radio]").forEach(b=>b.onclick=()=>{
  try{localStorage.setItem(KEY,b.dataset.char!)}catch(e){}
  paintAvatars();
});
paintAvatars();
