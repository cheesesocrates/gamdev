import Phaser from "phaser";
import { DEPTH } from "../config";
import { GameState } from "../systems/GameState";
import { rand, angleDiff, chance, pick } from "../util/math";
import { TILE } from "../config";
import { Tile } from "../world/OfficeMap";
import type { GameScene } from "../scenes/GameScene";
import type { Enemy } from "./Enemy";

export type ProjKind = "staple" | "coffee" | "shard" | "calc" | "memo" | "bolt" | "wave" | "plane" | "confetti" | "drop" | "slip" | "toner" | "phone";
export type PlayerShot = "staple" | "coffee" | "shard" | "plane" | "confetti" | "drop" | "slip";

const SHOT: Record<PlayerShot, { speed: number; dmg: number; range: number; radius: number }> = {
  staple: { speed: 1020, dmg: 13, range: 820, radius: 6 },
  coffee: { speed: 700, dmg: 7.5, range: 330, radius: 7 },
  shard: { speed: 800, dmg: 6, range: 380, radius: 6 },
  plane: { speed: 540, dmg: 17, range: 1150, radius: 10 },
  confetti: { speed: 780, dmg: 4.6, range: 540, radius: 5 },
  drop: { speed: 520, dmg: 2.5, range: 300, radius: 7 },
  slip: { speed: 820, dmg: 17, range: 720, radius: 9 }
};
const KNOCK: Partial<Record<ProjKind, number>> = { coffee: 260, staple: 120, plane: 150, slip: 90, confetti: 40, drop: 30, shard: 80 };
const CONFETTI = [0xc4382c, 0xe9c25a, 0x6aa3b4, 0x4b9a63, 0x5b6380, 0xc97a3a];

export interface Proj {
  active: boolean;
  friendly: boolean;
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  range: number; // remaining travel distance (px)
  radius: number;
  pierce: number;
  bounces: number;
  homing: number;
  explode: number;
  canSplit: boolean;
  spin: number;
  hit: Set<number>;
  sprite: Phaser.GameObjects.Image;
  trail: number;
  stun: number;
  hot: boolean;
  boomerang: boolean;
  returning: boolean;
  maxRange: number;
  /** Has ricocheted at least once: comes in at angles a riot shield can't cover. */
  bounced: boolean;
  /** An enemy shot the keyboard swatted back. */
  deflected: boolean;
  /** Who fired it (enemy shots). */
  owner: Enemy | null;
  /** Black Hole Binder: opens a vortex wherever it lands. */
  vortex: boolean;
  /** Lobbed phones: where they're going to land. */
  tx: number;
  ty: number;
}

const TEX: Record<ProjKind, string> = {
  staple: "p_staple", coffee: "p_coffee", shard: "p_staple", calc: "p_calc", memo: "p_memo", bolt: "p_bolt", wave: "p_wave",
  plane: "p_plane", confetti: "p_confetti", drop: "p_drop", slip: "p_slip", toner: "p_toner", phone: "i_phone"
};

export class Projectiles {
  g: GameScene;
  list: Proj[] = [];

  constructor(g: GameScene) {
    this.g = g;
  }

  private obtain(): Proj {
    let p = this.list.find((q) => !q.active);
    if (!p) {
      const sprite = this.g.add.image(0, 0, "p_staple").setDepth(DEPTH.PROJECTILE);
      p = {
        active: false, friendly: true, kind: "staple", x: 0, y: 0, vx: 0, vy: 0, dmg: 0, range: 0, radius: 6,
        pierce: 0, bounces: 0, homing: 0, explode: 0, canSplit: false, spin: 0, hit: new Set(), sprite, trail: 0, stun: 0,
        hot: false, boomerang: false, returning: false, maxRange: 0, bounced: false, deflected: false, owner: null, vortex: false, tx: 0, ty: 0
      };
      this.list.push(p);
    }
    p.active = true;
    p.hit.clear();
    p.hot = false;
    p.boomerang = false;
    p.returning = false;
    p.bounced = false;
    p.deflected = false;
    p.owner = null;
    p.vortex = false;
    p.sprite.setVisible(true).setAlpha(1).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    return p;
  }

  /** Player shot with every upgrade applied. */
  firePlayer(kind: PlayerShot, x: number, y: number, angle: number, speedJitter = 1): Proj {
    const st = GameState.stats;
    const S = SHOT[kind];
    const p = this.obtain();
    p.friendly = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    const speed = S.speed * st.projSpeedMult * speedJitter;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.dmg = S.dmg * st.dmgMult;
    p.range = S.range * st.projSpeedMult;
    p.maxRange = p.range;
    p.boomerang = kind === "staple" && st.boomerang;
    p.radius = S.radius * st.sizeMult;
    p.pierce = st.pierce + (kind === "shard" ? 1 : kind === "slip" ? 3 : 0);
    p.bounces = kind === "coffee" || kind === "drop" ? Math.ceil(st.bounces / 2) : st.bounces;
    p.homing = kind === "shard" || kind === "drop" ? 0 : kind === "plane" ? 2.2 + st.homing : st.homing;
    // Spray weapons skip the explosive/splitting upgrades (they'd carpet-bomb the office).
    const spray = kind === "confetti" || kind === "drop";
    p.explode = spray ? 0 : st.explode;
    p.canSplit = kind !== "shard" && !spray && st.split > 0;
    p.spin = kind === "slip" ? 18 : 0;
    p.stun = 0;
    p.trail = 0;
    p.sprite.setTexture(TEX[kind]).setScale(st.sizeMult * (kind === "shard" ? 0.7 : 1));
    if (kind === "shard") p.sprite.setTint(0xffe28a);
    if (kind === "confetti") p.sprite.setTint(pick(CONFETTI));
    // Black Hole Binder: every few seconds one shot carries a vortex.
    const pl = this.g.player;
    if (st.binder && !spray && kind !== "shard" && pl.binderReady) {
      pl.binderReady = false;
      pl.binderCd = st.binder >= 2 ? 4.5 : 6;
      p.vortex = true;
      p.sprite.setTint(0x6b6f9a).setScale(p.sprite.scaleX * 1.4);
    }
    p.sprite.setRotation(angle);
    return p;
  }

  /** Toner Bomb: an arcing cartridge that sails over furniture and bursts where it lands. */
  lobToner(x: number, y: number, angle: number, dist: number): Proj {
    const p = this.obtain();
    p.friendly = true;
    p.kind = "toner";
    p.x = x;
    p.y = y;
    const flight = 0.32 + dist / 1400;
    p.vx = Math.cos(angle) * (dist / flight);
    p.vy = Math.sin(angle) * (dist / flight);
    p.dmg = 70 * GameState.stats.dmgMult;
    p.range = p.maxRange = dist;
    p.radius = 8;
    p.pierce = 0;
    p.bounces = 0;
    p.homing = 0;
    p.explode = 0;
    p.canSplit = false;
    p.spin = 9;
    p.stun = 0;
    p.trail = 0;
    p.sprite.setTexture("p_toner").setScale(1).setRotation(angle);
    return p;
  }

  /**
   * The Cold Caller's desk phone: arcs over the furniture to where you're standing, then rings
   * on the floor for a second before it blows. Swat it back with the keyboard and it's yours.
   */
  lobPhone(x: number, y: number, tx: number, ty: number, owner: Enemy | null): Proj {
    const p = this.obtain();
    p.friendly = false;
    p.owner = owner;
    p.kind = "phone";
    p.x = x;
    p.y = y;
    const dist = Math.max(40, Math.hypot(tx - x, ty - y));
    const ang = Math.atan2(ty - y, tx - x);
    const flight = 0.55 + dist / 1500;
    p.vx = Math.cos(ang) * (dist / flight);
    p.vy = Math.sin(ang) * (dist / flight);
    p.tx = tx;
    p.ty = ty;
    p.dmg = 2;
    p.range = p.maxRange = dist;
    p.radius = 12;
    p.pierce = 0;
    p.bounces = 0;
    p.homing = 0;
    p.explode = 0;
    p.canSplit = false;
    p.spin = 11;
    p.stun = 0;
    p.trail = 0;
    p.sprite.setTexture("i_phone").setScale(1).setRotation(ang);
    return p;
  }

  /** Keyboard parry: an enemy shot turns around and works for the boss now. */
  deflect(p: Proj, angle: number) {
    const st = GameState.stats;
    p.friendly = true;
    p.deflected = true;
    const sp = Math.max(650, Math.hypot(p.vx, p.vy) * 1.3);
    p.vx = Math.cos(angle) * sp;
    p.vy = Math.sin(angle) * sp;
    p.dmg = 24 * st.dmgMult;
    p.range = p.maxRange = p.kind === "wave" ? 300 : 800;
    p.hit.clear();
    p.pierce = st.pierce;
    p.bounces = st.bounces;
    p.homing = 0;
    p.explode = 0;
    p.canSplit = false;
    p.stun = 0;
    p.sprite.setTint(0xe9c25a);
  }

  fireEnemy(kind: "calc" | "memo" | "bolt" | "wave", x: number, y: number, angle: number, speed: number, dmg: number, owner: Enemy | null = null) {
    const p = this.obtain();
    p.friendly = false;
    p.owner = owner;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.dmg = dmg;
    p.range = kind === "wave" ? 300 : 900;
    p.radius = kind === "wave" ? 22 : kind === "calc" ? 9 : 7;
    p.pierce = 0;
    p.bounces = 0;
    p.homing = 0;
    p.explode = 0;
    p.canSplit = false;
    p.spin = kind === "calc" ? rand(10, 16) * (Math.random() < 0.5 ? -1 : 1) : kind === "memo" ? rand(4, 7) : 0;
    p.stun = kind === "wave" ? 0.85 : 0;
    p.trail = 0;
    p.sprite.setTexture(TEX[kind]).setScale(kind === "wave" ? 1.3 : 1).setRotation(angle);
    if (kind === "bolt") p.sprite.setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Hot Desking: a double-damage, gold-glowing shot. */
  makeHot(p: Proj) {
    p.hot = true;
    p.dmg *= 2;
    p.sprite.setTint(0xffc23a).setScale(p.sprite.scaleX * 1.3);
  }

  clear() {
    for (const p of this.list) this.kill(p);
  }

  private kill(p: Proj) {
    p.active = false;
    p.sprite.setVisible(false);
  }

  update(dt: number) {
    const g = this.g;
    for (const p of this.list) {
      if (!p.active) continue;

      if (p.homing > 0 && p.friendly) {
        const target = g.nearestEnemy(p.x, p.y, 380, p.hit);
        if (target) {
          const want = Math.atan2(target.y - p.y, target.x - p.x);
          const cur = Math.atan2(p.vy, p.vx);
          const turn = Phaser.Math.Clamp(angleDiff(cur, want), -1, 1) * (3.2 + p.homing * 2.4) * dt;
          const sp = Math.hypot(p.vx, p.vy);
          p.vx = Math.cos(cur + turn) * sp;
          p.vy = Math.sin(cur + turn) * sp;
        }
      }

      const speed = Math.hypot(p.vx, p.vy);
      const travel = speed * dt;
      const steps = Math.max(1, Math.ceil(travel / 7));
      const sdt = dt / steps;
      let alive = true;
      if (p.returning) {
        const dx = g.player.x - p.x, dy = g.player.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx = (dx / d) * speed;
        p.vy = (dy / d) * speed;
        if (d < 26) { this.kill(p); continue; }
      }
      for (let s = 0; s < steps && alive; s++) {
        const nx = p.x + p.vx * sdt, ny = p.y + p.vy * sdt;
        const lob = p.kind === "toner" || (p.kind === "phone" && !p.friendly);
        const hit = p.returning ? null : lob ? this.wallAt(nx, ny) : g.world.shotBlockedAt(nx, ny);
        if (hit) {
          alive = this.onSolid(p, nx, ny, hit, sdt);
          continue;
        }
        p.x = nx;
        p.y = ny;
        p.range -= speed * sdt;
        if (p.range <= 0) {
          if (p.boomerang && !p.returning) {
            p.returning = true;
            p.range = p.maxRange * 1.5;
            p.hit.clear();
            continue;
          }
          alive = false; this.expire(p); break;
        }
        if (p.kind !== "toner" && !(p.kind === "phone" && !p.friendly)) alive = p.friendly ? this.hitEnemies(p) : this.hitPlayerSide(p);
      }
      if (!alive) { this.kill(p); continue; }

      p.sprite.setPosition(p.x, p.y);
      if (p.spin) p.sprite.rotation += p.spin * dt;
      else p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      if (p.kind === "coffee" || p.kind === "drop") p.sprite.setAlpha(Math.min(1, p.range / 80));
      if (p.kind === "toner" || (p.kind === "phone" && !p.deflected)) p.sprite.setScale(1 + Math.sin((1 - p.range / p.maxRange) * Math.PI) * 0.8);
      if (p.kind === "wave") p.sprite.setScale(1.3 + (300 - p.range) / 160).setAlpha(Math.min(1, p.range / 120));
      p.trail -= dt;
      if (p.trail <= 0 && (p.kind === "bolt" || (p.friendly && (p.homing || p.explode)))) {
        p.trail = 0.03;
        g.fx.burst("spark", p.x, p.y, 1, p.kind === "bolt" ? 0x6fd8ff : p.explode ? 0xd98a3a : 0xffe28a);
      }
    }
  }

  /** Returns false when the projectile is consumed. */
  private onSolid(p: Proj, x: number, y: number, hit: ReturnType<GameScene["world"]["shotBlockedAt"]>, sdt: number): boolean {
    const g = this.g;
    if (!hit) return true;
    // Damage what we hit.
    if (hit.type === "tile" && hit.tile === Tile.GLASS) {
      g.damageGlass(hit.tx!, hit.ty!, p.friendly ? 1 : 1);
    } else if (hit.type === "collider" && hit.collider) {
      g.onColliderShot(hit.collider, p.dmg, p.friendly, x, y);
    }
    if (p.kind === "wave") return false;
    if (p.friendly && p.bounces > 0) {
      p.bounces--;
      p.bounced = true;
      const r = g.world.reflect(p.x, p.y, p.vx, p.vy, sdt);
      p.vx = r.vx;
      p.vy = r.vy;
      p.hit.clear();
      g.fx.burst("spark", p.x, p.y, 4, 0xffffff);
      g.audio.play("ping", { vol: 0.18, rate: 1.4, minGap: 40 });
      return true;
    }
    this.impact(p, p.x, p.y, Math.atan2(p.vy, p.vx));
    return false;
  }

  /** Lobbed shots only collide with walls (they fly over desks). */
  private wallAt(x: number, y: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const tile = this.g.world.tile(tx, ty);
    return tile !== Tile.FLOOR ? { type: "tile" as const, tx, ty, tile } : null;
  }

  private impact(p: Proj, x: number, y: number, angle: number) {
    const g = this.g;
    if (p.vortex) { p.vortex = false; g.vortex(x, y); }
    if (p.kind === "toner") { g.tonerBlast(x, y); return; }
    if (p.kind === "phone") { g.phoneLanded(x, y, p.friendly, p.owner); return; }
    if (p.kind === "drop") {
      g.fx.burst("water", x, y, 2);
      if (chance(0.14)) g.hazards.addWater(g.hazards.idx(x - Math.cos(angle) * 10, y - Math.sin(angle) * 10));
      return;
    }
    if (p.friendly && p.explode > 0) {
      g.explosion(x, y, 55 + p.explode * 20, p.dmg * 0.75, { friendly: true, small: true });
      return;
    }
    if (p.kind === "coffee") {
      g.fx.burst("coffee", x, y, 4);
      if (GameState.stats.irish && Math.random() < 0.35) g.hazards.igniteAt(x, y, 1.4);
      if (Math.random() < 0.25) g.fx.decal(x, y, "h_coffee", { scale: rand(0.3, 0.5), alpha: 0.7 });
    } else if (p.kind === "calc") {
      g.fx.burst("pixel", x, y, 8, 0x3a404b);
      g.audio.play("plate", { vol: 0.3, minGap: 60 });
    } else if (p.kind === "memo") {
      g.fx.burst("confetti", x, y, 4);
    } else {
      g.fx.spray("spark", x, y, 5, angle + Math.PI, 50, p.friendly ? 0xfff1c0 : 0x9fe8ff);
      if (p.friendly) g.audio.play("wall", { vol: 0.12, minGap: 50 });
    }
  }

  private expire(p: Proj) {
    if (p.vortex) { p.vortex = false; this.g.vortex(p.x, p.y); }
    if (p.kind === "toner") { this.g.tonerBlast(p.x, p.y); return; }
    if (p.kind === "phone") { this.g.phoneLanded(p.x, p.y, p.friendly, p.owner); return; }
    if (p.kind === "drop") {
      if (chance(0.07)) this.g.hazards.addWater(this.g.hazards.idx(p.x, p.y));
      return;
    }
    if (p.friendly && p.explode > 0 && p.kind !== "coffee") this.impact(p, p.x, p.y, 0);
    if (p.kind === "coffee") this.g.fx.burst("coffee", p.x, p.y, 2);
  }

  private hitEnemies(p: Proj): boolean {
    const g = this.g;
    for (const e of g.enemies) {
      if (e.dead || !e.hostile || p.hit.has(e.id)) continue;
      const rr = e.r + p.radius;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      const ang = Math.atan2(p.vy, p.vx);
      if (!p.bounced && e.blocksShot(ang)) {
        g.fx.spray("spark", p.x, p.y, 6, ang + Math.PI, 40, 0xffffff);
        g.audio.play("ping", { vol: 0.25, minGap: 60 });
        g.fx.text(e.x, e.y - 40, "BLOCKED", { color: "#c9d1e6", size: 13, dur: 0.5 });
        g.tipOnce("shield", "Riot shields block shots from the front. Slip them in water, or bounce shots off a wall to hit them!", "#e9c25a");
        if (p.bounces > 0) {
          p.bounces--;
          p.vx = -p.vx; p.vy = -p.vy;
          p.hit.add(e.id);
          return true;
        }
        return false;
      }
      p.hit.add(e.id);
      if (p.bounced && e.def.shield) {
        p.dmg *= 1.5;
        g.fx.text(e.x, e.y - 46, "TRICK SHOT!", { color: "#6aa3b4", size: 16, pop: true, dur: 0.8 });
      }
      const spray = p.kind === "drop" || p.kind === "confetti";
      const killed = g.hitEnemy(e, p.dmg, { angle: ang, kind: p.deflected ? "deflect" : p.kind, x: p.x, y: p.y, knock: KNOCK[p.kind] ?? 120, silent: spray });
      if (p.kind === "drop") e.soaked = Math.max(e.soaked, 4);
      // A swatted-back phone goes off in their face.
      if (p.kind === "phone") { g.phoneLanded(p.x, p.y, true, null); return false; }
      if (p.vortex) { p.vortex = false; g.vortex(p.x, p.y); }
      if (spray) g.audio.play("hit", { vol: 0.12, rate: 1.5, minGap: 70 });
      if (p.explode > 0) g.explosion(p.x, p.y, 55 + p.explode * 20, p.dmg * 0.75, { friendly: true, small: true, skip: e });
      if (killed && p.canSplit) this.split(p, e);
      if (p.pierce > 0) {
        p.pierce--;
        continue;
      }
      return false;
    }
    return true;
  }

  private split(p: Proj, e: Enemy) {
    const n = 3 + (GameState.stats.split - 1) * 2;
    const base = rand(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const s = this.firePlayer("shard", e.x, e.y, base + (k / n) * Math.PI * 2);
      s.hit.add(e.id);
    }
  }

  private hitPlayerSide(p: Proj): boolean {
    const g = this.g;
    const pl = g.player;
    if (!pl.dead) {
      const rr = pl.r + p.radius - 3;
      if ((pl.x - p.x) ** 2 + (pl.y - p.y) ** 2 <= rr * rr) {
        if (pl.rolling > 0 || pl.invuln > 0) return true; // dodge through
        if (p.stun > 0) {
          pl.stun = Math.max(pl.stun, p.stun);
          g.fx.text(pl.x, pl.y - 34, "STUNNED", { color: "#e9c25a", size: 15, dur: 0.7 });
        }
        pl.damage(p.dmg, p.x - p.vx, p.y - p.vy, p.kind, p.owner ?? undefined);
        this.impact(p, p.x, p.y, Math.atan2(p.vy, p.vx));
        return false;
      }
    }
    // Enemy fire can also hit the player's allies, and whoever the office is blaming right now.
    for (const a of g.enemies) {
      if (a.dead || a === p.owner) continue;
      if (a.scapegoat > 0) {
        const rr = a.r + p.radius;
        if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= rr * rr) {
          if (a.takeDamage(a.maxHp * 0.12, Math.atan2(p.vy, p.vx), 80)) g.killEnemy(a, false);
          this.impact(p, p.x, p.y, Math.atan2(p.vy, p.vx));
          return false;
        }
        continue;
      }
      if (!a.ally) continue;
      const rr = a.r + p.radius;
      if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= rr * rr) {
        a.takeDamage(p.dmg * 8, Math.atan2(p.vy, p.vx), 80);
        this.impact(p, p.x, p.y, Math.atan2(p.vy, p.vx));
        return false;
      }
    }
    return true;
  }
}
