import Phaser from "phaser";
import { GameState } from "../systems/GameState";
import { rand } from "../util/math";
import type { GameScene } from "../scenes/GameScene";

export type PickupKind = "donut" | "pizza" | "coffee" | "soda" | "candy";

interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  t: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

const TEX: Record<PickupKind, string> = {
  donut: "furn_pickup_donut", pizza: "furn_pickup_pizza", coffee: "furn_pickup_coffee", soda: "furn_pickup_soda", candy: "furn_pickup_candy"
};
const GLOW: Record<PickupKind, number> = { donut: 0xff7ab8, pizza: 0xffb347, coffee: 0xc48a52, soda: 0x6fd8ff, candy: 0xffe066 };

export class Pickups {
  g: GameScene;
  list: Pickup[] = [];

  constructor(g: GameScene) {
    this.g = g;
  }

  spawn(kind: PickupKind, x: number, y: number, pop = true) {
    const glow = this.g.add.image(x, y, "soft").setBlendMode(Phaser.BlendModes.ADD).setTint(GLOW[kind]).setScale(0.9).setAlpha(0.5);
    const sprite = this.g.add.image(x, y, TEX[kind]).setScale(kind === "pizza" ? 0.75 : 0.85);
    const a = rand(0, Math.PI * 2);
    const sp = pop ? rand(80, 200) : 0;
    this.list.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 22, t: rand(0, 6), sprite, glow });
  }

  clear() {
    for (const p of this.list) { p.sprite.destroy(); p.glow.destroy(); }
    this.list = [];
  }

  update(dt: number) {
    const g = this.g;
    const pl = g.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (g.phase === "downsizing") p.life -= dt;
      const dx = pl.x - p.x, dy = pl.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 120 && !pl.dead) {
        const pull = 900 * (1 - d / 120) + 120;
        p.vx += (dx / (d || 1)) * pull * dt;
        p.vy += (dy / (d || 1)) * pull * dt;
      }
      p.vx *= Math.pow(0.04, dt);
      p.vy *= Math.pow(0.04, dt);
      const pos = { x: p.x, y: p.y };
      g.world.moveCircle(pos, 8, p.vx * dt, p.vy * dt);
      p.x = pos.x;
      p.y = pos.y;
      const bob = Math.sin(p.t * 4) * 3;
      p.sprite.setPosition(p.x, p.y - 6 + bob).setDepth(p.y + 2);
      p.glow.setPosition(p.x, p.y - 4).setDepth(p.y + 1).setAlpha(0.35 + Math.sin(p.t * 5) * 0.15);
      const blink = p.life < 4 && Math.floor(p.t * 8) % 2 === 0;
      p.sprite.setAlpha(blink ? 0.3 : 1);
      if (d < pl.r + 16 && !pl.dead && this.collect(p)) {
        p.sprite.destroy();
        p.glow.destroy();
        this.list.splice(i, 1);
        continue;
      }
      if (p.life <= 0) {
        p.sprite.destroy();
        p.glow.destroy();
        this.list.splice(i, 1);
      }
    }
  }

  private collect(p: Pickup): boolean {
    const g = this.g;
    const pl = g.player;
    const st = GameState.stats;
    let label = "";
    switch (p.kind) {
      case "donut":
        if (GameState.hp >= st.maxHp) return false;
        GameState.hp = Math.min(st.maxHp, GameState.hp + 2);
        label = "+1 HEART";
        break;
      case "pizza":
        GameState.hp = st.maxHp;
        label = "PIZZA PARTY!";
        g.audio.voice("power_up", 0.7);
        break;
      case "coffee":
        if (!GameState.unlocked.coffee) {
          if (GameState.hp >= st.maxHp) return false;
          GameState.hp = Math.min(st.maxHp, GameState.hp + 1);
          label = "+½ HEART";
        } else {
          pl.cups = Math.min(pl.maxCups, pl.cups + 4);
          label = "+4 COFFEE";
        }
        break;
      case "soda":
        pl.battery = Math.min(pl.maxBattery, pl.battery + 50);
        pl.speedBuff = 5;
        label = "ENERGY DRINK!";
        break;
      case "candy":
        pl.mag = pl.maxMag;
        pl.reloading = 0;
        pl.speedBuff = Math.max(pl.speedBuff, 3);
        label = "SUGAR RUSH";
        break;
    }
    g.fx.text(p.x, p.y - 26, label, { color: "#9dffb0", size: 16, dur: 0.9 });
    g.fx.burst("star", p.x, p.y, 8, 0xffffff);
    g.audio.play("pickup", { vol: 0.45 });
    return true;
  }
}
