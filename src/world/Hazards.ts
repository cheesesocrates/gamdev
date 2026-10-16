import Phaser from "phaser";
import { DEPTH, TILE } from "../config";
import { World } from "./World";
import { Effects } from "../systems/Effects";
import { AudioManager } from "../systems/Audio";
import { rand, chance } from "../util/math";

/**
 * Tile-based environmental hazards shared by both phases: water puddles
 * (slippery; electrified when touching an overloaded power strip), shredded
 * paper (flammable), and fire that spreads along paper and leaves scorch marks.
 */
export class Hazards {
  private scene: Phaser.Scene;
  private world: World;
  private fx: Effects;
  private audio: AudioManager;
  private w: number;
  private h: number;
  water: Uint8Array;
  paper: Uint8Array;
  fire: Float32Array;
  electric: Uint8Array;
  private waterImg = new Map<number, Phaser.GameObjects.Image>();
  private paperImg = new Map<number, Phaser.GameObjects.Image>();
  private sparks = new Set<number>();
  private pendingWater: { i: number; t: number }[] = [];
  private electricDirty = false;
  private fireEmitTimer = 0;
  private spreadTimer = 0;
  private zapTimer = 0;
  allElectric = false;
  burningCount = 0;

  constructor(scene: Phaser.Scene, world: World, fx: Effects, audio: AudioManager) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    this.w = world.w;
    this.h = world.h;
    const n = this.w * this.h;
    this.water = new Uint8Array(n);
    this.paper = new Uint8Array(n);
    this.fire = new Float32Array(n);
    this.electric = new Uint8Array(n);
  }

  idx(x: number, y: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return -1;
    return ty * this.w + tx;
  }

  isWater(x: number, y: number) { const i = this.idx(x, y); return i >= 0 && this.water[i] === 1; }
  isElectric(x: number, y: number) { const i = this.idx(x, y); return i >= 0 && this.electric[i] === 1; }
  isFire(x: number, y: number) { const i = this.idx(x, y); return i >= 0 && this.fire[i] > 0; }
  isPaper(x: number, y: number) { const i = this.idx(x, y); return i >= 0 && this.paper[i] === 1; }

  private floorTile(i: number) {
    return this.world.tileSolid(i % this.w, Math.floor(i / this.w)) === false;
  }

  addWater(i: number) {
    if (i < 0 || this.water[i] || !this.floorTile(i)) return;
    this.water[i] = 1;
    if (this.fire[i] > 0) this.extinguish(i);
    const x = (i % this.w + 0.5) * TILE, y = (Math.floor(i / this.w) + 0.5) * TILE;
    const img = this.scene.add.image(x, y, "h_water").setDepth(DEPTH.HAZARD).setAlpha(0);
    img.setRotation(Math.floor(Math.random() * 4) * Math.PI / 2);
    this.scene.tweens.add({ targets: img, alpha: 1, duration: 260 });
    this.waterImg.set(i, img);
    this.electricDirty = true;
  }

  /** Spreads a puddle outward from a point over ~a second. */
  flood(x: number, y: number, tiles: number, speed = 0.06) {
    const start = this.idx(x, y);
    if (start < 0) return;
    const seen = new Set<number>([start]);
    const queue: { i: number; d: number }[] = [{ i: start, d: 0 }];
    let added = 0;
    while (queue.length && added < tiles) {
      // Random-ish BFS gives organic puddle shapes.
      const k = Math.floor(Math.random() * Math.min(queue.length, 3));
      const { i, d } = queue.splice(k, 1)[0];
      if (!this.floorTile(i)) continue;
      this.pendingWater.push({ i, t: d * speed + rand(0, 0.08) });
      added++;
      const tx = i % this.w, ty = Math.floor(i / this.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const ni = ny * this.w + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        queue.push({ i: ni, d: d + 1 });
      }
    }
  }

  addPaper(i: number) {
    if (i < 0 || this.paper[i] || this.water[i] || !this.floorTile(i)) return false;
    this.paper[i] = 1;
    const x = (i % this.w + 0.5) * TILE, y = (Math.floor(i / this.w) + 0.5) * TILE;
    const img = this.scene.add.image(x + rand(-4, 4), y + rand(-4, 4), "h_paper").setDepth(DEPTH.HAZARD + 1);
    img.setRotation(Math.floor(Math.random() * 4) * Math.PI / 2);
    this.paperImg.set(i, img);
    return true;
  }

  paperPatch(x: number, y: number, radius: number) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius + 1) continue;
      const tx = cx + dx, ty = cy + dy;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      if (chance(0.8)) this.addPaper(ty * this.w + tx);
    }
  }

  /** Sets a tile on fire. Paper burns long; bare floor only flickers briefly. */
  ignite(i: number, bareDuration = 0) {
    if (i < 0 || this.water[i] || !this.floorTile(i)) return false;
    if (this.paper[i]) {
      if (this.fire[i] <= 0) {
        this.fire[i] = rand(3.5, 5.2);
        if (chance(0.3)) this.audio.play("fire", { vol: 0.25, minGap: 120 });
      }
      return true;
    }
    if (bareDuration > 0 && this.fire[i] < bareDuration) {
      this.fire[i] = bareDuration;
      return true;
    }
    return false;
  }

  igniteAt(x: number, y: number, bareDuration = 0) {
    return this.ignite(this.idx(x, y), bareDuration);
  }

  igniteRadius(x: number, y: number, r: number, bareDuration: number) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    const rt = Math.ceil(r / TILE);
    for (let dy = -rt; dy <= rt; dy++) for (let dx = -rt; dx <= rt; dx++) {
      const tx = cx + dx, ty = cy + dy;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      const px = (tx + 0.5) * TILE, py = (ty + 0.5) * TILE;
      if ((px - x) ** 2 + (py - y) ** 2 > r * r) continue;
      this.ignite(ty * this.w + tx, bareDuration * rand(0.7, 1.2));
    }
  }

  private extinguish(i: number) {
    this.fire[i] = 0;
    const x = (i % this.w + 0.5) * TILE, y = (Math.floor(i / this.w) + 0.5) * TILE;
    this.fx.burst("smoke", x, y, 3);
  }

  addSpark(x: number, y: number) {
    const i = this.idx(x, y);
    if (i < 0) return;
    this.sparks.add(i);
    this.electricDirty = true;
  }

  setAllElectric(v: boolean) {
    if (this.allElectric !== v) {
      this.allElectric = v;
      this.electricDirty = true;
    }
  }

  private recomputeElectric() {
    this.electric.fill(0);
    const queue: number[] = [];
    if (this.allElectric) {
      for (let i = 0; i < this.water.length; i++) if (this.water[i]) { this.electric[i] = 1; }
    } else {
      for (const s of this.sparks) {
        const sx = s % this.w, sy = Math.floor(s / this.w);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = sx + dx, ny = sy + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = ny * this.w + nx;
          if (this.water[ni] && !this.electric[ni]) { this.electric[ni] = 1; queue.push(ni); }
        }
      }
      while (queue.length) {
        const c = queue.pop()!;
        const cx = c % this.w, cy = Math.floor(c / this.w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = ny * this.w + nx;
          if (this.water[ni] && !this.electric[ni]) { this.electric[ni] = 1; queue.push(ni); }
        }
      }
    }
    for (const [i, img] of this.waterImg) {
      if (this.electric[i]) img.setTint(0x9ff0ff); else img.clearTint();
    }
  }

  update(dt: number) {
    // Animate pending flood tiles.
    if (this.pendingWater.length) {
      for (const p of this.pendingWater) p.t -= dt;
      const ready = this.pendingWater.filter((p) => p.t <= 0);
      this.pendingWater = this.pendingWater.filter((p) => p.t > 0);
      for (const p of ready) {
        this.addWater(p.i);
        if (chance(0.25)) {
          this.fx.burst("water", (p.i % this.w + 0.5) * TILE, (Math.floor(p.i / this.w) + 0.5) * TILE, 3);
        }
      }
    }
    if (this.electricDirty) {
      this.electricDirty = false;
      this.recomputeElectric();
    }

    // Fire: burn down, spread along paper, emit flames.
    this.spreadTimer -= dt;
    this.fireEmitTimer -= dt;
    const doSpread = this.spreadTimer <= 0;
    if (doSpread) this.spreadTimer = 0.22;
    const doEmit = this.fireEmitTimer <= 0;
    if (doEmit) this.fireEmitTimer = 0.07;
    let burning = 0;
    for (let i = 0; i < this.fire.length; i++) {
      if (this.fire[i] <= 0) continue;
      burning++;
      this.fire[i] -= dt;
      const x = (i % this.w + 0.5) * TILE, y = (Math.floor(i / this.w) + 0.5) * TILE;
      if (doEmit) {
        this.fx.burst("fire", x + rand(-22, 22), y + rand(-18, 18), 1);
        if (chance(0.3)) this.fx.burst("ember", x + rand(-20, 20), y + rand(-20, 20), 1);
      }
      if (doSpread && this.paper[i]) {
        const tx = i % this.w, ty = Math.floor(i / this.w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = ny * this.w + nx;
          if (this.paper[ni] && this.fire[ni] <= 0 && chance(0.55)) this.ignite(ni);
        }
      }
      if (this.fire[i] <= 0) {
        this.fire[i] = 0;
        if (this.paper[i]) {
          this.paper[i] = 0;
          this.paperImg.get(i)?.destroy();
          this.paperImg.delete(i);
        }
        this.fx.decal(x + rand(-6, 6), y + rand(-6, 6), "fx_scorch_02", { scale: rand(0.16, 0.22), alpha: 0.55, tint: 0x111111 });
        this.fx.burst("smoke", x, y, 2);
      }
    }
    this.burningCount = burning;

    // Crackle on live water.
    this.zapTimer -= dt;
    if (this.zapTimer <= 0) {
      this.zapTimer = 0.12;
      for (const [i] of this.waterImg) {
        if (!this.electric[i] || !chance(0.12)) continue;
        const x = (i % this.w + 0.5) * TILE + rand(-24, 24), y = (Math.floor(i / this.w) + 0.5) * TILE + rand(-24, 24);
        this.fx.burst("zap", x, y, 2);
      }
      for (const img of this.waterImg.values()) {
        if (img.tintTopLeft === 0x9ff0ff) img.setAlpha(0.75 + Math.random() * 0.25);
      }
    }
  }

  clear() {
    for (const img of this.waterImg.values()) img.destroy();
    for (const img of this.paperImg.values()) img.destroy();
    this.waterImg.clear();
    this.paperImg.clear();
    this.water.fill(0);
    this.paper.fill(0);
    this.fire.fill(0);
    this.electric.fill(0);
    this.sparks.clear();
    this.pendingWater = [];
    this.electricDirty = true;
  }
}
