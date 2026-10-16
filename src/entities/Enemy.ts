import Phaser from "phaser";
import { CHAR_SCALE, DEPTH, TILE } from "../config";
import { ENEMIES, EnemyDef, EnemyType } from "../data/enemies";
import { HOSTILE_BARKS, NPC_IDLE } from "../data/lines";
import { GameState } from "../systems/GameState";
import { angleDiff, chance, pick, rand } from "../util/math";
import { findPath } from "../world/Nav";
import type { GameScene } from "../scenes/GameScene";

let NEXT_ID = 1;

type Mode = "npc" | "hostile" | "ally";

export class Enemy {
  id = NEXT_ID++;
  g: GameScene;
  def: EnemyDef;
  type: EnemyType;
  mode: Mode;
  x: number;
  y: number;
  r: number;
  vx = 0;
  vy = 0;
  facing: number;
  hp: number;
  maxHp: number;
  speed: number;
  dead = false;

  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  shield?: Phaser.GameObjects.Image;
  hpBar?: Phaser.GameObjects.Graphics;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleTimer = 0;

  // status effects
  stun = 0;
  slip = 0;
  slipCd = 0;
  burn = 0;
  burnDps = 0;
  slow = 0;
  shockCd = 0;
  hitFlash = 0;
  fireTickCd = 0;

  // AI
  private attackCd = rand(0.3, 0.9);
  private rangedCd = rand(0.6, 1.6);
  private pulseCd = rand(2.5, 4);
  private strafeDir = chance(0.5) ? 1 : -1;
  private strafeTimer = rand(1, 2.5);
  private losTimer = rand(0, 0.2);
  private hasLos = false;
  private stuckTimer = 0;
  private dodgeCd = 0;
  private barkCd = rand(3, 9);
  private windup = 0;
  private bossSummonCd = 7;
  private chargeCd = 5;
  private charging = 0;
  private chargeWind = 0;
  allyLife = 0;
  spawnGrace = 0;

  // NPC wandering
  home: { x: number; y: number; facing: number } | null = null;
  private path: { x: number; y: number }[] = [];
  private npcTimer = rand(2, 9);
  private npcState: "sit" | "walk" | "loiter" | "return" = "sit";
  private talkCd = rand(1, 5);

  constructor(g: GameScene, type: EnemyType, x: number, y: number, mode: Mode) {
    this.g = g;
    this.def = ENEMIES[type];
    this.type = type;
    this.mode = mode;
    this.x = x;
    this.y = y;
    this.r = this.def.radius * (1 + (CHAR_SCALE - 1) * 0.5);
    const day = g.dayCfg;
    this.maxHp = this.hp = this.def.hp * (mode === "ally" ? 1.5 : day.hpMult);
    this.speed = this.def.speed * (mode === "ally" ? 1.1 : day.speedMult) * rand(0.92, 1.08);
    this.facing = rand(-Math.PI, Math.PI);

    const spr = pick(this.def.sprites);
    const texKey = mode === "npc" ? `char_${spr.replace(/_(hold|gun|machine)$/, "_stand")}` : `char_${spr}`;
    this.shadow = g.add.image(x, y, "shadow").setScale(this.def.scale * 0.95 * CHAR_SCALE);
    this.sprite = g.add.image(x, y, g.textures.exists(texKey) ? texKey : `char_${spr}`).setOrigin(0.42, 0.5).setScale(this.def.scale * CHAR_SCALE);
    this.sprite.setData("tex", `char_${spr}`);
    if (this.def.tint) this.sprite.setTint(this.def.tint);
    if (mode === "ally") this.sprite.setTint(0x9dffb0);
    if (this.def.shield && mode !== "npc") this.addShield();
  }

  /** Ambusher: stands in its room waiting until the boss wanders close (or it gets bored). */
  lurking = false;
  lurkLeft = 0;

  get hostile() { return this.mode === "hostile"; }
  get ally() { return this.mode === "ally"; }

  private addShield() {
    this.shield = this.g.add.image(this.x, this.y, "shield").setScale(this.def.scale * 0.85 * CHAR_SCALE);
  }

  /** 5 PM: the coworker snaps. */
  turnHostile() {
    this.mode = "hostile";
    this.sprite.setTexture(this.sprite.getData("tex"));
    this.path = [];
    this.spawnGrace = rand(0.3, 1.0);
    if (this.def.shield && !this.shield) this.addShield();
  }

  wake() {
    if (!this.lurking) return;
    this.lurking = false;
    this.spawnGrace = rand(0.2, 0.6);
    if (this.g.canBark()) this.say(pick(["Found you!", "Gotcha, boss.", "Nothing personal.", "Is it five already?"]), 1.6);
  }

  private updateLurk(dt: number) {
    const g = this.g;
    this.vx *= Math.pow(0.001, dt);
    this.vy *= Math.pow(0.001, dt);
    this.lurkLeft -= dt;
    const d = Math.hypot(g.player.x - this.x, g.player.y - this.y);
    if (d < 340 || this.lurkLeft <= 0) this.wake();
  }

  makeAlly(life: number) {
    this.mode = "ally";
    this.allyLife = life;
    this.sprite.setTexture(this.sprite.getData("tex")).setTint(0x9dffb0);
  }

  say(text: string, dur = 2.2, color = "#1d2129") {
    if (!this.bubble) {
      this.bubble = this.g.add.text(this.x, this.y - 40, "", {
        fontFamily: "Inter, sans-serif", fontSize: "13px", fontStyle: "bold", color,
        backgroundColor: "#ffffffee", padding: { x: 6, y: 3 }, align: "center", wordWrap: { width: 190 }
      }).setOrigin(0.5, 1).setDepth(DEPTH.WORLD_UI - 1).setResolution(2);
    }
    this.bubble.setText(text).setColor(color).setVisible(true);
    this.bubble.setBackgroundColor(color === "#1d2129" ? "#ffffffee" : "#1d2129ee");
    this.bubbleTimer = dur;
  }

  /** Riot shield blocks shots coming at the front 110°. */
  blocksShot(shotAngle: number): boolean {
    if (!this.def.shield || this.stun > 0 || this.slip > 0 || this.mode !== "hostile") return false;
    const incoming = shotAngle + Math.PI;
    return Math.abs(angleDiff(this.facing, incoming)) < 0.95;
  }

  takeDamage(amount: number, angle: number, knock: number) {
    if (this.dead) return false;
    this.hp -= amount;
    this.hitFlash = 0.08;
    const kb = knock * (this.def.boss ? 0.15 : this.type === "hr" ? 0.35 : 1);
    this.vx += Math.cos(angle) * kb;
    this.vy += Math.sin(angle) * kb;
    if (this.mode === "npc") this.turnHostile();
    this.wake();
    return this.hp <= 0;
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    if (this.stun > 0) this.stun -= dt;
    if (this.slipCd > 0) this.slipCd -= dt;
    if (this.slow > 0) this.slow -= dt;
    if (this.shockCd > 0) this.shockCd -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.spawnGrace > 0) this.spawnGrace -= dt;
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) this.bubble?.setVisible(false);
    }

    if (this.burn > 0) {
      this.burn -= dt;
      this.fireTickCd -= dt;
      if (this.fireTickCd <= 0) {
        this.fireTickCd = 0.25;
        if (g.hitEnemy(this, this.burnDps * 0.25, { angle: 0, kind: "fire", x: this.x, y: this.y, knock: 0, silent: true })) { g.trapKill(this.x, this.y); return; }
        g.fx.burst("fire", this.x + rand(-8, 8), this.y + rand(-8, 8), 1);
        // Burning coworkers ignite the paper they run through.
        g.hazards.igniteAt(this.x, this.y);
      }
    }

    if (this.mode === "npc") this.updateNpc(dt);
    else if (this.mode === "ally") this.updateAlly(dt);
    else if (this.lurking) this.updateLurk(dt);
    else this.updateHostile(dt);

    if (this.dead) return;
    this.environment(dt);

    // Integrate + collide.
    const p = { x: this.x, y: this.y };
    g.world.moveCircle(p, this.r, this.vx * dt, this.vy * dt);
    const moved = Math.hypot(p.x - this.x, p.y - this.y);
    this.x = p.x;
    this.y = p.y;
    const wantMove = Math.hypot(this.vx, this.vy) * dt;
    if (this.mode !== "npc" && wantMove > 1 && moved < wantMove * 0.25) this.stuckTimer += dt; else this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    // Safety valve: never leave a straggler wedged inside furniture (it would soft-lock the quota).
    if (this.stuckTimer > 3 && !g.world.walkableTile(Math.floor(this.x / TILE), Math.floor(this.y / TILE))) {
      const free = g.world.nearestWalkable(this.x, this.y);
      this.x = free.x;
      this.y = free.y;
      this.stuckTimer = 0;
    }

    this.render(dt);
  }

  private steer(dx: number, dy: number, speed: number, dt: number, accel = 9) {
    const slowMult = this.slow > 0 ? 0.55 : 1;
    const tvx = dx * speed * slowMult, tvy = dy * speed * slowMult;
    const k = Math.min(1, accel * dt);
    this.vx += (tvx - this.vx) * k;
    this.vy += (tvy - this.vy) * k;
  }

  private separation(): { x: number; y: number } {
    let sx = 0, sy = 0;
    for (const o of this.g.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.x - o.x, dy = this.y - o.y;
      const rr = this.r + o.r + 6;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      sx += (dx / d) * (rr - d) / rr;
      sy += (dy / d) * (rr - d) / rr;
    }
    return { x: sx, y: sy };
  }

  // ---------------------------------------------------------------- hostile AI
  private updateHostile(dt: number) {
    const g = this.g;
    const pl = g.player;
    if (this.spawnGrace > 0 || this.stun > 0) {
      this.vx *= Math.pow(0.01, dt);
      this.vy *= Math.pow(0.01, dt);
      return;
    }
    if (this.slip > 0) {
      // Sliding helplessly across the puddle.
      this.slip -= dt;
      this.vx *= Math.pow(0.35, dt);
      this.vy *= Math.pow(0.35, dt);
      this.facing += dt * 14;
      return;
    }

    const target = this.pickTarget();
    const tx = target.x, ty = target.y;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.18 + rand(0, 0.08);
      this.hasLos = d < 900 && g.world.los(this.x, this.y, tx, ty);
    }

    const wantFacing = Math.atan2(dy, dx);
    const turnRate = this.def.shield ? 2.6 : 12;
    this.facing += Phaser.Math.Clamp(angleDiff(this.facing, wantFacing), -turnRate * dt, turnRate * dt);

    // Movement direction: straight at the target if visible, else follow the flow field.
    let mvx = 0, mvy = 0;
    const field = this.def.smart ? g.flowSmart : g.flowNaive;
    const goStraight = this.hasLos && d < 520 && target === pl;
    if (goStraight || target !== pl) {
      mvx = dx / d; mvy = dy / d;
    } else {
      const dir = field.direction(this.x, this.y);
      if (dir) { mvx = dir.x; mvy = dir.y; } else { mvx = dx / d; mvy = dy / d; }
    }

    let speed = this.speed;
    const R = this.def.ranged;
    if (R && this.hasLos && target === pl) {
      // Keep a comfortable firing distance and strafe.
      const [near, far] = R.keepDist;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = rand(1.2, 2.8); this.strafeDir *= -1; }
      const px = -dy / d * this.strafeDir, py = dx / d * this.strafeDir;
      if (d < near) { mvx = -dx / d * 0.8 + px * 0.6; mvy = -dy / d * 0.8 + py * 0.6; }
      else if (d < far) { mvx = px * 0.9 + dx / d * 0.15; mvy = py * 0.9 + dy / d * 0.15; speed *= 0.7; }
      this.rangedCd -= dt;
      if (this.rangedCd <= 0 && d < R.range) {
        this.windup += dt;
        if (this.windup > (this.def.boss ? 0.45 : 0.22)) {
          this.windup = 0;
          this.rangedCd = R.cooldown * rand(0.85, 1.15);
          this.shoot(tx, ty);
        }
      }
    }

    // THE CONSULTANT: telegraphed charges and intern reinforcements.
    if (this.def.boss) {
      this.bossSummonCd -= dt;
      if (this.bossSummonCd <= 0) {
        this.bossSummonCd = rand(8, 11);
        this.say("BRING IN THE INTERNS!", 1.6, "#ffd75a");
        g.audio.play("alert", { vol: 0.4 });
        for (let k = 0; k < 2 + Math.floor(g.dayCfg.day / 5); k++) {
          const a = rand(0, Math.PI * 2);
          const p = g.world.nearestWalkable(this.x + Math.cos(a) * 70, this.y + Math.sin(a) * 70);
          const e = g.spawnEnemy("intern", p.x, p.y, "hostile");
          e.spawnGrace = 0.5;
          g.fx.burst("confetti", p.x, p.y, 8);
        }
      }
      if (this.charging > 0) {
        this.charging -= dt;
        this.facing = Math.atan2(this.vy, this.vx);
        if (chance(0.5)) g.fx.burst("pixel", this.x, this.y, 2, 0xffd7a8);
        if (d < this.r + pl.r + 8 && this.attackCd <= 0) {
          this.attackCd = 1;
          pl.damage(2, this.x, this.y, "charge");
        }
        this.attackCd -= dt;
        return;
      }
      this.chargeCd -= dt;
      if (this.chargeCd <= 0 && this.hasLos && d < 600) {
        this.chargeWind += dt;
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.chargeWind > 0.7) {
          this.chargeWind = 0;
          this.chargeCd = rand(5, 7);
          this.charging = 0.75;
          this.vx = (dx / d) * 820;
          this.vy = (dy / d) * 820;
          g.audio.play("dodge", { vol: 0.6, rate: 0.6 });
          g.fx.shake(0.2);
        }
        return;
      }
    }

    // Robots sidestep when the player aims at them.
    if (this.def.dodgy && this.dodgeCd <= 0 && target === pl && Math.abs(pl.aimAngleTo(this.x, this.y)) < 0.12 && d < 600 && chance(0.6 * dt * 10)) {
      this.dodgeCd = 1.4;
      const side = chance(0.5) ? 1 : -1;
      this.vx += -dy / d * 520 * side;
      this.vy += dx / d * 520 * side;
      g.fx.burst("spark", this.x, this.y, 4, 0x6fd8ff);
    }
    if (this.dodgeCd > 0) this.dodgeCd -= dt;

    // HR megaphone: stun cone.
    if (this.def.megaphone) {
      this.pulseCd -= dt;
      if (this.pulseCd <= 0 && d < 330 && this.hasLos && target === pl) {
        this.pulseCd = rand(4, 6);
        this.say("ATTENTION ALL STAFF!", 1.2, "#ffd75a");
        g.audio.play("megaphone", { vol: 0.5 });
        for (let k = -1; k <= 1; k++) g.projectiles.fireEnemy("wave", this.x, this.y, this.facing + k * 0.22, 360, 1);
      }
    }

    // Separation so the mob doesn't stack into one blob.
    const sep = this.separation();
    mvx += sep.x * 1.4; mvy += sep.y * 1.4;
    if (this.stuckTimer > 0.6) {
      mvx += rand(-1, 1); mvy += rand(-1, 1);
      this.attackBarricade(dt);
    }
    const ml = Math.hypot(mvx, mvy);
    if (ml > 0.001) { mvx /= ml; mvy /= ml; }
    this.steer(mvx, mvy, speed, dt);

    // Melee.
    this.attackCd -= dt;
    const reach = this.r + (target === pl ? pl.r : 14) + 6;
    if (d < reach && this.attackCd <= 0) {
      this.attackCd = this.def.boss ? 1.0 : 0.85;
      if (target === pl) {
        pl.damage(this.def.melee, this.x, this.y, "melee");
      } else if (target instanceof Enemy) {
        target.takeDamage(12 * g.dayCfg.hpMult, wantFacing, 140);
        if (target.hp <= 0) g.killEnemy(target, false);
      }
      this.vx += Math.cos(wantFacing) * 120;
      this.vy += Math.sin(wantFacing) * 120;
    }

    this.barkCd -= dt;
    if (this.barkCd <= 0 && d < 600) {
      this.barkCd = rand(6, 14);
      if (g.canBark()) this.say(pick(HOSTILE_BARKS), 1.6, "#ff6b6b");
    }
  }

  private pickTarget(): { x: number; y: number } {
    // Hostiles chase allies that get close; otherwise the player.
    const g = this.g;
    let best: Enemy | null = null;
    let bd = 200 * 200;
    for (const a of g.enemies) {
      if (!a.ally || a.dead) continue;
      const d2 = (a.x - this.x) ** 2 + (a.y - this.y) ** 2;
      if (d2 < bd) { bd = d2; best = a; }
    }
    return best ?? g.player;
  }

  private shoot(tx: number, ty: number) {
    const g = this.g;
    const R = this.def.ranged!;
    // Lead the target a little.
    const pl = g.player;
    const t = Math.hypot(tx - this.x, ty - this.y) / R.speed;
    const ax = tx + pl.vx * t * 0.5, ay = ty + pl.vy * t * 0.5;
    const base = Math.atan2(ay - this.y, ax - this.x);
    for (let k = 0; k < R.count; k++) {
      const off = (k - (R.count - 1) / 2) * R.spread + rand(-0.04, 0.04);
      g.projectiles.fireEnemy(R.kind, this.x + Math.cos(base) * 20, this.y + Math.sin(base) * 20, base + off, R.speed, R.dmg);
    }
    g.audio.play(R.kind === "bolt" ? "laser" : "dodge", { vol: R.kind === "bolt" ? 0.25 : 0.2, rate: R.kind === "bolt" ? 1.5 : 1.6, minGap: 80 });
    this.vx -= Math.cos(base) * 50;
    this.vy -= Math.sin(base) * 50;
  }

  private attackBarricade(dt: number) {
    const g = this.g;
    // Find a barricade collider right next to us and chip at it.
    const b = g.barricadeNear(this.x, this.y, this.r + 20);
    if (b) {
      if (this.attackCd <= 0) {
        this.attackCd = 0.7;
        g.damageBarricade(b, 10 * (this.def.boss ? 6 : this.type === "hr" ? 3 : 1));
      }
    }
  }

  // ---------------------------------------------------------------- allies
  private updateAlly(dt: number) {
    const g = this.g;
    this.allyLife -= dt;
    if (this.allyLife <= 0) {
      g.fx.burst("confetti", this.x, this.y, 10);
      g.fx.text(this.x, this.y - 30, "INTERNSHIP OVER", { color: "#9dffb0", size: 13 });
      this.dead = true;
      g.removeEnemy(this);
      return;
    }
    if (this.stun > 0) { this.vx *= 0.9; this.vy *= 0.9; return; }
    const target = g.nearestEnemy(this.x, this.y, 700);
    let mvx = 0, mvy = 0;
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.facing = Math.atan2(dy, dx);
      mvx = dx / d; mvy = dy / d;
      this.attackCd -= dt;
      if (d < this.r + target.r + 8 && this.attackCd <= 0) {
        this.attackCd = 0.55;
        g.hitEnemy(target, 16 * GameState.stats.dmgMult, { angle: this.facing, kind: "ally", x: target.x, y: target.y, knock: 180 });
      }
    } else {
      // Follow the boss around.
      const dx = g.player.x - this.x, dy = g.player.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 90) { mvx = dx / d; mvy = dy / d; }
      this.facing = Math.atan2(dy, dx);
    }
    const sep = this.separation();
    mvx += sep.x; mvy += sep.y;
    const ml = Math.hypot(mvx, mvy);
    if (ml > 0) { mvx /= ml; mvy /= ml; }
    this.steer(mvx, mvy, this.speed * (ml > 0 ? 1 : 0), dt);
  }

  // ---------------------------------------------------------------- phase 1 NPC
  private updateNpc(dt: number) {
    const g = this.g;
    this.npcTimer -= dt;
    this.talkCd -= dt;
    const pl = g.player;
    const pd = Math.hypot(pl.x - this.x, pl.y - this.y);
    if (pd < 110 && this.talkCd <= 0 && g.canBark()) {
      this.talkCd = rand(10, 18);
      this.say(pick(NPC_IDLE), 2.6);
    }

    if (this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.x, dy = wp.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 18) {
        this.path.shift();
      } else {
        const sep = this.separation();
        this.facing = Math.atan2(dy, dx);
        this.steer(dx / d + sep.x, dy / d + sep.y, this.speed * 0.45, dt, 6);
      }
      if (!this.path.length) {
        this.npcState = this.npcState === "return" ? "sit" : "loiter";
        this.npcTimer = this.npcState === "sit" ? rand(6, 16) : rand(3, 7);
      }
      return;
    }
    this.vx *= Math.pow(0.001, dt);
    this.vy *= Math.pow(0.001, dt);
    if (this.npcState === "sit" && this.home) {
      this.facing += angleDiff(this.facing, this.home.facing) * Math.min(1, dt * 4);
    } else if (pd < 160) {
      this.facing += angleDiff(this.facing, Math.atan2(pl.y - this.y, pl.x - this.x)) * Math.min(1, dt * 3);
    }
    if (this.npcTimer <= 0) {
      if (this.npcState === "sit") {
        const spot = pick(g.map.wanderSpots);
        this.goTo(spot.x + rand(-60, 60), spot.y + rand(-60, 60));
        this.npcState = "walk";
      } else if (this.home) {
        this.goTo(this.home.x, this.home.y);
        this.npcState = "return";
      } else {
        this.npcTimer = rand(4, 10);
        this.npcState = "sit";
      }
    }
  }

  private goTo(x: number, y: number) {
    const path = findPath(this.g.world, this.x, this.y, x, y);
    if (path && path.length) this.path = path;
    else this.npcTimer = rand(2, 5);
  }

  // ---------------------------------------------------------------- hazards
  private environment(_dt: number) {
    const g = this.g;
    if (this.mode === "npc") return;
    const hz = g.hazards;
    const hm = GameState.stats.hazardMult;
    if (hz.isElectric(this.x, this.y) && this.shockCd <= 0) {
      this.shockCd = 0.9;
      this.stun = Math.max(this.stun, 1.4);
      g.fx.burst("zap", this.x, this.y, 10);
      g.fx.light(this.x, this.y, 0x6fd8ff, 1.4, 0.15);
      g.audio.play("zap", { vol: 0.35, minGap: 70 });
      if (g.hitEnemy(this, 40 * hm, { angle: 0, kind: "zap", x: this.x, y: this.y, knock: 0 })) { g.trapKill(this.x, this.y); return; }
    } else if (hz.isWater(this.x, this.y) && this.slipCd <= 0 && this.slip <= 0 && !this.def.boss) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 60) {
        this.slip = 1.0 * (GameState.stats.hazardMult > 1 ? 1.5 : 1);
        this.slipCd = 2.6;
        this.vx *= 1.7; this.vy *= 1.7;
        g.fx.burst("water", this.x, this.y, 8);
        g.audio.play("splash", { vol: 0.3, minGap: 90 });
        if (chance(0.3)) g.fx.text(this.x, this.y - 30, "SLIP!", { color: "#9fd8ff", size: 14, dur: 0.6 });
        if (g.hitEnemy(this, 14 * hm, { angle: 0, kind: "slip", x: this.x, y: this.y, knock: 0, silent: true })) { g.trapKill(this.x, this.y); return; }
      }
    }
    if (hz.isFire(this.x, this.y)) {
      this.burn = Math.max(this.burn, 2.0);
      this.burnDps = Math.max(this.burnDps, 42 * hm);
    }
    if (this.def.burnout && this.mode === "hostile") {
      // Burnt-out employees smoulder and set paper alight around them.
      if (chance(0.06)) g.fx.burst("smoke", this.x, this.y - 6, 1);
      hz.igniteAt(this.x, this.y);
    }
  }

  // ---------------------------------------------------------------- render
  private render(dt: number) {
    const g = this.g;
    let rot = this.facing;
    if (this.mode === "npc" && Math.hypot(this.vx, this.vy) < 10) rot = this.facing;
    this.sprite.setPosition(this.x, this.y).setRotation(rot).setDepth(this.y + 4);
    if (this.hitFlash > 0) this.sprite.setTintFill(0xffffff);
    else if (this.burn > 0) this.sprite.setTint(0xff9a6a);
    else if (this.stun > 0 || this.slip > 0) this.sprite.setTint(0x9fd8ff);
    else if (this.slow > 0) this.sprite.setTint(0xc9a27a);
    else if (this.mode === "ally") this.sprite.setTint(0x9dffb0);
    else if (this.def.tint) this.sprite.setTint(this.def.tint);
    else this.sprite.clearTint();
    if (this.chargeWind > 0.05) this.sprite.setTintFill(Math.floor(g.time.now / 70) % 2 ? 0xffffff : 0xff3b55);
    if (this.windup > 0.05) this.sprite.setScale(this.def.scale * CHAR_SCALE * (1 + Math.sin(g.time.now / 30) * 0.04));
    else this.sprite.setScale(this.def.scale * CHAR_SCALE);
    this.shadow.setPosition(this.x, this.y + 8).setDepth(this.y - 30);

    if (this.shield) {
      const sx = this.x + Math.cos(this.facing) * (this.r + 8);
      const sy = this.y + Math.sin(this.facing) * (this.r + 8);
      const down = this.stun > 0 || this.slip > 0;
      this.shield.setPosition(sx, sy).setRotation(this.facing).setDepth(this.y + 6).setAlpha(down ? 0.35 : 1);
    }

    // HP bar for anything damaged (or bosses).
    const showBar = this.mode !== "npc" && (this.hp < this.maxHp || this.def.boss);
    if (showBar) {
      if (!this.hpBar) this.hpBar = g.add.graphics().setDepth(DEPTH.WORLD_UI - 2);
      const w = this.def.boss ? 90 : 36;
      const frac = Math.max(0, this.hp / this.maxHp);
      this.hpBar.clear();
      this.hpBar.fillStyle(0x000000, 0.55).fillRect(this.x - w / 2 - 1, this.y - this.r - 22, w + 2, 6);
      this.hpBar.fillStyle(this.ally ? 0x52d17c : this.def.boss ? 0xffcf3f : 0xe6304a, 1).fillRect(this.x - w / 2, this.y - this.r - 21, w * frac, 4);
    } else if (this.hpBar) this.hpBar.clear();

    if (this.bubble && this.bubble.visible) this.bubble.setPosition(this.x, this.y - this.r - 26);
    void dt;
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.shield?.destroy();
    this.hpBar?.destroy();
    this.bubble?.destroy();
  }
}

export const ENEMY_TILE = TILE;
