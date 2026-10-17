import Phaser from "phaser";
import { DEPTH, TILE, WORLD_H, WORLD_W } from "../config";
import { World } from "./World";
import { Effects } from "../systems/Effects";
import { AudioManager } from "../systems/Audio";
import { rand, chance } from "../util/math";
import { GameState } from "../systems/GameState";

/** The water layer is painted at half resolution: 4x fewer pixels, and the soft edges look nicer anyway. */
const WS = 0.5;

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
  /** Every puddle tile is painted into one merged, semi-transparent layer so neighbours melt into a single pool. */
  private waterTiles = new Set<number>();
  private waterRT: Phaser.GameObjects.RenderTexture;
  /** Highlights baked into their own texture (a live Graphics object would be re-tessellated every frame). */
  private shineRT: Phaser.GameObjects.RenderTexture;
  private centres = new Map<number, { x: number; y: number; r: number }>();
  /** Tiles already stamped into the water layer, with the electric state they were painted in. */
  private painted = new Map<number, number>();
  private hasElectric = false;
  private waterDirty = false;
  private waterCd = 0;
  private paperImg = new Map<number, Phaser.GameObjects.Image[]>();
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
    const rw = Math.ceil(WORLD_W * WS), rh = Math.ceil(WORLD_H * WS);
    this.waterRT = scene.add.renderTexture(0, 0, rw, rh).setOrigin(0, 0).setScale(1 / WS).setDepth(DEPTH.HAZARD).setAlpha(0.78);
    this.shineRT = scene.add.renderTexture(0, 0, rw, rh).setOrigin(0, 0).setScale(1 / WS).setDepth(DEPTH.HAZARD + 0.5);

  }

  private hash(i: number) {
    const v = Math.sin(i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }
  /** Puddle blob for a tile, already in water-layer pixels (cached: it never changes). */
  private puddleCenter(i: number) {
    let c = this.centres.get(i);
    if (!c) {
      const tx = i % this.w, ty = Math.floor(i / this.w);
      c = {
        x: ((tx + 0.5) * TILE + (this.hash(i) - 0.5) * 9) * WS,
        y: ((ty + 0.5) * TILE + (this.hash(i * 1.7 + 3) - 0.5) * 9) * WS,
        r: (28 + this.hash(i * 2.3 + 1) * 6) * WS
      };
      this.centres.set(i, c);
    }
    return c;
  }

  /**
   * Repaints the merged puddle layer. Everything is stamped from three tiny textures
   * (a disc, a square, a highlight) in one batch: thousands of quads cost almost nothing,
   * where tessellating the same shapes as vector circles took tens of milliseconds.
   */
  /**
   * Paints only what changed. A new (or newly electrified) tile gets its rim; its neighbours'
   * bodies and their neighbours' centres are restamped on top so the pool stays one smooth blob
   * (exactly what a full repaint would produce, at a fraction of the cost).
   */
  private paintWater() {
    const tiles = this.waterTiles;
    const changed: number[] = [];
    for (const i of tiles) if (this.painted.get(i) !== this.electric[i]) changed.push(i);
    if (!changed.length) return;
    const grow = (set: Set<number>) => {
      const out = new Set(set);
      for (const i of set) {
        const tx = i % this.w, ty = Math.floor(i / this.w);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const n = ny * this.w + nx;
          if (tiles.has(n)) out.add(n);
        }
      }
      return out;
    };
    const rimSet = new Set(changed), bodySet = grow(rimSet), centreSet = grow(bodySet);
    const rt = this.waterRT;
    const disc = (x: number, y: number, r: number, tint: number) => rt.stamp("w_disc", undefined, x, y, { scale: r / 31, tint, skipBatch: true });
    const rect = (x: number, y: number, w: number, h: number, tint: number) =>
      rt.stamp("w_px", undefined, x, y, { scaleX: Math.max(0.01, w) / 8, scaleY: Math.max(0.01, h) / 8, originX: 0, originY: 0, tint, skipBatch: true });
    const W = this.w;
    const pass = (set: Set<number>, extraPx: number, color: (i: number) => number) => {
      const extra = extraPx * WS;
      for (const i of set) {
        const a = this.puddleCenter(i);
        const col = color(i);
        disc(a.x, a.y, a.r + extra, col);
        const tx = i % W, ty = Math.floor(i / W);
        // Bridges to every wet neighbour (both directions: the neighbour may not be repainted).
        if (tx < W - 1 && tiles.has(i + 1)) { const b = this.puddleCenter(i + 1), h = Math.min(a.r, b.r) * 2 + extra * 2; rect(Math.min(a.x, b.x), (a.y + b.y) / 2 - h / 2, Math.abs(b.x - a.x), h, col); }
        if (tx > 0 && tiles.has(i - 1)) { const b = this.puddleCenter(i - 1), h = Math.min(a.r, b.r) * 2 + extra * 2; rect(Math.min(a.x, b.x), (a.y + b.y) / 2 - h / 2, Math.abs(b.x - a.x), h, col); }
        if (ty < this.h - 1 && tiles.has(i + W)) { const b = this.puddleCenter(i + W), h = Math.min(a.r, b.r) * 2 + extra * 2; rect((a.x + b.x) / 2 - h / 2, Math.min(a.y, b.y), h, Math.abs(b.y - a.y), col); }
        if (ty > 0 && tiles.has(i - W)) { const b = this.puddleCenter(i - W), h = Math.min(a.r, b.r) * 2 + extra * 2; rect((a.x + b.x) / 2 - h / 2, Math.min(a.y, b.y), h, Math.abs(b.y - a.y), col); }
        // Fill the holes where four puddle tiles meet (any 2x2 block this tile belongs to).
        for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
          const bx = tx + ox, by = ty + oy;
          if (bx < 0 || by < 0 || bx >= W - 1 || by >= this.h - 1) continue;
          const t0 = by * W + bx;
          if (tiles.has(t0) && tiles.has(t0 + 1) && tiles.has(t0 + W) && tiles.has(t0 + W + 1)) {
            const p = this.puddleCenter(t0), q = this.puddleCenter(t0 + W + 1);
            rect(p.x, p.y, q.x - p.x, q.y - p.y, col);
          }
        }
      }
    };
    rt.beginDraw();
    pass(rimSet, 4, (i) => (this.electric[i] ? 0x39a8d0 : 0x2b6f9e)); // wet rim
    pass(bodySet, 0, (i) => (this.electric[i] ? 0x8fe8ff : 0x4aa6dd)); // body
    pass(centreSet, -9, (i) => (this.electric[i] ? 0xd2fbff : 0x72c4f2)); // calm centre
    rt.endDraw();
    const sh = this.shineRT;
    let shine = false;
    for (const i of changed) {
      if (this.painted.has(i) || this.hash(i * 3.1 + 7) < 0.45) continue;
      if (!shine) { sh.beginDraw(); shine = true; }
      const a = this.puddleCenter(i);
      sh.stamp("w_shine", undefined, a.x, a.y, { scale: WS, skipBatch: true });
    }
    if (shine) sh.endDraw();
    for (const i of changed) this.painted.set(i, this.electric[i]);
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
    this.waterTiles.add(i);
    this.waterDirty = true;
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
    const sheets: Phaser.GameObjects.Image[] = [];
    const n = 5 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const img = this.scene.add.image(x + rand(-26, 26), y + rand(-26, 26), Math.random() < 0.3 ? "h_sheet2" : "h_sheet")
        .setDepth(DEPTH.HAZARD + 1 + k * 0.01).setRotation(rand(0, Math.PI * 2)).setScale(rand(0.8, 1.15));
      if (Math.random() < 0.3) img.setTint(0xe8e0c4);
      sheets.push(img);
    }
    this.paperImg.set(i, sheets);
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
        this.fire[i] = rand(3.5, 5.2) * (GameState.stats.kindling ? 1.6 : 1);
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
    this.hasElectric = false;
    for (const i of this.waterTiles) if (this.electric[i]) { this.hasElectric = true; break; }
    this.waterDirty = true;
  }

  update(dt: number) {
    // Only spend particles where someone can see them.
    const view = this.scene.cameras.main.worldView;
    const vx0 = view.x - 120, vy0 = view.y - 120, vx1 = view.right + 120, vy1 = view.bottom + 120;
    // Animate pending flood tiles.
    if (this.pendingWater.length) {
      let k = 0;
      for (const p of this.pendingWater) {
        p.t -= dt;
        if (p.t > 0) { this.pendingWater[k++] = p; continue; }
        this.addWater(p.i);
        if (chance(0.25)) this.fx.burst("water", (p.i % this.w + 0.5) * TILE, (Math.floor(p.i / this.w) + 0.5) * TILE, 3);
      }
      this.pendingWater.length = k;
    }
    if (this.electricDirty) {
      this.electricDirty = false;
      this.recomputeElectric();
    }
    this.waterCd -= dt;
    if (this.waterDirty && this.waterCd <= 0) {
      this.waterDirty = false;
      this.waterCd = 0.08;
      this.paintWater();
    }
    if (this.waterTiles.size) this.shineRT.setAlpha(0.55 + 0.45 * Math.sin(this.scene.time.now / 420));

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
      if (doEmit && x > vx0 && x < vx1 && y > vy0 && y < vy1) {
        this.fx.burst("fire", x + rand(-22, 22), y + rand(-18, 18), 1);
        const sheets = this.paperImg.get(i);
        if (sheets) for (const sh of sheets) sh.setTint(0xff8a3a);
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
          this.paperImg.get(i)?.forEach((sh) => sh.destroy());
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
      if (this.hasElectric) {
        for (const i of this.waterTiles) {
          if (!this.electric[i] || !chance(0.12)) continue;
          const x = (i % this.w + 0.5) * TILE + rand(-24, 24), y = (Math.floor(i / this.w) + 0.5) * TILE + rand(-24, 24);
          if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
          this.fx.burst("zap", x, y, 2);
        }
        this.waterRT.setAlpha(0.7 + Math.random() * 0.25);
      } else this.waterRT.setAlpha(0.78);
    }
  }

  clear() {
    for (const sheets of this.paperImg.values()) sheets.forEach((sh) => sh.destroy());
    this.waterTiles.clear();
    this.waterRT.clear();
    this.shineRT.clear();
    this.painted.clear();
    this.hasElectric = false;
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
