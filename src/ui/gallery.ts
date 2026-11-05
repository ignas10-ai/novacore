// Game setup hero: a 3-panel animated sport emblem instead of the old realistic scene screenshots. The strip keeps
// the native scroll-snap / dots interaction (#41) but every panel is our own minimal icon art and moves.
import {t} from "../i18n/i18n.ts";
import {sportArt} from "./sport.ts";
import {partyAvatar, gameChar} from "../party/avatars.ts";

const FRAMES = 3;
const BETA = new Set(["bw", "hd"]);
const ALPHA = new Set(["bd", "jv"]);
const slide = (code: string, n: number) =>
  `<figure class="gal-slide gal-art-${n}" role="img" aria-label="${t("gal.frame", {n})}">${sportArt(code)}${code === "party" ? "" : `<span class="gal-char" aria-hidden="true">${partyAvatar(gameChar(code), 0)}</span>`}<span class="gal-art-dot"></span></figure>`;

export function gallery(code: string, big: string, sub: string) {
  const slides = Array.from({length: FRAMES}, (_, i) => slide(code, i + 1)).join("");
  const dots = Array.from({length: FRAMES}, (_, i) => `<button class="gal-dot" type="button" aria-label="${t("gal.frame", {n: i + 1})}"></button>`).join("");
  const badge = BETA.has(code)
    ? `<span class="gal-beta">${t("u.betaTag")}</span>`
    : ALPHA.has(code)
    ? `<span class="gal-alpha">${t("u.alphaTag")}</span>`
    : "";
  return `<div class="gal-hero" data-gal="${code}">
    <div class="gal-head"><span class="gal-big d">${big}</span>${badge}<span class="gal-sub">${sub}</span></div>
    <div class="gal" tabindex="0" role="group" aria-label="${big}">${slides}</div>
    <div class="gal-dots">${dots}</div>
  </div>`;
}

// Dots follow the snapped slide. The strip itself is native scroll-snap (touch / trackpad / arrow keys); no library.
export function initGallery(hero: HTMLElement) {
  const strip = hero.querySelector<HTMLElement>(".gal");
  if (!strip) return;
  const dots = [...hero.querySelectorAll<HTMLButtonElement>(".gal-dot")];
  if (!dots.length) return;
  const mark = (i: number) => dots.forEach((d, k) => d.setAttribute("aria-current", String(k === i)));
  let raf = 0;
  const sync = () => {
    raf = 0;
    const max = strip.scrollWidth - strip.clientWidth;
    mark(max <= 0 ? 0 : Math.round((strip.scrollLeft / max) * (dots.length - 1)));
  };
  strip.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(sync); }, {passive: true});
  dots.forEach((dot, i) => dot.addEventListener("click", () => {
    const el = strip.children[i] as HTMLElement | undefined;
    if (!el) return;
    const left = el.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    strip.scrollTo({left, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  }));
  sync();
}
export function initGalleries() {
  document.querySelectorAll<HTMLElement>(".gal-hero").forEach(initGallery);
}
