import Phaser from "phaser";
import { CHAR_SCALE, PLAYER_RADIUS, TILE } from "../config";
import { GameState } from "../systems/GameState";
import { angleDiff, clamp, rand } from "../util/math";
import { Mat } from "../world/OfficeMap";
import type { GameScene } from "../scenes/GameScene";

export type WeaponId = "stapler" | "coffee" | "laser";
export const WEAPONS: WeaponId[] = ["stapler", "coffee", "laser"];

export interface PlayerInput {
  mx: number;
  my: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  dodge: boolean;
  reload: boolean;
  switchTo: number | null;
  cycle: number;
}

const STAPLER_BASE_MAG = 12;
const COFFEE_BASE_CUPS = 8;
const LASER_BATTERY = 100;

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

  shredBag = 0;
  dropPaper = true;
  private lastPaperTile = -1;
  private trailTile = -1;
  private stepTimer = 0;
  dead = false;

  constructor(g: GameScene, x: number, y: number) {
    this.g = g;
    this.x = x;
    this.y = y;
    this.shadow = g.add.image(x, y + 6, "shadow").setScale(0.9 * CHAR_SCALE);
    this.sprite = g.add.image(x, y, "char_hitman1_stand").setOrigin(0.42, 0.5).setScale(CHAR_SCALE);
    this.dodgeCharges = GameState.stats.dodgeCharges;
    this.refill();
  }

  get maxMag() { return STAPLER_BASE_MAG + GameState.stats.magBonus + this.dayMagBonus; }
  get maxCups() { return COFFEE_BASE_CUPS + GameState.stats.coffeeCupsBonus + this.dayCupBonus; }
  get maxBattery() { return LASER_BATTERY * GameState.stats.batteryMult; }
  get hp() { return GameState.hp; }

  refill() {
    this.mag = this.maxMag;
    this.cups = this.maxCups;
    this.battery = this.maxBattery;
    this.reloading = 0;
  }

  setArmed(armed: boolean) {
    this.armed = armed;
    if (!armed) this.laserOn = false;
  }

  weaponUnlocked(w: WeaponId) {
    return w === "stapler" || (w === "coffee" && GameState.unlocked.coffee) || (w === "laser" && GameState.unlocked.laser);
  }

  switchWeapon(w: WeaponId) {
    if (!this.weaponUnlocked(w) || w === this.weapon) return;
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
    if (this.speedBuff > 0) this.speedBuff -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;

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
      if (inp.switchTo !== null) this.switchWeapon(WEAPONS[inp.switchTo]);
      if (inp.cycle !== 0) {
        let i = WEAPONS.indexOf(this.weapon);
        for (let k = 0; k < 3; k++) {
          i = (i + inp.cycle + 3) % 3;
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
      this.invuln = Math.max(this.invuln, 0.26);
      this.dodgeCharges--;
      if (this.dodgeRecharge <= 0) this.dodgeRecharge = 0.62 * st.dodgeCdMult;
      this.laserOn = false;
      g.audio.play("dodge", { vol: 0.5 });
      g.fx.burst("pixel", this.x, this.y + 8, 6, 0xb8bfc9);
    }

    // ---- movement
    const speed = st.moveSpeed * (this.speedBuff > 0 ? 1.3 : 1) * (this.laserOn ? 0.82 : 1);
    if (this.rolling > 0) {
      this.rolling -= dt;
      const rs = 560 * (0.55 + this.rolling / 0.3 * 0.7);
      this.vx = this.rollDx * rs;
      this.vy = this.rollDy * rs;
      this.dodgeTrail();
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
    const p = { x: this.x, y: this.y };
    g.world.moveCircle(p, this.r, this.vx * dt, this.vy * dt);
    this.x = p.x;
    this.y = p.y;

    // ---- hazards on the player
    this.environment(dt);

    // ---- paper trail from the shred bag
    if (this.shredBag > 0 && this.dropPaper) {
      const i = g.hazards.idx(this.x, this.y);
      if (i !== this.lastPaperTile) {
        this.lastPaperTile = i;
        if (g.hazards.addPaper(i)) {
          this.shredBag--;
          if (Math.random() < 0.4) g.audio.play("paper", { vol: 0.25, minGap: 80 });
        }
      }
    }

    // ---- weapons
    this.updateWeapons(dt, inp);

    // ---- visuals
    const tex = !this.armed ? "char_hitman1_stand"
      : this.reloading > 0 ? "char_hitman1_reload"
        : this.weapon === "stapler" ? "char_hitman1_gun"
          : this.weapon === "coffee" ? "char_hitman1_silencer" : "char_hitman1_machine";
    if (this.sprite.texture.key !== tex) this.sprite.setTexture(tex);
    this.sprite.setPosition(this.x, this.y).setRotation(this.aim).setDepth(this.y + 4);
    const blink = this.invuln > 0 && this.rolling <= 0 && Math.floor(g.time.now / 70) % 2 === 0;
    this.sprite.setAlpha(blink ? 0.35 : 1);
    if (this.hurtFlash > 0) this.sprite.setTintFill(0xff4040); else if (this.stun > 0) this.sprite.setTint(0xffe27a); else this.sprite.clearTint();
    const sq = this.rolling > 0 ? 0.82 : 1;
    this.sprite.setScale(sq * CHAR_SCALE, CHAR_SCALE);
    this.shadow.setPosition(this.x, this.y + 8).setDepth(this.y - 30);
  }

  private footstep() {
    const m = this.g.matAt(this.x, this.y);
    const name = m === Mat.WOOD ? "step_wood" : m === Mat.CARPET || m === Mat.CARPET_GREY || m === Mat.CARPET_BEIGE ? "step_carpet" : "step_tile";
    this.g.audio.play(name, { vol: 0.16, jitter: 0.12, minGap: 120 });
  }

  private dodgeTrail() {
    const st = GameState.stats;
    if (!st.paperTrail && !st.fireTrail) return;
    const i = this.g.hazards.idx(this.x, this.y);
    if (i === this.trailTile) return;
    this.trailTile = i;
    if (st.paperTrail) this.g.hazards.addPaper(i);
    if (st.fireTrail && this.g.phase === "downsizing") this.g.hazards.ignite(i, 2.2);
  }

  private environment(dt: number) {
    const g = this.g;
    const st = GameState.stats;
    // Traps are for coworkers: puddles, sparks and flames never hurt (or slow) the boss.
    void dt; void st; void g;
  }

  /** Returns true if this hit was fatal. */
  damage(amount: number, fromX: number, fromY: number, _src = "hit"): boolean {
    const g = this.g;
    if (this.invuln > 0 || this.dead || g.godMode) return false;
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
    if (!inp.fire || this.fireCd > 0) return;

    if (this.weapon === "stapler") {
      if (this.reloading > 0) return;
      if (this.mag <= 0) { this.startReload(); return; }
      this.mag--;
      this.fireCd = 0.15 / st.fireRateMult;
      const n = 1 + st.multishot;
      const fan = 0.075;
      for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * fan + rand(-0.035, 0.035);
        g.projectiles.firePlayer("staple", muzzleX, muzzleY, this.aim + off);
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
      const n = 7 + st.multishot * 2;
      for (let k = 0; k < n; k++) {
        const off = (k / (n - 1) - 0.5) * 0.62 + rand(-0.05, 0.05);
        g.projectiles.firePlayer("coffee", muzzleX, muzzleY, this.aim + off, rand(0.85, 1.15));
      }
      GameState.dayStats.shots++;
      g.audio.play("splash", { vol: 0.55, rate: 1.1 });
      g.fx.spray("coffee", muzzleX, muzzleY, 10, this.aim, 22);
      g.fx.shake(0.12);
      this.kick(180);
    }
  }

  private kick(force: number) {
    this.vx -= Math.cos(this.aim) * force;
    this.vy -= Math.sin(this.aim) * force;
  }

  startReload() {
    if (this.reloading > 0) return;
    this.reloading = 0.95 * GameState.stats.reloadMult;
    this.g.audio.play("reload", { vol: 0.4 });
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
