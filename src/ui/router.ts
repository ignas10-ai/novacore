// Hash router for the app screens + bottom tab bar. URLs: #/ (Pradžia), #/kompanijos, #/kompanijos/<id>,
// #/pratimai, #/profilis, #/zaisti (game setup). Query params (?g=CODE, ?c=<id>) live before the hash and are
// untouched. history.state.d = how many entries this tab pushed, so in-app back buttons and the Home tab use the
// real history (Android back always does what the screen's back button does). Tabs replace each other; only Home
// stays underneath, so back from any tab lands on Pradžia, then leaves the app.
// The game flow (#ready/#end/#clips) and the onboarding are not routes: they claim back via setBackHandler().
export type View="home"|"groups"|"group"|"library"|"profile"|"setup";
const SCREEN:Record<View,string>={home:"home",groups:"groups",group:"group",library:"library",profile:"profile",setup:"start"};
const TAB:Record<View,string>={home:"home",groups:"groups",group:"groups",library:"library",profile:"profile",setup:"home"};

export function parse(hash:string):{v:View;arg:string}{
  const [a,b]=hash.replace(/^#\/?/,"").split("/");
  if(a==="kompanijos")return b?{v:"group",arg:decodeURIComponent(b)}:{v:"groups",arg:""};
  if(a==="pratimai")return {v:"library",arg:""};
  if(a==="profilis")return {v:"profile",arg:""};
  if(a==="zaisti")return {v:"setup",arg:""};
  return {v:"home",arg:""}; // also #/zaidimas (game entry) after a reload
}

const hooks:Partial<Record<View,(arg:string)=>void>>={};
export const onView=(v:View,fn:(arg:string)=>void)=>{hooks[v]=fn};
let cur:View|null=null, curArg="", toHome=false, backHandler:(()=>boolean)|null=null, firstShow=true;
const scrolls=new Map<string,number>();
export const depth=()=>(history.state?.d as number)||0;
export const current=()=>cur;
export const setBackHandler=(fn:()=>boolean)=>{backHandler=fn};
const el=(id:string)=>document.getElementById(id)!;

function show(v:View,arg:string,dir:""|"fwd"|"back"){
  const prev=cur&&el(SCREEN[cur]);
  if(prev&&!prev.classList.contains("hide"))scrolls.set(prev.id+(curArg||""),prev.scrollTop);
  el("onb").classList.add("hide");
  for(const id of Object.values(SCREEN))el(id).classList.toggle("hide",id!==SCREEN[v]);
  const scr=el(SCREEN[v]);
  scr.dataset.dir=dir;
  document.body.dataset.view=v;
  document.querySelectorAll<HTMLElement>("#tabbar [data-tab]").forEach(a=>{if(a.dataset.tab===TAB[v])a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  cur=v;curArg=arg;
  hooks[v]?.(arg);
  scr.scrollTop=dir==="back"?scrolls.get(scr.id+arg)||0:0; // back restores where you were
  if(!firstShow)scr.querySelector<HTMLElement>("h1[tabindex]")?.focus({preventScroll:true}); // screen readers land on the new title
  firstShow=false;
}
export function render(dir:""|"fwd"|"back"=""){const {v,arg}=parse(location.hash);show(v,arg,dir)}
export const refresh=()=>{if(cur&&!document.body.classList.contains("ingame"))hooks[cur]?.(curArg)};

export function go(hash:string,replace=false){
  if(replace)history.replaceState({d:depth()},"",hash);else history.pushState({d:depth()+1},"",hash);
  render(replace?"":"fwd");
}
// back to Pradžia by popping our own entries (no duplicate home entry left behind)
export function home(){
  const d=depth();
  if(d>0){toHome=true;history.go(-d)}else go("#/",true);
}
function tab(href:string){
  const v=parse(href).v;
  if(v===cur){el(SCREEN[v]).scrollTo({top:0,behavior:"smooth"});return} // re-tap = scroll to top
  if(v==="home"){home();return}
  go(href,cur!=="home");
}
addEventListener("popstate",()=>{
  if(backHandler?.())return;
  if(toHome){toHome=false;if(parse(location.hash).v!=="home")history.replaceState({d:0},"","#/")}
  render("back");
});
// internal links: tabs follow the tab rule, data-back uses real history when there is some
document.addEventListener("click",e=>{
  const a=(e.target as Element).closest<HTMLAnchorElement>('a[href^="#/"]');
  if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey)return;
  e.preventDefault();
  const href=a.getAttribute("href")!;
  if(a.hasAttribute("data-back")&&depth()>0)history.back();
  else if(a.dataset.tab)tab(href);
  else go(href);
});
// screens the router does not own (game flow, onboarding)
export function leaveApp(){for(const id of Object.values(SCREEN))el(id).classList.add("hide")}
export function showOnly(id:string){leaveApp();el(id).classList.remove("hide");document.body.dataset.view=id}
if(!history.state)history.replaceState({d:0},"",location.href);
