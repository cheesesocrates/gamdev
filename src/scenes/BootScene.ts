import Phaser from "phaser";
import { TILE } from "../config";
import { SFX_FILES, MUSIC_FILES } from "../systems/Audio";
import { ENEMIES, standPose } from "../data/enemies";

/**
 * The player's poses, then every coworker's sprite and the standing pose they use before 5 PM.
 * Built from the enemy table so a coworker can never be missing its art (the Middle Manager once was).
 */
export const CHAR_SPRITES = [...new Set([
  "hitman1_gun", "hitman1_machine", "hitman1_silencer", "hitman1_stand", "hitman1_reload", "hitman1_hold",
  ...Object.values(ENEMIES).flatMap((d) => d.sprites.flatMap((s) => [s, standPose(s)]))
])];

const PARTICLES = [
  "circle_05", "fire_01", "fire_02", "flame_01", "flame_03", "flame_05", "light_01", "magic_03",
  "muzzle_02", "muzzle_04", "scorch_02", "smoke_03", "smoke_08", "spark_02", "spark_05", "spark_07",
  "star_05", "trace_02_rotated"
];

export const ICONS = [
  "arrow_clockwise", "arrow_cross", "arrow_diagonal", "arrow_diagonal_cross", "arrow_right_curve", "arrow_rotate",
  "award", "campfire", "card", "dice_skull", "dollar", "exploding", "exploding_6", "fastForward", "fire",
  "flask_full", "flask_half", "hexagon", "hourglass", "larger", "notepad", "pawns", "pouch", "power", "crown_a",
  "shield", "signal3", "skull", "spinner", "suit_hearts", "sword", "target", "timer_CW_75", "warning", "wrench", "zoomIn",
  "exclamation", "question"
];

export const FLOOR_INDEX: Record<number, number[]> = {
  1: [1, 2, 3, 4], // carpet
  2: [5, 6],
  3: [7, 8],
  4: [9, 10],
  5: [11, 12],
  6: [13, 14],
  7: [15],
  8: [16, 17],
  9: [18],
  10: [19],
  11: [20, 33], // hall terrazzo
  12: [34, 35] // teal carpet
};
export const WALL_INDEX = { CAP: 21, FACE: 22, WINDOW: 23, FACE_ALT: 24, ELEV_L: 25, ELEV_R: 26, EXIT_L: 27, EXIT_R: 28, GLASS: 29, GLASS_FACE: 30, DRY_CAP: 31, DRY_FACE: 32, VAULT_L: 36, VAULT_R: 37 };
const TILESET_COUNT = 38;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    const bar = document.getElementById("boot-bar");
    this.load.on("progress", (v: number) => { if (bar) bar.style.width = `${Math.round(v * 100)}%`; });

    this.load.json("furnManifest", "assets/furniture/manifest.json");
    this.load.once("filecomplete-json-furnManifest", (_k: string, _t: string, data: Record<string, unknown>) => {
      for (const key of Object.keys(data)) this.load.image(`furn_${key}`, `assets/furniture/${key}.png`);
    });
    for (const c of CHAR_SPRITES) this.load.image(`char_${c}`, `assets/characters/${c}.png`);
    for (const p of PARTICLES) this.load.image(`fx_${p}`, `assets/particles/${p}.png`);
    for (const i of ICONS) this.load.image(`icon_${i}`, `assets/icons/${i}.png`);
    for (const s of SFX_FILES) this.load.audio(`sfx_${s}`, `assets/audio/sfx/${s}.ogg`);
    for (const m of MUSIC_FILES) this.load.audio(`music_${m.key}`, `assets/audio/music/${m.file}`);
  }

  create() {
    makeTileset(this);
    makeTextures(this);
    this.scene.start("Game");
  }
}

// ---------------------------------------------------------------- helpers
function hex(c: number, a = 1) {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

function speckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count: number, light: string, dark: string, size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? light : dark;
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, size, size);
  }
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  draw(ctx);
  tex.refresh();
  return tex;
}

function makeTileset(scene: Phaser.Scene) {
  canvasTexture(scene, "tileset", TILESET_COUNT * TILE, TILE, (ctx) => {
    const T = TILE;
    const at = (i: number) => i * T;

    const carpet = (i: number, base: number, seed: number) => {
      const x = at(i);
      ctx.fillStyle = hex(base);
      ctx.fillRect(x, 0, T, T);
      speckle(ctx, x, 0, T, T, 260, "rgba(255,255,255,0.05)", "rgba(0,0,0,0.08)", 2);
      // carpet-tile seams + a slight per-variant shade so the floor doesn't look tiled
      ctx.fillStyle = `rgba(0,0,0,${0.05 + seed * 0.02})`;
      ctx.fillRect(x, 0, T, 1);
      ctx.fillRect(x, 0, 1, T);
      ctx.fillStyle = `rgba(255,255,255,${0.02 * seed})`;
      ctx.fillRect(x + 1, 1, T - 1, T - 1);
    };
    carpet(1, 0x3b4658, 0); carpet(2, 0x3a4557, 1); carpet(3, 0x3d485b, 2); carpet(4, 0x394354, 1);
    carpet(5, 0x585e69, 0); carpet(6, 0x555b66, 1);
    carpet(7, 0x8a7a66, 0); carpet(8, 0x857561, 1);

    const wood = (i: number, shift: number) => {
      const x = at(i);
      const colors = ["#7a5233", "#6f4a2e", "#81583a", "#744e30"];
      for (let p = 0; p < 4; p++) {
        ctx.fillStyle = colors[(p + shift) % 4];
        ctx.fillRect(x, p * 16, T, 16);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x, p * 16 + 15, T, 1);
        const joint = ((p * 37 + shift * 23) % 48) + 8;
        ctx.fillRect(x + joint, p * 16, 1, 15);
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        for (let g = 0; g < 3; g++) {
          ctx.beginPath();
          const gy = p * 16 + 3 + g * 4 + Math.random() * 2;
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + 20, gy + 1.5, x + 40, gy - 1.5, x + T, gy);
          ctx.stroke();
        }
      }
    };
    wood(9, 0); wood(10, 2);

    const kitchen = (i: number, flip: boolean) => {
      const x = at(i);
      for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
        const light = (cx + cy + (flip ? 1 : 0)) % 2 === 0;
        ctx.fillStyle = light ? "#dcd6c8" : "#b6ae9e";
        ctx.fillRect(x + cx * 32, cy * 32, 32, 32);
      }
      speckle(ctx, x, 0, T, T, 60, "rgba(255,255,255,0.06)", "rgba(0,0,0,0.05)", 1);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x, 0, T, 1); ctx.fillRect(x, 32, T, 1); ctx.fillRect(x, 0, 1, T); ctx.fillRect(x + 32, 0, 1, T);
    };
    kitchen(11, false); kitchen(12, true);

    const marble = (i: number) => {
      const x = at(i);
      ctx.fillStyle = "#e3ded6";
      ctx.fillRect(x, 0, T, T);
      ctx.strokeStyle = "rgba(120,120,130,0.18)";
      ctx.lineWidth = 1;
      for (let v = 0; v < 3; v++) {
        ctx.beginPath();
        let vx = x + Math.random() * T, vy = 0;
        ctx.moveTo(vx, vy);
        while (vy < T) { vx += (Math.random() - 0.5) * 14; vy += 6 + Math.random() * 8; ctx.lineTo(vx, vy); }
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(x, 0, T, 1); ctx.fillRect(x, 0, 1, T);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(x, T - 1, T, 1); ctx.fillRect(x + T - 1, 0, 1, T);
    };
    marble(13); marble(14);

    // restroom: small white tiles
    {
      const x = at(15);
      ctx.fillStyle = "#c8cdd2";
      ctx.fillRect(x, 0, T, T);
      for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
        ctx.fillStyle = (cx + cy) % 3 === 0 ? "#e2e7eb" : "#eaeef1";
        ctx.fillRect(x + cx * 16 + 1, cy * 16 + 1, 14, 14);
      }
    }
    // server raised floor
    for (const i of [16, 17]) {
      const x = at(i);
      ctx.fillStyle = i === 16 ? "#2b3039" : "#292e37";
      ctx.fillRect(x, 0, T, T);
      for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
        ctx.strokeStyle = "rgba(120,140,170,0.25)";
        ctx.strokeRect(x + cx * 32 + 1.5, cy * 32 + 1.5, 29, 29);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        for (let d = 0; d < 9; d++) ctx.fillRect(x + cx * 32 + 6 + (d % 3) * 9, cy * 32 + 6 + Math.floor(d / 3) * 9, 2, 2);
      }
    }
    // concrete
    {
      const x = at(18);
      ctx.fillStyle = "#666a71";
      ctx.fillRect(x, 0, T, T);
      speckle(ctx, x, 0, T, T, 220, "rgba(255,255,255,0.07)", "rgba(0,0,0,0.12)", 2);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x, 0, T, 1); ctx.fillRect(x, 0, 1, T);
    }
    // stairs
    {
      const x = at(19);
      for (let s = 0; s < 4; s++) {
        ctx.fillStyle = s % 2 ? "#5b5f67" : "#62666e";
        ctx.fillRect(x, s * 16, T, 16);
        ctx.fillStyle = "#e0b532";
        ctx.fillRect(x, s * 16 + 13, T, 3);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(x, s * 16, T, 2);
      }
    }

    // ------------------------------------------------ walls
    const cap = (x: number) => {
      ctx.fillStyle = "#1d2129";
      ctx.fillRect(x, 0, T, T);
      ctx.fillStyle = "#2a2f39";
      ctx.fillRect(x + 3, 3, T - 6, T - 6);
      ctx.fillStyle = "#1d2129";
      ctx.fillRect(x + 6, 6, T - 12, T - 12);
    };
    cap(at(21));
    const face = (x: number, paint: string, paintDark: string) => {
      ctx.fillStyle = "#1d2129";
      ctx.fillRect(x, 0, T, 16);
      ctx.fillStyle = "#2a2f39";
      ctx.fillRect(x, 0, T, 3);
      const g = ctx.createLinearGradient(0, 16, 0, T);
      g.addColorStop(0, paint);
      g.addColorStop(1, paintDark);
      ctx.fillStyle = g;
      ctx.fillRect(x, 16, T, T - 16);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, 16, T, 2);
      ctx.fillStyle = "#3a404b";
      ctx.fillRect(x, T - 7, T, 7);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x, T - 7, T, 1);
    };
    face(at(22), "#a6aebb", "#8a92a0");
    face(at(24), "#a6aebb", "#8a92a0");
    // light switch on the alt face
    ctx.fillStyle = "#e8eaee"; ctx.fillRect(at(24) + 44, 30, 7, 11);
    ctx.fillStyle = "#c3c7cd"; ctx.fillRect(at(24) + 46, 33, 3, 5);
    // window face (outer wall): city skyline
    {
      const x = at(23);
      face(x, "#a6aebb", "#8a92a0");
      const wx = x + 5, wy = 20, ww = T - 10, wh = 34;
      const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
      sky.addColorStop(0, "#7fb6f0");
      sky.addColorStop(1, "#cfe6ff");
      ctx.fillStyle = sky;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = "#5d7ea6";
      let bx = wx;
      while (bx < wx + ww) {
        const bw = 6 + Math.random() * 9, bh = 8 + Math.random() * 18;
        ctx.fillRect(bx, wy + wh - bh, Math.min(bw, wx + ww - bx), bh);
        bx += bw + 1;
      }
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.moveTo(wx + 6, wy); ctx.lineTo(wx + 16, wy); ctx.lineTo(wx + 4, wy + wh); ctx.lineTo(wx - 6 + 6, wy + wh); ctx.fill();
      ctx.strokeStyle = "#5f6774"; ctx.lineWidth = 3;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.stroke();
    }
    // elevator halves
    for (const [i, left] of [[25, true], [26, false]] as const) {
      const x = at(i);
      face(x, "#9aa2af", "#7f8794");
      ctx.fillStyle = "#4b525e";
      ctx.fillRect(left ? x + 6 : x, 18, left ? T - 6 : T - 6, T - 22);
      ctx.fillStyle = "#c9ced6";
      ctx.fillRect(left ? x + 10 : x, 22, left ? T - 10 : T - 10, T - 30);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(left ? x + T - 1 : x, 22, 1, T - 30);
      if (left) {
        ctx.fillStyle = "#14171c"; ctx.fillRect(x + T - 12, 4, 24, 9);
        ctx.fillStyle = "#ff5d3a"; ctx.fillRect(x + T - 6, 6, 4, 5);
      }
    }
    // fire exit halves
    for (const [i, left] of [[27, true], [28, false]] as const) {
      const x = at(i);
      face(x, "#a6aebb", "#8a92a0");
      ctx.fillStyle = "#8c3b33";
      ctx.fillRect(left ? x + 8 : x, 20, left ? T - 8 : T - 8, T - 27);
      ctx.fillStyle = "#c9ced6";
      ctx.fillRect(left ? x + T - 8 : x + 2, 38, 6, 3);
      if (left) {
        ctx.fillStyle = "#1c7a3e"; ctx.fillRect(x + T - 18, 3, 36, 12);
        ctx.fillStyle = "#e8fff0"; ctx.font = "bold 9px sans-serif"; ctx.fillText("EXIT", x + T - 12, 12.5);
      }
    }
    // glass panes (cap view and face view)
    for (const [i, withFace] of [[29, false], [30, true]] as const) {
      const x = at(i);
      if (withFace) {
        ctx.fillStyle = "rgba(160,215,255,0.28)";
        ctx.fillRect(x, 14, T, T - 14);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(x + 10, 18, 3, T - 26);
        ctx.fillRect(x + 16, 18, 2, T - 34);
      } else {
        ctx.fillStyle = "rgba(160,215,255,0.25)";
        ctx.fillRect(x, 0, T, T);
      }
      ctx.fillStyle = "#59616e";
      ctx.fillRect(x, withFace ? 10 : 26, T, 5);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x, withFace ? 10 : 26, T, 1);
      ctx.fillStyle = "#59616e";
      ctx.fillRect(x, 0, 3, T); ctx.fillRect(x + T - 3, 0, 3, T);
    }

    // ------------------------------------------------ hall terrazzo (colourful chips)
    const terrazzo = (i: number, seed: number) => {
      const x = at(i);
      ctx.fillStyle = seed ? "#d3d6de" : "#cfd3dc";
      ctx.fillRect(x, 0, T, T);
      const chips = ["#d9a28e", "#7cc7ff", "#ffd36b", "#9be59b", "#b7a6ff", "#8a8f9c", "#ffffff"];
      for (let k = 0; k < 70; k++) {
        ctx.fillStyle = chips[(k * 7 + seed * 3) % chips.length];
        const s = 1.5 + Math.random() * 2.5;
        ctx.globalAlpha = 0.55 + Math.random() * 0.35;
        ctx.fillRect(x + Math.random() * (T - s), Math.random() * (T - s), s, s * (0.6 + Math.random() * 0.8));
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(x, 0, T, 1); ctx.fillRect(x, 0, 1, T);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(x, T - 1, T, 1); ctx.fillRect(x + T - 1, 0, 1, T);
    };
    terrazzo(20, 0); terrazzo(33, 1);
    carpet(34, 0x2c6f78, 0); carpet(35, 0x2a6a73, 1);

    // ------------------------------------------------ drywall: warm paint + panel seams
    {
      const x = at(31);
      ctx.fillStyle = "#2b2733"; ctx.fillRect(x, 0, T, T);
      ctx.fillStyle = "#3b3545"; ctx.fillRect(x + 3, 3, T - 6, T - 6);
      ctx.fillStyle = "#2b2733"; ctx.fillRect(x + 6, 6, T - 12, T - 12);
      ctx.fillStyle = "rgba(255,210,150,0.10)"; ctx.fillRect(x + 31, 3, 2, T - 6);
    }
    {
      const x = at(32);
      ctx.fillStyle = "#2b2733"; ctx.fillRect(x, 0, T, 16);
      ctx.fillStyle = "#3b3545"; ctx.fillRect(x, 0, T, 3);
      const g = ctx.createLinearGradient(0, 16, 0, T);
      g.addColorStop(0, "#efe3cf"); g.addColorStop(1, "#d6c7ad");
      ctx.fillStyle = g; ctx.fillRect(x, 16, T, T - 16);
      ctx.fillStyle = "rgba(120,95,60,0.22)";
      ctx.fillRect(x + 31, 16, 2, T - 23);
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x, 16, T, 2);
      ctx.fillStyle = "#7a5a3c"; ctx.fillRect(x, T - 7, T, 7);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x, T - 7, T, 1);
    }
    // ------------------------------------------------ locked security door (the code-lock puzzle room)
    for (const [i, left] of [[36, true], [37, false]] as const) {
      const x = at(i);
      ctx.fillStyle = "#2b2733"; ctx.fillRect(x, 0, T, 16);
      ctx.fillStyle = "#3b3545"; ctx.fillRect(x, 0, T, 3);
      ctx.fillStyle = "#4a515d"; ctx.fillRect(x, 12, T, T - 12);
      const lx = left ? x + 6 : x, lw = T - 6;
      const steel = ctx.createLinearGradient(lx, 0, lx + lw, 0);
      steel.addColorStop(0, "#9aa3b2"); steel.addColorStop(0.5, "#c3cad6"); steel.addColorStop(1, "#8e97a6");
      ctx.fillStyle = steel; ctx.fillRect(lx, 16, lw, T - 24);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let r = 0; r < 3; r++) ctx.fillRect(lx + 4, 22 + r * 9, lw - 8, 2);
      // hazard stripes along the bottom
      ctx.save();
      ctx.beginPath(); ctx.rect(lx, T - 18, lw, 10); ctx.clip();
      for (let k = -2; k < 12; k++) {
        ctx.fillStyle = k % 2 ? "#1c1d21" : "#e9c25a";
        ctx.beginPath();
        ctx.moveTo(lx + k * 8, T - 8); ctx.lineTo(lx + k * 8 + 8, T - 8); ctx.lineTo(lx + k * 8 + 16, T - 18); ctx.lineTo(lx + k * 8 + 8, T - 18);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = "#3a404b"; ctx.fillRect(left ? x + T - 2 : x, 16, 2, T - 24);
      if (!left) {
        // keypad with a red "locked" light
        ctx.fillStyle = "#1c1d21"; ctx.fillRect(x + 36, 24, 18, 22);
        ctx.fillStyle = "#3a3c44"; ctx.fillRect(x + 37, 25, 16, 20);
        ctx.fillStyle = "#9ee6a8"; ctx.fillRect(x + 39, 27, 12, 4);
        ctx.fillStyle = "#c9d1e6";
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillRect(x + 39 + c * 4.2, 33 + r * 3.8, 3, 2.6);
        ctx.fillStyle = "#ff4a3a"; ctx.beginPath(); ctx.arc(x + 45, 20, 2.6, 0, Math.PI * 2); ctx.fill();
      } else {
        // "AUTHORISED STAFF ONLY" plate
        ctx.fillStyle = "#c4382c"; ctx.fillRect(x + 18, 22, 32, 9);
        ctx.fillStyle = "#f7f4ea"; ctx.fillRect(x + 21, 25, 26, 3);
      }
    }
  });
  const tex = scene.textures.get("tileset");
  for (let i = 0; i < TILESET_COUNT; i++) tex.add(i, 0, i * TILE, 0, TILE, TILE);
}

function makeTextures(scene: Phaser.Scene) {
  // soft round glow and plain pixel for particles
  canvasTexture(scene, "soft", 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  canvasTexture(scene, "px", 4, 4, (ctx) => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 4, 4); });

  // ---- daily chore props (desktop printer, Wi-Fi router, mail cart), drawn in the furniture's 3/4 view
  const shadowAt = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  canvasTexture(scene, "furn_printer", 70, 76, (ctx) => {
    shadowAt(ctx, 35, 68, 31, 7);
    ctx.strokeStyle = "#3a3f48"; ctx.lineWidth = 2;
    // stand
    ctx.fillStyle = "#aab2be"; ctx.fillRect(10, 38, 50, 8); ctx.strokeRect(10, 38, 50, 8);
    ctx.fillStyle = "#8e96a4"; ctx.fillRect(10, 46, 50, 20); ctx.strokeRect(10, 46, 50, 20);
    ctx.fillStyle = "#6c7482"; ctx.fillRect(28, 54, 14, 3);
    // printer
    const top = ctx.createLinearGradient(0, 14, 0, 32);
    top.addColorStop(0, "#f4f6f9"); top.addColorStop(1, "#dfe3e9");
    ctx.fillStyle = top; ctx.fillRect(7, 14, 56, 18); ctx.strokeRect(7, 14, 56, 18);
    ctx.fillStyle = "#cdd2da"; ctx.fillRect(7, 32, 56, 10); ctx.strokeRect(7, 32, 56, 10);
    ctx.fillStyle = "#fbf8ee";
    ctx.save(); ctx.translate(35, 14); ctx.rotate(-0.05);
    ctx.fillRect(-15, -10, 30, 12); ctx.strokeRect(-15, -10, 30, 12);
    ctx.restore();
    ctx.fillStyle = "#2a2c33"; ctx.fillRect(15, 18, 40, 4);
    ctx.fillStyle = "#9ee6a8"; ctx.fillRect(45, 34, 12, 5);
    ctx.fillStyle = "#4b9a63"; ctx.beginPath(); ctx.arc(14, 37, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(9, 15, 52, 2);
  });
  canvasTexture(scene, "furn_router", 50, 72, (ctx) => {
    shadowAt(ctx, 25, 65, 20, 5);
    ctx.strokeStyle = "#111216"; ctx.lineWidth = 2;
    ctx.fillStyle = "#3d4049"; ctx.fillRect(9, 28, 32, 8); ctx.strokeRect(9, 28, 32, 8);
    ctx.fillStyle = "#2a2c33"; ctx.fillRect(9, 36, 32, 28); ctx.strokeRect(9, 36, 32, 28);
    ctx.fillStyle = "#1c1d21"; for (let r = 0; r < 4; r++) ctx.fillRect(13, 40 + r * 5, 18, 2);
    for (const [y, c] of [[41, "#3fa35a"], [47, "#f0c93a"], [53, "#3fa35a"], [59, "#2f64c8"]] as const) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(36, y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // router + antennas
    ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(12, 20); ctx.lineTo(7, 3); ctx.moveTo(38, 20); ctx.lineTo(43, 3); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.fillStyle = "#1c1d21"; ctx.fillRect(7, 18, 36, 11);
    ctx.fillStyle = "#33363e"; ctx.fillRect(7, 18, 36, 3);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i === 3 ? "#f0c93a" : "#3fa35a"; ctx.fillRect(12 + i * 6, 24, 3, 2); }
  });
  canvasTexture(scene, "furn_mailcart", 74, 66, (ctx) => {
    shadowAt(ctx, 37, 59, 32, 6);
    ctx.fillStyle = "#1c1d21";
    for (const [x, y] of [[14, 57], [60, 57], [18, 52], [56, 52]] as const) { ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = "#6c7482"; ctx.lineWidth = 3;
    ctx.strokeRect(10, 22, 54, 30);
    // the canvas bin
    ctx.strokeStyle = "#1c2a45"; ctx.lineWidth = 2;
    ctx.fillStyle = "#22314f"; ctx.fillRect(9, 12, 56, 12); ctx.strokeRect(9, 12, 56, 12);
    // envelopes and a parcel sticking out
    const sheets: [number, number, number, string][] = [[20, 10, -0.3, "#fbf8ee"], [33, 8, 0.12, "#f3e3b5"], [46, 11, 0.35, "#fbf8ee"], [28, 14, -0.1, "#e9edf2"]];
    for (const [x, y, a, c] of sheets) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = c; ctx.fillRect(-8, -6, 16, 11); ctx.strokeStyle = "#8a8578"; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -6, 16, 11);
      ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(0, 0); ctx.lineTo(8, -6); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#b07a4f"; ctx.fillRect(50, 6, 12, 10); ctx.strokeStyle = "#6b4a33"; ctx.strokeRect(50, 6, 12, 10);
    ctx.fillStyle = "#3d5a8f";
    ctx.beginPath(); ctx.moveTo(9, 24); ctx.lineTo(65, 24); ctx.lineTo(61, 50); ctx.lineTo(13, 50); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#1c2a45"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.moveTo(14, 30); ctx.lineTo(60, 30); ctx.stroke();
    ctx.fillStyle = "#f7f4ea"; ctx.fillRect(28, 34, 18, 8);
    ctx.fillStyle = "#1c2a45"; ctx.fillRect(30, 37, 14, 2);
  });
  // Footprints for the generated props (so spawnFurniture sizes and anchors them like the rendered ones).
  {
    const man = scene.cache.json.get("furnManifest") as Record<string, unknown> | undefined;
    if (man) {
      const foot = (px: number) => px / (150 * 0.94);
      man.printer = { w: 70, h: 76, anchorX: 0.5, anchorY: 68 / 76, footW: foot(48), footD: foot(26), height: 0.5 };
      man.router = { w: 50, h: 72, anchorX: 0.5, anchorY: 65 / 72, footW: foot(32), footD: foot(18), height: 0.6 };
      man.mailcart = { w: 74, h: 66, anchorX: 0.5, anchorY: 59 / 66, footW: foot(54), footD: foot(26), height: 0.5 };
    }
  }

  // Wall-mounted PA speaker (front view).
  canvasTexture(scene, "speaker", 36, 30, (ctx) => {
    ctx.fillStyle = "#8f97a3"; ctx.fillRect(15, 0, 6, 6);
    ctx.fillStyle = "#1c1d21"; ctx.beginPath(); ctx.roundRect(2, 5, 32, 24, 5); ctx.fill();
    ctx.fillStyle = "#33353d"; ctx.beginPath(); ctx.roundRect(4, 7, 28, 20, 4); ctx.fill();
    ctx.fillStyle = "#1c1d21"; ctx.beginPath(); ctx.arc(18, 17, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4a4d57"; ctx.lineWidth = 1.2;
    for (const r of [3, 5.5, 7.5]) { ctx.beginPath(); ctx.arc(18, 17, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = "#6c7280"; ctx.beginPath(); ctx.arc(18, 17, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4b9a63"; ctx.beginPath(); ctx.arc(29, 10, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.fillRect(5, 7, 26, 1);
  });

  // Old desk phone (the Cold Caller's bombs).
  canvasTexture(scene, "i_phone", 30, 26, (ctx) => {
    ctx.fillStyle = "#6e6553"; ctx.beginPath(); ctx.roundRect(3, 8, 24, 17, 4); ctx.fill();
    ctx.fillStyle = "#e3d9c4"; ctx.beginPath(); ctx.roundRect(4, 9, 22, 15, 3); ctx.fill();
    ctx.fillStyle = "#b9ad95";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillRect(8 + c * 4.5, 13 + r * 3.4, 3, 2.2);
    ctx.fillStyle = "#c4382c"; ctx.beginPath(); ctx.arc(23, 21, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1c1d21";
    ctx.beginPath(); ctx.roundRect(4, 2, 22, 6, 3); ctx.fill();
    ctx.beginPath(); ctx.arc(5.5, 5, 4, 0, Math.PI * 2); ctx.arc(24.5, 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(7, 3, 16, 1.4);
  });

  // The CEO's bonus cheques, thrown in fans: gold coins.
  canvasTexture(scene, "p_coin", 18, 18, (ctx) => {
    ctx.fillStyle = "#7a5a14"; ctx.beginPath(); ctx.arc(9, 9, 8.5, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(7, 6, 1, 9, 9, 8);
    g.addColorStop(0, "#fff2b0"); g.addColorStop(0.55, "#f0c040"); g.addColorStop(1, "#b98a1c");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(9, 9, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8a6514"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(9, 9, 4.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#8a6514"; ctx.fillRect(8.2, 4.5, 1.6, 9);
  });

  // The CEO's last resort: a budget report on fire, lobbed like a grenade.
  canvasTexture(scene, "p_report", 30, 30, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(5, 11, 20, 16);
    ctx.fillStyle = "#fbf8ee"; ctx.fillRect(3, 9, 20, 16);
    ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 1.5; ctx.strokeRect(3.5, 9.5, 19, 15);
    ctx.fillStyle = "#c4382c"; ctx.fillRect(6, 12, 9, 2.5);
    ctx.fillStyle = "#9aa3b0"; for (let l = 0; l < 3; l++) ctx.fillRect(6, 16.5 + l * 2.6, 13, 1.2);
    const f = ctx.createLinearGradient(0, 2, 0, 16);
    f.addColorStop(0, "#ffe08a"); f.addColorStop(0.6, "#ff8a2a"); f.addColorStop(1, "#d8432a");
    ctx.fillStyle = f;
    ctx.beginPath(); ctx.moveTo(15, 14); ctx.quadraticCurveTo(14, 7, 20, 2); ctx.quadraticCurveTo(21, 8, 26, 9); ctx.quadraticCurveTo(28, 14, 23, 16); ctx.closePath(); ctx.fill();
  });

  // The Hatchet Man's giant FIRED stamp (top-down).
  canvasTexture(scene, "i_stamp", 30, 26, (ctx) => {
    ctx.fillStyle = "#7d1f17"; ctx.fillRect(2, 5, 26, 16);
    ctx.fillStyle = "#c4382c"; ctx.fillRect(3, 6, 24, 14);
    ctx.fillStyle = "#8a5a33"; ctx.fillRect(5, 8, 20, 10);
    ctx.fillStyle = "#5e3b22"; ctx.beginPath(); ctx.arc(15, 13, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c97a3a"; ctx.beginPath(); ctx.arc(15, 13, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,240,210,0.6)"; ctx.beginPath(); ctx.arc(13.5, 11.5, 1.8, 0, Math.PI * 2); ctx.fill();
  });

  // Golden briefcase: the reward behind the code-locked door.
  canvasTexture(scene, "i_briefcase", 40, 32, (ctx) => {
    ctx.fillStyle = "#7a5a14"; ctx.beginPath(); ctx.roundRect(13, 2, 14, 8, 3); ctx.fill();
    ctx.fillStyle = "#3b2c0b"; ctx.fillRect(16, 5, 8, 4);
    ctx.fillStyle = "#7a5a14"; ctx.beginPath(); ctx.roundRect(2, 8, 36, 22, 4); ctx.fill();
    const g = ctx.createLinearGradient(0, 8, 0, 30);
    g.addColorStop(0, "#ffe08a"); g.addColorStop(0.5, "#e9b83a"); g.addColorStop(1, "#b98a1c");
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(3, 9, 34, 20, 3); ctx.fill();
    ctx.fillStyle = "#7a5a14"; ctx.fillRect(3, 17, 34, 2);
    ctx.fillStyle = "#3b2c0b"; ctx.fillRect(9, 15, 5, 5); ctx.fillRect(26, 15, 5, 5);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(6, 11, 12, 2);
  });
  canvasTexture(scene, "shard", 10, 3, (ctx) => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 10, 3); });
  canvasTexture(scene, "papershred", 12, 4, (ctx) => {
    ctx.fillStyle = "#f3eedf"; ctx.fillRect(0, 0, 12, 4);
    ctx.fillStyle = "#c8c2b0"; ctx.fillRect(0, 3, 12, 1);
  });
  canvasTexture(scene, "shadow", 48, 22, (ctx) => {
    const g = ctx.createRadialGradient(24, 11, 0, 24, 11, 24);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.scale(1, 22 / 48);
    ctx.beginPath(); ctx.arc(24, 24, 24, 0, Math.PI * 2); ctx.fill();
  });

  // projectiles
  canvasTexture(scene, "p_staple", 16, 7, (ctx) => {
    ctx.fillStyle = "#3a3f48"; ctx.fillRect(0, 0, 16, 7);
    ctx.fillStyle = "#e9edf2"; ctx.fillRect(1, 1, 14, 2); ctx.fillRect(1, 1, 2, 5); ctx.fillRect(13, 1, 2, 5);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(3, 1, 9, 1);
  });
  canvasTexture(scene, "p_coffee", 12, 12, (ctx) => {
    const g = ctx.createRadialGradient(5, 5, 0, 6, 6, 6);
    g.addColorStop(0, "#c48a52"); g.addColorStop(0.6, "#7a4a24"); g.addColorStop(1, "rgba(90,50,20,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(6, 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,240,220,0.8)"; ctx.fillRect(3, 3, 2, 2);
  });
  canvasTexture(scene, "p_calc", 18, 22, (ctx) => {
    ctx.fillStyle = "#1f232b"; ctx.fillRect(0, 0, 18, 22);
    ctx.fillStyle = "#3a404b"; ctx.fillRect(1, 1, 16, 20);
    ctx.fillStyle = "#9ee6a8"; ctx.fillRect(3, 3, 12, 5);
    ctx.fillStyle = "#d9dde3";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillRect(3 + c * 4, 10 + r * 3.6, 3, 2.4);
    ctx.fillStyle = "#c97a3a"; ctx.fillRect(13, 17, 3, 3);
  });
  canvasTexture(scene, "p_memo", 18, 14, (ctx) => {
    ctx.fillStyle = "#9a9384"; ctx.fillRect(0, 0, 18, 14);
    ctx.fillStyle = "#fbf8ee"; ctx.fillRect(1, 1, 16, 12);
    ctx.fillStyle = "#e05a4d"; ctx.fillRect(3, 3, 7, 2);
    ctx.fillStyle = "#9aa3b0"; for (let l = 0; l < 3; l++) ctx.fillRect(3, 6 + l * 2.2, 12, 1);
  });
  canvasTexture(scene, "p_bolt", 24, 8, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 24, 0);
    g.addColorStop(0, "rgba(79,209,255,0)"); g.addColorStop(0.5, "rgba(79,209,255,0.9)"); g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g; ctx.fillRect(0, 2, 24, 4);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(16, 3, 8, 2);
  });
  canvasTexture(scene, "p_ball", 22, 22, (ctx) => {
    const g = ctx.createRadialGradient(8, 7, 1, 11, 11, 11);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, "#c9d1dc"); g.addColorStop(1, "#4d5562");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(11, 11, 10.5, 0, Math.PI * 2); ctx.fill();
  });
  canvasTexture(scene, "p_wave", 40, 40, (ctx) => {
    ctx.strokeStyle = "rgba(255,210,90,0.95)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(8, 20, 24, -0.9, 0.9); ctx.stroke();
    ctx.strokeStyle = "rgba(255,240,180,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(2, 20, 24, -0.8, 0.8); ctx.stroke();
  });

  // hazards
  canvasTexture(scene, "h_water", 80, 80, (ctx) => {
    const g = ctx.createRadialGradient(40, 40, 6, 40, 40, 40);
    g.addColorStop(0, "rgba(70,170,230,0.62)");
    g.addColorStop(0.72, "rgba(70,170,230,0.52)");
    g.addColorStop(1, "rgba(70,170,230,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 80, 80);
    ctx.fillStyle = "rgba(220,245,255,0.35)";
    ctx.fillRect(22, 26, 14, 2);
    ctx.fillRect(44, 48, 10, 2);
  });
  canvasTexture(scene, "h_paper", 64, 64, (ctx) => {
    for (let i = 0; i < 26; i++) {
      ctx.save();
      ctx.translate(6 + Math.random() * 52, 6 + Math.random() * 52);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillStyle = Math.random() < 0.85 ? "#f3eedf" : "#e4d8a8";
      ctx.fillRect(-7, -1.5, 14, 3);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(-7, 1, 14, 0.8);
      ctx.restore();
    }
  });
  // Loose sheets of shredded-office paper: flat page, and a crumpled ball-ish variant.
  canvasTexture(scene, "h_sheet", 34, 28, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(5, 6, 24, 18);
    ctx.fillStyle = "#f7f3e8"; ctx.fillRect(3, 3, 24, 18);
    ctx.strokeStyle = "rgba(60,50,30,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(3.5, 3.5, 23, 17);
    ctx.fillStyle = "rgba(70,90,140,0.45)";
    for (let y = 8; y < 19; y += 3) ctx.fillRect(6, y, 6 + Math.random() * 14, 1);
  });
  canvasTexture(scene, "h_sheet2", 30, 28, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(16, 17, 11, 8, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ece6d4";
    ctx.beginPath();
    const pts = [[4, 10], [10, 3], [19, 5], [26, 11], [22, 19], [12, 22], [5, 17]];
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,80,60,0.45)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(9, 6); ctx.lineTo(14, 13); ctx.lineTo(8, 18); ctx.moveTo(14, 13); ctx.lineTo(23, 12); ctx.stroke();
  });
  canvasTexture(scene, "h_coffee", 56, 56, (ctx) => {
    ctx.fillStyle = "rgba(92,54,24,0.55)";
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.4) {
      const r = 16 + Math.random() * 9;
      const x = 28 + Math.cos(a) * r, y = 28 + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.fill();
  });
  canvasTexture(scene, "glass_shards", 64, 64, (ctx) => {
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(200,235,255,${0.35 + Math.random() * 0.4})`;
      ctx.beginPath();
      const x = Math.random() * 60, y = Math.random() * 60;
      ctx.moveTo(x, y); ctx.lineTo(x + 3 + Math.random() * 6, y + Math.random() * 3); ctx.lineTo(x + Math.random() * 3, y + 3 + Math.random() * 5);
      ctx.fill();
    }
  });

  // Cartoon flame: six frames of flicker, used on burning tiles and burning coworkers.
  {
    const FW = 48, FH = 64, N = 6;
    canvasTexture(scene, "flame", FW * N, FH, (ctx) => {
      for (let k = 0; k < N; k++) {
        const ph = (k / N) * Math.PI * 2;
        const cx = k * FW + FW / 2, base = FH - 3;
        const lay = (w: number, h: number, sway: number, color: string) => {
          const tipX = cx + Math.sin(ph) * sway, tipY = base - h;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(cx - w / 2, base - h * 0.3);
          ctx.bezierCurveTo(cx - w / 2, base + 3, cx + w / 2, base + 3, cx + w / 2, base - h * 0.3);
          ctx.bezierCurveTo(cx + w / 2, base - h * 0.62, tipX + w * 0.18, tipY + h * 0.3, tipX, tipY);
          ctx.bezierCurveTo(tipX - w * 0.2, tipY + h * 0.34, cx - w / 2, base - h * 0.6, cx - w / 2, base - h * 0.3);
          ctx.fill();
        };
        lay(42, 54 + Math.sin(ph * 2) * 5, 8, "#d8432a");
        lay(32, 43 + Math.cos(ph * 2) * 4, 7, "#f0862a");
        lay(20, 30 + Math.sin(ph * 3) * 3, 5, "#ffcf4a");
        lay(10, 15 + Math.cos(ph) * 2, 2, "#fff2b0");
        // a little detached lick of fire that flickers away
        ctx.fillStyle = "#f0862a";
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ph) * 9, base - 50 - Math.sin(ph) * 5, 3 + Math.sin(ph * 2), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const t = scene.textures.get("flame");
    for (let k = 0; k < N; k++) t.add(k, 0, k * FW, 0, FW, FH);
  }

  // Water layer stamps (tinted per pass when painting puddles).
  canvasTexture(scene, "w_disc", 64, 64, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.fill();
  });
  canvasTexture(scene, "w_px", 8, 8, (ctx) => { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 8, 8); });
  canvasTexture(scene, "w_shine", 48, 48, (ctx) => {
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(18, 18, 13, 3.5, 4.6); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(33, 32, 2.2, 0, Math.PI * 2); ctx.fill();
  });

  // Office Romance heart left on the floor
  canvasTexture(scene, "p_heart", 40, 36, (ctx) => {
    ctx.fillStyle = "rgba(255,111,181,0.25)";
    ctx.beginPath(); ctx.ellipse(20, 30, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cf6a4c"; ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(20, 31); ctx.bezierCurveTo(6, 22, 3, 15, 3, 10); ctx.bezierCurveTo(3, 5, 7, 2, 11, 2);
    ctx.bezierCurveTo(15, 2, 18, 4, 20, 7); ctx.bezierCurveTo(22, 4, 25, 2, 29, 2); ctx.bezierCurveTo(33, 2, 37, 5, 37, 10);
    ctx.bezierCurveTo(37, 15, 34, 22, 20, 31); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.ellipse(11, 9, 3, 2, -0.6, 0, Math.PI * 2); ctx.fill();
  });

  // ---- new weapon projectiles (drawn facing right)
  canvasTexture(scene, "p_plane", 30, 22, (ctx) => {
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 2.5;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(28, 11); ctx.lineTo(2, 2); ctx.lineTo(9, 11); ctx.lineTo(2, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#dce6ea";
    ctx.beginPath(); ctx.moveTo(28, 11); ctx.lineTo(9, 11); ctx.lineTo(4, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
  canvasTexture(scene, "p_confetti", 9, 7, (ctx) => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 9, 7);
    ctx.fillStyle = "rgba(27,15,59,0.35)"; ctx.fillRect(0, 5, 9, 2);
  });
  canvasTexture(scene, "p_drop", 14, 12, (ctx) => {
    ctx.fillStyle = "#6aa3b4"; ctx.strokeStyle = "#1b4f8a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(13, 6); ctx.quadraticCurveTo(6, 0, 2, 3); ctx.quadraticCurveTo(-1, 6, 2, 9); ctx.quadraticCurveTo(6, 12, 13, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(4, 4, 3, 2);
  });
  canvasTexture(scene, "p_slip", 24, 16, (ctx) => {
    ctx.fillStyle = "#cf6a4c"; ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(1.5, 1.5, 21, 13, 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(5, 6); ctx.lineTo(18, 6); ctx.moveTo(5, 10); ctx.lineTo(14, 10); ctx.stroke();
  });
  canvasTexture(scene, "p_toner", 30, 18, (ctx) => {
    ctx.fillStyle = "#2a2c33"; ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(1.5, 1.5, 27, 15, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#5b6380"; ctx.fillRect(7, 5, 13, 8);
    ctx.fillStyle = "#c97a3a"; ctx.beginPath(); ctx.arc(26, 4, 3, 0, Math.PI * 2); ctx.fill();
  });

  // smashed drywall: plaster dust with broken panel chunks
  canvasTexture(scene, "rubble", 80, 80, (ctx) => {
    const dust = ctx.createRadialGradient(40, 40, 4, 40, 40, 38);
    dust.addColorStop(0, "rgba(236,226,206,0.75)"); dust.addColorStop(1, "rgba(236,226,206,0)");
    ctx.fillStyle = dust; ctx.fillRect(0, 0, 80, 80);
    for (let i = 0; i < 16; i++) {
      const x = 10 + Math.random() * 60, y = 10 + Math.random() * 60, s = 4 + Math.random() * 9;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.random() * Math.PI);
      ctx.fillStyle = i % 4 === 0 ? "#7a5a3c" : i % 3 === 0 ? "#d6c7ad" : "#efe3cf";
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.lineTo(s * 0.8, -s * 0.7); ctx.lineTo(s, s * 0.4); ctx.lineTo(-s * 0.4, s * 0.8); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(60,40,30,0.45)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
  });

  // HR riot shield (cubicle divider), seen from above
  canvasTexture(scene, "shield", 16, 56, (ctx) => {
    ctx.fillStyle = "#2c323c"; ctx.fillRect(0, 0, 16, 56);
    ctx.fillStyle = "#5c6b80"; ctx.fillRect(2, 2, 12, 52);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(2, 2, 3, 52);
    ctx.fillStyle = "#e2e6ec"; ctx.fillRect(5, 22, 6, 12);
  });

  // cubicle partition: light top strip + fabric face, tiled horizontally
  canvasTexture(scene, "partition", 64, 24, (ctx) => {
    ctx.fillStyle = "#b9c0ca"; ctx.fillRect(0, 0, 64, 6);
    ctx.fillStyle = "#e1e5ea"; ctx.fillRect(0, 0, 64, 2);
    ctx.fillStyle = "#56657a"; ctx.fillRect(0, 6, 64, 18);
    speckle(ctx, 0, 6, 64, 18, 90, "rgba(255,255,255,0.06)", "rgba(0,0,0,0.12)", 1);
    ctx.fillStyle = "#3d4757"; ctx.fillRect(0, 22, 64, 2);
  });
  canvasTexture(scene, "partition_v", 12, 64, (ctx) => {
    ctx.fillStyle = "#56657a"; ctx.fillRect(0, 0, 12, 64);
    ctx.fillStyle = "#b9c0ca"; ctx.fillRect(0, 0, 4, 64);
  });

  // elevator door panels (animated open/close)
  canvasTexture(scene, "elev_door", 54, 42, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 54, 0);
    g.addColorStop(0, "#c9ced6"); g.addColorStop(0.5, "#e6e9ee"); g.addColorStop(1, "#b6bcc6");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 54, 42);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(26, 0, 2, 42);
  });
  canvasTexture(scene, "elev_dark", 54, 42, (ctx) => {
    ctx.fillStyle = "#0b0d11"; ctx.fillRect(0, 0, 54, 42);
    ctx.fillStyle = "rgba(255,200,120,0.25)"; ctx.fillRect(4, 30, 46, 12);
  });

  // Office Drone: little quadcopter with a red status light.
  canvasTexture(scene, "drone", 40, 40, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(20, 30, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(32, 32); ctx.moveTo(32, 8); ctx.lineTo(8, 32); ctx.stroke();
    for (const [x, y] of [[8, 8], [32, 8], [8, 32], [32, 32]]) {
      ctx.fillStyle = "rgba(200,230,255,0.55)"; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = "#e9c25a"; ctx.strokeStyle = "#1c1d21"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(11, 13, 18, 14, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff3355"; ctx.beginPath(); ctx.arc(20, 20, 3, 0, Math.PI * 2); ctx.fill();
  });

  canvasTexture(scene, "spark_line", 32, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, "rgba(160,230,255,0)"); g.addColorStop(0.5, "#ffffff"); g.addColorStop(1, "rgba(160,230,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 4);
  });
}
