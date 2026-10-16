import Phaser from "phaser";
import { TILE } from "../config";
import { SFX_FILES, MUSIC_FILES, VOICE_FILES } from "../systems/Audio";

export const CHAR_SPRITES = [
  "hitman1_gun", "hitman1_machine", "hitman1_silencer", "hitman1_stand", "hitman1_reload", "hitman1_hold",
  "manBrown_hold", "womanGreen_hold", "survivor1_hold", "manBlue_hold", "manRed_hold",
  "manOld_hold", "womanOld_hold", "hitman2_gun", "hitman2_machine", "survivor2_gun",
  "soldier1_hold", "soldier2_hold", "zombie1_hold", "zombie2_hold", "robot1_machine", "robot2_machine",
  "manBrown_stand", "womanGreen_stand", "survivor1_stand", "manBlue_stand", "manRed_stand",
  "manOld_stand", "womanOld_stand", "hitman2_stand", "survivor2_stand", "soldier1_stand", "soldier2_stand",
  "zombie1_stand", "zombie2_stand", "robot1_stand", "robot2_stand"
];

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
  10: [19]
};
export const WALL_INDEX = { CAP: 21, FACE: 22, WINDOW: 23, FACE_ALT: 24, ELEV_L: 25, ELEV_R: 26, EXIT_L: 27, EXIT_R: 28, GLASS: 29, GLASS_FACE: 30 };
const TILESET_COUNT = 32;

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
    for (const v of VOICE_FILES) this.load.audio(`voice_${v}`, `assets/audio/voice/${v}.ogg`);
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
    ctx.fillStyle = "#ff8a3d"; ctx.fillRect(13, 17, 3, 3);
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

  canvasTexture(scene, "spark_line", 32, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, "rgba(160,230,255,0)"); g.addColorStop(0.5, "#ffffff"); g.addColorStop(1, "rgba(160,230,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 4);
  });
}
