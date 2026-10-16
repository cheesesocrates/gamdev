import Phaser from "phaser";
import { DEPTH } from "../config";
import { GameState } from "../systems/GameState";
import { rand, angleDiff } from "../util/math";
import { Tile } from "../world/OfficeMap";
import type { GameScene } from "../scenes/GameScene";
import type { Enemy } from "./Enemy";

export type ProjKind = "staple" | "coffee" | "shard" | "calc" | "memo" | "bolt" | "wave";

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
}

const TEX: Record<ProjKind, string> = {
  staple: "p_staple", coffee: "p_coffee", shard: "p_staple", calc: "p_calc", memo: "p_memo", bolt: "p_bolt", wave: "p_wave"
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
        pierce: 0, bounces: 0, homing: 0, explode: 0, canSplit: false, spin: 0, hit: new Set(), sprite, trail: 0, stun: 0
      };
      this.list.push(p);
    }
    p.active = true;
    p.hit.clear();
    p.sprite.setVisible(true).setAlpha(1).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    return p;
  }

  /** Player shot with every upgrade applied. */
  firePlayer(kind: "staple" | "coffee" | "shard", x: number, y: number, angle: number, speedJitter = 1): Proj {
    const st = GameState.stats;
    const p = this.obtain();
    p.friendly = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    const base = kind === "staple" ? 1020 : kind === "coffee" ? 700 : 800;
    const speed = base * st.projSpeedMult * speedJitter;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.dmg = (kind === "staple" ? 11 : kind === "coffee" ? 7.5 : 6) * st.dmgMult;
    p.range = (kind === "staple" ? 820 : kind === "coffee" ? 330 : 380) * st.projSpeedMult;
    p.radius = (kind === "coffee" ? 7 : 6) * st.sizeMult;
    p.pierce = st.pierce + (kind === "shard" ? 1 : 0);
    p.bounces = kind === "coffee" ? Math.ceil(st.bounces / 2) : st.bounces;
    p.homing = kind === "shard" ? 0 : st.homing;
    p.explode = st.explode;
    p.canSplit = kind !== "shard" && st.split > 0;
    p.spin = 0;
    p.stun = 0;
    p.trail = 0;
    p.sprite.setTexture(TEX[kind]).setScale(st.sizeMult * (kind === "shard" ? 0.7 : 1));
    if (kind === "shard") p.sprite.setTint(0xffe28a);
    p.sprite.setRotation(angle);
    return p;
  }

  fireEnemy(kind: "calc" | "memo" | "bolt" | "wave", x: number, y: number, angle: number, speed: number, dmg: number) {
    const p = this.obtain();
    p.friendly = false;
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
      for (let s = 0; s < steps && alive; s++) {
        const nx = p.x + p.vx * sdt, ny = p.y + p.vy * sdt;
        const hit = g.world.shotBlockedAt(nx, ny);
        if (hit) {
          alive = this.onSolid(p, nx, ny, hit, sdt);
          continue;
        }
        p.x = nx;
        p.y = ny;
        p.range -= speed * sdt;
        if (p.range <= 0) { alive = false; this.expire(p); break; }
        alive = p.friendly ? this.hitEnemies(p) : this.hitPlayerSide(p);
      }
      if (!alive) { this.kill(p); continue; }

      p.sprite.setPosition(p.x, p.y);
      if (p.spin) p.sprite.rotation += p.spin * dt;
      else p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      if (p.kind === "coffee") p.sprite.setAlpha(Math.min(1, p.range / 80));
      if (p.kind === "wave") p.sprite.setScale(1.3 + (300 - p.range) / 160).setAlpha(Math.min(1, p.range / 120));
      p.trail -= dt;
      if (p.trail <= 0 && (p.kind === "bolt" || (p.friendly && (p.homing || p.explode)))) {
        p.trail = 0.03;
        g.fx.burst("spark", p.x, p.y, 1, p.kind === "bolt" ? 0x6fd8ff : p.explode ? 0xffa040 : 0xffe28a);
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

  private impact(p: Proj, x: number, y: number, angle: number) {
    const g = this.g;
    if (p.friendly && p.explode > 0) {
      g.explosion(x, y, 55 + p.explode * 20, p.dmg * 0.75, { friendly: true, small: true });
      return;
    }
    if (p.kind === "coffee") {
      g.fx.burst("coffee", x, y, 4);
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
      if (e.blocksShot(ang)) {
        g.fx.spray("spark", p.x, p.y, 6, ang + Math.PI, 40, 0xffffff);
        g.audio.play("ping", { vol: 0.25, minGap: 60 });
        if (p.bounces > 0) {
          p.bounces--;
          p.vx = -p.vx; p.vy = -p.vy;
          p.hit.add(e.id);
          return true;
        }
        return false;
      }
      p.hit.add(e.id);
      const killed = g.hitEnemy(e, p.dmg, { angle: ang, kind: p.kind, x: p.x, y: p.y, knock: p.kind === "coffee" ? 260 : 120 });
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
          g.fx.text(pl.x, pl.y - 34, "STUNNED", { color: "#ffd75a", size: 15, dur: 0.7 });
        }
        pl.damage(p.dmg, p.x - p.vx, p.y - p.vy, p.kind);
        this.impact(p, p.x, p.y, Math.atan2(p.vy, p.vx));
        return false;
      }
    }
    // Enemy fire can also hit the player's intern allies.
    for (const a of g.enemies) {
      if (a.dead || !a.ally) continue;
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
