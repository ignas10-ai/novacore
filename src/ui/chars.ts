// The 4 player characters + one character per sport (11-03 mint: small thick-outline chibi kids, public/chars/mini/*.webp).
// The chosen character is local (novacore.char) and drives the avatar and the profile coin; sport art is fixed per game.
// ponytail: no shop yet – locked skins / payments come with the monetization issue (#44). Art is ~400 px: regenerate larger for 3x screens.
export const CHARS=[
  {id:"r",name:"Kometa",img:"sp",color:"#FF9C9C"},
  {id:"b",name:"Banga",img:"bx",color:"#B7AEFF"},
  {id:"y",name:"Saulė",img:"lj",color:"#FFD66B"},
  {id:"g",name:"Mėta",img:"sk",color:"#8FD8FF"},
] as const;
export type CharId=typeof CHARS[number]["id"];
// game key (hd-tile → hd) → its character + colour; rr = Rep Maratonas (the camera exercise game, #/zaisti).
// duo = two players at the same time (the Rungtys "Kartu vienu metu" filter); the rest take turns.
export const GAME:Record<string,{img:string;color:string;duo:boolean}>={
  rr:{img:"rr",color:"#8DE8CA",duo:true},sp:{img:"sp",color:"#FF9C9C",duo:true},bx:{img:"bx",color:"#B7AEFF",duo:true},
  lj:{img:"lj",color:"#FFD66B",duo:false},hd:{img:"hd",color:"#FFB98A",duo:true},sk:{img:"sk",color:"#8FD8FF",duo:true},
  bw:{img:"bw",color:"#F7A8D8",duo:false},bd:{img:"bd",color:"#C5E87A",duo:true},jv:{img:"jv",color:"#FFC9A0",duo:false},
  wl:{img:"rrh",color:"#A8E6F0",duo:false},
};
export const POSE:Record<string,string>=Object.fromEntries(Object.entries(GAME).map(([k,g])=>[k,"mini/"+g.img]));
const KEY="novacore.char"; // shared with avatar.ts (it maps anything but "b" to Raudonas for the old SVG head)
export const myChar=()=>CHARS.find(c=>c.id===(()=>{try{return localStorage.getItem(KEY)}catch{return null}})())??CHARS[0];
export function setChar(id:CharId){try{localStorage.setItem(KEY,id)}catch{}applyChar()}
// CSS reads --me-img / --me-color (avatar, profile coin)
export function applyChar(){
  const c=myChar(),s=document.documentElement.style;
  s.setProperty("--me-img",`url(/chars/mini/${c.img}.webp)`);s.setProperty("--me-color",c.color);
  document.querySelectorAll<HTMLElement>(".char-pick [data-char]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.char===c.id)));
}
