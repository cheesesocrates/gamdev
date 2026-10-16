import { EnemyType } from "./enemies";

export type ChoreId = "emails" | "print" | "shred" | "coffee" | "presentation" | "memos" | "server" | "plant";

export const CHORE_INFO: Record<ChoreId, { label: string; hold: number; room: string }> = {
  emails: { label: "Reply-All to Emails", hold: 3.0, room: "Executive Suite" },
  print: { label: "Print the Q4 Budget", hold: 3.0, room: "Copy Room" },
  shred: { label: "Shred the Evidence", hold: 2.5, room: "Copy Room" },
  coffee: { label: "Fix the Coffee Machine", hold: 3.0, room: "Break Room" },
  presentation: { label: "Prep the Board Deck", hold: 3.0, room: "Conference Room" },
  memos: { label: "Sign the Layoff Memos", hold: 3.0, room: "HR Office" },
  server: { label: "Reboot the Server", hold: 4.0, room: "Server Room" },
  plant: { label: "Water the CEO's Plant", hold: 2.0, room: "Executive Suite" }
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
  boss: boolean;
}

const CHORE_ORDER: ChoreId[] = ["emails", "print", "shred", "coffee", "presentation", "memos", "server", "plant"];

export function dayConfig(day: number): DayConfig {
  const d = day - 1;
  const quota = 10 + d * 4 + Math.max(0, d - 5) * 2;
  const choreCount = Math.min(CHORE_ORDER.length, 4 + d);
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
    chores: CHORE_ORDER.slice(0, choreCount),
    boss: day % 5 === 0
  };
}
