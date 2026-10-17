// The office floor plan. Pure data: tiles, furniture placements,
// interactable stations, doors and enemy spawn points. Everything is
// expressed in tile units (1 = 64px) and converted to world pixels.
//
// Layout (64 x 46): a ring of halls around a concrete Server Core, big
// open-plan wings east and west, and a row of distinct rooms along the
// north and south edges. Interior walls are drywall: bosses and big
// explosions can smash straight through them.
import { MAP_W, MAP_H, TILE } from "../config";

export const enum Tile {
  WALL = 0,
  FLOOR = 1,
  GLASS = 2,
  ELEVATOR = 3,
  EXIT_DOOR = 4,
  DRYWALL = 5,
  /** The code-locked security door (see systems/Vault). */
  LOCKED = 6
}

export const enum Mat {
  NONE = 0,
  CARPET = 1,
  CARPET_GREY = 2,
  CARPET_BEIGE = 3,
  WOOD = 4,
  KITCHEN = 5,
  MARBLE = 6,
  RESTROOM = 7,
  SERVER = 8,
  CONCRETE = 9,
  STAIRS = 10,
  HALL = 11,
  CARPET_TEAL = 12
}

export interface FurnPlacement {
  key: string; // furniture sprite key (see public/assets/furniture/manifest.json) or "partition"
  x: number; // world px, centre of the ground footprint
  y: number;
  w?: number; // explicit footprint override (px)
  h?: number;
  id?: string;
  solid?: boolean;
  shots?: boolean; // blocks projectiles
  floor?: boolean; // drawn flat under everything (rugs)
}

export type StationKind =
  | "emails" | "copier" | "shred" | "coffee" | "presentation" | "memos" | "server" | "plant"
  | "cooler" | "powerstrip" | "vending" | "supply" | "toilet" | "arcade" | "fridge"
  // chore hosts that move around: desktop printers, the Wi-Fi router, the mail cart (spawned daily), whiteboards
  | "printer" | "router" | "mailcart" | "board";

export interface StationDef {
  id: string;
  kind: StationKind;
  x: number;
  y: number;
  furnId?: string;
  doorId?: string;
  main?: boolean; // the main copier hosts the "Print Q4 Budget" chore
}

export interface DoorDef {
  id: string;
  x: number; // centre px
  y: number;
  w: number;
  h: number;
  barricadable: boolean;
}

export interface SpawnDef {
  id: string;
  kind: "elevator" | "stairs" | "exit";
  x: number;
  y: number;
  doorTx?: number; // tile of the door graphic (elevators / fire exits)
  doorTy?: number;
}

export interface NpcHome {
  x: number;
  y: number;
  facing: number; // radians
}

export interface ZoneDef {
  name: string;
  x0: number; y0: number; x1: number; y1: number; // tiles, inclusive
}

export interface OfficeMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  mats: Uint8Array;
  /** Zone index per tile (-1 = walls). Used for room ambushes. */
  zoneGrid: Int16Array;
  furniture: FurnPlacement[];
  stations: StationDef[];
  doors: DoorDef[];
  spawns: SpawnDef[];
  npcHomes: NpcHome[];
  zones: ZoneDef[];
  playerSpawn: { x: number; y: number };
  wanderSpots: { x: number; y: number }[];
}

const P = (t: number) => t * TILE;
const UP = -Math.PI / 2, DOWN = Math.PI / 2, LEFT = Math.PI, RIGHT = 0;

export function buildOffice(): OfficeMap {
  const W = MAP_W, H = MAP_H;
  const tiles = new Uint8Array(W * H).fill(Tile.WALL);
  const mats = new Uint8Array(W * H).fill(Mat.NONE);
  const furniture: FurnPlacement[] = [];
  const stations: StationDef[] = [];
  const doors: DoorDef[] = [];
  const spawns: SpawnDef[] = [];
  const npcHomes: NpcHome[] = [];
  const zones: ZoneDef[] = [];
  const wanderSpots: { x: number; y: number }[] = [];

  const set = (x: number, y: number, t: Tile, m?: Mat) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    tiles[y * W + x] = t;
    if (m !== undefined) mats[y * W + x] = m;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, t: Tile, m?: Mat) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t, m);
  };
  const room = (name: string, x0: number, y0: number, x1: number, y1: number, m: Mat) => {
    fill(x0, y0, x1, y1, Tile.FLOOR, m);
    zones.push({ name, x0, y0, x1, y1 });
  };
  const matAt = (x: number, y: number) => mats[y * W + x];
  // Carve a doorway through a wall run; it inherits the floor of the room below/right.
  const door = (id: string, x0: number, y0: number, x1: number, y1: number, barricadable = true, mat?: Mat) => {
    const m = mat ?? (matAt(x0, y1 + 1) || matAt(x1 + 1, y0) || Mat.HALL);
    fill(x0, y0, x1, y1, Tile.FLOOR, m);
    doors.push({ id, x: P((x0 + x1 + 1) / 2), y: P((y0 + y1 + 1) / 2), w: P(x1 - x0 + 1), h: P(y1 - y0 + 1), barricadable });
  };
  const glass = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, Tile.GLASS, matAt(x, y + 1) || matAt(x + 1, y) || Mat.HALL);
  };
  let furnCounter = 0;
  const place = (key: string, tx: number, ty: number, extra: Partial<FurnPlacement> = {}) => {
    const id = extra.id ?? `f${furnCounter++}`;
    furniture.push({ key, x: P(tx), y: P(ty), ...extra, id });
    return id;
  };
  const station = (kind: StationKind, furnId: string | undefined, tx: number, ty: number, extra: Partial<StationDef> = {}) => {
    stations.push({ id: extra.id ?? `${kind}_${stations.length}`, kind, furnId, x: P(tx), y: P(ty), ...extra });
  };
  const home = (tx: number, ty: number, facing: number) => npcHomes.push({ x: P(tx), y: P(ty), facing });
  // Water coolers and power strips are not part of the floor plan: they turn up somewhere new every day (Stations.randomizeProps).
  const plant = (tx: number, ty: number) => place("plant", tx, ty);
  const copier = (id: string, tx: number, ty: number, main = false) => station("copier", place("copier", tx, ty, { id }), tx, ty, { id, main });

  // ================================================================== shell
  // North rooms ---------------------------------------------------------
  room("Executive Suite", 1, 1, 13, 11, Mat.WOOD);
  room("Boardroom", 15, 1, 28, 11, Mat.WOOD);
  room("Cafeteria", 30, 1, 46, 11, Mat.KITCHEN);
  room("Restrooms", 48, 1, 53, 11, Mat.RESTROOM);
  room("Marketing Lounge", 55, 1, 62, 11, Mat.CARPET_TEAL);
  for (const x of [14, 29, 47, 54]) fill(x, 1, x, 11, Tile.DRYWALL);
  fill(1, 12, 62, 12, Tile.DRYWALL);
  // Halls ---------------------------------------------------------------
  room("North Hall", 1, 13, 62, 15, Mat.HALL);
  room("South Hall", 1, 30, 62, 32, Mat.HALL);
  room("West Hall", 21, 16, 23, 29, Mat.HALL);
  room("East Hall", 40, 16, 42, 29, Mat.HALL);
  // Wings ---------------------------------------------------------------
  room("West Wing", 1, 16, 20, 29, Mat.CARPET);
  room("East Wing", 43, 16, 62, 29, Mat.CARPET_TEAL);
  // Server core: a concrete ring with one door and the elevator bank on its south face.
  room("Server Core", 25, 17, 38, 28, Mat.SERVER);
  // South rooms ---------------------------------------------------------
  fill(1, 33, 62, 33, Tile.DRYWALL);
  room("HR Department", 1, 34, 12, 44, Mat.CARPET_BEIGE);
  room("Copy Center", 14, 34, 27, 44, Mat.CARPET_GREY);
  room("Supply Closet", 29, 34, 34, 44, Mat.CONCRETE);
  room("Mail Room", 36, 34, 45, 44, Mat.CONCRETE);
  room("Lobby", 47, 34, 62, 44, Mat.MARBLE);
  for (const x of [13, 28, 35, 46]) fill(x, 34, x, 44, Tile.DRYWALL);
  // West fire stairs: a small walled room in the corner of the west wing.
  fill(5, 24, 5, 29, Tile.DRYWALL);
  fill(1, 24, 5, 24, Tile.DRYWALL);
  fill(1, 25, 4, 29, Tile.FLOOR, Mat.STAIRS);
  zones.push({ name: "West Stairs", x0: 1, y0: 25, x1: 4, y1: 29 });
  fill(41, 40, 45, 44, Tile.FLOOR, Mat.STAIRS);

  // ================================================================== doors / glass
  glass(2, 12, 5, 12); glass(10, 12, 12, 12);
  door("exec", 7, 12, 8, 12, true, Mat.WOOD);
  glass(16, 12, 19, 12); glass(24, 12, 27, 12);
  door("board", 21, 12, 22, 12, true, Mat.WOOD);
  door("cafeA", 33, 12, 34, 12, true, Mat.KITCHEN);
  door("cafeB", 42, 12, 43, 12, true, Mat.KITCHEN);
  door("restroom", 50, 12, 51, 12, false, Mat.RESTROOM);
  door("lounge", 58, 12, 59, 12, true, Mat.CARPET_TEAL);
  door("core", 31, 16, 32, 16, true, Mat.SERVER);
  door("stairsW", 5, 27, 5, 28, true, Mat.STAIRS);
  glass(2, 33, 4, 33); glass(9, 33, 11, 33);
  door("hr", 6, 33, 7, 33, true, Mat.CARPET_BEIGE);
  door("copy", 20, 33, 21, 33, true, Mat.CARPET_GREY);
  door("supply", 31, 33, 32, 33, true, Mat.CONCRETE);
  door("mail", 39, 33, 41, 33, false, Mat.CONCRETE);
  door("lobby", 50, 33, 53, 33, false, Mat.MARBLE);
  glass(46, 36, 46, 38);

  // ================================================================== spawns
  for (const [i, tx] of [27, 31, 35].entries()) {
    set(tx, 29, Tile.ELEVATOR); set(tx + 1, 29, Tile.ELEVATOR);
    spawns.push({ id: `elevator${i}`, kind: "elevator", x: P(tx + 1), y: P(30.6), doorTx: tx, doorTy: 29 });
  }
  set(39, 0, Tile.EXIT_DOOR); set(40, 0, Tile.EXIT_DOOR);
  spawns.push({ id: "fireexitN", kind: "exit", x: P(40), y: P(1.6), doorTx: 39, doorTy: 0 });
  set(59, 0, Tile.EXIT_DOOR); set(60, 0, Tile.EXIT_DOOR);
  spawns.push({ id: "fireexitNE", kind: "exit", x: P(60), y: P(1.6), doorTx: 59, doorTy: 0 });
  set(58, 33, Tile.EXIT_DOOR); set(59, 33, Tile.EXIT_DOOR);
  spawns.push({ id: "lobbyStairs", kind: "exit", x: P(59), y: P(34.6), doorTx: 58, doorTy: 33 });
  spawns.push({ id: "stairsW", kind: "stairs", x: P(2.6), y: P(27.2) });
  spawns.push({ id: "stairsSE1", kind: "stairs", x: P(43.5), y: P(41.6) });
  spawns.push({ id: "stairsSE2", kind: "stairs", x: P(43.5), y: P(43.6) });

  // ================================================================== Executive Suite
  const execDesk = place("exec_desk", 7.0, 3.2);
  place("chair_exec_180", 6.35, 3.75, { solid: false });
  station("emails", execDesk, 7.0, 3.2, { id: "emails" });
  place("bookcase", 3.0, 1.4); place("bookcase", 11.0, 1.4);
  place("rug_exec", 7.0, 7.2, { floor: true, solid: false, shots: false });
  place("sofa_exec_90", 1.6, 7.2);
  place("coffee_table", 3.4, 7.2);
  station("plant", plant(12.4, 1.6), 12.4, 1.6, { id: "ceo_plant" });
  plant(1.6, 10.4); plant(12.4, 10.4);
  place("coatrack", 10.2, 10.5);
  place("lamp", 1.5, 1.5);

  // ================================================================== Boardroom
  place("conf_table", 21.5, 6.2);
  for (const tx of [19.6, 21.5, 23.4]) {
    place("chair_conf_0", tx, 4.65, { solid: false });
    place("chair_conf_180", tx, 7.8, { solid: false });
  }
  place("chair_conf_90", 18.3, 6.2, { solid: false });
  place("chair_conf_270", 24.7, 6.2, { solid: false });
  home(19.6, 4.6, DOWN); home(23.4, 7.85, UP); home(24.75, 6.2, LEFT);
  station("presentation", place("tv", 21.5, 1.35), 21.5, 1.35, { id: "presentation" });
  station("board", place("whiteboard", 16.9, 1.25), 16.9, 1.25, { id: "board_room_l" });
  station("board", place("whiteboard", 26.2, 1.25), 26.2, 1.25, { id: "board_room_r" });
  plant(15.5, 10.5); plant(28.4, 10.5); plant(28.4, 1.6);

  // ================================================================== Cafeteria
  place("counter_sink", 30.6, 1.55);
  station("coffee", place("coffee_station", 31.65, 1.55, { id: "coffee_station" }), 31.65, 1.55, { id: "coffee" });
  place("counter_microwave", 32.7, 1.55);
  place("counter", 33.75, 1.55);
  station("fridge", place("fridge", 35.2, 1.55), 35.2, 1.55, { id: "fridge" });
  station("vending", place("vending", 30.9, 5.6), 30.9, 5.6, { id: "vending_1" });
  station("vending", place("vending_b", 30.9, 7.2), 30.9, 7.2, { id: "vending_2" });
  for (const [tx, ty] of [[35.5, 6.0], [39.5, 6.0], [43.5, 6.0]] as const) {
    place("break_table", tx, ty);
    place("stool", tx - 1.05, ty, { solid: false });
    place("stool", tx + 1.05, ty, { solid: false });
    place("stool", tx, ty + 1.15, { solid: false });
    home(tx - 1.05, ty, RIGHT);
  }
  place("sofa_break_180", 39.5, 10.55);
  plant(46.3, 10.5); plant(30.6, 10.5);
  place("trash", 36.8, 1.7);

  // ================================================================== Restrooms
  station("toilet", place("toilet_180", 48.9, 1.7), 48.9, 1.7, { id: "toilet" });
  place("toilet_180", 50.7, 1.7);
  place("partition", 49.85, 2.0, { w: 10, h: 120 });
  place("sink", 52.4, 1.5); place("sink", 53.4, 1.5);
  place("trash", 48.6, 10.6);
  plant(53.4, 10.5);

  // ================================================================== Marketing Lounge
  place("rug_round", 58.6, 6.4, { floor: true, solid: false, shots: false });
  station("arcade", place("arcade", 61.6, 3.4), 61.6, 3.4, { id: "arcade" });
  place("claw", 61.5, 5.6);
  place("sofa_lobby_180", 58.4, 9.4);
  place("armchair_lobby_90", 55.9, 6.4);
  place("coffee_table", 58.4, 6.6);
  station("board", place("whiteboard", 57.4, 1.25), 57.4, 1.25, { id: "board_lounge" });
  home(58.0, 8.55, UP); home(56.9, 6.4, RIGHT);
  plant(62.4, 10.5); plant(55.6, 10.5);

  // ================================================================== open-plan wings
  const pod = (px: number, py: number) => {
    const variants = ["ws_a", "ws_b", "ws_c"];
    for (let i = 0; i < 3; i++) {
      const cx = px + 0.95 + i * 1.8;
      place(`${variants[(i + Math.floor(px)) % 3]}_180`, cx, py + 1.25);
      place(`${variants[(i + Math.floor(px) + 1) % 3]}_0`, cx, py + 2.35);
      place("chair_office_0", cx, py + 0.38, { solid: false });
      place("chair_office_180", cx, py + 3.25, { solid: false });
      home(cx, py + 0.3, DOWN);
      home(cx, py + 3.32, UP);
    }
    place("trash", px + 5.85, py + 0.45);
    plant(px - 0.35, py + 3.1);
  };
  // West wing
  pod(2, 16.6); pod(8.5, 16.6); pod(15, 16.6);
  pod(8.5, 21.4); pod(15, 21.4);
  copier("copier_west", 2.4, 22.0);
  plant(20.4, 29.4); plant(6.6, 29.4);
  place("break_table", 11.5, 27.6);
  place("stool", 10.45, 27.6, { solid: false });
  place("stool", 12.55, 27.6, { solid: false });
  // East wing
  pod(44, 16.6); pod(50.5, 16.6); pod(57, 16.6);
  pod(44, 21.4); pod(50.5, 21.4);
  station("board", place("whiteboard", 59.8, 21.25), 59.8, 21.25, { id: "board_east" });
  place("break_table", 59.8, 23.6);
  place("stool", 58.75, 23.6, { solid: false });
  place("stool", 60.85, 23.6, { solid: false });
  home(58.75, 23.6, RIGHT);
  copier("copier_east", 61.6, 27.6);
  plant(43.6, 29.4); plant(62.4, 21.6);
  // Halls: a little dressing so they're not empty runways
  for (const tx of [9.5, 26.5, 37.5, 52.5]) plant(tx, 13.4);
  for (const tx of [9.5, 26.5, 56.5]) plant(tx, 32.5);

  // ================================================================== Server Core
  for (const ty of [18.8, 22.0]) for (const tx of [27.0, 29.3, 34.7, 37.0]) place("server", tx, ty);
  station("server", place("server_console", 32.0, 27.4), 32.0, 27.4, { id: "server" });
  place("generator", 26.6, 26.7);
  place("antenna", 37.3, 26.8);

  // ================================================================== HR Department
  station("memos", place("ws_hr", 6.5, 37.2), 6.5, 37.2, { id: "memos" });
  place("chair_office_180", 6.5, 38.3, { solid: false });
  home(6.5, 38.35, UP);
  for (const tx of [1.6, 2.6, 10.4, 11.4]) place("filing", tx, 34.45);
  place("ws_hr", 3.6, 41.0);
  place("chair_office_180", 3.6, 42.1, { solid: false });
  home(3.6, 42.15, UP);
  place("ws_hr", 9.4, 41.0);
  place("chair_office_180", 9.4, 42.1, { solid: false });
  home(9.4, 42.15, UP);
  station("shred", place("shredder", 11.6, 43.6), 11.6, 43.6, { id: "shredder_hr" });
  plant(1.5, 43.5);
  place("chair_conf_0", 1.8, 38.2, { solid: false });
  place("chair_conf_0", 2.7, 38.2, { solid: false });

  // ================================================================== Copy Center
  copier("copier_main", 16.0, 35.0, true);
  copier("copier_2", 18.8, 35.0);
  station("shred", place("shredder", 22.6, 34.7), 22.6, 34.7, { id: "shredder" });
  station("supply", place("supply_shelf", 26.0, 35.1), 26.0, 35.1, { id: "supply_copy" });
  place("filing", 14.6, 38.4); place("filing", 14.6, 39.5);
  place("ws_c_0", 20.8, 39.8);
  home(19.6, 40.9, UP); home(22.0, 40.9, UP);
  for (const [tx, ty] of [[26.9, 43.6], [26.4, 43.7], [26.7, 43.2]] as const) place("box", tx, ty, ty === 43.2 ? { solid: false } : {});
  place("trash", 15.0, 43.6);

  // ================================================================== Supply Closet
  for (const [tx, ty] of [[30.1, 35.0], [33.7, 35.0], [30.1, 39.6], [33.7, 39.6]] as const) {
    const s = place("supply_shelf", tx, ty);
    if (tx === 30.1 && ty === 35.0) station("supply", s, tx, ty, { id: "supply_closet" });
  }
  place("box", 34.4, 43.4); place("box", 33.8, 43.6); place("box", 29.6, 43.5);

  // ================================================================== Mail Room
  place("supply_shelf", 37.1, 35.1);
  place("box", 44.6, 34.8); place("box", 45.1, 35.2);
  copier("copier_mail", 37.0, 39.4);
  place("trash", 36.6, 43.6);
  plant(45.4, 34.6);

  // ================================================================== Lobby
  station("emails", place("reception", 54.5, 38.6), 54.5, 38.6, { id: "emails_lobby" });
  place("chair_office_0", 54.5, 37.8, { solid: false });
  home(54.5, 37.75, DOWN);
  place("rug_lobby", 54.5, 42.2, { floor: true, solid: false, shots: false });
  place("sofa_lobby_180", 54.5, 44.1);
  place("armchair_lobby_90", 51.7, 42.2);
  place("armchair_lobby_270", 57.3, 42.2);
  place("coffee_table", 54.5, 42.2);
  home(51.7, 42.2, RIGHT);
  plant(47.6, 34.6); plant(62.4, 34.6); plant(47.6, 44.4); plant(62.4, 44.4);
  station("vending", place("vending_b", 61.6, 40.6), 61.6, 40.6, { id: "vending_3" });

  // ================================================================== misc
  const zoneGrid = new Int16Array(W * H).fill(-1);
  zones.forEach((z, zi) => {
    for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) {
      if (tiles[y * W + x] === Tile.FLOOR) zoneGrid[y * W + x] = zi;
    }
  });
  // Doorway tiles belong to the room they open into.
  for (const d of doors) {
    const tx = Math.floor(d.x / TILE), ty = Math.floor(d.y / TILE);
    const below = zoneGrid[(ty + 1) * W + tx];
    if (below >= 0) zoneGrid[ty * W + tx] = below;
  }
  const playerSpawn = { x: P(7.0), y: P(7.6) };
  for (const z of zones) {
    if (z.name.includes("Stairs") || z.name.includes("Hall")) continue;
    wanderSpots.push({ x: P((z.x0 + z.x1 + 1) / 2), y: P((z.y0 + z.y1 + 1) / 2) });
  }
  return { w: W, h: H, tiles, mats, zoneGrid, furniture, stations, doors, spawns, npcHomes, zones, playerSpawn, wanderSpots };
}

export function tileAt(map: OfficeMap, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return Tile.WALL;
  return map.tiles[ty * map.w + tx] as Tile;
}
