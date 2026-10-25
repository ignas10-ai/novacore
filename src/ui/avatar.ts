// Mascot art in the markup + the profile character (Claude Design). paintArt() fills placeholders once:
//   [data-mascot="r:idle"] / "b:vs:anim" = full-body mascot (who:pose[:anim]), [data-mascots="vs"] = the face-off pair,
//   [data-head="r|b"] = head avatar, [data-avatar] = the player's own character head (Raudonas default, Mėlynas).
// ponytail: the character is local only (novacore.char); add a profiles column if friends should see it in Kompanijos.
import {mascot,avatar,vsPair,type Who,type Pose} from "./mascots.ts";

const KEY="novacore.char";
export type Char=Who;
export function getChar():Char{try{return localStorage.getItem(KEY)==="b"?"b":"r"}catch(e){return "r"}}
export function paintArt(root:ParentNode=document){
  root.querySelectorAll<HTMLElement>("[data-mascot]:empty").forEach(el=>{
    const [w,p,a]=el.dataset.mascot!.split(":");
    el.innerHTML=mascot(w as Who,(p||"idle") as Pose,{anim:a==="anim"});
  });
  root.querySelectorAll<HTMLElement>("[data-mascots]:empty").forEach(el=>{el.innerHTML=vsPair()});
  root.querySelectorAll<HTMLElement>("[data-head]:empty").forEach(el=>{el.innerHTML=avatar(el.dataset.head as Who)});
}
export function paintAvatars(){
  const c=getChar();
  document.querySelectorAll<HTMLElement>("[data-avatar]").forEach(el=>{
    if(el.dataset.char===c&&el.firstElementChild)return;
    el.dataset.char=c;el.innerHTML=avatar(c);
  });
  document.querySelectorAll<HTMLElement>("[data-char][role=radio]").forEach(b=>b.setAttribute("aria-checked",String(b.dataset.char===c)));
}
document.querySelectorAll<HTMLElement>("[data-char][role=radio]").forEach(b=>b.onclick=()=>{
  try{localStorage.setItem(KEY,b.dataset.char!)}catch(e){}
  paintAvatars();
});
paintArt();
paintAvatars();
