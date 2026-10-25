// Online UI (src/online/api.ts): nickname chip + Kompanijos button on #start, nickname and kompanijos sheets
// (reuse the .ex-sheet chrome), challenge banner (/?c=<game id>), invite links (/?g=CODE), post-game save,
// "Mesti iššūkį" and the beat / not-beat line on #end. Every network call is caught: offline or a backend that is
// not ready only shows a note, the game never waits for it.
import {S} from "../game/state.ts";
import {$} from "./dom.ts";
import * as api from "../online/api.ts";

const GROUP_KEY="novacore.group", SKIP_KEY="novacore.nickSkip";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ls={get(k:string){try{return localStorage.getItem(k)}catch(e){return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch(e){}}};
const chars=(s:string)=>[...s].length; // the DB checks char_length (code points), not UTF-16 units

let nick=api.cachedNick(), me:string|null=null;
let groups:api.Group[]=[], gid=ls.get(GROUP_KEY), rows:api.LbRow[]|null=null;
let challenge:(api.Challenge&{id:string})|null=null;
let afterNick:(()=>void)|null=null;
let row:api.GameRow|null=null, rowSaved=false;

const nickIn=$<HTMLInputElement>("#nickIn"), nickNote=$("#nickNote"), nickSub=$("#nickSub"), nickSave=$<HTMLButtonElement>("#nickSave");
const grpNote=$("#grpNote"), grpTabs=$("#grpTabs"), grpCard=$("#grpCard"), grpEmpty=$("#grpEmpty"), lb=$("#lb"), grpLeave=$("#grpLeave");
const chalBtn=$("#chalBtn"), onNote=$("#onNote");
const NICK_SUB=nickSub.textContent!;

function note(el:HTMLElement,text:string,warn=false){el.textContent=text;el.classList.toggle("warn",warn)}
function strip(k:string){try{const u=new URL(location.href);u.searchParams.delete(k);history.replaceState(null,"",u)}catch(e){}}
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
  try{await navigator.clipboard.writeText(url);note(noteEl,"Nuoroda nukopijuota – įklijuok draugams.")}
  catch(e){note(noteEl,url)}
}

// ---------- nickname ----------
const nickS=sheet($<HTMLDialogElement>("#nickSheet"));
function renderChip(){
  $("#nickTxt").textContent=nick||"Slapyvardis";
  $("#nickAv").textContent=nick?[...nick][0].toUpperCase():"?";
  $("#nickOpen").classList.toggle("empty",!nick);
}
function openNick(sub=NICK_SUB,then:(()=>void)|null=null){
  afterNick=then;
  nickSub.textContent=sub;
  nickIn.value=nick||"";
  note(nickNote,"2–20 simbolių");
  nickS.open();
}
$("#nickForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const v=nickIn.value.trim().replace(/\s+/g," ");
  if(chars(v)<2||chars(v)>20){note(nickNote,"Slapyvardis – nuo 2 iki 20 simbolių.",true);return}
  nickSave.setAttribute("aria-busy","true");note(nickNote,"Saugoma…");
  try{
    await api.saveNick(v);
    nick=v;renderChip();nickS.close();
    const then=afterNick;afterNick=null;
    api.flushGames().catch(()=>{});
    if(then)then();else loadBoard();
  }catch(err){note(nickNote,api.errText(err),true)}
  finally{nickSave.removeAttribute("aria-busy")}
});
$("#nickLater").onclick=()=>{ls.set(SKIP_KEY,"1");afterNick=null;nickS.close()};
$("#nickClose").onclick=()=>{afterNick=null;nickS.close()};
$("#nickOpen").onclick=()=>openNick();

// ---------- kompanijos + weekly leaderboard ----------
const grpS=sheet($<HTMLDialogElement>("#grpSheet"));
function pickGroup(id:string|null){gid=id;rows=null;if(id)ls.set(GROUP_KEY,id)}
function renderRank(){
  const el=$("#grpRank");
  el.hidden=!rows;
  if(!rows)return;
  const i=rows.findIndex(r=>r.user_id===me);
  el.textContent=i>=0&&rows[i].best!=null?`#${i+1}`:"–";
}
function renderSheet(){
  const g=groups.find(x=>x.id===gid);
  grpTabs.hidden=groups.length<2;
  grpTabs.replaceChildren(...groups.map(x=>{
    const b=document.createElement("button");
    b.type="button";b.className="grp-tab";b.setAttribute("role","tab");b.setAttribute("aria-selected",String(x.id===gid));
    const s=document.createElement("span");s.textContent=x.name;b.append(s);
    b.onclick=()=>{if(x.id!==gid){pickGroup(x.id);renderSheet();loadBoard()}};
    return b;
  }));
  grpCard.hidden=!g;
  grpEmpty.hidden=!!g||!nick;
  if(!g)return;
  $("#grpCode").textContent=g.code;
  resetLeave();
  if(!rows){lb.replaceChildren(Object.assign(document.createElement("li"),{className:"lb-empty",textContent:"Kraunama…"}));return}
  let rank=0;
  lb.replaceChildren(...rows.map((r,i)=>{
    const li=document.createElement("li");
    li.className="lb-row";li.style.setProperty("--i",String(i%10));
    if(r.user_id===me)li.classList.add("me");
    const n=document.createElement("span");n.className="lb-n d";n.textContent=r.best!=null?String(++rank):"–";
    const who=document.createElement("span");who.className="lb-name";who.textContent=r.nickname;
    if(r.user_id===me){const t=document.createElement("i");t.textContent="tu";who.append(t)}
    const sm=document.createElement("small");sm.textContent=r.games?`${r.games} žaid.`:"dar nežaidė";who.append(sm);
    const best=document.createElement("b");best.className="lb-best d";best.textContent=r.best!=null?String(r.best):"—";
    li.append(n,who,best);
    return li;
  }));
}
async function loadBoard(){
  if(!nick)return;
  try{
    me=await api.userId(); // local read; the session may have been created after start (first nickname)
    groups=await api.myGroups();
    if(!groups.some(g=>g.id===gid))pickGroup(groups[0]?.id||null);
    renderSheet();
    rows=gid?await api.leaderboard(gid):null;
    renderRank();renderSheet();
  }catch(e){note(grpNote,api.errText(e),true)}
}
function openGrp(){
  if(!nick){openNick("Pirma – slapyvardis, kurį matys kompanija.",openGrp);return}
  note(grpNote,"");
  renderSheet();grpS.open();loadBoard();
}
$("#grpOpen").onclick=openGrp;
$("#grpClose").onclick=grpS.close;
$("#grpDone").onclick=grpS.close;
async function joinByCode(code:string){
  try{
    const g=await api.joinGroup(code);
    pickGroup(g.id);openGrp();note(grpNote,`Prisijungei prie „${g.name}“.`);
  }catch(e){openGrp();note(grpNote,api.errText(e),true)}
}
$("#grpNewForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$<HTMLInputElement>("#grpName"), v=inp.value.trim().replace(/\s+/g," ");
  if(chars(v)<2||chars(v)>30){note(grpNote,"Pavadinimas – nuo 2 iki 30 simbolių.",true);return}
  note(grpNote,"Kuriama…");
  try{const g=await api.createGroup(v);inp.value="";pickGroup(g.id);await loadBoard();note(grpNote,`Sukurta! Kodas ${g.code} – pakviesk draugus.`)}
  catch(err){note(grpNote,api.errText(err),true)}
});
$("#grpJoinForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$<HTMLInputElement>("#grpCodeIn"), v=inp.value.trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(v)){note(grpNote,"Kodas – 6 raidės ar skaičiai.",true);return}
  note(grpNote,"Jungiamasi…");
  try{const g=await api.joinGroup(v);inp.value="";pickGroup(g.id);await loadBoard();note(grpNote,`Prisijungei prie „${g.name}“.`)}
  catch(err){note(grpNote,api.errText(err),true)}
});
$("#grpShare").onclick=()=>{
  const g=groups.find(x=>x.id===gid);
  if(g)share(`${location.origin}/?g=${g.code}`,`Prisijunk prie „${g.name}“ NovaCore kompanijos (kodas ${g.code}) – kas surinks daugiau per 3 min?`,grpNote);
};
let leaveTimer=0;
function resetLeave(){clearTimeout(leaveTimer);grpLeave.textContent="Išeiti iš kompanijos";grpLeave.classList.remove("arm")}
grpLeave.onclick=async()=>{
  if(!grpLeave.classList.contains("arm")){ // two taps: no accidental leave
    grpLeave.classList.add("arm");grpLeave.textContent="Tikrai išeiti? Spausk dar kartą";
    leaveTimer=setTimeout(resetLeave,3000);return;
  }
  resetLeave();
  const id=gid;if(!id)return;
  try{await api.leaveGroup(id);pickGroup(null);await loadBoard();note(grpNote,"Išėjai iš kompanijos.");if(!groups.length)renderRank()}
  catch(e){note(grpNote,api.errText(e),true)}
};

// ---------- challenge link ----------
const mins=(d:number)=>`${d/60} min`;
async function loadChallenge(id:string){
  const box=$("#chal"), txt=$("#chalTxt");
  try{
    await api.ensureSession();
    me=await api.userId();
    const c=await api.getChallenge(id);
    if(!c){box.hidden=false;txt.textContent="Šis iššūkis nerastas.";return}
    challenge={...c,id};
    box.hidden=false;
    txt.replaceChildren(Object.assign(document.createElement("b"),{textContent:c.nickname}),` surinko ${c.score} tšk. per ${mins(c.duration)} – įveik!`);
    // same settings as the challenger, so the comparison is fair
    document.querySelector<HTMLElement>(`[data-d="${c.duration}"]`)?.click();
    if(c.players===1)document.querySelector<HTMLElement>('[data-p="1"]')?.click();
  }catch(e){box.hidden=false;txt.textContent=`Iššūkio atidaryti nepavyko. ${api.errText(e)}`}
}
$("#chalX").onclick=()=>{challenge=null;$("#chal").hidden=true;strip("c")};

// ---------- after a game (called from renderResults) ----------
async function saveRow(){
  if(!row||rowSaved)return rowSaved;
  onNote.textContent="Siunčiamas rezultatas…";
  try{
    rowSaved=await api.saveGame(row);
    onNote.textContent=!rowSaved?"Rezultatas liko telefone – bus nusiųstas, kai bus ryšys."
      :!(row.players===1&&row.duration===180)?"Išsaugota. Lentelėje skaičiuojami 3 min solo žaidimai."
      :groups.length?"Rezultatas įrašytas į kompanijos lentelę.":"Rezultatas išsaugotas.";
  }catch(e){onNote.textContent="Rezultatas liko telefone – bus nusiųstas, kai bus ryšys."}
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
    }
  }
  chalBtn.hidden=!api.sb||!row;
  if(nick&&row)saveRow();
}
chalBtn.onclick=async()=>{
  if(!nick){openNick("Iššūkiui reikia slapyvardžio – jį pamatys draugas.",()=>chalBtn.click());return}
  if(!(await saveRow())||!row)return;
  share(`${location.origin}/?c=${row.id}`,`Surinkau ${row.score} tšk. per ${mins(row.duration)} NovaCore. Įveik!`,onNote);
};

// ---------- start ----------
(async()=>{
  if(!api.sb)return; // no env vars: no online UI at all
  $("#social").hidden=false;renderChip();
  const q=new URLSearchParams(location.search);
  const code=q.get("g")?.trim().toUpperCase()||"", cid=q.get("c")||"";
  if(code)strip("g"); // joining is one-shot; the challenge stays in the URL until dismissed (retries after reload)
  let offline=false; // could not reach the server: keep the cached nickname, do not nag
  try{me=await api.userId();if(me){nick=await api.loadNick();renderChip()}}catch(e){offline=true}
  if(cid&&UUID.test(cid))loadChallenge(cid);
  if(nick){
    api.flushGames().catch(()=>{});
    if(code)joinByCode(code);else loadBoard();
  }else if(code)openNick("Pirma – slapyvardis, tada prisijungsi prie kompanijos.",()=>joinByCode(code));
  else if(!offline&&!ls.get(SKIP_KEY)&&navigator.onLine)openNick(); // first run
})();
