import Phaser from "phaser";
import { DEPTH, MAP_H, MAP_W, TILE } from "../config";
import { ChoreId, CHORE_INFO } from "../data/days";
import { NPC_SABOTAGE } from "../data/lines";
import { GameState } from "./GameState";
import { chance, pick, rand } from "../util/math";
import { StationDef } from "../world/OfficeMap";
import { FurnObj, destroyFurniture, spawnFurniture } from "../world/Furniture";
import type { GameScene } from "../scenes/GameScene";

export interface Station {
  def: StationDef;
  furn?: FurnObj;
  x: number;
  y: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  used: boolean;
  hot: boolean;
  sparking: boolean;
  copierHp: number;
  wrecked: boolean;
  fxTimer: number;
  /** Seconds left on an armed copier's fuse (0 = not counting down). */
  fuse: number;
  zapCd: number;
  marker?: Phaser.GameObjects.Image;
  /** Spawned for today only (water coolers, power strips). */
  dynamic?: boolean;
}

export interface Action {
  label: string;
  /** Seconds to hold E; 0 = happens the moment E is pressed. */
  hold: number;
  kind: "chore" | "sabotage" | "use";
  run: () => void;
}

/** Which stations can host each chore. Every day each chore on the list picks one of them at random. */
const CHORE_HOSTS: Record<ChoreId, (d: StationDef) => boolean> = {
  emails: (d) => d.kind === "emails",
  print: (d) => d.kind === "copier" || d.kind === "printer",
  jam: (d) => d.kind === "printer" || d.kind === "copier",
  shred: (d) => d.kind === "shred",
  coffee: (d) => d.id === "coffee",
  presentation: (d) => d.id === "presentation",
  memos: (d) => d.id === "memos",
  server: (d) => d.id === "server",
  plant: (d) => d.id === "ceo_plant",
  wifi: (d) => d.kind === "router",
  mail: (d) => d.kind === "mailcart",
  board: (d) => d.kind === "board"
};

const COOLERS_PER_DAY = 11;
const STRIPS_PER_DAY = 15;
/** Desktop printers, a Wi-Fi router and a mail cart turn up somewhere new every day. */
const PRINTERS_PER_DAY = 3;
type DailyProp = "cooler" | "powerstrip" | "printer" | "router" | "mailcart";

export class Stations {
  g: GameScene;
  list: Station[] = [];
  coffeeFixed = false;
  private rings: Phaser.GameObjects.Graphics;
  /** Today's chore -> the station hosting it. */
  private hosts = new Map<ChoreId, Station>();
  private hostChore = new Map<Station, ChoreId>();

  constructor(g: GameScene) {
    this.g = g;
    for (const def of g.map.stations) {
      const furn = def.furnId ? g.furniture.get(def.furnId) : undefined;
      this.list.push(this.make(def, furn));
    }
    this.rings = g.add.graphics().setDepth(DEPTH.MARKER);
  }

  private make(def: StationDef, furn?: FurnObj): Station {
    const box = furn
      ? { x0: furn.x - furn.w / 2, y0: furn.y - furn.h / 2, x1: furn.x + furn.w / 2, y1: furn.y + furn.h / 2 }
      : { x0: def.x - 20, y0: def.y - 20, x1: def.x + 20, y1: def.y + 20 };
    return { def, furn, x: def.x, y: def.y, box, used: false, hot: false, sparking: false, copierHp: 30, wrecked: false, fxTimer: 0, fuse: 0, zapCd: 0 };
  }

  byId(id: string) {
    return this.list.find((s) => s.def.id === id);
  }

  /** New day: the office is cleaned up overnight. */
  resetDay() {
    this.coffeeFixed = false;
    for (const s of this.list) {
      s.used = false;
      s.hot = false;
      s.sparking = false;
      s.copierHp = 30;
      s.wrecked = false;
      s.fuse = 0;
      if (s.furn) s.furn.sprite.clearTint?.();
      s.marker?.destroy();
      s.marker = undefined;
    }
    // Planned Obsolescence: every copier starts the day overheated.
    if (GameState.stats.hotCopiers) {
      for (const s of this.list) if (s.def.kind === "copier") { s.hot = true; s.copierHp = 30; }
    }
  }

  // ---------------------------------------------------------------- daily coolers + power strips
  /** Water coolers and power strips turn up somewhere new every day. Call after the nav grid is fresh. */
  randomizeProps() {
    const g = this.g;
    for (const s of this.list) {
      if (!s.dynamic) continue;
      if (s.furn) destroyFurniture(g.world, s.furn);
      s.marker?.destroy();
    }
    this.list = this.list.filter((s) => !s.dynamic);
    g.world.rebuildNav();
    const taken = this.list.map((s) => ({ x: s.x, y: s.y }));
    const coolers = this.pickSpots("cooler", COOLERS_PER_DAY, taken, []);
    for (const p of coolers) this.addProp("cooler", p.x, p.y);
    g.world.rebuildNav();
    const strips = this.pickSpots("powerstrip", STRIPS_PER_DAY, taken, coolers);
    for (const p of strips) this.addProp("powerstrip", p.x, p.y);
    g.world.rebuildNav();
    for (const [kind, n] of [["printer", PRINTERS_PER_DAY], ["router", 1], ["mailcart", 1]] as const) {
      for (const p of this.pickSpots(kind, n, taken, [])) this.addProp(kind, p.x, p.y);
      g.world.rebuildNav();
    }
    this.assignChores(g.dayCfg.chores);
  }

  /** Each of today's chores picks a host: any copier or printer for printing, either shredder, any whiteboard... */
  assignChores(chores: ChoreId[]) {
    this.hosts.clear();
    this.hostChore.clear();
    const lockedZone = this.lockedZone();
    for (const c of chores) {
      const cands = this.list.filter((s) => CHORE_HOSTS[c](s.def) && !this.hostChore.has(s) && !s.wrecked && this.zoneOf(s) !== lockedZone);
      const s = cands.length ? pick(cands) : this.list.find((x) => CHORE_HOSTS[c](x.def));
      if (!s) continue;
      this.hosts.set(c, s);
      this.hostChore.set(s, c);
    }
  }

  /** The chore this station hosts today (if any). */
  choreAt(s: Station): ChoreId | null {
    return this.hostChore.get(s) ?? null;
  }

  hostOf(c: ChoreId): Station | undefined {
    return this.hosts.get(c);
  }

  /** Where today's chore is, for the to-do list. */
  roomOf(c: ChoreId): string {
    const s = this.hosts.get(c);
    if (!s) return "";
    const zi = this.zoneOf(s);
    return zi >= 0 ? this.g.map.zones[zi].name : "Hallway";
  }

  private zoneOf(s: Station): number {
    const tx = Math.floor(s.x / TILE), ty = Math.floor((s.box.y1 + 6) / TILE);
    return this.g.map.zoneGrid[ty * MAP_W + tx] ?? -1;
  }

  /** The zone behind today's code-locked door (nothing gets put in there). */
  private lockedZone(): number {
    const name = this.g.vault?.room?.name;
    return name ? this.g.map.zones.findIndex((z) => z.name === name) : -2;
  }

  private addProp(kind: DailyProp, x: number, y: number) {
    const furn = spawnFurniture(this.g, this.g.world, kind, x, y, kind === "powerstrip" ? { solid: false, shots: false } : {});
    const s = this.make({ id: `${kind}_${this.list.length}`, kind, x, y }, furn);
    s.dynamic = true;
    this.list.push(s);
  }

  private nearDoor(tx: number, ty: number) {
    for (const d of this.g.map.doors) {
      const x0 = Math.floor((d.x - d.w / 2) / TILE) - 1, x1 = Math.ceil((d.x + d.w / 2) / TILE);
      const y0 = Math.floor((d.y - d.h / 2) / TILE) - 1, y1 = Math.ceil((d.y + d.h / 2) / TILE);
      if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return true;
    }
    return false;
  }

  /**
   * Random floor spots with a little taste: coolers stand against a wall and never plug a
   * corridor; some power strips land right next to a cooler (a combo for the observant).
   */
  private pickSpots(kind: DailyProp, count: number, taken: { x: number; y: number }[], coolers: { x: number; y: number }[]) {
    const w = this.g.world;
    const spawn = this.g.map.playerSpawn;
    const out: { x: number; y: number }[] = [];
    const wallProp = kind !== "powerstrip";
    const minSame = kind === "powerstrip" ? TILE * 3 : kind === "cooler" ? TILE * 5 : TILE * 12;
    const lockedZone = this.lockedZone();
    for (let tries = 0; tries < 1500 && out.length < count; tries++) {
      let tx: number, ty: number;
      if (kind === "powerstrip" && coolers.length && out.length < count * 0.4) {
        const c = pick(coolers);
        tx = Math.floor(c.x / TILE) + Math.round(rand(-2.4, 2.4));
        ty = Math.floor(c.y / TILE) + Math.round(rand(-1, 2.6));
      } else {
        tx = 1 + Math.floor(Math.random() * (MAP_W - 2));
        ty = 1 + Math.floor(Math.random() * (MAP_H - 2));
      }
      if (!w.walkableTile(tx, ty) || this.nearDoor(tx, ty)) continue;
      if (this.g.map.zoneGrid[ty * MAP_W + tx] === lockedZone) continue;
      if (wallProp) {
        if (!w.tileSolid(tx, ty - 1)) continue;
        if (!w.walkableTile(tx - 1, ty) || !w.walkableTile(tx + 1, ty) || !w.walkableTile(tx, ty + 1)) continue;
      }
      const x = (tx + 0.5) * TILE + (kind === "powerstrip" ? rand(-10, 10) : 0);
      const y = wallProp ? ty * TILE + 22 : (ty + 0.5) * TILE + rand(-8, 8);
      if ((x - spawn.x) ** 2 + (y - spawn.y) ** 2 < (TILE * 3) ** 2) continue;
      if (out.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < minSame * minSame)) continue;
      if (taken.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (TILE * 1.4) ** 2)) continue;
      out.push({ x, y });
      taken.push({ x, y });
    }
    return out;
  }

  // ---------------------------------------------------------------- interaction
  distTo(s: Station, x: number, y: number) {
    const cx = Math.max(s.box.x0, Math.min(x, s.box.x1));
    const cy = Math.max(s.box.y0, Math.min(y, s.box.y1));
    return Math.hypot(x - cx, y - cy);
  }

  /** The nearest station the player can act on right now. */
  nearest(x: number, y: number): { station: Station; action: Action } | null {
    let best: { station: Station; action: Action } | null = null;
    let bd = 48;
    for (const s of this.list) {
      const d = this.distTo(s, x, y);
      if (d > bd) continue;
      const action = this.actionFor(s);
      if (!action) continue;
      const adj = action.kind === "chore" ? d - 30 : d;
      if (adj < bd) { bd = adj; best = { station: s, action }; }
    }
    return best;
  }

  actionFor(s: Station): Action | null {
    const g = this.g;
    const pl = g.player;
    // Crunch Time is for chores. Everything else in the office is a 5 PM weapon.
    if (g.phase === "crunch") {
      const chore = this.choreAt(s);
      if (!chore || !g.dayCfg.chores.includes(chore) || g.choresDone.has(chore)) return null;
      return this.choreAction(chore);
    }
    if (g.phase !== "downsizing") return null;
    switch (s.def.kind) {
      case "cooler": return s.used ? null : this.now("Kick the Water Cooler", "sabotage", () => this.kickCooler(s));
      case "powerstrip": return s.sparking ? null : this.now("Overload the Power Strip", "sabotage", () => this.overload(s));
      case "copier":
        if (s.wrecked) return null;
        if (GameState.unlocked.toner && pl.toner === 0) return this.now("Grab Toner Cartridges", "use", () => this.refillToner());
        if (!s.hot) return this.now("Overheat the Copier (3s fuse)", "sabotage", () => this.overheat(s, true));
        return null;
      case "toilet": return s.used ? null : this.now("Clog the Toilet", "sabotage", () => this.clogToilet(s));
      case "vending": return s.used ? null : this.now("Shake the Vending Machine", "use", () => this.shakeVending(s));
      case "supply": return s.used ? null : this.now("Raid the Supply Closet", "use", () => this.raidSupply(s));
      case "fridge": return s.used ? null : this.now("Steal Someone's Lunch", "use", () => this.stealLunch(s));
      case "arcade": return s.used ? null : this.now("Play One Round (+15% dmg today)", "use", () => this.playArcade(s));
      case "coffee": return GameState.unlocked.coffee && pl.cups < pl.maxCups ? this.now("Refill Coffee", "use", () => this.refillCoffee()) : null;
    }
    return null;
  }

  private now(label: string, kind: Action["kind"], run: () => void): Action {
    return { label, hold: 0, kind, run };
  }

  private choreAction(chore: ChoreId, extra?: () => void): Action {
    return {
      label: CHORE_INFO[chore].label,
      hold: 0,
      kind: "chore",
      run: () => this.g.startMini(chore, () => {
        extra?.();
        this.g.completeChore(chore);
        if (chore === "coffee") this.fixCoffee();
      })
    };
  }

  private witness(x: number, y: number) {
    for (const e of this.g.enemies) {
      if (e.mode !== "npc" || e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) < 260 && chance(0.5)) {
        e.say(pick(NPC_SABOTAGE), 2);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- effects of actions
  private overheat(s: Station, fuse: boolean) {
    const g = this.g;
    s.hot = true;
    s.copierHp = 30;
    s.fuse = fuse ? 3 : 0;
    if (fuse) this.g.audio.play("copier_alarm", { vol: 0.6, jitter: 0 });
    s.furn?.sprite.setTint?.(0xff9a8a);
    g.fx.burst("smoke", s.x, s.y - 20, 6);
    g.audio.play("computer", { vol: 0.5 });
    g.fx.text(s.x, s.y - 50, fuse ? "RUN!" : "OVERHEATED", { color: "#ff7a6a", size: 18, pop: true });
  }

  private fixCoffee() {
    const g = this.g;
    this.coffeeFixed = true;
    g.player.cups = g.player.maxCups;
    g.audio.play("pot", { vol: 0.5 });
  }

  private refillToner() {
    const g = this.g;
    g.player.toner = 3;
    g.audio.play("place", { vol: 0.5 });
    g.fx.text(g.player.x, g.player.y - 40, "TONER LOADED", { color: "#a9adc9", size: 15 });
  }

  private refillCoffee() {
    const g = this.g;
    g.player.cups = g.player.maxCups;
    g.audio.play("pot", { vol: 0.5 });
    g.fx.text(g.player.x, g.player.y - 40, "COFFEE REFILLED", { color: "#d9a46a", size: 15 });
  }

  kickCooler(s: Station) {
    const g = this.g;
    if (s.used) return;
    s.used = true;
    const spr = s.furn?.sprite as Phaser.GameObjects.Image | undefined;
    spr?.setTexture("furn_cooler_tipped");
    g.hazards.flood(s.x, s.y + 30, GameState.stats.bigPuddles ? 46 : 22);
    g.audio.play("splash", { vol: 0.7 });
    g.audio.play("soft_heavy", { vol: 0.5 });
    g.fx.burst("water", s.x, s.y, 26);
    g.fx.shake(0.15);
    this.witness(s.x, s.y);
  }

  overload(s: Station) {
    const g = this.g;
    if (s.sparking) return;
    s.sparking = true;
    g.hazards.addSpark(s.x, s.y);
    g.audio.play("zap", { vol: 0.6 });
    g.fx.burst("zap", s.x, s.y, 14);
    g.fx.light(s.x, s.y, 0x6fd8ff, 2, 0.25);
    this.witness(s.x, s.y);
  }

  private shakeVending(s: Station) {
    const g = this.g;
    s.used = true;
    g.audio.play("metal_heavy", { vol: 0.6 });
    g.fx.shake(0.2);
    if (s.furn) g.tweens.add({ targets: s.furn.sprite, x: { from: s.furn.x - 4, to: s.furn.x }, duration: 60, repeat: 4, yoyo: true });
    g.pickups.spawn("donut", s.x, s.y + 50);
    g.pickups.spawn(chance(0.5) ? "soda" : "candy", s.x, s.y + 50);
    if (chance(0.25)) g.pickups.spawn("donut", s.x, s.y + 50);
  }

  private raidSupply(s: Station) {
    const g = this.g;
    s.used = true;
    g.player.dayMagBonus += 6;
    g.player.dayCupBonus += 3;
    g.player.refill();
    g.audio.play("coins", { vol: 0.4 });
    g.fx.text(s.x, s.y - 50, "STOCKED UP: every weapon refilled", { color: "#9fd3a8", size: 14, dur: 1.6 });
    if (chance(0.6)) g.pickups.spawn("donut", s.x, s.y + 50);
  }

  private clogToilet(s: Station) {
    const g = this.g;
    s.used = true;
    g.audio.play("splash", { vol: 0.6 });
    g.fx.text(s.x, s.y - 40, "UH OH.", { color: "#9fd8ff", size: 18 });
    g.hazards.flood(s.x, s.y + 40, 46, 0.22);
  }

  private playArcade(s: Station) {
    const g = this.g;
    s.used = true;
    g.dayDamageBuff = 1.15;
    g.audio.play("upgrade", { vol: 0.5 });
    g.fx.text(s.x, s.y - 50, "NEW HIGH SCORE! +15% DMG TODAY", { color: "#e9c25a", size: 15, dur: 1.6 });
  }

  private stealLunch(s: Station) {
    const g = this.g;
    s.used = true;
    g.player.tempHp = Math.max(g.player.tempHp, 2);
    g.audio.play("pickup", { vol: 0.5 });
    g.fx.text(s.x, s.y - 50, "+1 SHIELD HEART (somebody's sandwich)", { color: "#9fd8ff", size: 14, dur: 1.6 });
  }

  /** A shot hit a copier: hot ones blow up. */
  copierShot(s: Station, dmg: number) {
    if (!s.hot || s.wrecked) return;
    s.copierHp -= dmg;
    this.g.fx.burst("spark", s.x, s.y - 20, 5, 0xd98a3a);
    if (s.copierHp <= 0) this.detonate(s);
  }

  detonate(s: Station) {
    const g = this.g;
    if (s.wrecked) return;
    s.wrecked = true;
    s.hot = false;
    s.fuse = 0;
    s.furn?.sprite.setTint?.(0x4a4a4a);
    g.explosion(s.x, s.y, 190, 95, { friendly: true, fromCopier: true });
    g.hazards.paperPatch(s.x, s.y, GameState.stats.kindling ? 3 : 2);
    g.hazards.igniteRadius(s.x, s.y, 170, 1.6);

  }

  update(dt: number) {
    const g = this.g;
    this.rings.clear();
    const pl = g.player;
    const liveWire = GameState.stats.liveWire;
    for (const s of this.list) {
      s.fxTimer -= dt;
      if (s.hot && !s.wrecked && s.fxTimer <= 0) {
        s.fxTimer = 0.18;
        g.fx.burst("smoke", s.x + rand(-14, 14), s.y - 30, 1);
        const pulse = 0.5 + 0.5 * Math.sin(g.time.now / (s.fuse > 0 ? 50 : 120));
        s.furn?.sprite.setTint?.(Phaser.Display.Color.GetColor(255, 140 + pulse * 60, 120 + pulse * 40));
      }
      // Armed copier: count down out loud, then blow.
      if (s.fuse > 0 && !s.wrecked) {
        const before = Math.ceil(s.fuse);
        s.fuse -= dt;
        if (Math.ceil(s.fuse) !== before && s.fuse > 0) {
          g.fx.text(s.x, s.y - 60, String(Math.ceil(s.fuse)), { color: "#c4382c", size: 26, pop: true, dur: 0.6 });
          g.audio.play("tick", { vol: 0.5 });
        }
        if (s.fuse <= 0) this.detonate(s);
      }
      if (s.sparking && s.fxTimer <= 0) {
        s.fxTimer = rand(0.15, 0.45);
        g.fx.burst("zap", s.x, s.y, 3);
        if (chance(0.1)) g.audio.play("hum", { vol: 0.12, minGap: 600 });
      }
      // Live Wire: an overloaded strip becomes a little tesla coil.
      if (liveWire && s.sparking && g.phase === "downsizing") {
        s.zapCd -= dt;
        if (s.zapCd <= 0) {
          const e = g.nearestEnemy(s.x, s.y, 260);
          if (e) {
            s.zapCd = 1.0;
            g.teslaZap(s.x, s.y, e);
          } else s.zapCd = 0.2;
        }
      }
      // Chore beacons.
      const chore = this.choreAt(s);
      const showBeacon = g.phase === "crunch" && chore !== null && g.dayCfg.chores.includes(chore) && !g.choresDone.has(chore);
      if (showBeacon) {
        if (!s.marker) s.marker = g.add.image(s.x, s.y, "icon_exclamation").setDepth(DEPTH.WORLD_UI - 5).setTint(0xe9c25a).setScale(0.38);
        s.marker.setVisible(true).setPosition(s.x, s.box.y0 - 46 + Math.sin(g.time.now / 220 + s.x) * 5);
      } else if (s.marker) s.marker.setVisible(false);

      if (g.phase === "crunch" || g.phase === "downsizing") {
        const d = this.distTo(s, pl.x, pl.y);
        if (d < 220) {
          const a = this.actionFor(s);
          if (a) {
            const col = a.kind === "chore" ? 0xe9c25a : a.kind === "sabotage" ? 0xd0574a : 0x6fd8ff;
            const alpha = (1 - d / 220) * (0.35 + 0.15 * Math.sin(g.time.now / 180));
            const cx = (s.box.x0 + s.box.x1) / 2, cy = (s.box.y0 + s.box.y1) / 2;
            const rw = s.box.x1 - s.box.x0 + 26, rh = s.box.y1 - s.box.y0 + 26;
            this.rings.lineStyle(3, col, alpha).strokeRoundedRect(cx - rw / 2, cy - rh / 2, rw, rh, 12);
          }
        }
      }
    }
  }

  tileOf(s: Station) {
    return { tx: Math.floor(s.x / TILE), ty: Math.floor(s.y / TILE) };
  }
}

