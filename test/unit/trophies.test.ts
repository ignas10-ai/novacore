// src/history/trophies.ts: XP curve, leagues, trophy unlocking and the top-five results in a trophy detail.
import {describe,it,expect} from "vitest";
import {gameXp,levelState,leagueState,trophyState,trophyStates,trophyTop,xpTotal,TROPHIES,TIER_XP,type Trophy} from "../../src/history/trophies.ts";
import type {Game} from "../../src/history/stats.ts";

const g=(o:Partial<Game>={}):Game=>({t:Date.now(),players:1,duration:180,ex:["squat"],score:[100,0],reps:[40,0],exReps:[{squat:20},{}],...o});
const hist:Game[]=[
  g({t:Date.now()-3*864e5,players:2,score:[180,140],reps:[55,40],beat:true}),
  g({t:Date.now()-2*864e5,score:[260,0],reps:[80,0],exReps:[{squat:50}]}),
  g({t:Date.now()-864e5,mode:"bowling",players:1,score:[0,0],reps:[12,0],bwTotals:[160],exReps:[{}]}),
  g({t:Date.now(),mode:"sprint",score:[0,0],reps:[30,0],times:[14.2,null],exReps:[{}]}),
];

describe("XP",()=>{
  it("a game always earns a base + reps + score and a duel/full game adds a bonus",()=>{
    const base=gameXp(g({players:1,duration:60,score:[0,0],reps:[0,0]}));
    const full=gameXp(g({players:2,duration:180,score:[100,0],reps:[40,0]}));
    expect(base).toBe(30);
    expect(full).toBeGreaterThan(base);
  });
  it("levels grow and the progress is between 0 and 1",()=>{
    expect(levelState(0).level).toBe(1);
    expect(levelState(0).pct).toBe(0);
    const l5=levelState(2000);
    expect(l5.level).toBeGreaterThan(1);
    expect(l5.pct).toBeGreaterThanOrEqual(0);
    expect(l5.pct).toBeLessThan(1);
    expect(levelState(1e6).level).toBeGreaterThan(20);
  });
  it("leagues unlock at their thresholds and the next requirement is shown",()=>{
    expect(leagueState(0).league.id).toBe("bronze");
    expect(leagueState(800).league.id).toBe("silver");
    expect(leagueState(2400).league.id).toBe("gold");
    const d=leagueState(6000);
    expect(d.league.id).toBe("diamond");
    expect(d.next).toBeNull();
    expect(d.pct).toBe(1);
  });
});

describe("trophies",()=>{
  it("counts games, duo games, modes, best streaks and the best single score",()=>{
    const all=trophyStates(hist);
    expect(all.find(x=>x.id==="firstGame")!.unlocked).toBe(true);
    expect(all.find(x=>x.id==="duo5")!.have).toBe(1);
    expect(all.find(x=>x.id==="allModes")!.have).toBe(3);
    expect(all.find(x=>x.id==="score300")!.have).toBe(260);
    expect(all.find(x=>x.id==="challenge")!.unlocked).toBe(true);
  });
  it("never reports progress above the goal",()=>{
    for(const x of trophyStates(hist)) expect(x.pct).toBeLessThanOrEqual(1);
  });
  it("the trophy detail returns at most five results, sorted best first",()=>{
    const score=TROPHIES.find(x=>x.id==="score300") as Trophy;
    const top=trophyTop(score,hist);
    expect(top.length).toBeLessThanOrEqual(5);
    expect(top.map(x=>x.value)).toEqual([...top.map(x=>x.value)].sort((a,b)=>b-a));
    expect(top[0].value).toBe(260);
  });
  it("XP includes unlocked trophy bonuses",()=>{
    const base=hist.reduce((n,x)=>n+gameXp(x),0);
    const bonus=trophyStates(hist).filter(x=>x.unlocked).reduce((n,x)=>n+TIER_XP[x.tier],0);
    expect(xpTotal(hist)).toBe(base+bonus);
  });
});
