// Profilis (#profile): the player's coin (character ↔ real photo), level/XP, league and the trophy cabinet.
// Customisation lives on its own screen (#/profilis/redaguoti), settings on another (#/nustatymai). Everything is
// local-first (localStorage + novacore.history), like the rest of the app; no server call is needed to show it.
import {loadHist,loadProgress,rememberProgress} from "../history/history.ts";
import {cachedNick,sb,deleteMyData,errText} from "../online/api.ts";
import {xpTotal,levelState,leagueState,trophyStates,trophyTop,TIER_XP,type TrophyState,type Tier} from "../history/trophies.ts";
import {WEB} from "./social.ts";
import {icon} from "./icons.ts";
import {$} from "./dom.ts";
import {t,lang,isLang,LANG_KEY,locale,dec,type Key} from "../i18n/i18n.ts";
import {onView,go} from "./router.ts";
import {showOnb} from "./onboarding.ts";
import {setChar,applyChar,myChar,type CharId} from "./chars.ts";

export const APP_VERSION="2.3";
const PHOTO_KEY="novacore.photo", SIDE_KEY="novacore.profSide", BG_KEY="novacore.profBg", HOME_PHOTO_KEY="novacore.profHome";
const BG:Record<string,string>={mint:"#8DE8CA",sky:"#8FD8FF",sun:"#FFD66B",peach:"#FFB98A",lilac:"#C5B6FF",rose:"#F7A8D8"};
const BG_KEYS:Record<string,string>={mint:"prof.bgMint",sky:"prof.bgSky",sun:"prof.bgSun",peach:"prof.bgPeach",lilac:"prof.bgLilac",rose:"prof.bgRose"};
const TIER_KEY:Record<Tier,Key>={bronze:"tier.bronze",silver:"tier.silver",gold:"tier.gold",purple:"tier.purple"};
const get=(k:string)=>(()=>{try{return localStorage.getItem(k)}catch(e){return null}})();
const set=(k:string,v:string|null)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
const photo=()=>get(PHOTO_KEY);
const side=()=>get(SIDE_KEY)==="photo"?"photo":"char";
const bg=()=>{const b=get(BG_KEY);return b&&BG[b]?b:"mint"};
const homePhoto=()=>get(HOME_PHOTO_KEY)==="1";
const el=(tag:string,cls:string,text="")=>Object.assign(document.createElement(tag),{className:cls,textContent:text});

// the coin, the background, the Home avatar and the edit previews all read these
export function applyProfile(){
  const photoData=photo();
  const profile=$("#profile");
  profile.style.setProperty("--prof-bg",BG[bg()]);
  $("#profileEdit").style.setProperty("--prof-bg",BG[bg()]);
  const coin=$("#profCoin");
  coin.dataset.side=photoData&&side()==="photo"?"photo":"char";
  coin.setAttribute("aria-pressed",String(coin.dataset.side==="photo"));
  const img=$<HTMLImageElement>("#profPhotoImg");
  img.hidden=!photoData;
  if(photoData)img.src=photoData;else img.removeAttribute("src");
  const home=$<HTMLElement>("#homeAv");
  if(home){
    const show=homePhoto()&&photoData;
    home.classList.toggle("photo",!!show);
    if(show)home.style.setProperty("--home-photo",`url("${photoData}")`);else home.style.removeProperty("--home-photo");
  }
  document.querySelectorAll<HTMLElement>("[data-bg]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.bg===bg())));
  document.querySelectorAll<HTMLElement>(".char-grid [data-char]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.char===myChar().id)));
}

function render(){
  const h=loadHist(), nick=cachedNick(), saved=loadProgress();
  rememberProgress(h);
  const xp=Math.max(xpTotal(h),saved.xp);
  const lv=levelState(xp), lg=leagueState(xp);
  const ts=trophyStates(h).map(x=>{
    const have=Math.max(x.have,Number(saved.have[x.id])||0);
    const unlocked=saved.trophies.includes(x.id)||have>=x.goal;
    return {...x,have,unlocked,pct:x.goal>0?Math.min(1,have/x.goal):0};
  });
  $("#profNick").textContent=nick||t("prof.noName");
  $("#profSub").textContent=t(!nick?"prof.subNoNick":sb?"prof.subOnline":"prof.local");
  $("#profLevel").textContent=t("prof.level",{n:lv.level});
  $("#profXpTxt").textContent=t("prof.xp",{n:xp});
  $("#profXpNext").textContent=t("prof.xpLeft",{n:Math.max(0,lv.need-lv.into),level:lv.level+1});
  $("#profXpFill").style.width=`${Math.round(lv.pct*100)}%`;
  $("#profLeaguePillName").textContent=t(lg.league.nameKey as Key);
  $("#profLeagueIcon").innerHTML=icon(lg.league.icon);
  $("#profLeagueName").textContent=t(lg.league.nameKey as Key);
  $("#profLeagueNext").textContent=lg.next?t("prof.leagueNext",{n:lg.left,name:t(lg.next.nameKey as Key)}):t("prof.leagueMax");
  $("#profLeagueFill").style.width=`${Math.round(lg.pct*100)}%`;
  $("#profLeaguePill").dataset.tier=lg.league.id;
  $("#leagueCard").dataset.tier=lg.league.id;
  $("#profTrophyCount").textContent=t("prof.trophyCount",{n:ts.filter(x=>x.unlocked).length,total:ts.length});
  renderTrophies(h,ts);
  renderEdit();
  applyProfile();
}

function renderTrophies(h:ReturnType<typeof loadHist>,ts:TrophyState[]){
  const grid=$("#trophies");
  grid.replaceChildren(...ts.map((x,i)=>trophyTile(x,h,i)));
  const next=ts.filter(x=>!x.unlocked).sort((a,b)=>b.pct-a.pct)[0];
  const box=$("#trophyNext");
  if(!next){box.hidden=true;return}
  box.hidden=false;
  box.dataset.tier=next.tier;
  box.innerHTML=`<span class="trophy-art" data-tier="${next.tier}" data-shape="${next.shape}"><span class="trophy-shape"></span><span class="trophy-ic">${icon(next.icon)}</span></span>
    <span class="trophy-next-txt"><small class="lbl">${t("prof.trophyNext")}</small><b>${t(next.nameKey as Key)}</b><span class="trophy-progress"><i style="width:${Math.round(next.pct*100)}%"></i></span><small>${t("prof.trophyProgress",{n:Math.min(next.have,next.goal),goal:next.goal})}</small></span>
    <span class="chev" data-icon="chevron-right"></span>`;
  (box as HTMLButtonElement).onclick=()=>openTrophy(next,h);
}

function trophyTile(x:TrophyState,h:ReturnType<typeof loadHist>,i:number){
  const b=document.createElement("button");
  b.type="button";
  b.className=`trophy-tile ${x.unlocked?"on":"locked"}`;
  b.dataset.tier=x.tier;b.dataset.shape=x.shape;b.dataset.id=x.id;
  b.style.setProperty("--i",String(i));
  b.setAttribute("aria-label",`${t(x.nameKey as Key)} ${t(TIER_KEY[x.tier])} · ${x.unlocked?t("prof.trophyUnlocked"):t("prof.trophyProgress",{n:Math.min(x.have,x.goal),goal:x.goal})}`);
  b.innerHTML=`<span class="trophy-art" data-tier="${x.tier}" data-shape="${x.shape}"><span class="trophy-shape"></span><span class="trophy-ic">${icon(x.icon)}</span></span>
    <span class="trophy-copy"><b>${t(x.nameKey as Key)}</b> <small>${t(TIER_KEY[x.tier])} · ${x.unlocked?t("prof.trophyUnlocked"):t("prof.trophyProgress",{n:Math.min(x.have,x.goal),goal:x.goal})}</small></span>
    <span class="trophy-mini-bar"><i style="width:${Math.round(x.pct*100)}%"></i></span>`;
  b.onclick=()=>openTrophy(x,h);
  return b;
}

function openTrophy(x:TrophyState,h:ReturnType<typeof loadHist>){
  const dlg=$<HTMLDialogElement>("#trophySheet");
  dlg.dataset.tier=x.tier;
  $("#trophyArt").innerHTML=`<span class="trophy-art big" data-tier="${x.tier}" data-shape="${x.shape}"><span class="trophy-shape"></span><span class="trophy-ic">${icon(x.icon)}</span></span>`;
  $("#trophyTier").textContent=`${t(TIER_KEY[x.tier])} · ${x.unlocked?t("prof.trophyUnlocked"):t("prof.trophyLocked")}`;
  $("#trophyTier").dataset.tier=x.tier;
  $("#trophyName").textContent=t(x.nameKey as Key);
  $("#trophyDesc").textContent=t(x.descKey as Key);
  $("#trophyProgressTxt").textContent=t("prof.trophyProgress",{n:Math.min(x.have,x.goal),goal:x.goal});
  $("#trophyProgressFill").style.width=`${Math.round(x.pct*100)}%`;
  $("#trophyXp").textContent=t("prof.trophyUnlockXp",{n:TIER_XP[x.tier]});
  const top=trophyTop(x,h);
  $("#trophyTopList").replaceChildren(...top.map((e,i)=>{
    const li=el("li","trophy-score-row");
    const mode=x.metric==="streak"?t("trophy.streakDay"):t(`trophy.mode.${e.mode}` as Key);
    const shown=e.unit==="trophy.unit.s"||e.unit==="trophy.unit.m"?dec(e.value,2):String(e.value);
    li.innerHTML=`<span class="trophy-rank d">#${i+1}</span><span class="trophy-score-txt"><b>${shown} ${t(e.unit as Key)}</b><small>${mode} · ${new Date(e.t).toLocaleDateString(locale(),{month:"2-digit",day:"2-digit"})}</small></span>`;
    return li;
  }));
  $("#trophyTopLbl").hidden=!top.length;
  $("#trophyNoScores").hidden=!!top.length;
  const body=dlg.querySelector<HTMLElement>(".sheet-body");if(body)body.scrollTop=0;
  if(!dlg.open)dlg.showModal();
}
const closeTrophy=()=>{const d=$<HTMLDialogElement>("#trophySheet");if(d.open)d.close()};
$("#trophyClose").onclick=closeTrophy;$("#trophyDone").onclick=closeTrophy;
$("#trophySheet").addEventListener("cancel",e=>{e.preventDefault();closeTrophy()});
$("#trophySheet").addEventListener("click",e=>{if(e.target===$("#trophySheet"))closeTrophy()});

function renderEdit(){
  if(!$("#profileEdit"))return;
  const nick=cachedNick(), photoData=photo();
  $("#editNick").textContent=nick||t("prof.noName");
  $("#photoName").textContent=photoData?t("prof.photo"):t("prof.photoNone");
  $("#photoPick").innerHTML=`<span data-icon="upload-simple"></span>${photoData?t("prof.photoChange"):t("prof.photoUpload")}`;
  $("#photoRemove").hidden=!photoData;
  const prev=$("#photoPrev");
  prev.style.backgroundImage=photoData?`url(${photoData})`:"";
  prev.classList.toggle("has",!!photoData);
  const home=$<HTMLButtonElement>("#homePhotoSwitch");
  home.setAttribute("aria-checked",String(homePhoto()&&!!photoData));
  home.disabled=!photoData;
  document.querySelectorAll<HTMLElement>(".char-grid [data-char]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.char===myChar().id)));
  document.querySelectorAll<HTMLElement>("[data-bg]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.bg===bg())));
  applyProfile();
}

// ---- photo: downscale to 512² JPEG so localStorage stays small ----
function makePhoto(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{
      try{
        const s=Math.min(img.naturalWidth,img.naturalHeight), c=document.createElement("canvas");
        c.width=c.height=512;
        const ctx=c.getContext("2d")!;
        ctx.fillStyle="#fff";ctx.fillRect(0,0,512,512);
        ctx.drawImage(img,(img.naturalWidth-s)/2,(img.naturalHeight-s)/2,s,s,0,0,512,512);
        resolve(c.toDataURL("image/jpeg",.8));
      }catch(e){reject(e)}finally{URL.revokeObjectURL(url)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("image"))};
    img.src=url;
  });
}
$("#photoInput").onchange=async e=>{
  const input=e.target as HTMLInputElement, f=input.files?.[0];
  if(!f)return;
  try{
    const data=await makePhoto(f);
    try{localStorage.setItem(PHOTO_KEY,data)}catch(err){throw err}
    set(SIDE_KEY,"photo");
    renderEdit();applyProfile();
  }catch(err){alert(t("prof.photoFail"))}
  input.value="";
};
$("#photoPick").onclick=()=>$<HTMLInputElement>("#photoInput").click();
$("#photoRemove").onclick=()=>{
  set(PHOTO_KEY,null);set(SIDE_KEY,null);set(HOME_PHOTO_KEY,null);
  renderEdit();applyProfile();
};
$("#homePhotoSwitch").onclick=()=>{
  if(!photo())return;
  set(HOME_PHOTO_KEY,homePhoto()?"0":"1");
  renderEdit();applyProfile();
};

// ---- coin / character / background ----
$("#profCoin").onclick=()=>{
  if(!photo()){go("#/profilis/redaguoti");return}
  set(SIDE_KEY,side()==="photo"?"char":"photo");
  applyProfile();
};
$("#profEdit").onclick=()=>go("#/profilis/redaguoti");
$("#profSettings").onclick=()=>go("#/nustatymai");
document.querySelectorAll<HTMLElement>(".char-grid [data-char]").forEach(b=>b.onclick=()=>setChar(b.dataset.char as CharId));
document.querySelectorAll<HTMLElement>("[data-bg]").forEach(b=>b.onclick=()=>{
  const id=b.dataset.bg!;if(!BG[id])return;
  set(BG_KEY,id);applyProfile();render(); // render() updates the labels/progress; applyProfile is idempotent
  renderEdit();
});

// ---- settings (moved from the old profile page) ----
$("#onbAgain").onclick=showOnb;
const langBtns=document.querySelectorAll<HTMLElement>("[data-lang]");
langBtns.forEach(b=>{
  b.setAttribute("aria-checked",String(b.dataset.lang===lang));
  b.onclick=()=>{
    const l=b.dataset.lang;if(!isLang(l)||l===lang)return;
    try{localStorage.setItem(LANG_KEY,l)}catch(e){}
    const u=new URL(location.href);u.searchParams.set("lang",l);
    location.replace(u);
  };
});
($("#policyLink") as HTMLAnchorElement).href=`${WEB}/privacy.html${lang==="en"?"#en":""}`;
$("#delData").onclick=async()=>{
  if(!confirm(t("prof.delConfirm")))return;
  try{if(sb)await deleteMyData()}catch(e){alert(t("prof.delFail")+" "+errText(e));return}
  try{for(const k of Object.keys(localStorage))if(k.startsWith("novacore.")||k.startsWith("sb-"))localStorage.removeItem(k)}catch(e){}
  alert(t("prof.delDone"));
  location.replace(location.pathname);
};
$("#appVer").textContent=`MoveClash ${APP_VERSION} · Samsung Solve for Tomorrow 2026`;

onView("profile",render);
onView("edit",renderEdit);
applyChar();
applyProfile();
