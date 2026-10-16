import Phaser from "phaser";
import { DEPTH } from "../config";
import { rand } from "../util/math";

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

interface FloatText {
  obj: Phaser.GameObjects.Text;
  life: number;
  maxLife: number;
  vy: number;
  active: boolean;
  pop: number;
}

/** Particles, floating text, decals, camera juice and glow lights. */
export class Effects {
  scene: Phaser.Scene;
  private em: Record<string, Emitter> = {};
  private texts: FloatText[] = [];
  private decals: Phaser.GameObjects.Image[] = [];
  private lights: { img: Phaser.GameObjects.Image; life: number; maxLife: number; scale: number }[] = [];
  hitstop = 0;
  timeScale = 1;
  private slowTimer = 0;
  private trauma = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const add = (name: string, tex: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth = DEPTH.FX) => {
      const e = scene.add.particles(0, 0, tex, { ...cfg, emitting: false });
      e.setDepth(depth);
      this.em[name] = e;
    };
    add("spark", "fx_spark_05", { lifespan: { min: 120, max: 260 }, speed: { min: 180, max: 520 }, scale: { start: 0.09, end: 0 }, blendMode: "ADD", rotate: { min: 0, max: 360 } });
    add("pixel", "px", { lifespan: { min: 250, max: 600 }, speed: { min: 60, max: 260 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0.3 } });
    add("confetti", "papershred", { lifespan: { min: 500, max: 1100 }, speed: { min: 80, max: 300 }, rotate: { min: 0, max: 360 }, scale: { start: 1, end: 0.6 }, alpha: { start: 1, end: 0 }, accelerationY: 260 });
    add("smoke", "fx_smoke_03", { lifespan: { min: 600, max: 1300 }, speed: { min: 15, max: 70 }, scale: { start: 0.12, end: 0.42 }, alpha: { start: 0.55, end: 0 }, rotate: { min: 0, max: 360 } });
    add("ember", "fx_flame_03", { lifespan: { min: 300, max: 700 }, speed: { min: 20, max: 90 }, scale: { start: 0.14, end: 0 }, blendMode: "ADD", accelerationY: -120, tint: [0xffd27a, 0xff8a2a, 0xff5a1f] });
    add("fire", "fx_flame_05", { lifespan: { min: 280, max: 520 }, speed: { min: 10, max: 50 }, scale: { start: 0.16, end: 0.02 }, alpha: { start: 0.95, end: 0 }, blendMode: "ADD", accelerationY: -160, angle: { min: 250, max: 290 }, tint: [0xffe08a, 0xff9a3a, 0xff5d2a] }, DEPTH.FX - 1);
    add("water", "px", { lifespan: { min: 300, max: 650 }, speed: { min: 80, max: 320 }, scale: { start: 1.4, end: 0.2 }, tint: [0x7fd0ff, 0xbfe8ff, 0x3aa6c9], accelerationY: 380 });
    add("coffee", "px", { lifespan: { min: 250, max: 550 }, speed: { min: 60, max: 260 }, scale: { start: 1.5, end: 0.2 }, tint: [0x7a4a24, 0x5a3416, 0xa36a3a], accelerationY: 300 });
    add("zap", "spark_line", { lifespan: { min: 90, max: 200 }, speed: { min: 40, max: 260 }, rotate: { min: 0, max: 360 }, scale: { start: 1, end: 0.2 }, blendMode: "ADD", tint: [0xbfefff, 0x6fd8ff, 0xffffff] });
    add("glass", "shard", { lifespan: { min: 400, max: 900 }, speed: { min: 120, max: 420 }, rotate: { min: 0, max: 360 }, scale: { start: 1.2, end: 0.4 }, alpha: { start: 0.9, end: 0 }, tint: [0xdff4ff, 0xa9dcff, 0xffffff] });
    add("star", "fx_star_05", { lifespan: { min: 350, max: 700 }, speed: { min: 50, max: 220 }, scale: { start: 0.08, end: 0 }, blendMode: "ADD", rotate: { min: 0, max: 360 } });
  }

  burst(name: string, x: number, y: number, count: number, tint?: number | number[]) {
    const e = this.em[name];
    if (!e) return;
    if (tint !== undefined) e.setParticleTint(Array.isArray(tint) ? tint[Math.floor(Math.random() * tint.length)] : tint);
    e.explode(count, x, y);
  }

  /** Directional spray (e.g. sparks off a wall, confetti away from a hit). */
  spray(name: string, x: number, y: number, count: number, angle: number, spreadDeg: number, tint?: number) {
    const e = this.em[name];
    if (!e) return;
    const deg = Phaser.Math.RadToDeg(angle);
    e.setParticleTint(tint ?? 0xffffff);
    e.ops.angle.loadConfig({ angle: { min: deg - spreadDeg, max: deg + spreadDeg } });
    e.explode(count, x, y);
    e.ops.angle.loadConfig({ angle: { min: 0, max: 360 } });
  }

  text(x: number, y: number, str: string, opts: { color?: string; size?: number; dur?: number; rise?: number; stroke?: string; bold?: boolean; pop?: boolean } = {}) {
    let ft = this.texts.find((t) => !t.active);
    if (!ft) {
      if (this.texts.length > 70) ft = this.texts.reduce((a, b) => (a.life < b.life ? a : b));
      else {
        const obj = this.scene.add.text(0, 0, "", { fontFamily: "'Archivo Black', Impact, sans-serif", fontSize: "20px", color: "#fff" });
        obj.setOrigin(0.5).setDepth(DEPTH.WORLD_UI).setResolution(2);
        ft = { obj, life: 0, maxLife: 1, vy: 0, active: false, pop: 0 };
        this.texts.push(ft);
      }
    }
    const size = opts.size ?? 20;
    ft.obj.setText(str);
    ft.obj.setFontSize(size);
    ft.obj.setColor(opts.color ?? "#ffffff");
    ft.obj.setStroke(opts.stroke ?? "#14161c", Math.max(3, size * 0.22));
    ft.obj.setPosition(x, y);
    ft.obj.setAlpha(1).setVisible(true).setScale(1);
    ft.maxLife = ft.life = opts.dur ?? 0.8;
    ft.vy = -(opts.rise ?? 60);
    ft.pop = opts.pop ? 0.18 : 0;
    ft.active = true;
  }

  decal(x: number, y: number, tex: string, opts: { scale?: number; alpha?: number; tint?: number; rot?: number } = {}) {
    // Past the cap, recycle the oldest decal instead of allocating a new one.
    const img = this.decals.length >= 180 ? this.decals.shift()!.setPosition(x, y).setTexture(tex) : this.scene.add.image(x, y, tex).setDepth(DEPTH.DECAL);
    img.setScale(opts.scale ?? 1).setAlpha(opts.alpha ?? 1).setRotation(opts.rot ?? rand(0, Math.PI * 2));
    if (opts.tint !== undefined) img.setTint(opts.tint); else img.clearTint();
    this.decals.push(img);
    return img;
  }

  clearDecals() {
    for (const d of this.decals) d.destroy();
    this.decals = [];
  }

  private lightPool: Phaser.GameObjects.Image[] = [];

  light(x: number, y: number, color: number, scale: number, dur: number) {
    if (this.lights.length > 40) return;
    const img = (this.lightPool.pop() ?? this.scene.add.image(0, 0, "soft").setDepth(DEPTH.LIGHTING + 1).setBlendMode(Phaser.BlendModes.ADD))
      .setPosition(x, y).setVisible(true);
    img.setTint(color).setScale(scale).setAlpha(0.9);
    this.lights.push({ img, life: dur, maxLife: dur, scale });
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  stop(ms: number) {
    this.hitstop = Math.max(this.hitstop, ms / 1000);
  }

  slowmo(scale: number, seconds: number) {
    this.timeScale = scale;
    this.slowTimer = seconds;
  }

  /** Real (unscaled) dt. */
  update(dt: number) {
    if (this.hitstop > 0) this.hitstop -= dt;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.timeScale = 1;
    }
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      this.shakeX = rand(-1, 1) * 24 * s;
      this.shakeY = rand(-1, 1) * 24 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    } else {
      this.shakeX = this.shakeY = 0;
    }
    for (const t of this.texts) {
      if (!t.active) continue;
      t.life -= dt;
      t.obj.y += t.vy * dt;
      t.vy *= Math.pow(0.08, dt);
      const k = t.life / t.maxLife;
      t.obj.setAlpha(k < 0.35 ? k / 0.35 : 1);
      if (t.pop > 0) {
        const p = 1 - Math.max(0, t.life - (t.maxLife - t.pop)) / t.pop;
        t.obj.setScale(p < 1 ? 0.4 + 0.9 * p : 1);
      }
      if (t.life <= 0) {
        t.active = false;
        t.obj.setVisible(false);
      }
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.life -= dt;
      const k = Math.max(0, l.life / l.maxLife);
      l.img.setAlpha(0.9 * k).setScale(l.scale * (0.8 + 0.2 * k));
      if (l.life <= 0) {
        l.img.setVisible(false);
        this.lightPool.push(l.img);
        this.lights.splice(i, 1);
      }
    }
  }
}
