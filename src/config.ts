// Shared constants.

export const TILE = 64;
export const MAP_W = 64;
export const MAP_H = 46;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Camera zoom is picked so roughly this many world pixels fit vertically. */
export const VIEW_WORLD_HEIGHT = 860;

export const CRUNCH_SECONDS = 120;

/** Draw order. Everything between FLOOR and PROJECTILE is y-sorted (depth = baseY). */
export const DEPTH = {
  FLOOR: -10000,
  DECAL: -9000,
  HAZARD: -8000,
  MARKER: -7000,
  PROJECTILE: 50000,
  FX: 60000,
  LIGHTING: 70000,
  WORLD_UI: 80000
};

export const PLAYER_RADIUS = 14;

/** Global sprite scale for characters (Kenney top-down art is small next to the rendered furniture). */
export const CHAR_SCALE = 1.22;

export const COLORS = {
  red: 0xe6304a,
  gold: 0xf2b705,
  cyan: 0x4fd1ff,
  green: 0x52d17c,
  white: 0xffffff,
  paper: 0xf3eedf
};
