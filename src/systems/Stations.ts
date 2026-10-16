import Phaser from "phaser";
import { DEPTH, TILE } from "../config";
import { ChoreId, CHORE_INFO } from "../data/days";
import { NPC_SABOTAGE } from "../data/lines";
import { GameState } from "./GameState";
import { chance, pick, rand } from "../util/math";
import { DoorDef, StationDef } from "../world/OfficeMap";
import { FurnObj } from "../world/Furniture";
import { Collider } from "../world/World";
import type { GameScene } from "../scenes/GameScene";

export interface Barricade {
  door: DoorDef;
  collider: Collider;
  sprite: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
}

export interface Station {
  def: StationDef;
  furn?: FurnObj;
  x: number;
  y: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  used: boolean;
  hot: boolean;
  sparking: boolean;
  barricade: Barricade | null;
  copierHp: number;
  wrecked: boolean;
  fxTimer: number;
  marker?: Phaser.GameObjects.Image;
}

export interface Action {
  label: string;
  hold: number;
  kind: "chore" | "sabotage" | "use";
  run: () => void;
}

export function choreForStation(def: StationDef): ChoreId | null {
  if (def.id === "emails") return "emails";
  if (def.kind === "copier" && def.main) return "print";
  if (def.kind === "shred") return "shred";
  if (def.id === "coffee") return "coffee";
  if (def.id === "presentation") return "presentation";
  if (def.id === "memos") return "memos";
  if (def.id === "server") return "server";
  if (def.id === "ceo_plant") return "plant";
  return null;
}

export class Stations {
  g: GameScene;
  list: Station[] = [];
  barricades: Barricade[] = [];
  coffeeFixed = false;
  private rings: Phaser.GameObjects.Graphics;

  constructor(g: GameScene) {
    this.g = g;
    for (const def of g.map.stations) {
      const furn = def.furnId ? g.furniture.get(def.furnId) : undefined;
      let box;
      if (def.kind === "barricade") {
        const door = g.map.doors.find((d) => d.id === def.doorId)!;
        box = { x0: door.x - door.w / 2, y0: door.y - door.h / 2, x1: door.x + door.w / 2, y1: door.y + door.h / 2 };
      } else if (furn) {
        box = { x0: furn.x - furn.w / 2, y0: furn.y - furn.h / 2, x1: furn.x + furn.w / 2, y1: furn.y + furn.h / 2 };
      } else {
        box = { x0: def.x - 20, y0: def.y - 20, x1: def.x + 20, y1: def.y + 20 };
      }
      this.list.push({ def, furn, x: def.x, y: def.y, box, used: false, hot: false, sparking: false, barricade: null, copierHp: 30, wrecked: false, fxTimer: 0 });
    }
    this.rings = g.add.graphics().setDepth(DEPTH.MARKER);
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
      if (s.furn) {
        if (s.def.kind === "cooler") (s.furn.sprite as Phaser.GameObjects.Image).setTexture("furn_cooler");
        s.furn.sprite.clearTint?.();
      }
      if (s.barricade) this.removeBarricade(s.barricade, false);
      s.barricade = null;
      s.marker?.destroy();
      s.marker = undefined;
    }
    this.barricades = [];
  }

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
      // Prefer chores over sabotage when overlapping.
      const adj = action.kind === "chore" ? d - 30 : d;
      if (adj < bd) { bd = adj; best = { station: s, action }; }
    }
    return best;
  }

  actionFor(s: Station): Action | null {
    const g = this.g;
    const phase = g.phase;
    const im = GameState.stats.sabotageMult;
    const chore = choreForStation(s.def);
    const required = chore ? g.dayCfg.chores.includes(chore) : false;
    const choreDone = chore ? g.choresDone.has(chore) : true;

    if (phase === "crunch") {
      switch (s.def.kind) {
        case "emails": case "memos": case "server": case "plant":
          if (required && !choreDone) return this.choreAction(chore!, im);
          return null;
        case "presentation":
          if (!choreDone && (required || !GameState.unlocked.laser)) return this.choreAction("presentation", im);
          return null;
        case "coffee":
          if (!this.coffeeFixed) return this.choreAction("coffee", im);
          return null;
        case "copier":
          if (s.def.main && required && !choreDone) return this.choreAction("print", im);
          if (!s.hot && !s.wrecked) return { label: "Overheat the Copier", hold: 2.0 * im, kind: "sabotage", run: () => this.overheat(s) };
          return null;
        case "shred":
          if (required && !choreDone) return this.choreAction("shred", im, () => this.shred(s, 26));
          if (g.player.shredBag < 40) return { label: "Fill a Bag of Shredded Paper", hold: 1.4 * im, kind: "use", run: () => this.shred(s, 18) };
          return null;
        case "cooler":
          if (!s.used) return { label: "Kick the Water Cooler", hold: 0.6 * im, kind: "sabotage", run: () => this.kickCooler(s) };
          return null;
        case "powerstrip":
          if (!s.sparking) return { label: "Overload the Power Strip", hold: 1.2 * im, kind: "sabotage", run: () => this.overload(s) };
          return null;
        case "vending":
          if (!s.used) return { label: "Shake the Vending Machine", hold: 1.4 * im, kind: "sabotage", run: () => this.shakeVending(s) };
          return null;
        case "supply":
          if (!s.used) return { label: "Raid the Supply Closet", hold: 1.5 * im, kind: "use", run: () => this.raidSupply(s) };
          return null;
        case "toilet":
          if (!s.used) return { label: "Clog the Toilet", hold: 2.0 * im, kind: "sabotage", run: () => this.clogToilet(s) };
          return null;
        case "arcade":
          if (!s.used) return { label: "Play One Round (-8s, +15% dmg today)", hold: 1.0, kind: "use", run: () => this.playArcade(s) };
          return null;
        case "fridge":
          if (!s.used) return { label: "Steal Someone's Lunch (+1 shield heart)", hold: 1.5 * im, kind: "use", run: () => this.stealLunch(s) };
          return null;
        case "barricade":
          if (!s.barricade) return { label: "Barricade the Doorway", hold: 2.0 * im, kind: "sabotage", run: () => this.buildBarricade(s) };
          return null;
      }
    }
    if (phase === "downsizing") {
      switch (s.def.kind) {
        case "cooler":
          if (!s.used) return { label: "Kick the Water Cooler", hold: 0.35, kind: "sabotage", run: () => this.kickCooler(s) };
          return null;
        case "powerstrip":
          if (!s.sparking) return { label: "Overload the Power Strip", hold: 0.7, kind: "sabotage", run: () => this.overload(s) };
          return null;
        case "coffee":
          if (this.coffeeFixed && g.player.cups < g.player.maxCups) return { label: "Refill Coffee", hold: 0.9, kind: "use", run: () => this.refillCoffee() };
          return null;
        case "shred":
          if (g.player.shredBag < 40) return { label: "Fill a Bag of Shredded Paper", hold: 1.2, kind: "use", run: () => this.shred(s, 18) };
          return null;
      }
    }
    return null;
  }

  private choreAction(chore: ChoreId, _im: number, extra?: () => void): Action {
    return {
      label: CHORE_INFO[chore].label,
      hold: 0.3,
      kind: "chore",
      run: () => this.g.startMini(chore, () => {
        extra?.();
        this.g.completeChore(chore);
        if (chore === "coffee") this.fixCoffee();
      })
    };
  }

  private witness(x: number, y: number) {
    // Nearby coworkers comment on your... initiative.
    for (const e of this.g.enemies) {
      if (e.mode !== "npc" || e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) < 260 && chance(0.5)) {
        e.say(pick(NPC_SABOTAGE), 2);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- effects of actions
  private overheat(s: Station) {
    const g = this.g;
    s.hot = true;
    s.copierHp = 30;
    s.furn?.sprite.setTint?.(0xff9a8a);
    g.fx.burst("smoke", s.x, s.y - 20, 6);
    g.audio.play("computer", { vol: 0.5 });
    g.fx.text(s.x, s.y - 50, "OVERHEATED", { color: "#ff7a6a", size: 16 });
    this.witness(s.x, s.y);
  }

  private shred(s: Station, amount: number) {
    const g = this.g;
    g.player.shredBag = Math.min(40, g.player.shredBag + amount);
    g.player.dropPaper = true;
    g.hazards.paperPatch(s.x, s.y + 40, 1);
    g.audio.play("shredder", { vol: 0.45 });
    g.fx.burst("confetti", s.x, s.y, 16);
    g.fx.text(s.x, s.y - 50, `+${amount} SHREDS (F to toggle trail)`, { color: "#f3eedf", size: 14, dur: 1.4 });
  }

  private fixCoffee() {
    const g = this.g;
    this.coffeeFixed = true;
    const first = !GameState.unlocked.coffee;
    GameState.unlocked.coffee = true;
    g.player.cups = g.player.maxCups;
    g.audio.play("pot", { vol: 0.5 });
    if (first) g.unlockBanner("HOT COFFEE", "Shotgun splash that scalds. Press 2. Refill at the coffee machine.");
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
    g.hazards.flood(s.x, s.y + 30, 22);
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
    this.witness(s.x, s.y);
  }

  private raidSupply(s: Station) {
    const g = this.g;
    s.used = true;
    g.player.dayMagBonus += 6;
    g.player.dayCupBonus += 3;
    g.player.refill();
    g.audio.play("coins", { vol: 0.4 });
    g.fx.text(s.x, s.y - 50, "STOCKED UP: +6 STAPLES, +3 COFFEE", { color: "#9dffb0", size: 14, dur: 1.6 });
    if (chance(0.6)) g.pickups.spawn("donut", s.x, s.y + 50);
  }

  private clogToilet(s: Station) {
    const g = this.g;
    s.used = true;
    g.audio.play("splash", { vol: 0.6 });
    g.fx.text(s.x, s.y - 40, "UH OH.", { color: "#9fd8ff", size: 18 });
    g.hazards.flood(s.x, s.y + 40, 46, 0.22);
    this.witness(s.x, s.y);
  }

  private playArcade(s: Station) {
    const g = this.g;
    s.used = true;
    g.crunchLeft = Math.max(1, g.crunchLeft - 8);
    g.dayDamageBuff = 1.15;
    g.audio.play("upgrade", { vol: 0.5 });
    g.fx.text(s.x, s.y - 50, "NEW HIGH SCORE! +15% DMG TODAY", { color: "#ffd75a", size: 15, dur: 1.6 });
  }

  private stealLunch(s: Station) {
    const g = this.g;
    s.used = true;
    g.player.tempHp = 2;
    g.audio.play("pickup", { vol: 0.5 });
    g.fx.text(s.x, s.y - 50, "+1 SHIELD HEART (somebody's sandwich)", { color: "#9fd8ff", size: 14, dur: 1.6 });
  }

  private buildBarricade(s: Station) {
    const g = this.g;
    const door = g.map.doors.find((d) => d.id === s.def.doorId)!;
    // Don't wall the boss in: shove the player out of the doorway first.
    const pl = g.player;
    const vertical = door.h > door.w;
    if (Math.abs(pl.x - door.x) < door.w / 2 + pl.r && Math.abs(pl.y - door.y) < door.h / 2 + pl.r) {
      if (vertical) pl.x = door.x + (pl.x < door.x ? -1 : 1) * (door.w / 2 + pl.r + 4);
      else pl.y = door.y + (pl.y < door.y ? -1 : 1) * (door.h / 2 + pl.r + 4);
    }
    const collider = g.world.addCollider({
      x0: door.x - door.w / 2, y0: door.y - door.h / 2, x1: door.x + door.w / 2, y1: door.y + door.h / 2,
      solid: true, shots: true, kind: "barricade"
    });
    const sprite = g.add.image(door.x, door.y + (vertical ? 0 : 10), "furn_barricade").setOrigin(0.5, 0.78);
    if (vertical) sprite.setScale(0.75);
    else sprite.setScale(Math.min(1.1, door.w / 130));
    sprite.setDepth(door.y + door.h / 2);
    const maxHp = 140 + g.dayCfg.day * 30;
    const b: Barricade = { door, collider, sprite, hp: maxHp, maxHp };
    collider.ref = b;
    s.barricade = b;
    this.barricades.push(b);
    g.world.rebuildNav();
    g.audio.play("place", { vol: 0.6 });
    g.audio.play("wood", { vol: 0.5 });
    g.fx.burst("pixel", door.x, door.y, 14, 0xc8955b);
  }

  damageBarricade(b: Barricade, dmg: number) {
    const g = this.g;
    if (b.hp <= 0) return;
    b.hp -= dmg;
    g.fx.burst("pixel", b.door.x + rand(-20, 20), b.door.y + rand(-10, 10), 4, 0xc8955b);
    g.audio.play("wood", { vol: 0.3, minGap: 120 });
    g.tweens.add({ targets: b.sprite, angle: { from: rand(-4, 4), to: 0 }, duration: 120 });
    b.sprite.setAlpha(0.55 + 0.45 * Math.max(0, b.hp / b.maxHp));
    if (b.hp <= 0) this.removeBarricade(b, true);
  }

  removeBarricade(b: Barricade, smashed: boolean) {
    const g = this.g;
    g.world.removeCollider(b.collider);
    b.sprite.destroy();
    this.barricades = this.barricades.filter((x) => x !== b);
    for (const s of this.list) if (s.barricade === b) s.barricade = null;
    g.world.rebuildNav();
    if (smashed) {
      g.audio.play("wood_heavy", { vol: 0.7 });
      g.fx.burst("pixel", b.door.x, b.door.y, 30, 0xc8955b);
      g.fx.burst("confetti", b.door.x, b.door.y, 12);
      g.fx.text(b.door.x, b.door.y - 40, "BARRICADE BROKEN", { color: "#ffb36b", size: 15 });
      g.fx.shake(0.25);
    }
  }

  /** A shot hit a copier: hot ones blow up. */
  copierShot(s: Station, dmg: number) {
    if (!s.hot || s.wrecked) return;
    s.copierHp -= dmg;
    this.g.fx.burst("spark", s.x, s.y - 20, 5, 0xffa040);
    if (s.copierHp <= 0) this.detonate(s);
  }

  detonate(s: Station) {
    const g = this.g;
    if (s.wrecked) return;
    s.wrecked = true;
    s.hot = false;
    s.furn?.sprite.setTint?.(0x4a4a4a);
    g.explosion(s.x, s.y, 190, 95, { friendly: true, fromCopier: true });
    g.hazards.paperPatch(s.x, s.y, 2);
    g.hazards.igniteRadius(s.x, s.y, 170, 1.6);
    if (chance(0.5)) g.audio.voice("war_fire_in_the_hole", 0.6);
  }

  update(dt: number) {
    const g = this.g;
    this.rings.clear();
    const pl = g.player;
    for (const s of this.list) {
      s.fxTimer -= dt;
      if (s.hot && !s.wrecked && s.fxTimer <= 0) {
        s.fxTimer = 0.18;
        g.fx.burst("smoke", s.x + rand(-14, 14), s.y - 30, 1);
        const pulse = 0.5 + 0.5 * Math.sin(g.time.now / 120);
        s.furn?.sprite.setTint?.(Phaser.Display.Color.GetColor(255, 140 + pulse * 60, 120 + pulse * 40));
      }
      if (s.sparking && s.fxTimer <= 0) {
        s.fxTimer = rand(0.15, 0.45);
        g.fx.burst("zap", s.x, s.y, 3);
        if (chance(0.1)) g.audio.play("hum", { vol: 0.12, minGap: 600 });
      }
      // Chore beacons + interaction hints.
      const chore = choreForStation(s.def);
      const showBeacon = g.phase === "crunch" && chore !== null && g.dayCfg.chores.includes(chore) && !g.choresDone.has(chore)
        && !(chore === "shred" && s.def.id !== "shredder");
      if (showBeacon) {
        if (!s.marker) s.marker = g.add.image(s.x, s.y, "icon_exclamation").setDepth(DEPTH.WORLD_UI - 5).setTint(0xffd75a).setScale(0.38);
        s.marker.setVisible(true).setPosition(s.x, s.box.y0 - 46 + Math.sin(g.time.now / 220 + s.x) * 5);
      } else if (s.marker) s.marker.setVisible(false);

      if (g.phase === "crunch" || g.phase === "downsizing") {
        const d = this.distTo(s, pl.x, pl.y);
        if (d < 220) {
          const a = this.actionFor(s);
          if (a) {
            const col = a.kind === "chore" ? 0xffd75a : a.kind === "sabotage" ? 0xff6b6b : 0x6fd8ff;
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
