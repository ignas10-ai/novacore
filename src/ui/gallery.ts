// Game setup galleries (#41): every mini-game setup screen shows 3-4 real frames from its own run (start / middle /
// finish, take-off / landing …) in a horizontal scroll-snap strip with dots, instead of one static illustration.
// The frames come from tools/scenes.mjs -> public/scenes/<code>-1..3.webp; CSS lives in styles/glass.css.
import {t} from "../i18n/i18n.ts";

const FRAMES = 3;
const slide = (code: string, n: number) =>
  `<figure class="gal-slide"><img src="/scenes/${code}-${n}.webp" alt="" width="780" height="390"${n > 1 ? ' loading="lazy"' : ""}></figure>`;

// Markup for one game setup hero. big/sub are the same copy the old single illustration used.
export function gallery(code: string, big: string, sub: string) {
  const slides = Array.from({length: FRAMES}, (_, i) => slide(code, i + 1)).join("");
  const dots = Array.from({length: FRAMES}, (_, i) => `<button class="gal-dot" type="button" aria-label="${t("gal.frame", {n: i + 1})}"></button>`).join("");
  return `<div class="gal-hero" data-gal="${code}">
    <div class="gal-head"><span class="gal-big d">${big}</span><span class="gal-sub">${sub}</span></div>
    <div class="gal" tabindex="0" role="group" aria-label="${big}">${slides}</div>
    <div class="gal-dots">${dots}</div>
  </div>`;
}

// Dots follow the snapped slide. The strip itself is native scroll-snap (touch / trackpad / arrow keys); no library.
export function initGalleries() {
  document.querySelectorAll<HTMLElement>(".gal-hero").forEach(hero => {
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
  });
}
