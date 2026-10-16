import Phaser from "phaser";
import { TILE } from "../config";
import { EnemyType } from "../data/enemies";
import { ELEVATOR_LINES } from "../data/lines";
import { chance, pick, rand, randInt, weightedPick } from "../util/math";
import { SpawnDef } from "../world/OfficeMap";
import type { GameScene } from "../scenes/GameScene";

interface Elevator {
  spawn: SpawnDef;
  dark: Phaser.GameObjects.Image;
  left: Phaser.GameObjects.Image;
  right: Phaser.GameObjects.Image;
  openT: number; // seconds remaining open
  open: number; // 0..1 animation
}

export class Waves {
  g: GameScene;
  private timer = 0;
  bossSpawned = false;
  boss: import("../entities/Enemy").Enemy | null = null;
  private elevators: Elevator[] = [];
  private queue: { type: EnemyType; spawn: SpawnDef; t: number }[] = [];

  constructor(g: GameScene) {
    this.g = g;
    for (const s of g.map.spawns) {
      if (s.kind !== "elevator") continue;
      const cx = (s.doorTx! + 1) * TILE, cy = s.doorTy! * TILE + 40;
      const dark = g.add.image(cx, cy, "elev_dark").setDisplaySize(112, 42).setDepth(-9500);
      const left = g.add.image(cx - 28, cy, "elev_door").setDisplaySize(56, 42).setDepth(-9499);
      const right = g.add.image(cx + 28, cy, "elev_door").setDisplaySize(56, 42).setDepth(-9499).setFlipX(true);
      this.elevators.push({ spawn: s, dark, left, right, openT: 0, open: 0 });
    }
  }

  reset() {
    this.timer = 1.5;
    this.bossSpawned = false;
    this.boss = null;
    this.queue = [];
    for (const e of this.elevators) { e.openT = 0; e.open = 0; this.drawElevator(e); }
  }

  /** Enemies still to be brought in (quota minus fired minus alive hostiles minus queued). */
  remainingToSpawn() {
    const g = this.g;
    const alive = g.enemies.filter((e) => e.hostile && !e.dead).length;
    return g.quota - g.fired - alive - this.queue.length;
  }

  update(dt: number) {
    const g = this.g;
    for (const e of this.elevators) {
      if (e.openT > 0) e.openT -= dt;
      const target = e.openT > 0 ? 1 : 0;
      e.open += Phaser.Math.Clamp(target - e.open, -dt * 3, dt * 3);
      this.drawElevator(e);
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) {
        this.queue.splice(i, 1);
        this.materialize(q.type, q.spawn);
      }
    }
    if (g.phase !== "downsizing") return;

    // Boss day: THE CONSULTANT arrives once 40% of the quota is fired.
    const cfg = g.dayCfg;
    if (cfg.boss && !this.bossSpawned && g.fired >= Math.floor(g.quota * 0.4)) {
      this.bossSpawned = true;
      const el = pick(this.elevators.length ? this.elevators.map((e) => e.spawn) : g.map.spawns);
      this.queue.push({ type: "consultant", spawn: el, t: 1.8 });
      g.bossIncoming();
      this.openElevator(el, 4);
    }

    this.timer -= dt;
    const alive = g.enemies.filter((e) => e.hostile && !e.dead).length + this.queue.length;
    if (this.timer > 0 || alive >= cfg.maxAlive) return;
    const remaining = this.remainingToSpawn() - (cfg.boss && !this.bossSpawned ? 1 : 0);
    if (remaining <= 0) return;
    this.timer = cfg.spawnEvery * rand(0.8, 1.25);
    const size = Math.min(remaining, cfg.maxAlive - alive, randInt(cfg.groupSize[0], cfg.groupSize[1]));
    const spawn = this.pickSpawn();
    for (let k = 0; k < size; k++) {
      const type = weightedPick(Object.entries(cfg.weights).map(([t, w]) => ({ item: t as EnemyType, w: w as number })));
      this.queue.push({ type, spawn, t: (spawn.kind === "elevator" ? 0.9 : 0.2) + k * 0.35 });
    }
    if (spawn.kind === "elevator") this.openElevator(spawn, 1.2 + size * 0.4);
    else if (spawn.kind === "exit") {
      g.audio.play("elevator_door", { vol: 0.35, rate: 0.8 });
      g.fx.burst("smoke", spawn.x, spawn.y - 30, 6);
    }
  }

  private pickSpawn(): SpawnDef {
    const g = this.g;
    const pl = g.player;
    const cands = g.map.spawns.map((s) => ({ s, d: Math.hypot(s.x - pl.x, s.y - pl.y) }));
    const far = cands.filter((c) => c.d > 520);
    const pool = far.length ? far : cands;
    // Favour nearer-but-offscreen entrances so the fight comes to you.
    return weightedPick(pool.map((c) => ({ item: c.s, w: 1 / (0.3 + c.d / 1200) })));
  }

  private openElevator(spawn: SpawnDef, seconds: number) {
    const e = this.elevators.find((x) => x.spawn === spawn);
    if (!e) return;
    e.openT = Math.max(e.openT, seconds);
    this.g.audio.play("ding", { vol: 0.5, minGap: 300 });
    this.g.audio.play("elevator_door", { vol: 0.3, minGap: 300 });
  }

  private drawElevator(e: Elevator) {
    const off = e.open * 26;
    const cx = (e.spawn.doorTx! + 1) * TILE;
    e.left.setX(cx - 28 - off).setDisplaySize(56 - off * 0.9, 42);
    e.right.setX(cx + 28 + off).setDisplaySize(56 - off * 0.9, 42);
  }

  private materialize(type: EnemyType, spawn: SpawnDef) {
    const g = this.g;
    const jitter = spawn.kind === "elevator" ? 30 : 18;
    const p = g.world.nearestWalkable(spawn.x + rand(-jitter, jitter), spawn.y + rand(-6, 12));
    const e = g.spawnEnemy(type, p.x, p.y, "hostile");
    e.spawnGrace = 0.35;
    if (spawn.kind === "elevator") {
      e.vy = 140;
      if (chance(0.15) && g.canBark()) e.say(pick(ELEVATOR_LINES), 1.4);
    }
    if (type === "consultant") this.boss = e;
    g.fx.burst("pixel", p.x, p.y, 6, 0xb8bfc9);
  }
}
