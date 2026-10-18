import { EnemyType } from "./enemies";
import { shuffle } from "../util/math";
import { GameState, RUN_DAYS } from "../systems/GameState";

export type ChoreId = "emails" | "print" | "shred" | "coffee" | "presentation" | "memos" | "server" | "plant" | "jam" | "wifi" | "mail" | "board";

export const CHORE_INFO: Record<ChoreId, { label: string; hold: number; room: string }> = {
  emails: { label: "Reply-All to Emails", hold: 3.0, room: "Executive Suite" },
  print: { label: "Print the Q4 Budget", hold: 3.0, room: "Copy Center" },
  shred: { label: "Shred the Evidence", hold: 2.5, room: "Copy Center" },
  coffee: { label: "Fix the Coffee Machine", hold: 3.0, room: "Cafeteria" },
  presentation: { label: "Prep the Board Deck", hold: 3.0, room: "Boardroom" },
  memos: { label: "Sign the Layoff Memos", hold: 3.0, room: "HR Department" },
  server: { label: "Reboot the Server", hold: 4.0, room: "Server Core" },
  plant: { label: "Water the CEO's Plant", hold: 2.0, room: "Executive Suite" },
  jam: { label: "Unjam the Printer", hold: 2.0, room: "" },
  wifi: { label: "Reset the Wi-Fi", hold: 2.0, room: "" },
  mail: { label: "Sort the Mail", hold: 2.0, room: "" },
  board: { label: "Clean the Whiteboard", hold: 2.0, room: "" }
};

export interface DayConfig {
  day: number;
  quota: number;
  npcs: number;
  maxAlive: number;
  spawnEvery: number; // seconds between spawn waves
  groupSize: [number, number];
  weights: Partial<Record<EnemyType, number>>;
  hpMult: number;
  speedMult: number;
  chores: ChoreId[];
  /** How much longer each chore's mini-game runs (0 = baseline). */
  lengthLevel: number;
  /** Seconds added to Crunch Time today. */
  extraTime: number;
  /** What got harder today compared to yesterday. */
  growth: "more" | "longer" | null;
  boss: boolean;
  /** Which boss turns up on a boss day (see GameState.bossFor). */
  bossType: EnemyType;
  /** The last day of the run: the CEO's day. */
  final: boolean;
  /** Bosses keep up with you in endless: every nine days they get tougher (health, speed, attack rate). */
  bossHp: number;
  bossSpeed: number;
  /** Multiplies boss cooldowns (below 1 = attacks more often). */
  bossRate: number;
}

const CHORE_ORDER: ChoreId[] = ["emails", "print", "shred", "coffee", "presentation", "memos", "server", "plant", "jam", "wifi", "mail", "board"];
/** Twelve chores to draw from, but never more than six on one day's list. */
const MAX_CHORES = 6;

/** How much longer each chore's mini-game runs at a length level (it stops growing at level 6). */
export const choreLength = (level: number) => 1 + Math.min(level, 6) * 0.28;
/** Extra Crunch Time on later days: +4 s a day from day 4, at most +20 s. */
export const extraCrunch = (day: number) => Math.min(20, Math.max(0, (day - 3) * 4));

/**
 * Day 1 is three quick chores so the fight comes sooner. After that the load alternates between two knobs:
 * odd steps add a chore, even steps make every chore's task longer. Once all eight chores are on the
 * list, only the "longer" knob keeps turning.
 */
export function choreLoad(day: number) {
  const step = day - 1;
  const added = Math.min(MAX_CHORES - 3, Math.ceil(step / 2));
  return { count: 3 + added, lengthLevel: step - added };
}

function rollChores(count: number, prev?: ChoreId[]): ChoreId[] {
  let list = shuffle([...CHORE_ORDER]).slice(0, count);
  for (let i = 0; i < 6 && prev && list.every((c) => prev.includes(c)) && prev.length === count; i++) {
    list = shuffle([...CHORE_ORDER]).slice(0, count);
  }
  return list;
}

export function dayConfig(day: number, prevChores?: ChoreId[]): DayConfig {
  const d = day - 1;
  // The quota climbs through the run, then more gently in endless.
  const q = (n: number) => 10 + n * 4 + Math.max(0, n - 5) * 2;
  const boss = day % 3 === 0;
  // On other days this is the next boss coming up (the plan is fixed per run, so it's the same one that shows).
  const bossType = GameState.bossFor(Math.ceil(day / 3) * 3);
  let quota = d < RUN_DAYS ? q(d) : q(RUN_DAYS - 1) + (d - (RUN_DAYS - 1)) * 3;
  // The CEO is the main event: fewer coworkers to fire that day.
  if (boss && bossType === "ceo") quota = Math.round(quota * 0.6);
  const tier = Math.floor(d / RUN_DAYS);
  const load = choreLoad(day);
  const prevLoad = choreLoad(day - 1);
  const growth = day <= 1 ? null : load.count > prevLoad.count ? "more" : choreLength(load.lengthLevel) > choreLength(prevLoad.lengthLevel) ? "longer" : null;
  const weights: Partial<Record<EnemyType, number>> = { intern: 60, accountant: 25 };
  if (day >= 2) Object.assign(weights, { intern: 40, fulltime: 25, accountant: 22, manager: 12, hr: 4 });
  if (day >= 3) Object.assign(weights, { intern: 30, fulltime: 26, accountant: 20, manager: 14, hr: 6, burnout: 12 });
  if (day >= 4) Object.assign(weights, { intern: 22, fulltime: 24, accountant: 18, manager: 16, hr: 8, burnout: 14, robot: 12 });
  if (day >= 6) Object.assign(weights, { intern: 14, fulltime: 22, robot: 18, hr: 10 });
  return {
    day,
    quota,
    npcs: Math.min(14, 6 + d * 2),
    maxAlive: Math.min(20, 7 + d * 2),
    spawnEvery: Math.max(0.9, 3.0 - d * 0.35),
    groupSize: [1 + Math.floor(d / 3), 2 + Math.floor(d / 2)],
    weights,
    hpMult: 1 + d * 0.12,
    speedMult: 1 + Math.min(0.25, d * 0.035),
    chores: rollChores(load.count, prevChores),
    lengthLevel: load.lengthLevel,
    extraTime: extraCrunch(day),
    growth,
    boss,
    bossType,
    final: day === RUN_DAYS,
    bossHp: 1 + tier * 0.3,
    bossSpeed: 1 + Math.min(0.3, tier * 0.06),
    bossRate: Math.max(0.6, 1 - tier * 0.12)
  };
}
