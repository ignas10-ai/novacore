// Party Mode („Vakarėlis“): disco intro, automatic draws, a best-of-3 series per game. Players are not
// picked in the app — whoever wants stands in front of the camera, and the arms-up gate gives everyone time.
import "./party.css";
import {S} from "../game/state.ts";
import {startFlow, resetGame} from "../game/game.ts";
import {SPRINT} from "../sprint/sprint.ts";
import {BOXING} from "../boxing/boxing.ts";
import {LONGJUMP} from "../longjump/longjump.ts";
import {HURDLES_MODE} from "../hurdles/hurdles.ts";
import {BOWLING} from "../bowling/bowling.ts";
import {SKI} from "../ski/ski.ts";
import {WALL} from "../wall/wall.ts";
import {BADMINTON} from "../badminton/badminton.ts";
import {JAVELIN} from "../javelin/javelin.ts";
import {EX} from "../detect/exercises.ts";
import {loadHist, saveHist} from "../history/history.ts";
import {onView, go, home} from "../ui/router.ts";
import {$, toast} from "../ui/dom.ts";
import {icon, fillIcons} from "../ui/icons.ts";
import {baseAvatar, setAvatarPair} from "../ui/mascots.ts";
import {GAME} from "../ui/chars.ts";
import {gallery, initGallery} from "../ui/gallery.ts";
import {slide} from "../ui/slide.ts";
import {t, tn, dec, type Key} from "../i18n/i18n.ts";
import {screenPhase, setCam, setMirror} from "../cast/cast.ts";
import {
  PARTY_GAMES, CORE_GAMES, BETA_GAMES, partyGame, createParty, drawLeg, applyRound, winnerTeam, validateParty,
  type PartyState, type PartyLeg, type RoundResult, type Team,
} from "./logic.ts";
import {setPartyActive, setPartySink} from "./bus.ts";
import {stopPartyMusic, partyMusicOn, setPartyMusicOn} from "./music.ts";

const KEY = "novacore.party";
const A = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtPts = (n: number) => Number.isInteger(n) ? String(n) : dec(n, 1);
const pointsLabel = (n: number) => t(n === 1 ? "party.point" : "party.points", {n: fmtPts(n)});
const gameColor = (id: string) => GAME[id]?.color ?? "#FFC61A";
const gameTitle = (id: string) => {
  const g = partyGame(id);
  return g ? t(g.titleKey as Key) : id;
};
const avatarOf = (team: Team) => baseAvatar(team ? "b" : "r");

interface SetupState {
  teams: [string, string];
  mode: "all" | "target";
  beta: boolean;
  pool: Set<string>;
}
function defaultSetup(): SetupState {
  return {
    teams: [t("party.teamA"), t("party.teamB")],
    mode: "all",
    beta: false,
    pool: new Set(CORE_GAMES),
  };
}

function loadParty(): PartyState | null {
  try { return validateParty(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { return null; }
}
let P: PartyState | null = loadParty();
let setup: SetupState = defaultSetup();
let gameActive = false;
let resultOpen = false;
let resultMode: "round" | "series" | null = null;
let partyMirror = true;
let introTimer = 0, vsTimer = 0, nextTimer = 0, resultTimer = 0;
let introGen = 0, vsGen = 0, drawGen = 0;
let finishArmed = 0, newArmed = 0;

// Which phone canvas the TV should mirror for each game (boxing/wall draw their overlay over the camera).
const MIRROR: Record<string, {base: string; overlay?: string}> = {
  rr: {base: "cv"},
  sp: {base: "spCv"},
  bx: {base: "cv", overlay: "bxCv"},
  lj: {base: "ljCv"},
  hd: {base: "hdCv"},
  bw: {base: "bwCv"},
  sk: {base: "skCv"},
  wl: {base: "cv", overlay: "wlCv"},
  bd: {base: "bdCv"},
  jv: {base: "jvCv"},
};

// ---------- screens ----------
const app = document.getElementById("app") ?? document.body;
app.insertAdjacentHTML("beforeend", `
<section class="screen app hide" id="party" aria-labelledby="partyTitle">
  <div class="wrap">
    <header class="nav inline"><div class="nav-in">
      <a class="icon-btn sq tap" href="#/" data-back aria-label="${t("app.back")}"><span data-icon="chevron-left"></span></a>
      <h1 class="nav-title" id="partyTitle" tabindex="-1">${t("party.title")}</h1>
      <button class="icon-btn tap" data-tv type="button" aria-label="${t("home.cast")}" aria-haspopup="dialog" aria-controls="screenSheet"><span data-icon="cast"></span></button>
    </div></header>
    <section id="partySetup" class="party-setup"></section>
    <section id="partyLobby" class="party-lobby hide"></section>
    <section id="partyFinal" class="party-final hide"></section>
  </div>
  <div class="party-modal hide" id="partyIntro" role="dialog" aria-modal="true" aria-labelledby="partyIntroTitle">
    <div class="party-intro-card" id="partyIntroCard"></div>
  </div>
  <div class="party-modal hide" id="partyVs" role="dialog" aria-modal="true" aria-labelledby="partyVsTitle">
    <div class="party-vs-card" id="partyVsCard"></div>
  </div>
  <div class="party-modal hide" id="partyDraw" role="dialog" aria-modal="true" aria-labelledby="partyDrawTitle">
    <div class="party-draw-card" id="partyDrawStage"></div>
  </div>
</section>`);
fillIcons(app);

document.body.insertAdjacentHTML("beforeend", `
<div class="party-modal party-result hide" id="partyResult" role="dialog" aria-modal="true" aria-labelledby="partyResTitle">
  <div class="party-result-card">
    <p class="eyebrow" id="partyResGame"></p>
    <h2 class="d" id="partyResTitle"></h2>
    <p class="party-res-sub" id="partyResSub"></p>
    <div class="party-res-players" id="partyResPlayers"></div>
    <div class="party-res-score" id="partyResScore"></div>
    <div class="party-res-auto"><i></i></div>
    <button class="go tap" id="partyResBtn" type="button"></button>
  </div>
</div>`);

const resultEl = $<HTMLElement>("#partyResult");
$("#partyResBtn").onclick = () => resultAction();

// Party entry: one big rainbow mode row at the top of the Rungtys sport shelf (not on Pradžia).
const catalogCard = document.createElement("a");
catalogCard.id = "partyGame";
catalogCard.className = "game-row party-game-row tap";
catalogCard.href = "#/vakarelis";
catalogCard.innerHTML = `<span class="party-game-art" aria-hidden="true">
    <span class="party-game-medal"><span class="party-orbit"><span class="party-orbit-i o1">${icon("sport-sp")}</span><span class="party-orbit-i o2">${icon("sport-bx")}</span><span class="party-orbit-i o3">${icon("sport-lj")}</span><span class="party-orbit-i o4">${icon("sport-sk")}</span></span><span class="party-medal">${icon("trophy")}</span><i class="party-sparkle">${icon("sparkle")}</i></span>
    <i class="party-spark s1">${icon("sparkle")}</i><i class="party-spark s2">${icon("sparkle")}</i>
  </span>
  <span class="sp-tile-txt"><b class="d">${t("party.modeTitle")}</b></span>
  <span class="game-arrow" aria-hidden="true">${icon("arrow-up-right")}</span>`;
$("#games")?.prepend(catalogCard);

function saveParty() {
  try {
    if (P) localStorage.setItem(KEY, JSON.stringify(P));
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}

// ---------- setup ----------
function teamCard(team: Team) {
  return `<div class="party-team t${team}">
    <div class="party-team-head">
      <span class="party-team-av" aria-hidden="true">${avatarOf(team)}</span>
      <label class="party-team-name"><span class="eyebrow">${team ? t("party.teamB") : t("party.teamA")}</span>
        <input data-tname="${team}" maxlength="16" value="${A(setup.teams[team])}" aria-label="${t("party.teamName")}">
      </label>
    </div>
    <p class="party-team-hint"><span data-icon="users"></span>${t("party.teamHint")}</p>
  </div>`;
}

function renderSetup() {
  $("#party").classList.remove("party-live");
  $("#partyLobby").classList.add("hide");
  $("#partyFinal").classList.add("hide");
  const root = $("#partySetup");
  root.classList.remove("hide");
  const visible = PARTY_GAMES.filter(g => setup.beta || !g.beta);
  root.innerHTML = `
    ${gallery("party", t("party.title").toUpperCase(), t("party.tagline"))}
    <p class="lead party-lead">${t("party.setupLead")}</p>
    <section class="pick" aria-labelledby="partyTeamsLbl">
      <h2 class="eyebrow sec-lbl" id="partyTeamsLbl">${t("party.teams")}</h2>
      <div class="party-teams">${teamCard(0)}${teamCard(1)}</div>
    </section>
    <section class="pick" aria-labelledby="partyModeLbl">
      <h2 class="eyebrow sec-lbl" id="partyModeLbl">${t("party.mode")}</h2>
      <div class="seg party-seg" role="group" aria-label="${t("party.mode")}">
        <button type="button" data-mode="all" class="${setup.mode === "all" ? "on" : ""}" aria-pressed="${setup.mode === "all"}"><b class="d">${t("party.modeAll")}</b><small>${t("party.modeAllSub")}</small></button>
        <button type="button" data-mode="target" class="${setup.mode === "target" ? "on" : ""}" aria-pressed="${setup.mode === "target"}"><b class="d">${t("party.modeTarget")}</b><small>${t("party.modeTargetSub")}</small></button>
      </div>
    </section>
    <section class="pick" aria-labelledby="partyPoolLbl">
      <h2 class="eyebrow sec-lbl" id="partyPoolLbl">${t("party.pool")}</h2>
      <div class="set-row party-beta-row">
        <span class="set-ic" data-icon="sparkle"></span>
        <div class="set-txt"><b>${t("party.beta")}</b><small>${t("party.betaHint")}</small></div>
        <button class="switch" type="button" role="switch" aria-checked="${setup.beta}" data-beta-toggle aria-label="${t("party.beta")}"><i></i></button>
      </div>
      <div class="party-pool">${visible.map(g => `<button class="chip-btn party-pool-chip" type="button" data-pool="${g.id}" data-tone="${g.id}" style="--gc:${gameColor(g.id)}" aria-pressed="${setup.pool.has(g.id)}">${icon(g.sport)}<span>${t(g.titleKey as Key)}</span>${g.beta ? `<span class="beta">${t("u.beta")}</span>` : ""}</button>`).join("")}</div>
      <p class="help">${t("party.poolHint")}</p>
    </section>
    <button class="set-row tap-row tap" data-tv type="button" aria-haspopup="dialog" aria-controls="screenSheet">
      <span class="set-ic" data-icon="tv"></span>
      <div class="set-txt"><b>${t("party.tv")}</b><small>${t("party.tvHint")}</small></div>
      <span class="chev" data-icon="chevron-right"></span>
    </button>
    <div class="set-row">
      <span class="set-ic" data-icon="cast"></span>
      <div class="set-txt"><b>${t("party.mirror")}</b><small>${t("party.mirrorHint")}</small></div>
      <button class="switch" type="button" role="switch" aria-checked="${partyMirror}" data-mirror aria-label="${t("party.mirror")}"><i></i></button>
    </div>
    <div class="set-row">
      <span class="set-ic" data-icon="volume-2"></span>
      <div class="set-txt"><b>${t("party.music")}</b><small>${t("party.musicHint")}</small></div>
      <button class="switch" type="button" role="switch" aria-checked="${partyMusicOn()}" data-music aria-label="${t("party.music")}"><i></i></button>
    </div>
    <p class="party-credit">${t("party.musicCredit")}</p>
    <section class="card party-how">
      <h2 class="card-title">${t("party.how")}</h2>
      <ol><li><span data-icon="trophy"></span><span>${t("party.how1")}</span></li><li><span data-icon="users"></span><span>${t("party.how2")}</span></li><li><span data-icon="medal"></span><span>${t("party.how3")}</span></li></ol>
      <p class="party-points-rule">${t("party.pointsRule")}</p>
    </section>
    <p class="party-note" id="partyNote" aria-live="polite"></p>
    <div class="cta">
      <button class="go tap party-rainbow-go party-slide" id="partyStart" type="button">${t("party.start")}</button>
      <p class="fine">${t("party.fine")}</p>
    </div>`;

  fillIcons(root);
  root.querySelectorAll<HTMLInputElement>("[data-tname]").forEach(el => {
    el.oninput = () => { setup.teams[Number(el.dataset.tname)] = el.value; };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => {
    b.onclick = () => { setup.mode = b.dataset.mode === "target" ? "target" : "all"; renderSetup(); };
  });
  root.querySelector<HTMLButtonElement>("[data-beta-toggle]")!.onclick = () => {
    setup.beta = !setup.beta;
    for (const id of BETA_GAMES) { if (setup.beta) setup.pool.add(id); else setup.pool.delete(id); }
    renderSetup();
  };
  root.querySelectorAll<HTMLButtonElement>("[data-pool]").forEach(b => {
    b.onclick = () => {
      const id = b.dataset.pool!;
      if (setup.pool.has(id)) setup.pool.delete(id); else setup.pool.add(id);
      b.classList.toggle("on", setup.pool.has(id));
      b.setAttribute("aria-pressed", String(setup.pool.has(id)));
    };
  });
  root.querySelector<HTMLButtonElement>("[data-mirror]")!.onclick = (ev) => {
    partyMirror = !partyMirror;
    const b = ev.currentTarget as HTMLButtonElement;
    b.setAttribute("aria-checked", String(partyMirror));
    setCam(partyMirror);
  };
  root.querySelector<HTMLButtonElement>("[data-music]")!.onclick = (ev) => {
    const b = ev.currentTarget as HTMLButtonElement;
    const on = b.getAttribute("aria-checked") !== "true";
    b.setAttribute("aria-checked", String(on));
    setPartyMusicOn(on);
  };
  $("#partyStart").onclick = startSetup;
  slide($<HTMLButtonElement>("#partyStart"));
  const gal = root.querySelector<HTMLElement>(".gal-hero");
  if (gal) initGallery(gal);
}

function startSetup() {
  const note = $("#partyNote");
  if (setup.pool.size < 1) { note.textContent = t("party.needPool"); return; }
  const teamA = setup.teams[0].trim(), teamB = setup.teams[1].trim();
  if (!teamA || !teamB) { note.textContent = t("party.needTeam"); return; }
  const id = (globalThis.crypto as any)?.randomUUID?.() || "p-" + Date.now().toString(36);
  P = createParty({
    teams: [teamA, teamB],
    players: [[teamA], [teamB]],
    mode: setup.mode,
    target: 5,
    pool: PARTY_GAMES.map(g => g.id).filter(x => setup.pool.has(x)),
  }, Date.now(), id, Math.random() < 0.5 ? 0 : 1);
  saveParty();
  showDisco();
}

// ---------- disco-ball intro: games pop out and speed up, then the 1v1 VS card ----------
function showDisco() {
  clearTimeout(introTimer);
  const gen = ++introGen;
  const games = PARTY_GAMES.map((g, i) => {
    const d = Math.max(0, i * 0.19 - i * i * 0.008).toFixed(2);
    return `<span class="disco-game" style="--a:${i * 36}deg;--d:${d}s;--c:${gameColor(g.id)}">${icon(g.sport)}</span>`;
  }).join("");
  $("#partyIntroCard").innerHTML = `
    <p class="eyebrow">${t("party.modeTitle")}</p>
    <h2 class="d" id="partyIntroTitle">${t("party.title")}</h2>
    <div class="disco-stage" aria-hidden="true">
      <div class="disco-beam b1"></div><div class="disco-beam b2"></div><div class="disco-beam b3"></div>
      <div class="disco-ball"><i></i><b></b></div>
      <div class="disco-games">${games}</div>
      <i class="disco-spark s1">${icon("sparkle")}</i>
      <i class="disco-spark s2">${icon("sparkle")}</i>
      <i class="disco-spark s3">${icon("sparkle")}</i>
    </div>
    <p class="disco-sub">${t("party.discoSub")}</p>`;
  const el = $("#partyIntro");
  el.classList.remove("hide");
  fillIcons(el);
  introTimer = window.setTimeout(() => {
    if (gen !== introGen) return;
    el.classList.add("hide");
    showVs();
  }, 3800);
}

function showVs() {
  if (!P) { renderSetup(); return; }
  clearTimeout(vsTimer);
  const gen = ++vsGen;
  const a = P.teams[0].name, b = P.teams[1].name;
  $("#partyVsCard").innerHTML = `
    <p class="eyebrow">${t("party.modeTitle")}</p>
    <h2 class="d" id="partyVsTitle">${t("party.vs")}</h2>
    <div class="vs-scene">
      <div class="vs-side vs-a"><span class="vs-av" aria-hidden="true">${avatarOf(0)}</span><b class="d">${A(a)}</b></div>
      <div class="vs-mid" aria-hidden="true"><span class="vs-stamp">VS</span><i>${icon("zap")}</i></div>
      <div class="vs-side vs-b"><span class="vs-av" aria-hidden="true">${avatarOf(1)}</span><b class="d">${A(b)}</b></div>
    </div>
    <p class="vs-sub">${t("party.vsSub")}</p>
    <div class="vs-bar"><i></i></div>`;
  const el = $("#partyVs");
  el.classList.remove("hide");
  fillIcons(el);
  vsTimer = window.setTimeout(() => {
    if (gen !== vsGen) return;
    el.classList.add("hide");
    autoDraw();
  }, 5000);
}

// ---------- automatic draw ----------
function autoDraw() {
  clearTimeout(nextTimer);
  nextTimer = 0;
  if (!P || P.current || P.phase === "done" || resultOpen) return;
  const sheet = document.getElementById("screenSheet") as HTMLDialogElement | null;
  if (sheet?.open) { nextTimer = window.setTimeout(autoDraw, 2000); return; }
  if (!P.pool.length) { P.phase = "done"; saveParty(); renderFinal(); return; }
  const poolBefore = [...P.pool];
  const leg = drawLeg(P);
  if (!leg) { P.phase = "done"; saveParty(); renderFinal(); return; }
  leg.lineup = [0, 0];
  saveParty();
  runDraw(leg, poolBefore, () => startLeg());
}

// CS:GO-style case reel on even legs, a marble race on odd legs; both end with the winner reveal.
// Six different draw animations; pick one at random, never repeating either of the last two draws.
const DRAW_MODES = ["case", "race", "roulette", "slots", "dart", "cards"] as const;
function pickDrawMode(): (typeof DRAW_MODES)[number] {
  const recent = (P?.drawHistory ?? []).filter((m): m is (typeof DRAW_MODES)[number] => (DRAW_MODES as readonly string[]).includes(m)).slice(0, 2);
  const available = DRAW_MODES.filter(m => !recent.includes(m));
  const pool = available.length ? available : DRAW_MODES;
  const mode = pool[Math.floor(Math.random() * pool.length)];
  if (P) {
    P.drawHistory = [mode, ...recent].slice(0, 2);
    saveParty();
  }
  return mode;
}
function runDraw(leg: PartyLeg, poolBefore: string[], after: () => void) {
  const gen = ++drawGen;
  const stage = $("#partyDrawStage");
  const mode = pickDrawMode();
  const chosen = Math.max(0, poolBefore.indexOf(leg.game));
  const n = Math.max(1, poolBefore.length);
  const seg = 360 / n;
  const card = (id: string) => `<span class="draw-card" style="--c:${gameColor(id)}">${icon(partyGame(id)?.sport ?? "")}<b>${gameTitle(id)}</b></span>`;
  const cards = (arr: string[]) => arr.map(card).join("");
  let revealAt = 5600;

  if (mode === "case") {
    const cycles = 5, cardW = 112, gap = 8;
    const strip = Array.from({length: cycles}, () => poolBefore).flat();
    const targetIndex = Math.floor(cycles / 2) * poolBefore.length + chosen;
    stage.innerHTML = `<div class="draw-case">
      <p class="eyebrow">${t("party.drawTitle")}</p>
      <div class="draw-reel-box"><div class="draw-reel" id="drawReel">${cards(strip)}</div><i class="draw-needle"></i></div>
      <div class="draw-reveal" id="drawReveal"></div>
    </div>`;
    const reel = $<HTMLElement>("#drawReel");
    const box = stage.querySelector<HTMLElement>(".draw-reel-box")!;
    reel.style.transitionDuration = "5200ms";
    requestAnimationFrame(() => {
      const x = targetIndex * (cardW + gap) + cardW / 2 - box.clientWidth / 2;
      reel.style.transform = `translateX(${-x}px)`;
    });
    revealAt = 5700;
  } else if (mode === "race") {
    stage.innerHTML = `<div class="draw-race">
      <p class="eyebrow">${t("party.drawTitle")}</p>
      <div class="draw-lanes">${poolBefore.map((id, i) => `<div class="draw-lane" data-i="${i}" style="--c:${gameColor(id)}"><span class="draw-lane-ic">${icon(partyGame(id)?.sport ?? "")}</span><i class="draw-ball">${icon(partyGame(id)?.sport ?? "")}</i><span class="draw-lane-n">${gameTitle(id)}</span><i class="draw-finish"></i></div>`).join("")}</div>
      <div class="draw-reveal" id="drawReveal"></div>
    </div>`;
    const lanes = [...stage.querySelectorAll<HTMLElement>(".draw-lane")];
    requestAnimationFrame(() => {
      lanes.forEach((lane, i) => {
        const ball = lane.querySelector<HTMLElement>(".draw-ball")!;
        const win = i === chosen;
        const delay = win ? 0 : 180 + Math.random() * 500;
        const dur = win ? 5000 : 5300 + Math.random() * 500;
        const end = win ? 100 : 80 + Math.random() * 15;
        ball.style.transition = `left ${dur}ms cubic-bezier(.12,.75,.22,1) ${delay}ms`;
        ball.style.left = `${end}%`;
        if (!win) lane.classList.add("loser");
      });
      lanes[chosen]?.classList.add("winner");
    });
    revealAt = 5800;
  } else if (mode === "roulette") {
    const wheelGradient = poolBefore.map((id, i) => `${gameColor(id)} ${i * seg}deg ${(i + 1) * seg}deg`).join(",");
    stage.innerHTML = `<div class="draw-roulette">
      <p class="eyebrow">${t("party.drawTitle")}</p>
      <div class="wheel-stage">
        <i class="wheel-pointer" aria-hidden="true"></i>
        <div class="draw-wheel" id="drawWheel" style="--wheel:conic-gradient(${wheelGradient});--seg:${seg}deg">
          ${poolBefore.map((id, i) => `<span class="wheel-ic" style="--a:${i * seg + seg / 2}deg;--c:${gameColor(id)}">${icon(partyGame(id)?.sport ?? "")}</span>`).join("")}
        </div>
        <i class="wheel-hub" aria-hidden="true">${icon("sparkle")}</i>
      </div>
      <div class="draw-reveal" id="drawReveal"></div>
    </div>`;
    const wheel = $<HTMLElement>("#drawWheel");
    const target = chosen * seg + seg / 2;
    wheel.style.transition = "transform 5200ms cubic-bezier(.08,.8,.2,1)";
    requestAnimationFrame(() => { wheel.style.transform = `rotate(${360 * 4 - target}deg)`; });
    revealAt = 5700;
  } else if (mode === "slots") {
    const strip = (col: number) => {
      const arr = Array.from({length: 5}, () => poolBefore).flat();
      const target = 3 * n + chosen;
      return `<div class="slot-window"><div class="slot-strip" id="slotStrip${col}" data-target="${target}">${arr.map(id => `<span class="slot-ic" style="--c:${gameColor(id)}">${icon(partyGame(id)?.sport ?? "")}</span>`).join("")}</div></div>`;
    };
    stage.innerHTML = `<div class="draw-slots">
      <p class="eyebrow">${t("party.drawTitle")}</p>
      <div class="slot-machine">${strip(0)}${strip(1)}${strip(2)}<i class="slot-payline" aria-hidden="true"></i><i class="slot-jackpot" aria-hidden="true">${icon("sparkle")}</i></div>
      <div class="draw-reveal" id="drawReveal"></div>
    </div>`;
    [0, 1, 2].forEach((col) => {
      const el = $<HTMLElement>(`#slotStrip${col}`);
      const target = Number(el.dataset.target);
      const start = Math.floor(Math.random() * Math.max(1, n - 1));
      el.style.transition = "none";
      el.style.transform = `translateY(${-start * 66}px)`;
      void el.offsetHeight;
      el.style.transition = `transform ${4300 + col * 450}ms cubic-bezier(.08,.8,.2,1)`;
      requestAnimationFrame(() => { el.style.transform = `translateY(${-(target - 1) * 66}px)`; });
    });
    revealAt = 5800;
  } else if (mode === "dart") {
    const angle = chosen * seg + seg / 2 - 90;
    const rad = angle * Math.PI / 180;
    const tx = 50 + Math.cos(rad) * 38;
    const ty = 50 + Math.sin(rad) * 38;
    stage.innerHTML = `<div class="draw-dart">
      <p class="eyebrow">${t("party.drawTitle")}</p>
      <div class="dart-stage">
        <div class="dart-board" aria-hidden="true">
          <i class="dart-ring r1"></i><i class="dart-ring r2"></i><i class="dart-ring r3"></i>
          ${poolBefore.map((id, i) => `<span class="dart-spot" data-i="${i}" style="--a:${i * seg + seg / 2}deg;--c:${gameColor(id)}">${icon(partyGame(id)?.sport ?? "")}</span>`).join("")}
          <i class="dart-bull">${icon("target")}</i>
        </div>
        <i class="dart-needle" id="dartNeedle" aria-hidden="true"></i>
        <i class="dart-hit" id="dartHit" style="left:${tx}%;top:${ty}%" aria-hidden="true"></i>
      </div>
      <div class="draw-reveal" id="drawReveal"></div>
    </div>`;
    const dart = $<HTMLElement>("#dartNeedle");
    dart.style.left = "50%";
    dart.style.top = "96%";
    requestAnimationFrame(() => {
      dart.style.transition = "left 5100ms cubic-bezier(.2,.8,.2,1),top 5100ms cubic-bezier(.2,.8,.2,1),rotate 5100ms ease-in";
      dart.style.left = `${tx}%`;
      dart.style.top = `${ty}%`;
      dart.style.rotate = `${angle + 180}deg`;
    });
    window.setTimeout(() => {
      if (gen !== drawGen) return;
      stage.querySelector(`.dart-spot[data-i="${chosen}"]`)?.classList.add("hit");
      $("#dartHit")?.classList.add("on");
    }, 5000);
    revealAt = 5700;
  } else {
    const spread = 9;
    stage.innerHTML = `<div class="draw-cards">
      <p class="eyebrow">${t("party.drawTitle")}</p>
      <div class="draw-fan" id="drawFan">
        ${poolBefore.map((id, i) => `<span class="fan-card" data-i="${i}" style="--i:${i};--n:${n};--c:${gameColor(id)}">${icon(partyGame(id)?.sport ?? "")}<b>${gameTitle(id)}</b></span>`).join("")}
      </div>
      <div class="draw-reveal" id="drawReveal"></div>
    </div>`;
    const fanCards = [...stage.querySelectorAll<HTMLElement>(".fan-card")];
    fanCards.forEach((c, i) => {
      const rot = (i - (n - 1) / 2) * spread;
      c.style.transition = `transform 5200ms cubic-bezier(.12,.75,.22,1), opacity 600ms`;
      requestAnimationFrame(() => {
        c.style.transform = `rotate(${rot}deg) translateY(${Math.abs(i - (n - 1) / 2) * 5}px)`;
      });
    });
    window.setTimeout(() => {
      if (gen !== drawGen) return;
      fanCards.forEach((c, i) => {
        c.classList.toggle("won", i === chosen);
        c.classList.toggle("dim", i !== chosen);
      });
    }, 4600);
    revealAt = 5700;
  }

  const el = $("#partyDraw");
  el.classList.remove("hide");
  fillIcons(el);
  window.setTimeout(() => {
    if (gen !== drawGen) return;
    const r = $("#drawReveal");
    if (!r) return;
    r.innerHTML = `<div class="draw-win${leg.double ? " double" : ""}" style="--c:${gameColor(leg.game)}">${icon(partyGame(leg.game)?.sport ?? "")}<b>${gameTitle(leg.game)}</b><small>${pointsLabel(leg.points)}${leg.double ? ` · ${t("party.doubleShort")}` : ""}</small></div>`;
    r.classList.add("on");
    fillIcons(r);
    window.setTimeout(() => {
      if (gen !== drawGen) return;
      el.classList.add("hide");
      after();
    }, 1100);
  }, revealAt);
}

function hideDraw() {
  drawGen++;
  $("#partyDraw").classList.add("hide");
}

// ---------- lobby: dark disco club ----------
function scoreTeam(team: Team) {
  return `<div class="club-team t${team}"><span class="club-av" aria-hidden="true">${avatarOf(team)}</span><span class="club-name">${A(P!.teams[team].name)}</span><b class="d">${fmtPts(P!.totals[team])}</b></div>`;
}
function valueLabel(leg: PartyLeg, team: Team) {
  const v = leg.values[team];
  if (v == null) return leg.kind === "rounds" ? "–" : "X";
  if (leg.kind === "seconds") return t("party.seconds", {n: dec(v, 2)});
  if (leg.kind === "metres") return t("party.metres", {n: dec(v, 2)});
  if (leg.kind === "walls") return tn("party.walls", v);
  if (leg.kind === "pins") return tn("party.pins", v);
  return pointsLabel(v);
}
function legRow(leg: PartyLeg) {
  const series = leg.kind === "rounds";
  const score = series ? `${leg.wins[0]} : ${leg.wins[1]}` : `${valueLabel(leg, 0)} : ${valueLabel(leg, 1)}`;
  const winner = leg.winner == null ? "" : leg.winner === -1 ? t("party.tie") : P!.teams[leg.winner].name;
  return `<li class="club-leg${leg.double ? " double" : ""}" style="--gc:${gameColor(leg.game)}"><span class="club-leg-ic" aria-hidden="true">${icon(partyGame(leg.game)?.sport ?? "")}</span><span class="club-leg-txt"><b>${gameTitle(leg.game)}</b><small>${score}</small></span><span class="club-leg-win">${A(winner)}${leg.double ? " · 2×" : ""}</span></li>`;
}

function renderLobby() {
  if (!P) { renderSetup(); return; }
  if (P.phase === "done") { renderFinal(); return; }
  clearTimeout(nextTimer);
  nextTimer = 0;
  $("#partySetup").classList.add("hide");
  $("#partyFinal").classList.add("hide");
  $("#party").classList.add("party-live");
  const root = $("#partyLobby");
  root.classList.remove("hide");
  $("#party").scrollTop = 0;
  const current = P.current;
  const spots = [[5, 26], [87, 22], [8, 62], [86, 58], [20, 82], [74, 82], [45, 9], [58, 92]];
  const floaters = PARTY_GAMES.slice(0, 8).map((g, i) => `<span class="club-float" style="left:${spots[i][0]}%;top:${spots[i][1]}%;--i:${i};--c:${gameColor(g.id)}">${icon(g.sport)}</span>`).join("");
  root.innerHTML = `
    <section class="party-club">
      <div class="club-floaters" aria-hidden="true">${floaters}</div>
      <div class="club-ball" aria-hidden="true"><i></i><b></b></div>
      <div class="club-score">${scoreTeam(0)}<div class="club-vs" aria-hidden="true">VS</div>${scoreTeam(1)}</div>
      <div class="club-status">
        <p class="eyebrow">${current ? t("party.series") : t("party.nextGame")}</p>
        <b class="d">${current ? gameTitle(current.game) : t("party.getReady")}</b>
        <small>${current
          ? `${t("party.seriesInProgress", {a: current.wins[0], b: current.wins[1]})} · ${t("party.resumeHint", {n: current.round})}`
          : t("party.autoDraw", {n: 5})}</small>
        ${current ? "" : `<div class="club-progress"><i></i></div>`}
      </div>
      ${current ? `<button class="go tap" id="partyResume" type="button">${t("party.resumeSeries")}</button>` : ""}
      <section class="club-block">
        <h2 class="eyebrow">${t("party.played")}</h2>
        ${P.legs.length ? `<ul class="club-legs">${[...P.legs].reverse().map(legRow).join("")}</ul>` : `<p class="club-empty">${t("party.noLegs")}</p>`}
      </section>
      <section class="club-block">
        <h2 class="eyebrow">${t("party.remaining")}</h2>
        <div class="club-pool">${P.pool.map(id => `<span class="club-chip" style="--gc:${gameColor(id)}">${icon(partyGame(id)?.sport ?? "")}<b>${gameTitle(id)}</b></span>`).join("") || `<p class="club-empty">${t("party.noLegs")}</p>`}</div>
      </section>
      <p class="club-note">${t("party.whoNote")}</p>
      <div class="club-actions">
        <button class="club-btn" id="partyFinish" type="button">${t("party.finish")}</button>
        <button class="club-btn" id="partyNew" type="button">${t("party.new")}</button>
      </div>
    </section>`;
  fillIcons(root);
  if (current) {
    $("#partyResume")!.onclick = () => { clearTimeout(nextTimer); nextTimer = 0; startLeg(); };
  } else {
    nextTimer = window.setTimeout(autoDraw, 5000);
  }
  $("#partyFinish").onclick = () => finishParty($("#partyFinish"));
  $("#partyNew").onclick = () => resetParty($("#partyNew"));
}

// ---------- launch one round ----------
function startLeg() {
  if (!P?.current) { renderLobby(); return; }
  clearTimeout(nextTimer);
  clearTimeout(resultTimer);
  resultOpen = false;
  resultMode = null;
  resultEl.classList.add("hide");
  $("#partyIntro").classList.add("hide");
  $("#partyVs").classList.add("hide");
  hideDraw();
  const leg = P.current;
  leg.lineup = [0, 0];
  const gameA = leg.format === "solo" && leg.starter === 1 ? P.teams[1].name : P.teams[0].name;
  const gameB = leg.format === "solo" && leg.starter === 1 ? P.teams[0].name : P.teams[1].name;
  const cfg = {
    game: leg.game,
    format: leg.format,
    starter: leg.format === "solo" ? leg.starter : 0,
    names: [gameA, gameB] as [string, string],
    teamNames: [P.teams[0].name, P.teams[1].name] as [string, string],
  };
  if (gameActive) cleanupGame();
  P.phase = "playing";
  saveParty();
  gameActive = true;
  setPartyActive(true);
  setPartySink(onLegDone);
  setPartyLabels([gameA, gameB]);
  S.st = [{}, {}] as typeof S.st;
  S.score = [0, 0];
  S.scoreEvents = [];
  S.lastPointAt = [0, 0];
  S.fl = [0, 0];
  S.running = false;
  S.rec = null;
  S.players = leg.format === "duo" ? 2 : 1;
  if (leg.game === "rr") {
    S.duration = 30;
    S.players = 2;
    S.activeEX = EX.filter(e => ["squat", "jack", "knees", "sidestep"].includes(e.id));
    startFlow();
  } else if (leg.game === "sp") { SPRINT.party?.(cfg); startFlow(SPRINT); }
  else if (leg.game === "bx") { BOXING.party?.(cfg); startFlow(BOXING); }
  else if (leg.game === "lj") { LONGJUMP.party?.(cfg); startFlow(LONGJUMP); }
  else if (leg.game === "hd") { HURDLES_MODE.party?.(cfg); startFlow(HURDLES_MODE); }
  else if (leg.game === "bw") { BOWLING.party?.(cfg); startFlow(BOWLING); }
  else if (leg.game === "sk") { SKI.party?.(cfg); startFlow(SKI); }
  else if (leg.game === "wl") { WALL.party?.(cfg); startFlow(WALL); }
  else if (leg.game === "bd") { BADMINTON.party?.(cfg); startFlow(BADMINTON); }
  else if (leg.game === "jv") { JAVELIN.party?.(cfg); startFlow(JAVELIN); }
  else { cleanupGame(); toast(t("party.needPool")); return; }
  if (partyMirror) setCam(true);
  const mirror = MIRROR[leg.game];
  setMirror(
    mirror ? document.getElementById(mirror.base) as HTMLCanvasElement | null : null,
    mirror?.overlay ? document.getElementById(mirror.overlay) as HTMLCanvasElement | null : null,
  );
}

// Party names in the shared ready screen + the rep HUD.
function setPartyLabels(names: [string, string] | null) {
  const a = names?.[0] ?? "P1", b = names?.[1] ?? "P2";
  const set = (sel: string, v: string) => { const el = document.querySelector<HTMLElement>(sel); if (el) el.textContent = v; };
  set("#rd1 b", a);
  set("#rd2 b", b);
  set("#hud .pl.p1 .chip", a);
  set("#hud .pl.p2 .chip", b);
}

// ---------- round / series result ----------
function restartResultBar() {
  const bar = resultEl.querySelector<HTMLElement>(".party-res-auto i");
  if (!bar) return;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
}

function showRoundResult(leg: PartyLeg, round: RoundResult) {
  resultOpen = true;
  resultMode = "round";
  clearTimeout(resultTimer);
  const w = round.winner;
  $("#partyResGame").textContent = `${gameTitle(leg.game)} · ${t("party.roundN", {n: leg.results.length})}`;
  $("#partyResTitle").textContent = w === -1 ? t("party.roundTie") : t("party.roundWinTitle", {team: P!.teams[w].name});
  $("#partyResSub").textContent = `${t("party.seriesInProgress", {a: leg.wins[0], b: leg.wins[1]})} · ${t("party.autoDraw", {n: 5})}`;
  $("#partyResPlayers").innerHTML = [0, 1].map(i => `<span class="t${i}"><span class="party-res-av" aria-hidden="true">${avatarOf(i as Team)}</span><b>${A(P!.teams[i].name)}</b></span>`).join("<i>vs</i>");
  $("#partyResScore").innerHTML = `<span class="t0"><small>${A(P!.teams[0].name)}</small><b class="d">${fmtPts(P!.totals[0])}</b></span><i>:</i><span class="t1"><small>${A(P!.teams[1].name)}</small><b class="d">${fmtPts(P!.totals[1])}</b></span>`;
  $("#partyResBtn").textContent = t("party.nextRound");
  resultEl.dataset.mode = "round";
  resultEl.classList.remove("hide");
  fillIcons(resultEl);
  restartResultBar();
  resultTimer = window.setTimeout(() => { if (resultMode === "round") nextRound(); }, 5000);
}

function showSeriesResult(leg: PartyLeg) {
  resultOpen = true;
  resultMode = "series";
  clearTimeout(resultTimer);
  const w = leg.winner ?? -1;
  $("#partyResGame").textContent = `${gameTitle(leg.game)} · ${t("party.series")}`;
  $("#partyResTitle").textContent = w === -1 ? t("party.tie") : t("party.take", {team: P!.teams[w].name, n: fmtPts(leg.points)});
  $("#partyResSub").textContent = t("party.roundWins", {a: leg.wins[0], b: leg.wins[1]});
  $("#partyResPlayers").innerHTML = [0, 1].map(i => `<span class="t${i}"><span class="party-res-av" aria-hidden="true">${avatarOf(i as Team)}</span><b>${A(P!.teams[i].name)}</b></span>`).join("<i>vs</i>");
  $("#partyResScore").innerHTML = `<span class="t0"><small>${A(P!.teams[0].name)}</small><b class="d">${fmtPts(P!.totals[0])}</b></span><i>:</i><span class="t1"><small>${A(P!.teams[1].name)}</small><b class="d">${fmtPts(P!.totals[1])}</b></span>`;
  $("#partyResBtn").textContent = P!.phase === "done" ? t("party.toFinal") : t("party.backToParty");
  resultEl.dataset.mode = "series";
  resultEl.classList.remove("hide");
  fillIcons(resultEl);
  restartResultBar();
  resultTimer = window.setTimeout(() => { if (resultMode === "series") returnToLobby(); }, 6000);
}

function resultAction() {
  if (resultMode === "round") nextRound();
  else if (resultMode === "series") returnToLobby();
}

function nextRound() {
  if (resultMode !== "round" || !P?.current) { returnToLobby(); return; }
  clearTimeout(resultTimer);
  resultOpen = false;
  resultMode = null;
  resultEl.classList.add("hide");
  cleanupGame();
  startLeg();
}

function returnToLobby() {
  clearTimeout(resultTimer);
  resultOpen = false;
  resultMode = null;
  resultEl.classList.add("hide");
  cleanupGame();
  history.back();
  setTimeout(() => { if (location.hash.startsWith("#/zaidimas")) go("#/vakarelis", true); }, 300);
}

function cleanupGame() {
  setMirror(null);
  setPartyLabels(null);
  stopPartyMusic(300);
  if (!gameActive) { setPartyActive(false); return; }
  gameActive = false;
  try { resetGame(); } catch (e) { console.error("Party cleanup:", e); }
  document.body.classList.remove("ingame", "playing");
  try { screenPhase("idle"); } catch { /* TV optional */ }
  setPartyActive(false);
}

function onLegDone() {
  if (!P?.current) { setPartyActive(false); return; }
  const row = loadHist()[0];
  if (!row) { setPartyActive(false); cleanupGame(); history.back(); return; }
  const apply = applyRound(P, row);
  if (!apply) { setPartyActive(false); return; }
  const leg = apply.leg;
  const h = loadHist();
  if (h[0]) {
    h[0].party = {
      id: P.id, game: leg.game, points: leg.points, lineup: leg.lineup, starter: apply.round.starter,
      winner: apply.round.winner, pts: apply.done ? leg.pts : [0, 0],
      round: leg.results.length, series: apply.done, roundWins: [...leg.wins] as [number, number],
    };
    saveHist(h);
  }
  saveParty();
  stopPartyMusic(500);
  if (apply.done) showSeriesResult(leg);
  else showRoundResult(leg, apply.round);
}

// ---------- finish / new / final ----------
function finishParty(btn?: HTMLElement) {
  if (!P) return;
  if (!finishArmed) {
    finishArmed = Date.now();
    const b = btn ?? $("#partyFinish");
    if (b) b.textContent = t("party.finishSure");
    setTimeout(() => { finishArmed = 0; const x = btn ?? $("#partyFinish"); if (x) x.textContent = t("party.finish"); }, 3000);
    return;
  }
  finishArmed = 0;
  clearTimeout(nextTimer);
  P.phase = "done";
  saveParty();
  stopPartyMusic(500);
  renderFinal();
}
function resetParty(btn?: HTMLElement) {
  if (!P) { renderSetup(); return; }
  if (!newArmed) {
    newArmed = Date.now();
    const b = btn ?? $("#partyNew");
    if (b) b.textContent = t("party.newSure");
    setTimeout(() => { newArmed = 0; const x = btn ?? $("#partyNew"); if (x) x.textContent = t("party.new"); }, 3000);
    return;
  }
  newArmed = 0;
  clearTimeout(introTimer); clearTimeout(vsTimer); clearTimeout(nextTimer); clearTimeout(resultTimer);
  introGen++; vsGen++; drawGen++;
  $("#partyIntro").classList.add("hide");
  $("#partyVs").classList.add("hide");
  hideDraw();
  resultEl.classList.add("hide");
  resultOpen = false;
  stopPartyMusic(300);
  P = null;
  saveParty();
  setup = defaultSetup();
  renderSetup();
}
function renderFinal() {
  if (!P) { renderSetup(); return; }
  clearTimeout(nextTimer);
  stopPartyMusic(500);
  $("#partySetup").classList.add("hide");
  $("#partyLobby").classList.add("hide");
  $("#party").classList.add("party-live");
  const root = $("#partyFinal");
  root.classList.remove("hide");
  $("#party").scrollTop = 0;
  const w = winnerTeam(P);
  root.innerHTML = `
    <section class="party-club party-final-club">
      <div class="club-ball" aria-hidden="true"><i></i><b></b></div>
      <p class="eyebrow">${t("party.final")}</p>
      <h2 class="d">${w < 0 ? t("party.tieTitle") : t("party.champions", {team: A(P.teams[w as Team].name)})}</h2>
      <div class="club-final-score"><span class="t0"><small>${A(P.teams[0].name)}</small><b class="d">${fmtPts(P.totals[0])}</b></span><i>:</i><span class="t1"><small>${A(P.teams[1].name)}</small><b class="d">${fmtPts(P.totals[1])}</b></span></div>
      <div class="club-final-icons" aria-hidden="true">${PARTY_GAMES.slice(0, 10).map(g => `<span style="--c:${gameColor(g.id)}">${icon(g.sport)}</span>`).join("")}</div>
      <section class="club-block"><h2 class="eyebrow">${t("party.legs")}</h2><ul class="club-legs">${P.legs.map(legRow).join("")}</ul></section>
      <div class="club-actions final">
        <button class="go tap" id="partyRematch" type="button">${t("party.rematch")}</button>
        <button class="club-btn" id="partyNew2" type="button">${t("party.new")}</button>
        <button class="club-btn" id="partyHome2" type="button">${t("party.home")}</button>
      </div>
    </section>`;
  fillIcons(root);
  $("#partyRematch").onclick = () => {
    if (!P) return;
    const id = (globalThis.crypto as any)?.randomUUID?.() || "p-" + Date.now().toString(36);
    P = createParty({
      teams: [P.teams[0].name, P.teams[1].name],
      players: [[P.teams[0].name], [P.teams[1].name]],
      mode: P.mode,
      target: P.target,
      pool: [...P.poolAll],
    }, Date.now(), id, Math.random() < 0.5 ? 0 : 1);
    saveParty();
    showDisco();
  };
  $("#partyNew2").onclick = () => resetParty($("#partyNew2"));
  $("#partyHome2").onclick = () => home();
}

// ---------- view ----------
onView("party", () => {
  setAvatarPair(null);
  if (resultOpen) { resultOpen = false; resultMode = null; resultEl.classList.add("hide"); }
  if (gameActive) cleanupGame();
  if (P?.phase === "done") renderFinal();
  else if (P) renderLobby();
  else renderSetup();
});

// Leaving the party (or the game) to another screen stops music and cancels auto timers. The game route
// itself stays alive so a round can start after the draw.
window.addEventListener("hashchange", () => {
  const h = location.hash;
  if (h.startsWith("#/vakarelis")) return;
  clearTimeout(introTimer); clearTimeout(vsTimer); clearTimeout(nextTimer); clearTimeout(resultTimer);
  introGen++; vsGen++; drawGen++;
  $("#partyIntro").classList.add("hide");
  $("#partyVs").classList.add("hide");
  hideDraw();
  resultEl.classList.add("hide");
  resultOpen = false;
  resultMode = null;
  if (!h.startsWith("#/zaidimas")) {
    stopPartyMusic(400);
    if (gameActive) cleanupGame();
  }
});
