export type EnemyType = "intern" | "fulltime" | "accountant" | "manager" | "hr" | "burnout" | "robot" | "consultant" | "hatchet" | "caller" | "hrhead" | "ceo";
export type BossKind = "consultant" | "hatchet" | "caller" | "hr" | "ceo";

/** The bosses a run draws its day-3 and day-6 visitors from (the CEO always closes a run on day 9). */
export const BOSS_POOL: EnemyType[] = ["hatchet", "caller", "consultant", "hrhead"];

export interface RangedDef {
  kind: "calc" | "memo" | "bolt" | "phone";
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
  /** Electronics: shorts out and blows up in a puddle. */
  robot?: boolean;
  smart?: boolean; // avoids fire / live water when pathing
  boss?: boolean;
  bossKind?: BossKind;
  tint?: number;
  /** What they carry (and throw): a texture shown in their hands. */
  held?: string;
  heldScale?: number;
}

/** The pose a coworker uses while still at their desk (before 5 PM). */
export const standPose = (sprite: string) => sprite.replace(/_(hold|gun|machine|silencer)$/, "_stand");

/** How each boss is announced: the banner, the PA, and the night-before memo ("Due to budget cuts: <memo>."). */
export const BOSS_INFO: Record<BossKind, { sub: string; pa: string; memo: string }> = {
  hatchet: {
    sub: "is here to make some cuts",
    pa: "Attention all staff. The Hatchet Man is on the floor. Please stand clear of the walls.",
    memo: "the Hatchet Man makes the cuts himself"
  },
  caller: {
    sub: "has a few calls to make",
    pa: "Attention all staff. The Cold Caller is on the line. Ringing phones blow up: keep clear of the red rings.",
    memo: "the Cold Caller dials in (phones explode)"
  },
  consultant: {
    sub: "has been brought in to 'optimize headcount'",
    pa: "Attention all staff. An external consultant has arrived to optimize headcount. His interns protect him.",
    memo: "a consultant is optimizing headcount"
  },
  hr: {
    sub: "would like a quick word in private",
    pa: "Attention all staff. The Head of HR is on the floor. His shield blocks shots from the front: get round the side.",
    memo: "the Head of HR is handling complaints personally"
  },
  ceo: {
    sub: "wants a word about your performance",
    pa: "This is your CEO speaking. I will be handling this one personally.",
    memo: "the CEO is reviewing you personally"
  }
};

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
    sprites: ["manOld_hold", "womanOld_hold"], scale: 1.0, melee: 1, smart: true, held: "p_calc", heldScale: 0.85,
    ranged: { kind: "calc", dmg: 1, speed: 360, cooldown: 1.7, range: 560, count: 1, spread: 0, keepDist: [230, 380] }
  },
  manager: {
    type: "manager", title: "Middle Manager", hp: 102, speed: 120, radius: 14,
    sprites: ["hitman2_hold", "survivor2_hold"], scale: 1.05, melee: 1, smart: true, held: "p_memo", heldScale: 1.1,
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
    sprites: ["robot1_machine", "robot2_machine"], scale: 1.05, melee: 1, dodgy: true, smart: true, robot: true,
    ranged: { kind: "bolt", dmg: 1, speed: 620, cooldown: 1.25, range: 640, count: 1, spread: 0, keepDist: [260, 420] }
  },
  // Brings interns who shield him ("synergy": he takes a quarter damage while they're near), sprays memos, and below
  // half health spins round and fires a full ring of them ("PIVOT!").
  consultant: {
    type: "consultant", title: "THE CONSULTANT", hp: 1750, speed: 115, radius: 30,
    sprites: ["hitman2_hold"], scale: 2.1, melee: 2, boss: true, bossKind: "consultant", smart: true, tint: 0xffd7a8, held: "p_memo", heldScale: 0.9,
    ranged: { kind: "memo", dmg: 1, speed: 300, cooldown: 2.6, range: 700, count: 9, spread: 0.18, keepDist: [160, 360] }
  },
  // A day-3 or day-6 boss: charges in a straight line through walls, glass and desks.
  hatchet: {
    type: "hatchet", title: "THE HATCHET MAN", hp: 1500, speed: 118, radius: 30,
    sprites: ["hitman1_hold"], scale: 2.15, melee: 2, boss: true, bossKind: "hatchet", smart: true, tint: 0xf3c2b4, held: "i_stamp", heldScale: 0.62
  },
  // A day-3 or day-6 boss: keeps its distance and lobs ringing desk phones that explode.
  caller: {
    type: "caller", title: "THE COLD CALLER", hp: 1350, speed: 104, radius: 28,
    sprites: ["manBlue_hold"], scale: 2.0, melee: 2, boss: true, bossKind: "caller", smart: true, tint: 0xd2e2ff, held: "i_phone", heldScale: 0.6,
    ranged: { kind: "phone", dmg: 2, speed: 0, cooldown: 2.3, range: 820, count: 1, spread: 0, keepDist: [300, 500] }
  },
  // A day-3 or day-6 boss: a riot shield the size of a door (he turns slowly: flank him), a megaphone that stuns,
  // Mandatory Training (calls in staff), shield-bash lunges (into a wall: stunned, guard down) and, below half
  // health, a ring of megaphone blasts.
  hrhead: {
    type: "hrhead", title: "THE HEAD OF HR", hp: 1600, speed: 96, radius: 30,
    sprites: ["soldier1_hold"], scale: 2.1, melee: 2, boss: true, bossKind: "hr", shield: true, megaphone: true, smart: true, tint: 0xd8ecd0
  },
  // Day 9 (and every 9th day in endless): three phases, and the other bosses' moves on top of his own. Quarterly Review
  // (coin fans, golden-parachute leaps, the Hostile Takeover charge through any interior wall), Restructuring (security
  // on call, double fans, leaps that scatter coins, conference calls) and Liquidation (burning reports, the office on
  // fire with no sprinklers, pivots, charges in pairs).
  ceo: {
    type: "ceo", title: "THE CEO", hp: 2400, speed: 100, radius: 34,
    sprites: ["manOld_hold"], scale: 2.5, melee: 2, boss: true, bossKind: "ceo", smart: true, tint: 0xffe6b0, held: "i_briefcase", heldScale: 0.62
  }
};
