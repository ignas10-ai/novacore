// PURE (no DOM, no storage): stats, streaks, weekly goal and badges computed from the local game history.
// Days are LOCAL calendar days; the week starts on Monday (as in Lithuania and the group_leaderboard RPC).
import {EX} from "../detect/exercises.ts";
import {t as tr} from "../i18n/i18n.ts";

export interface Game{
  t:number;players:number;duration:number;ex:string[];score:number[];reps:number[];
  exReps?:Record<string,number>[]; // per player, reps per exercise id (games recorded since app-v2)
  beat?:boolean; // this game beat an opened challenge
  mode?:string; times?:(number|null)[]; splits?:number[][]; // sprint (src/sprint): 100 m time per player in s, 10 m splits
  pts?:number[]; acc?:number[]; combo?:number[]; // boxing (src/boxing): points, accuracy % and best combo per player (score stays [0,0])
  clr?:number[]; // hurdles (src/hurdles, times like the sprint): hurdles cleared per player (of 8)
  secs?:number[]; // Siena (src/wall): time survived per player in s (reps = walls survived, score stays [0,0])
  jumps?:(number|null)[][]; // long jump (src/longjump): 3 results in m per player (1-4 players), null = foul (score stays [0,0])
  bwFrames?:number; // bowling (src/bowling): frames in the series (3/5)
  bwRolls?:number[][]; // bowling: flat rolls (pins per ball) per player
  bwFrameRolls?:number[][][]; // bowling: per player, per frame, pins per ball (for the scorecard table)
  bwTotals?:number[]; // bowling: final ten-pin totals per player
  skiRaw?:(number|null)[];skiPen?:number[];skiGates?:number[];skiMiss?:number[];skiHit?:number[]; // skiing (src/ski, times = final incl. penalties)
}
export const WEEK_GOAL=5;

const day0=(t:number)=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime()};
const addDays=(t:number,n:number)=>{const d=new Date(t);d.setDate(d.getDate()+n);return day0(d.getTime())}; // DST-safe
export function weekStart(now:number){const d=new Date(day0(now));d.setDate(d.getDate()-(d.getDay()+6)%7);return d.getTime()}

// days in a row with at least one game, ending today (or yesterday: the streak is still alive until tonight)
export function streak(h:Game[],now:number){
  const days=new Set(h.map(g=>day0(g.t)));
  let d=day0(now);
  if(!days.has(d))d=addDays(d,-1);
  let n=0;
  while(days.has(d)){n++;d=addDays(d,-1)}
  return n;
}
export function bestStreak(h:Game[]){
  const days=[...new Set(h.map(g=>day0(g.t)))].sort((a,b)=>a-b);
  let best=0,run=0,prev=0;
  for(const d of days){run=prev&&addDays(prev,1)===d?run+1:1;best=Math.max(best,run);prev=d}
  return best;
}
export const weekGames=(h:Game[],now:number)=>h.filter(g=>g.t>=weekStart(now)).length;

const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
export const gameReps=(g:Game)=>sum((g.reps||[]).slice(0,g.players));
// oldest -> today
export function last7(h:Game[],now:number){
  return Array.from({length:7},(_,i)=>{
    const d=addDays(day0(now),i-6),next=addDays(d,1);
    const gs=h.filter(g=>g.t>=d&&g.t<next);
    return {day:d,games:gs.length,reps:sum(gs.map(gameReps))};
  });
}
// all players on this phone: total reps per exercise and the best single-player count in one game
export function exTotals(h:Game[]){
  const out:Record<string,{total:number;best:number}>={};
  for(const e of EX)out[e.id]={total:0,best:0};
  for(const g of h)for(const pr of (g.exReps||[]).slice(0,g.players))for(const [id,n] of Object.entries(pr||{})){
    const o=out[id]??=({total:0,best:0});
    o.total+=n;o.best=Math.max(o.best,n);
  }
  return out;
}
export function totals(h:Game[],now:number){
  return {
    games:h.length,
    reps:sum(h.map(gameReps)),
    best:h.reduce((m,g)=>Math.max(m,...(g.score||[]).slice(0,g.players)),0),
    streak:streak(h,now),
  };
}

export interface Badge{id:string;name:string;desc:string;icon:string;on:boolean}
export function badges(h:Game[]):Badge[]{
  const ex=exTotals(h), t=totals(h,Date.now());
  return [
    {id:"first",name:tr("badge.first"),desc:tr("badge.firstD"),icon:"play",on:h.length>=1},
    {id:"duel",name:tr("mode.Duel"),desc:tr("badge.duelD"),icon:"swords",on:h.some(g=>g.players===2)},
    {id:"streak3",name:tr("badge.streak3"),desc:tr("badge.streak3D"),icon:"flame",on:bestStreak(h)>=3},
    {id:"squat100",name:tr("badge.squat100"),desc:tr("badge.squat100D"),icon:"dumbbell",on:(ex.squat?.total||0)>=100},
    {id:"pts100",name:tr("badge.pts100"),desc:tr("badge.pts100D"),icon:"zap",on:t.best>=100},
    {id:"beat",name:tr("badge.beat"),desc:tr("badge.beatD"),icon:"trophy",on:h.some(g=>g.beat)},
    {id:"games10",name:tr("badge.games10"),desc:tr("badge.games10D"),icon:"medal",on:h.length>=10},
    {id:"allex",name:tr("ex.allOne"),desc:tr("badge.allexD"),icon:"sparkles",on:EX.every(e=>(ex[e.id]?.total||0)>0)},
  ];
}
