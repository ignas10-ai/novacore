// Party Mode („Vakarėlis“) — PURE logic: games, draw, scoring, leg results, state. No DOM, no storage.
// A leg is one existing game; the party reads the game's normal history row and compares the two reps.
import type {Game} from "../history/stats.ts";

export type Team = 0 | 1;
export type PartyFormat = "solo" | "duo";
export type PartyKind = "points" | "seconds" | "metres" | "walls" | "pins" | "rounds";

export interface PartyGame {
  id: string;
  format: PartyFormat; // solo = take turns, duo = both at once
  beta: boolean;
  titleKey: string;
  howKey: string;
  sport: string;       // Phosphor sport glyph id
}

// All 10 games in the party pool; the beta ones are opt-in in the setup. Every leg is worth 1 point
// (0.5 each on a tie); one comeback leg per party is worth 2 (1 each on a tie).
export const PARTY_GAMES: PartyGame[] = [
  {id: "rr", format: "duo", beta: false, titleKey: "party.game.rr", howKey: "party.how.rr", sport: "sport-rr"},
  {id: "sp", format: "duo", beta: false, titleKey: "party.game.sp", howKey: "party.how.sp", sport: "sport-sp"},
  {id: "bx", format: "duo", beta: false, titleKey: "party.game.bx", howKey: "party.how.bx", sport: "sport-bx"},
  {id: "lj", format: "solo", beta: false, titleKey: "party.game.lj", howKey: "party.how.lj", sport: "sport-lj"},
  {id: "sk", format: "duo", beta: false, titleKey: "party.game.sk", howKey: "party.how.sk", sport: "sport-sk"},
  {id: "wl", format: "solo", beta: false, titleKey: "party.game.wl", howKey: "party.how.wl", sport: "sport-wl"},
  {id: "hd", format: "duo", beta: true, titleKey: "party.game.hd", howKey: "party.how.hd", sport: "sport-hd"},
  {id: "bw", format: "solo", beta: true, titleKey: "party.game.bw", howKey: "party.how.bw", sport: "sport-bw"},
  {id: "bd", format: "duo", beta: true, titleKey: "party.game.bd", howKey: "party.how.bd", sport: "sport-bd"},
  {id: "jv", format: "solo", beta: true, titleKey: "party.game.jv", howKey: "party.how.jv", sport: "sport-jv"},
];
export const CORE_GAMES = PARTY_GAMES.filter(g => !g.beta).map(g => g.id);
export const BETA_GAMES = PARTY_GAMES.filter(g => g.beta).map(g => g.id);
export const partyGame = (id: string) => PARTY_GAMES.find(g => g.id === id) ?? null;

export interface PartyPlayer {name: string; legs: number; wins: number}
export interface PartyTeam {name: string; players: PartyPlayer[]}

export interface PartyLeg {
  game: string;
  points: number;               // points at stake (1 normal, 2 comeback leg)
  double: boolean;              // the one 2x comeback leg
  format: PartyFormat;
  lineup: [number, number];     // player index per team (team order, not game order)
  starter: Team;                // the current round's solo starter; duo: 0
  round: number;                // next round to play (1-based)
  wins: [number, number];       // round wins in team order
  results: RoundResult[];       // completed rounds
  winner: Team | -1 | null;     // series winner
  values: [number | null, number | null]; // final series round wins (team order)
  kind: PartyKind;
  pts: [number, number];        // party points awarded at the end of the series
  at: number;
}

export interface RoundResult {
  winner: Team | -1;
  values: [number | null, number | null]; // team order for this round
  kind: PartyKind;
  starter: Team;
  at: number;
}

export interface PartyState {
  v: 2;
  id: string;
  createdAt: number;
  updatedAt: number;
  teams: [PartyTeam, PartyTeam];
  mode: "all" | "target";
  target: number;
  doubleUsed: boolean; // the comeback 2x leg was already drawn
  drawHistory: string[]; // the last two draw animations (newest first), so random never repeats them
  poolAll: string[];  // selected games (for a rematch)
  pool: string[];     // games not drawn yet
  current: PartyLeg | null;
  legs: PartyLeg[];
  totals: [number, number];
  phase: "lobby" | "playing" | "done";
  nextStarter: Team;
}

export interface PartySetup {
  teams: [string, string];
  players: [string[], string[]];
  mode: "all" | "target";
  target: number;
  pool: string[];
}

// What the party passes to a game before startFlow(): the display names are in game order (P1, P2).
export interface PartyLegCfg {
  game: string;
  format: PartyFormat;
  starter: Team;
  names: [string, string];
  teamNames: [string, string];
}

export interface LegResult {
  values: [number | null, number | null];
  kind: PartyKind;
  winner: Team | -1;
  nullText: "X" | "–";
}

const clean = (s: string, max = 14) => (s || "").trim().slice(0, max);
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function createParty(s: PartySetup, now = Date.now(), id = "p-" + Math.random().toString(36).slice(2, 8), starter: Team = 0): PartyState {
  const selected = s.pool.filter(x => !!partyGame(x));
  const teams = [0, 1].map(t => ({
    name: clean(s.teams[t], 16) || (t ? "Mėlyni" : "Raudoni"),
    players: (s.players[t] || []).map((name, i) => ({
      name: clean(name) || `Žaidėjas ${t * 4 + i + 1}`,
      legs: 0,
      wins: 0,
    })),
  })) as [PartyTeam, PartyTeam];
  return {
    v: 2,
    id,
    createdAt: now,
    updatedAt: now,
    teams,
    mode: s.mode === "target" ? "target" : "all",
    target: clampInt(s.target, 1, 99, 5),
    doubleUsed: false,
    drawHistory: [],
    poolAll: selected,
    pool: [...selected],
    current: null,
    legs: [],
    totals: [0, 0],
    phase: "lobby",
    nextStarter: starter,
  };
}

// Random draw from the remaining pool. The rand parameter is for tests; the UI uses Math.random.
export function drawLeg(p: PartyState, rand: number = Math.random()): PartyLeg | null {
  if (p.current) return p.current;
  if (!p.pool.length) return null;
  const i = Math.min(p.pool.length - 1, Math.max(0, Math.floor(rand * p.pool.length)));
  const gameId = p.pool.splice(i, 1)[0];
  const g = partyGame(gameId);
  if (!g) return null;
  // One comeback leg per party: when a team is 2+ behind (or this is the last game), it is worth 2.
  const double = !p.doubleUsed && (Math.abs(p.totals[0] - p.totals[1]) >= 2 || p.pool.length === 0);
  if (double) p.doubleUsed = true;
  const leg: PartyLeg = {
    game: gameId,
    points: double ? 2 : 1,
    double,
    format: g.format,
    lineup: [-1, -1],
    starter: g.format === "solo" ? p.nextStarter : 0,
    round: 1,
    wins: [0, 0],
    results: [],
    winner: null,
    values: [null, null],
    kind: kindOf(gameId),
    pts: [0, 0],
    at: 0,
  };
  p.current = leg;
  p.phase = "lobby";
  p.updatedAt = Date.now();
  return leg;
}

export function kindOf(gameId: string): PartyKind {
  if (gameId === "sp" || gameId === "hd" || gameId === "sk") return "seconds";
  if (gameId === "lj" || gameId === "jv") return "metres";
  if (gameId === "wl") return "walls";
  if (gameId === "bw") return "pins";
  return "points";
}

function playerBest(jumps: (number | null)[] | undefined): number | null {
  const valid = (jumps || []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return valid.length ? Math.max(...valid) : null;
}
function playerSecond(jumps: (number | null)[] | undefined): number | null {
  const valid = (jumps || []).filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => b - a);
  return valid.length > 1 ? valid[1] : null;
}

function totalThrows(throws: (number | null)[] | undefined): number | null {
  const valid = (throws || []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
}
function bestThrow(throws: (number | null)[] | undefined): number | null {
  const valid = (throws || []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return valid.length ? Math.max(...valid) : null;
}

// P1/P2 value for a history row.
function gameValue(row: Game, gameId: string, p: 0 | 1): number | null {
  switch (gameId) {
    case "rr": return Number(row.score?.[p]) || 0;
    case "bx": return Number(row.pts?.[p]) || 0;
    case "bd": return Number(row.bdScore?.[p]) || 0;
    case "sp":
    case "hd":
    case "sk": return typeof row.times?.[p] === "number" ? row.times[p] : null;
    case "lj": return playerBest(row.jumps?.[p]);
    case "jv": return totalThrows(row.throws?.[p]);
    case "bw": return Number(row.bwTotals?.[p]) || 0;
    case "wl": return Number(row.reps?.[p]) || 0;
    default: return Number(row.score?.[p]) || 0;
  }
}

function high(a: number | null, b: number | null): Team | -1 {
  if (a == null && b == null) return -1;
  if (a == null) return 1;
  if (b == null) return 0;
  return a === b ? -1 : a > b ? 0 : 1;
}
function low(a: number | null, b: number | null): Team | -1 {
  if (a == null && b == null) return -1;
  if (a == null) return 1;
  if (b == null) return 0;
  return a === b ? -1 : a < b ? 0 : 1;
}

// Compares the history row (P1/P2) and maps the result to team order.
export function legResult(row: Game, gameId: string, starter: Team): LegResult {
  const g = partyGame(gameId);
  const kind = kindOf(gameId);
  const p1 = gameValue(row, gameId, 0);
  const p2 = gameValue(row, gameId, 1);
  const solo = g?.format === "solo";
  const values: [number | null, number | null] = solo
    ? (starter === 0 ? [p1, p2] : [p2, p1])
    : [p1, p2];

  let gameWinner: Team | -1;
  if (gameId === "sp" || gameId === "hd" || gameId === "sk") gameWinner = low(p1, p2);
  else if (gameId === "lj") {
    gameWinner = high(p1, p2);
    if (gameWinner === -1 && p1 != null && p2 != null) {
      // real long-jump rule: ties are broken by the second best attempt
      gameWinner = high(playerSecond(row.jumps?.[0]), playerSecond(row.jumps?.[1]));
    }
  } else if (gameId === "jv") {
    gameWinner = high(p1, p2);
    if (gameWinner === -1 && p1 != null && p2 != null) {
      // total of valid throws, then the best single throw
      gameWinner = high(bestThrow(row.throws?.[0]), bestThrow(row.throws?.[1]));
    }
  } else if (gameId === "wl") {
    gameWinner = high(p1, p2);
    if (gameWinner === -1) gameWinner = high(Number(row.secs?.[0]) || 0, Number(row.secs?.[1]) || 0);
  } else gameWinner = high(p1, p2);

  const winner: Team | -1 = gameWinner === -1 ? -1 : solo
    ? (gameWinner === 0 ? starter : (1 - starter) as Team)
    : gameWinner;
  return {values, kind, winner, nullText: gameId === "lj" || gameId === "jv" ? "X" : "–"};
}

export interface RoundApply {
  done: boolean;          // the series is over
  leg: PartyLeg;
  round: RoundResult;
}

// Applies one round (one launch of the game) to the current best-of-3 series. A round win is a round;
// the series ends at 2 round wins or after 3 rounds. A 1-1 series with a tied decider is a leg tie.
export function applyRound(p: PartyState, row: Game, now = Date.now()): RoundApply | null {
  const leg = p.current;
  if (!leg) return null;
  const res = legResult(row, leg.game, leg.starter);
  const round: RoundResult = {winner: res.winner, values: res.values, kind: res.kind, starter: leg.starter, at: now};
  leg.results.push(round);
  if (res.winner !== -1) leg.wins[res.winner]++;
  leg.at = now;

  const done = leg.wins[0] >= 2 || leg.wins[1] >= 2 || leg.results.length >= 3;
  if (!done) {
    leg.round++;
    if (leg.format === "solo") leg.starter = (1 - leg.starter) as Team;
    p.phase = "playing";
    p.updatedAt = now;
    return {done: false, leg, round};
  }

  const winner: Team | -1 = leg.wins[0] > leg.wins[1] ? 0 : leg.wins[1] > leg.wins[0] ? 1 : -1;
  leg.winner = winner;
  leg.values = [leg.wins[0], leg.wins[1]];
  leg.kind = "rounds";
  const half = leg.points / 2;
  const pts: [number, number] = winner === -1 ? [half, half] : winner === 0 ? [leg.points, 0] : [0, leg.points];
  leg.pts = pts;
  p.totals[0] += pts[0];
  p.totals[1] += pts[1];
  for (const t of [0, 1] as Team[]) {
    const idx = leg.lineup[t];
    const pl = p.teams[t].players[idx];
    if (pl) {
      pl.legs++;
      if (winner === t) pl.wins++;
    }
  }
  p.legs.push(leg);
  p.current = null;
  if (leg.format === "solo") p.nextStarter = (1 - leg.starter) as Team;
  p.phase = partyDone(p) ? "done" : "lobby";
  p.updatedAt = now;
  return {done: true, leg, round};
}

export function partyDone(p: PartyState): boolean {
  if (!p.pool.length) return true;
  if (p.mode === "target" && Math.max(p.totals[0], p.totals[1]) >= p.target && p.totals[0] !== p.totals[1]) return true;
  return false;
}

export function winnerTeam(p: PartyState): Team | -1 {
  return p.totals[0] === p.totals[1] ? -1 : p.totals[0] > p.totals[1] ? 0 : 1;
}

export interface Mvp {team: Team; index: number; name: string; wins: number; legs: number}
export function mvpOf(p: PartyState): Mvp | null {
  let best: Mvp | null = null;
  for (const t of [0, 1] as Team[]) {
    p.teams[t].players.forEach((pl, i) => {
      const cur: Mvp = {team: t, index: i, name: pl.name, wins: pl.wins, legs: pl.legs};
      if (!best || cur.wins > best.wins || (cur.wins === best.wins && cur.legs > best.legs)) best = cur;
    });
  }
  return best;
}

export function validateParty(raw: any): PartyState | null {
  if (!raw || raw.v !== 2 || typeof raw.id !== "string") return null;
  if (!Array.isArray(raw.teams) || raw.teams.length !== 2) return null;
  if (!Array.isArray(raw.pool) || !Array.isArray(raw.poolAll) || !Array.isArray(raw.legs)) return null;
  if (!Array.isArray(raw.totals) || raw.totals.length !== 2) return null;
  if (raw.phase !== "lobby" && raw.phase !== "playing" && raw.phase !== "done") return null;
  if (![0, 1].includes(raw.nextStarter)) return null;
  if (typeof raw.doubleUsed !== "boolean") raw.doubleUsed = false;
  if (!Array.isArray(raw.drawHistory)) raw.drawHistory = [];
  for (const t of [0, 1] as Team[]) if (!Array.isArray(raw.teams[t]?.players)) return null;
  const fixLeg = (l: any) => {
    if (!l || typeof l !== "object") return;
    if (!Array.isArray(l.results)) l.results = [];
    if (!Array.isArray(l.wins)) l.wins = [l.winner === 0 ? 1 : 0, l.winner === 1 ? 1 : 0];
    if (typeof l.round !== "number") l.round = Math.max(1, l.results.length + 1);
    if (typeof l.double !== "boolean") l.double = l.points === 2;
    if (!Array.isArray(l.pts)) l.pts = [0, 0];
  };
  if (raw.current) fixLeg(raw.current);
  for (const l of raw.legs) fixLeg(l);
  return raw as PartyState;
}
