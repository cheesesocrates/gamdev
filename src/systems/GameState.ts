import { PERKS, PERK_BY_ID, PerkDef, RARITY_RANK, RARITY_WEIGHT, Rarity } from "../data/perks";
import { CRUNCH_SECONDS } from "../config";
import { WEAPONS, WeaponId } from "../data/weapons";

const lockedArsenal = () => Object.fromEntries(WEAPONS.map((w) => [w, w === "stapler"])) as Record<WeaponId, boolean>;
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
  choreBonusSec: number;
  autoChores: number;
  prepShield: number;
  // newer combat mechanics
  hotShots: number;
  panic: number;
  micdrop: number;
  pyramid: number;
  espresso: number;
  sniper: boolean;
  replyall: number;
  execute: number;
  drone: number;
  chainmail: number;
  boomerang: boolean;
  irish: boolean;
  prism: number;
  glass: boolean;
  promotion: boolean;
  // newer chore-stage mechanics
  bigPuddles: boolean;
  // game-changers
  corner: number;
  wetFloor: boolean;
  sticky: number;
  ninja: boolean;
  /** Open-Plan Office: the dodge is a short dash that phases through walls. */
  phaseDash: boolean;
  deskJockey: number;
  handshake: number;
  blame: boolean;
  romance: boolean;
  binder: number;
  command: boolean;
  hostileEnv: boolean;
  liveWire: boolean;
  fireDrill: boolean;
  plusOne: number;
  kindling: boolean;
  hotCopiers: boolean;
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
  unlocked = lockedArsenal();
  totalFired = 0;
  dayStats: DayStats = freshDayStats();
  stats: Stats = this.computeStats();

  reset() {
    this.day = 1;
    this.bank = 0;
    this.stacks = {};
    this.revivesLeft = 0;
    this.unlocked = lockedArsenal();
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

  /** Weapon upgrades stay hidden until the player owns that weapon. */
  available(p: PerkDef) {
    if (!this.canTake(p)) return false;
    if (p.requires && !this.unlocked[p.requires]) return false;
    return true;
  }

  /** Draws n distinct perks, weighted by rarity (rarityBoost favours rarer cards). */
  rollPerks(n: number, rarityBoost = 1, stage: "combat" | "chore" = "combat"): PerkDef[] {
    return this.rollSlots(Array<Rarity>(n).fill("common"), stage, rarityBoost);
  }

  /**
   * One card per slot; each slot only draws perks at or above its minimum rarity
   * (falling back to anything left). The shop uses [common, common, rare]: epics and
   * legendaries turn up now and then, not every review.
   */
  rollSlots(minRarity: Rarity[], stage: "combat" | "chore" = "combat", rarityBoost = 1): PerkDef[] {
    let pool = shuffle(PERKS.filter((p) => this.available(p) && (stage === "chore") === (p.stage === "chore")));
    // Every chore upgrade maxed out: fall back to the combat pool rather than an empty reward.
    if (stage === "chore" && !pool.length) pool = shuffle(PERKS.filter((p) => this.available(p) && p.stage !== "chore"));
    const out: PerkDef[] = [];
    for (const min of minRarity) {
      if (!pool.length) break;
      let cands = pool.filter((p) => RARITY_RANK[p.rarity] >= RARITY_RANK[min]);
      if (!cands.length) cands = pool;
      const weights = cands.map((p) => RARITY_WEIGHT[p.rarity as Rarity] * (p.rarity === "common" ? 1 : rarityBoost));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < cands.length - 1; idx++) {
        r -= weights[idx];
        if (r <= 0) break;
      }
      const pick = cands[idx];
      out.push(pick);
      pool = pool.filter((p) => p !== pick);
    }
    return out;
  }

  computeStats(): Stats {
    const s = (id: string) => this.stacks?.[id] ?? 0;
    const glass = s("glass") > 0;
    const hearts = BASE_HP + s("hp") * 2;
    return {
      maxHp: glass ? Math.max(2, Math.ceil(hearts / 2)) : hearts,
      moveSpeed: 255 * (1 + s("speed") * 0.1),
      dmgMult: (1 + s("dmg") * 0.2) * (glass ? 2 : 1),
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
      electric: s("electric") > 0,
      choreBonusSec: s("overtime") * 2,
      autoChores: s("autocomplete"),
      prepShield: s("prepared"),
      hotShots: s("hotdesk") ? 1 + s("hotdesk") * 2 : 0,
      panic: s("panic"),
      micdrop: s("micdrop"),
      pyramid: s("pyramid"),
      espresso: s("espresso"),
      sniper: s("sniper") > 0,
      replyall: s("replyall"),
      execute: s("execute") ? 0.12 + s("execute") * 0.08 : 0,
      drone: s("drone"),
      chainmail: s("chainmail"),
      boomerang: s("boomerang") > 0,
      irish: s("irish") > 0,
      prism: s("prism"),
      glass,
      promotion: s("promotion") > 0,
      bigPuddles: s("bigpuddles") > 0,
      corner: s("corner"),
      wetFloor: s("wetfloor") > 0,
      sticky: s("sticky"),
      ninja: s("ninja") > 0,
      phaseDash: s("phasedash") > 0,
      deskJockey: s("deskjockey"),
      handshake: s("handshake"),
      blame: s("blame") > 0,
      romance: s("romance") > 0,
      binder: s("binder"),
      command: s("command") > 0,
      hostileEnv: s("hostile") > 0,
      liveWire: s("livewire") > 0,
      fireDrill: s("firedrill") > 0,
      plusOne: s("plusone"),
      kindling: s("kindling") > 0,
      hotCopiers: s("hotcopiers") > 0
    };
  }
}

export const GameState = new GameStateClass();
