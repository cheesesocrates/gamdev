// Visual smoke test for chore mini-games + hazards. node tools/vistest.mjs <outDir>
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv[2] ?? path.join(root, "playtest-out");
fs.mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, logLevel: "error", server: { port: 5198 } });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((b) => fs.existsSync(b)),
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: path.join(outDir, `${n}.png`) });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
try {
  await page.goto(`http://localhost:5198/`, { waitUntil: "load" });
  await page.waitForFunction("window.__HT && window.__HT.scene && window.__HT.scene.phase === 'title'", { timeout: 120000 });
  await page.mouse.click(640, 360);
  await sleep(1200);
  await page.click("#start");
  await sleep(3500);
  await shot("a-crunch");
  // hazards around the player
  await ev(() => {
    const s = window.__HT.scene, p = s.player;
    s.hazards.flood(p.x + 150, p.y, 22, 0.01);
    s.hazards.paperPatch(p.x - 160, p.y, 2);
    s.hazards.paperPatch(p.x - 60, p.y + 150, 1);
    s.hazards.flood(p.x + 60, p.y + 200, 6, 0.01);
  });
  await sleep(900);
  await shot("b-hazards");
  const kinds = ["timing", "mash", "whack", "type", "sequence", "numbers", "track"];
  for (const k of kinds) {
    await ev((kind) => {
      const s = window.__HT.scene;
      s.choreKinds.emails = kind;
      s.startMini("emails", () => {});
    }, k);
    await sleep(900);
    await shot(`m-${k}`);
    await page.keyboard.press("Escape");
    await sleep(200);
  }
  console.log("mini open after esc:", await ev(() => !!window.__HT.scene.mini), "phase:", await ev(() => window.__HT.scene.phase));
} catch (e) { console.log("FAIL", e.message); }
console.log("errors:", errors.length ? errors.join("\n") : "none");
await browser.close();
await server.close();
