import { TILE } from "../config";
import { GameState } from "../systems/GameState";
import { clamp, pick } from "../util/math";
import type { GameScene } from "../scenes/GameScene";
import type { FurnObj } from "./Furniture";
import type { Collider } from "./World";

/** Furniture light enough to shove around: break-room tables, coffee tables, desks, boxes and potted plants. */
const PUSHABLE = /^(break_table|coffee_table|box|ws_[abc]_\d+|ws_hr|plant)$/;

interface Prop {
  f: FurnObj;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  mass: number;
  moving: boolean;
  /** Colliders it already overlaps at home (cubicle partitions): ignored so desks can slide out. */
  neighbours: Set<Collider>;
  hitCd: Map<number, number>;
  /** Potted plants shatter when they hit something hard; swept up overnight. */
  fragile: boolean;
  broken: boolean;
  /** The boss (you) set it moving: only then does it hurt the coworkers it runs into. */
  byPlayer: boolean;
}

/** How fast a shoved desk has to be travelling *into* a coworker (along the contact normal) to hurt them. */
const RAM_SPEED = 140;

/**
 * Pushable furniture. Lean into a table and it slides; dodge-roll into it and it
 * flies, bowling over any coworker in its way. Everything goes back overnight.
 */
export class Props {
  list: Prop[] = [];
  private navDirty = false;
  private navT = 0;

  constructor(private g: GameScene, furniture: Map<string, FurnObj>, skip: Set<FurnObj>) {
    for (const f of furniture.values()) {
      if (!f.collider || !f.collider.solid || skip.has(f) || !PUSHABLE.test(f.key)) continue;
      const neighbours = new Set<Collider>();
      g.world.queryBox(f.x - f.w / 2 - 2, f.y - f.h / 2 - 2, f.x + f.w / 2 + 2, f.y + f.h / 2 + 2, (c) => { if (c !== f.collider) neighbours.add(c); });
      const area = (f.w * f.h) / (TILE * TILE);
      this.list.push({ f, homeX: f.x, homeY: f.y, vx: 0, vy: 0, mass: Math.max(0.6, area * 1.6), moving: false, neighbours, hitCd: new Map(), fragile: f.key === "plant", broken: false, byPlayer: false });
    }
  }

  /** Overnight the cleaners put every desk back where it belongs. */
  reset() {
    for (const p of this.list) {
      p.vx = p.vy = 0;
      p.moving = false;
      p.byPlayer = false;
      p.hitCd.clear();
      p.broken = false;
      p.f.sprite.setVisible(true);
      this.place(p, p.homeX, p.homeY);
    }
  }

  /** Something huge (a charging boss) hit this piece of furniture: it flies (plants shatter). False if it isn't a prop. */
  launch(f: FurnObj, vx: number, vy: number, by?: { id: number }): boolean {
    const p = this.list.find((q) => q.f === f);
    if (!p || p.broken) return false;
    if (p.fragile) { this.shatter(p, false); return true; }
    if (Math.hypot(p.vx, p.vy) > Math.hypot(vx, vy) * 0.6) return true;
    p.vx = vx;
    p.vy = vy;
    p.moving = true;
    p.byPlayer = false;
    // Whoever sent it flying doesn't get hit by it.
    if (by) p.hitCd.set(by.id, 1.2);
    this.g.audio.play("wood_heavy", { vol: 0.6, minGap: 80 });
    this.g.fx.burst("pixel", f.x, f.y, 10, 0xd8c3a5);
    return true;
  }

  private place(p: Prop, x: number, y: number) {
    const f = p.f;
    f.x = x;
    f.y = y;
    this.g.world.moveCollider(f.collider!, x - f.w / 2, y - f.h / 2, x + f.w / 2, y + f.h / 2);
    f.sprite.setPosition(x, y).setDepth(y + f.h / 2);
  }

  private free(p: Prop, x: number, y: number) {
    const f = p.f;
    return this.g.world.boxFree(x - f.w / 2 + 1, y - f.h / 2 + 1, x + f.w / 2 - 1, y + f.h / 2 - 1, f.collider!, p.neighbours);
  }

  update(dt: number) {
    const g = this.g, pl = g.player;
    if (g.phase === "title" || pl.dead) return;
    const jockey = GameState.stats.deskJockey;
    for (const p of this.list) {
      if (p.broken) continue;
      const f = p.f;
      // Is the boss leaning on it?
      const cx = clamp(pl.x, f.x - f.w / 2, f.x + f.w / 2), cy = clamp(pl.y, f.y - f.h / 2, f.y + f.h / 2);
      const dx = pl.x - cx, dy = pl.y - cy;
      if (dx * dx + dy * dy < (pl.r + 3) ** 2) {
        const horiz = Math.abs(dx) > Math.abs(dy);
        const nx = horiz ? -Math.sign(dx) : 0, ny = horiz ? 0 : -Math.sign(dy);
        const into = pl.vx * nx + pl.vy * ny;
        const kick = (1100 / Math.sqrt(p.mass)) * (jockey ? 1.6 : 1);
        if (pl.rolling > 0 && into > 100 && Math.hypot(p.vx, p.vy) < kick * 0.6) {
          // Dodge-roll into it: a proper shove.
          p.vx = nx * kick;
          p.vy = ny * kick;
          p.moving = true;
          p.byPlayer = true;
          g.audio.play("wood_heavy", { vol: 0.55, minGap: 120 });
          g.fx.shake(0.15);
          g.fx.burst("pixel", f.x, f.y, 8, 0xd8c3a5);
        } else if (into > 40) {
          const want = into * 0.9 * Math.min(1, 2.2 / p.mass) * (jockey ? 1.5 : 1);
          if (horiz) p.vx = nx * Math.max(Math.abs(p.vx), want); else p.vy = ny * Math.max(Math.abs(p.vy), want);
          p.moving = true;
          p.byPlayer = true;
        }
      }
      if (!p.moving) continue;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < 6) {
        p.vx = p.vy = 0;
        p.moving = false;
        p.byPlayer = false;
        this.navDirty = true;
        continue;
      }
      const steps = Math.max(1, Math.ceil((speed * dt) / 8));
      for (let s = 0; s < steps; s++) {
        const sx = (p.vx * dt) / steps, sy = (p.vy * dt) / steps;
        if (sx) {
          if (this.free(p, f.x + sx, f.y)) this.place(p, f.x + sx, f.y);
          else { this.bump(p, Math.abs(p.vx)); p.vx *= -0.25; }
        }
        if (sy) {
          if (this.free(p, f.x, f.y + sy)) this.place(p, f.x, f.y + sy);
          else { this.bump(p, Math.abs(p.vy)); p.vy *= -0.25; }
        }
      }
      if (speed > 160 && p.byPlayer && g.phase === "downsizing") this.ram(p, speed);
      const fr = Math.pow(0.08, dt);
      p.vx *= fr;
      p.vy *= fr;
      for (const [id, t] of p.hitCd) {
        if (t - dt <= 0) p.hitCd.delete(id); else p.hitCd.set(id, t - dt);
      }
    }
    this.navT -= dt;
    if (this.navDirty && this.navT <= 0) {
      this.navDirty = false;
      this.navT = 0.4;
      g.world.rebuildNav();
    }
  }

  private bump(p: Prop, speed: number) {
    if (p.fragile && speed > 480) { this.shatter(p, p.byPlayer); return; }
    if (speed < 160) return;
    const g = this.g;
    g.audio.play("wood", { vol: Math.min(0.6, speed / 900), minGap: 90 });
    g.fx.burst("pixel", p.f.x, p.f.y, 5, 0xd8c3a5);
  }

  /**
   * A desk you shoved, at full speed, bowls coworkers over. Only the ones it is actually travelling into:
   * walking into the side (or the back) of a sliding desk doesn't hurt.
   */
  private ram(p: Prop, speed: number) {
    const g = this.g, f = p.f;
    const jockey = GameState.stats.deskJockey;
    for (const e of [...g.enemies]) {
      if (e.dead || !e.hostile || p.hitCd.has(e.id)) continue;
      const cx = clamp(e.x, f.x - f.w / 2, f.x + f.w / 2), cy = clamp(e.y, f.y - f.h / 2, f.y + f.h / 2);
      const d2 = (e.x - cx) ** 2 + (e.y - cy) ** 2;
      if (d2 > (e.r + 8) ** 2) continue;
      // Contact normal from the desk to the coworker (from the centres when they already overlap).
      let nx = e.x - cx, ny = e.y - cy;
      if (d2 < 1) { nx = e.x - f.x; ny = e.y - f.y; }
      const nl = Math.hypot(nx, ny) || 1;
      if ((p.vx * nx + p.vy * ny) / nl < RAM_SPEED) continue;
      p.hitCd.set(e.id, 0.5);
      const ang = Math.atan2(p.vy, p.vx);
      e.stun = Math.max(e.stun, 0.8);
      const dmg = (12 + speed * 0.04) * Math.sqrt(p.mass) * GameState.stats.dmgMult * (jockey ? 3 : 1);
      g.fx.text(e.x, e.y - 40, pick(["DESK'D!", "TABLE FLIP!", "OOF!", "WRONG DESK!"]), { color: "#e9c25a", size: 17, pop: true, dur: 0.7 });
      g.audio.play("hit_heavy", { vol: 0.5, minGap: 60 });
      g.fx.shake(0.2);
      g.hitEnemy(e, dmg, { angle: ang, kind: "chair", x: e.x, y: e.y, knock: speed * 0.9 });
      p.vx *= 0.65;
      p.vy *= 0.65;
      if (p.fragile) { this.shatter(p, true); return; }
    }
  }

  /** A flying pot plant breaks on impact: soil everywhere, and (if you threw it) a little shrapnel for anyone close. */
  private shatter(p: Prop, hurt: boolean) {
    if (p.broken) return;
    const g = this.g, f = p.f;
    p.broken = true;
    p.moving = false;
    p.vx = p.vy = 0;
    f.sprite.setVisible(false);
    g.world.moveCollider(f.collider!, -9999, -9999, -9990, -9990);
    this.navDirty = true;
    g.fx.burst("pixel", f.x, f.y, 18, [0x6b4a33, 0x3f8f53, 0xc8683f]);
    g.fx.burst("smoke", f.x, f.y, 3, 0x6b4a33);
    g.fx.decal(f.x, f.y, "rubble", { scale: 0.7, alpha: 0.9, tint: 0x8a5a3b });
    g.audio.play("plate", { vol: 0.6, minGap: 60 });
    g.audio.play("crunch", { vol: 0.4, minGap: 60 });
    p.byPlayer = false;
    if (hurt && g.phase === "downsizing") {
      for (const e of [...g.enemies]) {
        if (e.dead || !e.hostile || (e.x - f.x) ** 2 + (e.y - f.y) ** 2 > 80 * 80) continue;
        e.stun = Math.max(e.stun, 0.6);
        g.hitEnemy(e, 18 * GameState.stats.dmgMult, { angle: Math.atan2(e.y - f.y, e.x - f.x), kind: "chair", x: e.x, y: e.y, knock: 260 });
      }
    }
  }
}
