// Party Mode („Vakarėlis“): lobby + randomly drawn legs + team picks. Each leg is a normal game launch;
// the party returns to the lobby between legs, so it can be paused, resumed and played non-stop only if you want.
import "./party.css";
import {S} from "../game/state.ts";
import {startFlow, resetGame} from "../game/game.ts";
import {SPRINT} from "../sprint/sprint.ts";
import {BOXING} from "../boxing/boxing.ts";
import {LONGJUMP} from "../longjump/longjump.ts";
import {WALL} from "../wall/wall.ts";
import {EX} from "../detect/exercises.ts";
import {loadHist, saveHist} from "../history/history.ts";
import {cachedNick} from "../online/api.ts";
import {onView, go, home} from "../ui/router.ts";
import {$, toast} from "../ui/dom.ts";
import {icon} from "../ui/icons.ts";
import {avatar} from "../ui/mascots.ts";
import {t, tn, dec, type Key} from "../i18n/i18n.ts";
import {screenPhase} from "../cast/cast.ts";
import {
  PARTY_GAMES, PARTY_CHAR_IDS, partyGame, createParty, drawLeg, applyLeg, winnerTeam, mvpOf, validateParty,
  type PartyState, type PartyLeg, type PartySetup, type PartyPlayer, type Team,
} from "./logic.ts";
import {partyAvatar, partyCharName} from "./avatars.ts";
import {setPartyActive, setPartySink} from "./bus.ts";

const KEY = "novacore.party";
const A = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const allPool = () => new Set(PARTY_GAMES.map(g => g.id));
const gameTitle = (id: string) => {
  const g = partyGame(id);
  return g ? t(g.titleKey as Key) : id;
};
const avatarOf = (team: Team) => avatar(team ? "b" : "r");
const charOf = (pl: PartyPlayer | undefined, team: Team, index: number) =>
  pl?.char || PARTY_CHAR_IDS[(team * 4 + index) % PARTY_CHAR_IDS.length];
const playerAvatar = (pl: PartyPlayer | undefined, team: Team, index: number) => partyAvatar(charOf(pl, team, index), team);

interface SetupState {
  teams: [string, string];
  rosters: [string[], string[]];
  mode: "all" | "target";
  target: number;
  scoring: "weighted" | "simple";
  pool: Set<string>;
}
function defaultSetup(): SetupState {
  return {
    teams: [t("party.teamA"), t("party.teamB")],
    rosters: [[cachedNick() || "", "", ""], ["", "", ""]],
    mode: "all",
    target: 5,
    scoring: "weighted",
    pool: allPool(),
  };
}

function loadParty(): PartyState | null {
  try { return validateParty(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { return null; }
}
let P: PartyState | null = loadParty();
let setup: SetupState = defaultSetup();
let gameActive = false;
let resultOpen = false;
let finishArmed = 0;
let newArmed = 0;

// ---------- screens ----------
const app = document.getElementById("app") ?? document.body;
app.insertAdjacentHTML("beforeend", `
<section class="screen app hide" id="party" aria-labelledby="partyTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in">
      <a class="icon-btn sq tap" href="#/" data-back aria-label="${t("app.back")}"><span data-icon="chevron-left"></span></a>
      <h1 class="nav-title" id="partyTitle" tabindex="-1">${t("party.title")}</h1>
    </div></header>
    <section id="partySetup" class="party-setup"></section>
    <section id="partyLobby" class="party-lobby hide"></section>
    <section id="partyFinal" class="party-final hide"></section>
  </div>
  <div class="party-modal hide" id="partyDraw" role="dialog" aria-modal="true" aria-labelledby="partyDrawTitle">
    <div class="party-draw-card">
      <p class="eyebrow" id="partyDrawTitle">${t("party.drawTitle")}</p>
      <div class="party-draw-grid" id="partyDrawGrid"></div>
    </div>
  </div>
  <div class="party-modal hide" id="partySheet" role="dialog" aria-modal="true" aria-labelledby="partySheetTitle">
    <div class="party-sheet-card" id="partySheetBody"></div>
  </div>
</section>`);

document.body.insertAdjacentHTML("beforeend", `
<div class="party-modal party-result hide" id="partyResult" role="dialog" aria-modal="true" aria-labelledby="partyResTitle">
  <div class="party-result-card">
    <p class="eyebrow" id="partyResGame"></p>
    <h2 class="d" id="partyResTitle"></h2>
    <p class="party-res-sub" id="partyResSub"></p>
    <div class="party-res-players" id="partyResPlayers"></div>
    <div class="party-res-score" id="partyResScore"></div>
    <button class="go tap" id="partyResBtn" type="button"></button>
  </div>
</div>`);

const resultEl = $<HTMLElement>("#partyResult");
$("#partyResBtn").onclick = () => returnToLobby();

// Home entry card (after the slide-to-play button; it is not a .sp-tile, so games() will not move it).
const homeCard = document.createElement("a");
homeCard.id = "partyHome";
homeCard.className = "party-home tap";
homeCard.href = "#/vakarelis";
homeCard.innerHTML = `<span class="party-home-art" aria-hidden="true">${partyAvatar("p0", 0)}${partyAvatar("p5", 1)}<i class="party-spark s1">${icon("sparkle")}</i><i class="party-spark s2">${icon("sparkle")}</i></span>
  <span class="party-home-txt"><small class="eyebrow">${t("party.tagline")}</small><b class="d">${t("party.title")}</b><span id="partyHomeSub"></span></span>
  <span class="party-home-ic" aria-hidden="true">
    <span class="party-orbit"><span class="party-orbit-i o1">${icon("sport-sp")}</span><span class="party-orbit-i o2">${icon("sport-bx")}</span><span class="party-orbit-i o3">${icon("sport-lj")}</span></span>
    <span class="party-medal">${icon("trophy")}</span>
    <i class="party-sparkle">${icon("sparkle")}</i>
  </span>`;
$("#homePlay")?.after(homeCard);

// Small Rungtys banner after the filters (outside #games, which home.ts replaces on every render).
const rungtysBanner = document.createElement("a");
rungtysBanner.className = "party-banner tap";
rungtysBanner.href = "#/vakarelis";
rungtysBanner.innerHTML = `<span class="party-banner-txt"><b class="d">${t("party.title")}</b><small>${t("party.tagline")}</small></span><span class="party-banner-ic" aria-hidden="true">${icon("trophy")}<i class="party-banner-spark">${icon("sparkle")}</i></span>`;
$("#gamesFilter")?.insertAdjacentElement("afterend", rungtysBanner);

function saveParty() {
  try {
    if (P) localStorage.setItem(KEY, JSON.stringify(P));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the party still works in memory */ }
  renderHomeCard();
}
function renderHomeCard() {
  const sub = $("#partyHomeSub");
  if (!sub) return;
  if (P && P.phase !== "done") {
    sub.textContent = `${t("party.active")} · ${P.teams[0].name} ${P.totals[0]} : ${P.totals[1]} ${P.teams[1].name}`;
  } else sub.textContent = t("party.homeSub");
}

// ---------- setup ----------
function teamCard(team: Team) {
  const roster = setup.rosters[team];
  return `<div class="party-team t${team}">
    <label class="party-team-name"><span class="eyebrow">${team ? t("party.teamB") : t("party.teamA")}</span>
      <input data-tname="${team}" maxlength="16" value="${A(setup.teams[team])}" aria-label="${t("party.teamName")}">
    </label>
    <div class="party-roster">
      ${roster.map((name, i) => {
        const charId = PARTY_CHAR_IDS[(team * 4 + i) % PARTY_CHAR_IDS.length];
        const charName = partyCharName(charId);
        return `<div class="party-row">
        <span class="party-row-av" aria-hidden="true">${partyAvatar(charId, team)}</span>
        <input data-pname="${team}:${i}" maxlength="14" value="${A(name)}" placeholder="${A(charName)}" aria-label="${A(charName)}">
        <button class="icon-btn sq tap" type="button" data-remove="${team}" data-i="${i}" aria-label="${t("party.removePlayer")}" ${roster.length <= 1 ? "disabled" : ""}>${icon("x")}</button>
      </div>`;
      }).join("")}
    </div>
    <button class="btn sm tap" type="button" data-add="${team}" ${roster.length >= 4 ? "disabled" : ""}>${t("party.addPlayer")}</button>
  </div>`;
}

function renderSetup() {
  $("#partyLobby").classList.add("hide");
  $("#partyFinal").classList.add("hide");
  const root = $("#partySetup");
  root.classList.remove("hide");
  root.innerHTML = `
    <section class="party-hero">
      <span class="party-hero-art" aria-hidden="true">${["p0", "p2", "p4", "p6"].map((id, i) => partyAvatar(id, (i % 2) as Team)).join("")}</span>
      <p class="eyebrow">${t("party.tagline")}</p>
      <h2 class="d">${t("party.title")}</h2>
      <p class="party-lead">${t("party.setupLead")}</p>
    </section>
    <section class="party-teams" aria-label="${t("party.teams")}">${teamCard(0)}${teamCard(1)}</section>
    <section class="party-field">
      <h2 class="eyebrow">${t("party.mode")}</h2>
      <div class="seg party-seg" role="group" aria-label="${t("party.mode")}">
        <button type="button" data-mode="all" class="${setup.mode === "all" ? "on" : ""}" aria-pressed="${setup.mode === "all"}"><b class="d">${t("party.modeAll")}</b><small>${t("party.modeAllSub")}</small></button>
        <button type="button" data-mode="target" class="${setup.mode === "target" ? "on" : ""}" aria-pressed="${setup.mode === "target"}"><b class="d">${t("party.modeTarget")}</b><small>${t("party.modeTargetSub")}</small></button>
      </div>
    </section>
    <section class="party-field">
      <h2 class="eyebrow">${t("party.scoring")}</h2>
      <div class="seg party-seg" role="group" aria-label="${t("party.scoring")}">
        <button type="button" data-scoring="weighted" class="${setup.scoring === "weighted" ? "on" : ""}" aria-pressed="${setup.scoring === "weighted"}"><b class="d">${t("party.scoringW")}</b></button>
        <button type="button" data-scoring="simple" class="${setup.scoring === "simple" ? "on" : ""}" aria-pressed="${setup.scoring === "simple"}"><b class="d">${t("party.scoringS")}</b></button>
      </div>
      <p class="help">${t("party.scoringHint")}</p>
    </section>
    <section class="party-field">
      <h2 class="eyebrow">${t("party.pool")}</h2>
      <div class="party-pool">${PARTY_GAMES.map(g => `<button class="party-chip${setup.pool.has(g.id) ? " on" : ""}" type="button" data-pool="${g.id}" aria-pressed="${setup.pool.has(g.id)}">${icon(g.sport)}<span>${t(g.titleKey as Key)}</span></button>`).join("")}</div>
      <p class="help">${t("party.poolHint")}</p>
    </section>
    <section class="party-how">
      <h2 class="eyebrow">${t("party.how")}</h2>
      <ol><li>${t("party.how1")}</li><li>${t("party.how2")}</li><li>${t("party.how3")}</li></ol>
    </section>
    <p class="party-note" id="partyNote" aria-live="polite"></p>
    <div class="cta"><button class="go tap party-rainbow-go" id="partyStart" type="button"><span class="party-start-ic" aria-hidden="true">${icon("sparkle")}</span>${t("party.start")}</button></div>`;

  root.querySelectorAll<HTMLInputElement>("[data-tname]").forEach(el => {
    el.oninput = () => { setup.teams[Number(el.dataset.tname)] = el.value; };
  });
  root.querySelectorAll<HTMLInputElement>("[data-pname]").forEach(el => {
    const [team, i] = el.dataset.pname!.split(":").map(Number);
    el.oninput = () => { setup.rosters[team][i] = el.value; };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-add]").forEach(b => {
    b.onclick = () => { const team = Number(b.dataset.add); if (setup.rosters[team].length < 4) { setup.rosters[team].push(""); renderSetup(); } };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach(b => {
    b.onclick = () => {
      const team = Number(b.dataset.remove), i = Number(b.dataset.i);
      if (setup.rosters[team].length > 1) { setup.rosters[team].splice(i, 1); renderSetup(); }
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => {
    b.onclick = () => { setup.mode = b.dataset.mode === "target" ? "target" : "all"; renderSetup(); };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-scoring]").forEach(b => {
    b.onclick = () => { setup.scoring = b.dataset.scoring === "simple" ? "simple" : "weighted"; renderSetup(); };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-pool]").forEach(b => {
    b.onclick = () => {
      const id = b.dataset.pool!;
      if (setup.pool.has(id)) setup.pool.delete(id); else setup.pool.add(id);
      b.classList.toggle("on", setup.pool.has(id));
      b.setAttribute("aria-pressed", String(setup.pool.has(id)));
    };
  });
  $("#partyStart").onclick = startSetup;
}

function startSetup() {
  const note = $("#partyNote");
  if (setup.pool.size < 1) { note.textContent = t("party.needPool"); return; }
  if (!setup.rosters[0].length || !setup.rosters[1].length) { note.textContent = t("party.needTeam"); return; }
  const defaultName = (team: Team, i: number) => partyCharName(PARTY_CHAR_IDS[(team * 4 + i) % PARTY_CHAR_IDS.length]);
  const players: [string[], string[]] = [
    setup.rosters[0].map((n, i) => n.trim() || defaultName(0, i)),
    setup.rosters[1].map((n, i) => n.trim() || defaultName(1, i)),
  ];
  const id = (globalThis.crypto as any)?.randomUUID?.() || "p-" + Date.now().toString(36);
  P = createParty({
    teams: [setup.teams[0].trim() || t("party.teamA"), setup.teams[1].trim() || t("party.teamB")],
    players,
    mode: setup.mode,
    target: 5,
    scoring: setup.scoring,
    pool: PARTY_GAMES.map(g => g.id).filter(id => setup.pool.has(id)),
  }, Date.now(), id, Math.random() < 0.5 ? 0 : 1);
  saveParty();
  renderLobby();
}

// ---------- lobby ----------
function scoreTeam(team: Team) {
  return `<div class="party-score-team t${team}"><span class="party-score-av" aria-hidden="true">${avatarOf(team)}</span><span class="party-score-name">${A(P!.teams[team].name)}</span><b class="d">${P!.totals[team]}</b></div>`;
}
function rosterCard(team: Team) {
  return `<div class="party-roster-card t${team}"><p class="eyebrow">${A(P!.teams[team].name)}</p><ul>${P!.teams[team].players.map((pl, i) => `<li><span aria-hidden="true">${playerAvatar(pl, team, i)}</span><b>${A(pl.name)}</b><small>${t("party.playedN", {n: pl.legs})}</small></li>`).join("")}</ul></div>`;
}
function legRow(leg: PartyLeg) {
  const a = P!.teams[0].players[leg.lineup[0]]?.name ?? "–";
  const b = P!.teams[1].players[leg.lineup[1]]?.name ?? "–";
  const winner = leg.winner === -1 ? t("party.tie") : P!.teams[leg.winner as Team].name;
  return `<li class="party-leg"><span class="party-leg-ic" aria-hidden="true">${icon(partyGame(leg.game)?.sport ?? "")}</span><span class="party-leg-txt"><b>${gameTitle(leg.game)}</b><small>${A(a)} · ${A(b)}</small></span><span class="party-leg-pts"><b>${t("party.points", {n: leg.points})}</b><small>${A(winner)}</small></span></li>`;
}
function renderLobby() {
  if (!P) { renderSetup(); return; }
  if (P.phase === "done") { renderFinal(); return; }
  $("#partySetup").classList.add("hide");
  $("#partyFinal").classList.add("hide");
  const root = $("#partyLobby");
  root.classList.remove("hide");
  const left = tn("party.left", P.pool.length);
  const interrupted = P.phase === "playing";
  root.innerHTML = `
    <section class="party-score">${scoreTeam(0)}<div class="party-score-mid"><span class="eyebrow">${P.mode === "target" ? t("party.until", {n: P.target}) : left}</span><b class="d">:</b></div>${scoreTeam(1)}</section>
    <section class="party-rosters">${rosterCard(0)}${rosterCard(1)}</section>
    <section class="party-block">
      <h2 class="eyebrow">${t("party.played")}</h2>
      ${P.legs.length ? `<ul class="party-legs">${[...P.legs].reverse().map(legRow).join("")}</ul>` : `<p class="help">${t("party.noLegs")}</p>`}
    </section>
    <section class="party-block">
      <h2 class="eyebrow">${t("party.remaining")}</h2>
      <div class="party-pool small">${P.pool.map(id => { const g = partyGame(id)!; return `<span class="party-chip on">${icon(g.sport)}<span>${t(g.titleKey as Key)}</span></span>`; }).join("") || `<span class="help">${t("party.noLegs")}</span>`}</div>
    </section>
    ${interrupted ? `<section class="party-interrupted"><b>${t("party.interrupted")}</b><small>${gameTitle(P.current?.game ?? "")}</small></section>` : ""}
    <div class="party-actions">
      ${interrupted
        ? `<button class="go tap" id="partyReplay" type="button">${t("party.replayLeg")}</button><button class="btn tap" id="partyCancelLeg" type="button">${t("party.cancelLeg")}</button>`
        : P.current
          ? `<button class="go tap" id="partyContinue" type="button">${t("party.resumeLeg")}</button><button class="btn tap" id="partyCancelLeg" type="button">${t("party.cancel")}</button>`
          : `<button class="go tap party-rainbow-go" id="partyDrawBtn" type="button"><span class="party-start-ic" aria-hidden="true">${icon("sparkle")}</span>${t("party.draw")}</button>`}
    </div>
    <div class="party-foot">
      ${P.legs.length ? `<button class="btn sm tap" id="partyFinish" type="button">${t("party.finish")}</button>` : ""}
      <button class="btn sm tap" id="partyNew" type="button">${t("party.new")}</button>
    </div>`;

  $("#partyDrawBtn")?.addEventListener("click", startDraw);
  $("#partyContinue")?.addEventListener("click", openSheet);
  $("#partyReplay")?.addEventListener("click", () => { if (P?.current && P.current.lineup.every(i => i >= 0)) startLeg(); else openSheet(); });
  $("#partyCancelLeg")?.addEventListener("click", cancelCurrent);
  $("#partyFinish")?.addEventListener("click", finishParty);
  $("#partyNew")?.addEventListener("click", () => resetParty($("#partyNew")));
}

function startDraw() {
  if (!P || P.current) return;
  const before = [...P.pool];
  const leg = drawLeg(P);
  if (!leg) { P.phase = "done"; saveParty(); renderFinal(); return; }
  saveParty();
  const grid = $("#partyDrawGrid");
  grid.innerHTML = before.map(id => {
    const g = partyGame(id)!;
    return `<span class="party-draw-cell" data-game="${id}">${icon(g.sport)}<b>${t(g.titleKey as Key)}</b></span>`;
  }).join("");
  $("#partyDraw").classList.remove("hide");
  const cells = [...grid.children] as HTMLElement[];
  let i = 0;
  const timer = setInterval(() => {
    cells.forEach(c => c.classList.remove("on"));
    cells[i % cells.length]?.classList.add("on");
    i++;
  }, 80);
  setTimeout(() => {
    clearInterval(timer);
    cells.forEach(c => c.classList.toggle("on", c.dataset.game === leg.game));
    setTimeout(() => { $("#partyDraw").classList.add("hide"); openSheet(); }, 450);
  }, 1100);
}

function pickColumn(team: Team) {
  const leg = P!.current!;
  const solo = leg.format === "solo";
  const starter = solo && leg.starter === team;
  return `<div class="party-pick-col t${team}${starter ? " starter" : ""}">
    <div class="party-pick-head"><span class="party-pick-av" aria-hidden="true">${avatarOf(team)}</span><b>${A(P!.teams[team].name)}</b>${solo ? `<small>${starter ? t("party.starts", {team: A(P!.teams[team].name)}) : t("party.second", {team: A(P!.teams[team].name)})}</small>` : ""}</div>
    <div class="party-pick-list">${P!.teams[team].players.map((pl, i) => `<button class="party-player${leg.lineup[team] === i ? " on" : ""}" type="button" data-pick="${team}" data-i="${i}"><span class="party-player-av" aria-hidden="true">${playerAvatar(pl, team, i)}</span><b>${A(pl.name)}</b><small>${t("party.playedN", {n: pl.legs})}</small></button>`).join("")}</div>
  </div>`;
}
function renderSheet() {
  if (!P?.current) return;
  const leg = P.current;
  const g = partyGame(leg.game)!;
  const can = leg.lineup.every((v, team) => v >= 0 && !!P!.teams[team].players[v]);
  $("#partySheetBody").innerHTML = `
    <button class="icon-btn sq tap party-sheet-x" id="partySheetX" type="button" aria-label="${t("app.close")}">${icon("x")}</button>
    <p class="eyebrow">${t("party.legN", {n: P.legs.length + 1})}</p>
    <h2 class="d" id="partySheetTitle">${t(g.titleKey as Key)}</h2>
    <p class="party-sheet-sub">${t("party.points", {n: leg.points})} · ${leg.format === "duo" ? t("party.duo") : t("party.solo")}</p>
    <p class="party-sheet-how">${t(g.howKey as Key)}</p>
    <div class="party-pick">${pickColumn(0)}${pickColumn(1)}</div>
    <p class="help">${t("party.who")}</p>
    <button class="go tap" id="partyLegGo" type="button" ${can ? "" : "disabled"}>${t("party.startLeg")}</button>`;
  $("#partySheetX").onclick = cancelCurrent;
  $("#partySheetBody").querySelectorAll<HTMLButtonElement>("[data-pick]").forEach(b => {
    b.onclick = () => {
      const team = Number(b.dataset.pick) as Team, i = Number(b.dataset.i);
      leg.lineup[team] = i;
      saveParty();
      renderSheet();
    };
  });
  $("#partyLegGo").onclick = () => { if (can) startLeg(); };
}
function openSheet() {
  if (!P?.current) return;
  renderSheet();
  $("#partySheet").classList.remove("hide");
}
function cancelCurrent() {
  if (!P?.current) return;
  $("#partySheet").classList.add("hide");
  P.pool.push(P.current.game);
  P.current = null;
  P.phase = "lobby";
  saveParty();
  renderLobby();
}

// ---------- start a leg ----------
function startLeg() {
  if (!P?.current) return;
  const leg = P.current;
  const a = P.teams[0].players[leg.lineup[0]];
  const b = P.teams[1].players[leg.lineup[1]];
  if (!a || !b) return;
  const gameA = leg.format === "solo" && leg.starter === 1 ? b : a;
  const gameB = leg.format === "solo" && leg.starter === 1 ? a : b;
  const cfg = {
    game: leg.game,
    format: leg.format,
    starter: leg.starter,
    names: [gameA.name, gameB.name] as [string, string],
    teamNames: [P.teams[0].name, P.teams[1].name] as [string, string],
  };
  if (gameActive) cleanupGame();
  P.phase = "playing";
  saveParty();
  $("#partySheet").classList.add("hide");
  $("#partyDraw").classList.add("hide");
  gameActive = true;
  setPartyActive(true);
  setPartySink(onLegDone);
  // reset the shared game state before every leg
  S.st = [{}, {}] as typeof S.st;
  S.score = [0, 0];
  S.scoreEvents = [];
  S.lastPointAt = [0, 0];
  S.fl = [0, 0];
  S.running = false;
  S.rec = null;
  S.players = leg.format === "duo" ? 2 : 1;
  if (leg.game === "rr") {
    S.duration = 60;
    S.players = 2;
    S.activeEX = EX.filter(e => ["squat", "jack", "knees", "sidestep"].includes(e.id));
    startFlow();
  } else if (leg.game === "sp") {
    SPRINT.party?.(cfg);
    startFlow(SPRINT);
  } else if (leg.game === "bx") {
    BOXING.party?.(cfg);
    startFlow(BOXING);
  } else if (leg.game === "lj") {
    LONGJUMP.party?.(cfg);
    startFlow(LONGJUMP);
  } else if (leg.game === "wl") {
    WALL.party?.(cfg);
    startFlow(WALL);
  } else {
    cleanupGame();
    toast(t("party.needPool"));
  }
}

function valueLabel(leg: PartyLeg, team: Team) {
  const v = leg.values[team];
  if (v == null) return leg.kind === "metres" ? "X" : "–";
  if (leg.kind === "seconds") return t("party.seconds", {n: dec(v, 2)});
  if (leg.kind === "metres") return t("party.metres", {n: dec(v, 2)});
  if (leg.kind === "walls") return tn("party.walls", v);
  return t("party.points", {n: v});
}

function onLegDone() {
  if (!P?.current) { setPartyActive(false); return; }
  const row = loadHist()[0];
  if (!row) {
    setPartyActive(false);
    cleanupGame();
    history.back();
    return;
  }
  const leg = applyLeg(P, row);
  if (!leg) { setPartyActive(false); return; }
  const h = loadHist();
  if (h[0]) {
    h[0].party = {
      id: P.id,
      game: leg.game,
      points: leg.points,
      lineup: leg.lineup,
      starter: leg.starter,
      winner: (leg.winner ?? -1) as 0 | 1 | -1,
      pts: leg.pts,
    };
    saveHist(h);
  }
  saveParty();
  showResult(leg);
}

function showResult(leg: PartyLeg) {
  const w = leg.winner;
  const game = partyGame(leg.game)!;
  $("#partyResGame").textContent = `${t(game.titleKey as Key)} · ${t("party.legN", {n: P!.legs.length})}`;
  $("#partyResTitle").textContent = w === -1 ? t("party.tie") : t("party.take", {team: P!.teams[w as Team].name, n: leg.points});
  $("#partyResSub").textContent = w === -1 ? t("party.tiePts") : `${valueLabel(leg, 0)} : ${valueLabel(leg, 1)}`;
  $("#partyResPlayers").innerHTML = [0, 1].map(t => {
    const team = t as Team, idx = leg.lineup[team], pl = P!.teams[team].players[idx];
    return `<span class="t${team}">${playerAvatar(pl, team, idx)}<b>${A(pl?.name ?? "")}</b></span>`;
  }).join("<i>vs</i>");
  $("#partyResScore").innerHTML = `<span class="t0"><small>${A(P!.teams[0].name)}</small><b class="d">${P!.totals[0]}</b></span><i>:</i><span class="t1"><small>${A(P!.teams[1].name)}</small><b class="d">${P!.totals[1]}</b></span>`;
  $("#partyResBtn").textContent = P!.phase === "done" ? t("party.toFinal") : t("party.backToParty");
  resultEl.classList.remove("hide");
  resultOpen = true;
}

function cleanupGame() {
  if (!gameActive) return;
  gameActive = false;
  try { resetGame(); } catch (e) { console.error("Party cleanup:", e); }
  document.body.classList.remove("ingame", "playing");
  try { screenPhase("idle"); } catch { /* TV optional */ }
  setPartyActive(false);
}

function returnToLobby() {
  resultOpen = false;
  resultEl.classList.add("hide");
  cleanupGame();
  history.back();
  // fallback if the history entry is not the party (e.g. a deep link)
  setTimeout(() => {
    if (location.hash.startsWith("#/zaidimas")) go("#/vakarelis", true);
  }, 300);
}

// ---------- finish / new / final ----------
function finishParty() {
  if (!P) return;
  if (!finishArmed) {
    finishArmed = Date.now();
    const b = $("#partyFinish");
    if (b) b.textContent = t("party.finishSure");
    setTimeout(() => {
      finishArmed = 0;
      const x = $("#partyFinish");
      if (x) x.textContent = t("party.finish");
    }, 3000);
    return;
  }
  finishArmed = 0;
  P.phase = "done";
  saveParty();
  renderFinal();
}

function resetParty(btn?: HTMLElement) {
  if (!P) { renderSetup(); return; }
  if (!newArmed) {
    newArmed = Date.now();
    const b = btn ?? $("#partyNew");
    if (b) b.textContent = t("party.newSure");
    setTimeout(() => {
      newArmed = 0;
      if (b) b.textContent = t("party.new");
    }, 3000);
    return;
  }
  newArmed = 0;
  P = null;
  saveParty();
  setup = defaultSetup();
  renderSetup();
}

function renderFinal() {
  if (!P) { renderSetup(); return; }
  $("#partySetup").classList.add("hide");
  $("#partyLobby").classList.add("hide");
  const root = $("#partyFinal");
  root.classList.remove("hide");
  const w = winnerTeam(P);
  const mvp = mvpOf(P);
  const mvpPlayer = mvp ? P.teams[mvp.team].players[mvp.index] : undefined;
  root.innerHTML = `
    <section class="party-final-hero t${w < 0 ? "tie" : w}">
      <p class="eyebrow">${t("party.final")}</p>
      <h2 class="d">${w < 0 ? t("party.tieTitle") : t("party.champions", {team: A(P.teams[w as Team].name)})}</h2>
      <div class="party-final-score"><span>${A(P.teams[0].name)} <b class="d">${P.totals[0]}</b></span><i>:</i><span>${A(P.teams[1].name)} <b class="d">${P.totals[1]}</b></span></div>
      ${mvp ? `<p class="party-mvp">${mvpPlayer ? `<span class="party-mvp-av" aria-hidden="true">${playerAvatar(mvpPlayer, mvp.team, mvp.index)}</span>` : ""}${t("party.mvp", {name: A(mvp.name)})}</p>` : ""}
    </section>
    <section class="party-block">
      <h2 class="eyebrow">${t("party.legs")}</h2>
      <ul class="party-legs">${P.legs.map(legRow).join("")}</ul>
    </section>
    <div class="party-actions">
      <button class="go tap" id="partyRematch" type="button">${t("party.rematch")}</button>
      <button class="btn tap" id="partyNew2" type="button">${t("party.new")}</button>
      <button class="btn tap" id="partyHome2" type="button">${t("party.home")}</button>
    </div>`;
  $("#partyRematch").onclick = () => {
    if (!P) return;
    const id = (globalThis.crypto as any)?.randomUUID?.() || "p-" + Date.now().toString(36);
    P = createParty({
      teams: [P.teams[0].name, P.teams[1].name],
      players: [P.teams[0].players.map(p => p.name), P.teams[1].players.map(p => p.name)],
      mode: P.mode,
      target: P.target,
      scoring: P.scoring,
      pool: [...P.poolAll],
    }, Date.now(), id, Math.random() < 0.5 ? 0 : 1);
    saveParty();
    renderLobby();
  };
  $("#partyNew2").onclick = () => resetParty($("#partyNew2"));
  $("#partyHome2").onclick = () => home();
}

// ---------- view ----------
onView("party", () => {
  if (resultOpen) { resultOpen = false; resultEl.classList.add("hide"); }
  if (gameActive) cleanupGame();
  if (P?.phase === "done") renderFinal();
  else if (P) renderLobby();
  else renderSetup();
});

renderHomeCard();
