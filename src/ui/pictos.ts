// One white pictogram per game for Pradžia (#38, Wii Sports cover icons). Keyed by the tile class prefix (hd-tile → hd);
// a game without one (a new tile) gets the star.
const W='fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"';
const P:Record<string,string>={
  sp:`<circle cx="20" cy="5" r="3.2" fill="#fff"/><path d="M8 29l5-8 4 3 1 5M13 21l2-8 5 4 6-1M15 13l-6 1-3 5" ${W} stroke-width="3.4"/>`,
  hd:`<rect x="4" y="9" width="24" height="6" rx="1.5" fill="#fff"/><path d="M7 15v13M25 15v13M4 28h6M22 28h6" ${W} stroke-width="3"/>`,
  lj:`<circle cx="22" cy="5" r="3.2" fill="#fff"/><path d="M3 22c4-1 7-4 9-8l6 1 6-4M12 14l-2 7 6 3M18 15l3 6 7 1" ${W} stroke-width="3.2"/><path d="M2 29h28" ${W} stroke-width="2.4" opacity=".7"/>`,
  bx:`<path d="M9 6c0-2 2-3 5-3h7c4 0 7 3 7 8v5c0 3-2 5-5 5H11c-3 0-5-2-5-5v-3c0-2 1-3 3-3z" fill="#fff"/><path d="M10 13h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="10" y="22" width="15" height="7" rx="2" fill="#fff"/>`,
  bw:`<circle cx="12" cy="19" r="9" fill="#fff"/><circle cx="9.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="13.5" cy="14.5" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/><path d="M25 4c2 0 2.6 2 2 4-.5 1.5 0 2.5 1 5 1.2 3 1 8-1 15h-4c-2-7-2.2-12-1-15 1-2.5 1.5-3.5 1-5-.6-2 0-4 2-4z" fill="#fff"/>`,
  sk:`<circle cx="19" cy="5" r="3.2" fill="#fff"/><path d="M12 22l4-6-3-4 6-3 3 6 4 2M13 12l-4 3" ${W} stroke-width="3.2"/><path d="M3 24l25 6" ${W} stroke-width="2.6"/>`,
  wl:`<path d="M3 4h26v25H3z" fill="#fff"/><circle cx="16" cy="9" r="2.8" fill="currentColor"/><path d="M16 12v8M10 13l6 2 6-5M16 20l-4 7M16 20l4 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  star:`<path d="M16 3l3.9 8 8.6 1.2-6.3 6 1.5 8.6L16 22.7l-7.7 4.1 1.5-8.6-6.3-6 8.6-1.2z" fill="#fff"/>`,
};
// currentColor = the red square behind the glyph (cut-outs in the glove / ball / wall)
export const picto=(g:string)=>`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="color:var(--red-deep)">${P[g]??P.star}</svg>`;
