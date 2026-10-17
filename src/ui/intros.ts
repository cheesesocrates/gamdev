import { ICON, WEAPON_ICON, heartSvg } from "./icons";
import { perkLogo } from "./perkIcons";

export type IntroId = "crunch" | "review" | "downsizing";

export interface IntroDef {
  id: IntroId;
  kicker: string;
  title: string;
  sub: string;
  accent: string;
  /** Dark header colour: title in paper white. */
  dark?: boolean;
  go: string;
  steps: { art: string; title: string; text: string }[];
}

const STICKY = `<svg viewBox="0 0 64 64"><path d="M10 8 H54 V46 L42 58 H10 Z" fill="#f2d061" stroke="#1c1d21" stroke-width="4" stroke-linejoin="round"/><path d="M42 58 V46 H54" fill="#f2c94c" stroke="#1c1d21" stroke-width="4" stroke-linejoin="round"/><path d="M18 22 l4 4 l8 -9 M18 38 h22" fill="none" stroke="#1c1d21" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CARDS = `<svg viewBox="0 0 64 64"><rect x="6" y="14" width="24" height="36" rx="4" fill="#6aa3b4" stroke="#1c1d21" stroke-width="4" transform="rotate(-12 18 32)"/><rect x="20" y="10" width="24" height="36" rx="4" fill="#6f5aa0" stroke="#1c1d21" stroke-width="4"/><rect x="34" y="14" width="24" height="36" rx="4" fill="#d8a93b" stroke="#1c1d21" stroke-width="4" transform="rotate(12 46 32)"/></svg>`;

export const INTROS: Record<IntroId, IntroDef> = {
  crunch: {
    id: "crunch",
    kicker: "PHASE 1",
    title: "CRUNCH TIME",
    sub: "It's 3:00 PM. You have two minutes until 5.",
    accent: "#e9c25a",
    go: "START THE DAY",
    steps: [
      { art: STICKY, title: "Do your chores", text: "Walk to a glowing station and press <kbd>E</kbd>. Every chore is a quick mini-game." },
      { art: perkLogo("electric", "#6aa3b4"), title: "Scout the office", text: "Water coolers and power strips show up in new places every day. Remember where they are: at 5 PM they're your traps." },
      { art: ICON.clock, title: "Clock out early", text: "Chores done? Press <kbd>ENTER</kbd>. Half of the time you have left becomes <b>Overtime</b>, the money for upgrades." }
    ]
  },
  review: {
    id: "review",
    kicker: "INTERMISSION",
    title: "PERFORMANCE REVIEW",
    sub: "Spend your Overtime before the layoffs start.",
    accent: "#6aa3b4",
    go: "GOT IT",
    steps: [
      { art: CARDS, title: "Pick an upgrade", text: "Three offers, and they're pricey. A good day buys one, a great day buys two." },
      { art: WEAPON_ICON.coffee, title: "Or buy a gun", text: "Two guns are on offer at the bottom. You can buy one per review." },
      { art: heartSvg("#c4382c"), title: "Patch yourself up", text: "Low on hearts? A Sick Day heals you fully. Reshuffle swaps the offers." }
    ]
  },
  downsizing: {
    id: "downsizing",
    kicker: "PHASE 2",
    title: "THE DOWNSIZING",
    sub: "5:00 PM. Budget cuts. Fire the quota before they fire you.",
    accent: "#c4382c",
    dark: true,
    go: "FIGHT!",
    steps: [
      { art: ICON.slip, title: "Fire the quota", text: "Knock out the number of coworkers shown at the top. Some lie in wait in other rooms." },
      { art: ICON.mouse, title: "Fight back", text: "<kbd>WASD</kbd> move. Click to shoot (one staple per click). <b>Scroll</b> to switch weapons. <kbd>SPACE</kbd> dodge-rolls through bullets." },
      { art: WEAPON_ICON.toner, title: "Spring the traps", text: "Press <kbd>E</kbd> by a cooler, power strip or copier and the trap goes off instantly. Dodge-roll into desks to send them flying. Traps never hurt you." },
      { art: perkLogo("crit", "#d8a93b"), title: "Survive the day", text: "Make quota and pick a free upgrade. Tomorrow gets harder." }
    ]
  }
};

const KEY = "ht_intros_v2";
const session = new Set<IntroId>();

export function introSeen(id: IntroId): boolean {
  if (session.has(id)) return true;
  try { return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>)[id] === true; } catch { return false; }
}

export function markIntro(id: IntroId) {
  session.add(id);
  try {
    const seen = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
    seen[id] = true;
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch { /* storage blocked: just show it again next time */ }
}

export function resetIntros() {
  session.clear();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
