// @vitest-environment jsdom
// src/ui/router.ts: hash parsing (deep links, ?g= / ?c= query before the hash) and the history contract
// (history.state.d, tabs replace each other, Home stays underneath, back handler for the game flow).
// Minimal markup with the screen ids the router owns; layout/CSS is irrelevant here.
import {describe,it,expect,beforeAll} from "vitest";

const SCREENS=["home","groups","group","library","profile","start","sprint","boxing","longjump","screen","onb"];
document.body.innerHTML=SCREENS.map(id=>`<section id="${id}" class="screen app hide"><h1 tabindex="-1">${id}</h1></section>`).join("")+
  `<nav id="tabbar">${[["home","#/"],["groups","#/kompanijos"],["library","#/pratimai"],["profile","#/profilis"]].map(([t,h])=>`<a data-tab="${t}" href="${h}">${t}</a>`).join("")}</nav>`+
  `<a id="sub" href="#/zaisti">play</a><a id="back" data-back href="#/">back</a>`;
Element.prototype.scrollTo??=function(){}; // jsdom has no element scrolling
history.replaceState(null,"","/?g=K7Q2ZX#/");
const R=await import("../../src/ui/router.ts");

const shown=()=>SCREENS.filter(id=>!document.getElementById(id)!.classList.contains("hide")&&!document.getElementById(id)!.dataset.leave);
const tab=()=>document.querySelector<HTMLElement>("#tabbar [aria-current]")?.dataset.tab;
const pop=()=>new Promise<void>(r=>addEventListener("popstate",()=>setTimeout(r,0),{once:true}));
const click=(sel:string)=>document.querySelector<HTMLElement>(sel)!.click();
const back=async()=>{const p=pop();history.back();await p};

describe("parse",()=>{
  it.each([
    ["",{v:"home",arg:""}],["#",{v:"home",arg:""}],["#/",{v:"home",arg:""}],
    ["#/kompanijos",{v:"groups",arg:""}],["#/kompanijos/",{v:"groups",arg:""}],
    ["#/kompanijos/abc-123",{v:"group",arg:"abc-123"}],["#/kompanijos/10%20B%20kl.",{v:"group",arg:"10 B kl."}],
    ["#/pratimai",{v:"library",arg:""}],["#/profilis",{v:"profile",arg:""}],["#/zaisti",{v:"setup",arg:""}],
    ["#/sprintas",{v:"sprint",arg:""}],["#/boksas",{v:"boxing",arg:""}],["#/tolis",{v:"longjump",arg:""}],["#/ekranas",{v:"screen",arg:""}],["#/ekranas/ABC234",{v:"screen",arg:"ABC234"}],["#kompanijos",{v:"groups",arg:""}],
    ["#/zaidimas",{v:"home",arg:""}],["#/nezinomas",{v:"home",arg:""}],["#/pratimai/extra",{v:"library",arg:""}],
  ])("%s",(h,want)=>expect(R.parse(h)).toEqual(want));
  it("a malformed %-escape in a group id throws (URIError) - callers get it from location.hash",()=>{
    expect(()=>R.parse("#/kompanijos/%E0%A4%A")).toThrow(URIError);
  });
});

describe("history contract",()=>{
  const seen:string[]=[];
  beforeAll(()=>{for(const v of ["home","groups","group","library","profile","setup"] as const)R.onView(v,a=>seen.push(v+(a?":"+a:"")));R.render()});

  it("first render: Pradžia, d=0, query params untouched",()=>{
    expect(shown()).toEqual(["home"]);expect(tab()).toBe("home");expect(R.depth()).toBe(0);
    expect(location.search).toBe("?g=K7Q2ZX");expect(document.body.dataset.view).toBe("home");
  });
  it("tab from Pradžia pushes (d=1), tab to tab replaces (d stays 1)",()=>{
    click('#tabbar [data-tab="groups"]');expect([location.hash,R.depth(),tab()]).toEqual(["#/kompanijos",1,"groups"]);
    click('#tabbar [data-tab="library"]');expect([location.hash,R.depth(),tab()]).toEqual(["#/pratimai",1,"library"]);
    expect(location.search).toBe("?g=K7Q2ZX");
  });
  it("re-tapping the current tab does not push",()=>{
    click('#tabbar [data-tab="library"]');expect(R.depth()).toBe(1);
  });
  it("back from any tab = Pradžia",async()=>{
    await back();expect([location.hash,R.depth(),R.current()]).toEqual(["#/",0,"home"]);
  });
  it("sub-screen push + data-back pops; group detail keeps the tab lit",async()=>{
    click("#sub");expect([R.current(),R.depth()]).toEqual(["setup",1]);expect(tab()).toBe("home");
    const p=pop();click("#back");await p;expect([R.current(),R.depth()]).toEqual(["home",0]);
    R.go("#/kompanijos");R.go("#/kompanijos/g1");expect([R.current(),R.depth(),tab()]).toEqual(["group",2,"groups"]);
    expect(seen.at(-1)).toBe("group:g1");
  });
  it("Home tab from deep inside pops all own entries (no duplicate home entry)",async()=>{
    const p=pop();click('#tabbar [data-tab="home"]');await p;
    expect([location.hash,R.depth(),R.current()]).toEqual(["#/",0,"home"]);
  });
  it("data-back with nothing to go back to navigates instead of leaving the app",()=>{
    click("#back");expect(location.hash).toBe("#/");expect(R.depth()).toBe(1);R.go("#/",true);
  });
  it("back handler (game flow) can swallow a back",async()=>{
    R.go("#/profilis");let claimed=0;
    R.setBackHandler(()=>{claimed++;return claimed===1}); // first back swallowed (mid-game), then released
    await back();expect(R.current()).toBe("profile");
    R.go("#/profilis");await back();expect(claimed).toBe(2);
    R.setBackHandler(()=>false);
  });
  it("refresh() re-runs the current hook, but not in game",()=>{
    const n=seen.length;R.refresh();expect(seen.length).toBe(n+1);
    document.body.classList.add("ingame");R.refresh();expect(seen.length).toBe(n+1);document.body.classList.remove("ingame");
  });
  it("showOnly (onboarding) hides every router screen",()=>{
    R.showOnly("onb");expect(shown()).toEqual(["onb"]);expect(document.body.dataset.view).toBe("onb");
  });
});

describe("TV route",()=>{
  it("#/ekranas/<code> lights no tab and marks body[data-view=screen] (tab bar hidden by CSS)",()=>{
    R.go("#/ekranas/ABC234");
    expect(document.body.dataset.view).toBe("screen");
    expect(document.querySelector("#tabbar [aria-current]")).toBeNull();
    R.go("#/",true);
  });
});
