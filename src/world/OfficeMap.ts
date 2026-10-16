// The office floor plan. Pure data: tiles, furniture placements,
// interactable stations, doors and enemy spawn points. Everything is
// expressed in tile units (1 = 64px) and converted to world pixels.
import { MAP_W, MAP_H, TILE } from "../config";

export const enum Tile {
  WALL = 0,
  FLOOR = 1,
  GLASS = 2,
  ELEVATOR = 3,
  EXIT_DOOR = 4
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
  STAIRS = 10
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
  | "cooler" | "powerstrip" | "vending" | "supply" | "toilet" | "arcade" | "fridge" | "barricade";

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
  const room = (name: string, x0: number, y0: number, x1: number, y1: number, m: Mat) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, Tile.FLOOR, m);
    zones.push({ name, x0, y0, x1, y1 });
  };
  const matAt = (x: number, y: number) => mats[y * W + x];
  // Carve a doorway through a wall run; it inherits the floor of the room below/right.
  const door = (id: string, x0: number, y0: number, x1: number, y1: number, barricadable = true, mat?: Mat) => {
    const m = mat ?? (matAt(x0, y1 + 1) || matAt(x1 + 1, y0) || Mat.CARPET);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, Tile.FLOOR, m);
    doors.push({
      id,
      x: P((x0 + x1 + 1) / 2),
      y: P((y0 + y1 + 1) / 2),
      w: P(x1 - x0 + 1),
      h: P(y1 - y0 + 1),
      barricadable
    });
    if (barricadable) stations.push({ id: `barricade_${id}`, kind: "barricade", x: P((x0 + x1 + 1) / 2), y: P((y0 + y1 + 1) / 2), doorId: id });
  };
  const glass = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, Tile.GLASS, matAt(x, y + 1) || Mat.CARPET);
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
  const cooler = (tx: number, ty: number) => station("cooler", place("cooler", tx, ty), tx, ty);
  const strip = (tx: number, ty: number) => station("powerstrip", place("powerstrip", tx, ty, { solid: false, shots: false }), tx, ty);
  const plant = (tx: number, ty: number) => place("plant", tx, ty);

  // ------------------------------------------------------------------ rooms
  room("Executive Suite", 1, 1, 13, 9, Mat.WOOD);
  room("Restrooms", 15, 1, 20, 9, Mat.RESTROOM);
  room("Copy Room", 22, 1, 31, 9, Mat.CARPET_GREY);
  room("Break Room", 33, 1, 45, 9, Mat.KITCHEN);
  room("Open Office", 1, 11, 40, 29, Mat.CARPET);
  room("Lobby", 42, 11, 54, 29, Mat.MARBLE);
  room("Conference Room", 1, 31, 14, 40, Mat.WOOD);
  room("HR Office", 16, 31, 24, 40, Mat.CARPET_BEIGE);
  room("Server Room", 26, 31, 33, 40, Mat.SERVER);
  room("Supply Closet", 35, 31, 40, 40, Mat.CONCRETE);
  room("Mail Room", 42, 31, 54, 40, Mat.CONCRETE);

  // West fire stairs: a little walled room carved out of the open office.
  for (let y = 25; y <= 29; y++) set(5, y, Tile.WALL);
  for (let x = 1; x <= 5; x++) set(x, 25, Tile.WALL);
  for (let y = 26; y <= 29; y++) for (let x = 1; x <= 4; x++) set(x, y, Tile.FLOOR, Mat.STAIRS);
  zones.push({ name: "Fire Stairs", x0: 1, y0: 26, x1: 4, y1: 29 });
  for (let y = 36; y <= 40; y++) for (let x = 50; x <= 54; x++) set(x, y, Tile.FLOOR, Mat.STAIRS);

  // Lobby glass wall with two wide openings into the open office.
  for (let y = 11; y <= 29; y++) set(41, y, Tile.GLASS, Mat.MARBLE);
  for (const y of [15, 16, 17, 23, 24, 25]) set(41, y, Tile.FLOOR, Mat.MARBLE);

  // ------------------------------------------------------------------ doors / glass
  glass(2, 10, 4, 10); glass(9, 10, 12, 10);
  door("exec", 6, 10, 7, 10, true, Mat.WOOD);
  door("restroom", 17, 10, 18, 10, false, Mat.RESTROOM);
  glass(29, 10, 30, 10);
  door("copy", 25, 10, 26, 10, true, Mat.CARPET_GREY);
  glass(39, 10, 40, 10);
  door("breakA", 35, 10, 36, 10, true, Mat.KITCHEN);
  door("breakB", 42, 10, 43, 10, true, Mat.KITCHEN);
  door("stairsW", 5, 27, 5, 28, true, Mat.STAIRS);

  glass(2, 30, 5, 30); glass(8, 30, 10, 30);
  door("conf", 12, 30, 13, 30, true, Mat.WOOD);
  glass(22, 30, 23, 30);
  door("hr", 19, 30, 20, 30, true, Mat.CARPET_BEIGE);
  door("server", 28, 30, 29, 30, true, Mat.SERVER);
  door("supply", 37, 30, 38, 30, true, Mat.CONCRETE);
  door("mail", 46, 30, 48, 30, false, Mat.CONCRETE);

  // ------------------------------------------------------------------ spawns
  for (const [i, tx] of [47, 50, 53].entries()) {
    set(tx, 10, Tile.ELEVATOR); set(tx + 1, 10, Tile.ELEVATOR);
    spawns.push({ id: `elevator${i}`, kind: "elevator", x: P(tx + 1), y: P(11.6), doorTx: tx, doorTy: 10 });
  }
  set(41, 0, Tile.EXIT_DOOR); set(42, 0, Tile.EXIT_DOOR);
  spawns.push({ id: "fireexit", kind: "exit", x: P(42), y: P(1.6), doorTx: 41, doorTy: 0 });
  spawns.push({ id: "stairsW", kind: "stairs", x: P(2.6), y: P(27.8) });
  spawns.push({ id: "stairsSE1", kind: "stairs", x: P(52.5), y: P(37.5) });
  spawns.push({ id: "stairsSE2", kind: "stairs", x: P(52.5), y: P(39.4) });

  // ------------------------------------------------------------------ executive suite
  const execDesk = place("exec_desk", 7.0, 3.0);
  place("chair_exec_180", 6.35, 3.55, { solid: false });
  station("emails", execDesk, 7.0, 3.0, { id: "emails" });
  place("bookcase", 3.0, 1.4);
  place("bookcase", 11.0, 1.4);
  place("rug_exec", 7.0, 6.6, { floor: true, solid: false, shots: false });
  place("sofa_exec_90", 1.6, 6.6);
  place("coffee_table", 3.4, 6.6);
  const ceoPlant = plant(12.4, 1.6);
  station("plant", ceoPlant, 12.4, 1.6, { id: "ceo_plant" });
  plant(1.6, 8.5); plant(12.4, 8.5);
  place("coatrack", 10.2, 8.6);
  place("lamp", 1.5, 1.5);
  cooler(12.4, 4.4);
  strip(8.9, 4.7);

  // ------------------------------------------------------------------ restrooms
  const toilet = place("toilet_180", 15.9, 1.7);
  station("toilet", toilet, 15.9, 1.7, { id: "toilet" });
  place("toilet_180", 17.7, 1.7);
  place("partition", 16.85, 2.0, { w: 10, h: 120 });
  place("sink", 19.4, 1.5);
  place("sink", 20.4, 1.5);
  place("trash", 15.6, 8.6);
  plant(20.4, 8.5);

  // ------------------------------------------------------------------ copy room
  const copierMain = place("copier", 24.0, 2.0, { id: "copier_main" });
  station("copier", copierMain, 24.0, 2.0, { id: "copier_main", main: true });
  const copier2 = place("copier", 27.0, 2.0, { id: "copier_2" });
  station("copier", copier2, 27.0, 2.0, { id: "copier_2" });
  const shredder = place("shredder", 29.2, 1.7);
  station("shred", shredder, 29.2, 1.7, { id: "shredder" });
  const supplyA = place("supply_shelf", 31.0, 2.1);
  station("supply", supplyA, 31.0, 2.1, { id: "supply_copy" });
  place("filing", 22.7, 5.4); place("filing", 22.7, 6.5);
  place("box", 30.9, 8.6); place("box", 30.4, 8.7); place("box", 30.7, 8.2, { solid: false });
  place("trash", 23.0, 8.6);
  strip(25.2, 3.6);

  // ------------------------------------------------------------------ break room
  place("counter_sink", 33.6, 1.55);
  const coffee = place("coffee_station", 34.65, 1.55, { id: "coffee_station" });
  station("coffee", coffee, 34.65, 1.55, { id: "coffee" });
  place("counter_microwave", 35.7, 1.55);
  place("counter", 36.75, 1.55);
  const fridge = place("fridge", 38.1, 1.55);
  station("fridge", fridge, 38.1, 1.55, { id: "fridge" });
  const vend1 = place("vending", 33.8, 5.0);
  station("vending", vend1, 33.8, 5.0, { id: "vending_1" });
  const vend2 = place("vending_b", 33.8, 6.5);
  station("vending", vend2, 33.8, 6.5, { id: "vending_2" });
  const arcade = place("arcade", 45.2, 4.6);
  station("arcade", arcade, 45.2, 4.6, { id: "arcade" });
  place("claw", 45.1, 6.4);
  for (const [tx, ty] of [[38.0, 5.0], [41.6, 5.0]] as const) {
    place("break_table", tx, ty);
    place("stool", tx - 1.05, ty, { solid: false });
    place("stool", tx + 1.05, ty, { solid: false });
    place("stool", tx, ty + 1.15, { solid: false });
  }
  place("sofa_break_180", 39.0, 8.55);
  cooler(44.6, 1.6);
  plant(45.3, 8.6);
  place("trash", 33.6, 8.6);
  strip(37.4, 2.9);

  // ------------------------------------------------------------------ open office pods
  const pod = (px: number, py: number) => {
    const variants = ["ws_a", "ws_b", "ws_c"];
    for (let i = 0; i < 3; i++) {
      const cx = px + 0.95 + i * 1.8;
      place(`${variants[(i + px) % 3]}_180`, cx, py + 1.25);
      place(`${variants[(i + px + 1) % 3]}_0`, cx, py + 2.35);
      place("chair_office_0", cx, py + 0.38, { solid: false });
      place("chair_office_180", cx, py + 3.25, { solid: false });
      npcHomes.push({ x: P(cx), y: P(py + 0.3), facing: Math.PI / 2 });
      npcHomes.push({ x: P(cx), y: P(py + 3.32), facing: -Math.PI / 2 });
    }
    place("partition", px + 2.75, py + 1.8, { w: P(5.5), h: 12 });
    place("trash", px + 5.85, py + 0.45);
    plant(px - 0.35, py + 3.1);
  };
  for (const px of [3, 11, 19, 27]) pod(px, 12);
  for (const px of [8, 16, 24]) pod(px, 23);

  // Collaboration corner (north) and kitchenette corner (south) of the open office.
  place("whiteboard", 37.6, 11.25);
  place("break_table", 37.6, 13.6);
  place("stool", 36.5, 13.6, { solid: false });
  place("stool", 38.7, 13.6, { solid: false });
  place("stool", 37.6, 14.8, { solid: false });
  cooler(34.6, 11.7);
  plant(40.4, 11.6);
  const copier3 = place("copier", 35.6, 26.0, { id: "copier_3" });
  station("copier", copier3, 35.6, 26.0, { id: "copier_3" });
  place("break_table", 38.6, 25.4);
  place("stool", 37.55, 25.4, { solid: false });
  place("stool", 39.65, 25.4, { solid: false });
  cooler(39.6, 28.4);
  plant(32.4, 28.5);
  cooler(1.7, 17.2);
  cooler(20.6, 21.7);
  for (const [tx, ty] of [[7.0, 17.2], [15.0, 21.8], [23.0, 17.2], [31.0, 21.8]] as const) strip(tx, ty);
  plant(10.2, 19.6); plant(26.6, 20.6); plant(1.5, 11.6); plant(40.4, 22.0);

  // ------------------------------------------------------------------ lobby
  place("reception", 48.5, 20.0);
  place("chair_office_0", 48.5, 19.2, { solid: false });
  npcHomes.push({ x: P(48.5), y: P(19.15), facing: Math.PI / 2 });
  place("rug_lobby", 48.5, 25.6, { floor: true, solid: false, shots: false });
  place("sofa_lobby_0", 48.5, 23.7);
  place("sofa_lobby_180", 48.5, 27.6);
  place("armchair_lobby_90", 45.7, 25.6);
  place("armchair_lobby_270", 51.3, 25.6);
  place("coffee_table", 48.5, 25.6);
  plant(42.6, 11.7); plant(54.3, 11.7); plant(42.6, 28.4); plant(54.3, 28.4);
  cooler(54.2, 15.6);
  const vend3 = place("vending_b", 54.15, 20.6);
  station("vending", vend3, 54.15, 20.6, { id: "vending_3" });
  strip(45.0, 18.6);

  // ------------------------------------------------------------------ conference room
  place("conf_table", 7.5, 35.5);
  for (const tx of [5.6, 7.5, 9.4]) {
    place("chair_conf_0", tx, 33.95, { solid: false });
    place("chair_conf_180", tx, 37.1, { solid: false });
  }
  place("chair_conf_90", 4.3, 35.5, { solid: false });
  place("chair_conf_270", 10.7, 35.5, { solid: false });
  const tv = place("tv", 7.5, 31.35);
  station("presentation", tv, 7.5, 31.35, { id: "presentation" });
  place("whiteboard", 2.9, 31.25);
  plant(1.5, 39.5); plant(14.4, 39.5); plant(14.4, 31.6);
  strip(8.0, 39.1);

  // ------------------------------------------------------------------ HR
  const hrDesk = place("ws_hr", 18.6, 33.6);
  station("memos", hrDesk, 18.6, 33.6, { id: "memos" });
  place("chair_office_180", 18.6, 34.65, { solid: false });
  place("filing", 21.3, 31.45); place("filing", 22.3, 31.45); place("filing", 23.3, 31.45);
  place("ws_hr", 21.8, 37.0);
  place("chair_office_180", 21.8, 38.05, { solid: false });
  const shred2 = place("shredder", 16.7, 39.4);
  station("shred", shred2, 16.7, 39.4, { id: "shredder_hr" });
  plant(24.4, 39.4);
  cooler(24.3, 34.4);
  place("chair_conf_0", 16.9, 36.6, { solid: false });
  place("chair_conf_0", 17.8, 36.6, { solid: false });
  strip(20.4, 35.9);

  // ------------------------------------------------------------------ server room
  for (const ty of [32.4, 35.7]) for (const tx of [27.3, 29.6, 31.9]) place("server", tx, ty);
  const console = place("server_console", 29.6, 38.7);
  station("server", console, 29.6, 38.7, { id: "server" });
  place("generator", 32.6, 38.8);
  place("antenna", 27.0, 38.9);
  strip(28.5, 34.15);
  strip(31.0, 37.35);

  // ------------------------------------------------------------------ supply closet
  for (const [tx, ty] of [[36.1, 32.0], [38.7, 32.0], [36.1, 36.4], [38.7, 36.4]] as const) {
    const s = place("supply_shelf", tx, ty);
    if (tx === 36.1 && ty === 32.0) station("supply", s, tx, ty, { id: "supply_closet" });
  }
  place("box", 40.3, 39.4); place("box", 39.7, 39.6); place("box", 35.5, 39.5);

  // ------------------------------------------------------------------ mail room / stairs
  place("supply_shelf", 43.5, 32.0);
  place("box", 45.0, 31.7); place("box", 45.5, 32.1);
  const copier4 = place("copier", 44.0, 35.2, { id: "copier_4" });
  station("copier", copier4, 44.0, 35.2, { id: "copier_4" });
  cooler(43.0, 39.3);
  plant(49.3, 39.5); place("trash", 42.6, 37.6);

  // ------------------------------------------------------------------ misc
  const playerSpawn = { x: P(7.0), y: P(6.9) };
  for (const z of zones) {
    if (z.name === "Fire Stairs") continue;
    wanderSpots.push({ x: P((z.x0 + z.x1 + 1) / 2), y: P((z.y0 + z.y1 + 1) / 2) });
  }
  wanderSpots.push({ x: P(20.5), y: P(19.5) }, { x: P(9), y: P(20) }, { x: P(32), y: P(19) });

  return { w: W, h: H, tiles, mats, furniture, stations, doors, spawns, npcHomes, zones, playerSpawn, wanderSpots };
}

export function tileAt(map: OfficeMap, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return Tile.WALL;
  return map.tiles[ty * map.w + tx] as Tile;
}
