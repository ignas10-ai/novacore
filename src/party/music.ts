// Party Mode background music (eight NCS tracks). It starts when the round actually begins (after the arms-up gate)
// and stops at the round end; the lobby/intro/draw/results stay silent. Volume stays well under the game SFX.
// The global sound switch and the party music switch both gate it.
import {soundEnabled} from "../audio/sound.ts";

const TRACKS = [
  "audio/party/cartoon-why-we-lose.mp3",
  "audio/party/youth-snake-eyes.mp3",
  "audio/party/aero-chord-time-leap.mp3",
  "audio/party/ash-oconnor-curbi-steeper.mp3",
  "audio/party/codeko-crest.mp3",
  "audio/party/kasger-reflections.mp3",
  "audio/party/verm-explode.mp3",
  "audio/party/yv-lune.mp3",
];
const BASE = import.meta.env.BASE_URL || "/";
const srcOf = (i: number) => `${BASE.endsWith("/") ? BASE : BASE + "/"}${TRACKS[i]}`;
const VOLUME = 0.24; // low under the game SFX; only playing while a round is running
const KEY = "novacore.partyMusic";

let audio: HTMLAudioElement | null = null;
let track = -1;
let active = false;          // this party wants music
let allowed = true;          // the party music switch
const target = VOLUME;
let fadeTimer = 0;
let errors = 0;
try { allowed = localStorage.getItem(KEY) !== "0"; } catch { /* private mode */ }

const store = (on: boolean) => {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode */ }
};

function fadeTo(v: number, ms = 700) {
  const a = audio;
  if (!a) return;
  clearInterval(fadeTimer);
  const from = a.volume;
  if (ms <= 0 || Math.abs(from - v) < 0.004) {
    a.volume = v;
    if (v === 0) a.pause();
    return;
  }
  const t0 = performance.now();
  fadeTimer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (v - from) * k));
    if (k >= 1) {
      clearInterval(fadeTimer);
      if (v === 0) a.pause();
    }
  }, 40);
}

function playNext() {
  if (!audio) return;
  track = (track + 1) % TRACKS.length;
  audio.src = srcOf(track);
  audio.volume = 0;
  audio.play().then(() => {
    errors = 0;
    fadeTo(target, 900);
  }).catch(() => { /* autoplay blocked: the next tap / gesture retries */ });
}

const sync = (ms = 700) => {
  if (active && allowed && soundEnabled()) {
    if (!audio) {
      audio = new Audio();
      audio.preload = "metadata";
      audio.volume = 0;
      audio.addEventListener("ended", () => {
        if (active && allowed && soundEnabled()) playNext();
        else audio?.pause();
      });
      audio.addEventListener("error", () => {
        if (++errors < TRACKS.length && active) playNext();
        else fadeTo(0, 200);
      });
    }
    if (!audio.src) playNext();
    else if (audio.paused) audio.play().then(() => fadeTo(target, 900)).catch(() => {});
    else fadeTo(target, ms);
  } else {
    fadeTo(0, ms);
  }
};

export const partyMusicOn = () => allowed;

export function setPartyMusicOn(on: boolean) {
  allowed = on;
  store(on);
  sync(on ? 700 : 350);
}

export function startPartyMusic() {
  active = true;
  sync(700);
}

export function stopPartyMusic(fade = 900) {
  active = false;
  sync(fade);
}

// The global Garsas switch (Profilis / rep setup) also silences the party music.
document.addEventListener("novacore:sound", () => sync(350));

// iOS sometimes pauses HTML audio when the camera / Web Audio starts. A tap is a user gesture, so resume then.
document.addEventListener("pointerdown", () => {
  if (active && allowed && soundEnabled() && audio?.paused && audio.src) {
    audio.play().then(() => fadeTo(target, 900)).catch(() => {});
  }
}, {passive: true});
