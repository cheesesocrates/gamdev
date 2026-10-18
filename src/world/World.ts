// Static collision + navigation for the office. Pure TypeScript (no Phaser)
// so it stays fast and easy to reason about: walls are tiles, furniture and
// barricades are axis-aligned boxes in a spatial hash, characters are circles.
import { TILE } from "../config";
import { OfficeMap, Tile } from "./OfficeMap";

export type ColliderKind = "furniture" | "barricade";

export interface Collider {
  id: number;
  x0: number; y0: number; x1: number; y1: number;
  solid: boolean;
  shots: boolean;
  kind: ColliderKind;
  ref?: unknown;
  alive: boolean;
}

export interface ShotHit {
  type: "tile" | "collider";
  tx?: number;
  ty?: number;
  tile?: Tile;
  collider?: Collider;
}

export interface RayResult {
  x: number;
  y: number;
  dist: number;
  hit: ShotHit | null;
}

function slab(ox: number, oy: number, dx: number, dy: number, c: Collider): number | null {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < c.x0 || ox > c.x1) return null;
  } else {
    let t1 = (c.x0 - ox) / dx, t2 = (c.x1 - ox) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < c.y0 || oy > c.y1) return null;
  } else {
    let t1 = (c.y0 - oy) / dy, t2 = (c.y1 - oy) / dy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}

export class World {
  map: OfficeMap;
  w: number;
  h: number;
  tiles: Uint8Array;
  glassHp: Map<number, number> = new Map();
  /** Drywall hit points (interior walls only; concrete never breaks). */
  wallHp: Map<number, number> = new Map();

  private colliders: Collider[] = [];
  private hash: Map<number, Collider[]> = new Map();
  private nextId = 1;
  private stamp = 0;
  private stamps = new Int32Array(1024);

  /** Per-tile nav data, rebuilt when obstacles change. */
  walkable: Uint8Array;
  barricadeTile: Uint8Array;
  navVersion = 0;

  constructor(map: OfficeMap) {
    this.map = map;
    this.w = map.w;
    this.h = map.h;
    this.tiles = map.tiles.slice();
    this.walkable = new Uint8Array(this.w * this.h);
    this.barricadeTile = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === Tile.GLASS) this.glassHp.set(i, 3);
  }

  // ------------------------------------------------------------- tiles
  tile(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return Tile.WALL;
    return this.tiles[ty * this.w + tx] as Tile;
  }
  tileSolid(tx: number, ty: number): boolean {
    return this.tile(tx, ty) !== Tile.FLOOR;
  }
  isFloorAt(x: number, y: number): boolean {
    return !this.tileSolid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Damages a drywall tile (or with `concrete`, a concrete one); returns true when it breaks into floor. */
  damageWall(tx: number, ty: number, amount = 1, concrete = false): boolean {
    const i = ty * this.w + tx;
    if (this.tiles[i] !== Tile.DRYWALL && !(concrete && this.tiles[i] === Tile.WALL)) return false;
    const hp = (this.wallHp.get(i) ?? 8) - amount;
    if (hp > 0) {
      this.wallHp.set(i, hp);
      return false;
    }
    this.wallHp.delete(i);
    this.tiles[i] = Tile.FLOOR;
    this.rebuildNav();
    return true;
  }

  /** Returns true once the pane breaks. */
  damageGlass(tx: number, ty: number, amount = 1): boolean {
    const i = ty * this.w + tx;
    if (this.tiles[i] !== Tile.GLASS) return false;
    const hp = (this.glassHp.get(i) ?? 3) - amount;
    if (hp > 0) {
      this.glassHp.set(i, hp);
      return false;
    }
    this.glassHp.delete(i);
    this.tiles[i] = Tile.FLOOR;
    this.rebuildNav();
    return true;
  }

  // ------------------------------------------------------------- colliders
  addCollider(c: Omit<Collider, "id" | "alive">): Collider {
    const col: Collider = { ...c, id: this.nextId++, alive: true };
    if (col.id >= this.stamps.length) {
      const grown = new Int32Array(this.stamps.length * 2);
      grown.set(this.stamps);
      this.stamps = grown;
    }
    this.colliders.push(col);
    this.forCells(col.x0, col.y0, col.x1, col.y1, (key) => {
      let list = this.hash.get(key);
      if (!list) this.hash.set(key, (list = []));
      list.push(col);
    });
    return col;
  }

  removeCollider(col: Collider) {
    col.alive = false;
    const k = this.colliders.indexOf(col);
    if (k >= 0) this.colliders.splice(k, 1);
    this.forCells(col.x0, col.y0, col.x1, col.y1, (key) => {
      const list = this.hash.get(key);
      if (!list) return;
      const i = list.indexOf(col);
      if (i >= 0) list.splice(i, 1);
    });
  }

  /** Moves a collider (shoved furniture) and keeps the spatial hash in sync. */
  moveCollider(col: Collider, x0: number, y0: number, x1: number, y1: number) {
    this.forCells(col.x0, col.y0, col.x1, col.y1, (key) => {
      const list = this.hash.get(key);
      if (!list) return;
      const i = list.indexOf(col);
      if (i >= 0) list.splice(i, 1);
    });
    col.x0 = x0; col.y0 = y0; col.x1 = x1; col.y1 = y1;
    this.forCells(x0, y0, x1, y1, (key) => {
      let list = this.hash.get(key);
      if (!list) this.hash.set(key, (list = []));
      list.push(col);
    });
  }

  /** True if a box overlaps no wall and no other solid collider. */
  boxFree(x0: number, y0: number, x1: number, y1: number, self?: Collider, ignore?: Set<Collider>): boolean {
    const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor(x1 / TILE);
    const ty0 = Math.floor(y0 / TILE), ty1 = Math.floor(y1 / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (this.tileSolid(tx, ty)) return false;
    let free = true;
    this.queryBox(x0, y0, x1, y1, (c) => {
      if (c !== self && c.solid && c.alive && !ignore?.has(c)) free = false;
    });
    return free;
  }

  private forCells(x0: number, y0: number, x1: number, y1: number, fn: (key: number) => void) {
    const cx0 = Math.floor(x0 / TILE), cy0 = Math.floor(y0 / TILE);
    const cx1 = Math.floor(x1 / TILE), cy1 = Math.floor(y1 / TILE);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) fn(cy * 1024 + cx);
  }

  /** Visits each collider overlapping the box once. */
  queryBox(x0: number, y0: number, x1: number, y1: number, fn: (c: Collider) => void) {
    const s = ++this.stamp;
    this.forCells(x0, y0, x1, y1, (key) => {
      const list = this.hash.get(key);
      if (!list) return;
      for (const c of list) {
        if (this.stamps[c.id] === s) continue;
        this.stamps[c.id] = s;
        if (c.x1 < x0 || c.x0 > x1 || c.y1 < y0 || c.y0 > y1) continue;
        fn(c);
      }
    });
  }

  colliderAtPoint(x: number, y: number, forShots: boolean): Collider | null {
    const list = this.hash.get(Math.floor(y / TILE) * 1024 + Math.floor(x / TILE));
    if (!list) return null;
    for (const c of list) {
      if (forShots ? !c.shots : !c.solid) continue;
      if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c;
    }
    return null;
  }

  // ------------------------------------------------------------- movement
  /**
   * Moves a circle by (dx, dy), sliding along walls and furniture.
   * Sub-steps so fast dashes never tunnel through thin obstacles.
   */
  moveCircle(p: { x: number; y: number }, r: number, dx: number, dy: number) {
    const len = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      p.x += sx;
      p.y += sy;
      this.resolveCircle(p, r);
    }
  }

  resolveCircle(p: { x: number; y: number }, r: number) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const tx0 = Math.floor((p.x - r) / TILE), tx1 = Math.floor((p.x + r) / TILE);
      const ty0 = Math.floor((p.y - r) / TILE), ty1 = Math.floor((p.y + r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.tileSolid(tx, ty)) continue;
          if (this.pushOut(p, r, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)) moved = true;
        }
      }
      this.queryBox(p.x - r, p.y - r, p.x + r, p.y + r, (c) => {
        if (c.solid && this.pushOut(p, r, c.x0, c.y0, c.x1, c.y1)) moved = true;
      });
      if (!moved) break;
    }
  }

  private pushOut(p: { x: number; y: number }, r: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const cx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
    const cy = p.y < y0 ? y0 : p.y > y1 ? y1 : p.y;
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = r - d + 0.01;
      p.x += (dx / d) * push;
      p.y += (dy / d) * push;
    } else {
      // Centre is inside the box: leave by the shallowest side.
      const l = p.x - x0 + r, rr = x1 - p.x + r, t = p.y - y0 + r, b = y1 - p.y + r;
      const m = Math.min(l, rr, t, b);
      if (m === l) p.x = x0 - r - 0.01;
      else if (m === rr) p.x = x1 + r + 0.01;
      else if (m === t) p.y = y0 - r - 0.01;
      else p.y = y1 + r + 0.01;
    }
    return true;
  }

  /** True when a circle at (x, y) overlaps nothing solid. */
  circleFree(x: number, y: number, r: number): boolean {
    const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE);
    const ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (this.tileSolid(tx, ty)) return false;
    let free = true;
    this.queryBox(x - r, y - r, x + r, y + r, (c) => {
      if (c.solid) free = false;
    });
    return free;
  }

  // ------------------------------------------------------------- shots
  shotBlockedAt(x: number, y: number): ShotHit | null {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const t = this.tile(tx, ty);
    if (t !== Tile.FLOOR) return { type: "tile", tx, ty, tile: t };
    const c = this.colliderAtPoint(x, y, true);
    if (c) return { type: "collider", collider: c };
    return null;
  }

  /**
   * Exact ray traversal: walks the tile grid cell by cell (DDA) and slab-tests
   * the shot-blocking boxes registered in each visited cell.
   */
  raycast(x0: number, y0: number, angle: number, maxDist: number, _step = 0): RayResult {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx) : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(dy) : Infinity;
    let t = 0;
    let best = maxDist;
    let hit: ShotHit | null = null;
    const s = ++this.stamp;
    for (let guard = 0; guard < 400 && t <= best; guard++) {
      const tile = this.tile(tx, ty);
      if (tile !== Tile.FLOOR) {
        if (t < best) { best = t; hit = { type: "tile", tx, ty, tile }; }
        break;
      }
      const list = this.hash.get(ty * 1024 + tx);
      if (list) {
        for (const c of list) {
          if (!c.shots || this.stamps[c.id] === s) continue;
          this.stamps[c.id] = s;
          const ct = slab(x0, y0, dx, dy, c);
          if (ct !== null && ct < best) { best = ct; hit = { type: "collider", collider: c }; }
        }
      }
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; }
      else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; }
      if (t > maxDist) break;
    }
    const d = Math.max(0, best - 0.5);
    return { x: x0 + dx * d, y: y0 + dy * d, dist: d, hit };
  }

  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 1) return true;
    const r = this.raycast(x0, y0, Math.atan2(y1 - y0, x1 - x0), d, 14);
    return r.hit === null;
  }

  /** Can a circle of radius r walk in a straight line between two points? */
  walkLos(x0: number, y0: number, x1: number, y1: number, r: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / (r * 0.8));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.circleFree(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r)) return false;
    }
    return true;
  }

  /** Surface normal of whatever is solid around (x, y), approximated from a step. */
  reflect(x: number, y: number, vx: number, vy: number, dt: number): { vx: number; vy: number } {
    const hitX = this.shotBlockedAt(x + vx * dt, y) !== null;
    const hitY = this.shotBlockedAt(x, y + vy * dt) !== null;
    if (hitX && !hitY) return { vx: -vx, vy };
    if (hitY && !hitX) return { vx, vy: -vy };
    return { vx: -vx, vy: -vy };
  }

  // ------------------------------------------------------------- nav grid
  rebuildNav() {
    const { w, h } = this;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        this.barricadeTile[i] = 0;
        this.walkable[i] = this.tiles[i] === Tile.FLOOR ? 1 : 0;
      }
    }
    for (const c of this.colliders) {
      if (!c.alive || !c.solid) continue;
      const pad = c.kind === "barricade" ? -2 : 10;
      const tx0 = Math.floor((c.x0 - pad) / TILE), tx1 = Math.floor((c.x1 + pad) / TILE);
      const ty0 = Math.floor((c.y0 - pad) / TILE), ty1 = Math.floor((c.y1 + pad) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
          if (cx < c.x0 - pad || cx > c.x1 + pad || cy < c.y0 - pad || cy > c.y1 + pad) continue;
          const i = ty * w + tx;
          if (c.kind === "barricade") this.barricadeTile[i] = 1;
          else this.walkable[i] = 0;
        }
      }
    }
    this.navVersion++;
  }

  walkableTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.walkable[ty * this.w + tx] === 1;
  }

  /** Nearest walkable tile centre to a world point (used to snap spawn/target points). */
  nearestWalkable(x: number, y: number): { x: number; y: number } {
    const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
    if (this.walkableTile(tx0, ty0)) return { x, y };
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.walkableTile(tx0 + dx, ty0 + dy)) return { x: (tx0 + dx + 0.5) * TILE, y: (ty0 + dy + 0.5) * TILE };
      }
    }
    return { x, y };
  }
}
