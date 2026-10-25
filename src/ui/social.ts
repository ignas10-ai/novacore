// Online UI (src/online/api.ts): Kompanijos screens (#groups list + create/join, #group detail with the weekly
// leaderboard, invite, leave), the rank card on Pradžia, the nickname sheet, challenge card (/?c=<game id>),
// invite links (/?g=CODE), post-game save, "Mesti iššūkį" and the beat / not-beat line on #end.
// The nickname is LOCAL first (novacore.nick, set in onboarding or the sheet) and synced to profiles when online.
// Every network call is caught: offline or a backend that is not ready only shows a note, the game never waits.
import {S} from "../game/state.ts";
import {$,plural,toast} from "./dom.ts";
import {onView,go,current,refresh} from "./router.ts";
import {onbDone} from "./onboarding.ts";
import {markBeat} from "../history/history.ts";
import * as api from "../online/api.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chars=(s:string)=>[...s].length; // the DB checks char_length (code points), not UTF-16 units
const nick=()=>api.cachedNick();

let serverNick:string|null=null, me:string|null=null;
let groups:api.Group[]=[], boards:Record<string,api.LbRow[]|null>={}, loaded=false, loadErr="", gid="";
let challenge:(api.Challenge&{id:string})|null=null;
let afterNick:(()=>void)|null=null;
let row:api.GameRow|null=null, rowSaved=false;

const nickIn=$<HTMLInputElement>("#nickIn"), nickNote=$("#nickNote"), nickSub=$("#nickSub");
const grpNote=$("#grpNote"), grpNote2=$("#grpNote2"), lb=$("#lb"), grpLeave=$("#grpLeave"), grpLeaveTxt=$("#grpLeaveTxt");
const chalBtn=$("#chalBtn"), onNote=$("#onNote");
const NICK_SUB=nickSub.textContent!;

function note(el:HTMLElement,text:string,warn=false){el.textContent=text;el.classList.toggle("warn",warn)}
function strip(k:string){try{const u=new URL(location.href);u.searchParams.delete(k);history.replaceState(history.state,"",u)}catch(e){}}
function sheet(d:HTMLDialogElement){ // same open/close animation as the exercise and history sheets
  let t=0;
  const close=()=>{if(!d.open||d.classList.contains("closing"))return;d.classList.add("closing");clearTimeout(t);t=setTimeout(()=>{d.classList.remove("closing");if(d.open)d.close()},210)};
  d.addEventListener("cancel",e=>{e.preventDefault();close()});
  d.addEventListener("click",e=>{if(e.target===d)close()});
  d.addEventListener("close",()=>{clearTimeout(t);d.classList.remove("closing")});
  return {open(){clearTimeout(t);d.classList.remove("closing");if(!d.open)d.showModal()},close};
}
async function share(url:string,text:string,noteEl:HTMLElement){
  try{if(navigator.share){await navigator.share({title:"NovaCore",text,url});return}}
  catch(e){if((e as Error).name==="AbortError")return}
  try{await navigator.clipboard.writeText(url);toast("Nuoroda nukopijuota – įklijuok draugams.")}
  catch(e){note(noteEl,url)}
}
// the server needs a profile row before games / groups; created from the local name on first use
async function syncProfile(){
  const n=nick();
  if(!n)throw new Error("no nick");
  if(serverNick===n)return;
  await api.saveNick(n);serverNick=n;
}

// ---------- nickname (local first) ----------
const nickS=sheet($<HTMLDialogElement>("#nickSheet"));
export function openNick(sub=NICK_SUB,then:(()=>void)|null=null){
  afterNick=then;
  nickSub.textContent=sub;
  nickIn.value=nick()||"";
  note(nickNote,"2–20 simbolių");
  $("#nickLater").hidden=!then; // editing from Profilis: the X is enough
  nickS.open();
}
$("#nickForm").addEventListener("submit",e=>{
  e.preventDefault();
  const v=nickIn.value.trim().replace(/\s+/g," ");
  if(chars(v)<2||chars(v)>20){note(nickNote,"Slapyvardis – nuo 2 iki 20 simbolių.",true);return}
  api.setCachedNick(v);nickS.close();refresh();
  const then=afterNick;afterNick=null;
  if(then)then();
  else if(api.sb)syncProfile().then(()=>api.flushGames()).then(loadGroups).catch(()=>{}); // offline: synced next time
});
$("#nickLater").onclick=()=>{afterNick=null;nickS.close()};
$("#nickClose").onclick=()=>{afterNick=null;nickS.close()};
$("#nickOpen").onclick=()=>openNick();
function needNick(sub:string,then:()=>void){if(nick())return false;openNick(sub,then);return true}

// ---------- kompanijos ----------
const rankOf=(rows:api.LbRow[]|null|undefined)=>{const i=rows?rows.findIndex(r=>r.user_id===me):-1;return i>=0&&rows![i].best!=null?i+1:0};
async function loadGroups(){
  if(!api.sb||!nick())return;
  try{
    await syncProfile();
    me=await api.userId();
    groups=await api.myGroups();
    const rows=await Promise.all(groups.map(g=>api.leaderboard(g.id).catch(()=>null)));
    boards=Object.fromEntries(groups.map((g,i)=>[g.id,rows[i]]));
    loaded=true;loadErr="";
  }catch(e){loadErr=api.errText(e)}
  renderGroups();renderHomeRank();
  if(current()==="group")renderGroup();
}
export function renderHomeRank(){
  const n=$("#rankN"), t=$("#rankTxt");
  let best=0, where:api.Group|null=null;
  for(const g of groups){const r=rankOf(boards[g.id]);if(r&&(!best||r<best)){best=r;where=g}}
  n.textContent=best?`#${best}`:"–";
  t.textContent=!api.sb?"Kompanijos":!nick()||!groups.length?"Sukurk kompaniją":best?`vieta · ${where!.name}`:"Šią savaitę dar nežaidei";
}
function groupItem(g:api.Group){
  const rows=boards[g.id], r=rankOf(rows);
  const li=document.createElement("li");
  const a=document.createElement("a");a.className="card grp-item";a.href=`#/kompanijos/${encodeURIComponent(g.id)}`;
  const av=document.createElement("span");av.className="grp-av d";av.textContent=[...g.name][0].toUpperCase();
  const tx=document.createElement("span");tx.className="grp-txt";
  const b=document.createElement("b");b.textContent=g.name;
  const sm=document.createElement("small");sm.textContent=rows?`${rows.length} ${plural(rows.length,["narys","nariai","narių"])}`:"Kraunama…";
  tx.append(b,sm);
  const rk=document.createElement("span");rk.className="grp-rank d";rk.textContent=r?`#${r}`:"–";rk.setAttribute("aria-label",r?`Tavo vieta ${r}`:"Šią savaitę dar nežaidei");
  const ch=document.createElement("span");ch.className="chev";ch.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  a.append(av,tx,rk,ch);li.append(a);
  return li;
}
function renderGroups(){
  const list=$("#grpList"), empty=$("#grpEmpty"), off=$("#grpOff"), forms=$("#grpForms");
  const unavailable=!api.sb;
  off.hidden=!unavailable&&!loadErr;
  if(unavailable){$("#grpOffTitle").textContent="Kompanijos šioje versijoje išjungtos";$("#grpOffTxt").textContent="Žaidimas, pratimai ir tavo statistika veikia ir be jų."}
  else if(loadErr){$("#grpOffTitle").textContent="Nepavyko įkelti";$("#grpOffTxt").textContent=loadErr}
  forms.hidden=unavailable;
  list.hidden=!groups.length;
  list.replaceChildren(...groups.map(groupItem));
  empty.hidden=unavailable||!!groups.length||(!!nick()&&!loaded&&!loadErr);
}
function lbRow(r:api.LbRow,i:number,rank:number){
  const li=document.createElement("li");
  li.className="lb-row";li.style.setProperty("--i",String(i%10));
  if(r.user_id===me)li.classList.add("me");
  if(rank===1)li.classList.add("first");
  const n=document.createElement("span");n.className="lb-n d";n.textContent=r.best!=null?String(rank):"–";
  const who=document.createElement("span");who.className="lb-name";
  const nm=document.createElement("b");nm.textContent=r.nickname;who.append(nm);
  if(r.user_id===me){const t=document.createElement("i");t.textContent="tu";nm.append(t)}
  const sm=document.createElement("small");sm.textContent=r.games?`${r.games} ${plural(r.games,["žaidimas","žaidimai","žaidimų"])}`:"dar nežaidė";who.append(sm);
  const best=document.createElement("b");best.className="lb-best d";best.textContent=r.best!=null?String(r.best):"—";
  li.append(n,who,best);
  return li;
}
function renderGroup(){
  const g=groups.find(x=>x.id===gid), rows=boards[gid];
  $("#groupTitle").textContent=g?.name||(loaded?"Kompanija nerasta":"Kompanija");
  $("#grpCode").textContent=g?.code||"––––––";
  ($("#grpShare") as HTMLButtonElement).disabled=!g;
  grpLeave.hidden=!g;
  resetLeave();
  $("#lbMeta").textContent=rows?`${rows.length} ${plural(rows.length,["narys","nariai","narių"])}`:"";
  if(!g&&loaded){lb.replaceChildren(Object.assign(document.createElement("li"),{className:"lb-empty",textContent:"Tu nebe šios kompanijos narys arba ji ištrinta."}));return}
  if(!rows){lb.replaceChildren(Object.assign(document.createElement("li"),{className:"lb-empty",textContent:loadErr||"Kraunama…"}));return}
  let rank=0;
  lb.replaceChildren(...rows.map((r,i)=>lbRow(r,i,r.best!=null?++rank:0)));
}
onView("groups",()=>{note(grpNote,"");renderGroups();loadGroups()});
onView("group",id=>{gid=id;note(grpNote2,"");renderGroup();loadGroups()});
onView("home",renderHomeRank);

async function joinByCode(code:string){
  try{
    const g=await syncProfile().then(()=>api.joinGroup(code));
    await loadGroups();go(`#/kompanijos/${encodeURIComponent(g.id)}`);toast(`Prisijungei prie „${g.name}“.`);
  }catch(e){go("#/kompanijos");note(grpNote,api.errText(e),true)}
}
$("#grpNewForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$<HTMLInputElement>("#grpName"), v=inp.value.trim().replace(/\s+/g," ");
  if(chars(v)<2||chars(v)>30){note(grpNote,"Pavadinimas – nuo 2 iki 30 simbolių.",true);inp.focus();return}
  if(needNick("Pirma – slapyvardis, kurį matys kompanija.",()=>$<HTMLFormElement>("#grpNewForm").requestSubmit()))return;
  note(grpNote,"Kuriama…");
  try{
    await syncProfile();const g=await api.createGroup(v);inp.value="";note(grpNote,"");
    await loadGroups();go(`#/kompanijos/${encodeURIComponent(g.id)}`);toast(`Sukurta! Kodas ${g.code} – pakviesk draugus.`);
  }catch(err){note(grpNote,api.errText(err),true)}
});
$("#grpJoinForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$<HTMLInputElement>("#grpCodeIn"), v=inp.value.trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(v)){note(grpNote,"Kodas – 6 raidės ar skaičiai.",true);inp.focus();return}
  if(needNick("Pirma – slapyvardis, tada prisijungsi prie kompanijos.",()=>$<HTMLFormElement>("#grpJoinForm").requestSubmit()))return;
  note(grpNote,"Jungiamasi…");
  try{const g=await syncProfile().then(()=>api.joinGroup(v));inp.value="";note(grpNote,"");await loadGroups();go(`#/kompanijos/${encodeURIComponent(g.id)}`)}
  catch(err){note(grpNote,api.errText(err),true)}
});
$("#grpShare").onclick=()=>{
  const g=groups.find(x=>x.id===gid);
  if(g)share(`${location.origin}/?g=${g.code}`,`Prisijunk prie „${g.name}“ NovaCore kompanijos (kodas ${g.code}) – kas surinks daugiau per 3 min?`,grpNote2);
};
let leaveTimer=0;
function resetLeave(){clearTimeout(leaveTimer);grpLeaveTxt.textContent="Išeiti iš kompanijos";grpLeave.classList.remove("arm")}
grpLeave.onclick=async()=>{
  if(!grpLeave.classList.contains("arm")){ // two taps: no accidental leave
    grpLeave.classList.add("arm");grpLeaveTxt.textContent="Tikrai išeiti? Spausk dar kartą";
    leaveTimer=setTimeout(resetLeave,3000);return;
  }
  resetLeave();
  const g=groups.find(x=>x.id===gid);if(!g)return;
  try{
    await api.leaveGroup(g.id);
    groups=groups.filter(x=>x.id!==g.id);delete boards[g.id];
    renderHomeRank();toast(`Išėjai iš „${g.name}“.`);
    history.back();
  }catch(e){note(grpNote2,api.errText(e),true)}
};

// ---------- challenge link ----------
const mins=(d:number)=>`${d/60} min`;
async function loadChallenge(id:string){
  const box=$("#chal"), txt=$("#chalTxt"), goBtn=$("#chalGo");
  try{
    await api.ensureSession();
    me=await api.userId();
    const c=await api.getChallenge(id);
    box.hidden=false;
    if(!c){txt.textContent="Šis iššūkis nerastas.";goBtn.hidden=true;return}
    challenge={...c,id};goBtn.hidden=false;
    txt.replaceChildren(Object.assign(document.createElement("b"),{textContent:c.nickname}),` surinko ${c.score} tšk. per ${mins(c.duration)}${c.players===2?" (dvikova)":""}. Įveik!`);
    // same settings as the challenger, so the comparison is fair
    document.querySelector<HTMLElement>(`[data-d="${c.duration}"]`)?.click();
    if(c.players===1)document.querySelector<HTMLElement>('[data-p="1"]')?.click();
  }catch(e){box.hidden=false;goBtn.hidden=true;txt.textContent=`Iššūkio atidaryti nepavyko. ${api.errText(e)}`}
}
$("#chalGo").onclick=()=>go("#/zaisti");
$("#chalX").onclick=()=>{challenge=null;$("#chal").hidden=true;strip("c")};

// ---------- after a game (called from renderResults) ----------
async function saveRow(){
  if(!row||rowSaved)return rowSaved;
  onNote.textContent="Siunčiamas rezultatas…";
  try{
    await syncProfile();
    rowSaved=await api.saveGame(row);
    onNote.textContent=!rowSaved?"Rezultatas liko telefone – bus nusiųstas, kai bus ryšys."
      :!(row.players===1&&row.duration===180)?"Išsaugota. Lentelėje skaičiuojami 3 min solo žaidimai."
      :groups.length?"Rezultatas įrašytas į kompanijos lentelę.":"Rezultatas išsaugotas.";
  }catch(e){onNote.textContent="Rezultatas liko telefone – bus nusiųstas, kai bus ryšys."}
  if(rowSaved)loadGroups(); // fresh rank on Pradžia / Kompanijos
  return rowSaved;
}
export function afterGame(){
  const {players,duration,score,scoreEvents}=S;
  const id=globalThis.crypto?.randomUUID?.();
  row=id?api.gameRow(players,duration,score,scoreEvents,S.activeEX.map(e=>e.id),id,new Date()):null;rowSaved=false;
  const res=$("#chalRes");
  res.hidden=!challenge||!row;
  if(challenge&&row){
    const c=challenge;
    if(c.duration!==duration){$("#chalVerdict").textContent="Kitas laikas";$("#chalLine").textContent=`${c.nickname} žaidė ${mins(c.duration)} – sužaisk tiek pat, kad palygintum.`;res.dataset.win=""}
    else{
      const d=row.score-c.score;
      $("#chalVerdict").textContent=d>0?"Įveikei!":d===0?"Lygiosios!":"Dar ne";
      $("#chalLine").textContent=`Tu ${row.score} : ${c.score} ${c.nickname}${d<0?` · trūko ${-d} tšk.`:""}`;
      res.dataset.win=d>0?"1":d===0?"0":"-1";
      if(d>0)markBeat();
    }
  }
  chalBtn.hidden=!api.sb||!row;
  onNote.textContent=api.sb&&!nick()?"Įrašyk slapyvardį profilyje, kad rezultatai patektų į kompanijos lentelę.":"Toliau – geriausios žaidimo akimirkos";
  if(api.sb&&nick()&&row)saveRow();
}
chalBtn.onclick=async()=>{
  if(needNick("Iššūkiui reikia slapyvardžio – jį pamatys draugas.",()=>chalBtn.click()))return;
  if(!(await saveRow())||!row)return;
  share(`${location.origin}/?c=${row.id}`,`Surinkau ${row.score} tšk. per ${mins(row.duration)} NovaCore. Įveik!`,onNote);
};

// ---------- start ----------
(async()=>{
  renderGroups();renderHomeRank();
  if(!api.sb)return; // no env vars: the Kompanijos tab explains it, everything else works
  const q=new URLSearchParams(location.search);
  const code=q.get("g")?.trim().toUpperCase()||"", cid=q.get("c")||"";
  if(code)strip("g"); // joining is one-shot; the challenge stays in the URL until dismissed (retries after reload)
  if(cid&&UUID.test(cid))loadChallenge(cid);
  await onbDone; // first visit: the onboarding asks for the name first
  try{me=await api.userId();if(me){serverNick=await api.loadNick();if(serverNick&&!nick())api.setCachedNick(serverNick)}}catch(e){}
  if(nick()){
    syncProfile().then(()=>api.flushGames()).catch(()=>{});
    if(code)joinByCode(code);else loadGroups();
  }else if(code)openNick("Pirma – slapyvardis, tada prisijungsi prie kompanijos.",()=>joinByCode(code));
})();
