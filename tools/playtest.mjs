// Headless smoke test: boots the game, drives a scripted session, saves screenshots.
//   node tools/playtest.mjs <outDir> [full|combat]
import { createServer, preview } from "vite";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv[2] ?? path.join(root, "playtest-out");
const scenario = process.argv[3] ?? "full";
fs.mkdirSync(outDir, { recursive: true });

// PT_DIST=1 tests the production build in dist/ instead of the dev server.
const server = process.env.PT_DIST
  ? await preview({ root, logLevel: "error", preview: { port: 5196 } })
  : await createServer({ root, logLevel: "error", server: { port: 5197 } });
if (!process.env.PT_DIST) await server.listen();
const url = `http://localhost:${server.httpServer.address().port}/`;

const browser = await puppeteer.launch({
  executablePath: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((b) => fs.existsSync(b)),
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log("shot", name);
};
const ev = (fn, ...args) => page.evaluate(fn, ...args);
const state = () => ev(() => {
  const h = window.__HT;
  const s = h.scene;
  return {
    phase: s.phase, day: h.state.day, hp: h.state.hp, bank: h.state.bank, fired: s.fired, quota: s.quota,
    hostile: s.enemies.filter((e) => e.hostile).length, allies: s.enemies.filter((e) => e.ally).length,
    boss: !!(s.waves.boss && !s.waves.boss.dead), chores: [...s.choresDone], crunchLeft: Math.round(s.crunchLeft), perf: h.perf(), prof: h.prof()
  };
});

const doStation = async (id) => {
  const ok = await ev((sid) => {
    const s = window.__HT.scene;
    const st = s.stations.list.find((x) => x.def.id === sid);
    if (!st) return false;
    const b = st.box;
    const p = s.world.nearestWalkable((b.x0 + b.x1) / 2, b.y1 + 40);
    s.player.x = p.x; s.player.y = p.y;
    return true;
  }, id);
  if (!ok) { console.log("no station", id); return; }
  await sleep(150);
  const label = () => ev((sid) => { const s = window.__HT.scene; const st = s.stations.list.find((x) => x.def.id === sid); const a = s.stations.actionFor(st); return a ? a.label : null; }, id);
  const before = await label();
  await page.keyboard.down("KeyE");
  await sleep(600);
  await ev(() => { const m = window.__HT.scene.mini; if (m) m.win(); });
  await sleep(700);
  const t = Date.now();
  while (Date.now() - t < 30000) {
    await sleep(250);
    if ((await label()) !== before) break;
  }
  await page.keyboard.up("KeyE");
  console.log("  station", id, JSON.stringify(before), "->", JSON.stringify(await label()));
  await sleep(150);
};

const aimAndFire = async (ms) => {
  const target = await ev(() => {
    const s = window.__HT.scene;
    const e = s.nearestEnemy(s.player.x, s.player.y, 2500);
    if (!e) return null;
    const cam = s.cameras.main;
    return { x: (e.x - cam.worldView.x) * cam.zoom, y: (e.y - cam.worldView.y) * cam.zoom };
  });
  if (target) {
    await page.mouse.move(Math.max(5, Math.min(1275, target.x)), Math.max(5, Math.min(715, target.y)));
    await page.mouse.down();
    await sleep(ms);
    await page.mouse.up();
  } else await sleep(ms);
};

try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("window.__HT && window.__HT.scene && window.__HT.scene.phase === 'title'", { timeout: 120000 });
  console.log("booted in", Date.now() - t0, "ms");
  await page.mouse.click(640, 360);
  await sleep(1200);
  await shot("01-title");
  await page.click("#start");
  await sleep(1000);

  if (scenario === "full") {
    await shot("02-crunch-start");
    const stationOf = { emails: "emails", print: "copier_main", shred: "shredder", coffee: "coffee", presentation: "presentation", memos: "memos", server: "server", plant: "ceo_plant" };
    const todo = await ev(() => window.__HT.scene.dayCfg.chores.filter((c) => !window.__HT.scene.choresDone.has(c)));
    console.log("chores today:", todo.join(", "));
    for (const c of todo) await doStation(stationOf[c]);
    const coolers = await ev(() => window.__HT.scene.stations.list.filter((s) => s.def.kind === "cooler").map((s) => s.def.id));
    await doStation(coolers[coolers.length - 1]);
    await doStation("copier_2");
    await doStation("barricade_copy");
    console.log(await state());
    await shot("03-after-chores");
    await page.keyboard.press("Enter");
    await sleep(1000);
    await shot("04-review");
    await ev(() => { const c = document.querySelector("#review .card.buyable"); if (c) c.click(); });
    await sleep(300);
    await page.click("#go");
    await sleep(2800);
    await shot("05-announce");
    await sleep(3400);
    await shot("06-fight-start");
    for (let i = 0; i < 14; i++) await aimAndFire(450);
    console.log(await state());
    await shot("07-fight");
    await ev(() => window.__HT.god(true));
    for (let k = 0; k < 30; k++) {
      if ((await state()).phase !== "downsizing") break;
      await ev(() => window.__HT.killAll());
      await sleep(700);
    }
    await sleep(2800);
    await shot("08-results");
    await ev(() => { const c = document.querySelector("#results .card"); if (c) c.click(); });
    await sleep(1500);
    console.log(await state());
    await shot("09-day2");
  }

  if (scenario === "combat") {
    await ev(() => {
      const h = window.__HT;
      h.give("multishot", 2); h.give("ricochet", 2); h.give("explode", 1); h.give("chain", 1);
      h.give("orbit", 2); h.give("interns", 2); h.give("pierce", 1); h.give("ignite", 1); h.give("severance", 1);
      h.state.unlocked.coffee = true; h.state.unlocked.laser = true;
      h.god(true);
      h.day(5);
    });
    await sleep(600);
    await ev(() => window.__HT.toFight());
    await sleep(400);
    await ev(() => window.__HT.toFight());
    await sleep(1500);
    console.log(await state());
    await shot("c01-fight-start");
    const keys = ["Digit1", "Digit2", "Digit3"];
    for (let i = 0; i < 48; i++) {
      if (i % 12 === 0) await page.keyboard.press(keys[(i / 12) % 3]);
      if (i % 5 === 2) await page.keyboard.press("Space");
      if (i === 16) await ev(() => { const s = window.__HT.scene; s.fired = Math.max(s.fired, Math.floor(s.quota * 0.4)); });
      await aimAndFire(500);
      if (i % 8 === 7) {
        console.log(await state());
        await shot(`c${String(2 + Math.floor(i / 8)).padStart(2, "0")}-combat`);
      }
    }
  }
} catch (e) {
  console.log("SCRIPT ERROR", e);
  await shot("zz-error").catch(() => {});
} finally {
  console.log("---- console errors/warnings (" + errors.length + ") ----");
  for (const e of errors.slice(0, 40)) console.log(e);
  await browser.close();
  await (server.close ? server.close() : server.httpServer.close());
}
