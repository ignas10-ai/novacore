// stats.ts edge cases beyond test-stats.cjs: empty history, midnight / week / DST boundaries (TZ pinned to
// Europe/Vilnius in vitest.config.ts), 2-player rows, sprint rows, old rows without exReps, badges.
import {describe,it,expect,vi,afterEach} from "vitest";
import {streak,bestStreak,weekStart,weekGames,last7,exTotals,totals,badges,gameReps,WEEK_GOAL,type Game} from "../../src/history/stats.ts";
import {EX} from "../../src/detect/exercises.ts";

const at=(y:number,m:number,d:number,h=12,min=0)=>new Date(y,m-1,d,h,min).getTime();
const g=(t:number,o:Partial<Game>={}):Game=>({t,players:1,duration:180,ex:["squat"],score:[50,0],reps:[20,0],...o});
afterEach(()=>vi.useRealTimers());

describe("empty history",()=>{
  const now=at(2026,10,25);
  it("everything is zero, nothing throws",()=>{
    expect(streak([],now)).toBe(0);expect(bestStreak([])).toBe(0);expect(weekGames([],now)).toBe(0);
    expect(totals([],now)).toEqual({games:0,reps:0,best:0,streak:0});
    expect(last7([],now).map(d=>d.games)).toEqual([0,0,0,0,0,0,0]);
    expect(Object.values(exTotals([])).every(x=>x.total===0&&x.best===0)).toBe(true);
    expect(badges([]).every(b=>!b.on)).toBe(true);
  });
  it("weekly goal constant",()=>expect(WEEK_GOAL).toBe(5));
});

describe("day and week boundaries (local time)",()=>{
  it("23:59 and 00:01 are different days",()=>{
    const now=at(2026,10,25,0,1);
    expect(streak([g(at(2026,10,24,23,59)),g(at(2026,10,25,0,1))],now)).toBe(2);
  });
  it("streak alive at 23:59 of the next day, broken one minute later",()=>{
    const h=[g(at(2026,10,24,10))];
    expect(streak(h,at(2026,10,25,23,59))).toBe(1);
    expect(streak(h,at(2026,10,26,0,0))).toBe(0);
  });
  it("streak across the spring DST change (2026-03-29, 23 h day)",()=>{
    const h=[g(at(2026,3,28,23,30)),g(at(2026,3,29,0,30)),g(at(2026,3,30,0,30))];
    expect(streak(h,at(2026,3,30,12))).toBe(3);
  });
  it("streak across the autumn DST change (2026-10-25, 25 h day)",()=>{
    const h=[g(at(2026,10,24,23,30)),g(at(2026,10,25,23,30)),g(at(2026,10,26,0,30))];
    expect(streak(h,at(2026,10,26,12))).toBe(3);
    expect(bestStreak(h)).toBe(3);
  });
  it("week starts Monday 00:00 local; Sunday 23:59 is still last week",()=>{
    const mon=at(2026,10,26,0,0);
    expect(weekStart(mon)).toBe(mon);
    expect(weekStart(mon-60e3)).toBe(at(2026,10,19,0,0));
    expect(weekGames([g(mon-60e3),g(mon),g(mon+60e3)],mon+3600e3)).toBe(2);
  });
  it("weekStart is a Monday at midnight for every day of a DST week",()=>{
    for(let d=19;d<=31;d++){const w=new Date(weekStart(at(2026,10,d,23,59)));expect(w.getDay()).toBe(1);expect(w.getHours()).toBe(0)}
  });
  it("week across a year boundary",()=>{
    expect(new Date(weekStart(at(2027,1,1))).toDateString()).toBe(new Date(2026,11,28).toDateString());
  });
  it("last7 days are consecutive midnights ending today, even over DST",()=>{
    const w=last7([],at(2026,10,27));
    expect(w.map(d=>new Date(d.day).getDate())).toEqual([21,22,23,24,25,26,27]);
    expect(w.every(d=>new Date(d.day).getHours()===0)).toBe(true);
  });
  it("future games (clock moved back) do not crash the streak",()=>{
    expect(streak([g(at(2026,10,30))],at(2026,10,25))).toBe(0);
  });
});

describe("players and rows",()=>{
  const now=at(2026,10,25);
  it("2 players: reps of both count, best score is either player",()=>{
    const d=g(now,{players:2,score:[40,90],reps:[10,30]});
    expect(gameReps(d)).toBe(40);expect(totals([d],now).best).toBe(90);
  });
  it("solo ignores leftovers in the P2 slot",()=>{
    expect(gameReps(g(now,{reps:[5,99]}))).toBe(5);
  });
  it("rows without reps / exReps / score (old versions) are tolerated",()=>{
    const old={t:now,players:1,duration:60,ex:[]} as unknown as Game;
    expect(gameReps(old)).toBe(0);expect(totals([old],now).best).toBe(0);expect(exTotals([old]).squat.total).toBe(0);
  });
  it("sprint rows count for streaks and knee totals but have no points",()=>{
    const sp=g(now,{mode:"sprint",score:[0,0],reps:[60,0],exReps:[{knees:60},{}],times:[14.2,null]});
    expect(streak([sp],now)).toBe(1);expect(exTotals([sp]).knees).toEqual({total:60,best:60});expect(totals([sp],now).best).toBe(0);
  });
  it("unknown exercise ids from a newer version still add up",()=>{
    expect(exTotals([g(now,{exReps:[{plank:3}]})]).plank).toEqual({total:3,best:3});
  });
});

describe("badges",()=>{
  const now=at(2026,10,25);
  const on=(h:Game[])=>Object.fromEntries(badges(h).map(b=>[b.id,b.on]));
  it("8 badges with Lithuanian names and an icon",()=>{
    const b=badges([]);expect(b).toHaveLength(8);expect(b.every(x=>x.name&&x.desc&&x.icon)).toBe(true);
  });
  it("duel, games10, streak3, allex",()=>{
    const h=Array.from({length:10},(_,i)=>g(at(2026,10,25-i),{players:i===0?2:1,exReps:[Object.fromEntries(EX.map(e=>[e.id,1]))]}));
    expect(on(h)).toMatchObject({first:true,duel:true,games10:true,streak3:true,allex:true});
  });
  it("squat100 counts reps over many games and both players",()=>{
    expect(on([g(now,{players:2,exReps:[{squat:50},{squat:49}]})]).squat100).toBe(false);
    expect(on([g(now,{players:2,exReps:[{squat:50},{squat:50}]})]).squat100).toBe(true);
  });
  it("pts100 uses the score of a single game, not the sum",()=>{
    expect(on([g(now,{score:[60,0]}),g(now,{score:[60,0]})]).pts100).toBe(false);
  });
  it("allex misses one exercise -> off",()=>{
    const reps=Object.fromEntries(EX.slice(1).map(e=>[e.id,5]));
    expect(on([g(now,{exReps:[reps]})]).allex).toBe(false);
  });
});
