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
if (process.env.PT_NOVISION) await page.evaluateOnNewDocument(() => { window.__PT_NOVISION = true; });
if (process.env.PT_NOFLAMES) await page.evaluateOnNewDocument(() => { window.__PT_NOFLAMES = true; });
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
  await sleep(900);
  if (scenario === "full") await shot("01b-lore");
  // The lore screen: skip it.
  await ev(() => { const b = document.querySelector("#lskip"); if (b) b.click(); });
  await sleep(600);

  if (scenario === "full") {
    await sleep(700);
    await shot("02a-intro-crunch");
    await page.keyboard.press("Space");
    await sleep(1600);
    await shot("02-crunch-start");
    const todo = await ev(() => { const s = window.__HT.scene; return s.dayCfg.chores.filter((c) => !s.choresDone.has(c)).map((c) => [c, s.stations.hostOf(c)?.def.id, s.stations.roomOf(c)]); });
    console.log("chores today:", JSON.stringify(todo));
    for (const [, id] of todo) await doStation(id);
    const coolers = await ev(() => window.__HT.scene.stations.list.filter((s) => s.def.kind === "cooler").map((s) => s.def.id));
    await doStation(coolers[coolers.length - 1]);
    await doStation("copier_2");
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
    await sleep(3600);
    await shot("05-announce");
    await sleep(2400);
    await shot("05a-announce-2");
    await page.mouse.click(640, 360);
    await sleep(900);
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
    await shot("08b-memo");
    await ev(() => { const b = document.querySelector("#mgo"); if (b) b.click(); });
    await sleep(1600);
    console.log(await state());
    await shot("09-day2");
  }

  // Straight to the menus: Performance Review (with money to spend), then the end-of-day picks.
  if (scenario === "ui") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    await ev(() => {
      const h = window.__HT;
      h.state.bank = 70;
      h.give("crit", 1);
      h.scene.endCrunch(true);
    });
    await sleep(900);
    await page.keyboard.press("Space");
    await sleep(1600);
    await shot("u01-review");
    await ev(() => { const c = document.querySelector("#review .card.buyable"); if (c) c.click(); });
    await sleep(700);
    await ev(() => { const c = document.querySelector("#review .gun.buyable"); if (c) c.click(); });
    await sleep(800);
    await shot("u02-review-bought");
    await ev(() => { document.querySelector("#review")?.remove(); window.__HT.scene.showResults(); });
    await sleep(1800);
    await shot("u03-results");
  }

  // The two new bosses: the Hatchet Man (day 3) and the Cold Caller (day 6).
  if (scenario === "boss") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    for (const day of [3, 6]) {
      await ev((d) => { const h = window.__HT; h.god(true); h.day(d); }, day);
      await sleep(600);
      await ev(() => window.__HT.toFight());
      await sleep(300);
      await ev(() => window.__HT.toFight());
      await sleep(1200);
      await ev(() => { const s = window.__HT.scene; s.fired = Math.floor(s.quota * 0.4); });
      for (let k = 0; k < 30; k++) { if (await ev(() => !!window.__HT.scene.waves.boss)) break; await sleep(300); }
      await sleep(1200);
      await ev(() => { const s = window.__HT.scene; const b = s.waves.boss; if (b) { const p = s.world.nearestWalkable(b.x + 380, b.y + 40); s.player.x = p.x; s.player.y = p.y; } });
      for (let i = 0; i < 18; i++) {
        await aimAndFire(380);
        if (i === 2 || i === 8 || i === 15) await shot(`b${day}-${String(i).padStart(2, "0")}`);
      }
      console.log(day, JSON.stringify(await ev(() => { const s = window.__HT.scene; const b = s.waves.boss; return { boss: b && b.def.title, hp: b && Math.round(b.hp), max: b && Math.round(b.maxHp), phones: s.phoneBombs.length, wrecked: s.wrecked.length, vis: s.vision.level, perf: window.__HT.perf(), prof: window.__HT.prof() }; })));
    }
  }

  // The code-locked door: a clue in a chore, the note, the keypad (one wrong guess), the briefcase.
  if (scenario === "vault") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    const info = await ev(() => { const s = window.__HT.scene, v = s.vault; return { room: v.room.name, code: v.code, chores: s.dayCfg.chores, notes: s.dayCfg.chores.map((c) => v.noteFor(c)) }; });
    console.log("vault", JSON.stringify(info));
    await ev(() => { const s = window.__HT.scene; const c = s.dayCfg.chores.find((x) => s.vault.noteFor(x)); s.startMini(c, () => s.completeChore(c)); });
    await sleep(1500);
    await shot("v01-chore-note");
    await ev(() => window.__HT.scene.mini?.win());
    await sleep(1600);
    await shot("v02-sticky-code");
    await ev(() => { const s = window.__HT.scene, v = s.vault; const p = s.world.nearestWalkable(v.doorX, v.doorY + (v.room.ty > 20 ? -100 : 100)); s.player.x = p.x; s.player.y = p.y; });
    await sleep(500);
    await shot("v03-door");
    await page.keyboard.press("KeyE");
    await sleep(900);
    const before = await ev(() => window.__HT.scene.crunchLeft);
    await page.keyboard.type("0000");
    await page.keyboard.press("Enter");
    await sleep(300);
    await shot("v04-keypad-wrong");
    await sleep(700);
    console.log("penalty", (before - (await ev(() => window.__HT.scene.crunchLeft))).toFixed(2), "s (expect ~1 + elapsed)");
    for (let i = 0; i < 4; i++) if (info.code[i] !== 0) await page.keyboard.press(`Digit${info.code[i]}`);
    await sleep(200);
    await shot("v05-keypad-right");
    await page.keyboard.press("Enter");
    await sleep(1800);
    console.log("open", await ev(() => window.__HT.scene.vault.open));
    await shot("v06-open");
    await ev(() => { const s = window.__HT.scene, v = s.vault; const z = s.map.zones.find((zz) => zz.name === v.room.name); const p = s.world.nearestWalkable((z.x0 + z.x1 + 1) * 32, (z.y0 + z.y1 + 1) * 32); s.player.x = p.x; s.player.y = p.y; });
    await sleep(1200);
    await shot("v07-briefcase");
    console.log("after briefcase", JSON.stringify(await ev(() => ({ bank: window.__HT.state.bank, unlocked: window.__HT.state.unlocked }))));
  }

  // Boss mechanics up close: the Hatchet Man charging across the west wing, then the memo lines for days 1-9.
  if (scenario === "hatchet") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    await ev(() => { const h = window.__HT; h.god(true); h.day(3); });
    await sleep(600);
    await ev(() => window.__HT.toFight());
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(800);
    await ev(() => {
      const s = window.__HT.scene;
      for (const e of [...s.enemies]) s.removeEnemy(e);
      s.quota = 999;
      const p = s.world.nearestWalkable(4 * 64, 27.4 * 64);
      s.player.x = p.x; s.player.y = p.y;
      const b = s.world.nearestWalkable(17 * 64, 27.4 * 64);
      const e = s.spawnEnemy("hatchet", b.x, b.y, "hostile");
      s.waves.boss = e;
      e.spawnGrace = 0;
      e.chargeCd = 0.3;
      s.flowTile = -1;
    });
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const st = await ev(() => { const s = window.__HT.scene, b = s.waves.boss; return b ? { wind: b.chargeWind > 0, charging: b.charging > 0, dizzy: b.dizzy > 0, x: Math.round(b.x), wrecked: s.wrecked.length, moved: s.props.list.filter((p) => Math.abs(p.f.x - p.homeX) + Math.abs(p.f.y - p.homeY) > 4).length } : null; });
      if (st) { for (const k of ["wind", "charging", "dizzy"]) if (st[k]) seen.add(k); }
      if (i === 6 || i === 14 || i === 24) await shot(`h${String(i).padStart(2, "0")}`);
      if (i % 8 === 0) console.log(JSON.stringify(st));
      await sleep(200);
    }
    console.log("hatchet states seen:", [...seen].join(", "));
    console.log("memo lines:");
    for (let d = 1; d <= 9; d++) {
      const line = await ev((day) => { const h = window.__HT; return h.scene.memoChange(h.dayConfig(day), h.dayConfig(day + 1)); }, d);
      console.log(d, "->", d + 1, `Due to budget cuts: ${line}.`);
    }
  }

  // The code-locked room: nobody spawns in it (the Marketing Lounge has a fire exit), and a coworker stuck in it gets out.
  if (scenario === "locked") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    const room = await ev(() => {
      const s = window.__HT.scene, v = s.vault;
      for (let k = 0; k < 60 && v.room.name !== "Marketing Lounge"; k++) v.setupDay(s.dayCfg.chores);
      window.__HT.god(true);
      return v.room.name;
    });
    console.log("locked room:", room);
    await ev(() => window.__HT.toFight());
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(800);
    const lounge = await ev(() => {
      const s = window.__HT.scene;
      s.quota = 999;
      s.dayCfg.maxAlive = 40;
      s.dayCfg.spawnEvery = 0.3;
      // Park the player next to the lounge so its fire exit would be the favourite spawn.
      const p = s.world.nearestWalkable(58.5 * 64, 14 * 64);
      s.player.x = p.x; s.player.y = p.y;
      // Somebody already stuck inside (as if they'd spawned there before the fix).
      const e = s.spawnEnemy("intern", 59 * 64, 5 * 64, "hostile");
      e.spawnGrace = 0;
      window.__stuck = e;
      return s.vault.lockedZone;
    });
    let inside = 0, maxInside = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      inside = await ev((z) => { const s = window.__HT.scene; return s.enemies.filter((e) => e !== window.__stuck && !e.dead && s.zoneAt(e.x, e.y) === z).length; }, lounge);
      maxInside = Math.max(maxInside, inside);
    }
    const stuck = await ev((z) => { const s = window.__HT.scene, e = window.__stuck; return { dead: e.dead, stillInside: s.zoneAt(e.x, e.y) === z, x: Math.round(e.x), y: Math.round(e.y) }; }, lounge);
    console.log("spawned inside the locked room (max seen):", maxInside, "| stuck coworker:", JSON.stringify(stuck), "| enemies:", await ev(() => window.__HT.scene.enemies.length));
    await shot("l01-locked");
  }

  // The finale: day 9's CEO (cutscene, three phases, a leap), the end of the run, endless, and a cutscene-free day-18 CEO.
  if (scenario === "ceo") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    const plan = await ev(() => { const h = window.__HT; return [3, 6, 9, 12, 15, 18, 21, 27].map((d) => `${d}:${h.dayConfig(d).bossType}`).join(" "); });
    console.log("boss plan", plan);
    await ev(() => { const h = window.__HT; h.god(true); h.day(9); });
    await sleep(700);
    await ev(() => window.__HT.toFight());
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(900);
    console.log("day 9", JSON.stringify(await ev(() => { const s = window.__HT.scene; return { quota: s.quota, final: s.dayCfg.final, boss: s.dayCfg.bossType }; })));
    await ev(() => window.__HT.boss());
    for (let k = 0; k < 200 && (await ev(() => window.__HT.scene.phase)) !== "cutscene"; k++) await sleep(250);
    console.log("phase after the CEO arrives:", await ev(() => window.__HT.scene.phase));
    await sleep(1600);
    await shot("ceo01-cutscene");
    for (let k = 0; k < 4; k++) { await page.keyboard.press("Space"); await sleep(250); await page.keyboard.press("Space"); await sleep(500); }
    await sleep(600);
    console.log("after the cutscene:", await ev(() => window.__HT.scene.phase));
    const boss = () => ev(() => { const s = window.__HT.scene, b = s.waves.boss; return b ? { phase: b.ceoPhase, hp: Math.round(b.hp), max: Math.round(b.maxHp), dead: b.dead, imm: b.immune, air: b.airborne } : null; });
    await ev(() => { const s = window.__HT.scene, b = s.waves.boss; const p = s.world.nearestWalkable(b.x, b.y + 260); s.player.x = p.x; s.player.y = p.y; });
    await sleep(1500);
    await shot("ceo02-phase1");
    // A big hit can't skip a phase: the damage stops at the 66% line.
    await ev(() => { const s = window.__HT.scene, b = s.waves.boss; s.hitEnemy(b, b.maxHp, { angle: 0, kind: "staple", x: b.x, y: b.y, knock: 0 }); });
    console.log("after a huge hit in phase 1:", JSON.stringify(await boss()));
    await sleep(2600);
    console.log("phase 2:", JSON.stringify(await boss()), "hr on the floor:", await ev(() => window.__HT.scene.enemies.filter((e) => e.type === "hr").length));
    await shot("ceo03-phase2");
    // Wait out the phase-change speech, then make him leap.
    for (let k = 0; k < 80 && (await boss()).imm; k++) await sleep(200);
    await ev(() => { const s = window.__HT.scene, b = s.waves.boss; const p = s.world.nearestWalkable(b.x, b.y + 200); s.player.x = p.x; s.player.y = p.y; b.leapCd = 0; });
    let air = false;
    for (let k = 0; k < 60 && !air; k++) { air = (await boss()).air; if (!air) await sleep(100); }
    console.log("leaping:", JSON.stringify(await boss()));
    await shot("ceo04-leap");
    await sleep(1500);
    await ev(() => { const s = window.__HT.scene, b = s.waves.boss; s.hitEnemy(b, b.maxHp, { angle: 0, kind: "staple", x: b.x, y: b.y, knock: 0 }); });
    await sleep(2800);
    console.log("phase 3:", JSON.stringify(await boss()), "burning tiles:", await ev(() => window.__HT.scene.hazards.burningCount));
    await shot("ceo05-phase3");
    await sleep(2500);
    await shot("ceo06-phase3-later");
    await ev(() => { const s = window.__HT.scene, b = s.waves.boss; for (let k = 0; k < 40 && !b.dead; k++) s.hitEnemy(b, b.maxHp * 0.1, { angle: 0, kind: "staple", x: b.x, y: b.y, knock: 0 }); });
    await sleep(800);
    await shot("ceo07-defeated");
    for (let k = 0; k < 40; k++) {
      if ((await ev(() => window.__HT.scene.phase)) !== "downsizing") break;
      await ev(() => window.__HT.killAll());
      await sleep(400);
    }
    // (Headless frames are slow: wait for things rather than for a fixed time.)
    await page.waitForFunction(() => document.querySelector("#results:not(.guard) .card"), { timeout: 60000 });
    await ev(() => document.querySelector("#results .card").click());
    await page.waitForFunction(() => document.querySelector("#runend:not(.guard) #reEndless"), { timeout: 60000 });
    console.log("after day 9's pick:", await ev(() => window.__HT.scene.phase));
    await sleep(900);
    await shot("ceo08-run-end");
    await ev(() => document.querySelector("#reEndless").click());
    await page.waitForFunction(() => document.querySelector("#memo:not(.guard) #mgo"), { timeout: 60000 });
    await sleep(1200);
    await shot("ceo09-memo-day10");
    await ev(() => document.querySelector("#mgo").click());
    await sleep(1500);
    console.log("endless:", JSON.stringify(await ev(() => ({ endless: window.__HT.state.endless, day: window.__HT.state.day, phase: window.__HT.scene.phase }))));
    // Endless CEO on day 18: no cutscene.
    await ev(() => { const h = window.__HT; h.day(18); });
    await sleep(700);
    await ev(() => window.__HT.toFight());
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(900);
    await ev(() => window.__HT.boss());
    let sawCut = false;
    for (let k = 0; k < 160 && !(await ev(() => !!window.__HT.scene.waves.boss)); k++) { if ((await ev(() => window.__HT.scene.phase)) === "cutscene") sawCut = true; await sleep(250); }
    for (let k = 0; k < 12; k++) { if ((await ev(() => window.__HT.scene.phase)) === "cutscene") sawCut = true; await sleep(250); }
    console.log("day 18:", JSON.stringify({ sawCutscene: sawCut, boss: await boss(), phase: await ev(() => window.__HT.scene.phase), bossHp: await ev(() => Math.round(window.__HT.scene.waves.boss?.maxHp ?? 0)) }));
    await shot("ceo10-day18");
  }

  // Open-Plan Office: the dodge is a short dash through walls. Never out of the building, never into the locked room or furniture.
  if (scenario === "phase") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    await ev(() => {
      const h = window.__HT, s = h.scene, v = s.vault;
      for (let k = 0; k < 60 && v.room.name !== "Marketing Lounge"; k++) v.setupDay(s.dayCfg.chores);
      h.give("phasedash", 1);
      h.god(true);
    });
    // Real dashes through the player code: stand somewhere, face a way, press Space.
    const T = 64;
    const cases = [
      { name: "drywall north into the Executive Suite", x: 5.5 * T, y: 13.3 * T, key: "KeyW" },
      { name: "concrete east into the Server Core", x: 23.6 * T, y: 24.5 * T, key: "KeyD" },
      { name: "the locked lounge door", x: 58.5 * T, y: 13.3 * T, key: "KeyW" },
      { name: "the locked lounge wall", x: 56.5 * T, y: 13.3 * T, key: "KeyW" },
      { name: "the outer wall", x: 7 * T, y: 1.35 * T, key: "KeyW" },
      { name: "past a break table (west wing)", x: 11 * T, y: 26.5 * T, key: "KeyD" },
      { name: "through a desk pod (west wing)", x: 3.0 * T, y: 20.5 * T, key: "KeyW" },
      // Starting inside a desk (can't happen in play, but the dash must still never throw you across the map).
      { name: "from inside a desk toward the locked lounge", x: 0, y: 0, key: "KeyW", inDesk: true }
    ];
    for (const c of cases) {
      const start = await ev((cc) => {
        const s = window.__HT.scene;
        const q = { x: cc.x, y: cc.y };
        if (cc.inDesk) {
          const d = s.props.list.find((p) => p.f.key.startsWith("ws_") && p.f.y < 20 * 64 && p.f.x > 44 * 64);
          q.x = d.f.x; q.y = d.f.y;
        } else s.world.resolveCircle(q, s.player.r);
        s.player.x = q.x; s.player.y = q.y; s.player.vx = s.player.vy = 0;
        return q;
      }, c);
      c.x = start.x; c.y = start.y;
      await sleep(250);
      // Aim the dash with the key, then let go: what's measured is where the dash alone put you.
      await page.keyboard.down(c.key);
      await sleep(30);
      await page.keyboard.press("Space");
      await sleep(40);
      await page.keyboard.up(c.key);
      if (c.name.startsWith("drywall")) await shot("ph01-mid-dash");
      await sleep(350);
      const r = await ev((cc) => {
        const s = window.__HT.scene, p = s.player, w = s.world;
        const z = s.zoneAt(p.x, p.y);
        return { name: cc.name, from: [Math.round(cc.x), Math.round(cc.y)], to: [Math.round(p.x), Math.round(p.y)], moved: Math.round(Math.hypot(p.x - cc.x, p.y - cc.y)), zone: z >= 0 ? s.map.zones[z].name : "(wall!)", free: w.circleFree(p.x, p.y, p.r - 1), locked: s.inLockedRoom(p.x, p.y) };
      }, c);
      console.log("dash", JSON.stringify(r));
    }
    await shot("ph02-after");
    // Fuzz: thousands of dashes from random open spots in random directions.
    const fuzz = await ev(() => {
      const s = window.__HT.scene, w = s.world, r = s.player.r;
      let n = 0, bad = [], walls = 0, maxD = 0;
      for (let k = 0; k < 4000; k++) {
        const x = 64 + Math.random() * (64 * 62), y = 64 + Math.random() * (64 * 44);
        if (!w.circleFree(x, y, r) || s.inLockedRoom(x, y)) continue;
        const a = Math.random() * Math.PI * 2;
        const e = s.phasePath(x, y, Math.cos(a), Math.sin(a), r, 115, 80);
        n++;
        const d = Math.hypot(e.x - x, e.y - y);
        maxD = Math.max(maxD, d);
        const tx = Math.floor(e.x / 64), ty = Math.floor(e.y / 64);
        const ok = w.circleFree(e.x, e.y, r) && !s.inLockedRoom(e.x, e.y) && tx >= 1 && ty >= 1 && tx <= 62 && ty <= 44 && d <= 195.5;
        // Crossed a wall? (sampled straight line from start to end touches a non-floor tile)
        for (let t = 0; t <= 1; t += 0.05) if (!w.isFloorAt(x + (e.x - x) * t, y + (e.y - y) * t)) { walls++; break; }
        if (!ok && bad.length < 5) bad.push({ x: Math.round(x), y: Math.round(y), a: +a.toFixed(2), ex: Math.round(e.x), ey: Math.round(e.y) });
      }
      return { dashes: n, throughWalls: walls, maxDist: Math.round(maxD), bad };
    });
    console.log("phase fuzz", JSON.stringify(fuzz));
  }

  // AI robots in a puddle: they short out, then blow up (hurting coworkers around them, never you).
  if (scenario === "robots") {
    await ev(() => { window.__HT.toFight(); });
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(800);
    const before = await ev(() => {
      const s = window.__HT.scene;
      for (const e of [...s.enemies]) s.removeEnemy(e);
      s.quota = 999;
      const p = s.world.nearestWalkable(10 * 64, 19 * 64);
      s.player.x = p.x; s.player.y = p.y + 140;
      const r = s.spawnEnemy("robot", p.x, p.y, "hostile");
      r.spawnGrace = 99;
      const n = s.spawnEnemy("intern", p.x + 50, p.y, "hostile");
      n.spawnGrace = 99;
      window.__bot = r; window.__mate = n;
      s.hazards.flood(p.x, p.y, 6, 0.01);
      return { hp: window.__HT.state.hp, mate: Math.round(n.hp) };
    });
    await sleep(500);
    await shot("r01-shorting");
    const mid = await ev(() => ({ shortT: +window.__bot.shortT.toFixed(2), dead: window.__bot.dead }));
    await sleep(1400);
    await shot("r02-boom");
    const after = await ev(() => ({ botDead: window.__bot.dead, mateHp: Math.round(window.__mate.hp), mateDead: window.__mate.dead, hp: window.__HT.state.hp, fired: window.__HT.scene.fired }));
    console.log("robot in water:", JSON.stringify({ before, mid, after }));
  }

  // The golden briefcase in each lockable room: on a clear spot, never under the furniture.
  if (scenario === "briefcase") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    for (const name of ["Marketing Lounge", "Supply Closet", "Restrooms"]) {
      const info = await ev((n) => {
        const s = window.__HT.scene, v = s.vault;
        for (let k = 0; k < 80 && v.room.name !== n; k++) v.setupDay(s.dayCfg.chores);
        v.unlock();
        const b = v.brief;
        const p = s.world.nearestWalkable(b.x, b.y + 150);
        s.player.x = p.x; s.player.y = p.y;
        const bb = b.getBounds();
        const over = [...s.furniture.values()].filter((f) => f.sprite.visible && f.sprite.depth > -7000 && Phaser.Geom.Rectangle.Overlaps(f.sprite.getBounds(), bb)).map((f) => f.key);
        return { room: v.room.name, x: Math.round(b.x), y: Math.round(b.y), overlapping: over };
      }, name);
      console.log("briefcase", JSON.stringify(info));
      await sleep(500);
      await shot(`bc-${name.split(" ")[0].toLowerCase()}`);
    }
  }

  // The end-of-day memo for a couple of days (one line each).
  if (scenario === "memo") {
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    for (const day of [1, 2, 5]) {
      await ev((d) => { const h = window.__HT; h.state.day = d; h.scene.dayCfg = h.dayConfig(d); h.scene.endOfDayMemo(); }, day);
      await sleep(1800);
      await shot(`memo-${day}`);
      await ev(() => window.__HT.scene.ui.closeScreen("memo"));
    }
  }

  if (scenario === "stress") {
    await ev(() => {
      const h = window.__HT;
      h.give("multishot", 2); h.give("ricochet", 2); h.give("chain", 1); h.give("ignite", 1); h.give("orbit", 2); h.give("drone", 2);
      for (const id of ["corner", "wetfloor", "sticky", "ninja", "deskjockey", "handshake", "blame", "romance", "binder", "command", "hostile", "livewire", "firedrill", "plusone"]) h.give(id, 1);
      for (const w of Object.keys(h.state.unlocked)) h.state.unlocked[w] = true;
      h.god(true);
      h.day(6);
      // PT_NOVISION=1: measure without the line-of-sight shadows.
      if (window.__PT_NOVISION) h.scene.vision.update = () => {};
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
    const stationOf = await ev(() => { const s = window.__HT.scene; return Object.fromEntries(s.dayCfg.chores.map((c) => [c, s.stations.hostOf(c)?.def.id])); });
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
    for (const c of ["plant", "print", "shred", "coffee", "presentation", "memos", "server", "emails", "jam", "wifi", "mail", "board"]) {
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
      } else if (c === "jam") {
        for (const k of ["KeyA", "KeyD", "KeyA", "KeyD", "KeyA", "KeyD", "KeyD"]) { await page.keyboard.press(k); await sleep(90); }
      } else if (c === "wifi") {
        await sleep(1700);
      } else if (c === "mail") {
        for (const k of ["Digit1", "Digit2", "Digit3"]) { await page.keyboard.press(k); await sleep(420); }
      } else if (c === "board") {
        const r = await rect(".mini-stage");
        if (r) {
          await page.mouse.move(r.x + r.w * 0.15, r.y + r.h * 0.6);
          await page.mouse.down();
          for (let i = 0; i < 5; i++) {
            await page.mouse.move(r.x + r.w * 0.85, r.y + r.h * (0.45 + i * 0.1), { steps: 6 });
            await page.mouse.move(r.x + r.w * 0.15, r.y + r.h * (0.5 + i * 0.1), { steps: 6 });
          }
          await page.mouse.up();
        }
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

  // The Konami code on the Performance Review opens the cheat sheet; what it hands out sticks for the run.
  if (scenario === "cheats") {
    const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
    const typeKeys = async (keys) => { for (const k of keys) { await page.keyboard.press(k); await sleep(35); } };
    const isOpen = () => ev(() => !!document.querySelector("#cheats"));
    const click = async (sel) => { await page.click(sel); await sleep(140); };
    const visible = () => ev(() => [...document.querySelectorAll(".ch-perk:not(.hidden)")].map((r) => r.dataset.id));
    const snap = () => ev(() => {
      const h = window.__HT;
      return { stacks: { ...h.state.stacks }, hp: h.state.hp, maxHp: h.state.stats.maxHp, revives: h.state.revivesLeft, bank: h.state.bank, owned: Object.keys(h.state.unlocked).filter((w) => h.state.unlocked[w]), god: h.scene.godMode, muted: h.scene.audio.muted };
    });
    // Window key listeners via the DevTools protocol: opening and closing the sheet must leave the count unchanged.
    const cdp = await page.createCDPSession();
    const keyListeners = async () => {
      const { result } = await cdp.send("Runtime.evaluate", { expression: "window" });
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
      await cdp.send("Runtime.releaseObject", { objectId: result.objectId });
      return listeners.filter((l) => l.type === "keydown" || l.type === "keyup").length;
    };
    await sleep(700);
    await page.keyboard.press("Space");
    await sleep(1200);
    await typeKeys(KONAMI);
    await sleep(200);
    console.log("konami during crunch -> open:", await isOpen());
    await ev(() => { const h = window.__HT; h.state.bank = 80; h.scene.endCrunch(true); });
    await sleep(900);
    await page.keyboard.press("Space");
    await sleep(1600);
    console.log("review up:", await ev(() => !!document.querySelector("#review")), "phase:", await ev(() => window.__HT.phase()));
    const baseListeners = await keyListeners();
    // A wrong key starts over; a held key's auto-repeat is not a second press.
    await typeKeys(["ArrowUp", "ArrowUp", "ArrowDown", "KeyX", ...KONAMI.slice(3)]);
    console.log("wrong key -> open:", await isOpen());
    await page.keyboard.down("ArrowUp"); await page.keyboard.down("ArrowUp"); await page.keyboard.up("ArrowUp");
    await typeKeys(KONAMI.slice(2));
    console.log("auto-repeat -> open:", await isOpen());
    // A stray Up mid-code restarts it, and Up Up Up still counts.
    await typeKeys(["ArrowUp", "ArrowUp", "ArrowDown", "ArrowUp", "ArrowUp", "ArrowUp", ...KONAMI.slice(2)]);
    console.log("konami -> open:", await isOpen(), "| search focused:", await ev(() => !!document.activeElement?.matches(".ch-search input")), "| review inert:", await ev(() => document.querySelector("#review").inert), "| key listeners", baseListeners, "->", await keyListeners());
    await sleep(700);
    await shot("k01-cheats");
    console.log("before", JSON.stringify(await snap()));
    await click('.ch-perk[data-id="hp"] .inc');
    await click('.ch-perk[data-id="dmg"] .inc');
    await click('.ch-perk[data-id="dmg"] .inc');
    await click('.ch-perk[data-id="dmg"] .dec');
    await click('.ch-perk[data-id="parachute"] .inc');
    await click('.ch-perk[data-id="parachute"] .inc');
    await click('.ch-perk[data-id="flex"] .inc');
    // Minus takes the heart (clamped to the new max) and the parachute's revive back off; plus puts them back.
    await click('.ch-perk[data-id="hp"] .dec');
    await click('.ch-perk[data-id="parachute"] .dec');
    console.log("minus hp + parachute", JSON.stringify(await snap()));
    await click('.ch-perk[data-id="hp"] .inc');
    await click('.ch-perk[data-id="parachute"] .inc');
    // The coffee, the laser and one of today's gun offers (which must then be off the table in the review).
    const offered = await ev(() => window.__HT.scene.reviewGuns.map((g) => g.id));
    for (const w of new Set(["laser", "coffee", offered[0]])) await click(`.ch-gun[data-w="${w}"]`);
    await click(".ch-god");
    console.log("after clicks", JSON.stringify(await snap()));
    console.log("sheet shows", JSON.stringify(await ev(() => ({
      dmg: document.querySelector('.ch-perk[data-id="dmg"] .ch-n').textContent,
      parachute: document.querySelector('.ch-perk[data-id="parachute"] .ch-n').textContent,
      parachutePlusDisabled: document.querySelector('.ch-perk[data-id="parachute"] .inc').disabled,
      glassMinusDisabled: document.querySelector('.ch-perk[data-id="glass"] .dec').disabled,
      laserPerkTag: document.querySelector('.ch-perk[data-id="laser"] .need').className,
      irishTag: document.querySelector('.ch-perk[data-id="irish"] .need').className,
      god: document.querySelector(".ch-god").getAttribute("aria-checked"),
      hearts: document.querySelector(".ch-hp").textContent
    }))));
    // Max out the review's first upgrade offer here: buying it in the review afterwards must not take money.
    const maxedOffer = await ev(() => window.__HT.scene.reviewOffers[0].perk.id);
    const incOpen = () => ev((id) => !document.querySelector(`.ch-perk[data-id="${id}"] .inc`).disabled, maxedOffer);
    for (let i = 0; i < 6 && (await incOpen()); i++) await click(`.ch-perk[data-id="${maxedOffer}"] .inc`);
    console.log("maxed", maxedOffer, "->", await ev((id) => document.querySelector(`.ch-perk[data-id="${id}"] .ch-n`).textContent, maxedOffer));
    // Typing in the search box (M mutes the game, P pauses it) must never reach the game.
    await page.click(".ch-search input");
    await page.keyboard.type("mic", { delay: 60 });
    await sleep(300);
    console.log("search 'mic' ->", JSON.stringify(await visible()), await ev(() => document.querySelector(".ch-count").textContent));
    console.log("typed m: muted", (await snap()).muted, "| Phaser keys held:", await ev(() => window.__HT.scene.input.keyboard.keys.filter((k) => k && k.isDown).map((k) => k.keyCode)));
    await shot("k02-cheats-search");
    await page.click(".ch-search input", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.keyboard.type("pa");
    await sleep(200);
    console.log("search 'pa' ->", (await visible()).length, "rows");
    await page.click(".ch-search input", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await click('.ch-chip[data-f="owned"]');
    console.log("OWNED chip ->", JSON.stringify(await visible()));
    await click('.ch-chip[data-f="chore"]');
    console.log("CHORE chip ->", (await visible()).length, "rows", await ev(() => document.querySelector(".ch-count").textContent));
    await shot("k03-cheats-chore");
    await click('.ch-chip[data-f="all"]');
    // Smaller windows: the sheet re-flows (one scrolling page below 860 px) and still fits.
    for (const [w, hgt] of [[1024, 768], [820, 560]]) {
      await page.setViewport({ width: w, height: hgt });
      await sleep(600);
      console.log(`${w}x${hgt}`, JSON.stringify(await ev(() => {
        const p = document.querySelector(".ch-panel").getBoundingClientRect(), list = document.querySelector(".ch-list");
        return { panel: [Math.round(p.width), Math.round(p.height)], fits: p.left >= 0 && p.right <= innerWidth && p.bottom <= innerHeight, perkColumns: getComputedStyle(list).gridTemplateColumns.split(" ").length };
      })));
      await shot(`k03-cheats-${w}`);
    }
    await page.setViewport({ width: 1280, height: 720 });
    await sleep(600);
    await page.keyboard.press("Escape");
    await sleep(400);
    console.log("Esc -> open:", await isOpen(), "| review inert:", await ev(() => document.querySelector("#review")?.inert), "| key listeners:", await keyListeners(), "| Phaser keys held:", await ev(() => window.__HT.scene.input.keyboard.keys.filter((k) => k && k.isDown).length));
    console.log("review cards", JSON.stringify(await ev(() => { const s = window.__HT.scene; return [...document.querySelectorAll("#review .card")].map((c) => ({ id: s.reviewOffers[Number(c.dataset.i)].perk.id, cls: c.className.replace("card ", ""), own: c.querySelector(".c-own")?.textContent })); })));
    console.log("review guns", JSON.stringify(await ev(() => { const h = window.__HT; return [...document.querySelectorAll("#review .gun")].map((g) => { const id = h.scene.reviewGuns[Number(g.dataset.g)].id; return { id, owned: h.state.unlocked[id], cls: g.className }; }); })));
    console.log("click the maxed offer", JSON.stringify(await ev((id) => {
      const h = window.__HT, s = h.scene, i = s.reviewOffers.findIndex((o) => o.perk.id === id), before = h.state.bank;
      document.querySelector(`#review .card[data-i="${i}"]`)?.click();
      return { id, bank: [before, h.state.bank], sold: s.reviewOffers[i].sold };
    }, maxedOffer)));
    await shot("k04-review-after");
    // Reopen: clicks inside the guard are ignored (done in the same tick so a slow machine can't miss the window),
    // a drag out of (or into) the panel is not a backdrop click, a real one closes.
    console.log("clicks inside the guard", JSON.stringify(await ev(() => {
      const h = window.__HT;
      h.cheats();
      const r = document.querySelector("#cheats"), before = h.state.stack("speed");
      r.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      r.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      r.click();
      r.querySelector('.ch-perk[data-id="speed"] .inc').click();
      return { open: !!document.querySelector("#cheats"), speed: [before, h.state.stack("speed")] };
    })));
    await sleep(450);
    for (const [from, to] of [[[700, 400], [1268, 12]], [[1268, 12], [700, 400]]]) {
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.mouse.move(...to, { steps: 4 });
      await page.mouse.up();
      await sleep(100);
    }
    console.log("drag out of / into the panel -> open:", await isOpen(), "| stacks unchanged:", JSON.stringify(await ev(() => window.__HT.state.stacks)));
    await page.mouse.click(1268, 12);
    await sleep(200);
    console.log("backdrop click -> open:", await isOpen());
    await typeKeys(KONAMI);
    await sleep(500);
    console.log("konami again -> open:", await isOpen());
    await page.click('#cheats [data-act="close"]');
    await sleep(300);
    console.log("CLOSE button -> open:", await isOpen());
    for (let i = 0; i < 6; i++) { await ev(() => window.__HT.cheats()); await sleep(50); await page.keyboard.press("Escape"); await sleep(50); }
    console.log("6x open/close -> open:", await isOpen(), "| sheets in DOM:", await ev(() => document.querySelectorAll("#cheats").length), "| key listeners", baseListeners, "->", await keyListeners());
    // Buying in the review still works afterwards.
    await sleep(300);
    console.log("buy after cheats", JSON.stringify(await ev(() => {
      const h = window.__HT, s = h.scene;
      const i = s.reviewOffers.findIndex((o) => !o.sold && h.state.canTake(o.perk) && h.state.bank >= o.perk.cost);
      const before = h.state.bank;
      document.querySelector(`#review .card[data-i="${i}"]`)?.click();
      return { id: i >= 0 ? s.reviewOffers[i].perk.id : null, bank: [before, h.state.bank], sold: i >= 0 ? s.reviewOffers[i].sold : null };
    })));
    await sleep(300);
    // Click both gun offers: the one already owned is locked, the other one sells.
    console.log("buy a gun after cheats", JSON.stringify(await ev(() => {
      const h = window.__HT, s = h.scene;
      const before = h.state.bank;
      document.querySelectorAll("#review .gun").forEach((g) => g.click());
      return { guns: s.reviewGuns.map((g) => `${g.id}${g.sold ? " SOLD" : ""}`), bank: [before, h.state.bank] };
    })));
    await sleep(700);
    await shot("k05-review-bought");
    await page.click("#go");
    await sleep(1200);
    console.log("BACK TO WORK -> phase:", await ev(() => window.__HT.phase()));
    await ev(() => window.__HT.toFight());
    await sleep(300);
    await ev(() => window.__HT.toFight());
    await sleep(1500);
    console.log("in the fight", JSON.stringify(await ev(() => {
      const h = window.__HT, s = h.scene;
      const hp = h.state.hp;
      s.player.invuln = 0;
      const died = s.player.damage(4, s.player.x + 20, s.player.y);
      return { phase: s.phase, hit: [hp, h.state.hp], died, slots: [...document.querySelectorAll(".hb-slot")].map((e) => e.dataset.w), dmgMult: h.state.stats.dmgMult };
    })));
    await typeKeys(KONAMI);
    await sleep(200);
    await ev(() => window.__HT.cheats());
    console.log("konami / __HT.cheats() in the fight -> open:", await isOpen());
    console.log("persisted", JSON.stringify(await snap()));
    await shot("k06-fight");
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
