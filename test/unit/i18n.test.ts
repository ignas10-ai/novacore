// @vitest-environment jsdom
// src/i18n: both dictionaries have the same keys, no empty value, the same {params} and the right number of plural
// forms; every text / translatable attribute in index.html has a key (so no Lithuanian leftover can reach the English
// UI unnoticed); t / tn / dec / weekday; language detection order (?lang > localStorage > navigator.language).
import {describe,it,expect,beforeEach,vi} from "vitest";
import {readFileSync} from "node:fs";
import {lt} from "../../src/i18n/lt.ts";
import {en} from "../../src/i18n/en.ts";

const keys=Object.keys(lt) as (keyof typeof lt)[];
const params=(s:string)=>[...new Set([...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]))].sort().join(",");
const norm=(s:string)=>s.replace(/\s+/g," ").trim();
// not copy: brand, player tags, codes, the TV host (cast.ts fills it), units without words
const KEEP=/^(MoveClash|Nova|Core|Move|Clash|P1|P2|VS|REC|LT|EN|Android|iPhone|HDMI|AB12CD|ABC123|\S+\.\S+\/#\/\S+|[\d\s:×+·/.,–-]*)$/;

describe("dictionaries",()=>{
  it("lt and en have identical key sets",()=>expect(Object.keys(en).sort()).toEqual([...keys].sort()));
  it("no empty values",()=>{
    for(const k of keys){expect(lt[k].trim(),`lt ${k}`).not.toBe("");expect(en[k].trim(),`en ${k}`).not.toBe("")}
  });
  it("same {params} in both languages",()=>{for(const k of keys)expect(params(en[k]),k).toBe(params(lt[k]))});
  it("plural keys: lt one|few|other, en one|other",()=>{
    for(const k of keys)if(lt[k].includes("|")){
      expect(lt[k].split("|"),`lt ${k}`).toHaveLength(3);expect(en[k].split("|"),`en ${k}`).toHaveLength(2);
    }else expect(en[k],`en ${k} is not a plural key`).not.toContain("|");
  });
});

describe("index.html",()=>{
  const doc=new DOMParser().parseFromString(readFileSync("index.html","utf8"),"text/html");
  const texts=new Set<string>();
  const walk=(root:ParentNode)=>{
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    for(let n=w.nextNode();n;n=w.nextNode())if(!n.parentElement?.closest("script,style")&&/\p{L}/u.test(n.textContent!))texts.add(norm(n.textContent!));
    root.querySelectorAll("[aria-label],[title],[placeholder]").forEach(e=>{for(const a of ["aria-label","title","placeholder"]){const v=e.getAttribute(a);if(v)texts.add(norm(v))}});
    root.querySelectorAll('meta[name="description"],meta[property^="og:"]').forEach(e=>{const v=e.getAttribute("content")!;if(!/^https?:|^website$/.test(v))texts.add(norm(v))});
    root.querySelectorAll("template").forEach(t=>walk(t.content));
  };
  walk(doc);
  const known=new Set(Object.values(lt).map(norm));
  it("every text and attribute has a key in lt.ts (src/i18n/dom.ts translates it)",()=>{
    const missing=[...texts].filter(s=>!KEEP.test(s)&&!known.has(s));
    expect(missing).toEqual([]);
    expect(texts.size).toBeGreaterThan(200);
  });
});

describe("t / tn / formatting",()=>{
  beforeEach(()=>{vi.resetModules();localStorage.clear();history.replaceState(null,"","/")});
  const load=()=>import("../../src/i18n/i18n.ts");
  it("Lithuanian plurals: 1 žaidimas / 2 žaidimai / 10, 11, 0 žaidimų / 21 žaidimas",async()=>{
    const {tn,lang}=await load();expect(lang).toBe("lt");
    expect([1,2,5,10,11,0,21,22].map(n=>tn("u.games",n))).toEqual(["1 žaidimas","2 žaidimai","5 žaidimai","10 žaidimų","11 žaidimų","0 žaidimų","21 žaidimas","22 žaidimai"]);
  });
  it("English plurals and params",async()=>{
    const {tn,t,setLang}=await load();setLang("en");
    expect([1,2,0].map(n=>tn("u.games",n))).toEqual(["1 game","2 games","0 games"]);
    expect(t("grp.created",{code:"AB12CD"})).toBe("Done! Code AB12CD – invite your friends.");
    expect(t("hud.roundOf",{n:2,total:6})).toBe("Round 2 / 6");
  });
  it("decimals and weekdays follow the language",async()=>{
    const {dec,weekday,setLang}=await load();
    const sun=new Date(2026,9,25).getTime();
    expect([dec(12.345,2),weekday(sun,"short"),weekday(sun,"long")]).toEqual(["12,35","Sk","sekmadienis"]);
    setLang("en");expect([dec(12.345,2),weekday(sun,"short")]).toEqual(["12.35","Sun"]);
  });
  it("language: ?lang beats localStorage beats navigator.language",async()=>{
    localStorage.setItem("novacore.lang","en");expect((await load()).lang).toBe("en");
    vi.resetModules();history.replaceState(null,"","/?lang=lt");expect((await load()).lang).toBe("lt");
    vi.resetModules();history.replaceState(null,"","/");localStorage.clear();
    Object.defineProperty(navigator,"language",{value:"de-DE",configurable:true});
    expect((await load()).lang).toBe("en");
    Object.defineProperty(navigator,"language",{value:"lt-LT",configurable:true});
  });
  it("blocked localStorage falls back to navigator.language",async()=>{
    const spy=vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new DOMException("blocked","SecurityError")});
    expect((await load()).lang).toBe("lt");spy.mockRestore();
  });
});
