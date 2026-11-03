// Minimal avatar emblems + one sport symbol per game. No character photos/renders: the old chibi and 3D portraits are
// intentionally gone (they looked like AI slop), replaced by geometric tokens/icons that fit the zen/arcade style.
export const CHARS=[
  {id:"spark",nameKey:"char.spark",src:"/chars/avatars/spark.svg",color:"#FF9C9C"},
  {id:"wave",nameKey:"char.wave",src:"/chars/avatars/wave.svg",color:"#8FD8FF"},
  {id:"sun",nameKey:"char.sun",src:"/chars/avatars/sun.svg",color:"#FFD66B"},
  {id:"leaf",nameKey:"char.leaf",src:"/chars/avatars/leaf.svg",color:"#8DE8CA"},
  {id:"orbit",nameKey:"char.orbit",src:"/chars/avatars/orbit.svg",color:"#C5B6FF"},
  {id:"star",nameKey:"char.star",src:"/chars/avatars/star.svg",color:"#F7A8D8"},
  {id:"flame",nameKey:"char.flame",src:"/chars/avatars/flame.svg",color:"#FFB98A"},
  {id:"moon",nameKey:"char.moon",src:"/chars/avatars/moon.svg",color:"#A7C8FF"},
] as const;
export type CharId=typeof CHARS[number]["id"];
const OLD:Record<string,CharId>={r:"spark",b:"wave",y:"sun",g:"leaf",r2:"orbit",b2:"star",y2:"flame",g2:"moon"};
// game key (hd-tile → hd) → its colour; rr = Rep Maratonas (the camera exercise game, #/zaisti).
// duo = two players at the same time (the Rungtys "Kartu vienu metu" filter); the rest take turns.
export const GAME:Record<string,{color:string;duo:boolean;beta?:boolean}>={
  rr:{color:"#8DE8CA",duo:true},sp:{color:"#FF9C9C",duo:true},bx:{color:"#B7AEFF",duo:true},
  lj:{color:"#FFD66B",duo:false},hd:{color:"#FFB98A",duo:true,beta:true},sk:{color:"#8FD8FF",duo:true},
  bw:{color:"#F7A8D8",duo:false,beta:true},bd:{color:"#C5E87A",duo:true,beta:true},jv:{color:"#FFC9A0",duo:false,beta:true},
  wl:{color:"#A8E6F0",duo:false},
};
// every game cover is a different animated sport composition (src/ui/sport.ts)
export const SPORT:Record<string,string>={
  rr:"sport-rr",sp:"sport-sp",bx:"sport-bx",lj:"sport-lj",hd:"sport-hd",
  bw:"sport-bw",sk:"sport-sk",wl:"sport-wl",bd:"sport-bd",jv:"sport-jv",
};
// Home's today card uses a DIFFERENT minimal icon set (and no character art), so the same game looks different in
// Pradžia and Rungtys.
export const HOME_ICON:Record<string,string>={
  rr:"arrows-clockwise",sp:"zap",bx:"shield",lj:"arrow-up-right",hd:"timer",
  bw:"target",sk:"snowflake",wl:"door-open",bd:"wind",jv:"arrow-up",
};
const KEY="novacore.char";
export const myChar=()=>{
  let id:string|null=null;try{id=localStorage.getItem(KEY)}catch{}
  return CHARS.find(c=>c.id===id)??CHARS.find(c=>c.id===OLD[id||""])??CHARS[0];
};
export function setChar(id:CharId){try{localStorage.setItem(KEY,id)}catch{}applyChar()}
// CSS reads --me-img / --me-color (avatar, profile coin)
export function applyChar(){
  const c=myChar(),s=document.documentElement.style;
  s.setProperty("--me-img",`url(${c.src})`);s.setProperty("--me-color",c.color);
  document.querySelectorAll<HTMLElement>(".char-pick [data-char],.char-grid [data-char]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.char===c.id)));
}
