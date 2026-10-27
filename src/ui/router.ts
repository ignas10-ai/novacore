// Hash router for the app screens + bottom tab bar. URLs: #/ (Pradžia), #/kompanijos, #/kompanijos/<id>,
// #/pratimai, #/profilis, #/zaisti (game setup). Query params (?g=CODE, ?c=<id>) live before the hash and are
// untouched. history.state.d = how many entries this tab pushed, so in-app back buttons and the Home tab use the
// real history (Android back always does what the screen's back button does). Tabs replace each other; only Home
// stays underneath, so back from any tab lands on Pradžia, then leaves the app.
// The game flow (#ready/#end/#clips) and the onboarding are not routes: they claim back via setBackHandler().
export type View="home"|"groups"|"group"|"library"|"profile"|"setup"|"sprint"|"boxing"|"longjump"|"hurdles"|"bowling"|"wall"|"screen";
const SCREEN:Record<View,string>={home:"home",groups:"groups",group:"group",library:"library",profile:"profile",setup:"start",sprint:"sprint",boxing:"boxing",longjump:"longjump",hurdles:"hurdles",bowling:"bowling",wall:"wall",screen:"screen"};
const TAB:Record<View,string>={home:"home",groups:"groups",group:"groups",library:"library",profile:"profile",setup:"home",sprint:"home",boxing:"home",longjump:"home",hurdles:"home",bowling:"home",wall:"home",screen:""};

export function parse(hash:string):{v:View;arg:string}{
  const [a,b]=hash.replace(/^#\/?/,"").split("/");
  if(a==="kompanijos")return b?{v:"group",arg:decodeURIComponent(b)}:{v:"groups",arg:""};
  if(a==="pratimai")return {v:"library",arg:""};
  if(a==="profilis")return {v:"profile",arg:""};
  if(a==="zaisti")return {v:"setup",arg:""};
  if(a==="sprintas")return {v:"sprint",arg:""}; // src/sprint
  if(a==="boksas")return {v:"boxing",arg:""}; // src/boxing
  if(a==="tolis")return {v:"longjump",arg:""}; // src/longjump
  if(a==="barjerai")return {v:"hurdles",arg:""}; // src/hurdles
  if(a==="boulingas")return {v:"bowling",arg:""}; // src/bowling
  if(a==="siena")return {v:"wall",arg:""}; // src/wall
  if(a==="ekranas")return {v:"screen",arg:b?decodeURIComponent(b):""};
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

const ROOTS:View[]=["home","groups","library","profile"];
const MOTION_MS=360; // = --duration-medium + a frame; the leaving screen stays visible for the push/pop slide
let leaving:HTMLElement|null=null, leaveTimer=0;
function settle(){clearTimeout(leaveTimer);document.querySelectorAll<HTMLElement>(".screen[data-enter]").forEach(s=>delete s.dataset.enter);if(leaving){leaving.classList.add("hide");delete leaving.dataset.leave;leaving.inert=false;leaving=null}}
function show(v:View,arg:string,dir:""|"fwd"|"back"){
  settle();
  const prev=cur?el(SCREEN[cur]):null, prevShown=!!prev&&!prev.classList.contains("hide");
  if(prev&&prevShown)scrolls.set(prev.id+(curArg||""),prev.scrollTop);
  el("onb").classList.add("hide");
  const scr=el(SCREEN[v]);
  // native feel: push/pop slide into and out of sub-screens, a short fade between tabs, nothing on the first paint
  const anim=firstShow||prev===scr?"":dir&&ROOTS.includes(v)&&cur&&ROOTS.includes(cur)?"tab":dir||"in";
  const slide=prevShown&&(anim==="fwd"||anim==="back");
  for(const id of Object.values(SCREEN))if(id!==scr.id&&!(slide&&id===prev!.id))el(id).classList.add("hide");
  if(slide){leaving=prev;prev!.dataset.leave=anim;prev!.inert=true;leaveTimer=setTimeout(settle,MOTION_MS)}
  scr.classList.remove("hide");
  if(anim)scr.dataset.enter=anim;else delete scr.dataset.enter;
  clearTimeout(enterTimer);enterTimer=setTimeout(()=>delete scr.dataset.enter,MOTION_MS);
  document.body.dataset.view=v;
  document.querySelectorAll<HTMLElement>("#tabbar [data-tab]").forEach(a=>{if(a.dataset.tab===TAB[v])a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  cur=v;curArg=arg;
  hooks[v]?.(arg);
  scr.scrollTop=dir==="back"?scrolls.get(scr.id+arg)||0:0; // back restores where you were
  scrolledState(scr);
  if(!firstShow)scr.querySelector<HTMLElement>("h1[tabindex]")?.focus({preventScroll:true}); // screen readers land on the new title
  firstShow=false;
}
let enterTimer=0;
// sticky top bar: frosted background + compact title once the large title has scrolled away
const scrolledState=(s:HTMLElement)=>s.classList.toggle("scrolled",s.scrollTop>40);
document.addEventListener("scroll",e=>{const t=e.target;if(t instanceof HTMLElement&&t.classList.contains("app"))scrolledState(t)},{capture:true,passive:true});
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
export function leaveApp(){settle();for(const id of Object.values(SCREEN))el(id).classList.add("hide")}
export function showOnly(id:string){leaveApp();el(id).classList.remove("hide");document.body.dataset.view=id}
if(!history.state)history.replaceState({d:0},"",location.href);
