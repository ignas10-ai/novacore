// Tiny no-cycle bus between the party session and the game modules.
// Games only check partyActive() in finish() and call partyLegDone() after saving their history row.
let active = false;
let sink: (() => void) | null = null;

export const partyActive = () => active;
export const setPartySink = (fn: (() => void) | null) => { sink = fn };
export function setPartyActive(v: boolean) {
  active = v;
  if (!v) sink = null;
}
export function partyLegDone() {
  const fn = sink;
  sink = null;
  fn?.();
}
