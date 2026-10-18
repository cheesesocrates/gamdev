import Phaser from "phaser";
import { DEPTH, TILE } from "../config";
import { Tile } from "../world/OfficeMap";
import type { GameScene } from "../scenes/GameScene";

interface Speaker {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  /** The wall tile it hangs on was knocked down (back up overnight). */
  down?: boolean;
}

export interface SayOpts {
  /** PA chime before the message: rising (good news) or falling (bad news). */
  chime?: "up" | "down" | null;
  /** Caption colour. */
  color?: string;
  /** Show the PA caption (off when the screen already shows the words). */
  caption?: boolean;
}

/**
 * Wall-mounted PA speakers. Management talks through them: the 5 PM budget-cuts announcement,
 * the end-of-day memo, bosses arriving. A chime and a crackle play, the line is captioned, and
 * every speaker on screen pulses and throws sound waves while it's up. (No synthesised voice.)
 */
export class Speakers {
  list: Speaker[] = [];
  private waves: Phaser.GameObjects.Graphics;
  private talking = 0;
  private talkT = 0;
  private token = 0;

  constructor(private g: GameScene) {
    // Sound waves glow above the lighting, so they read even in the dark at 5 PM.
    this.waves = g.add.graphics().setDepth(DEPTH.LIGHTING + 3).setBlendMode(Phaser.BlendModes.ADD);
    this.place();
  }

  /** One speaker high on the back wall of every room and a few along the halls. */
  private place() {
    const g = this.g, w = g.world, map = g.map;
    const taken: { x: number; y: number }[] = [];
    for (const z of map.zones) {
      const hall = z.name.includes("Hall");
      if (z.name.includes("Stairs")) continue;
      const ty = z.y0 - 1;
      const cands: number[] = [];
      for (let tx = z.x0; tx <= z.x1; tx++) {
        const t = w.tile(tx, ty);
        if ((t === Tile.WALL || t === Tile.DRYWALL) && w.tile(tx, ty + 1) === Tile.FLOOR && w.tile(tx - 1, ty) !== Tile.FLOOR && w.tile(tx + 1, ty) !== Tile.FLOOR) cands.push(tx);
      }
      if (!cands.length) continue;
      const span = z.x1 - z.x0 + 1;
      const n = hall ? Math.max(1, Math.round(span / 18)) : 1;
      for (let k = 0; k < n; k++) {
        const want = z.x0 + ((k + 0.5) / n) * span;
        const tx = cands.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
        const x = (tx + 0.5) * TILE, y = ty * TILE + 34;
        if (taken.some((p) => Math.abs(p.x - x) < TILE * 4 && Math.abs(p.y - y) < TILE)) continue;
        taken.push({ x, y });
        const img = g.add.image(x, y, "speaker").setDepth(DEPTH.FLOOR + 3);
        this.list.push({ x, y, img });
      }
    }
  }

  get speaking() { return this.talking > 0; }

  /** A wall came down: any speaker hanging on it falls off (sparks) until the overnight repairs. */
  wallGone(tx: number, ty: number) {
    for (const s of this.list) {
      if (s.down || Math.floor(s.x / TILE) !== tx || Math.floor((s.y - 34) / TILE) !== ty) continue;
      s.down = true;
      s.img.setVisible(false);
      this.g.fx.burst("spark", s.x, s.y, 8, 0x9fe8ff);
      this.g.fx.burst("pixel", s.x, s.y, 10, [0x2b2f3a, 0x5b6380]);
    }
  }

  /** Overnight: every speaker is back on its wall. */
  repairAll() {
    for (const s of this.list) {
      s.down = false;
      s.img.setVisible(true);
    }
  }

  /** The speaker nearest a point (for the camera to look at during the 5 PM announcement). */
  nearest(x: number, y: number): Speaker | null {
    let best: Speaker | null = null, bd = Infinity;
    for (const s of this.list) {
      if (s.down) continue;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Stops whatever is being said (skipped announcement, new day). */
  cancel() {
    this.token++;
    this.talking = 0;
    this.g.ui.pa(null);
  }

  /**
   * Plays the chime, then shows each line in turn for as long as it takes to read.
   * Resolves when the last line is done, or right away if cancelled.
   */
  async say(lines: string[], opts: SayOpts = {}): Promise<void> {
    const g = this.g;
    const my = ++this.token;
    const chime = opts.chime === undefined ? "down" : opts.chime;
    if (chime) {
      g.audio.play(chime === "up" ? "chime_up" : "chime_down", { vol: 0.55, jitter: 0 });
      g.audio.duck(0.3, 1.6 + lines.length * 2.6);
      this.talking++;
      await this.wait(chime === "up" ? 1050 : 1250);
      this.talking--;
      if (my !== this.token) return;
    } else {
      g.audio.play("pa_on", { vol: 0.5, jitter: 0 });
    }
    for (const line of lines) {
      if (my !== this.token) return;
      if (opts.caption !== false) g.ui.pa(line, opts.color);
      g.audio.play("pa_on", { vol: 0.35, jitter: 0.05, minGap: 200 });
      this.talking++;
      await this.wait(Math.max(1700, line.split(/\s+/).length * 300 + 600));
      this.talking = Math.max(0, this.talking - 1);
      if (my !== this.token) return;
      await this.wait(220);
    }
    if (my === this.token) {
      g.ui.pa(null);
      g.audio.play("pa_on", { vol: 0.25, rate: 1.25, jitter: 0 });
    }
  }

  private wait(ms: number) {
    return new Promise<void>((r) => this.g.time.delayedCall(ms, () => r()));
  }

  update(dt: number) {
    const gfx = this.waves;
    gfx.clear();
    if (this.talking <= 0) {
      for (const s of this.list) if (s.img.scale !== 1) s.img.setScale(1);
      return;
    }
    this.talkT += dt;
    const wv = this.g.cameras.main.worldView;
    for (const s of this.list) {
      if (s.down || s.x < wv.x - 80 || s.x > wv.right + 80 || s.y < wv.y - 80 || s.y > wv.bottom + 80) continue;
      const beat = 0.5 + 0.5 * Math.sin(this.talkT * 22 + s.x * 0.01);
      s.img.setScale(1 + beat * 0.07);
      for (let k = 0; k < 3; k++) {
        const ph = (this.talkT * 1.5 + k / 3) % 1;
        const r = 20 + ph * 56;
        gfx.lineStyle(4, 0xe9c25a, (1 - ph) * 0.85);
        // ((( speaker )))
        for (const [a0, a1] of [[-0.3, 0.3], [Math.PI - 0.3, Math.PI + 0.3], [Math.PI * 0.32, Math.PI * 0.68]] as const) {
          gfx.beginPath();
          gfx.arc(s.x, s.y + 2, r, a0, a1, false);
          gfx.strokePath();
        }
      }
    }
  }
}
