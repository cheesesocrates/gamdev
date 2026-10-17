import Phaser from "phaser";
import { CHAR_SCALE, DEPTH, TILE } from "../config";
import { ENEMIES, EnemyDef, EnemyType, standPose } from "../data/enemies";

const HATCHET_BARKS = ["YOU'RE DONE!", "CLEAR YOUR DESK!", "RESTRUCTURING!", "NOTHING PERSONAL!", "THIS IS A CUT!"];
const CALLER_BARKS = ["CAN YOU HEAR ME NOW?", "LET'S CIRCLE BACK!", "PER MY LAST CALL...", "HOLD, PLEASE!", "IT'S FOR YOU!"];
import { HOSTILE_BARKS, NPC_IDLE } from "../data/lines";
import { GameState } from "../systems/GameState";
import { angleDiff, chance, pick, rand } from "../util/math";
import { findPath } from "../world/Nav";
import type { GameScene } from "../scenes/GameScene";

let NEXT_ID = 1;

const RUSH_BARKS = ["NOW!", "CHARGE!", "GET THE BOSS!", "FOR THE PENSION!", "OVERTIME THIS!", "RELOADING! GO!"];

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
  /** Seconds of "soaked" left: slower, fireproof, and double damage from shocks. */
  soaked = 0;
  /** Standing in a puddle this frame. */
  inWater = false;
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
  // Runner tactics: advance -> duck behind cover when spotted -> rush once close.
  private tactic: "advance" | "cover" | "rush" = "advance";
  private coverX = 0;
  private coverY = 0;
  private coverWait = 0;
  private coverCd = rand(0, 0.5);
  private covers = 0;
  private rushLeft = 0;
  /** Sticky Notes stuck on so far. */
  notes = 0;
  /** Blame Game: seconds this coworker is the office scapegoat (everyone turns on them). */
  scapegoat = 0;
  /** Office Romance: an ally only until the infatuation wears off. */
  charmed = false;
  private spreadT = 0;
  private flameSpr?: Phaser.GameObjects.Image;
  /** The calculator / memo pad / phone in their hands. */
  private heldImg?: Phaser.GameObjects.Image;
  private throwHide = 0;
  /** Line-of-sight fade during the fight (1 = in view). */
  vis = 1;
  /** Just got bowled over by a charging boss (don't hit twice). */
  bowledCd = 0;
  // the Hatchet Man / the Cold Caller
  private dizzy = 0;
  /** Seconds the current charge has been badly slowed by something it couldn't smash. */
  private chargeBlocked = 0;
  private chargeAim = 0;
  private stompT = 0;
  private confCd = 8;
  private panicT = 0;
  private panicA = 0;
  allyLife = 0;
  spawnGrace = 0;
  /** Seconds this coworker has had no way to reach the player (see GameScene.rescueStraggler). */
  private unreachT = 0;
  private reachCheck = rand(0, 0.5);

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
    const texKey = mode === "npc" ? `char_${standPose(spr)}` : `char_${spr}`;
    this.shadow = g.add.image(x, y, "shadow").setScale(this.def.scale * 0.95 * CHAR_SCALE);
    this.sprite = g.add.image(x, y, g.textures.exists(texKey) ? texKey : `char_${spr}`).setOrigin(0.42, 0.5).setScale(this.def.scale * CHAR_SCALE);
    this.sprite.setData("tex", `char_${spr}`);
    if (this.def.tint) this.sprite.setTint(this.def.tint);
    if (mode === "ally") this.sprite.setTint(0x9fd3a8);
    if (this.def.shield && mode !== "npc") this.addShield();
    if (mode !== "npc") this.addHeld();
  }

  private addHeld() {
    if (!this.def.held || this.heldImg) return;
    this.heldImg = this.g.add.image(this.x, this.y, this.def.held).setScale((this.def.heldScale ?? 1) * this.def.scale);
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
    this.addHeld();
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
    const zone = g.zoneAt(this.x, this.y);
    const sameRoom = zone >= 0 && zone === g.zoneAt(g.player.x, g.player.y);
    if (sameRoom || d < 300 || this.lurkLeft <= 0 || this.hp < this.maxHp) {
      this.wake();
      // Ambush: everyone waiting in this room springs at once.
      for (const o of g.enemies) if (o !== this && o.lurking && g.zoneAt(o.x, o.y) === zone) o.wake();
    }
  }

  makeAlly(life: number) {
    this.mode = "ally";
    this.allyLife = life;
    this.sprite.setTexture(this.sprite.getData("tex")).setTint(0x9fd3a8);
  }

  say(text: string, dur = 2.2, color = "#1d2129") {
    if (!this.bubble) {
      this.bubble = this.g.add.text(this.x, this.y - 40, "", {
        fontFamily: "'Jersey 10', 'Courier New', monospace", fontSize: "20px", fontStyle: "normal", color,
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
    if (this.def.shield && this.slip > 0) amount *= 1.5;
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
    if (this.soaked > 0) {
      this.soaked -= dt;
      this.burn = Math.min(this.burn, 0.2);
      if (Math.random() < dt * 5) this.g.fx.burst("water", this.x + rand(-8, 8), this.y + 4, 1);
    }
    if (this.spawnGrace > 0) this.spawnGrace -= dt;
    if (this.throwHide > 0) this.throwHide -= dt;
    if (this.bowledCd > 0) this.bowledCd -= dt;
    if (this.scapegoat > 0) this.scapegoat -= dt;
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
      // Hostile Work Environment: the panic (and the fire) spreads.
      if (GameState.stats.hostileEnv && this.mode === "hostile" && (this.spreadT -= dt) <= 0) {
        this.spreadT = 0.4;
        for (const o of g.enemies) {
          if (o === this || o.dead || !o.hostile || o.burn > 0 || o.soaked > 0) continue;
          if ((o.x - this.x) ** 2 + (o.y - this.y) ** 2 > 95 * 95) continue;
          o.burn = 2.2;
          o.burnDps = Math.max(o.burnDps, this.burnDps);
          g.fx.burst("fire", o.x, o.y, 4);
        }
      }
    }

    if (this.mode === "npc") this.updateNpc(dt);
    else if (this.mode === "ally") this.updateAlly(dt);
    else if (this.lurking) this.updateLurk(dt);
    else this.updateHostile(dt);

    if (this.dead) return;
    this.environment(dt);
    // A live puddle can finish them off: their sprites are gone, so stop here.
    if (this.dead) return;

    // Integrate + collide.
    const p = { x: this.x, y: this.y };
    g.world.moveCircle(p, this.r, this.vx * dt, this.vy * dt);
    const moved = Math.hypot(p.x - this.x, p.y - this.y);
    this.x = p.x;
    this.y = p.y;
    const wantMove = Math.hypot(this.vx, this.vy) * dt;
    if (this.mode !== "npc" && wantMove > 1 && moved < wantMove * 0.25) this.stuckTimer += dt; else this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    // A charge that grinds to a crawl (concrete, a copier, a vending machine) counts as hitting it.
    if (this.charging > 0 && wantMove > 1) this.chargeBlocked = moved < wantMove * 0.6 ? this.chargeBlocked + dt : 0;
    else this.chargeBlocked = 0;
    // Safety valve: never leave a straggler wedged inside furniture (it would soft-lock the quota).
    if (this.stuckTimer > 3 && !g.world.walkableTile(Math.floor(this.x / TILE), Math.floor(this.y / TILE))) {
      const free = g.safeSpot(this.x, this.y);
      this.x = free.x;
      this.y = free.y;
      this.stuckTimer = 0;
    }
    // ...or walled in somewhere with no way to the player at all: back in through an entrance after a few seconds.
    if (this.mode === "hostile" && !this.lurking && !this.def.boss && g.phase === "downsizing" && (this.reachCheck -= dt) <= 0) {
      this.reachCheck = 0.5;
      this.unreachT = isFinite(g.reachDist(this.x, this.y)) ? 0 : this.unreachT + 0.5;
      if (this.unreachT >= 4 && g.rescueStraggler(this)) this.unreachT = 0;
    }

    this.render(dt);
  }

  private steer(dx: number, dy: number, speed: number, dt: number, accel = 9) {
    const slowMult = (this.slow > 0 ? 0.55 : 1) * (this.soaked > 0 ? 0.72 : 1);
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
      // Zapped in a live puddle: a riot shield goes round and round with them.
      if (this.stun > 0 && this.def.shield && this.inWater) this.facing += dt * 10;
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
    const field = this.def.boss ? g.flowBoss : this.def.smart ? g.flowSmart : g.flowNaive;
    const goStraight = this.hasLos && d < 520 && target === pl;
    if (goStraight || target !== pl) {
      mvx = dx / d; mvy = dy / d;
    } else {
      const dir = field.direction(this.x, this.y);
      if (dir) { mvx = dir.x; mvy = dir.y; } else { mvx = dx / d; mvy = dy / d; }
    }

    // Hostile Work Environment: burning coworkers run around screaming.
    if (this.burn > 0 && GameState.stats.hostileEnv && !this.def.boss) {
      this.panicT -= dt;
      if (this.panicT <= 0) { this.panicT = rand(0.25, 0.5); this.panicA = rand(-Math.PI, Math.PI); }
      mvx = Math.cos(this.panicA);
      mvy = Math.sin(this.panicA);
    }

    let speed = this.speed;
    const R = this.def.ranged;
    // Runners don't sprint into a firing line: they duck behind desks, creep up, then rush.
    if (!R && !this.def.boss && !this.def.shield && target === pl) {
      const t = this.runnerTactics(dt, d);
      if (t) { mvx = t.x; mvy = t.y; speed *= t.speed; }
    }
    // Shooters hold their range instead of charging in.
    if (R && target === pl) {
      if (this.hasLos && d > R.keepDist[1]) speed *= 0.75;
      else if (!this.hasLos && d < R.keepDist[0]) speed *= 0.5;
    }
    if (R && this.hasLos && target === pl) {
      // Keep a comfortable firing distance and strafe.
      const [near, far] = R.keepDist;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = rand(1.2, 2.8); this.strafeDir *= -1; }
      const px = -dy / d * this.strafeDir, py = dx / d * this.strafeDir;
      if (d < near) { mvx = -dx / d * 0.85 + px * 0.55; mvy = -dy / d * 0.85 + py * 0.55; speed *= 1.1; }
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

    if (this.def.boss && this.def.bossKind === "hatchet") {
      if (this.hatchetAI(dt, d, dx, dy)) return;
      if (this.stuckTimer > 0.35) g.smashWalls(this.x + mvx * (this.r + 12), this.y + mvy * (this.r + 12), this.r + 16);
    }
    if (this.def.boss && this.def.bossKind === "caller") {
      this.callerAI(dt, d);
      if (this.stuckTimer > 0.35) g.smashWalls(this.x + mvx * (this.r + 12), this.y + mvy * (this.r + 12), this.r + 16);
    }
    // THE CONSULTANT: telegraphed charges and intern reinforcements.
    if (this.def.boss && (this.def.bossKind ?? "consultant") === "consultant") {
      this.bossSummonCd -= dt;
      if (this.bossSummonCd <= 0) {
        this.bossSummonCd = rand(8, 11);
        this.say("BRING IN THE INTERNS!", 1.6, "#e9c25a");
        g.audio.play("alert", { vol: 0.4 });
        for (let k = 0; k < 2 + Math.floor(g.dayCfg.day / 5); k++) {
          const a = rand(0, Math.PI * 2);
          const p = g.safeSpot(this.x + Math.cos(a) * 70, this.y + Math.sin(a) * 70);
          const e = g.spawnEnemy("intern", p.x, p.y, "hostile");
          e.spawnGrace = 0.5;
          g.fx.burst("confetti", p.x, p.y, 8);
        }
      }
      // Bosses don't use doors.
      if (this.charging > 0) g.smashWalls(this.x + this.vx * 0.06, this.y + this.vy * 0.06, this.r + 22);
      else if (this.stuckTimer > 0.35) g.smashWalls(this.x + mvx * (this.r + 12), this.y + mvy * (this.r + 12), this.r + 16);
      if (this.charging > 0) {
        this.charging -= dt;
        this.facing = Math.atan2(this.vy, this.vx);
        if (chance(0.5)) g.fx.burst("pixel", this.x, this.y, 2, 0xffd7a8);
        if (d < this.r + pl.r + 8 && this.attackCd <= 0) {
          this.attackCd = 1;
          pl.damage(2, this.x, this.y, "charge", this);
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
        this.say("ATTENTION ALL STAFF!", 1.2, "#e9c25a");
        g.audio.play("megaphone", { vol: 0.5 });
        for (let k = -1; k <= 1; k++) g.projectiles.fireEnemy("wave", this.x, this.y, this.facing + k * 0.22, 360, 1, this);
      }
    }

    // Separation so the mob doesn't stack into one blob.
    const sep = this.separation();
    mvx += sep.x * 1.4; mvy += sep.y * 1.4;
    if (this.stuckTimer > 0.6) {
      mvx += rand(-1, 1); mvy += rand(-1, 1);
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
        pl.damage(this.def.melee, this.x, this.y, "melee", this);
      } else if (target instanceof Enemy) {
        // Interns get a shove; a scapegoat gets the whole office's frustration.
        target.takeDamage(target.ally ? 12 * g.dayCfg.hpMult : target.maxHp * 0.2, wantFacing, 140);
        if (target.hp <= 0) g.killEnemy(target, false);
      }
      this.vx += Math.cos(wantFacing) * 120;
      this.vy += Math.sin(wantFacing) * 120;
    }

    this.barkCd -= dt;
    if (this.barkCd <= 0 && d < 600) {
      this.barkCd = rand(6, 14);
      if (g.canBark()) this.say(pick(HOSTILE_BARKS), 1.6, "#d0574a");
    }
  }

  private runnerTactics(dt: number, d: number): { x: number; y: number; speed: number } | null {
    const g = this.g, pl = g.player;
    const toPl = { x: (pl.x - this.x) / d, y: (pl.y - this.y) / d };
    const rushDist = 220 + this.r * 2;
    this.coverCd -= dt;
    if (this.tactic === "rush") {
      this.rushLeft -= dt;
      if (this.rushLeft > 0 || this.hasLos) return this.hasLos ? { ...toPl, speed: 1.3 } : null;
      this.tactic = "advance";
    }
    const exposed = this.hasLos && d < 950;
    // Rush when close, when the boss is reloading or looking the other way, or after enough hiding.
    const opening = this.hasLos && d < 520 && (pl.reloading > 0 || Math.abs(pl.aimAngleTo(this.x, this.y)) > 1.3);
    if (exposed && (d < rushDist || opening || this.covers >= 3)) {
      this.tactic = "rush";
      this.rushLeft = 1.6;
      this.covers = 0;
      if (chance(0.3) && g.canBark()) this.say(pick(RUSH_BARKS), 1.2, "#d0574a");
      return { ...toPl, speed: 1.3 };
    }
    if (this.tactic === "cover") {
      // Cover got blown (the boss moved): look for another spot.
      if (this.coverCd <= 0 && g.world.los(pl.x, pl.y, this.coverX, this.coverY)) {
        this.coverCd = 0.5;
        if (!this.findCover()) { this.tactic = "advance"; return null; }
      }
      const cd = Math.hypot(this.coverX - this.x, this.coverY - this.y);
      if (cd > 14) return { x: (this.coverX - this.x) / cd, y: (this.coverY - this.y) / cd, speed: 1.2 };
      // Hunkered down: wait a beat, then creep up on the boss.
      this.coverWait -= dt;
      if (this.coverWait <= 0) this.tactic = "advance";
      return { x: 0, y: 0, speed: 0 };
    }
    if (exposed && this.coverCd <= 0) {
      this.coverCd = 0.6;
      if (this.findCover()) {
        this.tactic = "cover";
        this.covers++;
        this.coverWait = rand(0.5, 1.4);
        const cd = Math.hypot(this.coverX - this.x, this.coverY - this.y) || 1;
        return { x: (this.coverX - this.x) / cd, y: (this.coverY - this.y) / cd, speed: 1.2 };
      }
    }
    return null;
  }

  /** A nearby floor tile the boss can't see, no further from them than we are now. */
  private findCover(): boolean {
    const g = this.g, pl = g.player;
    const here = g.flowSmart.distAt(this.x, this.y);
    let best = Infinity, bx = 0, by = 0;
    for (let k = 0; k < 16; k++) {
      const a = rand(0, Math.PI * 2), rr = rand(1.1, 4.5) * TILE;
      const tx = Math.floor((this.x + Math.cos(a) * rr) / TILE), ty = Math.floor((this.y + Math.sin(a) * rr) / TILE);
      if (!g.world.walkableTile(tx, ty)) continue;
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      const fd = g.flowSmart.distAt(cx, cy);
      if (!isFinite(fd) || (isFinite(here) && fd > here + 15)) continue;
      if (Math.hypot(cx - pl.x, cy - pl.y) < 170) continue;
      if (g.world.los(pl.x, pl.y, cx, cy)) continue;
      if (!g.world.walkLos(this.x, this.y, cx, cy, this.r)) continue;
      const score = fd + Math.hypot(cx - this.x, cy - this.y) * 0.08;
      if (score < best) { best = score; bx = cx; by = cy; }
    }
    if (best === Infinity) return false;
    this.coverX = bx;
    this.coverY = by;
    return true;
  }

  private pickTarget(): { x: number; y: number } {
    // Hostiles chase allies that get close (and any scapegoat nearby); otherwise the player.
    const g = this.g;
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const a of g.enemies) {
      if (a === this || a.dead || !(a.ally || a.scapegoat > 0)) continue;
      const range = a.scapegoat > 0 ? 420 : 200;
      const d2 = (a.x - this.x) ** 2 + (a.y - this.y) ** 2;
      if (d2 < range * range && d2 < bd) { bd = d2; best = a; }
    }
    return best ?? g.player;
  }

  private shoot(tx: number, ty: number) {
    const g = this.g;
    const R = this.def.ranged!;
    if (R.kind !== "bolt") this.throwHide = R.kind === "phone" ? 0.55 : 0.3;
    if (R.kind === "phone") {
      // Lead the target a little; when hurt, three at once.
      const pl = g.player;
      const lx = tx + pl.vx * 0.45, ly = ty + pl.vy * 0.45;
      g.projectiles.lobPhone(this.x, this.y, lx, ly, this);
      if (this.hp < this.maxHp * 0.5) {
        const a = Math.atan2(ly - this.y, lx - this.x) + Math.PI / 2;
        for (const s of [-1, 1]) g.projectiles.lobPhone(this.x, this.y, lx + Math.cos(a) * 130 * s, ly + Math.sin(a) * 130 * s, this);
      }
      g.audio.play("dodge", { vol: 0.3, rate: 0.8, minGap: 80 });
      if (chance(0.3) && g.canBark()) this.say(pick(CALLER_BARKS), 1.4, "#e9c25a");
      return;
    }
    // Lead the target a little.
    const pl = g.player;
    const t = Math.hypot(tx - this.x, ty - this.y) / R.speed;
    const ax = tx + pl.vx * t * 0.5, ay = ty + pl.vy * t * 0.5;
    const base = Math.atan2(ay - this.y, ax - this.x);
    for (let k = 0; k < R.count; k++) {
      const off = (k - (R.count - 1) / 2) * R.spread + rand(-0.04, 0.04);
      g.projectiles.fireEnemy(R.kind, this.x + Math.cos(base) * 20, this.y + Math.sin(base) * 20, base + off, R.speed, R.dmg, this);
    }
    g.audio.play(R.kind === "bolt" ? "laser" : "dodge", { vol: R.kind === "bolt" ? 0.25 : 0.2, rate: R.kind === "bolt" ? 1.5 : 1.6, minGap: 80 });
    this.vx -= Math.cos(base) * 50;
    this.vy -= Math.sin(base) * 50;
  }

  /**
   * THE HATCHET MAN: stomps, locks on, and charges in a straight line, smashing drywall, glass and
   * furniture. Concrete stops him cold and leaves him dizzy (free hits). Returns true while busy.
   */
  private hatchetAI(dt: number, d: number, dx: number, dy: number): boolean {
    const g = this.g, pl = g.player;
    if (this.dizzy > 0) {
      this.dizzy -= dt;
      this.vx *= Math.pow(0.02, dt);
      this.vy *= Math.pow(0.02, dt);
      if (chance(dt * 8)) g.fx.burst("spark", this.x + rand(-24, 24), this.y - this.r - 14, 1, 0xe9c25a);
      if (this.dizzy <= 0) this.chargeCd = rand(1.4, 2.4);
      return true;
    }
    if (this.charging > 0) {
      this.charging -= dt;
      this.attackCd -= dt;
      const sp = Math.hypot(this.vx, this.vy) || 1;
      this.facing = Math.atan2(this.vy, this.vx);
      g.bossSmash(this, this.x + (this.vx / sp) * (this.r + 20), this.y + (this.vy / sp) * (this.r + 20), this.r + 12);
      // Coworkers in the way get bowled over.
      for (const o of g.enemies) {
        if (o === this || o.dead || o.mode === "npc" || o.bowledCd > 0) continue;
        if ((o.x - this.x) ** 2 + (o.y - this.y) ** 2 > (this.r + o.r + 10) ** 2) continue;
        o.bowledCd = 0.8;
        const side = Math.sign((o.x - this.x) * -this.vy + (o.y - this.y) * this.vx) || 1;
        if (o.takeDamage(o.maxHp * 0.4, this.facing + side * 1.2, 520)) g.killEnemy(o, false);
        g.fx.text(o.x, o.y - 30, "OOF!", { color: "#d0574a", size: 15, pop: true, dur: 0.5 });
      }
      if (d < this.r + pl.r + 8 && this.attackCd <= 0) {
        this.attackCd = 1;
        pl.damage(2, this.x, this.y, "charge", this);
      }
      if (chance(0.7)) g.fx.burst("pixel", this.x - this.vx * 0.03, this.y + this.r * 0.5, 2, 0xd8c3a5);
      if (this.chargeBlocked > 0.07 || this.charging <= 0) {
        const bonk = this.chargeBlocked > 0.07;
        this.chargeBlocked = 0;
        this.charging = 0;
        this.vx *= 0.1;
        this.vy *= 0.1;
        if (bonk) {
          this.dizzy = 2.4;
          g.fx.shake(0.9);
          g.audio.play("stomp", { vol: 0.9 });
          g.audio.play("wall", { vol: 0.8 });
          g.fx.text(this.x, this.y - this.r - 34, "BONK!", { color: "#e9c25a", size: 30, pop: true, dur: 1.1 });
          g.tipOnce("hatchet", "He's dizzy! Hit him now. Dodge his charges so he slams into concrete walls.", "#e9c25a");
        } else this.chargeCd = rand(1.2, 2.2);
      }
      return true;
    }
    this.chargeCd -= dt;
    if ((this.chargeCd <= 0 && this.hasLos && d < 950) || this.chargeWind > 0) {
      if (this.chargeWind === 0 && g.canBark()) this.say(pick(HATCHET_BARKS), 1.2, "#c4382c");
      this.chargeWind += dt;
      this.vx *= Math.pow(0.02, dt);
      this.vy *= Math.pow(0.02, dt);
      if (this.chargeWind < 0.75) this.chargeAim = Math.atan2(dy, dx);
      this.facing = this.chargeAim;
      this.stompT -= dt;
      if (this.stompT <= 0) {
        this.stompT = 0.34;
        g.audio.play("stomp", { vol: 0.5, minGap: 100 });
        g.fx.shake(0.1);
        g.fx.burst("smoke", this.x, this.y + this.r * 0.6, 2, 0xd8c3a5);
      }
      g.drawChargeLane(this.x, this.y, this.chargeAim, this.r, Math.min(1, this.chargeWind / 1.05));
      if (this.chargeWind > 1.05) {
        this.chargeWind = 0;
        this.charging = 1.6;
        this.stuckTimer = 0;
        this.chargeBlocked = 0;
        this.vx = Math.cos(this.chargeAim) * 980;
        this.vy = Math.sin(this.chargeAim) * 980;
        g.audio.play("dodge", { vol: 0.7, rate: 0.5 });
        g.fx.shake(0.3);
      }
      return true;
    }
    return false;
  }

  /** THE COLD CALLER: when hurt, a "conference call" rains phones in a ring around you. */
  private callerAI(dt: number, d: number) {
    const g = this.g, pl = g.player;
    this.confCd -= dt;
    if (this.hp < this.maxHp * 0.6 && this.confCd <= 0 && this.hasLos && d < 820) {
      this.confCd = rand(9, 12);
      this.throwHide = 0.8;
      this.say("CONFERENCE CALL!", 1.6, "#e9c25a");
      g.audio.play("phone", { vol: 0.6 });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + rand(-0.2, 0.2), rr = rand(80, 150);
        g.projectiles.lobPhone(this.x, this.y, pl.x + Math.cos(a) * rr, pl.y + Math.sin(a) * rr, this);
      }
    }
  }

  // ---------------------------------------------------------------- allies
  private updateAlly(dt: number) {
    const g = this.g;
    this.allyLife -= dt;
    if (this.allyLife <= 0 && this.charmed) {
      // The crush wears off.
      this.charmed = false;
      this.mode = "hostile";
      this.spawnGrace = 0.6;
      g.fx.text(this.x, this.y - 40, "IT'S OVER", { color: "#cf6a4c", size: 15, pop: true });
      return;
    }
    if (this.allyLife <= 0) {
      g.fx.burst("confetti", this.x, this.y, 10);
      g.fx.text(this.x, this.y - 30, "INTERNSHIP OVER", { color: "#9fd3a8", size: 13 });
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
        const spot = g.wanderSpot();
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
    this.inWater = false;
    if (this.mode === "npc") return;
    const hz = g.hazards;
    const hm = GameState.stats.hazardMult;
    this.inWater = hz.isWater(this.x, this.y);
    if (this.inWater) {
      if (this.soaked <= 0 && chance(0.35)) g.fx.text(this.x, this.y - 30, "SOAKED", { color: "#7fd8ff", size: 13, dur: 0.6 });
      this.soaked = 4;
    }
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
        this.slip = (this.def.shield ? 2.4 : 1.0) * (GameState.stats.hazardMult > 1 ? 1.5 : 1);
        if (this.def.shield) {
          g.fx.text(this.x, this.y - 44, "SHIELD DOWN!", { color: "#e9c25a", size: 17, pop: true, dur: 0.9 });
          g.tipOnce("shieldslip", "Slipped! A fallen HR Director takes extra damage. Hit them now!", "#e9c25a");
        }
        this.slipCd = 2.6;
        this.vx *= 1.7; this.vy *= 1.7;
        g.fx.burst("water", this.x, this.y, 8);
        g.audio.play("splash", { vol: 0.3, minGap: 90 });
        if (chance(0.3)) g.fx.text(this.x, this.y - 30, "SLIP!", { color: "#9fd8ff", size: 14, dur: 0.6 });
        if (g.hitEnemy(this, 14 * hm, { angle: 0, kind: "slip", x: this.x, y: this.y, knock: 0, silent: true })) { g.trapKill(this.x, this.y); return; }
      }
    }
    if (hz.isFire(this.x, this.y) && this.soaked <= 0) {
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
    this.sprite.setPosition(this.x, this.y).setRotation(rot).setDepth(this.y + 4).setAlpha(this.vis);
    if (this.hitFlash > 0) this.sprite.setTintFill(0xffffff);
    else if (this.burn > 0) this.sprite.setTint(0xff9a6a);
    else if (this.stun > 0 || this.slip > 0) this.sprite.setTint(0x9fd8ff);
    else if (this.soaked > 0) this.sprite.setTint(0xb8e4ff);
    else if (this.slow > 0) this.sprite.setTint(0xc9a27a);
    else if (this.mode === "ally") this.sprite.setTint(this.charmed ? 0xe8a38f : 0x9fd3a8);
    else if (this.scapegoat > 0) this.sprite.setTint(Math.floor(g.time.now / 110) % 2 ? 0xd98a3a : 0xeedcbc);
    else if (this.def.tint) this.sprite.setTint(this.def.tint);
    else this.sprite.clearTint();
    if (this.chargeWind > 0.05) this.sprite.setTintFill(Math.floor(g.time.now / 70) % 2 ? 0xffffff : 0xc4382c);
    if (this.windup > 0.05) this.sprite.setScale(this.def.scale * CHAR_SCALE * (1 + Math.sin(g.time.now / 30) * 0.04));
    else this.sprite.setScale(this.def.scale * CHAR_SCALE);
    this.shadow.setPosition(this.x, this.y + 8).setDepth(this.y - 30).setAlpha(this.vis);
    if (this.heldImg) {
      const reach = 17 * this.def.scale * CHAR_SCALE;
      this.heldImg.setPosition(this.x + Math.cos(rot) * reach, this.y + Math.sin(rot) * reach)
        .setRotation(rot + Math.PI / 2).setDepth(this.y + 5)
        .setVisible(this.mode !== "npc" && this.throwHide <= 0 && this.dizzy <= 0).setAlpha(this.vis);
    }

    if (this.shield) {
      const sx = this.x + Math.cos(this.facing) * (this.r + 8);
      const sy = this.y + Math.sin(this.facing) * (this.r + 8);
      // Slipping (or zapped) in a puddle they spin with the shield still in hand; a keyboard bonk knocks it aside.
      const aside = this.stun > 0 && this.slip <= 0 && !this.inWater;
      this.shield.setPosition(sx, sy).setRotation(this.facing).setDepth(this.y + 6).setAlpha((aside ? 0.35 : 1) * this.vis);
    }

    // HP bar for anything damaged (or bosses): all bars share one Graphics, drawn by the scene.
    if (this.mode !== "npc" && this.vis > 0.4 && (this.hp < this.maxHp || this.def.boss)) {
      const w = this.def.boss ? 90 : 36;
      g.queueHpBar(this.x - w / 2, this.y - this.r - 22, w, Math.max(0, this.hp / this.maxHp), this.ally ? 0x4b9a63 : this.def.boss ? 0xe9c25a : 0xe6304a);
    }

    if (this.bubble && this.bubble.visible) this.bubble.setPosition(this.x, this.y - this.r - 26).setAlpha(this.vis);
    if (this.burn > 0 && this.mode !== "npc") {
      if (!this.flameSpr) this.flameSpr = g.add.image(this.x, this.y, "flame", 0).setOrigin(0.5, 0.95);
      const t = g.time.now / 1000;
      this.flameSpr.setVisible(this.sprite.visible).setAlpha(this.sprite.alpha)
        .setFrame(Math.floor(t * 14 + this.id) % 6)
        .setPosition(this.x + Math.sin(t * 6 + this.id) * 2, this.y + 6)
        .setDepth(this.y + 7)
        .setScale((0.75 + 0.1 * Math.sin(t * 10 + this.id)) * this.def.scale);
    } else if (this.flameSpr?.visible) this.flameSpr.setVisible(false);
    void dt;
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.shield?.destroy();
    this.flameSpr?.destroy();
    this.heldImg?.destroy();
    this.bubble?.destroy();
  }
}

export const ENEMY_TILE = TILE;
