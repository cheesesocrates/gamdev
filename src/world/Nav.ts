import { TILE } from "../config";
import { World } from "./World";

const DIRS: [number, number, number][] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]
];

/** Minimal binary heap keyed by numeric priority. */
class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() { return this.items.length; }
  push(item: number, p: number) {
    this.items.push(item); this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent); i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!, lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI; this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}

/**
 * Dijkstra distance field from the player's tile. Every enemy just looks at
 * its neighbouring tiles and walks downhill, which routes a whole crowd
 * around desks for the cost of one search.
 */
export class FlowField {
  dist: Float32Array;
  constructor(private world: World, private extraCost?: (i: number) => number) {
    this.dist = new Float32Array(world.w * world.h).fill(Infinity);
  }

  compute(targetX: number, targetY: number) {
    const { w, h } = this.world;
    const walk = this.world.walkable, barr = this.world.barricadeTile;
    this.dist.fill(Infinity);
    const tx = Math.floor(targetX / TILE), ty = Math.floor(targetY / TILE);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
    const heap = new Heap();
    const start = ty * w + tx;
    this.dist[start] = 0;
    heap.push(start, 0);
    const passable = (i: number) => walk[i] === 1 || barr[i] === 1;
    while (heap.size) {
      const cur = heap.pop();
      const cd = this.dist[cur];
      const cx = cur % w, cy = (cur / w) | 0;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!passable(ni)) continue;
        if (dx && dy && (!passable(cy * w + nx) || !passable(ny * w + cx))) continue;
        let nd = cd + cost;
        if (barr[ni]) nd += 160;
        if (this.extraCost) nd += this.extraCost(ni);
        if (nd < this.dist[ni]) {
          this.dist[ni] = nd;
          heap.push(ni, nd);
        }
      }
    }
  }

  /** Direction (unit vector) to walk from a world position, or null if unreachable. */
  direction(x: number, y: number): { x: number; y: number } | null {
    const { w, h } = this.world;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
    const here = this.dist[ty * w + tx];
    let best = here, bx = -1, by = -1;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (dx && dy) {
        // No diagonal shortcuts past corners.
        if (!isFinite(this.dist[ty * w + nx]) || !isFinite(this.dist[ny * w + tx])) continue;
      }
      const d = this.dist[ny * w + nx];
      if (d < best) { best = d; bx = nx; by = ny; }
    }
    if (bx < 0) {
      if (!isFinite(here)) return null;
      return { x: 0, y: 0 };
    }
    const gx = (bx + 0.5) * TILE - x, gy = (by + 0.5) * TILE - y;
    const len = Math.hypot(gx, gy) || 1;
    return { x: gx / len, y: gy / len };
  }

  distAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.world.w || ty >= this.world.h) return Infinity;
    return this.dist[ty * this.world.w + tx];
  }
}

/** A* over walkable tiles; returns world-space waypoints (tile centres), smoothed by LOS. */
export function findPath(world: World, sx: number, sy: number, gx: number, gy: number): { x: number; y: number }[] | null {
  const { w, h } = world;
  const s = Math.floor(sy / TILE) * w + Math.floor(sx / TILE);
  const goal = world.nearestWalkable(gx, gy);
  const gtx = Math.floor(goal.x / TILE), gty = Math.floor(goal.y / TILE);
  const g = gty * w + gtx;
  if (s === g) return [{ x: gx, y: gy }];
  const gScore = new Map<number, number>([[s, 0]]);
  const came = new Map<number, number>();
  const heap = new Heap();
  const hfn = (i: number) => {
    const x = i % w, y = (i / w) | 0;
    const dx = Math.abs(x - gtx), dy = Math.abs(y - gty);
    return 10 * (dx + dy) - 6 * Math.min(dx, dy);
  };
  heap.push(s, hfn(s));
  let iterations = 0;
  while (heap.size && iterations++ < 6000) {
    const cur = heap.pop();
    if (cur === g) break;
    const cx = cur % w, cy = (cur / w) | 0;
    const cg = gScore.get(cur)!;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!world.walkableTile(nx, ny)) continue;
      if (dx && dy && (!world.walkableTile(nx, cy) || !world.walkableTile(cx, ny))) continue;
      const ni = ny * w + nx;
      const ng = cg + cost;
      if (ng < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, ng);
        came.set(ni, cur);
        heap.push(ni, ng + hfn(ni));
      }
    }
  }
  if (!came.has(g)) return null;
  const tilesPath: number[] = [];
  for (let c = g; c !== s; c = came.get(c)!) tilesPath.push(c);
  tilesPath.reverse();
  const pts = tilesPath.map((i) => ({ x: ((i % w) + 0.5) * TILE, y: (((i / w) | 0) + 0.5) * TILE }));
  pts[pts.length - 1] = { x: gx, y: gy };
  // String-pull: drop waypoints we can walk straight past.
  const out: { x: number; y: number }[] = [];
  let ax = sx, ay = sy;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !world.walkLos(ax, ay, pts[j].x, pts[j].y, 14)) j--;
    out.push(pts[j]);
    ax = pts[j].x; ay = pts[j].y;
    i = j + 1;
  }
  return out;
}
