import Phaser from "phaser";
import { DEPTH } from "../config";
import { OfficeMap } from "./OfficeMap";
import { Collider, World } from "./World";

export interface ManifestEntry {
  w: number; h: number; anchorX: number; anchorY: number; footW: number; footD: number; height: number;
}

export const PPU = 150; // pixels per model unit used by tools/render-assets.mjs

const NO_SHOTS = new Set(["plant", "trash", "lamp", "coatrack", "cooler", "cooler_tipped", "powerstrip", "box", "stool", "chair_exec_180"]);
const NOT_SOLID = new Set(["powerstrip", "stool"]);

export interface FurnObj {
  id: string;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
  collider?: Collider;
  // runtime state used by stations / hazards
  hot?: boolean;
  hp?: number;
  destroyed?: boolean;
  steamTimer?: number;
}

export interface Chair {
  base: string; // texture base, e.g. "chair_office"
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number; // radians, snapped to 4 sprite directions
  spin: number;
  sprite: Phaser.GameObjects.Image;
}

export function baseKey(key: string) {
  return key.replace(/_(0|90|180|270)$/, "");
}

export function buildFurniture(scene: Phaser.Scene, map: OfficeMap, world: World) {
  const manifest = scene.cache.json.get("furnManifest") as Record<string, ManifestEntry>;
  const furniture = new Map<string, FurnObj>();
  const chairs: Chair[] = [];

  for (const p of map.furniture) {
    if (p.key.startsWith("chair_") && p.solid === false && p.key !== "chair_exec_180") {
      // Office / conference chairs become pushable props.
      const m = p.key.match(/^(.*)_(0|90|180|270)$/);
      const base = m ? m[1] : p.key;
      const rot = m ? Phaser.Math.DegToRad(Number(m[2])) : 0;
      const sprite = scene.add.image(p.x, p.y, `furn_${p.key}`);
      const me = manifest[p.key];
      if (me) sprite.setOrigin(me.anchorX, me.anchorY);
      sprite.setDepth(p.y + 8);
      chairs.push({ base, x: p.x, y: p.y, vx: 0, vy: 0, rot, spin: 0, sprite });
      continue;
    }

    let w: number, h: number;
    let sprite: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
    if (p.key === "partition") {
      w = p.w ?? 64;
      h = p.h ?? 12;
      if (w >= h) {
        sprite = scene.add.tileSprite(p.x, p.y - 6, w, 24, "partition");
        sprite.setDepth(p.y + h / 2);
      } else {
        sprite = scene.add.tileSprite(p.x, p.y, 12, h, "partition_v");
        sprite.setDepth(p.y + h / 2);
      }
    } else {
      const me = manifest[p.key];
      if (!me) {
        console.warn("missing furniture sprite", p.key);
        continue;
      }
      w = p.w ?? Math.max(14, me.footW * PPU * 0.94);
      h = p.h ?? Math.max(14, me.footD * PPU * 0.94);
      sprite = scene.add.image(p.x, p.y, `furn_${p.key}`).setOrigin(me.anchorX, me.anchorY);
      sprite.setDepth(p.floor ? DEPTH.DECAL - 50 : p.y + h / 2);
    }

    const b = baseKey(p.key);
    const solid = p.solid ?? (!NOT_SOLID.has(b) && !p.floor);
    const shots = p.shots ?? (solid && !NO_SHOTS.has(b));
    const obj: FurnObj = { id: p.id!, key: p.key, x: p.x, y: p.y, w, h, sprite };
    if (solid || shots) {
      obj.collider = world.addCollider({
        x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2,
        solid, shots, kind: "furniture", ref: obj
      });
    }
    furniture.set(obj.id, obj);
  }
  return { furniture, chairs };
}

/** Above puddles and loose paper, below the fire glow and everyone standing on the floor. */
export const FLAT_DEPTH = DEPTH.HAZARD + 1.5;

/**
 * Creates one piece of furniture mid-game (daily water coolers and power strips). `flat` things lie on the floor
 * (power strips): they're drawn under every character instead of being depth-sorted like a desk.
 */
export function spawnFurniture(scene: Phaser.Scene, world: World, key: string, x: number, y: number, opts: { solid?: boolean; shots?: boolean; flat?: boolean } = {}): FurnObj {
  const manifest = scene.cache.json.get("furnManifest") as Record<string, ManifestEntry>;
  const me = manifest[key];
  const w = me ? Math.max(14, me.footW * PPU * 0.94) : 40;
  const h = me ? Math.max(14, me.footD * PPU * 0.94) : 40;
  const sprite = scene.add.image(x, y, `furn_${key}`);
  if (me) sprite.setOrigin(me.anchorX, me.anchorY);
  sprite.setDepth(opts.flat ? FLAT_DEPTH : y + h / 2);
  const b = baseKey(key);
  const solid = opts.solid ?? !NOT_SOLID.has(b);
  const shots = opts.shots ?? (solid && !NO_SHOTS.has(b));
  const obj: FurnObj = { id: `dyn_${key}_${(spawnCounter++).toString(36)}`, key, x, y, w, h, sprite };
  if (solid || shots) obj.collider = world.addCollider({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2, solid, shots, kind: "furniture", ref: obj });
  return obj;
}
let spawnCounter = 0;

export function destroyFurniture(world: World, f: FurnObj) {
  f.sprite.destroy();
  if (f.collider) world.removeCollider(f.collider);
}
