export type EnemyType = "intern" | "fulltime" | "accountant" | "manager" | "hr" | "burnout" | "robot" | "consultant";

export interface RangedDef {
  kind: "calc" | "memo" | "bolt";
  dmg: number; // half-hearts
  speed: number;
  cooldown: number;
  range: number;
  count: number;
  spread: number; // radians between shots of a volley
  keepDist: [number, number];
}

export interface EnemyDef {
  type: EnemyType;
  title: string;
  hp: number;
  speed: number;
  radius: number;
  sprites: string[];
  scale: number;
  melee: number; // half-hearts per hit
  ranged?: RangedDef;
  shield?: boolean;
  megaphone?: boolean;
  burnout?: boolean;
  dodgy?: boolean;
  smart?: boolean; // avoids fire / live water when pathing
  boss?: boolean;
  tint?: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  intern: {
    type: "intern", title: "Intern", hp: 37, speed: 190, radius: 12,
    sprites: ["manBrown_hold", "womanGreen_hold", "survivor1_hold"], scale: 0.92, melee: 1
  },
  fulltime: {
    type: "fulltime", title: "Full-Timer", hp: 61, speed: 175, radius: 13,
    sprites: ["manBlue_hold", "manRed_hold"], scale: 1.0, melee: 1
  },
  accountant: {
    type: "accountant", title: "Accountant", hp: 51, speed: 120, radius: 13,
    sprites: ["manOld_hold", "womanOld_hold"], scale: 1.0, melee: 1, smart: true,
    ranged: { kind: "calc", dmg: 1, speed: 360, cooldown: 1.7, range: 560, count: 1, spread: 0, keepDist: [230, 380] }
  },
  manager: {
    type: "manager", title: "Middle Manager", hp: 102, speed: 120, radius: 14,
    sprites: ["hitman2_gun", "survivor2_gun"], scale: 1.05, melee: 1, smart: true,
    ranged: { kind: "memo", dmg: 1, speed: 320, cooldown: 2.3, range: 520, count: 3, spread: 0.22, keepDist: [180, 340] }
  },
  hr: {
    type: "hr", title: "HR Director", hp: 255, speed: 92, radius: 18,
    sprites: ["soldier1_hold", "soldier2_hold"], scale: 1.3, melee: 2, shield: true, megaphone: true
  },
  burnout: {
    type: "burnout", title: "Burnt-Out Employee", hp: 94, speed: 105, radius: 14,
    sprites: ["zombie1_hold", "zombie2_hold"], scale: 1.05, melee: 1, burnout: true
  },
  robot: {
    type: "robot", title: "AI Replacement", hp: 119, speed: 165, radius: 14,
    sprites: ["robot1_machine", "robot2_machine"], scale: 1.05, melee: 1, dodgy: true, smart: true,
    ranged: { kind: "bolt", dmg: 1, speed: 620, cooldown: 1.25, range: 640, count: 1, spread: 0, keepDist: [260, 420] }
  },
  consultant: {
    type: "consultant", title: "THE CONSULTANT", hp: 1750, speed: 115, radius: 30,
    sprites: ["hitman2_machine"], scale: 2.1, melee: 2, boss: true, smart: true, tint: 0xffd7a8,
    ranged: { kind: "memo", dmg: 1, speed: 300, cooldown: 2.6, range: 700, count: 9, spread: 0.18, keepDist: [160, 360] }
  }
};
