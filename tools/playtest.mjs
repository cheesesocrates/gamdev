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
    await sleep(700);
    await shot("02a-intro-crunch");
    await page.keyboard.press("Space");
    await sleep(1600);
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
    await sleep(900);
    await shot("04a-intro-review");
    await page.keyboard.press("Space");
    await sleep(1500);
    await shot("04-review");
    await ev(() => { const c = document.querySelector("#review .card.buyable"); if (c) c.click(); });
    await sleep(700);
    await shot("04b-review-bought");
    await page.click("#go");
    await sleep(2800);
    await shot("05-announce");
    await sleep(3600);
    await shot("05b-intro-fight");
    await page.keyboard.press("Space");
    await sleep(1300);
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
    await sleep(2200);
    console.log(await state());
    await shot("09-day2");
  }

  if (scenario === "stress") {
    await ev(() => {
      const h = window.__HT;
      h.give("multishot", 2); h.give("ricochet", 2); h.give("chain", 1); h.give("ignite", 1); h.give("orbit", 2); h.give("drone", 2);
      for (const id of ["corner", "wetfloor", "sticky", "ninja", "deskjockey", "handshake", "blame", "romance", "binder", "command", "hostile", "livewire", "firedrill", "plusone"]) h.give(id, 1);
      for (const w of Object.keys(h.state.unlocked)) h.state.unlocked[w] = true;
      h.god(true);
      h.day(6);
    });
    await sleep(500);
    await ev(() => window.__HT.toFight());
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(1200);
    await ev(() => {
      const s = window.__HT.scene;
      for (const st of s.stations.list) {
        if (st.def.kind === "cooler") s.stations.kickCooler(st);
        if (st.def.kind === "powerstrip") s.stations.overload(st);
      }
      s.hazards.paperPatch(s.player.x + 200, s.player.y, 3);
      s.hazards.igniteRadius(s.player.x + 200, s.player.y, 160, 2);
      s.activateSprinklers("STRESS TEST", "");
    });
    const report = async (label) => {
      const r = await ev(() => ({ perf: window.__HT.perf(), prof: window.__HT.prof() }));
      const prof = Object.entries(r.prof).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ");
      console.log(label, JSON.stringify(r.perf), "|", prof);
    };
    // Shove the nearest desk with a dodge roll.
    const desk = await ev(() => {
      const s = window.__HT.scene;
      let best = null, bd = Infinity;
      for (const p of s.props.list) { const d = Math.hypot(p.f.x - s.player.x, p.f.y - s.player.y); if (d < bd) { bd = d; best = p; } }
      if (!best) return null;
      const pt = s.world.nearestWalkable(best.f.x - best.f.w / 2 - 60, best.f.y);
      s.player.x = pt.x; s.player.y = pt.y;
      return { x: best.f.x, y: best.f.y, hx: best.homeX };
    });
    if (desk) {
      await page.keyboard.down("KeyD"); await sleep(120); await page.keyboard.press("Space"); await sleep(400); await page.keyboard.up("KeyD"); await sleep(600);
      console.log("desk moved", await ev(() => { const s = window.__HT.scene; return s.props.list.filter((p) => Math.abs(p.f.x - p.homeX) + Math.abs(p.f.y - p.homeY) > 4).length; }));
    }
    const weapons = ["Digit6", "Digit7", "Digit4", "Digit1", "Digit8", "Digit9", "Digit5", "Digit2", "Digit3"];
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press(weapons[i % weapons.length]);
      const target = await ev(() => {
        const s = window.__HT.scene;
        const e = s.nearestEnemy(s.player.x, s.player.y, 2500);
        const cam = s.cameras.main;
        const x = e ? e.x : s.player.x + 300, y = e ? e.y : s.player.y;
        return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
      });
      await page.mouse.move(Math.max(5, Math.min(1275, target.x)), Math.max(5, Math.min(715, target.y)));
      for (let k = 0; k < 4; k++) { await page.mouse.down(); await sleep(140); await page.mouse.up(); await sleep(40); }
      if (i % 3 === 2) await report(`t${i}`);
      if (i === 8) await shot("s01-stress");
    }
    await shot("s02-stress");
  }

  if (scenario === "epress") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1500);
    const chores = await ev(() => window.__HT.scene.dayCfg.chores);
    const stationOf = { emails: "emails", print: "copier_main", shred: "shredder", coffee: "coffee", presentation: "presentation", memos: "memos", server: "server", plant: "ceo_plant" };
    for (const c of chores.slice(0, 2)) {
      await ev((sid) => {
        const s = window.__HT.scene;
        const st = s.stations.list.find((x) => x.def.id === sid);
        const b = st.box;
        const p = s.world.nearestWalkable((b.x0 + b.x1) / 2, b.y1 + 40);
        s.player.x = p.x; s.player.y = p.y;
      }, stationOf[c]);
      await sleep(250);
      await page.keyboard.down("KeyE");
      await sleep(400);
      const opened = await ev(() => !!window.__HT.scene.mini);
      await page.keyboard.up("KeyE");
      console.log(`one E press on ${c}: mini ${opened ? "OPENED" : "did NOT open"}`);
      // The key is released while the mini-game is up, exactly like a real tap.
      await ev(() => window.__HT.scene.mini?.win());
      await sleep(1600);
    }
  }

  if (scenario === "props") {
    await ev(() => { window.__HT.god(true); window.__HT.toFight(); });
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(1000);
    const info = await ev(() => {
      const s = window.__HT.scene;
      const keys = s.props.list.map((p) => p.f.key);
      const p = s.props.list.find((q) => q.f.key === "break_table") ?? s.props.list[0];
      s.player.x = p.f.x - p.f.w / 2 - s.player.r - 2;
      s.player.y = p.f.y;
      return { n: s.props.list.length, keys: [...new Set(keys)], key: p.f.key, x: p.f.x, y: p.f.y, free: s.world.boxFree(p.f.x - p.f.w / 2 + 6, p.f.y - p.f.h / 2 + 1, p.f.x + p.f.w / 2 + 4, p.f.y + p.f.h / 2 - 1, p.f.collider, p.neighbours) };
    });
    console.log("props", JSON.stringify(info));
    await page.keyboard.down("KeyD"); await sleep(1200); await page.keyboard.up("KeyD");
    console.log("after walk", JSON.stringify(await ev(() => { const s = window.__HT.scene; const p = s.props.list.find((q) => q.f.key === "break_table") ?? s.props.list[0]; return { x: p.f.x, moving: p.moving, px: s.player.x, py: s.player.y }; })));
    await ev(() => { const s = window.__HT.scene; const p = s.props.list.find((q) => q.f.key === "break_table") ?? s.props.list[0]; s.player.x = p.f.x - p.f.w / 2 - 90; s.player.y = p.f.y; });
    await page.keyboard.down("KeyD"); await sleep(100); await page.keyboard.press("Space"); await sleep(500); await page.keyboard.up("KeyD"); await sleep(700);
    console.log("after roll", JSON.stringify(await ev(() => { const s = window.__HT.scene; const p = s.props.list.find((q) => q.f.key === "break_table") ?? s.props.list[0]; return { x: p.f.x, home: p.homeX, moving: p.moving }; })));
    await shot("p01-props");
  }

  if (scenario === "minis") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1500);
    const rect = (sel) => ev((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
    for (const c of ["plant", "print", "shred", "coffee", "presentation", "memos", "server", "emails"]) {
      await ev((chore) => { const s = window.__HT.scene; s.mini?.close(); s.mini = null; s.startMini(chore, () => {}); }, c);
      await sleep(700);
      if (c === "plant") {
        for (let i = 0; i < 12; i++) {
          const r = await rect(".pl-plant");
          if (r) await page.mouse.move(r.x + r.w / 2, r.y - 10, { steps: 2 });
          await sleep(90);
        }
      } else if (c === "print" || c === "presentation") {
        for (let i = 0; i < 3; i++) { await page.keyboard.press("Space"); await sleep(260); }
      } else if (c === "shred") {
        for (let i = 0; i < 7; i++) { await page.keyboard.press("Space"); await sleep(70); }
      } else if (c === "coffee") {
        for (let i = 0; i < 3; i++) {
          const r = await rect(".cf-leak:not(.fixed)");
          if (r) await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
          await sleep(300);
        }
      } else if (c === "memos") {
        const r = await rect(".mm-sign");
        if (r) {
          await page.mouse.move(r.x + 10, r.y + r.h / 2);
          await page.mouse.down();
          for (let i = 0; i < 6; i++) {
            await page.mouse.move(r.x + r.w * 0.9, r.y + r.h * (0.3 + (i % 3) * 0.2), { steps: 4 });
            await page.mouse.move(r.x + r.w * 0.1, r.y + r.h * (0.5 + (i % 2) * 0.2), { steps: 4 });
          }
          await page.mouse.up();
        }
      } else if (c === "server") {
        const plugs = await ev(() => [...document.querySelectorAll(".sv-plug")].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, c: e.style.getPropertyValue("--w") }; }));
        const ports = await ev(() => [...document.querySelectorAll(".sv-port")].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, c: e.style.getPropertyValue("--w") }; }));
        for (const p of plugs.slice(0, 2)) {
          const t = ports.find((x) => x.c === p.c);
          await page.mouse.move(p.x, p.y);
          await page.mouse.down();
          await page.mouse.move(t.x, t.y, { steps: 8 });
          await page.mouse.up();
          await sleep(150);
        }
        const p = plugs[2];
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move((p.x + ports[0].x) / 2, p.y - 40, { steps: 6 });
      } else if (c === "emails") {
        const w = await ev(() => document.querySelector(".em-text").textContent);
        await page.keyboard.type(w.replace(/ /g, " ").slice(0, 7), { delay: 40 });
      }
      await shot(`m-${c}`);
      await page.mouse.up().catch(() => {});
    }
    await ev(() => { const s = window.__HT.scene; s.mini?.win(); });
    await sleep(1400);
    await shot("m-zz-after-win");
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
