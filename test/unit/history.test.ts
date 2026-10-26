// @vitest-environment jsdom
// src/history/history.ts storage: missing / corrupt / throwing localStorage, the 50-row cap, recordGame()'s
// "beat your best" rule and per-player reps. The module wires #histSheet on import, so dom.ts and router.ts are
// mocked with inert elements (markup ids are the UI restyle's business, not this test's).
import {describe,it,expect,vi,beforeEach} from "vitest";

vi.mock("../../src/ui/dom.ts",()=>({$:(s:string)=>document.createElement(s==="#histSheet"?"dialog":"div")}));
vi.mock("../../src/ui/router.ts",()=>({refresh:()=>{}}));
const {loadHist,saveHist,recordGame,markBeat,bests,histItem}=await import("../../src/history/history.ts");
const {S}=await import("../../src/game/state.ts");

const KEY="novacore.history";
const game=(o:any={})=>({t:Date.now(),players:1,duration:180,ex:["squat"],score:[10,0],reps:[5,0],...o});
function play(players:number,events:{player:number;ex:string;points?:number}[]){
  S.players=players;S.duration=60;
  S.scoreEvents=events.map(e=>({t:0,points:e.points??1,...e}));
  S.score=[0,1].map(p=>S.scoreEvents.filter(e=>e.player===p).reduce((n,e)=>n+e.points,0));
  return recordGame();
}
beforeEach(()=>{vi.restoreAllMocks();localStorage.clear()});

describe("loadHist / saveHist",()=>{
  it("missing key -> []",()=>expect(loadHist()).toEqual([]));
  it("corrupt JSON -> []",()=>{localStorage.setItem(KEY,"{oops");expect(loadHist()).toEqual([])});
  it("valid JSON that is not an array -> []",()=>{localStorage.setItem(KEY,'{"a":1}');expect(loadHist()).toEqual([]);localStorage.setItem(KEY,"null");expect(loadHist()).toEqual([])});
  it("keeps at most 50 games, newest first",()=>{
    saveHist(Array.from({length:60},(_,i)=>game({t:1000-i})));
    const h=loadHist();expect(h).toHaveLength(50);expect(h[0].t).toBe(1000);
  });
  it("getItem throwing (storage blocked) -> [] instead of a crash",()=>{
    vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new DOMException("denied","SecurityError")});
    expect(loadHist()).toEqual([]);
  });
  it("setItem throwing (quota / private mode) is swallowed",()=>{
    vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new DOMException("full","QuotaExceededError")});
    expect(()=>saveHist([game()])).not.toThrow();
  });
  it("window.localStorage itself throwing on access",()=>{
    const d=Object.getOwnPropertyDescriptor(window,"localStorage")!;
    Object.defineProperty(window,"localStorage",{configurable:true,get(){throw new DOMException("denied","SecurityError")}});
    try{expect(loadHist()).toEqual([]);expect(()=>saveHist([game()])).not.toThrow();expect(play(1,[{player:0,ex:"squat"}])).toBe(false)}
    finally{Object.defineProperty(window,"localStorage",d)}
  });
});

describe("recordGame",()=>{
  it("first game is never a record; a higher score later is",()=>{
    expect(play(1,[{player:0,ex:"squat",points:3}])).toBe(false);
    expect(play(1,[{player:0,ex:"squat",points:2}])).toBe(false);
    expect(play(1,[{player:0,ex:"squat",points:5}])).toBe(true);
    expect(loadHist()).toHaveLength(3);
  });
  it("records are per player count (a 2-player best does not block solo)",()=>{
    play(2,[{player:1,ex:"jack",points:50}]);
    play(1,[{player:0,ex:"jack",points:4}]);
    expect(play(1,[{player:0,ex:"jack",points:5}])).toBe(true);
  });
  it("stores reps and exReps per player",()=>{
    play(2,[{player:0,ex:"squat"},{player:0,ex:"jack"},{player:1,ex:"jack"},{player:1,ex:"jack"}]);
    const g=loadHist()[0];
    expect(g.reps).toEqual([2,2]);expect(g.exReps).toEqual([{squat:1,jack:1},{jack:2}]);expect(g.duration).toBe(60);
  });
  it("markBeat flags the newest game, empty history is a no-op",()=>{
    expect(()=>markBeat()).not.toThrow();expect(loadHist()).toEqual([]);
    play(1,[{player:0,ex:"squat"}]);markBeat();expect(loadHist()[0].beat).toBe(true);
  });
  it("bests() = [_, best solo, best duo]",()=>{
    expect(bests([game({score:[9,0]}),game({players:2,score:[3,12]})])).toEqual([0,9,12]);
    expect(bests([])).toEqual([0,0,0]);
  });
});

describe("histItem",()=>{
  it("sprint row prints times with a Lithuanian decimal comma, '–' for did not finish",()=>{
    const li=histItem(game({mode:"sprint",players:2,times:[12.345,null],score:[0,0]}) as any,0,[0,0,0]);
    expect(li.querySelector(".what")!.textContent).toBe("Sprintas 100 m · dvikova");
    expect([...li.querySelectorAll(".pts b")].map(b=>b.textContent)).toEqual(["12,35 s","–"]);
  });
  it("best game gets .best, unknown exercise ids print as-is",()=>{
    const li=histItem(game({score:[40,0],ex:["squat","plank"]}) as any,0,[0,40,0]);
    expect(li.classList.contains("best")).toBe(true);expect(li.querySelector(".what")!.textContent).toMatch(/Pritūpimai, plank$/);
  });
});
