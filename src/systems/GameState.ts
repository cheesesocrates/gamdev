import { PERKS, PERK_BY_ID, PerkDef, RARITY_WEIGHT, Rarity } from "../data/perks";
import { CRUNCH_SECONDS } from "../config";
import { shuffle } from "../util/math";

/** Everything the run's upgrades add up to. Read by every system each frame. */
export interface Stats {
  maxHp: number; // half-hearts
  moveSpeed: number;
  dmgMult: number;
  fireRateMult: number;
  magBonus: number;
  reloadMult: number;
  coffeeCupsBonus: number;
  batteryMult: number;
  multishot: number;
  bounces: number;
  pierce: number;
  homing: number;
  critChance: number;
  explode: number;
  chain: number;
  ignite: number;
  split: number;
  sizeMult: number;
  knockbackMult: number;
  projSpeedMult: number;
  dodgeCdMult: number;
  dodgeCharges: number;
  paperTrail: boolean;
  fireTrail: boolean;
  blockChance: number;
  donutChance: number;
  severance: number;
  orbiters: number;
  interns: number;
  bulletTime: boolean;
  interactMult: number;
  flexSeconds: number;
  coldBrew: boolean;
  laserMult: number;
  laserDrainMult: number;
  nuke: boolean;
  hazardMult: number;
  electric: boolean;
}

export interface DayStats {
  fired: number;
  damageTaken: number;
  bestCombo: number;
  choresDone: number;
  choresTotal: number;
  banked: number;
  shots: number;
  hits: number;
}

const BASE_HP = 6;

function freshDayStats(): DayStats {
  return { fired: 0, damageTaken: 0, bestCombo: 0, choresDone: 0, choresTotal: 0, banked: 0, shots: 0, hits: 0 };
}

class GameStateClass {
  day = 1;
  bank = 0; // banked overtime seconds
  stacks: Record<string, number> = {};
  revivesLeft = 0;
  hp = BASE_HP;
  unlocked = { coffee: false, laser: false };
  totalFired = 0;
  dayStats: DayStats = freshDayStats();
  stats: Stats = this.computeStats();

  reset() {
    this.day = 1;
    this.bank = 0;
    this.stacks = {};
    this.revivesLeft = 0;
    this.unlocked = { coffee: false, laser: false };
    this.totalFired = 0;
    this.dayStats = freshDayStats();
    this.stats = this.computeStats();
    this.hp = this.stats.maxHp;
  }

  newDay() {
    this.dayStats = freshDayStats();
    // A good night's sleep heals half your missing health (rounded up).
    const missing = this.stats.maxHp - this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + Math.ceil(missing / 2) + 2);
  }

  crunchSeconds() {
    return CRUNCH_SECONDS + this.stats.flexSeconds;
  }

  stack(id: string) {
    return this.stacks[id] ?? 0;
  }

  canTake(p: PerkDef) {
    if (p.id === "parachute") return this.revivesLeft === 0;
    return this.stack(p.id) < p.max;
  }

  addPerk(id: string) {
    const p = PERK_BY_ID[id];
    if (!p || !this.canTake(p)) return;
    this.stacks[id] = this.stack(id) + 1;
    if (id === "parachute") this.revivesLeft = 1;
    const prevMax = this.stats.maxHp;
    this.stats = this.computeStats();
    if (id === "hp") this.hp += this.stats.maxHp - prevMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  /** Draws n distinct perks, weighted by rarity (rarityBoost favours rarer cards). */
  rollPerks(n: number, rarityBoost = 1): PerkDef[] {
    const pool = shuffle(PERKS.filter((p) => this.canTake(p)));
    const out: PerkDef[] = [];
    while (out.length < n && pool.length) {
      const weights = pool.map((p) => {
        let w = RARITY_WEIGHT[p.rarity as Rarity];
        if (p.rarity !== "common") w *= rarityBoost;
        // Weapon-specific perks only matter once that weapon is unlocked.
        if ((p.id === "laser") && !this.unlocked.laser) w *= 0.2;
        if ((p.id === "coldbrew") && !this.unlocked.coffee) w *= 0.2;
        return w;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= weights[idx];
        if (r <= 0) break;
      }
      idx = Math.min(idx, pool.length - 1);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  computeStats(): Stats {
    const s = (id: string) => this.stacks?.[id] ?? 0;
    return {
      maxHp: BASE_HP + s("hp") * 2,
      moveSpeed: 255 * (1 + s("speed") * 0.1),
      dmgMult: 1 + s("dmg") * 0.2,
      fireRateMult: 1 + s("firerate") * 0.15,
      magBonus: s("bulk") * 6,
      reloadMult: Math.pow(0.8, s("bulk")),
      coffeeCupsBonus: s("bulk") * 3,
      batteryMult: 1 + s("bulk") * 0.3,
      multishot: s("multishot"),
      bounces: s("ricochet") * 2,
      pierce: s("pierce"),
      homing: s("homing"),
      critChance: 0.05 + s("crit") * 0.12,
      explode: s("explode"),
      chain: s("chain") ? 1 + s("chain") : 0,
      ignite: s("ignite"),
      split: s("split"),
      sizeMult: 1 + s("size") * 0.4,
      knockbackMult: 1 + s("size") * 0.5,
      projSpeedMult: 1 + s("velocity") * 0.35,
      dodgeCdMult: Math.pow(0.75, s("dodge")),
      dodgeCharges: 1 + (s("dodge") >= 2 ? 1 : 0),
      paperTrail: s("paper") > 0,
      fireTrail: s("scorched") > 0,
      blockChance: s("thick") * 0.15,
      donutChance: 0.07 + s("donut") * 0.08,
      severance: s("severance"),
      orbiters: s("orbit") ? 1 + s("orbit") : 0,
      interns: s("interns"),
      bulletTime: s("bullettime") > 0,
      interactMult: Math.pow(0.65, s("delegation")),
      flexSeconds: s("flex") * 15,
      coldBrew: s("coldbrew") > 0,
      laserMult: 1 + s("laser") * 0.5,
      laserDrainMult: Math.pow(0.7, s("laser")),
      nuke: s("nuke") > 0,
      hazardMult: 1 + s("hazard") * 0.6,
      electric: s("electric") > 0
    };
  }
}

export const GameState = new GameStateClass();
