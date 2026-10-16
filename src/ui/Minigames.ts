import { clamp, pick, rand, shuffle } from "../util/math";

/**
 * Tiny Among-Us-style task mini-games. Every chore opens one of these instead of a plain "hold E" bar.
 * Each kind is a few seconds of simple, forgiving play; `len` stretches how long it lasts.
 */
export type MiniKind = "timing" | "mash" | "whack" | "type" | "sequence" | "numbers" | "track";
export const MINI_KINDS: MiniKind[] = ["timing", "mash", "whack", "type", "sequence", "numbers", "track"];

export type MiniSfx = "good" | "bad" | "tick" | "win";

export interface Flavor { noun: string; icon: string; words: string[] }

/** Chore-specific dressing so the same mini-game feels different on every chore. */
export const FLAVOR: Record<string, Flavor> = {
  emails: { noun: "email", icon: "✉️", words: ["per my last email", "reply all", "circling back", "touch base", "synergy", "action items", "looping in legal", "see attached"] },
  print: { noun: "page", icon: "📄", words: ["paper jam", "low toner", "double sided", "print preview", "collate", "landscape", "staple top left", "budget final v7"] },
  shred: { noun: "document", icon: "🗂️", words: ["nothing to see", "confidential", "destroy evidence", "no paper trail", "burn after", "off the books", "plausible deniability", "shred it"] },
  coffee: { noun: "bean", icon: "☕", words: ["double espresso", "extra hot", "oat milk", "descale", "dark roast", "need caffeine", "refill the pot", "fresh brew"] },
  presentation: { noun: "slide", icon: "📊", words: ["next slide", "q4 growth", "pivot to ai", "on brand", "market share", "blue sky thinking", "deck v12 final", "key takeaways"] },
  memos: { noun: "memo", icon: "📝", words: ["restructuring", "right sizing", "sign here", "effective friday", "we are family", "difficult decision", "headcount", "with regret"] },
  server: { noun: "server", icon: "🖥️", words: ["turn it off", "sudo reboot", "ping ping", "clear cache", "kernel panic", "have you tried", "uptime", "restart service"] },
  plant: { noun: "leaf", icon: "🌿", words: ["so thirsty", "grow little guy", "fresh water", "photosynthesis", "green thumb", "do not overwater", "sunlight please", "leafy boss"] }
};

export interface MiniOpts {
  kind: MiniKind;
  chore: string;
  title: string;
  /** Length multiplier: 1 = baseline, bigger = more rounds / more to do. */
  len: number;
  sfx: (n: MiniSfx) => void;
  onDone: () => void;
  onCancel: () => void;
}

export interface MiniHandle { close(): void; /** Debug/test hook: finish the task immediately. */ win(): void }

interface Api {
  stage: HTMLElement;
  progress(f: number): void;
  hint(t: string): void;
  win(): void;
  sfx(n: MiniSfx): void;
  shake(): void;
}

interface Game {
  update?(dt: number): void;
  key?(e: KeyboardEvent): void;
  destroy?(): void;
}

function el(tag: string, cls: string, parent?: HTMLElement, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

const INSTRUCTIONS: Record<MiniKind, string> = {
  timing: "Stop the needle in the green zone. Space or click.",
  mash: "Mash SPACE (or click) to fill the bar before it drains!",
  whack: "Click the {noun}s. Don't touch the red ones!",
  type: "Type the phrase exactly.",
  sequence: "Watch the pattern, then repeat it. Arrow keys or click.",
  numbers: "Click the numbers in order.",
  track: "Keep your cursor on the {noun}."
};

// ------------------------------------------------------------------ the games

function timing(api: Api, o: MiniOpts): Game {
  const rounds = Math.max(2, Math.round(3 * o.len));
  let hits = 0, pos = 0, dir = 1, zoneW = 0.24, zoneX = 0.5;
  const bar = el("div", "m-bar", api.stage);
  const zone = el("div", "m-zone", bar);
  const needle = el("div", "m-needle", bar);
  const pips = el("div", "m-pips", api.stage);
  const pipEls = Array.from({ length: rounds }, () => el("span", "", pips));
  const roll = () => {
    zoneW = Math.max(0.1, 0.24 - hits * 0.02);
    zoneX = rand(0.08, 0.92 - zoneW);
    zone.style.left = `${zoneX * 100}%`;
    zone.style.width = `${zoneW * 100}%`;
  };
  roll();
  const stop = () => {
    if (pos >= zoneX && pos <= zoneX + zoneW) {
      pipEls[hits].classList.add("on");
      hits++;
      api.sfx("good");
      api.progress(hits / rounds);
      if (hits >= rounds) api.win();
      else roll();
    } else {
      api.sfx("bad");
      api.shake();
    }
  };
  bar.addEventListener("pointerdown", stop);
  api.hint("");
  return {
    update(dt) {
      pos += dir * dt * (0.8 + hits * 0.14);
      if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
      needle.style.left = `${pos * 100}%`;
    },
    key(e) { if (e.code === "Space" || e.code === "Enter") stop(); }
  };
}

function mash(api: Api, o: MiniOpts): Game {
  const need = Math.round(22 * o.len);
  let v = 0;
  const btn = el("button", "m-mash", api.stage, "SPACE");
  const meter = el("div", "m-meter", api.stage);
  const fill = el("div", "", meter);
  const press = () => {
    v += 1;
    btn.classList.add("hit");
    setTimeout(() => btn.classList.remove("hit"), 60);
    api.sfx("tick");
    if (v >= need) api.win();
  };
  btn.addEventListener("pointerdown", press);
  return {
    update(dt) {
      v = Math.max(0, v - dt * (2.4 + o.len));
      fill.style.width = `${clamp(v / need, 0, 1) * 100}%`;
      api.progress(v / need);
    },
    key(e) { if (e.code === "Space" && !e.repeat) press(); }
  };
}

function whack(api: Api, o: MiniOpts): Game {
  const need = Math.round(6 * o.len);
  const fl = FLAVOR[o.chore];
  let hits = 0, spawn = 0.2;
  const live: { b: HTMLElement; life: number }[] = [];
  const spawnOne = () => {
    const bad = Math.random() < 0.22;
    const b = el("button", bad ? "m-target bad" : "m-target", api.stage, bad ? "⛔" : fl.icon);
    b.style.left = `${rand(6, 86)}%`;
    b.style.top = `${rand(8, 74)}%`;
    const t = { b, life: bad ? 2.2 : 1.8 };
    live.push(t);
    b.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      if (!b.isConnected) return;
      if (bad) {
        hits = Math.max(0, hits - 1);
        api.sfx("bad");
        api.shake();
      } else {
        hits++;
        api.sfx("good");
      }
      api.progress(hits / need);
      b.remove();
      live.splice(live.indexOf(t), 1);
      if (hits >= need) api.win();
    });
  };
  return {
    update(dt) {
      spawn -= dt;
      if (spawn <= 0 && live.length < 3) {
        spawn = rand(0.35, 0.7);
        spawnOne();
      }
      for (let i = live.length - 1; i >= 0; i--) {
        live[i].life -= dt;
        if (live[i].life <= 0.4) live[i].b.classList.add("fading");
        if (live[i].life <= 0) { live[i].b.remove(); live.splice(i, 1); }
      }
    }
  };
}

function typing(api: Api, o: MiniOpts): Game {
  const count = Math.max(1, Math.round(2 * o.len));
  const words = shuffle([...FLAVOR[o.chore].words]).slice(0, Math.min(count, FLAVOR[o.chore].words.length));
  while (words.length < count) words.push(pick(FLAVOR[o.chore].words));
  let wi = 0, ci = 0;
  const label = el("div", "m-typelabel", api.stage);
  const box = el("div", "m-type", api.stage);
  const render = () => {
    const w = words[wi];
    box.innerHTML = `<span class="ok">${w.slice(0, ci)}</span><span class="cur">${w[ci] === " " ? "␣" : w[ci]}</span><span class="rest">${w.slice(ci + 1)}</span>`;
    label.textContent = `Phrase ${wi + 1} of ${words.length}`;
  };
  render();
  return {
    key(e) {
      if (e.key.length !== 1) return;
      const want = words[wi][ci];
      if (e.key.toLowerCase() === want) {
        ci++;
        api.sfx("tick");
        if (ci >= words[wi].length) {
          wi++; ci = 0;
          api.sfx("good");
          if (wi >= words.length) { api.progress(1); api.win(); return; }
        }
        api.progress((wi + ci / words[wi].length) / words.length);
        render();
      } else {
        api.sfx("bad");
        api.shake();
      }
    }
  };
}

function sequence(api: Api, o: MiniOpts): Game {
  const rounds = Math.max(2, Math.round(2 * o.len));
  const PADS = [
    { code: ["ArrowUp", "KeyW"], glyph: "▲", col: "#4fd1ff" },
    { code: ["ArrowRight", "KeyD"], glyph: "▶", col: "#ffcf3f" },
    { code: ["ArrowDown", "KeyS"], glyph: "▼", col: "#ff6b8a" },
    { code: ["ArrowLeft", "KeyA"], glyph: "◀", col: "#52d17c" }
  ];
  const grid = el("div", "m-pads", api.stage);
  const padEls = PADS.map((p, i) => {
    const b = el("button", "m-pad", grid, p.glyph);
    b.style.setProperty("--c", p.col);
    b.addEventListener("pointerdown", () => press(i));
    return b;
  });
  let round = 0, seq: number[] = [], showIdx = 0, t = 0.5, mode: "show" | "input" = "show", inIdx = 0;
  const build = () => {
    seq = Array.from({ length: 3 + round }, () => Math.floor(Math.random() * 4));
    replay();
  };
  const replay = () => {
    mode = "show"; showIdx = 0; t = 0.7; inIdx = 0;
    api.hint("Watch…");
  };
  const flash = (i: number, ms = 220) => {
    padEls[i].classList.add("lit");
    setTimeout(() => padEls[i].classList.remove("lit"), ms);
  };
  function press(i: number) {
    if (mode !== "input") return;
    flash(i, 160);
    if (seq[inIdx] === i) {
      inIdx++;
      api.sfx("tick");
      api.progress((round + inIdx / seq.length) / rounds);
      if (inIdx >= seq.length) {
        round++;
        if (round >= rounds) { api.win(); return; }
        api.sfx("good");
        mode = "show"; t = 0.8; showIdx = 0;
        api.hint("Nice. Longer one…");
        seq = Array.from({ length: 3 + round }, () => Math.floor(Math.random() * 4));
        inIdx = 0;
      }
    } else {
      api.sfx("bad");
      api.shake();
      mode = "show"; t = 1; showIdx = 0; inIdx = 0;
      api.hint("Oops, once more…");
    }
  }
  build();
  return {
    update(dt) {
      if (mode !== "show") return;
      t -= dt;
      if (t > 0) return;
      if (showIdx >= seq.length) { mode = "input"; api.hint("Your turn!"); return; }
      flash(seq[showIdx], 380);
      api.sfx("tick");
      showIdx++;
      t = 0.62;
    },
    key(e) {
      const i = PADS.findIndex((p) => p.code.includes(e.code));
      if (i >= 0) press(i);
    }
  };
}

function numbers(api: Api, o: MiniOpts): Game {
  const n = clamp(6 + Math.round(3 * o.len), 6, 16);
  const down = Math.random() < 0.3;
  let next = down ? n : 1, done = 0;
  const grid = el("div", n <= 9 ? "m-grid c3" : "m-grid c4", api.stage);
  api.hint(down ? "Biggest first! Count DOWN." : "Smallest first! Count up.");
  const vals = shuffle(Array.from({ length: n }, (_, i) => i + 1));
  for (const v of vals) {
    const b = el("button", "m-num", grid, String(v));
    b.addEventListener("pointerdown", () => {
      if (b.classList.contains("done")) return;
      if (v === next) {
        b.classList.add("done");
        done++;
        next += down ? -1 : 1;
        api.sfx("tick");
        api.progress(done / n);
        if (done >= n) api.win();
      } else {
        api.sfx("bad");
        api.shake();
      }
    });
  }
  return {};
}

function track(api: Api, o: MiniOpts): Game {
  const need = 3.2 * o.len;
  const fl = FLAVOR[o.chore];
  const W = 520, H = 250, R = 36;
  let x = rand(100, W - 100), y = rand(80, H - 80), a = rand(0, Math.PI * 2), turn = 0, v = 0;
  let mx = -999, my = -999;
  const orb = el("div", "m-orb", api.stage, fl.icon);
  api.stage.addEventListener("pointermove", (e) => {
    const r = api.stage.getBoundingClientRect();
    mx = (e.clientX - r.left) * (W / r.width);
    my = (e.clientY - r.top) * (H / r.height);
  });
  return {
    update(dt) {
      turn -= dt;
      if (turn <= 0) { turn = rand(0.6, 1.4); a += rand(-1.3, 1.3); }
      const sp = 95 + 25 * Math.min(3, o.len);
      x += Math.cos(a) * sp * dt;
      y += Math.sin(a) * sp * dt;
      if (x < R) { x = R; a = Math.PI - a; } else if (x > W - R) { x = W - R; a = Math.PI - a; }
      if (y < R) { y = R; a = -a; } else if (y > H - R) { y = H - R; a = -a; }
      orb.style.left = `${(x / W) * 100}%`;
      orb.style.top = `${(y / H) * 100}%`;
      const inside = Math.hypot(mx - x, my - y) < R;
      orb.classList.toggle("on", inside);
      v = clamp(v + (inside ? dt : -dt * 0.7), 0, need);
      api.progress(v / need);
      if (v >= need) api.win();
    }
  };
}

const FACTORY: Record<MiniKind, (api: Api, o: MiniOpts) => Game> = {
  timing, mash, whack, type: typing, sequence, numbers, track
};

// ------------------------------------------------------------------ host

export function openMini(host: HTMLElement, o: MiniOpts): MiniHandle {
  const fl = FLAVOR[o.chore];
  const root = el("div", "mini", host);
  const panel = el("div", "mini-panel", root);
  const head = el("div", "mini-head", panel);
  el("h2", "", head, `${fl.icon} ${o.title}`);
  const x = el("button", "mini-x", head, "✕");
  el("p", "mini-instr", panel, INSTRUCTIONS[o.kind].replace("{noun}", fl.noun));
  const prog = el("div", "mini-prog", panel);
  const progFill = el("div", "", prog);
  const stage = el("div", `mini-stage k-${o.kind}`, panel);
  const hintEl = el("div", "mini-hint", panel, "");
  el("div", "mini-esc", panel, "Esc to walk away");

  let closed = false, won = false, raf = 0, last = performance.now();
  const api: Api = {
    stage,
    progress: (f) => { progFill.style.width = `${clamp(f, 0, 1) * 100}%`; },
    hint: (t) => { hintEl.textContent = t; },
    sfx: (n) => { if (!closed) o.sfx(n); },
    shake: () => {
      panel.classList.remove("shake");
      void panel.offsetWidth;
      panel.classList.add("shake");
    },
    win: () => {
      if (won || closed) return;
      won = true;
      progFill.style.width = "100%";
      panel.classList.add("won");
      hintEl.textContent = "DONE!";
      o.sfx("win");
      setTimeout(() => { if (!closed) { close(); o.onDone(); } }, 520);
    }
  };
  const game = FACTORY[o.kind](api, o);

  const onKey = (e: KeyboardEvent) => {
    // Keep keystrokes away from the game underneath (WASD, E, Space...).
    e.stopPropagation();
    if (e.code === "Escape") { e.preventDefault(); if (e.type === "keydown") { close(); o.onCancel(); } return; }
    if (e.type !== "keydown" || won) return;
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    game.key?.(e);
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("keyup", onKey, true);
  x.addEventListener("click", () => { close(); o.onCancel(); });
  root.addEventListener("contextmenu", (e) => e.preventDefault());

  const loop = (now: number) => {
    if (closed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!won) game.update?.(dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("keyup", onKey, true);
    game.destroy?.();
    root.remove();
  }
  return { close, win: () => api.win() };
}
