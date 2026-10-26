// index.html keeps its Lithuanian copy; this pass looks every text node and translatable attribute up in lt.ts by its
// exact (whitespace-collapsed) value and writes the current language. The key is remembered per node, so the TV board
// can be re-translated when the phone's language arrives. Imported first in main.ts (before any module reads the DOM).
import {lt} from "./lt.ts";
import {t,lang,type Key} from "./i18n.ts";

export const norm=(s:string)=>s.replace(/\s+/g," ").trim();
const byLt=new Map<string,Key>();
for(const k of Object.keys(lt).reverse() as Key[])byLt.set(norm(lt[k]),k); // reverse: the first key of a value wins
const ATTRS=["aria-label","title","placeholder"];
const textKey=new WeakMap<Text,Key>(), attrKey=new WeakMap<Element,Record<string,Key>>();

export function translateDom(root:ParentNode=document){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let n=w.nextNode() as Text|null;n;n=w.nextNode() as Text|null){
    const k=textKey.get(n)??byLt.get(norm(n.data));
    if(!k||n.parentElement?.closest("script,style"))continue;
    textKey.set(n,k);
    const v=t(k), lead=/^\s*/.exec(n.data)![0], trail=/\s*$/.exec(n.data)![0];
    if(norm(n.data)!==norm(v))n.data=lead+v+trail;
  }
  root.querySelectorAll<HTMLElement>("[aria-label],[title],[placeholder],meta[content]").forEach(el=>{
    const keys=attrKey.get(el)??{};
    for(const a of el.tagName==="META"?["content"]:ATTRS){
      const v=el.getAttribute(a);if(v==null)continue;
      const k=keys[a]??byLt.get(norm(v));if(!k)continue;
      keys[a]=k;if(v!==t(k))el.setAttribute(a,t(k));
    }
    attrKey.set(el,keys);
  });
  root.querySelectorAll("template").forEach(tp=>translateDom(tp.content));
}

if(typeof document!=="undefined"){
  document.documentElement.lang=lang;
  translateDom(document);
  if(lang==="en")document.querySelector('link[rel="manifest"]')?.setAttribute("href","manifest.en.webmanifest");
}
