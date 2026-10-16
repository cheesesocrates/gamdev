import Phaser from "phaser";
import { DEPTH, MAP_H, MAP_W, TILE, VIEW_WORLD_HEIGHT, WORLD_H, WORLD_W } from "../config";
import { buildOffice, Mat, OfficeMap, Tile } from "../world/OfficeMap";
import { Collider, ShotHit, World } from "../world/World";
import { FlowField } from "../world/Nav";
import { buildFurniture, Chair, FurnObj } from "../world/Furniture";
import { Hazards } from "../world/Hazards";
import { Effects } from "../systems/Effects";
import { AudioManager } from "../systems/Audio";
import { GameState } from "../systems/GameState";
import { Barricade, Station, Stations } from "../systems/Stations";
import { Waves } from "../systems/Waves";
import { Player, PlayerInput } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { Projectiles } from "../entities/Projectiles";
import { Pickups } from "../entities/Pickups";
import { CHORE_INFO, ChoreId, DayConfig, dayConfig } from "../data/days";
import { EnemyType } from "../data/enemies";
import { COMBO_WORDS, FIRED_WORDS, PHASE1_TIPS } from "../data/lines";
import { PerkDef } from "../data/perks";
import { FLOOR_INDEX, WALL_INDEX } from "./BootScene";
import { ArrowMark, UI } from "../ui/UI";
import { chance, clamp, damp, formatClock, lerp, pick, rand, shuffle, weightedPick } from "../util/math";

export type Phase = "title" | "crunch" | "review" | "announce" | "downsizing" | "dayclear" | "results" | "gameover";

type Keys = Record<"W" | "A" | "S" | "D" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "SPACE" | "SHIFT" | "E" | "R" | "Q" | "F" | "ONE" | "TWO" | "THREE" | "ENTER" | "ESC" | "P" | "M", Phaser.Input.Keyboard.Key>;

interface HitInfo {
  angle: number;
  kind: string;
  x: number;
  y: number;
  knock: number;
  silent?: boolean;
  noChain?: boolean;
  noCrit?: boolean;
}

const BEST_KEY = "hostile-takeover-best";
const PLAYER_SOURCES = new Set(["staple", "coffee", "shard", "laser", "orbit", "explosion", "ally", "chain", "nuke", "chair"]);

export class GameScene extends Phaser.Scene {
  map!: OfficeMap;
  world!: World;
  hazards!: Hazards;
  fx!: Effects;
  audio!: AudioManager;
  furniture!: Map<string, FurnObj>;
  chairs: Chair[] = [];
  private chairHomes: { x: number; y: number; rot: number }[] = [];
  stations!: Stations;
  projectiles!: Projectiles;
  pickups!: Pickups;
  waves!: Waves;
  player!: Player;
  enemies: Enemy[] = [];
  flowNaive!: FlowField;
  flowSmart!: FlowField;
  ui!: UI;

  phase: Phase = "title";
  dayCfg: DayConfig = dayConfig(1);
  quota = 10;
  fired = 0;
  crunchLeft = 120;
  crunchTotal = 120;
  choresDone = new Set<ChoreId>();
  dayDamageBuff = 1;
  godMode = false;
  paused = false;

  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private keys!: Keys;
  private wheel = 0;
  /** Keys pressed since last frame (event-driven so quick taps are never lost). */
  private pressed = new Set<string>();
  private rmb = false;
  private camX = 0;
  private camY = 0;
  private dimRect!: Phaser.GameObjects.Rectangle;
  private redRect!: Phaser.GameObjects.Rectangle;
  private flashlight!: Phaser.GameObjects.Image;
  private laserGfx!: Phaser.GameObjects.Graphics;
  private chainGfx!: Phaser.GameObjects.Graphics;
  private chainLines: { pts: number[]; life: number }[] = [];
  private laserTick = new Map<number, number>();
  private laserSfx = 0;
  private glassChip = new Map<number, number>();
  private orbiters: Phaser.GameObjects.Image[] = [];
  private orbitAngle = 0;
  private orbitHit = new Map<number, number>();

  private flowTimer = 0;
  private flowTile = -1;
  private interactTarget: Station | null = null;
  private interactProgress = 0;
  private interactTick = 0;
  private barkCd = 0;
  private holsterToastCd = 0;
  private combo = 0;
  private comboTimer = 0;
  private comboVoiced = false;
  private killsForIntern = 0;
  private killsForNuke = 0;
  private bulletTimeCd = 0;
  private lastTick = -1;
  private hurryVoiced = false;
  private arrowTimer = 0;
  private mmTimer = 0;
  private titleT = 0;
  private announceTimers: Phaser.Time.TimerEvent[] = [];
  private reviewOffers: { perk: PerkDef; sold: boolean }[] = [];
  private reviewNotes: { text: string; kind: "good" | "bad" | "" }[] = [];
  private lightPhase = 0;
  private sprinklerCd = 0;
  private sprinklerT = 0;
  private sprinklerAt = { x: 0, y: 0 };

  constructor() {
    super("Game");
  }

  // ================================================================ setup
  create() {
    this.map = buildOffice();
    this.world = new World(this.map);
    this.audio = new AudioManager(this);
    this.fx = new Effects(this);
    this.buildTilemap();
    const built = buildFurniture(this, this.map, this.world);
    this.furniture = built.furniture;
    this.chairs = built.chairs;
    this.chairHomes = this.chairs.map((c) => ({ x: c.x, y: c.y, rot: c.rot }));
    for (const c of this.chairs) c.sprite.setDepth(c.y - 2);
    this.world.rebuildNav();
    this.hazards = new Hazards(this, this.world, this.fx, this.audio);
    this.flowNaive = new FlowField(this.world);
    this.flowSmart = new FlowField(this.world, (i) => (this.hazards.fire[i] > 0 ? 45 : 0) + (this.hazards.electric[i] ? 70 : 0));
    this.projectiles = new Projectiles(this);
    this.pickups = new Pickups(this);
    this.stations = new Stations(this);
    this.waves = new Waves(this);
    this.player = new Player(this, this.map.playerSpawn.x, this.map.playerSpawn.y);

    this.laserGfx = this.add.graphics().setDepth(DEPTH.PROJECTILE + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.chainGfx = this.add.graphics().setDepth(DEPTH.PROJECTILE + 3).setBlendMode(Phaser.BlendModes.ADD);
    this.dimRect = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setDepth(DEPTH.LIGHTING).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.redRect = this.add.rectangle(0, 0, 10, 10, 0xff1020, 0).setOrigin(0).setDepth(DEPTH.LIGHTING + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.flashlight = this.add.image(0, 0, "soft").setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.LIGHTING + 1).setTint(0xfff0d0).setAlpha(0).setScale(9);

    this.setupInput();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor("#0b0c10");
    this.onResize();
    this.scale.on("resize", () => this.onResize());
    this.camX = this.player.x;
    this.camY = this.player.y;

    this.ui = new UI();
    this.ui.initMinimap(this.map, this.world);
    this.ui.hideBoot(() => this.audio.play("select", { vol: 0.5 }));

    this.game.events.on(Phaser.Core.Events.BLUR, () => {
      if ((this.phase === "crunch" || this.phase === "downsizing") && !this.paused) this.togglePause();
    });

    (window as unknown as Record<string, unknown>).__HT = {
      scene: this,
      state: GameState,
      start: () => this.startRun(),
      toFight: () => this.debugToFight(),
      give: (id: string, n = 1) => { for (let i = 0; i < n; i++) GameState.addPerk(id); },
      god: (v = true) => { this.godMode = v; },
      killAll: () => { for (const e of [...this.enemies]) if (e.hostile) this.killEnemy(e, true); },
      day: (d: number) => { GameState.day = d; this.startDay(d); },
      phase: () => this.phase,
      prof: () => Object.fromEntries(Object.entries(this.prof).map(([k, v]) => [k, +v.toFixed(2)])),
      perf: () => ({ updateMs: +this.perfMs.toFixed(2), fps: Math.round(this.game.loop.actualFps), enemies: this.enemies.length, projectiles: this.projectiles.list.filter((p) => p.active).length }),
      tp: (x: number, y: number) => { this.player.x = x; this.player.y = y; }
    };

    this.enterTitle();
  }

  private buildTilemap() {
    const tm = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H });
    const ts = tm.addTilesetImage("tileset", "tileset", TILE, TILE, 0, 0)!;
    this.floorLayer = tm.createBlankLayer("floor", ts, 0, 0)!.setDepth(DEPTH.FLOOR);
    this.wallLayer = tm.createBlankLayer("walls", ts, 0, 0)!.setDepth(DEPTH.FLOOR + 1);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const t = this.map.tiles[i];
        const m = this.map.mats[i] as Mat;
        if (t === Tile.FLOOR || t === Tile.GLASS) {
          const variants = FLOOR_INDEX[m] ?? FLOOR_INDEX[1];
          this.floorLayer.putTileAt(variants[(x * 7 + y * 13) % variants.length], x, y);
        }
        if (t !== Tile.FLOOR) this.placeWallTile(x, y);
      }
    }
  }

  private placeWallTile(x: number, y: number) {
    const t = this.world.tile(x, y);
    const below = this.world.tile(x, y + 1) === Tile.FLOOR;
    let idx: number = WALL_INDEX.CAP;
    if (t === Tile.WALL) {
      if (below) idx = y === 0 && x % 3 !== 0 ? WALL_INDEX.WINDOW : (x * 7 + y * 3) % 9 === 0 ? WALL_INDEX.FACE_ALT : WALL_INDEX.FACE;
    } else if (t === Tile.GLASS) idx = below ? WALL_INDEX.GLASS_FACE : WALL_INDEX.GLASS;
    else if (t === Tile.ELEVATOR) idx = this.map.spawns.some((s) => s.kind === "elevator" && s.doorTx === x) ? WALL_INDEX.ELEV_L : WALL_INDEX.ELEV_R;
    else if (t === Tile.EXIT_DOOR) idx = this.map.spawns.some((s) => s.kind === "exit" && s.doorTx === x) ? WALL_INDEX.EXIT_L : WALL_INDEX.EXIT_R;
    this.wallLayer.putTileAt(idx, x, y);
  }

  private setupInput() {
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,E,R,Q,F,ONE,TWO,THREE,ENTER,ESC,P,M") as Keys;
    this.input.mouse?.disableContextMenu();
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => { if (!ev.repeat) this.pressed.add(ev.code); });
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => { this.wheel += Math.sign(dy); });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.rmb = true;
      if (this.phase === "announce") this.skipAnnounce();
    });
  }

  private onResize() {
    const cam = this.cameras.main;
    const h = this.scale.height;
    cam.setZoom(clamp(h / VIEW_WORLD_HEIGHT, 0.55, 1.8));
  }

  // ================================================================ flow: title / days
  private enterTitle() {
    this.phase = "title";
    GameState.reset();
    this.resetWorldForDay(1);
    this.player.sprite.setVisible(false);
    this.player.shadow.setVisible(false);
    this.spawnNpcs(10);
    this.ui.setHudMode("none");
    this.audio.setMusic("title");
    const best = this.loadBest();
    this.ui.showTitle(best ? `BEST: SURVIVED ${best.days} DAY${best.days === 1 ? "" : "S"} · ${best.fired} FIRED` : "", () => {
      this.audio.play("click", { vol: 0.6 });
      this.ui.closeScreen("title");
      this.startRun();
    });
  }

  private startRun() {
    GameState.reset();
    this.startDay(1);
  }

  private resetWorldForDay(day: number) {
    this.dayCfg = dayConfig(day);
    for (const e of this.enemies) e.destroy();
    this.enemies = [];
    this.projectiles.clear();
    this.pickups.clear();
    this.hazards.clear();
    this.fx.clearDecals();
    this.stations.resetDay();
    // Overnight repairs: glass panes come back.
    for (let i = 0; i < this.map.tiles.length; i++) {
      if (this.map.tiles[i] !== Tile.GLASS) continue;
      this.world.tiles[i] = Tile.GLASS;
      this.world.glassHp.set(i, 3);
      this.placeWallTile(i % MAP_W, Math.floor(i / MAP_W));
    }
    this.world.rebuildNav();
    this.chairs.forEach((c, k) => {
      const h = this.chairHomes[k];
      c.x = h.x; c.y = h.y; c.rot = h.rot; c.vx = c.vy = c.spin = 0;
      const deg = Math.round(Phaser.Math.RadToDeg(h.rot) / 90) * 90 % 360;
      c.sprite.setTexture(`furn_${c.base}_${(deg + 360) % 360}`).setPosition(c.x, c.y).setRotation(0).setDepth(c.y - 2);
    });
    const p = this.player;
    p.x = this.map.playerSpawn.x;
    p.y = this.map.playerSpawn.y;
    p.vx = p.vy = 0;
    p.dead = false;
    p.invuln = p.stun = p.rolling = p.slip = 0;
    p.tempHp = 0;
    p.shredBag = 0;
    p.dayMagBonus = p.dayCupBonus = 0;
    p.weapon = "stapler";
    p.setArmed(false);
    p.refill();
    p.sprite.setVisible(true).setAlpha(1);
    p.shadow.setVisible(true);
    this.fired = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.dayDamageBuff = 1;
    this.choresDone.clear();
    this.waves.reset();
    this.setWindowsNight(false);
    this.camX = p.x;
    this.camY = p.y;
  }

  startDay(day: number) {
    GameState.day = day;
    if (day > 1) GameState.newDay();
    this.resetWorldForDay(day);
    this.ui.initMinimap(this.map, this.world);
    this.spawnNpcs(this.dayCfg.npcs);
    this.crunchTotal = GameState.crunchSeconds();
    this.crunchLeft = this.crunchTotal;
    this.quota = this.dayCfg.quota;
    this.hurryVoiced = false;
    this.lastTick = -1;
    this.phase = "crunch";
    this.paused = false;
    this.ui.setHudMode("crunch");
    this.audio.setMusic("lobby");
    this.audio.setMusicRate(1);
    this.ui.banner(`DAY ${day}`, "3:00 PM · Finish your chores before 5", "#ffffff", 2.6);
    this.time.delayedCall(2600, () => {
      if (this.phase === "crunch") this.ui.toast(day === 1 ? PHASE1_TIPS[0] : pick(PHASE1_TIPS), "#4fd1ff", 5);
    });
    if (day === 1) {
      this.time.delayedCall(8500, () => { if (this.phase === "crunch") this.ui.toast(PHASE1_TIPS[2], "#ff6b6b", 6); });
      this.time.delayedCall(16000, () => { if (this.phase === "crunch") this.ui.toast(PHASE1_TIPS[1], "#ffcf3f", 6); });
    }
  }

  private spawnNpcs(n: number) {
    const homes = shuffle([...this.map.npcHomes]).slice(0, n);
    const weights = Object.entries(this.dayCfg.weights)
      .filter(([t]) => t !== "consultant")
      .map(([t, w]) => ({ item: t as EnemyType, w: t === "hr" ? (w as number) * 0.4 : (w as number) }));
    for (const h of homes) {
      const type = weightedPick(weights);
      const e = this.spawnEnemy(type, h.x, h.y, "npc");
      e.home = h;
      e.facing = h.facing;
    }
  }

  // ================================================================ crunch time
  private updateCrunch(dt: number, inp: PlayerInput) {
    this.player.update(dt, inp);
    this.handleInteraction(dt);
    this.crunchLeft -= dt;
    const left = this.crunchLeft;
    if (left <= 20 && !this.hurryVoiced) {
      this.hurryVoiced = true;
      this.audio.voice("hurry_up", 0.8);
      this.audio.setMusicRate(1.08);
      this.ui.toast("20 seconds until 5:00 PM!", "#ff6b6b", 3);
    }
    if (left <= 10) {
      const s = Math.ceil(left);
      if (s !== this.lastTick) {
        this.lastTick = s;
        this.audio.play("tick", { vol: 0.5, jitter: 0 });
      }
    }
    if (inp.fire && this.holsterToastCd <= 0) {
      this.holsterToastCd = 3;
      this.ui.toast("No violence before 5:00 PM. HR is watching.", "#ff6b6b", 2);
    }
    if ((this.pressed.has("Enter") || this.pressed.has("NumpadEnter")) && this.allChoresDone()) {
      this.endCrunch(true);
      return;
    }
    if (left <= 0) this.endCrunch(false);
  }

  allChoresDone() {
    return this.dayCfg.chores.every((c) => this.choresDone.has(c));
  }

  completeChore(c: ChoreId) {
    if (this.choresDone.has(c)) return;
    this.choresDone.add(c);
    if (this.dayCfg.chores.includes(c)) GameState.dayStats.choresDone++;
    this.audio.jingle("jingle_chore", 0.5);
    this.audio.play("confirm", { vol: 0.5 });
    this.ui.toast(`✓ ${CHORE_INFO[c].label}`, "#52d17c", 2.2);
    this.fx.text(this.player.x, this.player.y - 40, "DONE!", { color: "#52d17c", size: 20, pop: true });
    if (c === "presentation" && !GameState.unlocked.laser) {
      GameState.unlocked.laser = true;
      this.unlockBanner("LASER POINTER", "Hold to fire a burning beam. Press 3. Sets paper ablaze.");
    }
    if (this.dayCfg.chores.includes(c) && this.allChoresDone()) {
      this.audio.voice("objective_achieved", 0.7);
      this.ui.toast("All chores done! Press ENTER to clock out and bank your leftover time.", "#52d17c", 5);
    }
  }

  unlockBanner(name: string, desc: string) {
    this.ui.unlock(name, desc);
    this.audio.play("levelup", { vol: 0.6 });
  }

  private endCrunch(early: boolean) {
    const leftover = early ? Math.floor(Math.max(0, this.crunchLeft)) : 0;
    const choreBonus = this.choresDone.size * 3;
    const missed = this.dayCfg.chores.filter((c) => !this.choresDone.has(c));
    GameState.bank += leftover + choreBonus;
    GameState.dayStats.banked = leftover + choreBonus;
    GameState.dayStats.choresTotal = this.dayCfg.chores.length;
    this.quota = this.dayCfg.quota + missed.length * 2;
    this.reviewNotes = [];
    if (early) this.reviewNotes.push({ text: `+${leftover}s for clocking out early`, kind: "good" });
    else this.audio.voice("time_over", 0.8);
    if (choreBonus) this.reviewNotes.push({ text: `+${choreBonus}s chore bonus (${this.choresDone.size} done)`, kind: "good" });
    if (missed.length) this.reviewNotes.push({ text: `${missed.length} missed deadline${missed.length > 1 ? "s" : ""}: +${missed.length * 2} to today's firing quota`, kind: "bad" });
    this.reviewNotes.push({ text: `Today's quota: ${this.quota} employees`, kind: "" });
    this.phase = "review";
    this.player.vx = this.player.vy = 0;
    this.interactTarget = null;
    this.ui.setPrompt(null);
    this.ui.setClockout(false, 0);
    this.ui.setHudMode("none");
    this.audio.setMusic("review");
    this.audio.setMusicRate(1);
    this.reviewOffers = GameState.rollPerks(5).map((perk) => ({ perk, sold: false }));
    this.renderReview();
  }

  private renderReview() {
    const healCost = 8, rerollCost = 5;
    this.ui.showReview({
      bank: GameState.bank,
      notes: this.reviewNotes,
      offers: this.reviewOffers.map((o) => ({ ...o, stacks: GameState.stack(o.perk.id) })),
      healCost,
      canHeal: GameState.hp < GameState.stats.maxHp,
      rerollCost
    }, {
      buy: (i) => {
        const o = this.reviewOffers[i];
        if (!o || o.sold || GameState.bank < o.perk.cost || !GameState.canTake(o.perk)) return;
        GameState.bank -= o.perk.cost;
        GameState.addPerk(o.perk.id);
        o.sold = true;
        this.audio.play("powerup", { vol: 0.6 });
        this.renderReview();
      },
      heal: () => {
        if (GameState.bank < healCost) return;
        GameState.bank -= healCost;
        GameState.hp = GameState.stats.maxHp;
        this.audio.play("pickup", { vol: 0.6 });
        this.renderReview();
      },
      reroll: () => {
        if (GameState.bank < rerollCost) return;
        GameState.bank -= rerollCost;
        this.reviewOffers = GameState.rollPerks(5).map((perk) => ({ perk, sold: false }));
        this.audio.play("select", { vol: 0.5 });
        this.renderReview();
      },
      go: () => {
        this.ui.closeScreen("review");
        this.audio.play("click", { vol: 0.6 });
        this.startAnnouncement();
      }
    });
  }

  // ================================================================ 5 PM
  private startAnnouncement() {
    this.phase = "announce";
    this.audio.setMusic("none", 0.4);
    this.lightPhase = 0;
    const setLine = this.ui.showAnnounce(() => this.skipAnnounce());
    const at = (ms: number, fn: () => void) => this.announceTimers.push(this.time.delayedCall(ms, fn));
    const type = (i: number, text: string, cls?: string) => {
      let n = 0;
      const step = () => {
        n++;
        setLine(i, text.slice(0, n) + (n < text.length ? '<span class="cursor">_</span>' : ""), cls);
        if (n < text.length) at(22, step);
      };
      step();
      this.audio.play("glitch", { vol: 0.5 });
    };
    this.audio.play("alert", { vol: 0.7 });
    this.audio.play("powerdown", { vol: 0.6 });
    at(200, () => type(0, "BUDGET CUTS HAVE BEEN MADE."));
    at(1400, () => { type(1, "DOWNSIZING HAS BEGUN."); this.audio.play("alert", { vol: 0.6 }); });
    at(2600, () => {
      type(2, `${this.quota} WILL BE FIRED BY THE END OF TODAY.`, "red");
      for (const e of this.enemies) {
        if (e.mode !== "npc") continue;
        e.sprite.setTint(0xff6b6b);
        this.fx.text(e.x, e.y - 34, "!", { color: "#ff3b55", size: 30, pop: true, dur: 1.4 });
      }
      this.audio.voice("prepare_yourself", 0.9);
    });
    at(4000, () => {
      type(3, "GOOD LUCK.", "huge");
      this.audio.voice(`round_${Math.min(5, GameState.day)}`, 0.9);
    });
    at(5300, () => this.startDownsizing());
  }

  private skipAnnounce() {
    if (this.phase !== "announce") return;
    this.startDownsizing();
  }

  private startDownsizing() {
    for (const t of this.announceTimers) t.remove(false);
    this.announceTimers = [];
    this.ui.closeScreen("announce");
    this.phase = "downsizing";
    this.player.setArmed(true);
    this.player.refill();
    for (const e of this.enemies) if (e.mode === "npc") e.turnHostile();
    this.waves.reset();
    this.hazards.setAllElectric(GameState.stats.electric);
    this.audio.setMusic("fight", 0.2);
    this.audio.voice("fight", 1);
    this.ui.setHudMode("fight");
    this.ui.flash("#ff2040", 260, 0.5);
    this.ui.banner("FIGHT!", `Fire ${this.quota} coworkers before they fire you`, "#ff3b55", 1.8);
    if (GameState.day === 1) {
      this.time.delayedCall(1900, () => {
        if (this.phase === "downsizing") this.ui.toast("<b>LMB</b> fire · <b>1 2 3</b> weapons · <b>SPACE</b> dodge roll · <b>R</b> reload · kick coolers mid-fight with <b>E</b>", "#ff3b55", 6);
      });
    }
    this.fx.shake(0.6);
    const cam = this.cameras.main;
    const z = cam.zoom;
    cam.setZoom(z * 1.35);
    this.tweens.add({ targets: cam, zoom: z, duration: 650, ease: "Cubic.easeOut" });
    this.setWindowsNight(true);
    this.flowTile = -1;
  }

  private setWindowsNight(night: boolean) {
    this.wallLayer.forEachTile((t) => {
      if (t.index === WALL_INDEX.WINDOW) t.tint = night ? 0x3d3f6e : 0xffffff;
    });
  }

  // ================================================================ downsizing
  private updateDownsizing(dt: number, inp: PlayerInput) {
    this.player.update(dt, inp);
    if (this.player.dead) {
      this.gameOver();
      return;
    }
    this.handleInteraction(dt);
    this.waves.update(dt);
    this.updateOrbiters(dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboVoiced = false;
        this.ui.setCombo(0, "");
      }
    }
    if (this.bulletTimeCd > 0) this.bulletTimeCd -= dt;
    this.updateSprinklers(dt);
    const bossAlive = this.waves.boss && !this.waves.boss.dead;
    if (this.waves.boss && !this.waves.boss.dead) this.ui.setBoss("THE CONSULTANT", this.waves.boss.hp / this.waves.boss.maxHp);
    else this.ui.setBoss(null, 0);
    if (this.fired >= this.quota && !bossAlive) this.dayClear();
  }

  private dayClear() {
    this.phase = "dayclear";
    this.fx.slowmo(0.3, 1.4);
    this.player.invuln = 99;
    this.player.setArmed(false);
    this.laserGfx.clear();
    for (const p of this.projectiles.list) if (p.active && !p.friendly) p.range = 0;
    const flawless = GameState.dayStats.damageTaken === 0;
    this.audio.voice(flawless ? "flawless_victory" : "you_win", 0.95);
    this.audio.jingle("jingle_win", 0.7);
    this.audio.setMusic("none", 1.5);
    this.ui.banner("QUOTA MET", flawless ? "FLAWLESS. NOT A SCRATCH." : `Day ${GameState.day} survived`, "#ffcf3f", 2.4);
    this.ui.flash("#ffffff", 400, 0.5);
    this.time.delayedCall(2400, () => this.showResults());
  }

  private showResults() {
    this.phase = "results";
    this.ui.setHudMode("none");
    this.ui.setCombo(0, "");
    const ds = GameState.dayStats;
    const dmg = ds.damageTaken;
    const grade = dmg === 0 ? "S" : dmg <= 2 ? "A" : dmg <= 4 ? "B" : dmg <= 6 ? "C" : "D";
    const gradeColor = { S: "#ffcf3f", A: "#52d17c", B: "#4fd1ff", C: "#c9d1dc", D: "#ff6b6b" }[grade]!;
    const title = { S: "Exceeds all expectations. Promoted to Senior VP of Firing.", A: "Exceeds expectations.", B: "Meets expectations.", C: "Needs improvement.", D: "On a performance improvement plan." }[grade]!;
    const acc = ds.shots ? Math.round((ds.hits / Math.max(1, ds.shots)) * 100) : 0;
    this.audio.setMusic("review");
    const picks = GameState.rollPerks(3, 2.2);
    this.ui.showResults({
      day: GameState.day, grade, gradeColor, title,
      stats: [
        ["Coworkers fired", String(ds.fired)],
        ["Damage taken", `${dmg / 2} ♥`],
        ["Best combo", `x${Math.max(ds.bestCombo, 1)}`],
        ["Chores done", `${ds.choresDone}/${ds.choresTotal}`],
        ["Overtime banked", `${ds.banked}s`],
        ["Hit rate", `${Math.min(999, acc)}%`]
      ]
    }, picks, GameState.stacks, (i) => {
      const p = picks[i];
      if (p) GameState.addPerk(p.id);
      this.audio.play("powerup", { vol: 0.7 });
      this.audio.voice("power_up", 0.7);
      this.ui.closeScreen("results");
      this.startDay(GameState.day + 1);
    });
  }

  private gameOver() {
    if (this.phase === "gameover") return;
    this.phase = "gameover";
    this.fx.slowmo(0.3, 1.2);
    this.laserGfx.clear();
    this.player.setArmed(false);
    this.player.sprite.setTint(0x888888);
    this.fx.decal(this.player.x, this.player.y + 8, "furn_belongings", { scale: 1.2, rot: 0 });
    this.fx.burst("confetti", this.player.x, this.player.y, 30);
    this.audio.voice("game_over", 1);
    this.audio.jingle("jingle_lose", 0.6);
    this.audio.setMusic("gameover", 1.2);
    this.ui.setHudMode("none");
    this.ui.setCombo(0, "");
    this.ui.setBoss(null, 0);
    const daysSurvived = GameState.day - 1;
    const prev = this.loadBest();
    const newBest = !prev || daysSurvived > prev.days || (daysSurvived === prev.days && GameState.totalFired > prev.fired);
    if (newBest) this.saveBest({ days: daysSurvived, fired: GameState.totalFired });
    this.time.delayedCall(1800, () => {
      this.ui.showGameOver({
        lines: [
          ["Employee", "You (Executive, Top Earner)"],
          ["Last day", `Day ${GameState.day}`],
          ["Days survived", String(daysSurvived)],
          ["Coworkers fired", String(GameState.totalFired)],
          ["Upgrades", String(Object.values(GameState.stacks).reduce((a, b) => a + b, 0))],
          ["Reason", pick(["Budget cuts", "Restructuring", "Culture fit", "Synergy realignment", "Went over budget"])]
        ],
        best: prev ? `Best: ${prev.days} day${prev.days === 1 ? "" : "s"}, ${prev.fired} fired` : "",
        newBest
      }, () => {
        this.ui.closeScreen("gameover");
        this.audio.play("click", { vol: 0.6 });
        this.startRun();
      }, () => {
        this.ui.closeScreen("gameover");
        this.enterTitle();
      });
      if (newBest) this.audio.voice("new_highscore", 0.8);
    });
  }

  private loadBest(): { days: number; fired: number } | null {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? "null"); } catch { return null; }
  }
  private saveBest(b: { days: number; fired: number }) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* ignore */ }
  }

  // ================================================================ interaction
  private handleInteraction(dt: number) {
    const p = this.player;
    const near = p.rolling > 0 ? null : this.stations.nearest(p.x, p.y);
    if (!near) {
      this.interactTarget = null;
      this.interactProgress = 0;
      this.ui.setPrompt(null);
    } else {
      if (this.interactTarget !== near.station) {
        this.interactTarget = near.station;
        this.interactProgress = 0;
      }
      if (this.keys.E.isDown && p.stun <= 0) {
        this.interactProgress += dt / Math.max(0.05, near.action.hold);
        this.interactTick -= dt;
        if (this.interactTick <= 0) {
          this.interactTick = 0.22;
          this.audio.play(near.station.def.kind === "copier" || near.station.def.kind === "server" || near.station.def.kind === "emails" ? "computer" : "click", { vol: 0.18, minGap: 150 });
        }
        if (this.interactProgress >= 1) {
          this.interactProgress = 0;
          near.action.run();
          if (near.action.kind !== "chore") this.audio.play("confirm", { vol: 0.35 });
        }
      } else {
        this.interactProgress = Math.max(0, this.interactProgress - dt * 3);
      }
      const s = near.station;
      const sx = ((s.box.x0 + s.box.x1) / 2 - this.cameras.main.worldView.x) * this.cameras.main.zoom;
      const sy = (s.box.y0 - 22 - this.cameras.main.worldView.y) * this.cameras.main.zoom;
      this.ui.setPrompt({ x: sx, y: sy, label: near.action.label, kind: near.action.kind, progress: this.interactProgress });
    }
    if (this.pressed.has("KeyF") && p.shredBag > 0) {
      p.toggleDropPaper();
      this.audio.play("switch", { vol: 0.4 });
    }
  }

  // ================================================================ combat API
  spawnEnemy(type: EnemyType, x: number, y: number, mode: "npc" | "hostile" | "ally") {
    const e = new Enemy(this, type, x, y, mode);
    this.enemies.push(e);
    return e;
  }

  removeEnemy(e: Enemy) {
    e.dead = true;
    e.destroy();
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  nearestEnemy(x: number, y: number, maxDist: number, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead || !e.hostile || exclude?.has(e.id)) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  canBark() {
    if (this.barkCd > 0) return false;
    this.barkCd = 1.3;
    return true;
  }

  matAt(x: number, y: number): Mat {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return Mat.NONE;
    return this.map.mats[ty * MAP_W + tx] as Mat;
  }

  hitEnemy(e: Enemy, dmg: number, info: HitInfo): boolean {
    if (e.dead) return false;
    const st = GameState.stats;
    const fromPlayer = PLAYER_SOURCES.has(info.kind);
    let crit = false;
    if (fromPlayer && !info.noCrit && info.kind !== "laser" && info.kind !== "chain" && Math.random() < st.critChance) {
      dmg *= 2.5;
      crit = true;
    }
    if (fromPlayer) dmg *= this.dayDamageBuff;
    const killed = e.takeDamage(dmg, info.angle, info.knock * st.knockbackMult);
    if (fromPlayer && (info.kind === "staple" || info.kind === "coffee" || info.kind === "shard")) GameState.dayStats.hits++;
    if (!info.silent) {
      this.fx.text(e.x + rand(-12, 12), e.y - e.r - 12, String(Math.max(1, Math.round(dmg))), {
        size: crit ? 24 : 15, color: crit ? "#ffcf3f" : "#ffffff", dur: crit ? 0.8 : 0.5, rise: 80, pop: crit
      });
      if (info.kind !== "laser") this.fx.spray("confetti", e.x, e.y, crit ? 7 : 3, info.angle, 45);
      this.audio.play("hit", { vol: crit ? 0.45 : 0.28, minGap: 45, rate: crit ? 0.8 : 1 });
      if (crit) this.fx.burst("star", e.x, e.y, 6, 0xffcf3f);
    }
    if (fromPlayer && info.kind !== "chain" && info.kind !== "explosion" && info.kind !== "nuke") {
      if (st.ignite > 0) {
        e.burn = Math.max(e.burn, 2.5);
        e.burnDps = Math.max(e.burnDps, 11 * st.ignite * st.dmgMult);
      }
      if (info.kind === "coffee") {
        e.burn = Math.max(e.burn, 1.6);
        e.burnDps = Math.max(e.burnDps, 7 * st.dmgMult);
        if (st.coldBrew) e.slow = 2.4;
      }
      if (st.chain > 0 && !info.noChain) this.chainLightning(e, dmg * 0.5, st.chain);
    }
    if (killed && !e.dead) {
      this.killEnemy(e, fromPlayer);
      return true;
    }
    return killed;
  }

  private chainLightning(from: Enemy, dmg: number, count: number) {
    const hit = new Set<number>([from.id]);
    let cur: { x: number; y: number } = from;
    for (let k = 0; k < count; k++) {
      const next = this.nearestEnemy(cur.x, cur.y, 240, hit);
      if (!next) break;
      hit.add(next.id);
      const pts: number[] = [cur.x, cur.y];
      const segs = 6;
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        pts.push(lerp(cur.x, next.x, t) + rand(-12, 12), lerp(cur.y, next.y, t) + rand(-12, 12));
      }
      pts.push(next.x, next.y);
      this.chainLines.push({ pts, life: 0.14 });
      this.hitEnemy(next, dmg, { angle: Math.atan2(next.y - cur.y, next.x - cur.x), kind: "chain", x: next.x, y: next.y, knock: 40, noChain: true });
      cur = next;
    }
    if (hit.size > 1) this.audio.play("zap", { vol: 0.25, minGap: 90 });
  }

  killEnemy(e: Enemy, byPlayer: boolean) {
    if (e.dead) return;
    const wasAlly = e.ally;
    const x = e.x, y = e.y;
    this.removeEnemy(e);
    if (wasAlly) return;
    const st = GameState.stats;
    this.fired++;
    GameState.totalFired++;
    GameState.dayStats.fired++;

    const boss = e.def.boss;
    this.fx.text(x, y - 36, boss ? "THE CONSULTANT HAS BEEN LET GO" : pick(FIRED_WORDS), { color: "#ff3b55", size: boss ? 30 : 22, pop: true, dur: boss ? 2.2 : 1.0, rise: 50 });
    this.fx.burst("confetti", x, y, boss ? 60 : 16);
    this.fx.burst("pixel", x, y, 8, 0xf3eedf);
    this.fx.decal(x + rand(-6, 6), y + 10, "furn_belongings", { scale: boss ? 1.6 : 0.95, rot: rand(-0.4, 0.4) });
    this.audio.play("coins", { vol: 0.28, minGap: 60 });
    this.audio.play("hit_heavy", { vol: 0.35, minGap: 50 });
    this.fx.stop(boss ? 220 : 32);
    this.fx.shake(boss ? 1 : 0.07);
    if (boss) {
      this.explosion(x, y, 240, 150, { friendly: true });
      this.fx.slowmo(0.25, 1.4);
      this.ui.flash("#ffcf3f", 500, 0.6);
      this.audio.voice("winner", 0.9);
      for (let k = 0; k < 4; k++) this.pickups.spawn(k === 0 ? "pizza" : "donut", x, y);
    }

    // combo
    this.combo++;
    this.comboTimer = 2.6;
    GameState.dayStats.bestCombo = Math.max(GameState.dayStats.bestCombo, this.combo);
    if (this.combo >= 2) this.ui.setCombo(this.combo, COMBO_WORDS[Math.min(this.combo, COMBO_WORDS.length - 1)]);
    if (this.combo === 4 && !this.comboVoiced) { this.comboVoiced = true; this.audio.voice("multi_kill", 0.8); }
    if (this.combo === 8) this.audio.voice("combo", 0.8);
    if (st.bulletTime && this.combo === 5 && this.bulletTimeCd <= 0) {
      this.bulletTimeCd = 12;
      this.fx.slowmo(0.45, 1.6);
      this.fx.text(this.player.x, this.player.y - 50, "CRUNCH MODE", { color: "#c77dff", size: 22, pop: true });
    }

    // drops (hazard kills count: the player set the trap)
    void byPlayer;
    {
      if (chance(st.donutChance)) this.pickups.spawn("donut", x, y);
      else if (GameState.unlocked.coffee && chance(0.06)) this.pickups.spawn("coffee", x, y);
      else if (chance(0.035)) this.pickups.spawn(GameState.unlocked.laser ? "soda" : "candy", x, y);
      else if (chance(0.01)) this.pickups.spawn("pizza", x, y);
      if (st.coldBrew) this.player.cups = Math.min(this.player.maxCups, this.player.cups + 1);
    }

    // perks that trigger on kills
    if (e.def.burnout) {
      this.hazards.igniteRadius(x, y, 110, 2.2);
      this.fx.burst("fire", x, y, 20);
      this.fx.text(x, y - 60, "BURNED OUT", { color: "#ff9a4a", size: 16 });
    }
    if (st.severance > 0) {
      this.time.delayedCall(90, () => this.explosion(x, y, 90 + st.severance * 25, 28 * st.severance * st.dmgMult, { friendly: true, small: true }));
    }
    if (st.interns > 0) {
      this.killsForIntern++;
      if (this.killsForIntern >= (st.interns >= 2 ? 6 : 8)) {
        this.killsForIntern = 0;
        const a = this.spawnEnemy("intern", x, y, "ally");
        a.makeAlly(st.interns >= 2 ? 22 : 15);
        this.fx.text(x, y - 50, "INTERN RECRUITED!", { color: "#9dffb0", size: 17, pop: true });
        this.audio.play("upgrade", { vol: 0.5 });
      }
    }
    if (st.nuke) {
      this.killsForNuke++;
      if (this.killsForNuke >= 12) {
        this.killsForNuke = 0;
        this.marketCrash();
      }
    }
  }

  private marketCrash() {
    const p = this.player;
    this.fx.text(p.x, p.y - 60, "MARKET CRASH!", { color: "#ffcf3f", size: 30, pop: true, dur: 1.4 });
    this.audio.play("boom", { vol: 0.8 });
    this.fx.shake(0.8);
    this.ui.flash("#ffcf3f", 300, 0.45);
    const ring = this.add.circle(p.x, p.y, 20).setStrokeStyle(10, 0xffcf3f, 0.9).setDepth(DEPTH.FX);
    this.tweens.add({ targets: ring, radius: 560, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
    for (const e of [...this.enemies]) {
      if (!e.hostile || e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 560) this.hitEnemy(e, 70 * GameState.stats.dmgMult, { angle: Math.atan2(e.y - p.y, e.x - p.x), kind: "nuke", x: e.x, y: e.y, knock: 520 });
    }
  }

  explosion(x: number, y: number, radius: number, dmg: number, opts: { friendly: boolean; small?: boolean; skip?: Enemy; fromCopier?: boolean }) {
    const hm = GameState.stats.hazardMult;
    const small = !!opts.small;
    this.fx.light(x, y, 0xffa040, radius / 26, small ? 0.18 : 0.35);
    this.fx.burst("fire", x, y, small ? 8 : 30);
    this.fx.burst("ember", x, y, small ? 4 : 18);
    this.fx.burst("smoke", x, y, small ? 2 : 10);
    this.fx.burst("spark", x, y, small ? 6 : 20, 0xffc070);
    this.fx.decal(x, y, "fx_scorch_02", { scale: radius / 300, alpha: 0.6, tint: 0x111111 });
    if (small) this.audio.play("pop", { vol: 0.28, minGap: 50 });
    else { this.audio.play("boom", { vol: 0.85 }); this.audio.play("crunch", { vol: 0.6 }); }
    this.fx.shake(small ? 0.1 : 0.75);
    if (!small) this.fx.stop(70);
    const d2max = radius * radius;
    for (const e of [...this.enemies]) {
      if (e.dead || e === opts.skip || e.ally) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 > d2max) continue;
      const f = 1 - 0.5 * Math.sqrt(d2) / radius;
      this.hitEnemy(e, dmg * f * (opts.fromCopier ? hm : 1), { angle: Math.atan2(e.y - y, e.x - x), kind: "explosion", x: e.x, y: e.y, knock: small ? 160 : 420, silent: small });
    }
    if (!opts.friendly) {
      const p = this.player;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < (radius * 0.6) ** 2) p.damage(2, x, y, "explosion");
    }
    this.hazards.igniteRadius(x, y, radius * 0.6, small ? 0 : 1.2);
    // Shatter nearby glass and rattle barricades / other explosive copiers.
    const r = Math.ceil(radius / TILE);
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - r; ty <= cy + r; ty++) for (let tx = cx - r; tx <= cx + r; tx++) {
      if (this.world.tile(tx, ty) !== Tile.GLASS) continue;
      if (((tx + 0.5) * TILE - x) ** 2 + ((ty + 0.5) * TILE - y) ** 2 < d2max) this.damageGlass(tx, ty, small ? 1 : 3);
    }
    if (!small) {
      for (const b of [...this.stations.barricades]) {
        if ((b.door.x - x) ** 2 + (b.door.y - y) ** 2 < d2max) this.stations.damageBarricade(b, 80);
      }
      for (const s of this.stations.list) {
        if (s.hot && !s.wrecked && (s.x - x) ** 2 + (s.y - y) ** 2 < d2max * 1.2) this.time.delayedCall(160, () => this.stations.detonate(s));
      }
    }
    for (const c of this.chairs) {
      const dx = c.x - x, dy = c.y - y;
      const d = Math.hypot(dx, dy);
      if (d < radius) {
        const f = (1 - d / radius) * (small ? 300 : 900);
        c.vx += (dx / (d || 1)) * f;
        c.vy += (dy / (d || 1)) * f;
        c.spin += rand(-14, 14);
      }
    }
  }

  damageGlass(tx: number, ty: number, amount: number) {
    const i = ty * MAP_W + tx;
    const broke = this.world.damageGlass(tx, ty, amount);
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (broke) {
      this.wallLayer.removeTileAt(tx, ty);
      this.fx.burst("glass", x, y, 26);
      this.fx.decal(x, y + 6, "glass_shards", { scale: 1.1, alpha: 0.9 });
      this.audio.play("glass", { vol: 0.6, minGap: 60 });
      this.glassChip.delete(i);
      this.ui.initMinimap(this.map, this.world);
      this.flowTile = -1;
    } else {
      this.fx.burst("glass", x, y, 4);
      this.audio.play("ping", { vol: 0.15, rate: 1.6, minGap: 80 });
    }
  }

  onColliderShot(c: Collider, dmg: number, friendly: boolean, x: number, y: number) {
    if (c.kind === "barricade") {
      if (!friendly) this.stations.damageBarricade(c.ref as Barricade, dmg * 6);
      else this.fx.burst("pixel", x, y, 3, 0xc8955b);
      return;
    }
    const f = c.ref as FurnObj | undefined;
    if (!f) return;
    const st = this.stations.list.find((s) => s.furn === f);
    if (st && st.def.kind === "copier") {
      this.stations.copierShot(st, friendly ? dmg : dmg * 4);
      return;
    }
    if (friendly && chance(0.3)) this.fx.burst("pixel", x, y, 3, 0xd8d2c4);
  }

  barricadeNear(x: number, y: number, r: number): Barricade | null {
    for (const b of this.stations.barricades) {
      const cx = clamp(x, b.collider.x0, b.collider.x1), cy = clamp(y, b.collider.y0, b.collider.y1);
      if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return b;
    }
    return null;
  }

  damageBarricade(b: Barricade, dmg: number) {
    this.stations.damageBarricade(b, dmg);
  }

  onPlayerHurt() {
    const st = GameState.stats;
    if (st.bulletTime && GameState.hp <= 2 && GameState.hp > 0 && this.bulletTimeCd <= 0) {
      this.bulletTimeCd = 20;
      this.fx.slowmo(0.4, 3);
      this.fx.text(this.player.x, this.player.y - 50, "CRUNCH MODE", { color: "#c77dff", size: 22, pop: true });
      this.audio.play("blink", { vol: 0.6 });
    }
    this.combo = 0;
    this.comboTimer = 0;
    this.ui.setCombo(0, "");
  }

  onRevive() {
    const p = this.player;
    this.fx.text(p.x, p.y - 60, "GOLDEN PARACHUTE!", { color: "#ffcf3f", size: 28, pop: true, dur: 2 });
    this.ui.flash("#ffcf3f", 600, 0.7);
    this.fx.slowmo(0.3, 1.2);
    this.audio.voice("level_up", 0.9);
    this.audio.play("upgrade", { vol: 0.7 });
    for (const e of [...this.enemies]) {
      if (!e.hostile || e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 320) this.hitEnemy(e, 60, { angle: Math.atan2(e.y - p.y, e.x - p.x), kind: "nuke", x: e.x, y: e.y, knock: 600 });
    }
  }

  bossIncoming() {
    this.ui.banner("THE CONSULTANT", "has been brought in to 'optimize headcount'", "#ffcf3f", 3);
    this.audio.play("alert", { vol: 0.8 });
    this.audio.voice("final_round", 0.9);
    this.fx.shake(0.5);
  }

  // ================================================================ laser
  fireLaser(x: number, y: number, angle: number, dt: number) {
    const st = GameState.stats;
    const dps = 78 * st.dmgMult * st.laserMult;
    const offsets = [0];
    for (let k = 1; k <= st.multishot; k++) offsets.push(k % 2 ? 0.09 * Math.ceil(k / 2) : -0.09 * Math.ceil(k / 2));
    this.laserSfx -= dt;
    if (this.laserSfx <= 0) { this.laserSfx = 0.16; this.audio.play("laser", { vol: 0.16, rate: 1.4, jitter: 0.05, minGap: 100 }); }
    for (const off of offsets) {
      const mult = off === 0 ? 1 : 0.5;
      let ox = x, oy = y, a = angle + off, remaining = 1150, bounces = st.bounces, pierce = st.pierce;
      const segs: number[][] = [];
      while (remaining > 4) {
        const ray = this.world.raycast(ox, oy, a, remaining, 8);
        let ex = ray.x, ey = ray.y;
        let stopped = false;
        const ca = Math.cos(a), sa = Math.sin(a);
        const hits: { e: Enemy; t: number }[] = [];
        for (const e of this.enemies) {
          if (e.dead || !e.hostile) continue;
          const rx = e.x - ox, ry = e.y - oy;
          const t = rx * ca + ry * sa;
          if (t < 0 || t > ray.dist) continue;
          const perp = Math.abs(rx * sa - ry * ca);
          if (perp < e.r + 5) hits.push({ e, t });
        }
        hits.sort((p, q) => p.t - q.t);
        for (const h of hits) {
          if (h.e.blocksShot(a)) {
            ex = ox + ca * h.t; ey = oy + sa * h.t; stopped = true;
            if (chance(0.3)) this.fx.burst("spark", ex, ey, 2, 0xffffff);
            break;
          }
          this.laserDamage(h.e, dps * mult * dt, a);
          if (pierce-- <= 0) { ex = ox + ca * h.t; ey = oy + sa * h.t; stopped = true; break; }
        }
        segs.push([ox, oy, ex, ey]);
        const len = Math.hypot(ex - ox, ey - oy);
        for (let d = 20; d < len; d += 36) this.hazards.igniteAt(ox + ca * d, oy + sa * d);
        if (stopped) break;
        if (ray.hit) {
          this.laserHitSolid(ray.hit, ray.x, ray.y, dt);
          if (bounces > 0) {
            bounces--;
            const px = ray.x - ca * 2, py = ray.y - sa * 2;
            const r = this.world.reflect(px, py, ca * 6, sa * 6, 1);
            a = Math.atan2(r.vy, r.vx);
            remaining -= ray.dist;
            ox = px; oy = py;
            continue;
          }
          if (chance(0.5)) this.fx.burst("spark", ray.x, ray.y, 2, 0xff6070);
        }
        break;
      }
      this.drawLaser(segs, mult);
    }
  }

  private laserDamage(e: Enemy, amount: number, angle: number) {
    const acc = (this.laserTick.get(e.id) ?? 0) + amount;
    e.burn = Math.max(e.burn, 1.2);
    e.burnDps = Math.max(e.burnDps, 9 * GameState.stats.dmgMult);
    if (acc >= 9) {
      this.laserTick.set(e.id, 0);
      this.hitEnemy(e, acc, { angle, kind: "laser", x: e.x, y: e.y, knock: 25, noChain: Math.random() > 0.25 });
    } else this.laserTick.set(e.id, acc);
  }

  private laserHitSolid(hit: ShotHit, x: number, y: number, dt: number) {
    if (hit.type === "tile" && hit.tile === Tile.GLASS) {
      const i = hit.ty! * MAP_W + hit.tx!;
      const chip = (this.glassChip.get(i) ?? 0) + dt;
      if (chip > 0.35) { this.glassChip.set(i, 0); this.damageGlass(hit.tx!, hit.ty!, 1); } else this.glassChip.set(i, chip);
    } else if (hit.type === "collider" && hit.collider) {
      const f = hit.collider.ref as FurnObj | undefined;
      const st = f ? this.stations.list.find((s) => s.furn === f) : undefined;
      if (st && st.def.kind === "copier") this.stations.copierShot(st, 60 * dt);
    }
    void x; void y;
  }

  private drawLaser(segs: number[][], mult: number) {
    const g = this.laserGfx;
    for (const [x0, y0, x1, y1] of segs) {
      g.lineStyle(12 * mult, 0xff1030, 0.16).lineBetween(x0, y0, x1, y1);
      g.lineStyle(5 * mult, 0xff3050, 0.5).lineBetween(x0, y0, x1, y1);
      g.lineStyle(2, 0xffe0e6, 0.95).lineBetween(x0, y0, x1, y1);
    }
    const last = segs[segs.length - 1];
    if (last) {
      g.fillStyle(0xff3050, 0.5).fillCircle(last[2], last[3], 9 * mult);
      g.fillStyle(0xffffff, 0.9).fillCircle(last[2], last[3], 3.5);
    }
  }

  // ================================================================ per-frame helpers
  private updateOrbiters(dt: number) {
    const n = this.phase === "downsizing" ? GameState.stats.orbiters : 0;
    while (this.orbiters.length < n) this.orbiters.push(this.add.image(0, 0, "p_ball").setDepth(DEPTH.PROJECTILE - 1));
    while (this.orbiters.length > n) this.orbiters.pop()!.destroy();
    if (!n) return;
    this.orbitAngle += dt * 3.6;
    const p = this.player;
    const now = this.time.now;
    for (let k = 0; k < n; k++) {
      const a = this.orbitAngle + (k / n) * Math.PI * 2;
      const ox = p.x + Math.cos(a) * 78, oy = p.y + Math.sin(a) * 78;
      this.orbiters[k].setPosition(ox, oy);
      for (const e of this.enemies) {
        if (e.dead || !e.hostile) continue;
        if ((e.x - ox) ** 2 + (e.y - oy) ** 2 > (e.r + 12) ** 2) continue;
        const key = e.id * 16 + k;
        if ((this.orbitHit.get(key) ?? 0) > now) continue;
        this.orbitHit.set(key, now + 320);
        this.hitEnemy(e, 15 * GameState.stats.dmgMult, { angle: a + Math.PI / 2, kind: "orbit", x: ox, y: oy, knock: 220 });
        this.audio.play("ping", { vol: 0.2, rate: 1.2, minGap: 60 });
      }
    }
  }

  private updateChairs(dt: number) {
    const movers: { x: number; y: number; vx: number; vy: number; r: number }[] = [this.player];
    for (const e of this.enemies) if (!e.dead && e.mode !== "npc") movers.push(e);
    for (const c of this.chairs) {
      for (const m of movers) {
        const dx = c.x - m.x, dy = c.y - m.y;
        const rr = m.r + 15;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const push = rr - d;
        c.x += (dx / d) * push;
        c.y += (dy / d) * push;
        const transfer = m === this.player && this.player.rolling > 0 ? 1.15 : 0.5;
        c.vx += (dx / d) * 60 + m.vx * transfer;
        c.vy += (dy / d) * 60 + m.vy * transfer;
        c.spin += rand(-1, 1) * Math.hypot(m.vx, m.vy) * 0.02;
      }
      const sp = Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.spin);
      if (sp < 0.5) continue;
      // Office-chair bowling: fast chairs bowl coworkers over.
      const speed = Math.hypot(c.vx, c.vy);
      if (speed > 300 && this.phase === "downsizing") {
        for (const e of [...this.enemies]) {
          if (e.dead || !e.hostile) continue;
          if ((e.x - c.x) ** 2 + (e.y - c.y) ** 2 > (e.r + 17) ** 2) continue;
          const ang = Math.atan2(c.vy, c.vx);
          e.stun = Math.max(e.stun, 0.7);
          this.fx.text(e.x, e.y - 40, "STRIKE!", { color: "#4fd1ff", size: 16, pop: true, dur: 0.7 });
          this.audio.play("hit_heavy", { vol: 0.45, minGap: 60 });
          this.hitEnemy(e, (8 + speed * 0.03) * GameState.stats.dmgMult, { angle: ang, kind: "chair", x: e.x, y: e.y, knock: speed * 0.8 });
          c.vx *= 0.45; c.vy *= 0.45;
          c.spin += rand(-10, 10);
          break;
        }
      }
      const pos = { x: c.x, y: c.y };
      this.world.moveCircle(pos, 13, c.vx * dt, c.vy * dt);
      if (Math.abs(pos.x - c.x - c.vx * dt) > 0.5) c.vx *= -0.4;
      if (Math.abs(pos.y - c.y - c.vy * dt) > 0.5) c.vy *= -0.4;
      c.x = pos.x;
      c.y = pos.y;
      const fr = Math.pow(0.06, dt);
      c.vx *= fr;
      c.vy *= fr;
      c.spin *= Math.pow(0.15, dt);
      c.rot += c.spin * dt;
      const quarter = Math.round(c.rot / (Math.PI / 2));
      const deg = ((quarter % 4) + 4) % 4 * 90;
      const key = `furn_${c.base}_${deg}`;
      if (c.sprite.texture.key !== key && this.textures.exists(key)) c.sprite.setTexture(key);
      c.sprite.setPosition(c.x, c.y).setRotation(c.rot - quarter * (Math.PI / 2)).setDepth(c.y - 2);
    }
  }

  private updateCamera(dt: number, aimX: number, aimY: number) {
    const cam = this.cameras.main;
    let tx: number, ty: number;
    if (this.phase === "title") {
      this.titleT += dt;
      tx = WORLD_W / 2 + Math.sin(this.titleT * 0.07) * WORLD_W * 0.32;
      ty = WORLD_H / 2 + Math.sin(this.titleT * 0.11) * WORLD_H * 0.28;
      this.camX = damp(this.camX, tx, 0.6, dt);
      this.camY = damp(this.camY, ty, 0.6, dt);
    } else {
      const p = this.player;
      const look = this.phase === "downsizing" ? 0.24 : 0.12;
      const lx = clamp((aimX - p.x) * look, -230, 230), ly = clamp((aimY - p.y) * look, -170, 170);
      tx = p.x + lx;
      ty = p.y + ly;
      this.camX = damp(this.camX, tx, 7, dt);
      this.camY = damp(this.camY, ty, 7, dt);
    }
    cam.centerOn(this.camX + this.fx.shakeX, this.camY + this.fx.shakeY);
  }

  private updateLighting(dt: number) {
    this.lightPhase += dt;
    let c = 0xffffff;
    let red = 0;
    let torch = 0;
    switch (this.phase) {
      case "title": c = 0xe2e5f2; break;
      case "crunch": case "review": {
        const k = clamp(1 - this.crunchLeft / this.crunchTotal, 0, 1);
        c = Phaser.Display.Color.GetColor(255, Math.round(lerp(255, 222, k)), Math.round(lerp(255, 190, k)));
        break;
      }
      case "announce": {
        const flick = Math.sin(this.lightPhase * 38) > 0.3 || this.lightPhase > 2.4;
        c = flick ? 0x7a3a46 : 0x2a2a38;
        red = this.lightPhase > 2.4 ? 0.1 + 0.08 * Math.sin(this.lightPhase * 6) : 0;
        break;
      }
      case "downsizing": case "dayclear": case "gameover": case "results":
        c = 0xaeb0d4;
        red = 0.04 + 0.03 * Math.sin(this.lightPhase * 3.2);
        torch = 0.16;
        break;
    }
    // Overlays exactly cover the visible world (cheap on fill-rate).
    const wv = this.cameras.main.worldView;
    this.dimRect.setPosition(wv.x - 40, wv.y - 40).setSize(wv.width + 80, wv.height + 80);
    this.dimRect.fillColor = c;
    this.dimRect.setVisible(c !== 0xffffff);
    this.redRect.setPosition(wv.x - 40, wv.y - 40).setSize(wv.width + 80, wv.height + 80);
    this.redRect.setFillStyle(0xff1020, red).setVisible(red > 0.004);
    this.flashlight.setAlpha(torch).setPosition(this.player.x, this.player.y);
  }

  private updateHud(dt: number) {
    const p = this.player;
    const st = GameState.stats;
    this.ui.setDay(GameState.day, GameState.bank);
    this.ui.setHearts(GameState.hp, st.maxHp, p.tempHp);
    this.ui.setWeapons({
      armed: p.armed, active: p.weapon, coffee: GameState.unlocked.coffee, laser: GameState.unlocked.laser,
      mag: p.mag, maxMag: p.maxMag, reloading: p.reloading > 0, cups: p.cups, maxCups: p.maxCups, battery: p.battery, maxBattery: p.maxBattery
    });
    this.ui.setDodge(p.dodgeCharges, st.dodgeCharges);
    this.ui.setPerks(GameState.stacks);
    this.ui.setBag(p.shredBag, p.dropPaper);
    if (this.phase === "crunch") {
      this.ui.setClock(formatClock(Math.max(0, this.crunchLeft), this.crunchTotal), Math.max(0, this.crunchLeft), this.crunchLeft < 20);
      const items = this.dayCfg.chores.map((c) => ({ label: CHORE_INFO[c].label, room: CHORE_INFO[c].room, done: this.choresDone.has(c) }));
      const opt: string[] = [];
      if (!GameState.unlocked.coffee && !this.dayCfg.chores.includes("coffee")) opt.push("Fix the coffee machine to unlock Hot Coffee");
      if (!GameState.unlocked.laser && !this.dayCfg.chores.includes("presentation")) opt.push("Optional: prep the board deck (Conference Room) to unlock the Laser Pointer");
      this.ui.setChores(items, opt.join("<br>"));
      this.ui.setClockout(this.allChoresDone(), this.crunchLeft);
    }
    if (this.phase === "downsizing") this.ui.setQuota(this.fired, this.quota);

    this.arrowTimer -= dt;
    if (this.arrowTimer <= 0) {
      this.arrowTimer = 1 / 30;
      this.ui.setArrows(this.computeArrows());
    }
    this.mmTimer -= dt;
    if (this.mmTimer <= 0) {
      this.mmTimer = 0.1;
      const dots: { x: number; y: number; color: string; r: number }[] = [];
      if (this.phase === "crunch") {
        for (const s of this.stations.list) {
          const chore = s.marker && s.marker.visible;
          if (chore) dots.push({ x: s.x, y: s.y, color: "#ffd75a", r: 3.2 });
        }
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        dots.push({ x: e.x, y: e.y, color: e.ally ? "#52d17c" : e.hostile ? (e.def.boss ? "#ffcf3f" : "#ff3b55") : "#8b95a7", r: e.def.boss ? 4 : 2 });
      }
      dots.push({ x: p.x, y: p.y, color: "#ffffff", r: 3.5 });
      this.ui.drawMinimap(dots);
    }
  }

  private computeArrows(): ArrowMark[] {
    const cam = this.cameras.main;
    const wv = cam.worldView;
    const z = cam.zoom;
    const W = this.scale.width, H = this.scale.height;
    const out: ArrowMark[] = [];
    const add = (x: number, y: number, color: string, icon?: string) => {
      if (x > wv.x + 30 && x < wv.right - 30 && y > wv.y + 30 && y < wv.bottom - 30) return;
      const sx = (x - wv.x) * z, sy = (y - wv.y) * z;
      const cx = W / 2, cy = H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const rx = W * 0.3, ry = H * 0.3;
      out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, angle: a, color, icon });
    };
    if (this.phase === "crunch") {
      for (const s of this.stations.list) if (s.marker && s.marker.visible) add(s.x, s.y, "#ffd75a", "exclamation");
    } else if (this.phase === "downsizing") {
      const p = this.player;
      const list = this.enemies.filter((e) => e.hostile && !e.dead)
        .sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2)).slice(0, 10);
      for (const e of list) add(e.x, e.y, e.def.boss ? "#ffcf3f" : "#ff3b55", e.def.boss ? "skull" : undefined);
    }
    return out;
  }

  private readInput(): PlayerInput {
    const k = this.keys;
    const P = (c: string) => this.pressed.has(c);
    const ptr = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const inp: PlayerInput = {
      mx: (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      my: (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0),
      aimX: wp.x,
      aimY: wp.y,
      fire: ptr.leftButtonDown() && !this.paused,
      dodge: P("Space") || P("ShiftLeft") || P("ShiftRight") || this.rmb,
      reload: P("KeyR"),
      switchTo: P("Digit1") ? 0 : P("Digit2") ? 1 : P("Digit3") ? 2 : null,
      cycle: P("KeyQ") ? 1 : this.wheel
    };
    this.rmb = false;
    this.wheel = 0;
    return inp;
  }

  private togglePause() {
    if (!["crunch", "downsizing", "announce"].includes(this.phase)) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.sound.pauseAll();
      this.tweens.pauseAll();
      this.time.paused = true;
      this.ui.showPause({ music: this.audio.musicVolume, sfx: this.audio.sfxVolume, muted: this.audio.muted }, {
        resume: () => this.togglePause(),
        music: (v) => { this.audio.musicVolume = v; this.audio.applyVolumes(); this.audio.saveSettings(); },
        sfx: (v) => { this.audio.sfxVolume = v; this.audio.saveSettings(); },
        mute: () => { this.audio.toggleMute(); this.ui.closeScreen("pause"); this.paused = false; this.togglePause(); },
        quit: () => {
          this.ui.closeScreen("pause");
          this.paused = false;
          this.time.paused = false;
          this.tweens.resumeAll();
          this.sound.resumeAll();
          for (const t of this.announceTimers) t.remove(false);
          this.announceTimers = [];
          this.ui.closeScreen("announce");
          this.enterTitle();
        }
      });
    } else {
      this.ui.closeScreen("pause");
      this.sound.resumeAll();
      this.tweens.resumeAll();
      this.time.paused = false;
    }
  }

  private debugToFight() {
    if (this.phase === "title") { this.ui.closeScreen("title"); this.startRun(); }
    if (this.phase === "crunch") this.endCrunch(true);
    if (this.phase === "review") { this.ui.closeScreen("review"); this.startDownsizing(); }
    if (this.phase === "announce") this.startDownsizing();
  }

  // ================================================================ main loop
  perfMs = 0;
  /** Per-system frame cost (ms, smoothed) for profiling via __HT.prof(). */
  prof: Record<string, number> = {};
  private timed<T>(name: string, fn: () => T): T {
    const t = performance.now();
    const r = fn();
    this.prof[name] = (this.prof[name] ?? 0) * 0.95 + (performance.now() - t) * 0.05;
    return r;
  }

  update(_time: number, deltaMs: number) {
    const t0 = performance.now();
    try {
      this.step(deltaMs);
    } catch (err) {
      // Never let one bad frame freeze the whole game.
      console.error("frame error", err);
    }
    this.perfMs = this.perfMs * 0.95 + (performance.now() - t0) * 0.05;
  }

  private step(deltaMs: number) {
    const realDt = Math.min(deltaMs / 1000, 0.05);
    if (this.pressed.has("Escape") || this.pressed.has("KeyP")) this.togglePause();
    if (this.pressed.has("KeyM")) { this.audio.toggleMute(); this.ui.toast(this.audio.muted ? "Muted" : "Sound on", "#8b95a7", 1.2); }
    if (this.phase === "announce" && this.pressed.has("Space")) this.skipAnnounce();
    if (this.paused) { this.pressed.clear(); return; }

    this.timed("fx", () => this.fx.update(realDt));
    const dt = this.fx.hitstop > 0 ? 0 : realDt * this.fx.timeScale;
    if (this.barkCd > 0) this.barkCd -= realDt;
    if (this.holsterToastCd > 0) this.holsterToastCd -= realDt;

    const inp = this.readInput();
    this.laserGfx.clear();

    // Flow fields follow the player.
    this.flowTimer -= dt;
    const ptile = Math.floor(this.player.y / TILE) * MAP_W + Math.floor(this.player.x / TILE);
    if (this.phase === "downsizing" && (this.flowTimer <= 0 || (ptile !== this.flowTile && this.flowTimer < 0.28))) {
      this.flowTimer = 0.4;
      this.flowTile = ptile;
      this.timed("flow", () => {
        this.flowNaive.compute(this.player.x, this.player.y);
        this.flowSmart.compute(this.player.x, this.player.y);
      });
    }

    switch (this.phase) {
      case "title":
        break;
      case "crunch":
        this.updateCrunch(dt, inp);
        break;
      case "downsizing":
        this.timed("downsizing", () => this.updateDownsizing(dt, inp));
        break;
      case "dayclear":
        this.player.update(dt, { ...inp, fire: false, dodge: false });
        break;
      default:
        break;
    }

    if (this.phase !== "review" && this.phase !== "results") {
      this.timed("enemies", () => { for (const e of [...this.enemies]) e.update(dt); });
      this.timed("projectiles", () => this.projectiles.update(dt));
      this.pickups.update(dt);
      this.timed("hazards", () => this.hazards.update(dt));
      this.timed("chairs", () => this.updateChairs(dt));
    }
    this.timed("stations", () => this.stations.update(dt));
    this.updateChainLines(realDt);
    if (this.phase !== "downsizing" && this.phase !== "crunch") this.ui.setPrompt(null);

    this.updateCamera(realDt, inp.aimX, inp.aimY);
    this.updateLighting(realDt);
    if (this.phase === "crunch" || this.phase === "downsizing" || this.phase === "dayclear") this.timed("hud", () => this.updateHud(realDt));
    else this.ui.setArrows([]);
    this.pressed.clear();
  }

  /** Too much fire trips the ceiling sprinklers: they douse the blaze... and flood the floor. */
  private updateSprinklers(dt: number) {
    if (this.sprinklerCd > 0) this.sprinklerCd -= dt;
    if (this.sprinklerT > 0) {
      this.sprinklerT -= dt;
      const wv = this.cameras.main.worldView;
      for (let k = 0; k < 6; k++) this.fx.burst("water", wv.x + rand(0, wv.width), wv.y + rand(0, wv.height), 1);
      // Each burning tile gets doused, leaving water behind.
      const hz = this.hazards;
      for (let i = 0; i < hz.fire.length; i++) {
        if (hz.fire[i] > 0 && chance(dt * 2.2)) {
          const x = (i % MAP_W + 0.5) * TILE, y = (Math.floor(i / MAP_W) + 0.5) * TILE;
          hz.flood(x, y, 3, 0.05);
        }
      }
      return;
    }
    if (this.sprinklerCd <= 0 && this.hazards.burningCount >= 18) {
      this.sprinklerCd = 30;
      this.sprinklerT = 4;
      this.ui.banner("SPRINKLERS ACTIVATED", "Fire's out. Floor's wet. Mind the power strips.", "#4fd1ff", 2.2);
      this.audio.play("alert", { vol: 0.6 });
      this.audio.play("splash", { vol: 0.5 });
      this.sprinklerAt = { x: this.player.x, y: this.player.y };
    }
  }

  private updateChainLines(dt: number) {
    const g = this.chainGfx;
    g.clear();
    for (let i = this.chainLines.length - 1; i >= 0; i--) {
      const l = this.chainLines[i];
      l.life -= dt;
      if (l.life <= 0) { this.chainLines.splice(i, 1); continue; }
      const a = l.life / 0.14;
      g.lineStyle(6, 0x4fd1ff, 0.25 * a);
      g.beginPath();
      g.moveTo(l.pts[0], l.pts[1]);
      for (let k = 2; k < l.pts.length; k += 2) g.lineTo(l.pts[k], l.pts[k + 1]);
      g.strokePath();
      g.lineStyle(2, 0xffffff, 0.9 * a);
      g.beginPath();
      g.moveTo(l.pts[0], l.pts[1]);
      for (let k = 2; k < l.pts.length; k += 2) g.lineTo(l.pts[k], l.pts[k + 1]);
      g.strokePath();
    }
  }
}
