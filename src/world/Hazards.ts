import Phaser from "phaser";
import { DEPTH, TILE, WORLD_H, WORLD_W } from "../config";
import { World } from "./World";
import { Effects } from "../systems/Effects";
import { AudioManager } from "../systems/Audio";
import { rand, chance } from "../util/math";
import { GameState } from "../systems/GameState";

/** The water layer is painted at half resolution: 4x fewer pixels, and the soft edges look nicer anyway. */
const WS = 0.5;

/** One blaze's pooled images: a warm light on the floor, fire puffs, a white-hot heart, licking flame tongues, smoke. */
interface Blaze {
  glow: Phaser.GameObjects.Image;
  puffs: Phaser.GameObjects.Image[];
  core: Phaser.GameObjects.Image;
  tongues: Phaser.GameObjects.Image[];
  smoke: Phaser.GameObjects.Image[];
  /** How much smoke shows (eased): only the far side of a fire, where nothing burns beyond it, smokes. */
  fume: number;
  /** How bright its light on the floor is (eased): in the middle of a big fire the blazes round it light the floor. */
  light: number;
  /** Index into BLAZE. */
  kind: number;
  /** Randomises every loop of this blaze, so neighbouring fires never pulse in sync. */
  seed: number;
  born: number;
  stamp: number;
}
type FlamePart = "glow" | "puff" | "core" | "tongue" | "smoke";

/**
 * Blaze looks: a burning paper pile, a bare-floor flicker, a burning coworker. Distances are world px at size 1,
 * the rest are texture scales and alphas; `life` is a puff's loop in seconds, `fade` how long the dying fire shrinks.
 */
const BLAZE = [
  { puffs: 3, tongues: 2, smoke: 1, life: 0.8, spread: 40, rise: 58, puff: 0.68, puffA: 1, core: 0.76, coreA: 0.58, tongue: 0.66, glow: 4.2, glowA: 0.55, smokeS: 1.15, smokeA: 0.55, fade: 1.4 },
  { puffs: 2, tongues: 1, smoke: 0, life: 0.6, spread: 26, rise: 36, puff: 0.48, puffA: 1, core: 0.48, coreA: 0.5, tongue: 0.46, glow: 2.6, glowA: 0.45, smokeS: 0, smokeA: 0, fade: 0.8 },
  { puffs: 3, tongues: 3, smoke: 0, life: 0.5, spread: 22, rise: 44, puff: 0.52, puffA: 0.9, core: 0.56, coreA: 0.55, tongue: 0.6, glow: 2.2, glowA: 0.45, smokeS: 0, smokeA: 0, fade: 0 }
];
/**
 * The fight's lighting multiplies the world by a cool grey, so a colour whose green clips turns lime (and white turns
 * lavender). Every layer keeps green well under red, so even stacked they top out at a hot yellow.
 */
const PUFF_HOT = 0xffd8ac, PUFF_MID = 0xff9658, PUFF_END = 0xc0442a;
const SMOKE_LIT = 0xffb080, SMOKE_GREY = 0xb8b0a8;

/** Linear blend of two 0xRRGGBB colours. */
function mixColor(a: number, b: number, t: number) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * t) << 16) | ((ag + (((b >> 8) & 255) - ag) * t) << 8) | (ab + ((b & 255) - ab) * t);
}

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
  /** Animated blazes for burning tiles that are on screen, and for burning coworkers (by id). */
  private flames = new Map<number, Blaze>();
  private bodies = new Map<number, Blaze>();
  private flamePools: Record<FlamePart, Phaser.GameObjects.Image[]> = { glow: [], puff: [], core: [], tongue: [], smoke: [] };
  private flameStamp = 0;
  private bodyStamp = 0;
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
    this.flameStamp++;
    for (let i = 0; i < this.fire.length; i++) {
      if (this.fire[i] <= 0) continue;
      burning++;
      this.fire[i] -= dt;
      const x = (i % this.w + 0.5) * TILE, y = (Math.floor(i / this.w) + 0.5) * TILE;
      const onScreen = x > vx0 && x < vx1 && y > vy0 && y < vy1;
      if (onScreen) this.animateFlames(i, x, y, dt);
      if (doEmit && onScreen) {
        const big = this.paper[i] === 1;
        if (chance(big ? 0.14 : 0.06)) this.fx.burst("fire", x + rand(-20, 20), y + rand(-26, 4), 1);
        // Burning paper glows, then chars black as the fire eats it.
        const sheets = this.paperImg.get(i);
        if (sheets) {
          const tint = mixColor(0x2a211c, 0xb85c2c, Math.min(1, this.fire[i] / 2.5));
          for (const sh of sheets) sh.setTint(tint);
        }
        if (chance(big ? 0.5 : 0.25)) this.fx.burst("ember", x + rand(-20, 20), y + rand(-28, 8), 1);
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
    // Flames on tiles that went out (or scrolled off screen) go back to the pool.
    for (const [i, b] of this.flames) {
      if (b.stamp === this.flameStamp) continue;
      this.releaseBlaze(b);
      this.flames.delete(i);
    }
    // Coworkers update before the hazards: a blaze nobody drew this frame (put out, or gone) is released.
    for (const [id, b] of this.bodies) {
      if (b.stamp === this.bodyStamp) continue;
      this.releaseBlaze(b);
      this.bodies.delete(id);
    }
    this.bodyStamp++;

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

  /** A pooled flame image, visible and ready to draw. */
  private takeFlame(part: FlamePart) {
    const im = this.flamePools[part].pop();
    if (im) return im.setVisible(true);
    const s = this.scene, ADD = Phaser.BlendModes.ADD;
    if (part === "glow") return s.add.image(0, 0, "soft").setBlendMode(ADD).setTint(0xff5a18).setDepth(DEPTH.HAZARD + 2);
    if (part === "puff") return s.add.image(0, 0, "fire_puff", 0);
    if (part === "core") return s.add.image(0, 0, "fire_core", 0).setBlendMode(ADD).setTint(0xff7428);
    if (part === "smoke") return s.add.image(0, 0, "fire_smoke", 0);
    return s.add.image(0, 0, "fire_tongue", 0).setOrigin(0.5, 0.96).setBlendMode(ADD);
  }

  private newBlaze(kind: number): Blaze {
    const P = BLAZE[kind];
    const puffs: Phaser.GameObjects.Image[] = [], tongues: Phaser.GameObjects.Image[] = [], smoke: Phaser.GameObjects.Image[] = [];
    for (let k = 0; k < P.puffs; k++) puffs.push(this.takeFlame("puff"));
    for (let k = 0; k < P.tongues; k++) tongues.push(this.takeFlame("tongue"));
    for (let k = 0; k < P.smoke; k++) smoke.push(this.takeFlame("smoke"));
    return { glow: this.takeFlame("glow"), puffs, core: this.takeFlame("core"), tongues, smoke, fume: 0, light: 1, kind, seed: Math.random() * 1000, born: this.scene.time.now, stamp: 0 };
  }

  private releaseBlaze(b: Blaze) {
    const pools = this.flamePools;
    b.glow.setVisible(false);
    pools.glow.push(b.glow);
    b.core.setVisible(false);
    pools.core.push(b.core);
    for (const im of b.puffs) { im.setVisible(false); pools.puff.push(im); }
    for (const im of b.tongues) { im.setVisible(false); pools.tongue.push(im); }
    for (const im of b.smoke) { im.setVisible(false); pools.smoke.push(im); }
  }

  private showBlaze(b: Blaze, v: boolean) {
    b.glow.setVisible(v);
    b.core.setVisible(v);
    for (const im of b.puffs) im.setVisible(v);
    for (const im of b.tongues) im.setVisible(v);
    for (const im of b.smoke) im.setVisible(v);
  }

  /** Fire is y-sorted with the people around it (the glow stays on the floor); the flames burn in front of their smoke. */
  private depthBlaze(b: Blaze, depth: number) {
    for (const im of b.smoke) im.setDepth(depth - 0.3);
    for (const im of b.puffs) im.setDepth(depth);
    b.core.setDepth(depth + 0.5);
    for (const im of b.tongues) im.setDepth(depth + 0.6);
  }

  /** Each burning tile on screen gets a looping blaze; it flares up when lit and shrinks and dims as the fire dies. */
  private animateFlames(i: number, x: number, y: number, dt: number) {
    const now = this.scene.time.now;
    const kind = this.paper[i] === 1 ? 0 : 1;
    let b = this.flames.get(i);
    if (b && b.kind !== kind) { this.releaseBlaze(b); b = undefined; }
    if (!b) {
      b = this.newBlaze(kind);
      this.depthBlaze(b, y + 8);
      this.flames.set(i, b);
    }
    b.stamp = this.flameStamp;
    const fade = Math.min(1, this.fire[i] / BLAZE[kind].fade);
    const grow = Math.min(1, (now - b.born) / 260);
    // Stacked up, every tile's light would wash a big fire out: the more of its neighbours burn, the less it adds.
    const W = this.w, F = this.fire, tx = i % W, ease = Math.min(1, dt * 3);
    const n = (tx > 0 && F[i - 1] > 0 ? 1 : 0) + (tx < W - 1 && F[i + 1] > 0 ? 1 : 0) + (i >= W && F[i - W] > 0 ? 1 : 0) + (i + W < F.length && F[i + W] > 0 ? 1 : 0);
    b.light += (1 - 0.17 * n - b.light) * ease;
    if (b.smoke.length) b.fume += ((i < W || F[i - W] <= 0 ? 1 : 0) - b.fume) * ease;
    this.drawBlaze(b, x, y, (0.35 + 0.65 * fade) * (0.3 + 0.7 * grow), 0.3 + 0.7 * fade, now / 1000);
  }

  /**
   * A burning coworker's blaze, drawn every frame they burn (alpha 0 hides it while they're out of sight).
   * Coworkers update before the hazards, which release any blaze that wasn't drawn this frame.
   */
  bodyFire(id: number, x: number, y: number, depth: number, scale: number, alpha: number) {
    let b = this.bodies.get(id);
    if (!b) {
      b = this.newBlaze(2);
      this.bodies.set(id, b);
    }
    b.stamp = this.bodyStamp;
    const show = alpha > 0.01;
    if (b.glow.visible !== show) this.showBlaze(b, show);
    if (!show) return;
    const now = this.scene.time.now;
    this.depthBlaze(b, depth);
    this.drawBlaze(b, x, y, scale * (0.4 + 0.6 * Math.min(1, (now - b.born) / 200)), alpha, now / 1000);
  }

  /** Puts a coworker's blaze out right away (they're gone). */
  bodyFireOut(id: number) {
    const b = this.bodies.get(id);
    if (!b) return;
    this.releaseBlaze(b);
    this.bodies.delete(id);
  }

  /**
   * Every puff, tongue and smoke wisp loops on its own clock. Loop lengths and phases come from the blaze's seed and
   * each loop's look from a hash of its cycle number, so nothing is stored (or allocated) per particle.
   * Frame indices are cached in `state` (Phaser never touches it) so frames only change between loops.
   */
  private drawBlaze(b: Blaze, x: number, y: number, size: number, alpha: number, t: number) {
    const P = BLAZE[b.kind], seed = b.seed;
    // Fire puffs: born small and hot at the base, they rise, swell, spin a little, redden and burn out.
    for (let k = 0; k < b.puffs.length; k++) {
      const im = b.puffs[k], sk = seed + k * 17.31;
      const u = t / (P.life * (0.85 + 0.4 * this.hash(sk))) + this.hash(sk + 1.7);
      const c = Math.floor(u), p = u - c;
      const r1 = this.hash(sk + c * 3.17), r2 = this.hash(sk + c * 5.31 + 2.1), r3 = this.hash(sk + c * 7.77 + 4.3), r4 = this.hash(sk + c * 1.93 + 6.6);
      const e = p * (2 - p);
      const f = Math.floor(r4 * 9);
      if (im.state !== f) { im.state = f; im.setFrame(f); }
      im.setFlipX(r4 > 0.5)
        .setPosition(x + ((r1 - 0.5) * P.spread + Math.sin(p * 5 + r3 * 6.3) * 4) * size, y + ((r2 - 0.5) * P.spread * 0.4 - P.rise * e) * size)
        .setScale(P.puff * size * (0.34 + 0.66 * e) * (0.82 + 0.36 * r3))
        .setRotation(r2 * 6.28 + (r3 - 0.5) * 1.8 * p)
        .setAlpha(alpha * P.puffA * (p < 0.12 ? p / 0.12 : p > 0.35 ? ((1 - p) / 0.65) ** 1.4 : 1))
        .setTint(p < 0.45 ? mixColor(PUFF_HOT, PUFF_MID, p / 0.45) : mixColor(PUFF_MID, PUFF_END, (p - 0.45) / 0.55));
    }
    // The hot heart at the base: flickers through the flash frames.
    const core = b.core;
    const rc = this.hash(seed * 1.31 + Math.floor(t * 12 + seed) * 0.73);
    const cf = Math.floor(rc * 9);
    if (core.state !== cf) { core.state = cf; core.setFrame(cf); }
    core.setPosition(x + (rc - 0.5) * 6 * size, y + (2 - 8 * rc) * size)
      .setScale(P.core * size * (0.86 + 0.24 * rc))
      .setRotation(t * 0.8 + seed)
      .setAlpha(alpha * P.coreA * (0.75 + 0.25 * rc));
    // Flame tongues lick up out of the blaze and fall back (the art burns from yellow at the root to red at the tip).
    for (let k = 0; k < b.tongues.length; k++) {
      const im = b.tongues[k], sk = seed + 91.7 + k * 23.9;
      const u = t / (0.3 + 0.28 * this.hash(sk)) + this.hash(sk + 0.9);
      const c = Math.floor(u), p = u - c;
      const r1 = this.hash(sk + c * 2.71), r2 = this.hash(sk + c * 4.13 + 1.3);
      const lick = Math.sin(p * Math.PI);
      const tf = r2 < 0.5 ? 0 : 1;
      if (im.state !== tf) { im.state = tf; im.setFrame(tf); }
      im.setFlipX(r1 > 0.5)
        .setPosition(x + (r1 - 0.5) * P.spread * 0.9 * size, y + (6 + (r2 - 0.5) * 12) * size)
        .setScale(P.tongue * size * (0.7 + 0.3 * r2), P.tongue * size * (0.3 + 0.8 * lick))
        .setRotation((r1 - 0.5) * 0.5 + Math.sin(t * 8 + k * 2 + seed) * 0.08)
        .setAlpha(alpha * Math.min(1, lick * 1.8) * 0.66)
        .setTint(r2 > 0.4 ? 0xff6022 : 0xff7028);
    }
    // Smoke rolls up off the top of a big blaze, lit orange from below, and drifts away grey.
    for (let k = 0; k < b.smoke.length; k++) {
      const im = b.smoke[k], sk = seed + 57.1 + k * 31.7;
      const u = t / (2 * (0.85 + 0.35 * this.hash(sk))) + this.hash(sk + 2.3);
      const c = Math.floor(u), p = u - c;
      const r1 = this.hash(sk + c * 3.71), r2 = this.hash(sk + c * 6.13 + 1.9);
      const e = p * (2 - p);
      const f = Math.floor(r2 * 6);
      if (im.state !== f) { im.state = f; im.setFrame(f); }
      im.setPosition(x + ((r1 - 0.5) * P.spread + (r2 - 0.5) * 40 * e) * size, y - (24 + P.rise * 2 * e) * size)
        .setScale(P.smokeS * size * (0.45 + 0.85 * e))
        .setRotation(r1 * 6.28 + (r2 - 0.5) * 1.2 * p)
        .setAlpha(alpha * b.fume * P.smokeA * (p < 0.2 ? p / 0.2 : (1 - p) / 0.8))
        .setTint(mixColor(SMOKE_LIT, SMOKE_GREY, Math.min(1, p * 2.2)));
    }
    // Warm light thrown on the floor around it, flickering with the flames.
    b.glow.setPosition(x, y - 6 * size)
      .setScale(P.glow * size * (1 + 0.05 * Math.sin(t * 6.3 + seed)))
      .setAlpha(alpha * b.light * P.glowA * (0.8 + 0.12 * Math.sin(t * 11.7 + seed * 3) + 0.08 * Math.sin(t * 23.1 + seed)));
  }

  clear() {
    for (const b of this.flames.values()) this.releaseBlaze(b);
    this.flames.clear();
    for (const b of this.bodies.values()) this.releaseBlaze(b);
    this.bodies.clear();
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
