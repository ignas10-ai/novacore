// Party Mode („Vakarėlis“) — PURE logic: games, draw, scoring, leg results, state. No DOM, no storage.
// A leg is one existing game; the party reads the game's normal history row and compares the two reps.
import type {Game} from "../history/stats.ts";

export type Team = 0 | 1;
export type PartyFormat = "solo" | "duo";
export type PartyKind = "points" | "seconds" | "metres" | "walls";

export interface PartyGame {
  id: string;
  points: number;      // weighted base points
  format: PartyFormat; // solo = take turns, duo = both at once
  titleKey: string;
  howKey: string;
  sport: string;       // Phosphor sport glyph id
}

// MVP pool: the five non-beta games with a working party adapter.
export const PARTY_GAMES: PartyGame[] = [
  {id: "rr", points: 3, format: "duo", titleKey: "party.game.rr", howKey: "party.how.rr", sport: "sport-rr"},
  {id: "sp", points: 2, format: "duo", titleKey: "party.game.sp", howKey: "party.how.sp", sport: "sport-sp"},
  {id: "bx", points: 1, format: "duo", titleKey: "party.game.bx", howKey: "party.how.bx", sport: "sport-bx"},
  {id: "lj", points: 2, format: "solo", titleKey: "party.game.lj", howKey: "party.how.lj", sport: "sport-lj"},
  {id: "wl", points: 1, format: "solo", titleKey: "party.game.wl", howKey: "party.how.wl", sport: "sport-wl"},
];
export const partyGame = (id: string) => PARTY_GAMES.find(g => g.id === id) ?? null;

export const PARTY_CHAR_IDS = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"] as const;
export type PartyCharId = typeof PARTY_CHAR_IDS[number];

export interface PartyPlayer {name: string; legs: number; wins: number; char: string}
export interface PartyTeam {name: string; players: PartyPlayer[]}

export interface PartyLeg {
  game: string;
  points: number;               // points at stake
  format: PartyFormat;
  lineup: [number, number];     // player index per team (team order, not game order)
  starter: Team;                // solo: which team starts; duo: ignored (0)
  winner: Team | -1 | null;
  values: [number | null, number | null]; // team order
  kind: PartyKind;
  pts: [number, number];
  at: number;
}

export interface PartyState {
  v: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  teams: [PartyTeam, PartyTeam];
  mode: "all" | "target";
  target: number;
  scoring: "weighted" | "simple";
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
  scoring: "weighted" | "simple";
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
      char: PARTY_CHAR_IDS[(t * 4 + i) % PARTY_CHAR_IDS.length],
    })),
  })) as [PartyTeam, PartyTeam];
  return {
    v: 1,
    id,
    createdAt: now,
    updatedAt: now,
    teams,
    mode: s.mode === "target" ? "target" : "all",
    target: clampInt(s.target, 1, 99, 5),
    scoring: s.scoring === "simple" ? "simple" : "weighted",
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
  const leg: PartyLeg = {
    game: gameId,
    points: p.scoring === "simple" ? 1 : g.points,
    format: g.format,
    lineup: [-1, -1],
    starter: g.format === "solo" ? p.nextStarter : 0,
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
  if (gameId === "sp") return "seconds";
  if (gameId === "lj") return "metres";
  if (gameId === "wl") return "walls";
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

// P1/P2 value for a history row.
function gameValue(row: Game, gameId: string, p: 0 | 1): number | null {
  switch (gameId) {
    case "rr": return Number(row.score?.[p]) || 0;
    case "bx": return Number(row.pts?.[p]) || 0;
    case "sp": return typeof row.times?.[p] === "number" ? row.times[p] : null;
    case "lj": return playerBest(row.jumps?.[p]);
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
  if (gameId === "sp") gameWinner = low(p1, p2);
  else if (gameId === "lj") {
    gameWinner = high(p1, p2);
    if (gameWinner === -1 && p1 != null && p2 != null) {
      // real long-jump rule: ties are broken by the second best attempt
      gameWinner = high(playerSecond(row.jumps?.[0]), playerSecond(row.jumps?.[1]));
    }
  } else if (gameId === "wl") {
    gameWinner = high(p1, p2);
    if (gameWinner === -1) gameWinner = high(Number(row.secs?.[0]) || 0, Number(row.secs?.[1]) || 0);
  } else gameWinner = high(p1, p2);

  const winner: Team | -1 = gameWinner === -1 ? -1 : solo
    ? (gameWinner === 0 ? starter : (1 - starter) as Team)
    : gameWinner;
  return {values, kind, winner, nullText: gameId === "lj" ? "X" : "–"};
}

export function applyLeg(p: PartyState, row: Game, now = Date.now()): PartyLeg | null {
  const leg = p.current;
  if (!leg) return null;
  const res = legResult(row, leg.game, leg.starter);
  leg.values = res.values;
  leg.kind = res.kind;
  leg.winner = res.winner;
  leg.at = now;
  const pts: [number, number] = res.winner === -1 ? [1, 1] : res.winner === 0 ? [leg.points, 0] : [0, leg.points];
  leg.pts = pts;
  p.totals[0] += pts[0];
  p.totals[1] += pts[1];
  for (const t of [0, 1] as Team[]) {
    const idx = leg.lineup[t];
    const pl = p.teams[t].players[idx];
    if (pl) {
      pl.legs++;
      if (res.winner === t) pl.wins++;
    }
  }
  p.legs.push(leg);
  p.current = null;
  if (leg.format === "solo") p.nextStarter = (1 - leg.starter) as Team;
  p.phase = partyDone(p) ? "done" : "lobby";
  p.updatedAt = now;
  return leg;
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
  if (!raw || raw.v !== 1 || typeof raw.id !== "string") return null;
  if (!Array.isArray(raw.teams) || raw.teams.length !== 2) return null;
  if (!Array.isArray(raw.pool) || !Array.isArray(raw.poolAll) || !Array.isArray(raw.legs)) return null;
  if (!Array.isArray(raw.totals) || raw.totals.length !== 2) return null;
  if (raw.phase !== "lobby" && raw.phase !== "playing" && raw.phase !== "done") return null;
  if (![0, 1].includes(raw.nextStarter)) return null;
  // older saves (before the 8 new characters) get a distinct avatar back-filled
  for (const t of [0, 1] as Team[]) {
    const players = raw.teams[t]?.players;
    if (!Array.isArray(players)) return null;
    players.forEach((pl: any, i: number) => {
      if (!pl || typeof pl.char !== "string") pl.char = PARTY_CHAR_IDS[(t * 4 + i) % PARTY_CHAR_IDS.length];
    });
  }
  return raw as PartyState;
}
