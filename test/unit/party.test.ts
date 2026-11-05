import {describe, it, expect} from "vitest";
import {
  PARTY_GAMES, PARTY_CHAR_IDS, createParty, drawLeg, legResult, applyLeg, partyDone, winnerTeam, mvpOf, validateParty,
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
  scoring: "weighted",
  pool: PARTY_GAMES.map(g => g.id),
  ...over,
});
const party = (over: Partial<PartySetup> = {}, starter: 0 | 1 = 0, id = "p-test") =>
  createParty(setup(over), 1000, id, starter);

describe("party logic", () => {
  it("has the five MVP games with formats and points", () => {
    expect(PARTY_GAMES.map(g => g.id)).toEqual(["rr", "sp", "bx", "lj", "wl"]);
    expect(PARTY_GAMES.find(g => g.id === "lj")?.format).toBe("solo");
    expect(PARTY_GAMES.find(g => g.id === "sp")?.format).toBe("duo");
    expect(PARTY_GAMES.find(g => g.id === "rr")?.points).toBe(3);
  });

  it("creates teams, zero totals and the full pool", () => {
    const p = party();
    expect(p.teams[0].name).toBe("Raudoni");
    expect(p.teams[1].players[0].name).toBe("Banga");
    expect(p.totals).toEqual([0, 0]);
    expect(p.pool).toEqual(["rr", "sp", "bx", "lj", "wl"]);
    expect(p.poolAll).toEqual(p.pool);
    expect(p.phase).toBe("lobby");
  });

  it("has eight distinct new party characters with SVG avatars", () => {
    expect(PARTY_CHARS.map(c => c.id)).toEqual([...PARTY_CHAR_IDS]);
    expect(new Set(PARTY_CHARS.map(c => c.name)).size).toBe(8);
    expect(new Set(PARTY_CHARS.map(c => c.skin + c.hair + c.jersey)).size).toBe(8);
    for (const id of PARTY_CHAR_IDS) {
      expect(partyCharName(id)).not.toBe("");
      const svg = partyAvatar(id, 0);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('class="party-char"');
      expect(svg).not.toContain("clipPath");
    }
    expect(partyAvatar("p0", 0)).toContain("#FF3B3B");
    expect(partyAvatar("p0", 1)).toContain("#2F6BFF");
  });

  it("gives a 3v3 party six different characters", () => {
    const p = party();
    const chars = [...p.teams[0].players, ...p.teams[1].players].map(x => x.char);
    expect(chars).toEqual(["p0", "p1", "p2", "p4", "p5", "p6"]);
    expect(new Set(chars).size).toBe(6);
  });

  it("draws without repeats and drains the pool", () => {
    const p = party();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const leg = drawLeg(p, 0);
      expect(leg).not.toBeNull();
      seen.push(leg!.game);
      p.current = null; // simulate a completed leg without touching the pool
    }
    expect(new Set(seen).size).toBe(5);
    expect(p.pool).toEqual([]);
    expect(drawLeg(p)).toBeNull();
  });

  it("draws the first, last and a middle item by rand", () => {
    const p = party();
    expect(drawLeg(p, 0)?.game).toBe("rr");
    p.current = null;
    expect(drawLeg(p, 0.999)?.game).toBe("wl");
    p.current = null;
    const mid = party();
    expect(drawLeg(mid, 0.5)?.game).toBe("bx");
  });

  it("draws a solo game with the current starter and a duo game with starter 0", () => {
    const p = party({pool: ["lj"]}, 1);
    const leg = drawLeg(p, 0)!;
    expect(leg.format).toBe("solo");
    expect(leg.starter).toBe(1);
    const q = party({pool: ["sp"]}, 1);
    expect(drawLeg(q, 0)!.starter).toBe(0);
  });

  it("simple scoring makes every leg worth 1", () => {
    const p = party({scoring: "simple", pool: ["rr"]});
    expect(drawLeg(p, 0)!.points).toBe(1);
    const q = party({scoring: "weighted", pool: ["rr"]});
    expect(drawLeg(q, 0)!.points).toBe(3);
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

  it("applies a win: totals, player legs/wins and the leg history", () => {
    const p = party({pool: ["sp"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    applyLeg(p, row({times: [12.1, 12.5]}), 2000);
    expect(p.totals).toEqual([2, 0]);
    expect(p.teams[0].players[0]).toMatchObject({legs: 1, wins: 1});
    expect(p.teams[1].players[0]).toMatchObject({legs: 1, wins: 0});
    expect(p.current).toBeNull();
    expect(p.legs).toHaveLength(1);
    expect(p.legs[0].pts).toEqual([2, 0]);
    expect(p.phase).toBe("done"); // the pool is empty
  });

  it("awards 1 point each on a tie", () => {
    const p = party({pool: ["bx", "sp"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [1, 1];
    applyLeg(p, row({pts: [18, 18]}));
    expect(p.totals).toEqual([1, 1]);
    expect(p.teams[0].players[1].wins).toBe(0);
    expect(p.teams[1].players[1].wins).toBe(0);
    expect(p.phase).toBe("lobby");
  });

  it("alternates the solo starter after a solo leg", () => {
    const p = party({pool: ["lj", "wl"]}, 1);
    const leg = drawLeg(p, 0)!;
    expect(leg.starter).toBe(1);
    leg.lineup = [0, 0];
    applyLeg(p, row({jumps: [[6.3], [6.1]]}));
    expect(p.nextStarter).toBe(0);
    expect(p.phase).toBe("lobby");
  });

  it("ends on the target only when a team is ahead", () => {
    const p = party({mode: "target", target: 3, pool: ["rr", "sp"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    applyLeg(p, row({score: [100, 90]}));
    expect(p.totals).toEqual([3, 0]);
    expect(p.phase).toBe("done");
    const q = party({mode: "target", target: 2, pool: ["bx", "sp"]});
    const l = drawLeg(q, 0)!;
    l.lineup = [0, 0];
    applyLeg(q, row({pts: [10, 10]}));
    expect(q.totals).toEqual([1, 1]);
    expect(q.phase).toBe("lobby"); // 1:1, target not reached
  });

  it("keeps playing in all mode while games remain", () => {
    const p = party({pool: ["bx", "sp"]});
    const leg = drawLeg(p, 0)!;
    leg.lineup = [0, 0];
    applyLeg(p, row({pts: [10, 5]}));
    expect(p.phase).toBe("lobby");
    expect(partyDone(p)).toBe(false);
  });

  it("finds the winner and the MVP", () => {
    const p = party({pool: ["bx", "sp"]});
    const a = drawLeg(p, 0)!;
    a.lineup = [0, 0];
    applyLeg(p, row({pts: [5, 10]}));
    const b = drawLeg(p, 0)!;
    b.lineup = [1, 1];
    applyLeg(p, row({times: [12.1, 11.9]}));
    expect(p.totals).toEqual([0, 3]);
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
    expect(validateParty({...p, v: 2})).toBeNull();
    expect(validateParty({...p, teams: []})).toBeNull();
    expect(validateParty({...p, phase: "nope"})).toBeNull();
  });

  it("back-fills characters in an older saved party", () => {
    const p = party();
    const old = JSON.parse(JSON.stringify(p)) as any;
    for (const team of old.teams) for (const pl of team.players) delete pl.char;
    const fixed = validateParty(old)!;
    expect(fixed.teams[0].players[2].char).toBe("p2");
    expect(fixed.teams[1].players[0].char).toBe("p4");
  });
});
