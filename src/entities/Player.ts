import Phaser from "phaser";
import { CHAR_SCALE, PLAYER_RADIUS, TILE } from "../config";
import { GameState } from "../systems/GameState";
import { angleDiff, chance, clamp, rand } from "../util/math";
import { Mat } from "../world/OfficeMap";
import { WEAPONS, WEAPON_DEFS, WeaponId } from "../data/weapons";
import type { GameScene } from "../scenes/GameScene";
import type { Enemy } from "./Enemy";

export { WEAPONS };
export type { WeaponId };

export interface PlayerInput {
  mx: number;
  my: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  /** Left button went down this frame (semi-auto weapons). */
  firePressed: boolean;
  dodge: boolean;
  reload: boolean;
  switchTo: number | null;
  cycle: number;
}

/** Open-Plan Office: a short, fast dash (a normal roll covers ~150 px) that may carry on to come out the far side of a wall. */
const PHASE_LEN = 115;
const PHASE_EXTRA = 80;
const PHASE_TIME = 0.16;
/** After a dash through a wall, the next one only phases through walls again after this long (desks any time). */
const PHASE_WALL_CD = 1.2;

const STAPLER_BASE_MAG = 12;
const COFFEE_BASE_CUPS = 8;
const LASER_BATTERY = 100;
const INBOX = 6;
const TONER = 3;
const PAPER = 120;
const TANK = 100;

export class Player {
  g: GameScene;
  x: number;
  y: number;
  r = PLAYER_RADIUS;
  vx = 0;
  vy = 0;
  aim = 0;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  armed = false;

  invuln = 0;
  stun = 0;
  slip = 0;
  burnTick = 0;
  shockCd = 0;
  speedBuff = 0;
  tempHp = 0;
  hurtFlash = 0;

  rolling = 0;
  rollDx = 0;
  rollDy = 0;
  dodgeCharges = 1;
  dodgeRecharge = 0;
  /** Open-Plan Office: the wall-phasing dash in progress (a straight line, checked end to end when it started). */
  private phase: { fx: number; fy: number; dist: number; s: number; speed: number } | null = null;
  /** Mid Open-Plan Office dash: passing through walls and desks (they don't get shoved). */
  get phasing() { return this.phase !== null; }
  /** Seconds until a dash can phase through a wall again. */
  private wallCd = 0;
  get wallReady() { return this.wallCd <= 0; }
  /** Where you see from: your position, except mid-phase inside a wall (then the last spot on open floor). */
  eyeX: number;
  eyeY: number;

  weapon: WeaponId = "stapler";
  fireCd = 0;
  mag = STAPLER_BASE_MAG;
  reloading = 0;
  cups = COFFEE_BASE_CUPS;
  battery = LASER_BATTERY;
  batteryIdle = 0;
  laserOn = false;
  dayMagBonus = 0;
  dayCupBonus = 0;
  // Self-refilling ammo for the newer weapons.
  inbox = INBOX;
  private inboxT = 0;
  toner = TONER;
  private tonerT = 0;
  paper = PAPER;
  private paperIdle = 0;
  tank = TANK;
  private tankIdle = 0;
  /** A click remembered for a moment, so semi-auto fire never eats a tap. */
  private fireBuffer = 0;
  // upgrade state
  private stillT = 0;
  private wasDug = false;
  private rollHit = false;
  private romanceCd = 0;
  binderCd = 0;
  binderReady = true;

  shredBag = 0;
  /** Hot Desking: shots left that deal double damage after a dodge. */
  hotShots = 0;
  /** Reply All: stapler shots fired toward the next staple ring. */
  replyCount = 0;
  dropPaper = true;
  private lastPaperTile = -1;
  private trailTile = -1;
  private stepTimer = 0;
  dead = false;

  constructor(g: GameScene, x: number, y: number) {
    this.g = g;
    this.x = x;
    this.y = y;
    this.eyeX = x;
    this.eyeY = y;
    this.shadow = g.add.image(x, y + 6, "shadow").setScale(0.9 * CHAR_SCALE);
    this.sprite = g.add.image(x, y, "char_hitman1_stand").setOrigin(0.42, 0.5).setScale(CHAR_SCALE);
    this.dodgeCharges = GameState.stats.dodgeCharges;
    this.refill();
  }

  get maxMag() { return STAPLER_BASE_MAG + GameState.stats.magBonus + this.dayMagBonus; }
  get maxCups() { return COFFEE_BASE_CUPS + GameState.stats.coffeeCupsBonus + this.dayCupBonus + GameState.stats.espresso * 2; }
  get maxBattery() { return LASER_BATTERY * GameState.stats.batteryMult; }
  get hp() { return GameState.hp; }

  refill() {
    this.mag = this.maxMag;
    this.cups = this.maxCups;
    this.battery = this.maxBattery;
    this.reloading = 0;
    this.inbox = INBOX;
    this.toner = TONER;
    this.paper = PAPER;
    this.tank = TANK;
  }

  setArmed(armed: boolean) {
    this.armed = armed;
    if (!armed) this.laserOn = false;
  }

  weaponUnlocked(w: WeaponId | undefined) {
    return !!w && (w === "stapler" || GameState.unlocked[w]);
  }

  /** Corner Office: planted feet, better aim. */
  get dugIn() {
    return GameState.stats.corner > 0 && this.armed && this.stillT > 0.6;
  }

  /** HUD readout for any weapon. */
  ammoFor(w: WeaponId): { text: string; frac: number; warn: boolean } {
    switch (w) {
      case "stapler":
        if (this.reloading > 0) return { text: "RELOAD", frac: 1 - this.reloading / (0.95 * GameState.stats.reloadMult), warn: true };
        return { text: `${this.mag}/${this.maxMag}`, frac: this.mag / this.maxMag, warn: this.mag <= 3 };
      case "coffee": return { text: `${this.cups} cups`, frac: this.cups / this.maxCups, warn: this.cups <= 1 };
      case "laser": { const f = this.battery / this.maxBattery; return { text: `${Math.round(f * 100)}%`, frac: f, warn: f < 0.2 }; }
      case "planes": return { text: `${this.inbox}/${INBOX}`, frac: this.inbox / INBOX, warn: this.inbox === 0 };
      case "toner": return { text: `${this.toner}/${TONER}`, frac: this.toner / TONER, warn: this.toner === 0 };
      case "confetti": { const f = this.paper / PAPER; return { text: `${Math.round(f * 100)}%`, frac: f, warn: f < 0.15 }; }
      case "mister": { const f = this.tank / TANK; return { text: `${Math.round(f * 100)}%`, frac: f, warn: f < 0.15 }; }
      case "keyboard": return { text: "MELEE", frac: 1, warn: false };
      case "slips": return { text: "INF", frac: 1, warn: false };
    }
  }

  switchWeapon(w: WeaponId | undefined) {
    if (!w || !this.weaponUnlocked(w) || w === this.weapon) return;
    this.weapon = w;
    this.laserOn = false;
    this.fireCd = Math.max(this.fireCd, 0.12);
    this.g.audio.play("switch", { vol: 0.35 });
  }

  update(dt: number, inp: PlayerInput) {
    const st = GameState.stats;
    const g = this.g;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.slip > 0) this.slip -= dt;
    if (this.shockCd > 0) this.shockCd -= dt;
    if (this.wallCd > 0) this.wallCd -= dt;
    if (this.speedBuff > 0) this.speedBuff -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (inp.firePressed) this.fireBuffer = 0.16;
    else if (this.fireBuffer > 0) this.fireBuffer -= dt;
    if (this.romanceCd > 0) this.romanceCd -= dt;
    if (!this.binderReady && (this.binderCd -= dt) <= 0) this.binderReady = true;
    if (inp.mx === 0 && inp.my === 0 && this.rolling <= 0) this.stillT += dt; else this.stillT = 0;
    if (this.dugIn !== this.wasDug) {
      this.wasDug = this.dugIn;
      if (this.wasDug) g.fx.text(this.x, this.y - 44, "DUG IN", { color: "#6aa3b4", size: 15, pop: true, dur: 0.6 });
    }

    // ---- self-refilling ammo
    if (this.inbox < INBOX && (this.inboxT += dt) >= 0.55) { this.inboxT = 0; this.inbox++; }
    if (this.toner < TONER && (this.tonerT += dt) >= 5) { this.tonerT = 0; this.toner++; }
    if ((this.paperIdle += dt) > 0.5) this.paper = Math.min(PAPER, this.paper + 30 * dt);
    if ((this.tankIdle += dt) > 0.5) this.tank = Math.min(TANK, this.tank + 22 * dt);

    // ---- dodge charges
    if (this.dodgeCharges < st.dodgeCharges) {
      this.dodgeRecharge -= dt;
      if (this.dodgeRecharge <= 0) {
        this.dodgeCharges++;
        this.dodgeRecharge = 0.62 * st.dodgeCdMult;
      }
    } else this.dodgeCharges = st.dodgeCharges;

    // ---- aim
    this.aim = Math.atan2(inp.aimY - this.y, inp.aimX - this.x);

    // ---- weapon switching
    if (this.armed) {
      // Number keys pick from the guns you own, in roster order (same as the hotbar).
      if (inp.switchTo !== null) {
        const owned = WEAPONS.filter((w) => this.weaponUnlocked(w));
        if (owned[inp.switchTo]) this.switchWeapon(owned[inp.switchTo]);
      }
      if (inp.cycle !== 0) {
        // Scroll steps to the next weapon you own, wrapping around.
        const n = WEAPONS.length;
        let i = WEAPONS.indexOf(this.weapon);
        for (let k = 0; k < n; k++) {
          i = (((i + Math.sign(inp.cycle)) % n) + n) % n;
          if (this.weaponUnlocked(WEAPONS[i])) break;
        }
        this.switchWeapon(WEAPONS[i]);
      }
    }

    // ---- dodge
    if (inp.dodge && this.rolling <= 0 && this.dodgeCharges > 0 && this.stun <= 0) {
      let dx = inp.mx, dy = inp.my;
      if (dx === 0 && dy === 0) { dx = Math.cos(this.aim); dy = Math.sin(this.aim); }
      const len = Math.hypot(dx, dy) || 1;
      this.rollDx = dx / len;
      this.rollDy = dy / len;
      this.rolling = 0.3;
      if (st.phaseDash) this.startPhase();
      this.invuln = Math.max(this.invuln, 0.26);
      this.dodgeCharges--;
      this.rollHit = false;
      if (this.dodgeRecharge <= 0) this.dodgeRecharge = 0.62 * st.dodgeCdMult;
      // Office Romance: leave a heart where you were standing.
      if (st.romance && this.romanceCd <= 0 && g.phase === "downsizing") {
        this.romanceCd = 5;
        g.dropHeart(this.x, this.y);
      }
      this.laserOn = false;
      g.audio.play("dodge", { vol: 0.5 });
      g.fx.burst("pixel", this.x, this.y + 8, 6, 0xb8bfc9);
      if (st.hotShots) {
        this.hotShots = st.hotShots;
        g.fx.text(this.x, this.y - 44, "HOT DESK!", { color: "#d8a93b", size: 15, pop: true, dur: 0.7 });
      }
    }

    // ---- movement
    const speed = st.moveSpeed * (this.speedBuff > 0 ? 1.3 : 1) * (this.laserOn ? 0.82 : 1);
    if (this.rolling > 0) {
      this.rolling -= dt;
      this.rollNinja(this.x, this.y);
      if (this.phase) {
        const ph = this.phase;
        const s0 = ph.s;
        ph.s = Math.min(ph.dist, ph.s + ph.speed * dt);
        // The dash covers a lot of ground in one frame: Cubicle Ninja and the dodge trails sweep the stretch it
        // just crossed, so nothing in between gets skipped.
        for (let s = s0 + 16; s < ph.s; s += 16) {
          const sx = ph.fx + this.rollDx * s, sy = ph.fy + this.rollDy * s;
          this.rollNinja(sx, sy);
          this.dodgeTrail(sx, sy);
        }
        this.x = ph.fx + this.rollDx * ph.s;
        this.y = ph.fy + this.rollDy * ph.s;
        this.vx = this.rollDx * ph.speed * 0.6;
        this.vy = this.rollDy * ph.speed * 0.6;
        if (this.rolling <= 0) this.finishDash();
      } else {
        const rs = 560 * (0.55 + this.rolling / 0.3 * 0.7);
        this.vx = this.rollDx * rs;
        this.vy = this.rollDy * rs;
      }
      this.dodgeTrail(this.x, this.y);
    } else if (this.stun > 0) {
      this.vx *= Math.pow(0.02, dt);
      this.vy *= Math.pow(0.02, dt);
    } else {
      let mx = inp.mx, my = inp.my;
      const len = Math.hypot(mx, my);
      if (len > 0) { mx /= len; my /= len; }
      const accel = 18;
      this.vx += (mx * speed - this.vx) * Math.min(1, accel * dt);
      this.vy += (my * speed - this.vy) * Math.min(1, accel * dt);
      if (len > 0) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = 0.3;
          this.footstep();
        }
      }
    }
    // Mid-phase the position comes from the dash path (walls don't apply); otherwise walk and collide.
    if (!this.phase) {
      const p = { x: this.x, y: this.y };
      g.world.moveCircle(p, this.r, this.vx * dt, this.vy * dt);
      this.x = p.x;
      this.y = p.y;
    }
    if (g.world.isFloorAt(this.x, this.y)) { this.eyeX = this.x; this.eyeY = this.y; }

    // ---- hazards on the player
    this.environment(dt);


    // ---- weapons
    this.updateWeapons(dt, inp);

    // ---- visuals
    const tex = !this.armed ? "char_hitman1_stand"
      : this.reloading > 0 && this.weapon === "stapler" ? "char_hitman1_reload"
        : `char_hitman1_${WEAPON_DEFS[this.weapon].pose}`;
    if (this.sprite.texture.key !== tex) this.sprite.setTexture(tex);
    this.sprite.setPosition(this.x, this.y).setRotation(this.aim).setDepth(this.y + 4);
    const blink = this.invuln > 0 && this.rolling <= 0 && Math.floor(g.time.now / 70) % 2 === 0;
    this.sprite.setAlpha(this.phase ? 0.5 : blink ? 0.35 : 1);
    if (this.hurtFlash > 0) this.sprite.setTintFill(0xff4040);
    else if (this.phase) this.sprite.setTint(0x9fd8ff);
    else if (this.stun > 0) this.sprite.setTint(0xffe27a);
    else this.sprite.clearTint();
    const sq = this.rolling > 0 ? 0.82 : 1;
    this.sprite.setScale(sq * CHAR_SCALE, CHAR_SCALE);
    this.shadow.setPosition(this.x, this.y + 8).setDepth(this.y - 30);
  }

  /** Open-Plan Office: plan the dash through the walls ahead (GameScene.phasePath checks it end to end). */
  private startPhase() {
    const g = this.g;
    const end = g.phasePath(this.x, this.y, this.rollDx, this.rollDy, this.r, PHASE_LEN, PHASE_EXTRA, this.wallCd <= 0);
    // Through a wall: the next wall waits a moment (Agile Methodology shortens it too).
    if (end.wall) this.wallCd = PHASE_WALL_CD * GameState.stats.dodgeCdMult;
    const dist = Math.hypot(end.x - this.x, end.y - this.y);
    this.phase = { fx: this.x, fy: this.y, dist, s: 0, speed: Math.max(PHASE_LEN, dist) / PHASE_TIME };
    this.rolling = PHASE_TIME;
    g.audio.play("blink", { vol: 0.35, rate: 1.4 });
    // A trail of fading after-images along the way.
    for (let k = 1; k <= 4; k++) {
      const f = k / 5;
      const ghost = g.add.image(this.x + this.rollDx * dist * f, this.y + this.rollDy * dist * f, this.sprite.texture.key)
        .setOrigin(0.42, 0.5).setScale(CHAR_SCALE).setRotation(this.aim).setTint(0x9fd8ff).setAlpha(0.45 * (1 - f * 0.5)).setDepth(this.y + 3);
      g.tweens.add({ targets: ghost, alpha: 0, duration: 260 + k * 40, onComplete: () => ghost.destroy() });
    }
  }

  /** Lands the phase dash at its (checked) end point. Also called when a phase ends early: the day is over, etc. */
  finishDash() {
    const ph = this.phase;
    if (!ph) return;
    const g = this.g;
    this.phase = null;
    this.rolling = 0;
    const p = { x: ph.fx + this.rollDx * ph.dist, y: ph.fy + this.rollDy * ph.dist };
    // Checked when the dash began; if the office changed under it since (a desk slid in), step out of the way,
    // and if that doesn't work, go back to where the dash started (never anywhere further).
    g.world.resolveCircle(p, this.r);
    if (!g.world.circleFree(p.x, p.y, this.r - 1) || (g.inLockedRoom(p.x, p.y) && !g.inLockedRoom(ph.fx, ph.fy))) {
      p.x = ph.fx;
      p.y = ph.fy;
      g.world.resolveCircle(p, this.r);
    }
    this.x = p.x;
    this.y = p.y;
    this.eyeX = p.x;
    this.eyeY = p.y;
    this.vx = this.rollDx * 180;
    this.vy = this.rollDy * 180;
    g.fx.burst("pixel", p.x, p.y, 8, 0x9fd8ff);
  }

  /** New day: forget any dash in progress. */
  cancelDash() {
    this.phase = null;
    this.rolling = 0;
    this.wallCd = 0;
    this.eyeX = this.x;
    this.eyeY = this.y;
  }

  private footstep() {
    const m = this.g.matAt(this.x, this.y);
    const name = m === Mat.WOOD ? "step_wood" : m === Mat.CARPET || m === Mat.CARPET_GREY || m === Mat.CARPET_BEIGE ? "step_carpet" : "step_tile";
    this.g.audio.play(name, { vol: 0.16, jitter: 0.12, minGap: 120 });
  }

  /** Cubicle Ninja: roll (or phase) straight through a coworker, stagger them, keep the dodge. Once per dodge. */
  private rollNinja(x: number, y: number) {
    const st = GameState.stats, g = this.g;
    if (!st.ninja || this.rollHit) return;
    const e = g.nearestEnemy(x, y, this.r + 24);
    if (!e) return;
    this.rollHit = true;
    e.stun = Math.max(e.stun, 1.1);
    g.hitEnemy(e, 12 * st.dmgMult, { angle: Math.atan2(this.rollDy, this.rollDx), kind: "chair", x: e.x, y: e.y, knock: 320 });
    g.fx.text(e.x, e.y - 42, "NINJA'D", { color: "#6aa3b4", size: 15, pop: true, dur: 0.6 });
    this.dodgeCharges = Math.min(st.dodgeCharges, this.dodgeCharges + 1);
  }

  /** Paper / fire / water left behind a dodge (only on open floor: a phase dash inside a wall leaves nothing). */
  private dodgeTrail(x: number, y: number) {
    const st = GameState.stats;
    if (!st.paperTrail && !st.fireTrail && !st.wetFloor) return;
    const i = this.g.hazards.idx(x, y);
    if (i === this.trailTile) return;
    this.trailTile = i;
    if (st.paperTrail) this.g.hazards.addPaper(i);
    if (st.fireTrail && this.g.phase === "downsizing") this.g.hazards.ignite(i, 2.2);
    if (st.wetFloor && this.g.phase === "downsizing") this.g.hazards.addWater(i);
  }

  private environment(dt: number) {
    const g = this.g;
    const st = GameState.stats;
    // Traps are for coworkers: puddles, sparks and flames never hurt (or slow) the boss.
    void dt; void st; void g;
  }

  /** Returns true if this hit was fatal. */
  damage(amount: number, fromX: number, fromY: number, _src = "hit", attacker?: Enemy): boolean {
    const g = this.g;
    if (this.invuln > 0 || this.dead || g.godMode) return false;
    if (attacker && GameState.stats.blame && !attacker.dead && attacker.hostile && !attacker.def.boss) g.makeScapegoat(attacker);
    if (Math.random() < GameState.stats.blockChance) {
      g.fx.text(this.x, this.y - 30, "BLOCKED", { color: "#9fd8ff", size: 16 });
      g.audio.play("ping", { vol: 0.4 });
      this.invuln = 0.4;
      return false;
    }
    if (this.tempHp > 0) {
      const absorbed = Math.min(this.tempHp, amount);
      this.tempHp -= absorbed;
      amount -= absorbed;
    }
    GameState.hp = Math.max(0, GameState.hp - amount);
    GameState.dayStats.damageTaken += amount;
    this.invuln = 1.0;
    this.hurtFlash = 0.1;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.vx += Math.cos(a) * 340;
    this.vy += Math.sin(a) * 340;
    g.fx.shake(0.45);
    g.fx.stop(60);
    g.audio.play("hurt", { vol: 0.6 });
    g.cameras.main.flash(90, 255, 40, 40, false);
    g.onPlayerHurt();
    if (GameState.hp <= 0) {
      if (GameState.revivesLeft > 0) {
        GameState.revivesLeft = 0;
        GameState.stacks["parachute"] = 0;
        GameState.hp = GameState.stats.maxHp;
        this.invuln = 2.5;
        g.onRevive();
        return false;
      }
      this.dead = true;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- weapons
  private updateWeapons(dt: number, inp: PlayerInput) {
    const st = GameState.stats;
    const g = this.g;
    // Battery recharges when idle.
    if (!this.laserOn) {
      this.batteryIdle += dt;
      if (this.batteryIdle > 0.6) this.battery = Math.min(this.maxBattery, this.battery + 16 * dt);
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.mag = this.maxMag;
        g.audio.play("reload_done", { vol: 0.4 });
      }
    }
    if (!this.armed || this.rolling > 0 || this.stun > 0) {
      this.laserOn = false;
      return;
    }
    if (inp.reload && this.weapon === "stapler" && this.mag < this.maxMag && this.reloading <= 0) this.startReload();

    const muzzleX = this.x + Math.cos(this.aim) * 26 + Math.cos(this.aim + Math.PI / 2) * 7;
    const muzzleY = this.y + Math.sin(this.aim) * 26 + Math.sin(this.aim + Math.PI / 2) * 7;

    if (this.weapon === "laser") {
      this.laserOn = inp.fire && this.battery > 0;
      if (this.laserOn) {
        this.batteryIdle = 0;
        this.battery = Math.max(0, this.battery - 30 * st.laserDrainMult * dt);
        g.fireLaser(muzzleX, muzzleY, this.aim, dt);
        if (this.battery <= 0) g.audio.play("powerdown", { vol: 0.4, minGap: 600 });
      }
      return;
    }
    this.laserOn = false;
    if (this.fireCd > 0) return;
    const cdBefore = this.fireCd;
    this.fireWeapon(st, g, inp, muzzleX, muzzleY);
    this.dugInBonus(cdBefore);
  }

  private fireWeapon(st: typeof GameState.stats, g: GameScene, inp: PlayerInput, muzzleX: number, muzzleY: number) {
    // The stapler and toner are one shot per click; everything else fires while held.
    const semi = this.weapon === "stapler" || this.weapon === "toner";
    if (semi ? this.fireBuffer <= 0 : !inp.fire) return;
    if (semi) this.fireBuffer = 0;

    if (this.weapon === "stapler") {
      if (this.reloading > 0) return;
      if (this.mag <= 0) { this.startReload(); return; }
      this.mag--;
      this.fireCd = 0.1 / st.fireRateMult;
      const n = 1 + st.multishot;
      const fan = 0.075;
      const hot = this.hotShots > 0;
      if (hot) this.hotShots--;
      for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * fan + rand(-0.035, 0.035);
        const pr = g.projectiles.firePlayer("staple", muzzleX, muzzleY, this.aim + off);
        if (hot) g.projectiles.makeHot(pr);
      }
      if (st.replyall) {
        this.replyCount++;
        if (this.replyCount >= (st.replyall >= 2 ? 4 : 5)) {
          this.replyCount = 0;
          const ring = 10 + st.replyall * 2;
          for (let k = 0; k < ring; k++) {
            const pr = g.projectiles.firePlayer("staple", this.x, this.y, this.aim + (k / ring) * Math.PI * 2);
            pr.dmg *= 0.6;
          }
          g.fx.burst("star", this.x, this.y, 10, 0x6aa3b4);
          g.audio.play("ping", { vol: 0.35, rate: 0.9 });
        }
      }
      GameState.dayStats.shots++;
      g.audio.play("staple", { vol: 0.32, rate: 1.25, jitter: 0.1, minGap: 25 });
      g.fx.light(muzzleX, muzzleY, 0xfff1c0, 0.5, 0.06);
      this.kick(60);
      if (this.mag <= 0) this.startReload();
    } else if (this.weapon === "coffee") {
      if (this.cups <= 0) {
        g.audio.play("error", { vol: 0.3, minGap: 400 });
        g.fx.text(this.x, this.y - 34, "OUT OF COFFEE", { color: "#d9a46a", size: 14, dur: 0.7 });
        this.fireCd = 0.4;
        return;
      }
      this.cups--;
      this.fireCd = 0.72 / st.fireRateMult;
      const n = 7 + st.multishot * 2 + st.espresso * 4;
      const spread = 0.62 * Math.pow(0.75, st.espresso);
      const hot = this.hotShots > 0;
      if (hot) this.hotShots--;
      for (let k = 0; k < n; k++) {
        const off = (k / (n - 1) - 0.5) * spread + rand(-0.05, 0.05);
        const pr = g.projectiles.firePlayer("coffee", muzzleX, muzzleY, this.aim + off, rand(0.85, 1.15));
        if (hot) g.projectiles.makeHot(pr);
      }
      GameState.dayStats.shots++;
      g.audio.play("splash", { vol: 0.55, rate: 1.1 });
      g.fx.spray("coffee", muzzleX, muzzleY, 10, this.aim, 22);
      g.fx.shake(0.12);
      this.kick(180);
    } else if (this.weapon === "planes") {
      if (this.inbox <= 0) { this.dry("INBOX EMPTY"); return; }
      this.inbox--;
      this.fireCd = 0.24 / st.fireRateMult;
      const n = 1 + st.multishot;
      const hot = this.takeHot();
      for (let k = 0; k < n; k++) {
        const pr = g.projectiles.firePlayer("plane", muzzleX, muzzleY, this.aim + (k - (n - 1) / 2) * 0.24);
        if (hot) g.projectiles.makeHot(pr);
      }
      GameState.dayStats.shots++;
      g.audio.play("paper", { vol: 0.4, rate: 1.4, jitter: 0.1, minGap: 40 });
      this.kick(30);
    } else if (this.weapon === "toner") {
      if (this.toner <= 0) { this.dry("OUT OF TONER"); return; }
      this.toner--;
      this.fireCd = 0.45;
      const dist = clamp(Math.hypot(inp.aimX - muzzleX, inp.aimY - muzzleY), 90, 560);
      g.projectiles.lobToner(muzzleX, muzzleY, this.aim, dist);
      GameState.dayStats.shots++;
      g.audio.play("dodge", { vol: 0.5, rate: 0.75 });
      this.kick(80);
    } else if (this.weapon === "confetti") {
      if (this.paper < 1) { this.dry("OUT OF PAPER"); return; }
      this.paper -= 1;
      this.paperIdle = 0;
      this.fireCd = 0.06 / st.fireRateMult;
      const n = 1 + Math.ceil(st.multishot / 2);
      for (let k = 0; k < n; k++) g.projectiles.firePlayer("confetti", muzzleX, muzzleY, this.aim + rand(-0.13, 0.13), rand(0.85, 1.15));
      GameState.dayStats.shots++;
      g.audio.play("click", { vol: 0.16, rate: 1.6, jitter: 0.15, minGap: 45 });
      if (chance(0.3)) g.fx.burst("confetti", muzzleX, muzzleY, 1);
      this.kick(12);
    } else if (this.weapon === "mister") {
      if (this.tank < 1) { this.dry("TANK EMPTY"); return; }
      this.tank = Math.max(0, this.tank - 2.2);
      this.tankIdle = 0;
      this.fireCd = 0.045;
      for (let k = 0; k < 2; k++) g.projectiles.firePlayer("drop", muzzleX, muzzleY, this.aim + rand(-0.2, 0.2), rand(0.75, 1.15));
      g.audio.play("splash", { vol: 0.12, rate: 1.7, jitter: 0.2, minGap: 140 });
    } else if (this.weapon === "keyboard") {
      this.fireCd = 0.4 / st.fireRateMult;
      g.keyboardSwing(this.x, this.y, this.aim, this.takeHot());
      GameState.dayStats.shots++;
      this.kick(-140);
    } else if (this.weapon === "slips") {
      this.fireCd = 0.36 / st.fireRateMult;
      const n = 3 + st.multishot;
      const hot = this.takeHot();
      for (let k = 0; k < n; k++) {
        const pr = g.projectiles.firePlayer("slip", muzzleX, muzzleY, this.aim + (k - (n - 1) / 2) * 0.15);
        if (hot) g.projectiles.makeHot(pr);
      }
      GameState.dayStats.shots++;
      g.audio.play("paper", { vol: 0.45, rate: 0.85, jitter: 0.1, minGap: 60 });
      this.kick(40);
    }
  }

  /** Corner Office trims the cooldown of whatever just fired. */
  private dugInBonus(before: number) {
    if (this.dugIn && this.fireCd > before) this.fireCd *= 0.7;
  }

  private takeHot() {
    if (this.hotShots <= 0) return false;
    this.hotShots--;
    return true;
  }

  private dry(label: string) {
    this.fireCd = 0.35;
    this.g.audio.play("error", { vol: 0.3, minGap: 400 });
    this.g.fx.text(this.x, this.y - 34, label, { color: "#e9c25a", size: 14, dur: 0.7 });
  }

  private kick(force: number) {
    this.vx -= Math.cos(this.aim) * force;
    this.vy -= Math.sin(this.aim) * force;
  }

  startReload() {
    if (this.reloading > 0) return;
    this.reloading = 0.95 * GameState.stats.reloadMult;
    this.g.audio.play("reload", { vol: 0.4 });
    const md = GameState.stats.micdrop;
    if (md && this.armed) this.g.shockwave(this.x, this.y, 150 + md * 30, 24 * md * GameState.stats.dmgMult, 0.4, 0x6aa3b4, "MIC DROP");
  }

  /** Called every frame while E is held near nothing: drop / pick up shred paper toggle. */
  toggleDropPaper() {
    this.dropPaper = !this.dropPaper;
  }

  aimAngleTo(x: number, y: number) {
    return angleDiff(this.aim, Math.atan2(y - this.y, x - this.x));
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

export const tileOf = (v: number) => Math.floor(v / TILE);
export const clampAim = clamp;
