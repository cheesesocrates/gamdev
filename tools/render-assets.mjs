// Usage:
//   node tools/render-assets.mjs measure            -> prints model bounding boxes
//   node tools/render-assets.mjs sheet <out.png>    -> contact sheet of every spec (for review)
//   node tools/render-assets.mjs render             -> writes public/assets/furniture/*.png + manifest.json
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPECS, RENDER_OPTS } from "./furniture-specs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "render";

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
];

const server = await createServer({ root, logLevel: "error", server: { port: 5199, strictPort: false } });
await server.listen();
const port = server.config.server.port;
const url = `http://localhost:${server.httpServer.address().port}/tools/render.html`;

const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((b) => fs.existsSync(b)),
  headless: true,
  args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text()); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction("window.ready === true", { timeout: 60000 });

try {
  if (mode === "materials") {
    const list = process.argv.slice(3).map((s) => `/tools/models/${s}.glb`);
    const res = await page.evaluate((l) => window.listMaterials(l), list);
    for (const [k, v] of Object.entries(res)) console.log(k.replace("/tools/models/", "").padEnd(36), JSON.stringify(v));
  } else if (mode === "measure") {
    const models = [...new Set(SPECS.flatMap((s) => s.parts.map((p) => p.model)))];
    const extra = process.argv.slice(3);
    const res = await page.evaluate((list) => window.measure(list), [...models, ...extra]);
    for (const [k, v] of Object.entries(res)) {
      const size = v.max.map((m, i) => (m - v.min[i]).toFixed(2));
      console.log(`${k.padEnd(48)} size(w,h,d)=${size.join(" x ")}  min=${v.min.join(",")}`);
    }
  } else if (mode === "sheet" || mode === "render") {
    const outDir = path.join(root, "public/assets/furniture");
    if (mode === "render") fs.mkdirSync(outDir, { recursive: true });
    const manifest = {};
    const tiles = [];
    for (const spec of SPECS) {
      const rots = spec.rots ?? [0];
      for (const rot of rots) {
        const key = rots.length > 1 || rot !== 0 ? `${spec.key}_${rot}` : spec.key;
        const res = await page.evaluate(
          (s, o) => window.renderItem(s, o),
          { ...spec, rotY: rot },
          { ...RENDER_OPTS, ...(spec.opts ?? {}) }
        );
        const { dataUrl, ...meta } = res;
        manifest[key] = meta;
        tiles.push({ key, dataUrl, w: meta.w, h: meta.h });
        if (mode === "render") {
          fs.writeFileSync(path.join(outDir, `${key}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
        }
      }
    }
    if (mode === "render") {
      fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
      console.log(`rendered ${Object.keys(manifest).length} sprites -> ${outDir}`);
    } else {
      const outBase = process.argv[3] ?? path.join(root, "furniture-sheet");
      const perSheet = 35;
      for (let sheet = 0; sheet * perSheet < tiles.length; sheet++) {
      const chunk = tiles.slice(sheet * perSheet, (sheet + 1) * perSheet);
      const out = `${outBase}-${sheet + 1}.png`;
      const png = await page.evaluate(async (items) => {
        const pad = 10, colW = 210, rowH = 190, cols = 7;
        const rows = Math.ceil(items.length / cols);
        const c = document.createElement("canvas");
        c.width = cols * colW; c.height = rows * rowH;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#3a4150"; ctx.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const img = new Image();
          img.src = it.dataUrl;
          await img.decode();
          const gx = (i % cols) * colW, gy = Math.floor(i / cols) * rowH;
          ctx.fillStyle = (i + Math.floor(i / cols)) % 2 ? "#454d5e" : "#3f4757";
          ctx.fillRect(gx, gy, colW, rowH);
          const s = Math.min(1, (colW - pad * 2) / it.w, (rowH - 30 - pad) / it.h);
          ctx.drawImage(img, gx + (colW - it.w * s) / 2, gy + 24 + (rowH - 24 - it.h * s) / 2, it.w * s, it.h * s);
          ctx.fillStyle = "#ffd75a"; ctx.font = "bold 13px Consolas, monospace";
          ctx.fillText(`${it.key} ${it.w}x${it.h}`, gx + 6, gy + 16);
        }
        return c.toDataURL("image/png");
      }, chunk);
      fs.writeFileSync(out, Buffer.from(png.split(",")[1], "base64"));
      console.log(`sheet -> ${out}`);
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
