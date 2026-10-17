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
import { Station, Stations } from "../systems/Stations";
import { Props } from "../world/Props";
import { Waves } from "../systems/Waves";
import { Player, PlayerInput } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { Projectiles } from "../entities/Projectiles";
import { Pickups } from "../entities/Pickups";
import { CHORE_INFO, ChoreId, DayConfig, dayConfig } from "../data/days";
import { BOSS_INFO, ENEMIES, EnemyType } from "../data/enemies";
import { buildOfficeSfx } from "../systems/OfficeSfx";
import { Speakers } from "../systems/Speakers";
import { Vision } from "../systems/Vision";
import { Vault } from "../systems/Vault";
import { COMBO_WORDS, FIRED_WORDS } from "../data/lines";
import { PERK_BY_ID } from "../data/perks";
import { PerkDef } from "../data/perks";
import { FLOOR_INDEX, WALL_INDEX } from "./BootScene";
import { ArrowMark, UI } from "../ui/UI";
import { MiniHandle, MiniSfx, openMini } from "../ui/Minigames";
import { WEAPONS, WEAPON_DEFS, WeaponId } from "../data/weapons";
import { angleDiff, chance, clamp, damp, formatClock, lerp, pick, rand, shuffle, weightedPick } from "../util/math";

export type Phase = "title" | "lore" | "brief" | "crunch" | "review" | "announce" | "downsizing" | "dayclear" | "results" | "memo" | "gameover";

/** Blast radius of the Cold Caller's desk phones. */
const PHONE_R = 105;

/** Shown once at the start of every run from the title screen. */
const LORE = [
  "You are the best employee this office has ever had.",
  "You are also the most expensive.",
  "This morning, management announced budget cuts.",
  "Your salary alone could pay for 10 of your coworkers. They've done the math.",
  "Do your chores. Survive 5 PM. Whatever happens, don't get fired."
];

/** What the night-before memo says when a coworker type shows up for the first time tomorrow. */
const NEW_TYPE_MEMO: Partial<Record<EnemyType, string>> = {
  robot: "AI robots join the payroll",
  hr: "HR Directors now carry riot shields",
  burnout: "vacations are cancelled (expect burnouts)",
  manager: "middle managers will micromanage you",
  fulltime: "full-timers are after your salary"
};

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
const PLAYER_SOURCES = new Set(["staple", "coffee", "shard", "laser", "orbit", "explosion", "ally", "chain", "nuke", "chair", "plane", "confetti", "drop", "slip", "toner", "keyboard", "deflect"]);
/** Shots that count toward the accuracy stat. */
const AIMED = new Set(["staple", "coffee", "shard", "plane", "slip", "confetti", "keyboard", "deflect"]);


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
  /** Bosses ignore drywall: they route straight through it and smash their way in. */
  flowBoss!: FlowField;
  ui!: UI;
  speakers!: Speakers;
  vision!: Vision;
  vault!: Vault;

  phase: Phase = "title";
  dayCfg: DayConfig = dayConfig(1);
  quota = 10;
  fired = 0;
  crunchLeft = 120;
  crunchTotal = 120;
  choresDone = new Set<ChoreId>();
  /** The mini-game each chore uses today (re-rolled every day so tasks never feel the same). */
  mini: MiniHandle | null = null;
  dayDamageBuff = 1;
  godMode = false;
  paused = false;

  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private keys!: Keys;
  private wheel = 0;
  private wheelAt = 0;
  private reviewGuns: { id: WeaponId; sold: boolean }[] = [];
  /** A gun bought at today's review: it's in your hand when the fight starts. */
  private newWeapon: WeaponId | null = null;
  props!: Props;
  private hearts: { x: number; y: number; life: number; sprite: Phaser.GameObjects.Image }[] = [];
  private vortices: { x: number; y: number; t: number; a: number }[] = [];
  private sprinklerFloods: { x: number; y: number; t: number; size: number }[] = [];
  private handshakeCount = 0;
  private miniZoomBase = 0;
  private briefing = false;
  private lmbPressed = false;
  private swings: { x: number; y: number; a: number; life: number }[] = [];
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
  /** Pyramid Scheme: firings today (each adds a little damage). */
  private dayKills = 0;
  private killsForPromotion = 0;
  private drones: { img: Phaser.GameObjects.Image; x: number; y: number; cd: number; bob: number }[] = [];
  private sprinklerT = 0;
  private sprinklerAt = { x: 0, y: 0 };
  /** Floor telegraphs (boss charge lanes, phone blast rings), redrawn every frame. */
  private teleGfx!: Phaser.GameObjects.Graphics;
  /** Desk phones ringing on the floor, about to go off. */
  private phoneBombs: { x: number; y: number; fuse: number; ring: number; img: Phaser.GameObjects.Image; owner: Enemy | null }[] = [];
  /** Furniture the Hatchet Man went straight through (put back overnight). */
  private wrecked: FurnObj[] = [];
  /** The camera looks here instead of at the boss (the PA speaker during the 5 PM announcement). */
  private camFocus: { x: number; y: number } | null = null;

  constructor() {
    super("Game");
  }

  // ================================================================ setup
  create() {
    this.map = buildOffice();
    this.world = new World(this.map);
    this.audio = new AudioManager(this);
    this.audio.addGroups(buildOfficeSfx(this));
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
    this.flowBoss = new FlowField(this.world, undefined, true);
    this.projectiles = new Projectiles(this);
    this.pickups = new Pickups(this);
    this.stations = new Stations(this);
    this.props = new Props(this, this.furniture, new Set(this.stations.list.map((s) => s.furn).filter((f): f is NonNullable<typeof f> => !!f)));
    this.waves = new Waves(this);
    this.player = new Player(this, this.map.playerSpawn.x, this.map.playerSpawn.y);
    this.speakers = new Speakers(this);
    this.vision = new Vision(this);
    this.vault = new Vault(this);
    this.teleGfx = this.add.graphics().setDepth(DEPTH.MARKER + 5);

    this.laserGfx = this.add.graphics().setDepth(DEPTH.PROJECTILE + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.chainGfx = this.add.graphics().setDepth(DEPTH.PROJECTILE + 3).setBlendMode(Phaser.BlendModes.ADD);
    this.hpGfx = this.add.graphics().setDepth(DEPTH.WORLD_UI - 2);
    this.dimRect = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setDepth(DEPTH.LIGHTING).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.redRect = this.add.rectangle(0, 0, 10, 10, 0xff1020, 0).setOrigin(0).setDepth(DEPTH.LIGHTING + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.flashlight = this.add.image(0, 0, "soft").setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.LIGHTING + 1).setTint(0xfff0d0).setAlpha(0).setScale(9);

    this.setupInput();
    const cam = this.cameras.main;
    cam.setBackgroundColor("#0b0c10");
    this.onResize();
    this.scale.on("resize", () => this.onResize());
    this.camX = this.player.x;
    this.camY = this.player.y;

    this.ui = new UI();
    this.ui.sfx = (s) => {
      if (s === "hover") this.audio.play("hover", { vol: 0.22, minGap: 40 });
      else if (s === "click") this.audio.play("click", { vol: 0.5 });
      else if (s === "deal") this.audio.play("slide", { vol: 0.35, jitter: 0.15, minGap: 50 });
      else if (s === "note") this.audio.play("sticky", { vol: 0.35, minGap: 120 });
      else if (s === "type") this.audio.play("type", { vol: 0.3, minGap: 28 });
      else this.audio.play("stamp", { vol: 0.75 });
    };
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
      tp: (x: number, y: number) => { this.player.x = x; this.player.y = y; },
      dayConfig: (d: number) => dayConfig(d)
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

  placeWallTile(x: number, y: number) {
    const t = this.world.tile(x, y);
    if (t === Tile.LOCKED) {
      this.wallLayer.putTileAt(this.world.tile(x - 1, y) === Tile.LOCKED ? WALL_INDEX.VAULT_R : WALL_INDEX.VAULT_L, x, y);
      return;
    }
    const below = this.world.tile(x, y + 1) === Tile.FLOOR;
    let idx: number = WALL_INDEX.CAP;
    if (t === Tile.WALL) {
      if (below) idx = y === 0 && x % 3 !== 0 ? WALL_INDEX.WINDOW : (x * 7 + y * 3) % 9 === 0 ? WALL_INDEX.FACE_ALT : WALL_INDEX.FACE;
    } else if (t === Tile.DRYWALL) {
      idx = below ? WALL_INDEX.DRY_FACE : WALL_INDEX.DRY_CAP;
    } else if (t === Tile.GLASS) idx = below ? WALL_INDEX.GLASS_FACE : WALL_INDEX.GLASS;
    else if (t === Tile.ELEVATOR) idx = this.map.spawns.some((s) => s.kind === "elevator" && s.doorTx === x) ? WALL_INDEX.ELEV_L : WALL_INDEX.ELEV_R;
    else if (t === Tile.EXIT_DOOR) idx = this.map.spawns.some((s) => s.kind === "exit" && s.doorTx === x) ? WALL_INDEX.EXIT_L : WALL_INDEX.EXIT_R;
    this.wallLayer.putTileAt(idx, x, y);
  }

  /** A wall tile became floor (the locked door opened). */
  clearWallTile(x: number, y: number) {
    this.wallLayer.removeTileAt(x, y);
    if (this.world.tile(x, y - 1) !== Tile.FLOOR) this.placeWallTile(x, y - 1);
  }

  /** The floor plan changed: enemies re-plan their routes. */
  refreshNav() {
    this.flowTile = -1;
  }

  private setupInput() {
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,E,R,Q,F,ONE,TWO,THREE,ENTER,ESC,P,M") as Keys;
    this.input.mouse?.disableContextMenu();
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => { if (!ev.repeat) this.pressed.add(ev.code); });
    // One weapon per wheel notch; trackpads fire dozens of tiny events, so rate-limit them.
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (Math.abs(dy) < 1 || this.time.now - this.wheelAt < 130) return;
      this.wheelAt = this.time.now;
      this.wheel = Math.sign(dy);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.rmb = true;
      if (p.leftButtonDown()) this.lmbPressed = true;
      if (this.phase === "announce") this.skipAnnounce();
    });
  }

  private onResize() {
    const cam = this.cameras.main;
    const h = this.scale.height;
    cam.setZoom(clamp(h / VIEW_WORLD_HEIGHT, 0.55, 1.8));
    // Dead space past the outer walls: in a corner the camera can still move far enough to keep you clear of the HUD.
    const padX = Math.round((this.scale.width / cam.zoom) * 0.35), padY = Math.round((h / cam.zoom) * 0.35);
    cam.setBounds(-padX, -padY, WORLD_W + padX * 2, WORLD_H + padY * 2);
  }

  // ================================================================ flow: title / days
  private enterTitle() {
    this.phase = "title";
    GameState.reset();
    this.resetWorldForDay(1);
    this.player.sprite.setVisible(false);
    this.player.shadow.setVisible(false);
    this.spawnNpcs(14);
    this.ui.setHudMode("none");
    this.audio.setMusic("title");
    const best = this.loadBest();
    const go = () => {
      this.ui.closeScreen("title");
      this.showLore(() => this.startRun());
    };
    this.ui.showTitle(best ? `BEST: SURVIVED ${best.days} DAY${best.days === 1 ? "" : "S"} · ${best.fired} FIRED` : "", { play: go, tutorial: go });
  }

  private startRun() {
    GameState.reset();
    this.startDay(1);
  }

  /** Who you are, and why the whole office is about to come after you. */
  private showLore(then: () => void) {
    this.phase = "lore";
    this.ui.setHudMode("none");
    this.audio.setMusic("none", 0.6);
    this.ui.showLore(LORE, () => {
      this.ui.closeScreen("lore");
      then();
    });
  }

  private resetWorldForDay(day: number, cfg?: DayConfig) {
    this.dayCfg = cfg ?? dayConfig(day, day > 1 ? this.dayCfg.chores : undefined);
    this.speakers.cancel();
    this.vision.reset();
    this.camFocus = null;
    this.clearPhoneBombs();
    this.teleGfx.clear();
    // The Hatchet Man's mess is cleaned up overnight.
    for (const f of this.wrecked) {
      f.destroyed = false;
      f.sprite.setVisible(true);
      if (f.collider) this.world.moveCollider(f.collider, f.x - f.w / 2, f.y - f.h / 2, f.x + f.w / 2, f.y + f.h / 2);
    }
    this.wrecked = [];
    for (const e of this.enemies) e.destroy();
    this.enemies = [];
    this.projectiles.clear();
    this.pickups.clear();
    this.hazards.clear();
    this.fx.clearDecals();
    this.stations.resetDay();
    // Overnight repairs: glass panes and smashed walls come back.
    for (let i = 0; i < this.map.tiles.length; i++) {
      const t = this.map.tiles[i];
      if (t !== Tile.GLASS && t !== Tile.DRYWALL) continue;
      if (this.world.tiles[i] === t && t !== Tile.GLASS) continue;
      this.world.tiles[i] = t;
      if (t === Tile.GLASS) this.world.glassHp.set(i, 3);
      this.world.wallHp.delete(i);
      if (t === Tile.DRYWALL) this.floorLayer.removeTileAt(i % MAP_W, Math.floor(i / MAP_W));
      this.placeWallTile(i % MAP_W, Math.floor(i / MAP_W));
      const above = i - MAP_W;
      if (above >= 0 && this.world.tiles[above] !== Tile.FLOOR) this.placeWallTile(above % MAP_W, Math.floor(above / MAP_W));
    }
    this.world.rebuildNav();
    this.props.reset();
    this.vault.setupDay(this.dayCfg.chores);
    this.stations.randomizeProps();
    for (const h of this.hearts) h.sprite.destroy();
    this.hearts = [];
    this.vortices = [];
    this.sprinklerFloods = [];
    this.sprinklerT = 0;
    this.chairs.forEach((c, k) => {
      const h = this.chairHomes[k];
      c.x = h.x; c.y = h.y; c.rot = h.rot; c.vx = c.vy = c.spin = 0; c.byPlayer = false;
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
    this.dayKills = 0;
    this.choresDone.clear();
    this.waves.reset();
    this.setWindowsNight(false);
    this.camX = p.x;
    this.camY = p.y;
  }

  startDay(day: number, cfg?: DayConfig) {
    GameState.day = day;
    if (day > 1) GameState.newDay();
    this.resetWorldForDay(day, cfg);
    this.ui.initMinimap(this.map, this.world);
    this.spawnNpcs(this.dayCfg.npcs);
    this.crunchTotal = GameState.crunchSeconds();
    this.crunchLeft = this.crunchTotal;
    this.quota = this.dayCfg.quota;
    this.hurryVoiced = false;
    this.lastTick = -1;
    this.paused = false;
    this.phase = "brief";
    this.ui.setHudMode("none");
    this.ui.brief("crunch", () => this.beginCrunch(day));
  }

  private beginCrunch(day: number) {
    this.phase = "crunch";
    this.ui.setHudMode("crunch");
    this.audio.setMusic("lobby");
    this.audio.setMusicRate(1);
    const g = this.dayCfg.growth;
    const sub = g === "more" ? "One more chore today" : g === "longer" ? "Chores take longer today" : "Chores due by 5 PM";
    this.ui.banner(`DAY ${day}`, sub, g ? "#e9c25a" : "#ffffff", 2.4);
    this.time.delayedCall(300, () => this.autoCompleteChores());
  }

  private spawnNpcs(n: number) {
    // Nobody sits in the code-locked room (they'd be stuck there at 5 PM).
    const free = this.map.npcHomes.filter((h) => !this.inLockedRoom(h.x, h.y));
    const homes = shuffle([...free]).slice(0, n);
    const weights = Object.entries(this.dayCfg.weights)
      .filter(([t]) => !ENEMIES[t as EnemyType].boss)
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
    if (this.mini) {
      // Hands on the task: the boss stands still while the clock keeps ticking.
      this.player.update(dt, { ...inp, mx: 0, my: 0, fire: false, firePressed: false, dodge: false, reload: false, switchTo: null, cycle: 0 });
    } else {
      this.player.update(dt, inp);
      this.handleInteraction(dt);
    }
    this.crunchLeft -= dt;
    const left = this.crunchLeft;
    if (left <= 20 && !this.hurryVoiced) {
      this.hurryVoiced = true;
      this.speakers.say(["Twenty seconds to five o'clock."], { chime: "down" });
      this.audio.setMusicRate(1.08);
    }
    if (left <= 10) {
      const s = Math.ceil(left);
      if (s !== this.lastTick) {
        this.lastTick = s;
        this.audio.play("tick", { vol: 0.5, jitter: 0 });
      }
    }
    if (inp.fire) this.tipOnce("holster", "No shooting before 5:00 PM. Chores first.", "#d0574a");
    if ((this.pressed.has("Enter") || this.pressed.has("NumpadEnter")) && this.allChoresDone()) {
      this.endCrunch(true);
      return;
    }
    if (left <= 0) this.endCrunch(false);
  }

  /** "Out of Office" upgrade: some chores do themselves. */
  private autoCompleteChores() {
    let n = GameState.stats.autoChores;
    for (const c of shuffle([...this.dayCfg.chores])) {
      if (n <= 0) break;
      if (this.choresDone.has(c)) continue;
      n--;
      this.ui.toast(`Out of Office: ${CHORE_INFO[c].label} handled itself`, "#4b9a63", 3);
      this.completeChore(c);
    }
  }

  startMini(chore: ChoreId, onDone: () => void) {
    if (this.mini || this.phase !== "crunch") return;
    const len = Math.max(0.5, (1 + this.dayCfg.lengthLevel * 0.35) * (0.6 + 0.4 * GameState.stats.interactMult));
    this.interactProgress = 0;
    this.ui.setPrompt(null);
    this.zoomMini();
    this.mini = openMini(this.ui.root, {
      chore, title: CHORE_INFO[chore].label, len,
      note: this.vault.noteFor(chore) ?? undefined,
      penalty: "-1s",
      sfx: (n) => this.miniSfx(n),
      onDone: () => { this.mini = null; this.unzoomMini(); this.input.keyboard?.resetKeys(); onDone(); },
      onCancel: () => { this.mini = null; this.unzoomMini(); this.input.keyboard?.resetKeys(); this.pressed.clear(); }
    });
  }

  /** Mini-game sounds; a mistake costs a second of Crunch Time. */
  private miniSfx(n: MiniSfx) {
    if (n === "good") this.audio.play("confirm", { vol: 0.35, jitter: 0.1 });
    else if (n === "bad") {
      this.audio.play("err", { vol: 0.55, jitter: 0 });
      if (this.phase === "crunch") {
        this.crunchLeft = Math.max(0, this.crunchLeft - 1);
        this.ui.penalty("-1s");
      }
    } else if (n === "win") {
      this.audio.play("bell", { vol: 0.5, jitter: 0 });
      this.audio.play("stamp", { vol: 0.5 });
    } else if (n === "note") this.audio.play("sticky", { vol: 0.5 });
    else if (n.startsWith("dtmf_")) this.audio.play(n, { vol: 0.4, jitter: 0 });
    else this.audio.play("click", { vol: 0.25, minGap: 60 });
  }

  /** The code-locked door's keypad (Crunch Time only). */
  startKeypad(code: number[], known: (number | null)[], onOpen: () => void) {
    if (this.mini || this.phase !== "crunch") return;
    this.ui.setPrompt(null);
    this.zoomMini();
    this.mini = openMini(this.ui.root, {
      chore: "keypad", title: `${this.vault.room?.name ?? "Door"} Keypad`, len: 1, code, known, penalty: "-1s",
      sfx: (n) => this.miniSfx(n),
      onDone: () => { this.mini = null; this.unzoomMini(); this.input.keyboard?.resetKeys(); onOpen(); },
      onCancel: () => { this.mini = null; this.unzoomMini(); this.input.keyboard?.resetKeys(); this.pressed.clear(); }
    });
  }

  /** The golden briefcase had a gun in it: in your hand at the next fight (or right now). */
  giftWeapon(w: WeaponId) {
    if (this.phase === "downsizing") {
      this.player.weapon = w;
      this.player.refill();
    } else if (!this.newWeapon) this.newWeapon = w;
    this.unlockBanner(WEAPON_DEFS[w].name, WEAPON_DEFS[w].desc, w);
  }

  /** Lean the camera in on the task while a mini-game is open. */
  private zoomMini() {
    const cam = this.cameras.main;
    if (!this.miniZoomBase) this.miniZoomBase = cam.zoom;
    this.tweens.killTweensOf(cam);
    this.tweens.add({ targets: cam, zoom: this.miniZoomBase * 1.35, duration: 450, ease: "Cubic.easeOut" });
  }

  private unzoomMini() {
    if (!this.miniZoomBase) return;
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    this.tweens.add({ targets: cam, zoom: this.miniZoomBase, duration: 300, ease: "Cubic.easeOut" });
    this.miniZoomBase = 0;
  }

  allChoresDone() {
    return this.dayCfg.chores.every((c) => this.choresDone.has(c));
  }

  completeChore(c: ChoreId) {
    if (this.choresDone.has(c)) return;
    this.choresDone.add(c);
    if (this.dayCfg.chores.includes(c)) GameState.dayStats.choresDone++;
    this.audio.play("stamp", { vol: 0.6 });
    this.fx.text(this.player.x, this.player.y - 40, "DONE!", { color: "#4b9a63", size: 20, pop: true });
    this.vault.collect(c);
    if (this.dayCfg.chores.includes(c) && this.allChoresDone()) {
      this.audio.play("bell2", { vol: 0.55, jitter: 0 });
      this.ui.toast("All chores done! Press ENTER to clock out early.", "#4b9a63", 3.2);
    }
  }

  unlockBanner(name: string, desc: string, weapon?: WeaponId) {
    this.ui.unlock(name, desc, weapon, weapon ? WEAPON_DEFS[weapon].color : undefined);
    this.audio.play("chime_up", { vol: 0.5, jitter: 0 });
  }

  private endCrunch(early: boolean) {
    // Clocking out early pays overtime at half rate: upgrades are meant to be scarce.
    const leftover = early ? Math.floor(Math.max(0, this.crunchLeft) / 2) : 0;
    this.mini?.close();
    this.mini = null;
    this.unzoomMini();
    const choreBonus = this.choresDone.size * (3 + GameState.stats.choreBonusSec);
    const missed = this.dayCfg.chores.filter((c) => !this.choresDone.has(c));
    GameState.bank += leftover + choreBonus;
    GameState.dayStats.banked = leftover + choreBonus;
    GameState.dayStats.choresTotal = this.dayCfg.chores.length;
    this.quota = this.dayCfg.quota + missed.length * 2;
    this.reviewNotes = [];
    if (early) this.reviewNotes.push({ text: `+${leftover}s for clocking out early (half rate)`, kind: "good" });
    this.audio.play("punch", { vol: 0.75, jitter: 0 });
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
    this.reviewOffers = this.rollShop();
    this.reviewGuns = this.rollGuns();
    this.ui.brief("review", () => this.renderReview());
  }

  /** Two guns you don't own yet; you can buy one of them per review. */
  private rollGuns() {
    return shuffle(WEAPONS.filter((w) => w !== "stapler" && !GameState.unlocked[w])).slice(0, 2).map((id) => ({ id, sold: false }));
  }

  /**
   * Upgrades are scarce on purpose: three offers at a markup (one guaranteed rare or better;
   * epics are a treat), so a good day buys one and a great day two.
   */
  private rollShop() {
    return GameState.rollSlots(["common", "common", "rare"]).map((perk) => ({ perk: { ...perk, cost: Math.ceil(perk.cost * 1.5) }, sold: false }));
  }

  private renderReview() {
    const healCost = 10, rerollCost = 7;
    const gunBought = this.reviewGuns.some((g) => g.sold);
    this.ui.showReview({
      bank: GameState.bank,
      notes: this.reviewNotes,
      offers: this.reviewOffers.map((o) => ({ ...o, stacks: GameState.stack(o.perk.id), maxed: !o.sold && !GameState.canTake(o.perk) })),
      guns: this.reviewGuns.map((g) => ({ ...WEAPON_DEFS[g.id], sold: g.sold, locked: gunBought && !g.sold })),
      healCost,
      canHeal: GameState.hp < GameState.stats.maxHp,
      rerollCost
    }, {
      buyGun: (i) => {
        const g = this.reviewGuns[i];
        if (!g || g.sold || this.reviewGuns.some((o) => o.sold)) return;
        const cost = WEAPON_DEFS[g.id].cost;
        if (GameState.bank < cost) return;
        GameState.bank -= cost;
        GameState.unlocked[g.id] = true;
        g.sold = true;
        this.newWeapon = g.id;
        this.audio.play("register", { vol: 0.7, jitter: 0 });
        this.audio.play("reload_done", { vol: 0.5 });
        this.renderReview();
      },
      buy: (i) => {
        const o = this.reviewOffers[i];
        if (!o || o.sold || GameState.bank < o.perk.cost || !GameState.canTake(o.perk)) return;
        GameState.bank -= o.perk.cost;
        GameState.addPerk(o.perk.id);
        o.sold = true;
        this.audio.play("register", { vol: 0.7, jitter: 0 });
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
        this.reviewOffers = this.rollShop();
        this.audio.play("paper", { vol: 0.5 });
        this.renderReview();
      },
      go: () => {
        this.ui.closeScreen("review");
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
    this.audio.play("powerdown", { vol: 0.6 });
    // The camera finds the nearest PA speaker; the lines are read out over it.
    const sp = this.speakers.nearest(this.player.x, this.player.y);
    // Frame it in the top third, clear of the announcement text.
    if (sp) this.camFocus = { x: sp.x, y: sp.y + (this.scale.height / this.cameras.main.zoom) * 0.2 };
    at(1300, () => type(0, "BUDGET CUTS HAVE BEEN MADE."));
    at(3300, () => type(1, "DOWNSIZING HAS BEGUN."));
    at(5200, () => {
      type(2, `${this.quota} WILL BE FIRED BY THE END OF TODAY.`, "red");
      for (const e of this.enemies) {
        if (e.mode !== "npc") continue;
        e.sprite.setTint(0xd0574a);
        this.fx.text(e.x, e.y - 34, "!", { color: "#c4382c", size: 30, pop: true, dur: 1.4 });
      }
      this.audio.play("alert", { vol: 0.6 });
    });
    at(7600, () => type(3, "GOOD LUCK.", "huge"));
    this.speakers.say([
      "Attention all staff. Due to budget cuts, downsizing has begun.",
      `${this.quota} employees will be let go by the end of today. Good luck.`
    ], { chime: "down", caption: false }).then(() => {
      if (this.phase === "announce") at(500, () => this.toFight());
    });
    at(16000, () => this.toFight());
  }

  private skipAnnounce() {
    if (this.phase !== "announce" || this.briefing) return;
    this.toFight();
  }

  /** End of the 5 PM speech: the first time, explain the fight before it starts. */
  private toFight() {
    if (this.briefing || this.phase !== "announce") return;
    for (const t of this.announceTimers) t.remove(false);
    this.announceTimers = [];
    this.speakers.cancel();
    this.camFocus = null;
    this.ui.closeScreen("announce");
    this.briefing = true;
    this.ui.brief("downsizing", () => {
      this.briefing = false;
      if (this.phase === "announce") this.startDownsizing();
    });
  }

  private startDownsizing() {
    for (const t of this.announceTimers) t.remove(false);
    this.announceTimers = [];
    this.ui.closeScreen("announce");
    this.phase = "downsizing";
    this.player.setArmed(true);
    this.player.refill();
    if (this.newWeapon && this.player.weaponUnlocked(this.newWeapon)) this.player.weapon = this.newWeapon;
    this.newWeapon = null;
    for (const e of this.enemies) if (e.mode === "npc") e.turnHostile();
    // Some coworkers stay put in their own rooms and ambush you when you wander in.
    const lurkers = shuffle(this.enemies.filter((e) => e.hostile && !e.def.boss && Math.hypot(e.x - this.player.x, e.y - this.player.y) > 560));
    for (const e of lurkers.slice(0, Math.min(7, 2 + Math.floor(GameState.day / 2)))) {
      e.lurking = true;
      e.lurkLeft = rand(30, 55);
    }
    this.waves.reset();
    this.hazards.setAllElectric(GameState.stats.electric);
    const stx = GameState.stats;
    if (stx.fireDrill) this.time.delayedCall(700, () => { if (this.phase === "downsizing") this.activateSprinklers("FIRE DRILL!", "Everybody out... onto the wet floor."); });
    for (let k = 0; k < stx.plusOne; k++) {
      const pt = this.safeSpot(this.player.x + rand(-50, 50), this.player.y + 50);
      const a = this.spawnEnemy("intern", pt.x, pt.y, "ally");
      a.makeAlly(30);
      this.fx.text(pt.x, pt.y - 40, "PLUS ONE!", { color: "#9fd3a8", size: 15, pop: true });
    }
    if (GameState.stats.prepShield) this.player.tempHp = Math.max(this.player.tempHp, GameState.stats.prepShield * 2);
    this.audio.setMusic("fight", 0.2);
    this.audio.play("bell2", { vol: 0.6, rate: 0.72, jitter: 0 });
    // Lights out: from now on walls block your view.
    this.vision.target = 1;
    this.time.delayedCall(2600, () => this.tipOnce("vision", "The lights are out. Walls block your view, windows don't.", "#9fd8ff"));
    this.ui.setDusk(0);
    this.ui.setHudMode("fight");
    this.ui.flash("#ff2040", 260, 0.5);
    this.ui.banner("FIGHT!", `Fire ${this.quota} coworkers before they fire you`, "#c4382c", 1.8);
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
    this.updateDrones(dt);
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
    this.updateHearts(dt);
    this.updateVortices(dt);
    const bossAlive = this.waves.boss && !this.waves.boss.dead;
    if (this.waves.boss && !this.waves.boss.dead) this.ui.setBoss(this.waves.boss.def.title, this.waves.boss.hp / this.waves.boss.maxHp);
    else this.ui.setBoss(null, 0);
    if (this.fired >= this.quota && !bossAlive) this.dayClear();
  }

  private dayClear() {
    this.phase = "dayclear";
    this.syncQuota();
    this.fx.slowmo(0.3, 1.4);
    this.player.invuln = 99;
    this.player.setArmed(false);
    this.laserGfx.clear();
    for (const p of this.projectiles.list) if (p.active && !p.friendly) p.range = 0;
    const flawless = GameState.dayStats.damageTaken === 0;
    this.clearPhoneBombs();
    this.vision.target = 0;
    this.audio.play("punch", { vol: 0.8, jitter: 0 });
    this.time.delayedCall(350, () => this.audio.play("applause", { vol: 0.65, jitter: 0 }));
    if (flawless) this.time.delayedCall(700, () => this.audio.play("bell2", { vol: 0.5, jitter: 0 }));
    this.audio.setMusic("none", 1.5);
    this.ui.banner("QUOTA MET", flawless ? "FLAWLESS. NOT A SCRATCH." : `Day ${GameState.day} survived`, "#e9c25a", 2.4);
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
    const gradeColor = { S: "#e9c25a", A: "#4b9a63", B: "#6aa3b4", C: "#c9d1dc", D: "#d0574a" }[grade]!;
    const title = { S: "Exceeds all expectations. Promoted to Senior VP of Firing.", A: "Exceeds expectations.", B: "Meets expectations.", C: "Needs improvement.", D: "On a performance improvement plan." }[grade]!;
    const acc = ds.shots ? Math.round((ds.hits / Math.max(1, ds.shots)) * 100) : 0;
    this.audio.setMusic("review");
    const picks = GameState.rollPerks(3, 2.2, "chore");
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
      this.audio.play("bell", { vol: 0.5, jitter: 0 });
      this.ui.closeScreen("results");
      this.endOfDayMemo();
    });
  }

  /** Before the next day: management's one-line memo about what's harder tomorrow, read out over the PA. */
  private endOfDayMemo() {
    const today = this.dayCfg;
    const next = dayConfig(GameState.day + 1, today.chores);
    const change = this.memoChange(today, next);
    this.phase = "memo";
    this.ui.setHudMode("none");
    this.ui.showMemo({ day: next.day, change, quota: next.quota }, () => {
      this.speakers.cancel();
      this.ui.closeScreen("memo");
      this.startDay(next.day, next);
    });
    this.speakers.say([`Due to budget cuts: ${change}.`], { chime: "down", caption: false });
  }

  /** The single biggest change tomorrow (a boss, a new kind of coworker, or the chore load), for "Due to budget cuts: ...". */
  memoChange(today: DayConfig, next: DayConfig): string {
    const kind = next.boss ? ENEMIES[next.bossType].bossKind : undefined;
    if (kind) return BOSS_INFO[kind].memo;
    const order: EnemyType[] = ["robot", "hr", "burnout", "manager", "fulltime"];
    const fresh = order.find((t) => next.weights[t] && !today.weights[t] && NEW_TYPE_MEMO[t]);
    if (fresh) return NEW_TYPE_MEMO[fresh]!;
    if (next.growth === "more") return "one more chore on your plate";
    if (next.growth === "longer") return "every chore runs a little longer";
    return "the elevators run more often";
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
    this.clearPhoneBombs();
    this.vision.target = 0;
    this.audio.play("printer", { vol: 0.7, jitter: 0 });
    this.time.delayedCall(900, () => this.audio.play("chime_down", { vol: 0.45, jitter: 0 }));
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
      if (newBest) this.audio.play("chime_up", { vol: 0.55, jitter: 0 });
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
    const door = p.rolling > 0 ? null : this.vault.near(p.x, p.y);
    if (door) {
      this.interactTarget = null;
      this.interactProgress = 0;
      if (this.pressed.has("KeyE") && p.stun <= 0) this.vault.use();
      const cam = this.cameras.main;
      this.ui.setPrompt({ x: (door.x - cam.worldView.x) * cam.zoom, y: (door.y - cam.worldView.y) * cam.zoom, label: door.label, kind: "chore", progress: 0 });
      return;
    }
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
      if (near.action.hold <= 0) {
        // Chores, traps and pickups all happen the moment E is pressed.
        if (this.pressed.has("KeyE") && p.stun <= 0) {
          near.action.run();
          if (near.action.kind !== "chore") this.audio.play("confirm", { vol: 0.35 });
        }
        this.interactProgress = 0;
      } else if (this.keys.E.isDown && p.stun <= 0) {
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
    if (fromPlayer) dmg *= this.dayDamageBuff * (1 + Math.min(st.pyramid * 0.3, this.dayKills * 0.01 * (1 + st.pyramid)));
    if (fromPlayer && this.player.dugIn) dmg *= 1.4;
    // Sticky Notes: enough of them and a coworker just stands there, confused.
    if (fromPlayer && st.sticky && AIMED.has(info.kind) && !e.def.boss && e.hostile) {
      e.notes++;
      if (e.notes >= (st.sticky >= 2 ? 2 : 3)) {
        e.notes = 0;
        e.stun = Math.max(e.stun, 1.5);
        this.fx.text(e.x, e.y - 48, "???", { color: "#e9c25a", size: 20, pop: true, dur: 0.8 });
      }
    }
    // Soaked coworkers conduct beautifully.
    if (e.soaked > 0 && (info.kind === "zap" || info.kind === "chain")) dmg *= 2;
    let killed = e.takeDamage(dmg, info.angle, info.knock * st.knockbackMult);
    if (!killed && fromPlayer && st.execute && !e.def.boss && e.hp / e.maxHp < st.execute) {
      e.hp = 0;
      killed = true;
      this.fx.text(e.x, e.y - 52, "TWO WEEKS' NOTICE", { color: "#6f5aa0", size: 15, pop: true, dur: 0.9 });
    }
    if (fromPlayer && AIMED.has(info.kind)) GameState.dayStats.hits++;
    if (!info.silent) {
      this.fx.text(e.x + rand(-12, 12), e.y - e.r - 12, String(Math.max(1, Math.round(dmg))), {
        size: crit ? 24 : 15, color: crit ? "#e9c25a" : "#ffffff", dur: crit ? 0.8 : 0.5, rise: 80, pop: crit
      });
      if (info.kind !== "laser") this.fx.spray("confetti", e.x, e.y, crit ? 7 : 3, info.angle, 45);
      this.audio.play("hit", { vol: crit ? 0.45 : 0.28, minGap: 45, rate: crit ? 0.8 : 1 });
      if (crit) this.fx.burst("star", e.x, e.y, 6, 0xe9c25a);
    }
    if (fromPlayer && info.kind !== "chain" && info.kind !== "explosion" && info.kind !== "nuke") {
      if (st.ignite > 0) {
        e.burn = Math.max(e.burn, 2.5);
        e.burnDps = Math.max(e.burnDps, 11 * st.ignite * st.dmgMult);
      }
      if (info.kind === "coffee") {
        e.burn = Math.max(e.burn, st.irish ? 2.6 : 1.6);
        e.burnDps = Math.max(e.burnDps, (st.irish ? 30 : 7) * st.dmgMult);
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
    if (this.phase === "downsizing") this.syncQuota();

    // Golden Handshake: every 4th firing pays a little overtime.
    if (byPlayer && st.handshake && ++this.handshakeCount % 4 === 0) {
      GameState.bank += 2 * st.handshake;
      this.fx.text(x, y - 64, `+${2 * st.handshake}s OVERTIME`, { color: "#e9c25a", size: 16, pop: true, dur: 1 });
    }
    // Chain of Command: fire someone who shoots back and the room freezes.
    if (byPlayer && st.command && e.def.ranged && !e.def.boss) this.shockwave(x, y, 260, 0, 1.6, 0xe9c25a, "LEADERLESS!");

    const boss = e.def.boss;
    this.fx.text(x, y - 36, boss ? "THE CONSULTANT HAS BEEN LET GO" : pick(FIRED_WORDS), { color: "#c4382c", size: boss ? 30 : 22, pop: true, dur: boss ? 2.2 : 1.0, rise: 50 });
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
      this.ui.flash("#e9c25a", 500, 0.6);
      this.audio.play("applause", { vol: 0.7, jitter: 0 });
      this.audio.play("bell2", { vol: 0.55, jitter: 0 });
      this.speakers.say(["Attention all staff. That position has been eliminated."], { chime: "up" });
      for (let k = 0; k < 4; k++) this.pickups.spawn(k === 0 ? "pizza" : "donut", x, y);
    }

    // combo
    this.combo++;
    this.comboTimer = 2.6;
    GameState.dayStats.bestCombo = Math.max(GameState.dayStats.bestCombo, this.combo);
    if (this.combo >= 2) this.ui.setCombo(this.combo, COMBO_WORDS[Math.min(this.combo, COMBO_WORDS.length - 1)]);
    // Cost savings! A cash register for every big streak.
    if (this.combo === 4 && !this.comboVoiced) { this.comboVoiced = true; this.audio.play("register", { vol: 0.6, jitter: 0 }); }
    if (this.combo === 8 || this.combo === 12) this.audio.play("register", { vol: 0.7, rate: 1.08, jitter: 0 });
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
        this.fx.text(x, y - 50, "INTERN RECRUITED!", { color: "#9fd3a8", size: 17, pop: true });
        this.audio.play("upgrade", { vol: 0.5 });
      }
    }
    this.dayKills++;
    if (st.chainmail) {
      let from = { x, y };
      const skip = new Set<number>();
      for (let k = 0; k < st.chainmail; k++) {
        const next = this.nearestEnemy(from.x, from.y, 340, skip);
        if (!next) break;
        skip.add(next.id);
        this.zapLine(from.x, from.y, next.x, next.y);
        this.hitEnemy(next, 32 * st.dmgMult, { angle: Math.atan2(next.y - from.y, next.x - from.x), kind: "chain", x: next.x, y: next.y, knock: 60, noChain: true });
        from = { x: next.x, y: next.y };
      }
    }
    if (st.promotion) {
      this.killsForPromotion++;
      if (this.killsForPromotion >= 15) {
        this.killsForPromotion = 0;
        const gift = GameState.rollSlots(["common"], "combat")[0];
        if (gift) {
          GameState.addPerk(gift.id);
          this.ui.banner("PROMOTED!", `Free upgrade: ${gift.name}`, "#d8a93b", 2.2);
          this.audio.play("levelup", { vol: 0.6 });
        }
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
    this.fx.text(p.x, p.y - 60, "MARKET CRASH!", { color: "#e9c25a", size: 30, pop: true, dur: 1.4 });
    this.audio.play("boom", { vol: 0.8 });
    this.fx.shake(0.8);
    this.ui.flash("#e9c25a", 300, 0.45);
    const ring = this.add.circle(p.x, p.y, 20).setStrokeStyle(10, 0xe9c25a, 0.9).setDepth(DEPTH.FX);
    this.tweens.add({ targets: ring, radius: 560, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
    for (const e of [...this.enemies]) {
      if (!e.hostile || e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 560) this.hitEnemy(e, 70 * GameState.stats.dmgMult, { angle: Math.atan2(e.y - p.y, e.x - p.x), kind: "nuke", x: e.x, y: e.y, knock: 520 });
    }
  }

  /** A hazard the player set up finished off a coworker: pay out a little overtime so prep feels worth it. */
  trapKill(x: number, y: number) {
    if (this.phase !== "downsizing") return;
    GameState.bank += 1;
    this.fx.text(x, y - 44, "TRAP KILL +1s", { color: "#9fd3a8", size: 14, dur: 0.9 });
  }

  explosion(x: number, y: number, radius: number, dmg: number, opts: { friendly: boolean; small?: boolean; skip?: Enemy; fromCopier?: boolean }) {
    const hm = GameState.stats.hazardMult;
    const small = !!opts.small;
    this.fx.light(x, y, 0xd98a3a, radius / 26, small ? 0.18 : 0.35);
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
    // Explosions, fire and live water only ever hurt coworkers: traps are the boss's tools.
    this.hazards.igniteRadius(x, y, radius * 0.6, small ? 0 : 1.2);
    // Shatter nearby glass and rattle barricades / other explosive copiers.
    const r = Math.ceil(radius / TILE);
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - r; ty <= cy + r; ty++) for (let tx = cx - r; tx <= cx + r; tx++) {
      if (this.world.tile(tx, ty) !== Tile.GLASS) continue;
      if (((tx + 0.5) * TILE - x) ** 2 + ((ty + 0.5) * TILE - y) ** 2 < d2max) this.damageGlass(tx, ty, small ? 1 : 3);
    }
    if (!small) {
      this.smashWalls(x, y, radius * 0.42);
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
        c.byPlayer = opts.friendly;
      }
    }
  }

  private tipsShown = new Set<string>();
  /** Shows a gameplay tip the first time something happens in a run. */
  tipOnce(key: string, text: string, color = "#e9c25a") {
    if (this.tipsShown.has(key)) return;
    this.tipsShown.add(key);
    this.ui.toast(text, color, 5);
  }

  /** Which room/hall a world point is in (-1 = inside a wall). */
  zoneAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return -1;
    return this.map.zoneGrid[ty * MAP_W + tx];
  }

  /** Inside the code-locked room while its door is still shut: nobody spawns, wanders or phases in there. */
  inLockedRoom(x: number, y: number): boolean {
    const z = this.vault.lockedZone;
    return z >= 0 && this.zoneAt(x, y) === z;
  }

  /** The nearest walkable spot to (x, y) outside the locked room (an elevator if that's all there is). */
  safeSpot(x: number, y: number): { x: number; y: number } {
    const p = this.world.nearestWalkable(x, y);
    if (!this.inLockedRoom(p.x, p.y)) return p;
    const lift = this.map.spawns.find((s) => s.kind === "elevator") ?? this.map.spawns[0];
    return this.world.nearestWalkable(lift.x, lift.y);
  }

  /** Somewhere for a coworker to wander off to before 5 PM (never the locked room). */
  wanderSpot(): { x: number; y: number } {
    const spots = this.map.wanderSpots.filter((s) => !this.inLockedRoom(s.x, s.y));
    return pick(spots.length ? spots : this.map.wanderSpots);
  }

  /** Flow distance to the player from around a point (Infinity: there's no way to you from there). */
  reachDist(x: number, y: number): number {
    let best = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.min(best, this.flowNaive.distAt(x + dx * TILE, y + dy * TILE));
    return best;
  }

  /**
   * Safety net: a coworker with no way to reach you (walled in, stuck behind the locked door) comes back in through
   * an entrance instead of holding up the quota forever. False if there's nowhere reachable to put them.
   */
  rescueStraggler(e: Enemy): boolean {
    const spots = this.map.spawns.filter((s) => !this.inLockedRoom(s.x, s.y))
      .map((s) => this.world.nearestWalkable(s.x, s.y))
      .filter((p) => isFinite(this.reachDist(p.x, p.y)));
    if (!spots.length) return false;
    const wv = this.cameras.main.worldView;
    const unseen = spots.filter((p) => !wv.contains(p.x, p.y));
    const p = pick(unseen.length ? unseen : spots);
    e.x = p.x;
    e.y = p.y;
    e.vx = e.vy = 0;
    e.spawnGrace = Math.max(e.spawnGrace, 0.5);
    this.fx.burst("pixel", p.x, p.y, 6, 0xb8bfc9);
    return true;
  }

  /** Breaks every drywall tile within radius of a point. Returns how many came down. */
  smashWalls(x: number, y: number, radius: number): number {
    let n = 0;
    const r = Math.ceil(radius / TILE) + 1;
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (this.world.tile(tx, ty) !== Tile.DRYWALL) continue;
        const nx = clamp(x, tx * TILE, (tx + 1) * TILE), ny = clamp(y, ty * TILE, (ty + 1) * TILE);
        if ((nx - x) ** 2 + (ny - y) ** 2 > radius * radius) continue;
        if (this.world.damageWall(tx, ty, 99)) { this.onWallBroken(tx, ty); n++; }
      }
    }
    if (n) {
      this.fx.shake(0.5);
      this.audio.play("wood_heavy", { vol: 0.8, minGap: 80 });
      this.audio.play("crunch", { vol: 0.6, minGap: 80 });
      this.fx.text(x, y - 60, "CRASH!", { color: "#e9c25a", size: 26, pop: true, dur: 0.9 });
      this.ui.initMinimap(this.map, this.world);
      this.flowTile = -1;
    }
    return n;
  }

  private onWallBroken(tx: number, ty: number) {
    // The hole takes the floor of whichever room it opened into.
    let mat = Mat.HALL as number;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const m = this.map.mats[(ty + dy) * MAP_W + (tx + dx)];
      if (m && this.world.tile(tx + dx, ty + dy) === Tile.FLOOR) { mat = m; break; }
    }
    this.map.mats[ty * MAP_W + tx] = mat;
    const variants = FLOOR_INDEX[mat] ?? FLOOR_INDEX[1];
    this.wallLayer.removeTileAt(tx, ty);
    this.floorLayer.putTileAt(variants[(tx * 7 + ty * 13) % variants.length], tx, ty);
    if (this.world.tile(tx, ty - 1) !== Tile.FLOOR) this.placeWallTile(tx, ty - 1);
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    this.fx.burst("smoke", x, y, 8);
    this.fx.burst("pixel", x, y, 22, 0xe8dcc6);
    this.fx.decal(x, y, "rubble", { scale: 1, alpha: 0.95 });
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
    const f = c.ref as FurnObj | undefined;
    if (!f) return;
    const st = this.stations.list.find((s) => s.furn === f);
    if (st && st.def.kind === "copier") {
      this.stations.copierShot(st, friendly ? dmg : dmg * 4);
      return;
    }
    if (friendly && chance(0.3)) this.fx.burst("pixel", x, y, 3, 0xd8d2c4);
  }

  onPlayerHurt() {
    const st = GameState.stats;
    if (st.panic) this.shockwave(this.player.x, this.player.y, 200 + st.panic * 40, 18 * st.panic * st.dmgMult, 1.1, 0xff3355, "PANIC!");
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
    this.fx.text(p.x, p.y - 60, "GOLDEN PARACHUTE!", { color: "#e9c25a", size: 28, pop: true, dur: 2 });
    this.ui.flash("#e9c25a", 600, 0.7);
    this.fx.slowmo(0.3, 1.2);
    this.audio.play("chime_up", { vol: 0.6, jitter: 0 });
    this.audio.play("bell2", { vol: 0.5, jitter: 0 });
    for (const e of [...this.enemies]) {
      if (!e.hostile || e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 320) this.hitEnemy(e, 60, { angle: Math.atan2(e.y - p.y, e.x - p.x), kind: "nuke", x: e.x, y: e.y, knock: 600 });
    }
  }

  bossIncoming(type: EnemyType) {
    const def = ENEMIES[type];
    const info = BOSS_INFO[def.bossKind ?? "consultant"];
    this.ui.banner(def.title, info.sub, "#e9c25a", 3);
    this.audio.play("alert", { vol: 0.6 });
    this.speakers.say([info.pa], { chime: "down" });
    this.fx.shake(0.5);
  }

  // ================================================================ boss toys
  /** A red lane on the floor where the Hatchet Man is about to charge (brighter as he commits). */
  drawChargeLane(x: number, y: number, a: number, r: number, f: number) {
    const g = this.teleGfx;
    const len = 900, w = r * 1.1;
    const c = Math.cos(a), s = Math.sin(a), nx = -s * w, ny = c * w;
    const ex = x + c * len, ey = y + s * len;
    g.fillStyle(0xc4382c, 0.08 + 0.2 * f);
    g.fillPoints([{ x: x + nx, y: y + ny }, { x: ex + nx, y: ey + ny }, { x: ex - nx, y: ey - ny }, { x: x - nx, y: y - ny }], true);
    g.lineStyle(3, 0xff6a55, 0.25 + 0.5 * f);
    g.lineBetween(x + nx, y + ny, ex + nx, ey + ny);
    g.lineBetween(x - nx, y - ny, ex - nx, ey - ny);
    for (let k = 1; k <= 4; k++) {
      const d = ((k / 4) * len + this.time.now * 0.6 * f) % len;
      const px = x + c * d, py = y + s * d;
      g.lineStyle(4, 0xff6a55, 0.4 * f);
      g.lineBetween(px + nx * 0.6 - c * 18, py + ny * 0.6 - s * 18, px + c * 6, py + s * 6);
      g.lineBetween(px - nx * 0.6 - c * 18, py - ny * 0.6 - s * 18, px + c * 6, py + s * 6);
    }
  }

  /** A charging boss hits whatever is ahead of it: drywall, glass, furniture, traps. */
  bossSmash(e: Enemy, x: number, y: number, r: number) {
    this.smashWalls(x, y, r);
    const tr = Math.ceil(r / TILE) + 1, cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - tr; ty <= cy + tr; ty++) for (let tx = cx - tr; tx <= cx + tr; tx++) {
      if (this.world.tile(tx, ty) !== Tile.GLASS) continue;
      const nx = clamp(x, tx * TILE, (tx + 1) * TILE), ny = clamp(y, ty * TILE, (ty + 1) * TILE);
      if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) this.damageGlass(tx, ty, 99);
    }
    const hits: FurnObj[] = [];
    this.world.queryBox(x - r, y - r, x + r, y + r, (c) => {
      if (!c.alive || !c.solid) return;
      const f = c.ref as FurnObj | undefined;
      if (f && !hits.includes(f)) hits.push(f);
    });
    for (const f of hits) {
      const st = this.stations.list.find((s) => s.furn === f);
      if (st) {
        // Machines are heavy: he slams into them. Some of them go off.
        if (st.def.kind === "copier" && !st.wrecked) this.stations.detonate(st);
        else if (st.def.kind === "cooler" && !st.used) this.stations.kickCooler(st);
        continue;
      }
      if (this.props.launch(f, e.vx * 1.15, e.vy * 1.15, e)) continue;
      this.wreckFurniture(f);
    }
    for (const c of this.chairs) {
      if ((c.x - x) ** 2 + (c.y - y) ** 2 > (r + 26) ** 2) continue;
      c.vx += e.vx * 1.2;
      c.vy += e.vy * 1.2;
      c.spin += rand(-20, 20);
      c.byPlayer = false;
    }
  }

  /** Splinters: the furniture is gone until the cleaners come overnight. */
  wreckFurniture(f: FurnObj) {
    if (f.destroyed || !f.collider) return;
    f.destroyed = true;
    f.sprite.setVisible(false);
    this.world.moveCollider(f.collider, -9999, -9999, -9990, -9990);
    this.wrecked.push(f);
    this.fx.burst("pixel", f.x, f.y, 22, [0xd8c3a5, 0x8a5a33, 0x5b6380]);
    this.fx.burst("smoke", f.x, f.y, 4, 0xd8c3a5);
    this.fx.decal(f.x, f.y, "rubble", { scale: Math.min(1.4, Math.max(0.6, f.w / 90)), alpha: 0.9, tint: 0xb59a7a });
    this.audio.play("wood_heavy", { vol: 0.7, minGap: 60 });
    this.audio.play("crunch", { vol: 0.5, minGap: 60 });
    this.world.rebuildNav();
    this.refreshNav();
  }

  /** A thrown desk phone lands: it rings on the floor, then goes off. Swatted-back phones go off at once. */
  phoneLanded(x: number, y: number, friendly: boolean, owner: Enemy | null) {
    if (friendly) { this.phoneBlast(x, y, true, null); return; }
    this.tipOnce("phones", "Ringing phones blow up a second after they land. Get out of the red ring! (A keyboard swing sends one back.)", "#e9c25a");
    const img = this.add.image(x, y, "i_phone").setDepth(y + 3).setScale(1.15);
    this.phoneBombs.push({ x, y, fuse: 1.05, ring: 0, img, owner });
    this.fx.burst("smoke", x, y + 6, 2, 0xd8c3a5);
  }

  private updatePhoneBombs(dt: number) {
    const g = this.teleGfx;
    for (let i = this.phoneBombs.length - 1; i >= 0; i--) {
      const b = this.phoneBombs[i];
      b.fuse -= dt;
      b.ring -= dt;
      if (b.ring <= 0) {
        b.ring = 0.5;
        this.audio.play("phone", { vol: 0.5, minGap: 90 });
        this.fx.text(b.x, b.y - 30, "RING!", { color: "#e9c25a", size: 13, dur: 0.45, rise: 30 });
      }
      b.img.setPosition(b.x + rand(-2, 2), b.y + rand(-1.5, 1.5)).setRotation(Math.sin(this.time.now / 25) * 0.15);
      const f = 1 - Math.max(0, b.fuse) / 1.05;
      const blink = Math.sin(this.time.now / (90 - 60 * f)) > 0 ? 1 : 0.55;
      g.fillStyle(0xc4382c, (0.06 + 0.14 * f) * blink);
      g.fillCircle(b.x, b.y, PHONE_R);
      g.lineStyle(3, 0xff6a55, (0.3 + 0.5 * f) * blink);
      g.strokeCircle(b.x, b.y, PHONE_R);
      g.strokeCircle(b.x, b.y, PHONE_R * f);
      if (b.fuse <= 0) {
        b.img.destroy();
        this.phoneBombs.splice(i, 1);
        this.phoneBlast(b.x, b.y, false, b.owner);
      }
    }
    // Where the phones in the air are going to land.
    for (const p of this.projectiles.list) {
      if (!p.active || p.kind !== "phone" || p.friendly) continue;
      g.lineStyle(2, 0xff6a55, 0.55);
      g.strokeCircle(p.tx, p.ty, PHONE_R);
      g.fillStyle(0xc4382c, 0.06);
      g.fillCircle(p.tx, p.ty, PHONE_R);
    }
  }

  private phoneBlast(x: number, y: number, friendly: boolean, owner: Enemy | null) {
    const R = PHONE_R;
    this.fx.light(x, y, 0xd98a3a, R / 22, 0.25);
    this.fx.burst("fire", x, y, 14);
    this.fx.burst("smoke", x, y, 5);
    this.fx.burst("pixel", x, y, 14, [0xe3d9c4, 0x1c1d21, 0xc4382c]);
    this.fx.decal(x, y, "fx_scorch_02", { scale: R / 280, alpha: 0.55, tint: 0x111111 });
    this.audio.play("boom", { vol: 0.6, rate: 1.15 });
    this.fx.shake(0.35);
    const pl = this.player;
    if (!friendly && !pl.dead && pl.rolling <= 0 && (pl.x - x) ** 2 + (pl.y - y) ** 2 < (R + pl.r * 0.5) ** 2) {
      pl.damage(2, x, y, "phone", owner ?? undefined);
    }
    for (const e of [...this.enemies]) {
      if (e.dead || e.ally || e === owner || e.def.boss && !friendly) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 > (R + e.r) ** 2) continue;
      const dmg = friendly ? 90 * GameState.stats.dmgMult : e.maxHp * 0.3;
      this.hitEnemy(e, dmg, { angle: Math.atan2(e.y - y, e.x - x), kind: "explosion", x: e.x, y: e.y, knock: 300, silent: !friendly });
    }
    const tr = Math.ceil(R / TILE), cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - tr; ty <= cy + tr; ty++) for (let tx = cx - tr; tx <= cx + tr; tx++) {
      if (this.world.tile(tx, ty) === Tile.GLASS && ((tx + 0.5) * TILE - x) ** 2 + ((ty + 0.5) * TILE - y) ** 2 < R * R) this.damageGlass(tx, ty, 2);
    }
    this.hazards.igniteRadius(x, y, R * 0.45, 0.8);
  }

  private clearPhoneBombs() {
    for (const b of this.phoneBombs) b.img.destroy();
    this.phoneBombs = [];
    for (const p of this.projectiles.list) if (p.active && p.kind === "phone" && !p.friendly) { p.active = false; p.sprite.setVisible(false); }
  }

  /** A ring blast from (x, y): damages, knocks back and stuns coworkers (never the player). */
  shockwave(x: number, y: number, radius: number, dmg: number, stun: number, color: number, label?: string) {
    const ring = this.add.circle(x, y, 18).setStrokeStyle(8, color, 0.95).setDepth(DEPTH.FX);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    this.fx.light(x, y, color, radius / 40, 0.2);
    this.fx.shake(0.18);
    this.audio.play("boom", { vol: 0.35, rate: 1.6, minGap: 120 });
    if (label) this.fx.text(x, y - 56, label, { color: Phaser.Display.Color.IntegerToColor(color).rgba, size: 18, pop: true, dur: 0.8 });
    for (const e of [...this.enemies]) {
      if (e.dead || !e.hostile) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius) continue;
      e.stun = Math.max(e.stun, stun);
      this.hitEnemy(e, dmg, { angle: Math.atan2(e.y - y, e.x - x), kind: "nuke", x: e.x, y: e.y, knock: 420 * (1 - d / radius) + 120, silent: dmg <= 0 });
    }
  }

  private zapLine(x0: number, y0: number, x1: number, y1: number) {
    const pts: number[] = [x0, y0];
    for (let s = 1; s < 6; s++) {
      const t = s / 6;
      pts.push(lerp(x0, x1, t) + rand(-12, 12), lerp(y0, y1, t) + rand(-12, 12));
    }
    pts.push(x1, y1);
    this.chainLines.push({ pts, life: 0.16 });
  }

  /** Office Drone: hovers behind the player and staples the nearest coworker it can see. */
  private updateDrones(dt: number) {
    const n = this.phase === "downsizing" ? GameState.stats.drone : 0;
    while (this.drones.length < n) {
      const img = this.add.image(this.player.x, this.player.y, "drone").setDepth(DEPTH.PROJECTILE - 2);
      this.drones.push({ img, x: this.player.x, y: this.player.y, cd: rand(0.2, 0.6), bob: rand(0, 6) });
    }
    while (this.drones.length > n) this.drones.pop()!.img.destroy();
    const p = this.player;
    this.drones.forEach((d, k) => {
      const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.9 + Math.sin(this.time.now / 900 + k) * 0.25;
      const tx = p.x + Math.cos(a) * 64, ty = p.y + Math.sin(a) * 64 - 18;
      d.x = damp(d.x, tx, 6, dt);
      d.y = damp(d.y, ty, 6, dt);
      d.bob += dt * 6;
      d.img.setPosition(d.x, d.y + Math.sin(d.bob) * 4);
      d.cd -= dt;
      if (d.cd > 0) return;
      const target = this.nearestEnemy(d.x, d.y, 560);
      if (!target || !this.world.los(d.x, d.y, target.x, target.y)) { d.cd = 0.2; return; }
      d.cd = 0.62 / GameState.stats.fireRateMult;
      const ang = Math.atan2(target.y - d.y, target.x - d.x);
      const pr = this.projectiles.firePlayer("staple", d.x, d.y, ang);
      pr.dmg *= 0.75;
      d.img.setRotation(ang);
      this.audio.play("staple", { vol: 0.14, rate: 1.6, minGap: 40 });
    });
  }

  // ================================================================ laser
  fireLaser(x: number, y: number, angle: number, dt: number) {
    const st = GameState.stats;
    const dps = 78 * st.dmgMult * st.laserMult;
    const offsets = [0];
    for (let k = 1; k <= st.multishot; k++) offsets.push(k % 2 ? 0.09 * Math.ceil(k / 2) : -0.09 * Math.ceil(k / 2));
    this.laserSfx -= dt;
    if (this.laserSfx <= 0) { this.laserSfx = 0.16; this.audio.play("laser", { vol: 0.16, rate: 1.4, jitter: 0.05, minGap: 100 }); }
    const prisms: { x: number; y: number; a: number; skip: number }[] = [];
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
          const far = st.sniper && Math.hypot(h.e.x - x, h.e.y - y) > 380 ? 2 : 1;
          this.laserDamage(h.e, dps * mult * far * dt, a);
          if (st.prism && off === 0) prisms.push({ x: ox + ca * h.t, y: oy + sa * h.t, a, skip: h.e.id });
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
    // Prism Pointer: each enemy the main beam touches throws two split beams.
    for (const pz of prisms.slice(0, 2)) {
      for (const side of [-1, 1]) {
        const a2 = pz.a + side * (0.55 - st.prism * 0.08);
        const ray = this.world.raycast(pz.x, pz.y, a2, 460, 8);
        let ex = ray.x, ey = ray.y;
        const ca = Math.cos(a2), sa = Math.sin(a2);
        for (const e of this.enemies) {
          if (e.dead || !e.hostile || e.id === pz.skip) continue;
          const rx = e.x - pz.x, ry = e.y - pz.y;
          const t = rx * ca + ry * sa;
          if (t < 0 || t > ray.dist || Math.abs(rx * sa - ry * ca) > e.r + 5) continue;
          this.laserDamage(e, dps * 0.5 * st.prism * dt, a2);
          ex = pz.x + ca * t; ey = pz.y + sa * t;
          break;
        }
        this.drawLaser([[pz.x, pz.y, ex, ey]], 0.6);
      }
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
        // Whoever shoves a chair owns it, unless it's already flying (a coworker can't take over your bowling ball).
        if (m === this.player) c.byPlayer = true;
        else if (Math.hypot(c.vx, c.vy) < 300) c.byPlayer = false;
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
      // Office-chair bowling: a chair you sent flying bowls over whoever it rolls into.
      const speed = Math.hypot(c.vx, c.vy);
      if (speed > 300 && c.byPlayer && this.phase === "downsizing") {
        for (const e of [...this.enemies]) {
          if (e.dead || !e.hostile) continue;
          if ((e.x - c.x) ** 2 + (e.y - c.y) ** 2 > (e.r + 17) ** 2) continue;
          if ((e.x - c.x) * c.vx + (e.y - c.y) * c.vy <= 0) continue;
          const ang = Math.atan2(c.vy, c.vx);
          e.stun = Math.max(e.stun, 0.7);
          this.fx.text(e.x, e.y - 40, "STRIKE!", { color: "#6aa3b4", size: 16, pop: true, dur: 0.7 });
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
    } else if (this.camFocus) {
      tx = this.camFocus.x;
      ty = this.camFocus.y;
      this.camX = damp(this.camX, tx, 3, dt);
      this.camY = damp(this.camY, ty, 3, dt);
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

  private hudT = 0;
  private hpGfx!: Phaser.GameObjects.Graphics;
  private hpBars: number[] = [];
  private flowTurn = 0;

  /** Enemies queue their health bars; one Graphics draws them all after the update. */
  queueHpBar(x: number, y: number, w: number, frac: number, color: number) {
    this.hpBars.push(x, y, w, frac, color);
  }

  private drawHpBars() {
    const g = this.hpGfx;
    g.clear();
    const b = this.hpBars;
    for (let i = 0; i < b.length; i += 5) {
      g.fillStyle(0x1c1d21, 0.75).fillRect(b[i] - 1, b[i + 1], b[i + 2] + 2, 7);
      g.fillStyle(b[i + 4], 1).fillRect(b[i], b[i + 1] + 1, b[i + 2] * b[i + 3], 5);
    }
    b.length = 0;
  }
  private updateHud(dt: number) {
    const p = this.player;
    const st = GameState.stats;
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.06;
      this.updateHudSlow();
    }
    this.updateHudFast(dt);
  }

  private updateHudSlow() {
    const p = this.player;
    const st = GameState.stats;
    this.ui.setDay(GameState.day, GameState.bank);
    this.ui.setHearts(GameState.hp, st.maxHp, p.tempHp);
    this.ui.setWeapons({
      armed: p.armed,
      active: p.weapon,
      slots: WEAPONS.filter((w) => p.weaponUnlocked(w)).map((w, i) => ({ id: w, key: i + 1, name: WEAPON_DEFS[w].name, color: WEAPON_DEFS[w].color, ...p.ammoFor(w) }))
    });
    this.ui.setDodge(p.dodgeCharges, st.dodgeCharges);
    this.ui.setPerks(GameState.stacks, PERK_BY_ID);
    if (this.phase === "crunch") {
      this.ui.setClock(formatClock(Math.max(0, this.crunchLeft), this.crunchTotal), Math.max(0, this.crunchLeft), this.crunchLeft < 20, this.crunchTotal);
      const items = this.dayCfg.chores.map((c) => ({ label: CHORE_INFO[c].label, room: this.stations.roomOf(c), done: this.choresDone.has(c) }));
      this.ui.setDusk(1 - Math.max(0, this.crunchLeft) / this.crunchTotal);
      this.ui.setChores(items, "");
      this.ui.setClockout(this.allChoresDone(), this.crunchLeft);
    }
    if (this.phase === "downsizing" || this.phase === "dayclear") this.syncQuota();
  }

  /** The FIRED x / y bar. Also called on every firing and at the end of the day, so the last one always shows. */
  private syncQuota() {
    const boss = this.waves.boss;
    this.ui.setQuota(this.fired, this.quota, this.fired >= this.quota && !!boss && !boss.dead);
  }

  private updateHudFast(dt: number) {
    const p = this.player;
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
          if (chore) dots.push({ x: s.x, y: s.y, color: "#e9c25a", r: 3.2 });
        }
      }
      const endgame = this.phase === "downsizing" && this.quota - this.fired <= 5;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.hostile && this.vision.on && e.vis < 0.5 && !endgame && !e.def.boss) continue;
        dots.push({ x: e.x, y: e.y, color: e.ally ? "#4b9a63" : e.hostile ? (e.def.boss ? "#e9c25a" : "#c4382c") : "#8b95a7", r: e.def.boss ? 4 : 2 });
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
      for (const s of this.stations.list) if (s.marker && s.marker.visible) add(s.x, s.y, "#e9c25a", "exclamation");
    } else if (this.phase === "downsizing") {
      const p = this.player;
      // Hunting is the point: arrows only show up for the last few firings (and for bosses).
      const endgame = this.quota - this.fired <= 5;
      const list = this.enemies.filter((e) => e.hostile && !e.dead && (endgame || e.def.boss))
        .sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2)).slice(0, 10);
      for (const e of list) add(e.x, e.y, e.def.boss ? "#e9c25a" : "#c4382c", e.def.boss ? "skull" : undefined);
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
      firePressed: this.lmbPressed && !this.paused,
      dodge: P("Space") || P("ShiftLeft") || P("ShiftRight") || this.rmb,
      reload: P("KeyR"),
      switchTo: this.digitPressed(),
      cycle: P("KeyQ") ? 1 : this.wheel
    };
    this.rmb = false;
    this.lmbPressed = false;
    this.wheel = 0;
    return inp;
  }

  private digitPressed(): number | null {
    for (let k = 1; k <= 9; k++) if (this.pressed.has(`Digit${k}`) || this.pressed.has(`Numpad${k}`)) return k - 1;
    return null;
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
        howto: () => this.ui.showHowTo(() => {}),
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
    this.ui.skipBrief();
    if (this.phase === "title") { this.ui.closeScreen("title"); this.startRun(); this.ui.skipBrief(); }
    if (this.phase === "crunch") this.endCrunch(true);
    this.ui.skipBrief();
    if (this.phase === "review") { this.ui.closeScreen("review"); this.startDownsizing(); }
    if (this.phase === "announce") { this.briefing = false; this.startDownsizing(); }
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
    if (this.phase === "announce" && this.pressed.has("Space") && !this.briefing) this.skipAnnounce();
    if (this.paused) { this.pressed.clear(); return; }

    this.timed("fx", () => this.fx.update(realDt));
    const dt = this.fx.hitstop > 0 ? 0 : realDt * this.fx.timeScale;
    if (this.barkCd > 0) this.barkCd -= realDt;
    if (this.holsterToastCd > 0) this.holsterToastCd -= realDt;

    const inp = this.readInput();
    this.laserGfx.clear();
    this.teleGfx.clear();

    // Flow fields follow the player.
    this.flowTimer -= dt;
    const ptile = Math.floor(this.player.y / TILE) * MAP_W + Math.floor(this.player.x / TILE);
    if (this.phase === "downsizing" && (this.flowTimer <= 0 || (ptile !== this.flowTile && this.flowTimer < 0.1))) {
      // One field per tick, round-robin: no single frame pays for all of them.
      this.flowTimer = 0.14;
      const bossUp = !!(this.waves.boss && !this.waves.boss.dead);
      const turn = this.flowTurn++ % (bossUp ? 3 : 2);
      if (turn === 0) this.flowTile = ptile;
      this.timed("flow", () => {
        if (turn === 0) this.flowNaive.compute(this.player.x, this.player.y);
        else if (turn === 1) this.flowSmart.compute(this.player.x, this.player.y);
        else this.flowBoss.compute(this.player.x, this.player.y);
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
        this.player.update(dt, { ...inp, fire: false, firePressed: false, dodge: false });
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
      this.timed("props", () => this.props.update(dt));
    }
    this.timed("stations", () => this.stations.update(dt));
    if (this.phase === "downsizing" || this.phase === "dayclear") this.updatePhoneBombs(dt);
    this.vault.update(dt);
    this.speakers.update(realDt);
    this.updateChainLines(realDt);
    this.drawHpBars();
    if (this.phase !== "downsizing" && this.phase !== "crunch") this.ui.setPrompt(null);

    this.updateCamera(realDt, inp.aimX, inp.aimY);
    this.updateLighting(realDt);
    this.timed("vision", () => this.vision.update(realDt));
    // Coworkers out of your line of sight fade into the dark.
    const fog = this.vision.on;
    for (const e of this.enemies) {
      const want = !fog || e.mode !== "hostile" || this.vision.sees(e.x, e.y, e.r) ? 1 : 0;
      e.vis += clamp(want - e.vis, -realDt * 5, realDt * 9);
    }
    if (this.phase === "crunch" || this.phase === "downsizing" || this.phase === "dayclear") this.timed("hud", () => this.updateHud(realDt));
    else this.ui.setArrows([]);
    this.pressed.clear();
  }

  /** Too much fire trips the ceiling sprinklers: they douse the blaze... and flood the floor. */
  private updateSprinklers(dt: number) {
    if (this.sprinklerCd > 0) this.sprinklerCd -= dt;
    if (this.sprinklerT > 0) {
      this.sprinklerT -= dt;
      // Patches of the office flood while it rains indoors.
      for (let i = this.sprinklerFloods.length - 1; i >= 0; i--) {
        const f = this.sprinklerFloods[i];
        f.t -= dt;
        if (f.t > 0) continue;
        this.hazards.flood(f.x, f.y, f.size, 0.07);
        this.sprinklerFloods.splice(i, 1);
      }
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
    if (this.sprinklerCd <= 0 && this.hazards.burningCount >= 18) this.activateSprinklers("SPRINKLERS ACTIVATED", "Fire's out. Floor's wet. Mind the power strips.");
  }

  /** Ceiling sprinklers: douse the fires and leave small puddles all over the office. */
  activateSprinklers(title: string, sub: string) {
    this.sprinklerCd = 30;
    this.sprinklerT = 4;
    this.ui.banner(title, sub, "#6aa3b4", 2.2);
    this.audio.play("alert", { vol: 0.6 });
    this.audio.play("splash", { vol: 0.5 });
    this.sprinklerAt = { x: this.player.x, y: this.player.y };
    this.sprinklerFloods = [];
    for (let k = 0; k < 16; k++) {
      const pt = this.randomFloorPoint();
      if (pt) this.sprinklerFloods.push({ ...pt, t: rand(0.2, 3.6), size: Math.floor(rand(3, 8)) });
    }
    // A few right where the boss can see them.
    for (let k = 0; k < 3; k++) {
      const pt = this.world.nearestWalkable(this.player.x + rand(-420, 420), this.player.y + rand(-300, 300));
      this.sprinklerFloods.push({ ...pt, t: rand(0.3, 2.5), size: Math.floor(rand(3, 6)) });
    }
  }

  private randomFloorPoint(): { x: number; y: number } | null {
    for (let k = 0; k < 40; k++) {
      const tx = 1 + Math.floor(Math.random() * (MAP_W - 2)), ty = 1 + Math.floor(Math.random() * (MAP_H - 2));
      if (this.world.walkableTile(tx, ty)) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return null;
  }

  /** Blame Game: the coworker who hit you becomes everyone's problem. */
  makeScapegoat(e: Enemy) {
    if (e.scapegoat > 0) { e.scapegoat = 5; return; }
    e.scapegoat = 5;
    this.fx.text(e.x, e.y - 50, "IT WAS THEM!", { color: "#d98a3a", size: 18, pop: true, dur: 1 });
    this.audio.play("alert", { vol: 0.35, rate: 1.3, minGap: 300 });
  }

  /** Office Romance: a heart on the floor. Whoever steps on it is smitten for a while. */
  dropHeart(x: number, y: number) {
    const sprite = this.add.image(x, y, "p_heart").setDepth(DEPTH.DECAL + 5);
    this.tweens.add({ targets: sprite, scale: { from: 0.4, to: 1 }, duration: 260, ease: "Back.easeOut" });
    this.hearts.push({ x, y, life: 8, sprite });
  }

  private updateHearts(dt: number) {
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.life -= dt;
      h.sprite.setScale(1 + Math.sin(this.time.now / 160) * 0.08).setAlpha(Math.min(1, h.life));
      const e = this.enemies.find((o) => !o.dead && o.hostile && !o.def.boss && (o.x - h.x) ** 2 + (o.y - h.y) ** 2 < (o.r + 16) ** 2);
      if (e) {
        e.makeAlly(10);
        e.charmed = true;
        this.fx.text(e.x, e.y - 46, "SMITTEN!", { color: "#cf6a4c", size: 18, pop: true, dur: 1 });
        this.fx.burst("confetti", e.x, e.y, 10, 0xcf6a4c);
        this.audio.play("powerup", { vol: 0.35, rate: 1.4 });
      }
      if (e || h.life <= 0) {
        h.sprite.destroy();
        this.hearts.splice(i, 1);
      }
    }
  }

  /** Black Hole Binder: drag every coworker nearby into one tidy pile. */
  vortex(x: number, y: number) {
    this.vortices.push({ x, y, t: 2, a: 0 });
    this.audio.play("powerdown", { vol: 0.45, rate: 1.5 });
    this.fx.light(x, y, 0x6b6f9a, 2.6, 0.3);
  }

  private updateVortices(dt: number) {
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.t -= dt;
      v.a += dt * 7;
      for (const e of this.enemies) {
        if (e.dead || !e.hostile || e.def.boss) continue;
        const dx = v.x - e.x, dy = v.y - e.y, d = Math.hypot(dx, dy);
        if (d > 300 || d < 6) continue;
        const pull = (80 + 260 * (1 - d / 300)) * dt;
        const pos = { x: e.x, y: e.y };
        this.world.moveCircle(pos, e.r, (dx / d) * pull, (dy / d) * pull);
        e.x = pos.x;
        e.y = pos.y;
      }
      if (Math.random() < dt * 20) this.fx.burst("pixel", v.x + rand(-60, 60), v.y + rand(-60, 60), 1, 0x6b6f9a);
      if (v.t <= 0) {
        this.fx.burst("star", v.x, v.y, 10, 0x6b6f9a);
        this.vortices.splice(i, 1);
      }
    }
  }

  /** Live Wire: an overloaded power strip arcs to the nearest coworker. */
  teslaZap(x: number, y: number, e: Enemy) {
    this.zapLine(x, y - 6, e.x, e.y);
    this.audio.play("zap", { vol: 0.3, minGap: 80 });
    this.fx.burst("zap", e.x, e.y, 6);
    if (this.hitEnemy(e, 30 * GameState.stats.hazardMult, { angle: Math.atan2(e.y - y, e.x - x), kind: "zap", x: e.x, y: e.y, knock: 60 })) this.trapKill(e.x, e.y);
  }

  /** Keyboard: a wide melee arc that also swats enemy shots back at the nearest coworker. */
  keyboardSwing(x: number, y: number, a: number, hot: boolean) {
    const st = GameState.stats;
    const reach = 92 * Math.sqrt(st.sizeMult) + 14;
    const arc = 1.05;
    let hits = 0;
    for (const e of [...this.enemies]) {
      if (e.dead || !e.hostile) continue;
      const dx = e.x - x, dy = e.y - y;
      if (Math.hypot(dx, dy) > reach + e.r) continue;
      const ea = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(a, ea)) > arc) continue;
      hits++;
      // A keyboard to the face knocks a riot shield aside.
      e.stun = Math.max(e.stun, e.def.shield ? 0.9 : 0.3);
      this.hitEnemy(e, 40 * st.dmgMult * (hot ? 2 : 1), { angle: ea, kind: "keyboard", x: e.x, y: e.y, knock: 520 });
    }
    let deflected = 0;
    for (const p of this.projectiles.list) {
      if (!p.active || p.friendly) continue;
      const dx = p.x - x, dy = p.y - y;
      if (Math.hypot(dx, dy) > reach + 24 || Math.abs(angleDiff(a, Math.atan2(dy, dx))) > arc + 0.25) continue;
      const t = this.nearestEnemy(p.x, p.y, 700);
      this.projectiles.deflect(p, t ? Math.atan2(t.y - p.y, t.x - p.x) : a);
      deflected++;
    }
    this.swings.push({ x, y, a, life: 0.13 });
    this.audio.play(hits ? "hit_heavy" : "dodge", { vol: hits ? 0.5 : 0.35, rate: hits ? 1 : 1.5, minGap: 60 });
    if (hits) { this.fx.shake(0.18); this.fx.stop(30); }
    if (deflected) {
      this.audio.play("ping", { vol: 0.5, rate: 0.8 });
      this.fx.text(x + Math.cos(a) * 60, y + Math.sin(a) * 60 - 20, pick(["CTRL+Z!", "RETURN TO SENDER", "DENIED", "ESC!"]), { color: "#6aa3b4", size: 16, pop: true, dur: 0.7 });
    }
    for (let k = 0; k < (hits ? 3 : 1); k++) {
      this.fx.text(x + Math.cos(a) * rand(30, 80), y + Math.sin(a) * rand(30, 80), pick(["Q", "W", "E", "R", "T", "Y", "ESC", "F5", "ALT"]), { color: "#ffffff", size: 12, dur: 0.5, rise: 60 });
    }
  }

  /** Toner Bomb landing: a blast that cracks drywall, then a choking cloud that slows everyone in it. */
  tonerBlast(x: number, y: number) {
    const st = GameState.stats;
    const r = 120 * Math.sqrt(st.sizeMult);
    this.explosion(x, y, r, 70 * st.dmgMult, { friendly: true });
    this.fx.burst("smoke", x, y, 14, 0x2a2a35);
    for (const e of this.enemies) {
      if (!e.dead && e.hostile && (e.x - x) ** 2 + (e.y - y) ** 2 < (r * 1.3) ** 2) e.slow = Math.max(e.slow, 2.5);
    }
    this.fx.decal(x, y, "fx_scorch_02", { scale: r / 260, alpha: 0.8, tint: 0x15151f });
  }

  private updateChainLines(dt: number) {
    const g = this.chainGfx;
    g.clear();
    for (const v of this.vortices) {
      const k = Math.min(1, v.t);
      for (let r = 0; r < 3; r++) {
        g.lineStyle(5 - r, 0x6b6f9a, 0.55 * k);
        g.beginPath();
        g.arc(v.x, v.y, 40 + r * 34, v.a + r * 1.7, v.a + r * 1.7 + 2.2, false);
        g.strokePath();
      }
    }
    if (this.player.dugIn) {
      g.lineStyle(4, 0x6aa3b4, 0.5 + 0.2 * Math.sin(this.time.now / 140));
      g.strokeCircle(this.player.x, this.player.y + 4, 30);
    }
    for (let i = this.swings.length - 1; i >= 0; i--) {
      const s = this.swings[i];
      s.life -= dt;
      if (s.life <= 0) { this.swings.splice(i, 1); continue; }
      const k = s.life / 0.13;
      const sweep = (1 - k) * 0.9;
      g.lineStyle(14, 0xffffff, 0.35 * k);
      g.beginPath();
      g.arc(s.x, s.y, 74, s.a - 1.05 + sweep, s.a + 1.05 * k, false);
      g.strokePath();
      g.lineStyle(5, 0x6aa3b4, 0.9 * k);
      g.beginPath();
      g.arc(s.x, s.y, 86, s.a - 1.05 + sweep, s.a + 1.05 * k, false);
      g.strokePath();
    }
    for (let i = this.chainLines.length - 1; i >= 0; i--) {
      const l = this.chainLines[i];
      l.life -= dt;
      if (l.life <= 0) { this.chainLines.splice(i, 1); continue; }
      const a = l.life / 0.14;
      g.lineStyle(6, 0x6aa3b4, 0.25 * a);
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
