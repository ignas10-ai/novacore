// Eight new party kids in the same chibi style as the existing characters: big head, thick navy outline,
// team-coloured headband, tiny jersey. Pure SVG strings (no DOM, no ids) so they can be used in any list.
import type {Team} from "./logic.ts";

type Style = "short" | "bun" | "curly" | "ponytail" | "cap" | "buzz" | "long" | "afro";

interface PartyChar {
  id: string;
  name: string;
  skin: string;
  hair: string;
  jersey: string;
  bg: string;
  accent: string;
  style: Style;
  cap?: string;
  glasses?: boolean;
  freckles?: boolean;
}

export const PARTY_CHARS: PartyChar[] = [
  {id: "p0", name: "Kibirkštis", skin: "#F6C9A0", hair: "#2F343B", jersey: "#FF9C9C", bg: "#FFE3E5", accent: "#FFD66B", style: "short"},
  {id: "p1", name: "Rasa", skin: "#D89B6C", hair: "#5A3A26", jersey: "#FFD66B", bg: "#FFF4D6", accent: "#8DE8CA", style: "bun"},
  {id: "p2", name: "Žaibas", skin: "#A96C47", hair: "#1F1A2E", jersey: "#8DE8CA", bg: "#E4FBF3", accent: "#8FD8FF", style: "curly", glasses: true},
  {id: "p3", name: "Debesis", skin: "#F1B58B", hair: "#C24A2A", jersey: "#B7AEFF", bg: "#F0ECFF", accent: "#FFC9A0", style: "ponytail", freckles: true},
  {id: "p4", name: "Smėlis", skin: "#8A4E32", hair: "#2F343B", jersey: "#8FD8FF", bg: "#E3F6FF", accent: "#FFD66B", style: "cap", cap: "#FFD66B"},
  {id: "p5", name: "Šešėlis", skin: "#C6865A", hair: "#3B2A20", jersey: "#F7A8D8", bg: "#FFEAF6", accent: "#C5E87A", style: "buzz", freckles: true},
  {id: "p6", name: "Aušra", skin: "#F6C9A0", hair: "#E8B84A", jersey: "#C5E87A", bg: "#F1F9E3", accent: "#FF9C9C", style: "long"},
  {id: "p7", name: "Vėjas", skin: "#D89B6C", hair: "#2F343B", jersey: "#FFC9A0", bg: "#FFF0E3", accent: "#B7AEFF", style: "afro", glasses: true},
];

// One character per other game, used in the Rungtys rows and the game setup galleries (never in the party settings).
export const GAME_CHAR: Record<string, string> = {
  rr: "p0", sp: "p1", bx: "p2", lj: "p3", hd: "p4", bw: "p5", sk: "p6", wl: "p7", bd: "p2", jv: "p5",
};
export const gameChar = (game: string) => GAME_CHAR[game] ?? "p0";

const INK = "#2F343B";
const charOf = (id: string) => PARTY_CHARS.find(c => c.id === id) ?? PARTY_CHARS[0];
export const partyCharName = (id: string) => charOf(id).name;

const head = (c: PartyChar) => `<circle cx="32" cy="27" r="17" fill="${c.skin}" stroke="${INK}" stroke-width="2.4"/>`;
const ears = (c: PartyChar) => `<circle cx="15" cy="28" r="3.4" fill="${c.skin}" stroke="${INK}" stroke-width="2"/><circle cx="49" cy="28" r="3.4" fill="${c.skin}" stroke="${INK}" stroke-width="2"/>`;
const body = (c: PartyChar, band: string) => `
  <path d="M9 64 C10 50 19 46 32 46 C45 46 54 50 55 64 Z" fill="${c.jersey}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M23 47 Q32 52 41 47" fill="none" stroke="${band}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M12 58 Q20 51 30 50" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`;
const neck = (c: PartyChar) => `<rect x="27.5" y="38" width="9" height="9" rx="3" fill="${c.skin}" stroke="${INK}" stroke-width="2"/>`;

function backHair(c: PartyChar) {
  if (c.style === "long") {
    return `<path d="M13 24 C13 10 22 7 32 7 C42 7 51 10 51 24 L51 43 C47 41 46 32 45 26 C39 21 25 21 19 26 C18 32 17 41 13 43 Z" fill="${c.hair}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
  }
  if (c.style === "afro") {
    return `<circle cx="17" cy="21" r="9" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/><circle cx="26" cy="12" r="10" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/><circle cx="38" cy="12" r="10" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/><circle cx="47" cy="21" r="9" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/>`;
  }
  return "";
}

function frontHair(c: PartyChar) {
  const short = `<path d="M15 26 C14 14 22 8 32 8 C42 8 50 14 49 26 C44 18 38 15 32 15 C26 15 20 18 15 26 Z" fill="${c.hair}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
  switch (c.style) {
    case "short": return short;
    case "buzz": return `<path d="M16 24 C17 14 24 9 32 9 C40 9 47 14 48 24 C42 19 37 18 32 18 C27 18 22 19 16 24 Z" fill="${c.hair}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    case "bun": return `${short}<circle cx="32" cy="6.5" r="5.5" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/>`;
    case "curly": return `<circle cx="19" cy="16" r="6.5" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/><circle cx="27" cy="11" r="7.5" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/><circle cx="37" cy="11" r="7.5" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/><circle cx="45" cy="16" r="6.5" fill="${c.hair}" stroke="${INK}" stroke-width="2.2"/>`;
    case "ponytail": return `${short}<path d="M47 17 C56 17 61 24 57 33 C55 37 51 39 48 36 C53 30 52 24 45 23 Z" fill="${c.hair}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    case "long": return `<path d="M15 24 C16 12 23 8 32 8 C41 8 48 12 49 24 C43 18 37 15 32 15 C27 15 21 18 15 24 Z" fill="${c.hair}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    case "afro": return `<path d="M18 24 Q24 18 32 18 Q40 18 46 24" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    case "cap": return "";
  }
}

function cap(c: PartyChar, band: string) {
  if (c.style !== "cap") return "";
  return `<path d="M14 24 C15 11 23 7 32 7 C41 7 49 11 50 24 Z" fill="${c.cap ?? c.jersey}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M42 21 L59 23 L58 27 L43 25 Z" fill="${c.cap ?? c.jersey}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M15 20.5 C24 16.5 40 16.5 49 20.5 L49 23 C40 19 24 19 15 23 Z" fill="${band}"/>
    <circle cx="30" cy="14" r="3" fill="${c.jersey}" stroke="${INK}" stroke-width="1.6"/>`;
}

function headband(c: PartyChar, band: string) {
  if (c.style === "cap") return "";
  return `<path d="M16.5 22.5 C24 17.5 40 17.5 47.5 22.5 L47.5 26.5 C40 21.5 24 21.5 16.5 26.5 Z" fill="${band}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M46.5 22 C52 18.5 57 19.5 58 24 C54 26 50.5 25 48 24.5 Z" fill="${band}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M47.5 25.5 C52 27.5 54 32 51 36 C49 32 47 30 45.5 27 Z" fill="${band}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
}

function face(c: PartyChar) {
  const freckles = c.freckles
    ? `<circle cx="21" cy="35" r=".8" fill="${INK}" opacity=".55"/><circle cx="24" cy="36.2" r=".8" fill="${INK}" opacity=".55"/><circle cx="43" cy="35" r=".8" fill="${INK}" opacity=".55"/><circle cx="40" cy="36.2" r=".8" fill="${INK}" opacity=".55"/>`
    : "";
  const glasses = c.glasses
    ? `<circle cx="25.5" cy="30" r="5.2" fill="none" stroke="${INK}" stroke-width="1.8"/><circle cx="38.5" cy="30" r="5.2" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M30.7 30 Q32 29 33.3 30" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
    : "";
  return `
    <path d="M21.5 26 Q25.5 24.5 29 26" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M35 26 Q38.5 24.5 42.5 26" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="25.5" cy="30" rx="1.9" ry="2.3" fill="${INK}"/><circle cx="26.2" cy="29.2" r=".7" fill="#FFFFFF"/>
    <ellipse cx="38.5" cy="30" rx="1.9" ry="2.3" fill="${INK}"/><circle cx="39.2" cy="29.2" r=".7" fill="#FFFFFF"/>
    <circle cx="32" cy="33" r=".7" fill="${INK}" opacity=".5"/>
    <circle cx="21.5" cy="34.5" r="2.2" fill="#FF8E9A" opacity=".45"/><circle cx="42.5" cy="34.5" r="2.2" fill="#FF8E9A" opacity=".45"/>
    ${freckles}${glasses}
    <path d="M28 36 Q32 39.2 36 36" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`;
}

// The head-and-shoulders avatar used in the party roster, team pick, result and MVP.
export function partyAvatar(id: string, team: Team): string {
  const c = charOf(id);
  const band = team === 1 ? "#2F6BFF" : "#FF3B3B";
  return `<svg class="party-char" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="31" fill="${c.bg}"/>
    <circle cx="32" cy="32" r="30.4" fill="none" stroke="${INK}" stroke-opacity=".12" stroke-width="1"/>
    ${body(c, band)}${neck(c)}${ears(c)}${backHair(c)}${head(c)}${frontHair(c)}${cap(c, band)}${headband(c, band)}${face(c)}
  </svg>`;
}
