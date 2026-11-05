import {describe, it, expect} from "vitest";
import {
  PARTY_GAMES, createParty, drawLeg, legResult, applyRound, partyDone, winnerTeam, mvpOf, validateParty,
  type PartySetup, type PartyState,
} from "../../src/party/logic.ts";
import {PARTY_CHARS, partyAvatar, partyCharName} from "../../src/party/avatars.ts";
import type {Game} from "../../src/history/stats.ts";

const row = (over: Partial<Game> = {}): Game => ({
  t: 0, players: 2, duration: 60, ex: [], score: [0, 0], reps: [0, 0], ...over,
});
const setup = (over: Partial<PartySetup> = {}): PartySetup => ({
  teams: ["Raudoni", "Mėlyni"],
  players: [["Kometa", "Saulė", "Mėta"], ["Banga", "Rūta", "Tomas"]],
  mode: "all",
  target: 5,
  pool: PARTY_GAMES.map(g => g.id),
  ...over,
});
const party = (over: Partial<PartySetup> = {}, starter: 0 | 1 = 0, id = "p-test") =>
  createParty(setup(over), 1000, id, starter);

// Finish a series for team 0 in two sprint rounds (the series is best-of-3).
function sweep(p: PartyState) {
  const leg = drawLeg(p, 0)!;
  leg.lineup = [0, 0];
  const a = applyRound(p, row({times: [12.1, 12.5]}))!;
  const b = applyRound(p, row({times: [12.2, 12.6]}))!;
  return {leg, a, b};
}

describe("party logic", () => {
  it("has nine party games: seven stable plus two beta (alpha games excluded)", () => {
    expect(PARTY_GAMES.map(g => g.id)).toEqual(["rr", "sp", "bx", "dc", "lj", "sk", "wl", "hd", "bw"]);
    expect(PARTY_GAMES.find(g => g.id === "lj")?.format).toBe("solo");
    expect(PARTY_GAMES.find(g => g.id === "sp")?.format).toBe("duo");
    expect(PARTY_GAMES.find(g => g.id === "dc")?.format).toBe("duo");
    expect(PARTY_GAMES.find(g => g.id === "bw")?.beta).toBe(true);
    expect(PARTY_GAMES.find(g => g.id === "hd")?.beta).toBe(true);
    expect(PARTY_GAMES.find(g => g.id === "bd")).toBeUndefined();
    expect(PARTY_GAMES.find(g => g.id === "jv")).toBeUndefined();
    expect(PARTY_GAMES.find(g => g.id === "sk")?.beta).toBe(false);
  });

  it("creates teams, zero totals and the full pool", () => {
    const p = party();
    expect(p.teams[0].name).toBe("Raudoni");
    expect(p.teams[1].players[0].name).toBe("Banga");
    expect(p.totals).toEqual([0, 0]);
    expect(p.pool).toEqual(["rr", "sp", "bx", "dc", "lj", "sk", "wl", "hd", "bw"]);
    expect(p.poolAll).toEqual(p.pool);
    expect(p.phase).toBe("lobby");
    expect(p.v).toBe(2);
    expect(p.doubleUsed).toBe(false);
  });

  it("has eight distinct new characters with SVG avatars for the other games", () => {
    expect(PARTY_CHARS.map(c => c.id)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
    expect(new Set(PARTY_CHARS.map(c => c.name)).size).toBe(8);
    expect(new Set(PARTY_CHARS.map(c => c.skin + c.hair + c.jersey)).size).toBe(8);
    for (const id of PARTY_CHARS.map(c => c.id)) {
      expect(partyCharName(id)).not.toBe("");
      const svg = partyAvatar(id, 0);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('class="party-char"');
      expect(svg).not.toContain("clipPath");
    }
    expect(partyAvatar("p0", 0)).toContain("#FF3B3B");
    expect(partyAvatar("p0", 1)).toContain("#2F6BFF");
  });

  it("draws without repeats and drains the pool", () => {
    const p = party();
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      const leg = drawLeg(p, 0);
      expect(leg).not.toBeNull();
      seen.push(leg!.game);
      p.current = null; // simulate a completed leg without touching the pool
    }
    expect(new Set(seen).size).toBe(9);
    expect(p.pool).toEqual([]);
    expect(drawLeg(p)).toBeNull();
  });

  it("draws the first, last and a middle item by rand", () => {
    const p = party();
    expect(drawLeg(p, 0)?.game).toBe("rr");
    p.current = null;
    expect(drawLeg(p, 0.999)?.game).toBe("bw");
    p.current = null;
    const mid = party();
    expect(drawLeg(mid, 0.5)?.game).toBe("lj");
  });

  it("draws a solo game with the current starter and a duo game with starter 0", () => {
    const p = party({pool: ["lj"]}, 1);
    const leg = drawLeg(p, 0)!;
    expect(leg.format).toBe("solo");
    expect(leg.starter).toBe(1);
    expect(leg.round).toBe(1);
    expect(leg.wins).toEqual([0, 0]);
    expect(leg.results).toEqual([]);
    const q = party({pool: ["sp"]}, 1);
    expect(drawLeg(q, 0)!.starter).toBe(0);
  });

  it("makes every normal leg worth 1 point and one comeback leg worth 2", () => {
    const p = party({pool: ["rr", "sp", "bx"]});
    const leg = drawLeg(p, 0)!;
    expect(leg.points).toBe(1);
    expect(leg.double).toBe(false);
    p.current = null;
    p.totals = [2, 0];
    const comeback = drawLeg(p, 0)!;
    expect(comeback.double).toBe(true);
    expect(comeback.points).toBe(2);
    expect(p.doubleUsed).toBe(true);
  });

  it("makes the last remaining game the comeback leg when no double was used", () => {
    const p = party({pool: ["bx", "sp"]});
    expect(drawLeg(p, 0)!.double).toBe(false);
    p.current = null;
    const last = drawLeg(p, 0)!;
    expect(last.double).toBe(true);
    expect(last.points).toBe(2);
  });

  it("reads a rep score (higher wins)", () => {
    expect(legResult(row({score: [100, 90]}), "rr", 0)).toMatchObject({winner: 0, values: [100, 90], kind: "points"});
    expect(legResult(row({score: [90, 100]}), "rr", 0).winner).toBe(1);
    expect(legResult(row({score: [90, 90]}), "rr", 0).winner).toBe(-1);
  });

  it("reads boxing points", () => {
    expect(legResult(row({pts: [24, 18]}), "bx", 0).winner).toBe(0);
    expect(legResult(row({pts: [18, 24]}), "bx", 0).winner).toBe(1);
  });

  it("reads Dance Clash points (higher wins)", () => {
    expect(legResult(row({pts: [320, 280]}), "dc", 0)).toMatchObject({winner: 0, values: [320, 280], kind: "points"});
    expect(legResult(row({pts: [180, 240]}), "dc", 0).winner).toBe(1);
    expect(legResult(row({pts: [200, 200]}), "dc", 0).winner).toBe(-1);
  });

  it("reads sprint times (lower wins, null = DNF)", () => {
    expect(legResult(row({times: [12.34, 12.87]}), "sp", 0).winner).toBe(0);
    expect(legResult(row({times: [12.87, 12.34]}), "sp", 0).winner).toBe(1);
    expect(legResult(row({times: [null, 12.34]}), "sp", 0).winner).toBe(1);
    expect(legResult(row({times: [12.34, null]}), "sp", 0).winner).toBe(0);
    expect(legResult(row({times: [null, null]}), "sp", 0).winner).toBe(-1);
  });

  it("reads the best long jump and ties by the second attempt", () => {
    const r = row({jumps: [[6.1, 6.0, 5.0], [6.3, 6.2, 5.0]]});
    expect(legResult(r, "lj", 0)).toMatchObject({winner: 1, values: [6.1, 6.3], kind: "metres"});
    const tie = row({jumps: [[6.3, 6.0, 5.0], [6.3, 6.2, 5.0]]});
    expect(legResult(tie, "lj", 0).winner).toBe(1);
    const foul = row({jumps: [[null, null, null], [6.3, null, null]]});
    expect(legResult(foul, "lj", 0)).toMatchObject({winner: 1, values: [null, 6.3], nullText: "X"});
    expect(legResult(row({jumps: [[null], [null]]}), "lj", 0).winner).toBe(-1);
  });

  it("maps a solo game from P1/P2 to team order via the starter", () => {
    const r = row({jumps: [[6.3, null, null], [6.1, null, null]]});
    const a = legResult(r, "lj", 0);
    expect(a.values).toEqual([6.3, 6.1]);
    expect(a.winner).toBe(0);
    const b = legResult(r, "lj", 1);
    expect(b.values).toEqual([6.1, 6.3]);
    expect(b.winner).toBe(1);
  });

  it("reads walls, then seconds as the tie-break", () => {
    expect(legResult(row({reps: [5, 6]}), "wl", 0)).toMatchObject({winner: 1, values: [5, 6], kind: "walls"});
    expect(legResult(row({reps: [5, 5], secs: [10, 12]}), "wl", 0).winner).toBe(1);
    expect(legResult(row({reps: [5, 5], secs: [12, 10]}), "wl", 0).winner).toBe(0);
    expect(legResult(row({reps: [5, 5], secs: [10, 10]}), "wl", 0).winner).toBe(-1);
  });

  it("reads hurdles and skiing times (lower wins)", () => {
    expect(legResult(row({times: [18.2, 19.1]}), "hd", 0)).toMatchObject({winner: 0, kind: "seconds"});
    expect(legResult(row({times: [null, 22.4]}), "sk", 0).winner).toBe(1);
    expect(legResult(row({times: [21.2, 21.2]}), "sk", 0).winner).toBe(-1);
  });

  it("reads bowling totals (higher wins)", () => {
    expect(legResult(row({bwTotals: [120, 140]}), "bw", 0)).toMatchObject({winner: 1, values: [120, 140], kind: "pins"});
    expect(legResult(row({bwTotals: [90, 90]}), "bw", 0).winner).toBe(-1);
  });

  it("best-of-3: a round win keeps the series alive, two wins take the leg", () => {
    const p = party({pool: ["sp", "bx"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    const first = applyRound(p, row({times: [12.1, 12.5]}), 2000)!;
    expect(first.done).toBe(false);
    expect(first.round.winner).toBe(0);
    expect(leg.wins).toEqual([1, 0]);
    expect(leg.round).toBe(2);
    expect(p.current).toBe(leg);
    expect(p.totals).toEqual([0, 0]);
    expect(p.phase).toBe("playing");
    const second = applyRound(p, row({times: [12.3, 12.2]}), 3000)!;
    expect(second.done).toBe(false);
    expect(leg.wins).toEqual([1, 1]);
    expect(leg.round).toBe(3);
    expect(p.current).toBe(leg);
    const third = applyRound(p, row({times: [12.0, 12.6]}), 4000)!;
    expect(third.done).toBe(true);
    expect(p.current).toBeNull();
    expect(leg.winner).toBe(0);
    expect(leg.values).toEqual([2, 1]);
    expect(leg.kind).toBe("rounds");
    expect(p.totals).toEqual([1, 0]);
    expect(p.legs).toHaveLength(1);
    expect(p.legs[0].pts).toEqual([1, 0]);
    expect(p.phase).toBe("lobby");
  });

  it("best-of-3 ends after two straight wins (2:0)", () => {
    const p = party({pool: ["sp", "bx"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    const a = applyRound(p, row({times: [12.1, 12.5]}))!;
    const b = applyRound(p, row({times: [12.2, 12.6]}))!;
    expect(a.done).toBe(false);
    expect(b.done).toBe(true);
    expect(leg.results).toHaveLength(2);
    expect(leg.wins).toEqual([2, 0]);
    expect(leg.values).toEqual([2, 0]);
    expect(leg.round).toBe(2);
    expect(p.totals).toEqual([1, 0]);
    expect(p.phase).toBe("lobby");
  });

  it("best-of-3: a 1:1 series with a tied third round is a leg tie (0.5 each)", () => {
    const p = party({pool: ["sp", "bx"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    applyRound(p, row({times: [12.1, 12.5]}));
    applyRound(p, row({times: [12.5, 12.1]}));
    const third = applyRound(p, row({times: [12.2, 12.2]}))!;
    expect(third.done).toBe(true);
    expect(third.round.winner).toBe(-1);
    expect(leg.wins).toEqual([1, 1]);
    expect(leg.winner).toBe(-1);
    expect(leg.values).toEqual([1, 1]);
    expect(p.totals).toEqual([0.5, 0.5]);
    expect(leg.pts).toEqual([0.5, 0.5]);
  });

  it("best-of-3: a team with more round wins after three rounds takes the series", () => {
    const p = party({pool: ["sp", "bx"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    applyRound(p, row({times: [12.1, 12.5]})); // team 0
    applyRound(p, row({times: [12.2, 12.2]})); // tie
    const last = applyRound(p, row({times: [12.3, 12.3]}))!; // tie
    expect(last.done).toBe(true);
    expect(leg.wins).toEqual([1, 0]);
    expect(leg.winner).toBe(0);
    expect(p.totals).toEqual([1, 0]);
  });

  it("awards 1 point each on a double-leg series tie", () => {
    const p = party({pool: ["bx", "sp"]});
    p.totals = [2, 0];
    const leg = drawLeg(p, 0)!;
    expect(leg.points).toBe(2);
    leg.lineup = [0, 0];
    applyRound(p, row({pts: [18, 18]}));
    applyRound(p, row({pts: [18, 18]}));
    applyRound(p, row({pts: [18, 18]}));
    expect(leg.wins).toEqual([0, 0]);
    expect(leg.winner).toBe(-1);
    expect(p.totals).toEqual([3, 1]);
    expect(leg.pts).toEqual([1, 1]);
  });

  it("toggles the solo starter for the next round and the next leg", () => {
    const p = party({pool: ["lj", "wl"]}, 1);
    const leg = drawLeg(p, 0)!;
    expect(leg.starter).toBe(1);
    leg.lineup = [0, 0];
    applyRound(p, row({jumps: [[6.1], [6.3]]})); // P2 = team 0 wins r1
    expect(leg.starter).toBe(0);
    applyRound(p, row({jumps: [[6.3], [6.5]]})); // P2 = team 1 wins r2
    expect(leg.starter).toBe(1);
    applyRound(p, row({jumps: [[6.4], [6.6]]})); // P2 = team 0 wins r3 -> 2:1
    expect(p.current).toBeNull();
    expect(leg.winner).toBe(0);
    expect(p.nextStarter).toBe(0); // the team that did not start the final round
  });

  it("keeps playing in all mode while games remain", () => {
    const p = party({pool: ["sp", "bx"]});
    const {b} = sweep(p);
    expect(b.done).toBe(true);
    expect(p.phase).toBe("lobby");
    expect(partyDone(p)).toBe(false);
  });

  it("ends on the target only when a team is ahead", () => {
    const p = party({mode: "target", target: 1, pool: ["rr", "sp"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    applyRound(p, row({score: [100, 90]}));
    applyRound(p, row({score: [100, 90]}));
    expect(p.totals).toEqual([1, 0]);
    expect(p.phase).toBe("done");
    const q = party({mode: "target", target: 1, pool: ["bx", "sp"]});
    const l = drawLeg(q, 0)!;
    l.lineup = [0, 0];
    applyRound(q, row({pts: [10, 10]}));
    applyRound(q, row({pts: [10, 10]}));
    applyRound(q, row({pts: [10, 10]}));
    expect(q.totals).toEqual([0.5, 0.5]);
    expect(q.phase).toBe("lobby"); // tied after the series, target not reached
  });

  it("finds the winner and the MVP", () => {
    const p = party({pool: ["bx", "sp", "lj"]});
    const a = drawLeg(p, 0)!;
    a.lineup = [0, 0];
    applyRound(p, row({pts: [5, 10]}));
    applyRound(p, row({pts: [5, 10]}));
    const b = drawLeg(p, 0)!;
    b.lineup = [1, 1];
    applyRound(p, row({times: [12.1, 11.9]}));
    applyRound(p, row({times: [12.1, 11.9]}));
    expect(p.totals).toEqual([0, 2]);
    expect(winnerTeam(p)).toBe(1);
    const mvp = mvpOf(p)!;
    expect(mvp.team).toBe(1);
    expect(mvp.wins).toBe(1);
    expect(mvp.name).toBe("Banga");
  });

  it("validates saved state", () => {
    const p = party();
    expect(validateParty(p)).not.toBeNull();
    expect(validateParty(null)).toBeNull();
    expect(validateParty({...p, v: 1})).toBeNull();
    expect(validateParty({...p, v: 3})).toBeNull();
    expect(validateParty({...p, teams: []})).toBeNull();
    expect(validateParty({...p, phase: "nope"})).toBeNull();
  });
});
