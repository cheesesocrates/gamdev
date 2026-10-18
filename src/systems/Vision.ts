import Phaser from "phaser";
import { DEPTH, TILE } from "../config";
import { Tile } from "../world/OfficeMap";
import type { GameScene } from "../scenes/GameScene";

const FOG = 0x06070c;
/** How dark the rooms you can't see get. */
const FOG_A = 0.86;
/** Rooms you see through a window are only slightly dimmed. */
const GLASS_A = 0.2;
/** Uniform rays (plus two per nearby wall corner). */
const BASE_RAYS = 240;
const MAX_RAYS = 4096;

/**
 * Line-of-sight shadows for the fight. Walls (and the locked door) block your view; windows and
 * furniture don't, so you see over desks and through the glass (slightly dimmed). Coworkers out
 * of sight fade away, and the minimap only shows the ones you can see.
 *
 * Every frame: rays from the boss to every nearby wall corner (and a fan of uniform ones) walk the
 * tile grid; the hits make a star-shaped polygon. Two dark overlays use that polygon as an inverted
 * stencil mask (no render texture, so no extra GPU passes): one dark wherever you can't see, one
 * faint over what you only see through glass.
 */
export class Vision {
  /** 0..1, eased toward `target` (on during The Downsizing). */
  level = 0;
  target = 0;
  private fogFull: Phaser.GameObjects.Rectangle;
  private fogGlass: Phaser.GameObjects.Rectangle;
  private gA: Phaser.GameObjects.Graphics;
  private gB: Phaser.GameObjects.Graphics;
  private angs = new Float64Array(MAX_RAYS);
  private n = 0;
  private dA = new Float32Array(MAX_RAYS);
  private dB = new Float32Array(MAX_RAYS);
  private corners = new Float32Array(0);
  private cornerCount = 0;
  private cornerVer = -1;
  private hitA = 0;
  private hitB = 0;
  private ox = 0;
  private oy = 0;
  /** True when the polygon is current (queries fall back to "visible" otherwise). */
  private ready = false;

  constructor(private g: GameScene) {
    this.gA = g.make.graphics({}, false);
    this.gB = g.make.graphics({}, false);
    const mB = this.gB.createGeometryMask();
    mB.setInvertAlpha(true);
    const mA = this.gA.createGeometryMask();
    mA.setInvertAlpha(true);
    this.fogFull = g.add.rectangle(0, 0, 8, 8, FOG, FOG_A).setOrigin(0).setDepth(DEPTH.LIGHTING - 5).setMask(mB).setVisible(false);
    this.fogGlass = g.add.rectangle(0, 0, 8, 8, FOG, GLASS_A).setOrigin(0).setDepth(DEPTH.LIGHTING - 4).setMask(mA).setVisible(false);
  }

  get on() { return this.level > 0.01; }

  /** Opaque for sight: anything but floor; glass only when `glassBlocks`. */
  private rebuildCorners() {
    const w = this.g.world;
    const W = w.w, H = w.h, t = w.tiles;
    const solid = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || t[y * W + x] !== Tile.FLOOR;
    const wallish = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || (t[y * W + x] !== Tile.FLOOR && t[y * W + x] !== Tile.GLASS);
    const out: number[] = [];
    for (let vy = 1; vy < H; vy++) {
      for (let vx = 1; vx < W; vx++) {
        for (const f of [solid, wallish]) {
          const a = f(vx - 1, vy - 1), b = f(vx, vy - 1), c = f(vx - 1, vy), d = f(vx, vy);
          const n = +a + +b + +c + +d;
          if (n === 1 || n === 3 || (n === 2 && a === d)) { out.push(vx * TILE, vy * TILE); break; }
        }
      }
    }
    this.corners = new Float32Array(out);
    this.cornerCount = out.length / 2;
    this.cornerVer = w.navVersion;
  }

  /**
   * Walks the grid along one ray. hitA: first glass or wall (glass blocks); hitB: first wall (glass is
   * see-through). Both reach one tile into what they hit, so the wall faces you're looking at are lit.
   */
  private cast(ang: number, R: number) {
    const w = this.g.world, W = w.w, H = w.h, tiles = w.tiles;
    const ox = this.ox, oy = this.oy;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let tx = Math.floor(ox / TILE), ty = Math.floor(oy / TILE);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(TILE / dx) : 1e9, tdy = dy !== 0 ? Math.abs(TILE / dy) : 1e9;
    let tmx = dx !== 0 ? (dx > 0 ? (tx + 1) * TILE - ox : ox - tx * TILE) / Math.abs(dx) : 1e9;
    let tmy = dy !== 0 ? (dy > 0 ? (ty + 1) * TILE - oy : oy - ty * TILE) / Math.abs(dy) : 1e9;
    let hitA = -1;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Tile.WALL : tiles[y * W + x]);
    for (let guard = 0; guard < 160; guard++) {
      let t: number;
      const stepX = tmx < tmy;
      if (stepX) { t = tmx; tmx += tdx; tx += sx; } else { t = tmy; tmy += tdy; ty += sy; }
      if (t >= R) break;
      const tile = at(tx, ty);
      if (tile === Tile.FLOOR) continue;
      if (tile === Tile.GLASS) {
        if (hitA < 0) hitA = Math.min(tmx, tmy, R);
        continue;
      }
      // A wall: light one full tile of its thickness (measured square to the face we came through),
      // so the faces you look at are lit evenly; stop early if the ray comes out the other side.
      const across = stepX ? Math.abs(dx) : Math.abs(dy);
      let end = t + Math.min(TILE * 3, (TILE * 0.98) / Math.max(across, 0.05));
      for (let k = 0; k < 6; k++) {
        const next = Math.min(tmx, tmy);
        if (next >= end) break;
        if (tmx < tmy) { tmx += tdx; tx += sx; } else { tmy += tdy; ty += sy; }
        const t2 = at(tx, ty);
        if (t2 === Tile.FLOOR || t2 === Tile.GLASS) { end = next; break; }
      }
      end = Math.min(end, R);
      this.hitA = hitA < 0 ? end : hitA;
      this.hitB = end;
      return;
    }
    this.hitB = R;
    this.hitA = hitA < 0 ? R : hitA;
  }

  update(dt: number) {
    this.level += Phaser.Math.Clamp(this.target - this.level, -dt * 1.2, dt * 1.6);
    if (this.level <= 0.01) {
      this.level = Math.max(0, this.level);
      this.ready = false;
      if (this.fogFull.visible) { this.fogFull.setVisible(false); this.fogGlass.setVisible(false); }
      return;
    }
    const g = this.g, cam = g.cameras.main, wv = cam.worldView, pl = g.player;
    if (this.cornerVer !== g.world.navVersion) this.rebuildCorners();
    // Mid-phase through a wall you still see from the open floor you came from.
    this.ox = pl.eyeX;
    this.oy = pl.eyeY;

    // ---- rays
    const M = 96;
    const vx0 = wv.x - M, vy0 = wv.y - M, vx1 = wv.right + M, vy1 = wv.bottom + M;
    const R = Math.hypot(Math.max(this.ox - vx0, vx1 - this.ox), Math.max(this.oy - vy0, vy1 - this.oy)) + 32;
    let n = 0;
    const A = this.angs;
    for (let k = 0; k < BASE_RAYS; k++) A[n++] = -Math.PI + (k / BASE_RAYS) * Math.PI * 2;
    const C = this.corners;
    for (let i = 0; i < this.cornerCount && n < MAX_RAYS - 2; i++) {
      const cx = C[i * 2], cy = C[i * 2 + 1];
      if (cx < vx0 || cx > vx1 || cy < vy0 || cy > vy1) continue;
      const a = Math.atan2(cy - this.oy, cx - this.ox);
      A[n++] = a - 0.0004;
      A[n++] = a + 0.0004;
    }
    const sorted = A.subarray(0, n).sort();
    this.n = n;
    for (let k = 0; k < n; k++) {
      this.cast(sorted[k], R);
      this.dA[k] = this.hitA;
      this.dB[k] = this.hitB;
    }
    this.ready = true;

    // ---- the two overlays, masked by the visibility polygons (world space)
    const gA = this.gA.clear(), gB = this.gB.clear();
    gA.fillStyle(0xffffff, 1);
    gB.fillStyle(0xffffff, 1);
    const ox = this.ox, oy = this.oy;
    let glass = false;
    for (let k = 0; k < n; k++) {
      const k2 = k + 1 === n ? 0 : k + 1;
      const a1 = sorted[k], a2 = sorted[k2];
      const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
      const b1 = this.dB[k], b2 = this.dB[k2];
      gB.fillTriangle(ox, oy, ox + c1 * b1, oy + s1 * b1, ox + c2 * b2, oy + s2 * b2);
      const p1 = this.dA[k], p2 = this.dA[k2];
      if (p1 < b1 - 1 || p2 < b2 - 1) glass = true;
      gA.fillTriangle(ox, oy, ox + c1 * p1, oy + s1 * p1, ox + c2 * p2, oy + s2 * p2);
    }
    this.fogFull.setPosition(vx0, vy0).setSize(vx1 - vx0, vy1 - vy0).setFillStyle(FOG, FOG_A * this.level).setVisible(true);
    this.fogGlass.setVisible(glass);
    if (glass) this.fogGlass.setPosition(vx0, vy0).setSize(vx1 - vx0, vy1 - vy0).setFillStyle(FOG, GLASS_A * this.level);
  }

  /** Can the boss see a circle of radius r at (x, y)? (Through windows counts.) */
  sees(x: number, y: number, r = 0): boolean {
    if (!this.ready || this.n === 0) return true;
    const dx = x - this.ox, dy = y - this.oy;
    const d = Math.hypot(dx, dy);
    if (d < 40) return true;
    const a = Math.atan2(dy, dx);
    const A = this.angs, n = this.n;
    // Binary search for the ray just before this angle.
    let lo = 0, hi = n - 1;
    if (a < A[0] || a >= A[n - 1]) { lo = n - 1; hi = 0; }
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (A[mid] <= a) lo = mid; else hi = mid;
      }
    }
    const a0 = A[lo], a1 = hi === 0 ? A[0] + Math.PI * 2 : A[hi];
    const aa = hi === 0 && a < A[0] ? a + Math.PI * 2 : a;
    const f = a1 - a0 > 1e-6 ? Phaser.Math.Clamp((aa - a0) / (a1 - a0), 0, 1) : 0;
    const lim = this.dB[lo] + (this.dB[hi] - this.dB[lo]) * f;
    return d - r * 0.7 <= lim;
  }

  /** Instantly clears the fog (new day / title). */
  reset() {
    this.level = this.target = 0;
    this.ready = false;
    this.fogFull.setVisible(false);
    this.fogGlass.setVisible(false);
  }
}
