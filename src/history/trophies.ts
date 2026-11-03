// PURE (no DOM, no storage): XP, levels, leagues and the trophy system computed from the local game history.
// Everything is additive: a game's XP is derived from its stored row, and a trophy unlocks when its goal is reached.
// Trophy XP is added once (when unlocked), so the profile keeps growing without any server or new tables.
import type {Game} from "./stats.ts";
import {gameReps, exTotals, bestStreak, weekStart} from "./stats.ts";

export const GAME_MODES = ["rr", "sprint", "boxing", "longjump", "hurdles", "bowling", "ski", "wall", "badminton", "javelin"] as const;
export type GameMode = typeof GAME_MODES[number];
export const modeOf = (g: Game): GameMode => (GAME_MODES.includes(g.mode as GameMode) ? g.mode as GameMode : "rr");
export const gameModes = (h: Game[]) => new Set(h.map(modeOf));

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const maxOf = (a: number[]) => a.length ? Math.max(...a) : 0;
// points are comparable across the point-based modes; reps are counted separately (a long sprint must not unlock a
// "score 300" trophy just because the player lifted their knees 300 times)
export function scoreOf(g: Game) {
  return Math.max(
    ...(g.score || []).slice(0, g.players),
    ...(g.pts || []).slice(0, g.players),
    ...(g.bwTotals || []).slice(0, g.players),
    ...(g.bdScore || []).slice(0, g.players),
    0,
  );
}

// ---- XP ----
export function gameXp(g: Game) {
  const reps = gameReps(g);
  const base = 30;
  const repXp = Math.min(60, Math.floor(reps / 10) * 4);
  const scoreXp = Math.min(60, Math.floor(scoreOf(g) / 25) * 5);
  const duo = g.players === 2 ? 15 : 0;
  const full = (g.duration || 0) >= 180 ? 10 : 0;
  return base + repXp + scoreXp + duo + full;
}
export const gameXpTotal = (h: Game[]) => sum(h.map(gameXp));

// level curve: 180, 210, 250 … XP for the next level
export function levelNeed(level: number) { return Math.round(180 * Math.pow(1.18, Math.max(0, level - 1)) / 10) * 10 }
export function levelState(xp: number) {
  let level = 1, into = Math.max(0, xp), need = levelNeed(1);
  while (into >= need && level < 99) { into -= need; level++; need = levelNeed(level) }
  return {level, into, need, pct: need > 0 ? into / need : 0};
}

// ---- leagues ----
export interface League {id: "bronze" | "silver" | "gold" | "diamond"; nameKey: string; min: number; icon: string}
export const LEAGUES: League[] = [
  {id: "bronze", nameKey: "league.bronze", min: 0, icon: "medal"},
  {id: "silver", nameKey: "league.silver", min: 800, icon: "star"},
  {id: "gold", nameKey: "league.gold", min: 2400, icon: "crown"},
  {id: "diamond", nameKey: "league.diamond", min: 6000, icon: "diamond"},
];
export function leagueState(xp: number) {
  let i = 0;
  while (i + 1 < LEAGUES.length && xp >= LEAGUES[i + 1].min) i++;
  const cur = LEAGUES[i], next = LEAGUES[i + 1] || null;
  const span = next ? next.min - cur.min : 1;
  const into = Math.max(0, xp - cur.min);
  return {index: i, league: cur, next, into, span, pct: next ? Math.min(1, into / span) : 1, left: next ? Math.max(0, next.min - xp) : 0};
}

// ---- trophies ----
export type Tier = "bronze" | "silver" | "gold" | "purple";
export type Shape = "medal" | "shield" | "hex" | "circle" | "diamond" | "star" | "ring";
export type Metric = "score" | "reps" | "streak" | "squat" | "modes";
export interface Trophy {
  id: string; tier: Tier; shape: Shape; icon: string; xp: number; goal: number;
  nameKey: string; descKey: string; metric: Metric;
  filter?: (g: Game) => boolean;
}
export const TIER_XP: Record<Tier, number> = {bronze: 40, silver: 100, gold: 200, purple: 400};
export const TROPHIES: Trophy[] = [
  {id: "firstGame", tier: "bronze", shape: "medal", icon: "play", xp: 40, goal: 1, metric: "score", nameKey: "trophy.firstGame", descKey: "trophy.firstGameD"},
  {id: "games10", tier: "bronze", shape: "circle", icon: "layout-grid", xp: 40, goal: 10, metric: "score", nameKey: "trophy.games10", descKey: "trophy.games10D"},
  {id: "games25", tier: "silver", shape: "hex", icon: "trophy", xp: 100, goal: 25, metric: "score", nameKey: "trophy.games25", descKey: "trophy.games25D"},
  {id: "games50", tier: "gold", shape: "shield", icon: "crown", xp: 200, goal: 50, metric: "score", nameKey: "trophy.games50", descKey: "trophy.games50D"},
  {id: "games100", tier: "purple", shape: "diamond", icon: "diamond", xp: 400, goal: 100, metric: "score", nameKey: "trophy.games100", descKey: "trophy.games100D"},
  {id: "reps500", tier: "bronze", shape: "ring", icon: "footprints", xp: 40, goal: 500, metric: "reps", nameKey: "trophy.reps500", descKey: "trophy.reps500D"},
  {id: "reps2500", tier: "silver", shape: "medal", icon: "dumbbell", xp: 100, goal: 2500, metric: "reps", nameKey: "trophy.reps2500", descKey: "trophy.reps2500D"},
  {id: "reps10000", tier: "gold", shape: "hex", icon: "zap", xp: 200, goal: 10000, metric: "reps", nameKey: "trophy.reps10000", descKey: "trophy.reps10000D"},
  {id: "duo5", tier: "silver", shape: "star", icon: "users-three", xp: 100, goal: 5, metric: "score", filter: g => g.players === 2, nameKey: "trophy.duo5", descKey: "trophy.duo5D"},
  {id: "streak7", tier: "gold", shape: "shield", icon: "flame", xp: 200, goal: 7, metric: "streak", nameKey: "trophy.streak7", descKey: "trophy.streak7D"},
  {id: "score300", tier: "silver", shape: "star", icon: "target", xp: 100, goal: 300, metric: "score", nameKey: "trophy.score300", descKey: "trophy.score300D"},
  {id: "score500", tier: "gold", shape: "medal", icon: "crown", xp: 200, goal: 500, metric: "score", nameKey: "trophy.score500", descKey: "trophy.score500D"},
  {id: "squat300", tier: "silver", shape: "ring", icon: "person", xp: 100, goal: 300, metric: "squat", nameKey: "trophy.squat300", descKey: "trophy.squat300D"},
  {id: "challenge", tier: "bronze", shape: "circle", icon: "check", xp: 40, goal: 1, metric: "score", filter: g => g.beat === true, nameKey: "trophy.challenge", descKey: "trophy.challengeD"},
  {id: "week5", tier: "silver", shape: "hex", icon: "calendar-days", xp: 100, goal: 5, metric: "score", nameKey: "trophy.week5", descKey: "trophy.week5D"},
  {id: "allModes", tier: "purple", shape: "diamond", icon: "sparkles", xp: 400, goal: GAME_MODES.length, metric: "modes", nameKey: "trophy.allModes", descKey: "trophy.allModesD"},
];

export interface TrophyState extends Trophy {
  have: number;
  unlocked: boolean;
  pct: number;
}
function bestWeekCount(h: Game[]) {
  const m = new Map<number, number>();
  for (const g of h) { const w = weekStart(g.t); m.set(w, (m.get(w) || 0) + 1) }
  return maxOf([...m.values()]);
}
export function trophyState(t: Trophy, h: Game[]): TrophyState {
  let have = 0;
  switch (t.metric) {
    case "modes": have = gameModes(h).size; break;
    case "streak": have = bestStreak(h); break;
    case "squat": have = exTotals(h).squat?.total || 0; break;
    case "reps": have = sum(h.map(gameReps)); break;
    default:
      if (t.id === "firstGame") have = h.length;
      else if (t.id === "games10" || t.id === "games25" || t.id === "games50" || t.id === "games100") have = h.length;
      else if (t.id === "duo5") have = h.filter(t.filter || (() => true)).length;
      else if (t.id === "challenge") have = h.filter(g => g.beat).length;
      else if (t.id === "week5") have = bestWeekCount(h);
      else have = maxOf(h.map(scoreOf));
  }
  // a count goal is never more than the number of matching games; score/streak goals are capped at the goal only for the bar
  const unlocked = have >= t.goal;
  return {...t, have, unlocked, pct: t.goal > 0 ? Math.min(1, have / t.goal) : 0};
}
export function trophyStates(h: Game[]) { return TROPHIES.map(t => trophyState(t, h)) }
export function xpTotal(h: Game[]) {
  return gameXpTotal(h) + trophyStates(h).filter(t => t.unlocked).reduce((n, t) => n + TIER_XP[t.tier], 0);
}

// ---- detail: the five best results that belong to a trophy ----
export interface TrophyEntry {t: number; value: number; mode: GameMode; unit: string}
const valid=(xs:(number|null)[]|undefined)=>((xs||[]).filter((x):x is number=>x!=null&&Number.isFinite(x)));
// the meaningful number for a mode: points, metres, seconds or walls
function modeMetric(g: Game):{value:number;unit:string}{
  switch(modeOf(g)){
    case "sprint": case "hurdles": case "ski": {
      const ts=valid(g.times); return {value:ts.length?Math.min(...ts):0,unit:"trophy.unit.s"};
    }
    case "longjump": { const ds=valid((g.jumps||[]).flat()); return {value:ds.length?Math.max(...ds):0,unit:"trophy.unit.m"} }
    case "javelin": { const ds=valid((g.throws||[]).flat()); return {value:ds.length?ds.reduce((a,x)=>a+x,0):0,unit:"trophy.unit.m"} }
    case "wall": return {value:Math.max(0,...(g.reps||[]).slice(0,g.players)),unit:"trophy.unit.reps"};
    case "boxing": return {value:Math.max(0,...(g.pts||[]).slice(0,g.players)),unit:"trophy.unit.score"};
    case "bowling": return {value:Math.max(0,...(g.bwTotals||[]).slice(0,g.players)),unit:"trophy.unit.score"};
    case "badminton": return {value:Math.max(0,...(g.bdScore||[]).slice(0,g.players)),unit:"trophy.unit.score"};
    default: return {value:Math.max(0,...(g.score||[]).slice(0,g.players)),unit:"trophy.unit.score"};
  }
}
export function trophyTop(t: Trophy, h: Game[]): TrophyEntry[] {
  if (t.metric === "modes") {
    const byMode = new Map<GameMode, {value:number;unit:string;t:number}>();
    for (const g of h) {
      const m = modeOf(g), {value,unit} = modeMetric(g);
      const prev = byMode.get(m);
      const better = !prev || (unit==="trophy.unit.s" ? (value>0&&(prev.value===0||value<prev.value)) : value>prev.value);
      if (better) byMode.set(m, {value, unit, t:g.t});
    }
    return [...byMode.entries()].map(([mode, x]) => ({t:x.t, value:x.value, mode, unit:x.unit}))
      .sort((a,b)=>(a.unit==="trophy.unit.s"?-a.value:a.value)-(b.unit==="trophy.unit.s"?-b.value:b.value)).reverse().slice(0,5);
  }
  if (t.metric === "streak") {
    const days = new Map<number, number>();
    for (const g of h) { const d = new Date(g.t); d.setHours(0, 0, 0, 0); const k = d.getTime(); days.set(k, (days.get(k) || 0) + gameReps(g)) }
    return [...days.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([day, value]) => ({t: day, value, mode: "rr", unit:"trophy.unit.reps"}));
  }
  const matching = h.filter(t.filter || (() => true));
  const byMode = t.id==="firstGame"||t.id.startsWith("games")||t.id==="duo5"||t.id==="challenge"||t.id==="week5";
  return matching.map(g => {
    const mm=byMode?modeMetric(g):null;
    return {t: g.t, value: t.metric === "reps" ? gameReps(g) : t.metric === "squat" ? (g.exReps || []).slice(0, g.players).reduce((n, r) => n + (r.squat || 0), 0) : mm?mm.value:scoreOf(g), mode: modeOf(g), unit: t.metric==="reps" ? "trophy.unit.reps" : t.metric==="squat" ? "trophy.unit.squat" : mm?mm.unit:"trophy.unit.score"};
  })
    .filter(x=>x.value>0).sort((a, b) => (b.unit==="trophy.unit.s"?-b.value:b.value) - (a.unit==="trophy.unit.s"?-a.value:a.value)).slice(0, 5);
}
