// Online UI (src/online/api.ts): Kompanijos screens (#groups list + create/join, #group detail with the weekly
// leaderboard, invite, leave), the rank card on Pradžia, the nickname sheet, challenge card (/?c=<game id>),
// invite links (/?g=CODE), post-game save, "Mesti iššūkį" and the beat / not-beat line on #end.
// The nickname is LOCAL first (novacore.nick, set in onboarding or the sheet) and synced to profiles when online.
// Every network call is caught: offline or a backend that is not ready only shows a note, the game never waits.
import {S} from "../game/state.ts";
import {$,toast,sheet} from "./dom.ts";
import {t,tn} from "../i18n/i18n.ts";
import {onView,go,current,refresh} from "./router.ts";
import {onbDone} from "./onboarding.ts";
import {markBeat} from "../history/history.ts";
import * as api from "../online/api.ts";
import {Capacitor} from "@capacitor/core";
import {Share} from "@capacitor/share";
import {icon} from "./icons.ts";
import {weekStart} from "../history/stats.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chars=(s:string)=>[...s].length; // the DB checks char_length (code points), not UTF-16 units
const nick=()=>api.cachedNick();
const TONES=["red","blue","yellow","ink"];
const toneFor=(name:string)=>TONES[[...name].reduce((n,c)=>n+c.codePointAt(0)!,0)%TONES.length]; // stable colour per name

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
// in the Android app the page lives on https://localhost, so invite/challenge links must point at the web app
export const WEB=Capacitor.isNativePlatform()?"https://novacore-two.vercel.app":location.origin;
export async function share(url:string,text:string,noteEl:HTMLElement){
  // Android WebView has no navigator.share -> the native share sheet
  if(Capacitor.isNativePlatform())try{await Share.share({title:"MoveClash",text,url});return}catch(e){if(/cancel/i.test(String(e)))return}
  try{if(navigator.share){await navigator.share({title:"MoveClash",text,url});return}}
  catch(e){if((e as Error).name==="AbortError")return}
  try{await navigator.clipboard.writeText(url);toast(t("grp.copied"))}
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
  note(nickNote,t("nick.len"));
  $("#nickLater").hidden=!then; // editing from Profilis: the X is enough
  nickS.open();
}
$("#nickForm").addEventListener("submit",e=>{
  e.preventDefault();
  const v=nickIn.value.trim().replace(/\s+/g," ");
  if(chars(v)<2||chars(v)>20){note(nickNote,t("nick.bad"),true);return}
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
  const n=$("#rankN"), tx=$("#rankTxt");
  let best=0, where:api.Group|null=null;
  for(const g of groups){const r=rankOf(boards[g.id]);if(r&&(!best||r<best)){best=r;where=g}}
  n.textContent=best?t("grp.place",{n:best}):t("home.groups");
  tx.textContent=!api.sb?t("grp.league"):!nick()||!groups.length?t("home.create"):best?where!.name:t("grp.notPlayed");
}
function groupItem(g:api.Group){
  const rows=boards[g.id], r=rankOf(rows);
  const li=document.createElement("li");
  const a=document.createElement("a");a.className="box grp-item tap";a.href=`#/kompanijos/${encodeURIComponent(g.id)}`;
  const av=document.createElement("span");av.className="grp-av d";av.textContent=[...g.name][0].toUpperCase();
  av.dataset.tone=toneFor(g.name);
  const tx=document.createElement("span");tx.className="grp-txt";
  const b=document.createElement("b");b.textContent=g.name;
  const sm=document.createElement("small");sm.textContent=rows?tn("u.members",rows.length):t("app.loading");
  tx.append(b,sm);
  const rk=document.createElement("span");rk.className="grp-rank d";rk.textContent=r?`#${r}`:"–";rk.setAttribute("aria-label",r?t("grp.yourPlace",{n:r}):t("grp.notPlayed"));
  const ch=document.createElement("span");ch.className="chev";ch.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  a.append(av,tx,rk,ch);li.append(a);
  return li;
}
function renderGroups(){
  const list=$("#grpList"), empty=$("#grpEmpty"), off=$("#grpOff"), forms=$("#grpForms");
  const unavailable=!api.sb;
  off.hidden=!unavailable&&!loadErr;
  if(unavailable){$("#grpOffTitle").textContent=t("grp.offTitle");$("#grpOffTxt").textContent=t("grp.offTxt")}
  else if(loadErr){$("#grpOffTitle").textContent=t("grp.loadFail");$("#grpOffTxt").textContent=loadErr}
  forms.hidden=unavailable;
  list.hidden=!groups.length;
  list.replaceChildren(...groups.map(groupItem));
  empty.hidden=unavailable||!!groups.length||(!!nick()&&!loaded&&!loadErr);
}
// ---------- group detail: podium (top 3) + rows with trend arrows; week countdown; group switcher ----------
const letter=(n:string)=>([...n.trim()][0]||"?").toUpperCase();
function lAv(nick:string,cls="lb-av"){const a=document.createElement("span");a.className=cls+" d";a.dataset.tone=toneFor(nick);a.textContent=letter(nick);return a}
function duelBtn(r:api.LbRow){ // remote duel invite (src/duel/duel.ts handles the click on #lb)
  const d=document.createElement("button");d.type="button";d.className="icon-btn lb-duel tap";
  d.dataset.duel=r.user_id;d.dataset.nick=r.nickname;d.setAttribute("aria-label",t("grp.duelAria",{nick:r.nickname}));d.innerHTML=icon("swords");
  return d;
}
// trend = rank change since this group was last opened (localStorage snapshot; ponytail: per phone, not per week)
const RK="novacore.ranks.";
const prevRanks:Record<string,Record<string,number>>={};
function trend(uid:string,rank:number){
  const p=prevRanks[gid]?.[uid];
  if(!rank||!p||p===rank)return null;
  const el=document.createElement("span");el.className="lb-trend "+(rank<p?"up":"down");
  el.innerHTML=icon(rank<p?"chevron-up":"chevron-down");el.setAttribute("aria-label",t(rank<p?"grp.up":"grp.down"));el.setAttribute("role","img");
  return el;
}
function lbRow(r:api.LbRow,i:number,rank:number){
  const li=document.createElement("li");
  li.className="lb-row";li.style.setProperty("--i",String(i%10));
  if(r.user_id===me)li.classList.add("me");
  const n=document.createElement("span");n.className="lb-n d";n.textContent=r.best!=null?String(rank):"–";
  const who=document.createElement("span");who.className="lb-name";
  const nm=document.createElement("b");nm.textContent=r.nickname;who.append(nm);
  if(r.user_id===me){const y=document.createElement("i");y.textContent=t("p.youLower");nm.append(y)}
  const sm=document.createElement("small");sm.textContent=r.games?tn("u.games",r.games):t("grp.notYet");who.append(sm);
  const best=document.createElement("b");best.className="lb-best d";best.textContent=r.best!=null?String(r.best):"—";
  li.append(n,lAv(r.nickname),who);
  const tr=trend(r.user_id,rank);li.append(tr||Object.assign(document.createElement("span"),{className:"lb-trend"}));
  li.append(best);
  if(r.user_id!==me)li.append(duelBtn(r));
  return li;
}
function podium(top:api.LbRow[]){
  const li=document.createElement("li");li.className="podium";li.setAttribute("aria-label",t("grp.top3"));
  const order=[1,0,2]; // 2nd left, 1st centre (tallest), 3rd right
  for(const k of order){
    const r=top[k];
    const col=document.createElement("div");col.className=`pod p${k+1}`;
    if(!r){col.classList.add("empty");col.innerHTML=`<span class="pod-block d">${k+1}</span>`;li.append(col);continue}
    const av=lAv(r.nickname,"pod-av");
    if(k===0)av.insertAdjacentHTML("afterbegin",`<span class="pod-crown" aria-hidden="true">${icon("crown")}</span>`);
    if(r.user_id===me)av.insertAdjacentHTML("beforeend",`<span class="pod-me">${t("p.youLower")}</span>`);
    const nm=document.createElement("b");nm.className="pod-name";nm.textContent=r.nickname;
    const sc=document.createElement("b");sc.className="pod-score d";sc.textContent=String(r.best);
    const blk=document.createElement("span");blk.className="pod-block d";blk.textContent=String(k+1);
    col.append(av,nm,sc);
    if(r.user_id!==me)av.append(duelBtn(r));
    col.append(blk);
    col.setAttribute("aria-label",t("grp.podAria",{n:k+1,nick:r.nickname,score:r.best??0}));
    li.append(col);
  }
  return li;
}
let showAll=false, lastGid="";
const SHOW=6;
function weekLeft(){ // the board resets on Monday 00:00 (date_trunc('week')), shown in local time
  const ms=weekStart(Date.now())+7*864e5-Date.now(), h=Math.floor(ms/36e5), d=Math.floor(h/24);
  return d?t("grp.wkDH",{d,h:h%24}):h?t("grp.wkHM",{h,m:Math.floor(ms/6e4)%60}):t("grp.wkM",{m:Math.max(1,Math.floor(ms/6e4))});
}
function renderGroup(){
  const g=groups.find(x=>x.id===gid), rows=boards[gid];
  if(gid!==lastGid){lastGid=gid;showAll=false;try{prevRanks[gid]??=JSON.parse(localStorage.getItem(RK+gid)||"{}")}catch(e){prevRanks[gid]={}}}
  $("#groupTitle").textContent=$("#groupNav").textContent=g?.name||t(loaded?"grp.notFound":"grp.group");
  $("#grpCode").textContent=g?.code||"––––––";
  ($("#grpShare") as HTMLButtonElement).disabled=!g;
  grpLeave.hidden=!g;
  resetLeave();
  $("#weekLeft").textContent=weekLeft();
  const sw=$<HTMLSelectElement>("#grpSwitch");
  $("#grpSwitchWrap").hidden=groups.length<2;
  sw.replaceChildren(...groups.map(x=>Object.assign(document.createElement("option"),{value:x.id,textContent:x.name,selected:x.id===gid})));
  $("#lbMeta").textContent=rows?`${tn("u.members",rows.length)} · ${t("grp.weekLeague")}`:t("grp.weekLeague");
  const more=$<HTMLButtonElement>("#lbMore");more.hidden=true;
  if(!g&&loaded){lb.replaceChildren(Object.assign(document.createElement("li"),{className:"lb-empty",textContent:t("grp.notMember")}));return}
  if(!rows){lb.replaceChildren(Object.assign(document.createElement("li"),{className:"lb-empty",textContent:loadErr||t("app.loading")}));return}
  $("#duelHint").hidden=rows.length<2;
  let rank=0;
  const ranked=rows.map(r=>({r,rank:r.best!=null?++rank:0}));
  const top=ranked.filter(x=>x.rank&&x.rank<=3).map(x=>x.r), rest=ranked.filter(x=>!(x.rank&&x.rank<=3));
  const mine=rest.findIndex(x=>x.r.user_id===me), cut=showAll||rest.length<=SHOW-3||mine>=SHOW-3?rest.length:SHOW-3;
  lb.replaceChildren(...(top.length?[podium(top)]:[]),...rest.slice(0,cut).map((x,i)=>lbRow(x.r,i,x.rank)));
  if(cut<rest.length){more.hidden=false;more.innerHTML=`${t("grp.showAll",{n:rows.length})}${icon("chevron-right")}`}
  try{localStorage.setItem(RK+gid,JSON.stringify(Object.fromEntries(ranked.filter(x=>x.rank).map(x=>[x.r.user_id,x.rank]))))}catch(e){}
}
$("#lbMore").onclick=()=>{showAll=true;renderGroup()};
$<HTMLSelectElement>("#grpSwitch").onchange=e=>go(`#/kompanijos/${encodeURIComponent((e.target as HTMLSelectElement).value)}`,true);
onView("groups",()=>{note(grpNote,"");renderGroups();loadGroups()});
onView("group",id=>{gid=id;note(grpNote2,"");renderGroup();loadGroups()});
onView("home",renderHomeRank);

async function joinByCode(code:string){
  try{
    const g=await syncProfile().then(()=>api.joinGroup(code));
    await loadGroups();go(`#/kompanijos/${encodeURIComponent(g.id)}`);toast(t("grp.joined",{name:g.name}));
  }catch(e){go("#/kompanijos");note(grpNote,api.errText(e),true)}
}
$("#grpNewForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$<HTMLInputElement>("#grpName"), v=inp.value.trim().replace(/\s+/g," ");
  if(chars(v)<2||chars(v)>30){note(grpNote,t("grp.nameLen"),true);inp.focus();return}
  if(needNick(t("grp.needNickNew"),()=>$<HTMLFormElement>("#grpNewForm").requestSubmit()))return;
  note(grpNote,t("grp.creating"));
  try{
    await syncProfile();const g=await api.createGroup(v);inp.value="";note(grpNote,"");
    await loadGroups();go(`#/kompanijos/${encodeURIComponent(g.id)}`);toast(t("grp.created",{code:g.code}));
  }catch(err){note(grpNote,api.errText(err),true)}
});
$("#grpJoinForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$<HTMLInputElement>("#grpCodeIn"), v=inp.value.trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(v)){note(grpNote,t("grp.codeBad"),true);inp.focus();return}
  if(needNick(t("grp.needNickJoin"),()=>$<HTMLFormElement>("#grpJoinForm").requestSubmit()))return;
  note(grpNote,t("app.connecting"));
  try{const g=await syncProfile().then(()=>api.joinGroup(v));inp.value="";note(grpNote,"");await loadGroups();go(`#/kompanijos/${encodeURIComponent(g.id)}`)}
  catch(err){note(grpNote,api.errText(err),true)}
});
$("#grpShare").onclick=()=>{
  const g=groups.find(x=>x.id===gid);
  if(g)share(`${WEB}/?g=${g.code}`,t("grp.inviteTxt",{name:g.name,code:g.code}),grpNote2);
};
let leaveTimer=0;
function resetLeave(){clearTimeout(leaveTimer);grpLeaveTxt.textContent=t("grp.leave");grpLeave.classList.remove("arm")}
grpLeave.onclick=async()=>{
  if(!grpLeave.classList.contains("arm")){ // two taps: no accidental leave
    grpLeave.classList.add("arm");grpLeaveTxt.textContent=t("grp.leaveSure");
    leaveTimer=setTimeout(resetLeave,3000);return;
  }
  resetLeave();
  const g=groups.find(x=>x.id===gid);if(!g)return;
  try{
    await api.leaveGroup(g.id);
    groups=groups.filter(x=>x.id!==g.id);delete boards[g.id];
    renderHomeRank();toast(t("grp.left",{name:g.name}));
    history.back();
  }catch(e){note(grpNote2,api.errText(e),true)}
};

// ---------- challenge link ----------
const mins=(d:number)=>t("u.min",{n:d/60});
async function loadChallenge(id:string){
  const box=$("#chal"), txt=$("#chalTxt"), goBtn=$("#chalGo");
  try{
    await api.ensureSession();
    me=await api.userId();
    const c=await api.getChallenge(id);
    box.hidden=false;
    if(!c){txt.textContent=t("chal.notFound");goBtn.hidden=true;return}
    challenge={...c,id};goBtn.hidden=false;
    txt.replaceChildren(Object.assign(document.createElement("b"),{textContent:t("chal.from",{nick:c.nickname})}),Object.assign(document.createElement("span"),{textContent:t("chal.line",{score:c.score,min:mins(c.duration),duel:c.players===2?t("chal.duel"):""})}));
    // same settings as the challenger, so the comparison is fair
    document.querySelector<HTMLElement>(`[data-d="${c.duration}"]`)?.click();
    if(c.players===1)document.querySelector<HTMLElement>('[data-p="1"]')?.click();
  }catch(e){box.hidden=false;goBtn.hidden=true;txt.textContent=t("chal.fail",{err:api.errText(e)})}
}
$("#chalGo").onclick=()=>go("#/zaisti");
$("#chalX").onclick=()=>{challenge=null;$("#chal").hidden=true;strip("c")};

// ---------- after a game (called from renderResults) ----------
// queued = sent on the next start; not queued (localStorage blocked) = it is lost unless the player retries now
const notSaved=()=>t(row&&api.queued(row.id)?"on.queued":"on.failed");
async function saveRow(){
  if(!row||rowSaved)return rowSaved;
  onNote.textContent=t("on.sending");
  try{
    await syncProfile();
    rowSaved=await api.saveGame(row);
    onNote.textContent=!rowSaved?notSaved()
      :t(!(row.players===1&&row.duration===180)?"on.savedNotRanked":groups.length?"on.savedBoard":"on.saved");
  }catch(e){onNote.textContent=notSaved()}
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
    if(c.duration!==duration){$("#chalVerdict").textContent=t("chal.otherTime");$("#chalLine").textContent=t("chal.otherTimeLine",{nick:c.nickname,min:mins(c.duration)});res.dataset.win=""}
    else{
      const d=row.score-c.score;
      $("#chalVerdict").textContent=t(d>0?"chal.beat":d===0?"res.tie":"chal.notYet");
      $("#chalLine").textContent=t("chal.vs",{me:row.score,them:c.score,nick:c.nickname})+(d<0?t("chal.short",{n:-d}):"");
      res.dataset.win=d>0?"1":d===0?"0":"-1";
      if(d>0)markBeat();
    }
  }
  chalBtn.hidden=!api.sb||!row;
  onNote.textContent=t(api.sb&&!nick()?"on.needNick":"on.next");
  if(api.sb&&nick()&&row)saveRow();
}
chalBtn.onclick=async()=>{
  if(needNick(t("chal.needNick"),()=>chalBtn.click()))return;
  // the link is shared only once the row is confirmed on the server: a /?c=<id> to a missing game opens nothing
  if(!(await saveRow())||!row){onNote.textContent=`${onNote.textContent} ${t("chal.linkLater")}`;return}
  share(`${WEB}/?c=${row.id}`,t("chal.share",{score:row.score,min:mins(row.duration)}),onNote);
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
  }else if(code)openNick(t("grp.needNickJoin"),()=>joinByCode(code));
})();
