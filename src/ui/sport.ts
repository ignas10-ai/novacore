// Per-game motion art for the Rungtys shelf. The base glyph is a Phosphor sport icon; each game adds its own little
// moving pieces (speed lines, a ski slope, a bouncing shuttle, a wall hole…) so no two rows feel like the same sticker.
import {icon} from "./icons.ts";
import {SPORT} from "./chars.ts";

const WALL=`<svg viewBox="0 0 64 64" aria-hidden="true" class="sa-wl-svg">
  <path d="M8 57V8h48v49" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <path d="M14 20h9M32 20h8M14 38h9M33 38h8M14 49h7M35 49h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".42"/>
  <g class="sa-wl-fig">
    <circle cx="39" cy="27" r="9.5" fill="var(--ink)" stroke="currentColor" stroke-width="4.5"/>
    <circle cx="39" cy="25" r="2.7" fill="#FFD66B"/>
    <path d="M35 32c2.5 3.5 5.5 3.5 8 0M34 37l-3 8M44 37l3 8" fill="none" stroke="#FFD66B" stroke-width="2.5" stroke-linecap="round"/>
  </g>
</svg>`;

export function sportArt(g:string){
  if(g==="wl")return `<span class="sa sa-wl">${WALL}<i class="sa-a"></i><i class="sa-b"></i><i class="sa-c"></i></span>`;
  const glyph=icon(SPORT[g]||"sport-rr");
  return `<span class="sa sa-${g}">${glyph}<i class="sa-a"></i><i class="sa-b"></i><i class="sa-c"></i></span>`;
}
