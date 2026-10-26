// Tiny i18n, no library: t(key, params?) and tn(key, n, params?) over two typed dictionaries (lt = default, en).
// Safe to import from the PURE modules (detect/, stats.ts): no DOM at import, and outside a browser (Node checks)
// the language is always "lt", so the original copy is what the tests see.
// Language = ?lang=lt|en (demos, not saved) > localStorage novacore.lang (Profilis → Nustatymai) > navigator.language
// (lt* → LT, anything else → EN). Switching in the app saves the choice and reloads the page (every module builds its
// text once on load). The TV board follows the phone: setLang() + translateDom() in screen.ts (ScreenState.lang).
import {lt} from "./lt.ts";
import {en} from "./en.ts";

export type Key=keyof typeof lt;
export type Lang="lt"|"en";
export type Params=Record<string,string|number>;
export const LANG_KEY="novacore.lang";
const DICT:Record<Lang,Record<Key,string>>={lt,en};
export const isLang=(v:unknown):v is Lang=>v==="lt"||v==="en";

export function detectLang():Lang{
  if(typeof document==="undefined")return "lt";
  try{const q=new URLSearchParams(location.search).get("lang");if(isLang(q))return q}catch(e){}
  try{const s=localStorage.getItem(LANG_KEY);if(isLang(s))return s}catch(e){}
  return /^lt\b/i.test(navigator.language||"lt")?"lt":"en";
}
export let lang:Lang=detectLang();
export function setLang(l:Lang){lang=l}
// en-GB: day/month order and a Monday week, like the app's own week logic
export const locale=()=>lang==="lt"?"lt-LT":"en-GB";

const fill=(s:string,p?:Params)=>p?s.replace(/\{(\w+)\}/g,(m,k)=>k in p?String(p[k]):m):s;
export const t=(k:Key,p?:Params)=>fill(DICT[lang][k],p);
// plurals: lt "one|few|other" (1 žaidimas, 2 žaidimai, 10 žaidimų), en "one|other"; {n} is filled in
const rules:Partial<Record<Lang,Intl.PluralRules>>={};
export function tn(k:Key,n:number,p?:Params){
  const forms=DICT[lang][k].split("|"), c=(rules[lang]??=new Intl.PluralRules(locale())).select(n);
  const i=c==="one"?0:lang==="lt"&&c==="few"?1:forms.length-1;
  return fill(forms[i],{n,...p});
}
// 12,34 (lt) / 12.34 (en), never grouped
export const dec=(n:number,digits:number)=>n.toLocaleString(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:false});
export const weekday=(day:number,style:"short"|"long")=>{const s=new Date(day).toLocaleDateString(locale(),{weekday:style});return style==="short"?s[0].toUpperCase()+s.slice(1):s};
