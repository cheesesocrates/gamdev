import Phaser from "phaser";
import { TILE } from "../config";
import { ChoreId } from "../data/days";
import { WEAPONS, WEAPON_DEFS } from "../data/weapons";
import { Tile } from "../world/OfficeMap";
import { GameState } from "./GameState";
import { pick, shuffle } from "../util/math";
import type { GameScene } from "../scenes/GameScene";

/** Rooms that can be code-locked: one doorway, no chores, nobody spawns inside. */
const ROOMS = [
  { name: "Supply Closet", tx: 31, ty: 33 },
  { name: "Restrooms", tx: 50, ty: 12 },
  { name: "Marketing Lounge", tx: 58, ty: 12 }
];

const ORD = ["1st", "2nd", "3rd", "4th"];

/** Where each chore hides its clue, and how it reads. */
const CLUES: Record<ChoreId, (room: string, pos: string, d: number) => string> = {
  emails: (r, p, d) => `IT replied: "The ${r} code's ${p} digit is ${d}. Stop emailing me."`,
  print: (r, p, d) => `Printed in the margin: ${r} code, ${p} digit = ${d}`,
  shred: (r, p, d) => `One strip didn't shred: "...${r}... ${p} digit: ${d}..."`,
  coffee: (r, p, d) => `Taped to the machine: "${r}, ${p} digit ${d}. Don't tell Brenda."`,
  presentation: (r, p, d) => `Slide 7, tiny footnote: ${r} code, ${p} digit = ${d}`,
  memos: (r, p, d) => `Doodled on a memo: ${r} code, ${p} digit is ${d}`,
  server: (r, p, d) => `Cable tag: ${r.toUpperCase()} / ${p.toUpperCase()} / ${d}`,
  plant: (r, p, d) => `Under the pot: "${r} code, ${p} digit: ${d}"`,
  jam: (r, p, d) => `Printed on the jammed page: ${r} code, ${p} digit = ${d}`,
  wifi: (r, p, d) => `Wi-Fi password hint: "${r}, ${p} digit is ${d}"`,
  mail: (r, p, d) => `An envelope marked URGENT: ${r} code, ${p} digit: ${d}`,
  board: (r, p, d) => `Half-erased on the board: ${r} code, ${p} digit = ${d}`
};

/**
 * The daily puzzle: one room is behind a code-locked security door. Today's chores each hide one
 * digit of the code (shown on a sticky note while you do them, then copied to your to-do list).
 * Punch the code into the keypad during Crunch Time; wrong guesses cost a second but tell you
 * which digits were right. Inside: a golden briefcase.
 */
export class Vault {
  room: (typeof ROOMS)[number] | null = null;
  code: number[] = [0, 0, 0, 0];
  found: (number | null)[] = [null, null, null, null];
  open = false;
  private clue = new Map<ChoreId, number>();
  private brief: Phaser.GameObjects.Image | null = null;
  private briefGlow: Phaser.GameObjects.Image | null = null;
  private briefT = 0;
  private briefY = 0;

  constructor(private g: GameScene) {}

  get doorX() { return this.room ? (this.room.tx + 1) * TILE : 0; }
  get doorY() { return this.room ? (this.room.ty + 0.5) * TILE : 0; }

  /** New day: yesterday's door is left open, a new one locks with a new code. */
  setupDay(chores: ChoreId[]) {
    this.unlockTiles();
    this.clearBriefcase();
    this.room = pick(ROOMS);
    this.code = [0, 1, 2, 3].map(() => Math.floor(Math.random() * 10));
    this.found = [null, null, null, null];
    this.open = false;
    this.clue.clear();
    const positions = shuffle([0, 1, 2, 3]);
    shuffle([...chores]).slice(0, 4).forEach((c, i) => this.clue.set(c, positions[i]));
    const g = this.g, r = this.room;
    for (const dx of [0, 1]) {
      g.world.tiles[r.ty * g.world.w + r.tx + dx] = Tile.LOCKED;
      g.placeWallTile(r.tx + dx, r.ty);
    }
    g.world.rebuildNav();
    this.syncHud();
  }

  /** Puts the doorway back to plain floor (no reward left behind). */
  private unlockTiles() {
    const g = this.g, r = this.room;
    if (!r) return;
    for (const dx of [0, 1]) {
      const i = r.ty * g.world.w + r.tx + dx;
      if (g.world.tiles[i] !== Tile.LOCKED) continue;
      g.world.tiles[i] = Tile.FLOOR;
      g.clearWallTile(r.tx + dx, r.ty);
    }
    g.world.rebuildNav();
  }

  private clearBriefcase() {
    this.brief?.destroy();
    this.briefGlow?.destroy();
    this.brief = this.briefGlow = null;
  }

  /** The clue stuck to a chore's corner (null if this chore holds none). */
  noteFor(chore: ChoreId): string | null {
    if (!this.room || this.open) return null;
    const pos = this.clue.get(chore);
    if (pos === undefined) return null;
    return CLUES[chore](this.room.name, ORD[pos], this.code[pos]);
  }

  /** A chore with a clue was finished: the digit goes on the to-do note. */
  collect(chore: ChoreId) {
    const pos = this.clue.get(chore);
    if (pos === undefined || !this.room || this.open || this.found[pos] !== null) return;
    this.found[pos] = this.code[pos];
    this.g.ui.toast(`Clue: ${this.room.name} code, ${ORD[pos]} digit is ${this.code[pos]}`, "#e9c25a", 3.4);
    this.g.audio.play("sticky", { vol: 0.5 });
    this.syncHud();
  }

  syncHud() {
    this.g.ui.setCode(this.room ? this.room.name : null, this.open ? this.code : this.found, this.open);
  }

  /** Prompt for the keypad when standing at the locked door during Crunch Time. */
  near(x: number, y: number): { x: number; y: number; label: string } | null {
    if (!this.room || this.open || this.g.phase !== "crunch" || this.g.mini) return null;
    if (Math.abs(x - this.doorX) > 110 || Math.abs(y - this.doorY) > 110) return null;
    return { x: this.doorX, y: this.doorY - 40, label: `Unlock the ${this.room.name} (code)` };
  }

  /** E at the door: the keypad. */
  use() {
    const g = this.g;
    if (!this.room || this.open) return;
    g.startKeypad(this.code, this.found, () => this.unlock());
  }

  private unlock() {
    const g = this.g, r = this.room;
    if (!r || this.open) return;
    this.open = true;
    this.unlockTiles();
    g.ui.initMinimap(g.map, g.world);
    g.refreshNav();
    g.audio.play("unlock", { vol: 0.75, jitter: 0 });
    g.fx.burst("spark", this.doorX, this.doorY, 16, 0x8fe0a0);
    g.fx.text(this.doorX, this.doorY - 50, "ACCESS GRANTED", { color: "#8fe0a0", size: 22, pop: true, dur: 1.4 });
    this.syncHud();
    // The golden briefcase sits in the middle of the room.
    const z = g.map.zones.find((zz) => zz.name === r.name);
    const cx = z ? ((z.x0 + z.x1 + 1) / 2) * TILE : this.doorX;
    const cy = z ? ((z.y0 + z.y1 + 1) / 2) * TILE : this.doorY + (r.ty > 20 ? 200 : -200);
    const p = g.world.nearestWalkable(cx, cy);
    this.briefGlow = g.add.image(p.x, p.y, "soft").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd36b).setScale(1.6).setAlpha(0.6).setDepth(p.y - 1);
    this.brief = g.add.image(p.x, p.y, "i_briefcase").setDepth(p.y + 2);
    this.briefT = 0;
    this.briefY = p.y;
    g.tipOnce("briefcase", `The ${r.name} is open. Grab the golden briefcase!`, "#e9c25a");
  }

  update(dt: number) {
    const b = this.brief;
    if (!b) return;
    const g = this.g, pl = g.player;
    this.briefT += dt;
    const y0 = this.briefY;
    b.setY(y0 - 4 - Math.sin(this.briefT * 3) * 4);
    this.briefGlow?.setAlpha(0.45 + 0.2 * Math.sin(this.briefT * 4));
    if (pl.dead || Math.hypot(pl.x - b.x, pl.y - y0) > 44) return;
    // Collected: a free gun if there's one left to get, otherwise overtime. Always a heart.
    const x = b.x, y = y0;
    this.clearBriefcase();
    const left = WEAPONS.filter((w) => w !== "stapler" && !GameState.unlocked[w]);
    let label: string;
    if (left.length && Math.random() < 0.6) {
      const w = pick(left);
      GameState.unlocked[w] = true;
      g.giftWeapon(w);
      label = `FREE ${WEAPON_DEFS[w].name.toUpperCase()}!`;
    } else {
      GameState.bank += 15;
      label = "+15s OVERTIME";
    }
    GameState.hp = Math.min(GameState.stats.maxHp, GameState.hp + 2);
    g.audio.play("register", { vol: 0.7, jitter: 0 });
    g.audio.play("bell2", { vol: 0.45, jitter: 0 });
    g.fx.burst("confetti", x, y, 30);
    g.fx.text(x, y - 50, label, { color: "#e9c25a", size: 24, pop: true, dur: 1.8 });
    g.ui.toast(`Golden briefcase: ${label.toLowerCase()} and a heart`, "#e9c25a", 3);
  }
}
