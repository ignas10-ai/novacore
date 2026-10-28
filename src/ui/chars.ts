// The 4 player characters (Claude Design v2, 10-28) + one action pose per sport. Art: public/chars/*.webp (transparent).
// The chosen character is local (novacore.char) and drives the avatar, the profile plinth and the win pose;
// sport poses are fixed per game. ponytail: no shop yet – locked skins / payments come with the monetization issue.
export const CHARS=[
  {id:"r",name:"Kometa",sheet:"sheetR",color:"#E8273A"},
  {id:"b",name:"Banga",sheet:"sheetB",color:"#2A5BE8"},
  {id:"y",name:"Saulė",sheet:"sheetY",color:"#E09A00"},
  {id:"g",name:"Mėta",sheet:"sheetG",color:"#12A35E"},
] as const;
export type CharId=typeof CHARS[number]["id"];
// game tile key (hd-tile → hd) → pose file; a game without one shows its own art
export const POSE:Record<string,string>={sp:"sprint",hd:"hurdles",lj:"longjump",bx:"boxing",bw:"bowling",sk:"skiing",wl:"wall",bd:"badminton",jv:"javelin"};
const KEY="novacore.char"; // shared with avatar.ts (it maps anything but "b" to Raudonas for the old SVG head)
export const myChar=()=>CHARS.find(c=>c.id===(()=>{try{return localStorage.getItem(KEY)}catch{return null}})())??CHARS[0];
export function setChar(id:CharId){try{localStorage.setItem(KEY,id)}catch{}applyChar()}
// CSS reads --me-sheet / --me-color (avatar head crop, profile plinth)
export function applyChar(){
  const c=myChar(),s=document.documentElement.style;
  s.setProperty("--me-sheet",`url(/chars/${c.sheet}.webp)`);s.setProperty("--me-color",c.color);
  document.querySelectorAll<HTMLElement>(".char-pick [data-char]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.char===c.id)));
}
