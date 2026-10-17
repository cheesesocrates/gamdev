import gsap from "gsap";
import "./theme.css";
import "./minigames.css";
import { clamp, pick, rand, shuffle } from "../util/math";

/**
 * Chore mini-games. Every chore is its own little scene that looks like the job:
 * water a plant that won't sit still, line a page up on the copier, feed the shredder,
 * tighten the coffee machine's leaks, stop the deck on the GROWTH slide, sign memos,
 * patch server cables, and type a reply-all. `len` stretches how long each one lasts.
 */
export type MiniSfx = "good" | "bad" | "tick" | "win" | "note" | `dtmf_${number}`;

export interface MiniOpts {
  chore: string;
  title: string;
  /** Length multiplier: 1 = baseline, bigger = more to do. */
  len: number;
  sfx: (n: MiniSfx) => void;
  onDone: () => void;
  onCancel: () => void;
  /** Shown (e.g. "-1s") whenever a mistake costs time. */
  penalty?: string;
  /** A scribbled clue for the locked door, stuck to the corner of this chore. */
  note?: string;
  /** Keypad only: the code, and the digits already found. */
  code?: number[];
  known?: (number | null)[];
}

export interface MiniHandle {
  close(): void;
  /** Finishes the task immediately (debug / playtests). */
  win(): void;
}

/** Every stage is laid out in these logical units and scaled to fit the panel. */
const W = 560, H = 300;
const INK = "#1c1d21";

interface Api {
  stage: HTMLElement;
  progress(f: number): void;
  hint(t: string): void;
  win(): void;
  sfx(n: MiniSfx): void;
  shake(): void;
  /** Pointer position in stage units. */
  pt(e: PointerEvent): { x: number; y: number };
  pop(x: number, y: number, text: string, color?: string): void;
}

interface Game {
  update?(dt: number): void;
  key?(e: KeyboardEvent): void;
  destroy?(): void;
}

function el(tag: string, cls: string, parent?: HTMLElement, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}
const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const at = (e: HTMLElement | SVGElement, x: number, y: number) => {
  e.style.left = `${(x / W) * 100}%`;
  e.style.top = `${(y / H) * 100}%`;
};
const pressKey = (k: HTMLElement) => {
  k.classList.add("down");
  setTimeout(() => k.classList.remove("down"), 90);
};
const svgCursor = (svg: string, hx: number, hy: number, fallback = "pointer") =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, ${fallback}`;
const isPress = (e: KeyboardEvent) => (e.code === "Space" || e.code === "Enter") && !e.repeat;

// ================================================================== art

const PLANT_SVG = `<svg viewBox="0 0 120 160" aria-hidden="true">
  <g class="pl-leaves" stroke="${INK}" stroke-width="4" stroke-linejoin="round">
    <path d="M60 100 C36 96 14 74 12 46 C36 50 54 72 60 100 Z" fill="#3f8f53"/>
    <path d="M60 100 C84 96 106 74 108 46 C84 50 66 72 60 100 Z" fill="#3f8f53"/>
    <path d="M60 100 C42 88 30 64 32 28 C50 40 60 66 60 100 Z" fill="#5cae6a"/>
    <path d="M60 100 C78 88 90 64 88 28 C70 40 60 66 60 100 Z" fill="#5cae6a"/>
    <path d="M60 100 C44 76 44 34 60 6 C76 34 76 76 60 100 Z" fill="#7cc48a"/>
  </g>
  <g stroke="${INK}" stroke-width="4" stroke-linejoin="round">
    <path d="M30 106 L90 106 L82 156 L38 156 Z" fill="#ff7a45"/>
    <rect x="22" y="94" width="76" height="17" rx="6" fill="#ff9d62"/>
  </g>
  <g fill="${INK}"><circle cx="50" cy="127" r="4"/><circle cx="70" cy="127" r="4"/></g>
  <g class="pl-blush" fill="#c4382c" opacity="0"><ellipse cx="41" cy="135" rx="5" ry="3"/><ellipse cx="79" cy="135" rx="5" ry="3"/></g>
  <path class="pl-mouth" d="M52 141 Q60 133 68 141" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

const CAN_SVG = `<svg viewBox="0 0 130 90" aria-hidden="true">
  <path d="M104 38 C128 38 128 78 104 78" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
  <path d="M104 38 C128 38 128 78 104 78" fill="none" stroke="#2f4f8f" stroke-width="4" stroke-linecap="round"/>
  <g stroke="${INK}" stroke-width="4" stroke-linejoin="round">
    <path d="M56 56 L14 18 L6 26 L56 72 Z" fill="#2f4f8f"/>
    <ellipse cx="9" cy="22" rx="6" ry="10" transform="rotate(-48 9 22)" fill="#b4d3dc"/>
    <rect x="50" y="30" width="58" height="54" rx="12" fill="#2f4f8f"/>
    <rect x="58" y="23" width="42" height="11" rx="5" fill="#b4d3dc"/>
  </g>
  <path d="M62 46 H96" stroke="#b4d3dc" stroke-width="5" stroke-linecap="round"/>
</svg>`;

const WRENCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <g transform="rotate(45 20 20)" stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <rect x="16" y="14" width="8" height="24" rx="3" fill="#e9c25a"/>
    <path d="M11 4 a9 9 0 1 0 18 0 l-5 0 l0 6 l-8 0 l0 -6 Z" fill="#c9d1e6"/>
  </g></svg>`;

const PEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M24 4 L32 12 L12 32 L4 32 L4 24 Z" fill="#c4382c"/>
    <path d="M4 24 L12 32 L4 32 Z" fill="#1b3bd8"/>
    <path d="M20 8 L28 16" fill="none"/>
  </g></svg>`;

const PLANE_SVG = `<svg viewBox="0 0 64 48" aria-hidden="true"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round">
  <path d="M2 22 L62 2 L40 46 L28 30 Z" fill="#fff"/><path d="M28 30 L62 2 L22 40 Z" fill="#dfe6ff"/></g></svg>`;

const SLIDE_ART: Record<string, string> = {
  up: `<svg viewBox="0 0 160 90"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round">
    <rect x="16" y="62" width="22" height="24" fill="#bff7d6"/><rect x="48" y="48" width="22" height="38" fill="#7cf0ad"/>
    <rect x="80" y="34" width="22" height="52" fill="#3fdc87"/><rect x="112" y="14" width="22" height="72" fill="#1fbf6a"/></g>
    <path d="M12 56 L58 36 L88 42 L140 6" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M124 6 L142 4 L138 22" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  down: `<svg viewBox="0 0 160 90"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round">
    <rect x="16" y="14" width="22" height="72" fill="#ffb3c0"/><rect x="48" y="34" width="22" height="52" fill="#ff8aa0"/>
    <rect x="80" y="50" width="22" height="36" fill="#c4382c"/><rect x="112" y="66" width="22" height="20" fill="#c4382c"/></g>
    <path d="M12 10 L58 30 L88 26 L140 66" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pie: `<svg viewBox="0 0 160 90"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round">
    <circle cx="80" cy="46" r="38" fill="#e9c25a"/><path d="M80 46 L80 8 A38 38 0 0 1 116 58 Z" fill="#c97a3a"/>
    <circle cx="66" cy="34" r="4" fill="#c4382c"/><circle cx="72" cy="62" r="4" fill="#c4382c"/><circle cx="96" cy="66" r="4" fill="#c4382c"/></g></svg>`,
  venn: `<svg viewBox="0 0 160 90"><g stroke="${INK}" stroke-width="3.5">
    <circle cx="62" cy="46" r="34" fill="rgba(91,99,128,.55)"/><circle cx="98" cy="46" r="34" fill="rgba(106,163,180,.55)"/></g></svg>`,
  org: `<svg viewBox="0 0 160 90"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round">
    <path d="M80 26 V40 M30 40 H130 M30 40 V54 M80 40 V54 M130 40 V54" fill="none"/>
    <rect x="62" y="6" width="36" height="20" rx="4" fill="#e9c25a"/>
    <rect x="12" y="54" width="36" height="20" rx="4" fill="#fff"/><rect x="62" y="54" width="36" height="20" rx="4" fill="#fff"/>
    <rect x="112" y="54" width="36" height="20" rx="4" fill="#fff"/></g>
    <path d="M114 52 L146 78 M146 52 L114 78" stroke="#c4382c" stroke-width="6" stroke-linecap="round"/></svg>`,
  flat: `<svg viewBox="0 0 160 90"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round">
    <rect x="16" y="44" width="22" height="42" fill="#d6d1ea"/><rect x="48" y="46" width="22" height="40" fill="#d6d1ea"/>
    <rect x="80" y="44" width="22" height="42" fill="#d6d1ea"/><rect x="112" y="45" width="22" height="41" fill="#d6d1ea"/></g>
    <path d="M10 40 H150" stroke="${INK}" stroke-width="5" stroke-dasharray="8 8"/></svg>`
};

// ================================================================== unjam the printer

const PRINTER_JAM_SVG = `<svg class="jm-svg" viewBox="0 0 560 300" aria-hidden="true">
  <rect x="0" y="262" width="560" height="40" fill="#8a5a3b"/><rect x="0" y="258" width="560" height="8" fill="#b07a4f"/>
  <g class="jm-sheet"><path d="M232 150 L236 34 L262 40 L288 30 L312 42 L330 36 L326 150 Z" fill="#fbf8ee" stroke="#1c1d21" stroke-width="3" stroke-linejoin="round"/>
    <path d="M250 60 l60 6 M248 80 l64 -4 M252 100 l50 4 M250 120 l58 -3" stroke="#9aa3b0" stroke-width="3" stroke-linecap="round"/>
    <path d="M262 40 l8 22 l-14 18 M312 42 l-6 26" fill="none" stroke="#c9c2b0" stroke-width="2.5"/></g>
  <g stroke="#1c1d21" stroke-width="3" stroke-linejoin="round">
    <rect x="160" y="130" width="240" height="120" rx="14" fill="#e3e6ec"/>
    <rect x="176" y="120" width="208" height="24" rx="8" fill="#cfd4dc"/>
    <rect x="216" y="132" width="128" height="9" rx="4" fill="#1c1d21"/>
    <rect x="200" y="210" width="160" height="30" rx="6" fill="#c9ced8"/>
    <rect x="346" y="160" width="36" height="22" rx="4" fill="#2a2c33"/>
  </g>
  <rect x="350" y="164" width="28" height="14" fill="#ff6a55" class="jm-lcd"/>
  <circle cx="186" cy="170" r="6" fill="#c4382c" class="jm-led"/>
  <text x="280" y="230" text-anchor="middle" font-family="Jersey 10, monospace" font-size="16" fill="#1c1d21">LASERJAM 9000</text>
</svg>`;

/** "PAPER JAM IN TRAY 2": rock the page left, right, left, right until it pulls free. */
function jamGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const need = Math.max(8, Math.round(9 * o.len));
  let pulls = 0, last: "L" | "R" | null = null, lock = 0, done = false;
  S.insertAdjacentHTML("beforeend", PRINTER_JAM_SVG + `<button class="jm-btn l">&#9664; A</button><button class="jm-btn r">D &#9654;</button>`);
  const sheet = S.querySelector(".jm-sheet") as SVGGElement;
  const lcd = S.querySelector(".jm-lcd") as SVGRectElement;
  const led = S.querySelector(".jm-led") as SVGCircleElement;
  const render = (tilt: number) => {
    const f = pulls / need;
    sheet.setAttribute("transform", `translate(0 ${-f * 70}) rotate(${tilt} 280 150)`);
    api.progress(f);
  };
  render(0);
  const press = (side: "L" | "R") => {
    if (lock > 0 || done) return;
    pressKey(q(S, side === "L" ? ".jm-btn.l" : ".jm-btn.r"));
    if (side === last) {
      // Yanking the same way twice tears the page.
      lock = 0.4;
      last = null;
      pulls = Math.max(0, pulls - 2);
      api.sfx("bad");
      api.shake();
      api.pop(280, 46, "RIIIP!", "#c4382c");
      render(0);
      return;
    }
    last = side;
    pulls++;
    api.sfx("tick");
    render(side === "L" ? -9 : 9);
    if (pulls >= need) {
      done = true;
      lcd.setAttribute("fill", "#8fe0a0");
      led.setAttribute("fill", "#4b9a63");
      gsap.to(sheet, { y: -260, rotation: 25, duration: 0.45, ease: "power2.in", transformOrigin: "50% 50%" });
      api.pop(280, 60, "PAGE FREED!", "#4b9a63");
      api.win();
    }
  };
  S.querySelectorAll<HTMLElement>(".jm-btn").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); press(b.classList.contains("l") ? "L" : "R"); }));
  return {
    update(dt) {
      if (lock > 0) lock -= dt;
      led.setAttribute("opacity", done || Math.floor(performance.now() / 300) % 2 ? "1" : "0.25");
    },
    key(e) {
      if (e.code === "KeyA" || e.code === "ArrowLeft") press("L");
      else if (e.code === "KeyD" || e.code === "ArrowRight") press("R");
    }
  };
}

// ================================================================== reset the wi-fi

/** Simon says, with a router: watch the lights, play them back. Rounds get one step longer. */
function wifiGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const rounds = clamp(Math.round(1 + o.len * 1.4), 2, 4);
  const COLS = ["#3fa35a", "#f0c93a", "#2f64c8", "#d0392e"];
  S.insertAdjacentHTML("beforeend", `
    <svg class="wf-svg" viewBox="0 0 560 300" aria-hidden="true">
      <g stroke="#1c1d21" stroke-width="3" stroke-linecap="round">
        <path d="M206 92 L176 18 M354 92 L384 18" stroke-width="7"/>
        <rect x="170" y="88" width="220" height="56" rx="12" fill="#2a2c33"/>
      </g>
      <g class="wf-bars">${[0, 1, 2, 3].map((i) => `<rect x="${246 + i * 18}" y="${128 - i * 8 - 10}" width="12" height="${10 + i * 8}" rx="2" fill="#4a4d57"/>`).join("")}</g>
      <circle class="wf-led" cx="196" cy="116" r="6" fill="#d0392e"/>
    </svg>
    <div class="wf-row">${COLS.map((c, i) => `<button class="wf-b" data-i="${i}" style="--c:${c}"><b>${i + 1}</b></button>`).join("")}</div>`);
  const btns = Array.from(S.querySelectorAll<HTMLElement>(".wf-b"));
  const bars = Array.from(S.querySelectorAll<SVGRectElement>(".wf-bars rect"));
  const led = S.querySelector(".wf-led") as SVGCircleElement;
  let round = 0, seq: number[] = [], step = 0, listening = false, dead = false;
  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (!dead) fn(); }, ms)); };
  const flash = (i: number, ms = 320) => {
    const b = btns[i];
    b.classList.add("lit");
    api.sfx(`dtmf_${i + 1}`);
    later(ms, () => b.classList.remove("lit"));
  };
  const showBars = () => bars.forEach((b, i) => b.setAttribute("fill", i < Math.round((round / rounds) * 4) ? "#8fe0a0" : "#4a4d57"));
  const play = () => {
    listening = false;
    step = 0;
    api.hint("Watch...");
    seq.forEach((v, k) => later(500 + k * 480, () => flash(v)));
    later(500 + seq.length * 480, () => { listening = true; api.hint("Your turn!"); });
  };
  const next = () => {
    seq = Array.from({ length: 3 + round }, () => Math.floor(Math.random() * 4));
    play();
  };
  const press = (i: number) => {
    if (!listening) return;
    flash(i, 180);
    if (seq[step] !== i) {
      api.sfx("bad");
      api.shake();
      api.pop(280, 180, "WRONG LIGHT!", "#c4382c");
      play();
      return;
    }
    step++;
    if (step < seq.length) return;
    round++;
    showBars();
    api.progress(round / rounds);
    if (round >= rounds) {
      led.setAttribute("fill", "#3fa35a");
      api.pop(280, 60, "CONNECTED!", "#3fa35a");
      api.win();
      return;
    }
    listening = false;
    api.sfx("good");
    later(650, next);
  };
  btns.forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); press(Number(b.dataset.i)); }));
  showBars();
  later(300, next);
  return {
    key(e) {
      const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
      if (m) press(Number(m[2]) - 1);
    },
    destroy() { dead = true; timers.forEach((t) => clearTimeout(t)); }
  };
}

// ================================================================== sort the mail

/** Envelopes come in; each goes to its department's cubby. */
function mailGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const DEPTS = [
    { n: "HR", c: "#d0392e" }, { n: "IT", c: "#2f64c8" }, { n: "SALES", c: "#3fa35a" }, { n: "LEGAL", c: "#8a52c8" }
  ];
  const NAMES = ["B. Lumbergh", "M. Scott", "P. Gibbons", "D. Schrute", "L. Knope", "R. Swanson", "M. Waddams", "A. Martin", "K. Kapoor", "J. Halpert"];
  const need = Math.max(5, Math.round(6 * o.len));
  let sorted = 0, cur = 0, busy = false;
  S.insertAdjacentHTML("beforeend", `<div class="ml-cubbies">${DEPTS.map((d, i) => `<button class="ml-cub" data-i="${i}" style="--c:${d.c}"><span class="ml-n">${i + 1}</span><span class="ml-lbl">${d.n}</span><span class="ml-pile"></span></button>`).join("")}</div><div class="ml-env"></div>`);
  const env = q(S, ".ml-env");
  const cubs = Array.from(S.querySelectorAll<HTMLElement>(".ml-cub"));
  const deal = () => {
    cur = Math.floor(Math.random() * DEPTS.length);
    const d = DEPTS[cur];
    env.style.setProperty("--c", d.c);
    env.innerHTML = `<i class="ml-stamp"></i><div class="ml-to">TO: ${pick(NAMES)}</div><div class="ml-dept">${d.n}</div>`;
    gsap.fromTo(env, { x: 0, y: 60, opacity: 0, rotation: rand(-8, 8) }, { y: 0, opacity: 1, duration: 0.25, ease: "back.out(2)" });
  };
  const send = (i: number) => {
    if (busy) return;
    const c = cubs[i];
    pressKey(c);
    if (i !== cur) {
      api.sfx("bad");
      api.shake();
      api.pop(280, 150, "WRONG DEPARTMENT!", "#c4382c");
      return;
    }
    busy = true;
    api.sfx("good");
    const er = env.getBoundingClientRect(), cr = c.getBoundingClientRect();
    gsap.to(env, {
      x: cr.left + cr.width / 2 - (er.left + er.width / 2), y: cr.top + cr.height / 2 - (er.top + er.height / 2), scale: 0.3, opacity: 0, duration: 0.25, ease: "power2.in",
      onComplete: () => {
        gsap.set(env, { x: 0, y: 0, scale: 1 });
        q(c, ".ml-pile").style.height = `${Math.min(100, (Number(c.dataset.n ?? 0) + 1) * 14)}%`;
        c.dataset.n = String(Number(c.dataset.n ?? 0) + 1);
        sorted++;
        api.progress(sorted / need);
        busy = false;
        if (sorted >= need) { api.pop(280, 150, "ALL SORTED!", "#3fa35a"); api.win(); } else deal();
      }
    });
  };
  cubs.forEach((c) => c.addEventListener("pointerdown", (e) => { e.preventDefault(); send(Number(c.dataset.i)); }));
  deal();
  return {
    key(e) {
      const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
      if (m) send(Number(m[2]) - 1);
    }
  };
}

// ================================================================== clean the whiteboard

const ERASER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="6" y="10" width="28" height="18" rx="3" fill="#2f4f8f" stroke="#1c1d21" stroke-width="2.5"/><rect x="6" y="24" width="28" height="7" rx="2" fill="#e9e3d3" stroke="#1c1d21" stroke-width="2.5"/></svg>`;

/** Last quarter's brainstorm is all over the board. Scrub it off, but leave the CEO's note alone. */
function boardGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  S.style.cursor = svgCursor(ERASER_SVG, 20, 20, "crosshair");
  const cv = el("canvas", "wb-canvas", S) as HTMLCanvasElement;
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const note = { x: Math.random() < 0.5 ? 26 : W - 176, y: 22, w: 150, h: 64 };
  el("div", "wb-note", S, "DO NOT ERASE<br><small>- the CEO</small>");
  at(q(S, ".wb-note"), note.x, note.y);
  // Marker scribbles: words, arrows, circles and squiggles in three colours.
  const MARK = ["#2f64c8", "#d0392e", "#2e7d4f"];
  const WORDS = ["SYNERGY!!", "Q3 TARGETS", "PIVOT", "LEVERAGE", "BLUE SKY", "KPIs?", "DISRUPT", "CIRCLE BACK"];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const n = Math.max(3, Math.round(3 + o.len * 1.5));
  for (let k = 0; k < n; k++) {
    ctx.strokeStyle = ctx.fillStyle = pick(MARK);
    ctx.lineWidth = 6;
    const x = rand(40, W - 160), y = rand(110, H - 40);
    const kind = k % 3;
    if (kind === 0) {
      ctx.font = `${Math.round(rand(30, 42))}px "Jersey 10", monospace`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand(-0.12, 0.12));
      ctx.fillText(pick(WORDS), 0, 0);
      ctx.restore();
    } else if (kind === 1) {
      ctx.beginPath();
      ctx.ellipse(x + 50, y - 20, rand(40, 70), rand(22, 34), rand(-0.3, 0.3), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 1; i <= 6; i++) ctx.lineTo(x + i * 22, y + (i % 2 ? -18 : 18) + rand(-6, 6));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 132, y);
      ctx.lineTo(x + 116, y - 12);
      ctx.moveTo(x + 132, y);
      ctx.lineTo(x + 114, y + 10);
      ctx.stroke();
    }
  }
  // Ink samples to measure progress (the CEO's corner is off limits).
  const data = ctx.getImageData(0, 0, W, H).data;
  const pts: number[] = [];
  for (let y = 2; y < H; y += 5) for (let x = 2; x < W; x += 5) {
    if (x > note.x - 12 && x < note.x + note.w + 12 && y > note.y - 12 && y < note.y + note.h + 12) continue;
    if (data[(y * W + x) * 4 + 3] > 40) pts.push(x, y);
  }
  const total = Math.max(1, pts.length / 2);
  const gone = new Uint8Array(pts.length / 2);
  let erased = 0, down = false, lastX = 0, lastY = 0, noteCd = 0, finished = false;
  const R = 24;
  const scrub = (x: number, y: number) => {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = R * 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
    const steps = Math.max(1, Math.ceil(Math.hypot(x - lastX, y - lastY) / 8));
    for (let s = 0; s <= steps; s++) {
      const sx = lastX + ((x - lastX) * s) / steps, sy = lastY + ((y - lastY) * s) / steps;
      for (let i = 0; i < gone.length; i++) {
        if (gone[i]) continue;
        const dx = pts[i * 2] - sx, dy = pts[i * 2 + 1] - sy;
        if (dx * dx + dy * dy < R * R) { gone[i] = 1; erased++; }
      }
      if (noteCd <= 0 && sx > note.x - 8 && sx < note.x + note.w + 8 && sy > note.y - 8 && sy < note.y + note.h + 8) {
        noteCd = 0.9;
        api.sfx("bad");
        api.shake();
        api.pop(note.x + note.w / 2, note.y + note.h + 26, "NOT THE CEO'S NOTE!", "#c4382c");
        q(S, ".wb-note").classList.add("smudged");
      }
    }
    lastX = x;
    lastY = y;
    const f = erased / total;
    api.progress(Math.min(1, f / 0.9));
    if (!finished && f >= 0.9) {
      finished = true;
      gsap.to(cv, { opacity: 0, duration: 0.3 });
      api.pop(280, 150, "SPOTLESS!", "#3fa35a");
      api.win();
    }
  };
  S.addEventListener("pointerdown", (e) => { down = true; const p = api.pt(e); lastX = p.x; lastY = p.y; scrub(p.x, p.y); });
  S.addEventListener("pointermove", (e) => { if (down) { const p = api.pt(e); scrub(p.x, p.y); } });
  const up = () => { down = false; };
  window.addEventListener("pointerup", up);
  return {
    update(dt) { if (noteCd > 0) noteCd -= dt; },
    destroy() { window.removeEventListener("pointerup", up); }
  };
}

// ================================================================== door keypad

/**
 * The code-locked door. Type four digits and press OK: a right digit in the right place lights
 * green and stays; wrong ones light red (and cost a second). Clues come from the chores.
 */
function keypadGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const code = o.code ?? [0, 0, 0, 0];
  const known = o.known ?? [null, null, null, null];
  const locked: (number | null)[] = [null, null, null, null];
  let entry: number[] = [];
  let busy = false;
  S.insertAdjacentHTML("beforeend", `
    <div class="kp-body">
      <div class="kp-lcd"><span></span><span></span><span></span><span></span></div>
      <div class="kp-keys">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"].map((k) => `<button class="kp-k${k === "OK" ? " ok" : k === "C" ? " clr" : ""}" data-k="${k}">${k === "C" ? "&#9003;" : k}</button>`).join("")}</div>
      <i class="kp-led"></i>
    </div>
    <div class="kp-notes">
      <div class="kp-nt">YOUR NOTES</div>
      <div class="kp-known">${known.map((d) => `<b>${d === null ? "?" : d}</b>`).join("")}</div>
      <div class="kp-tries"></div>
    </div>`);
  const slots = Array.from(S.querySelectorAll<HTMLElement>(".kp-lcd span"));
  const led = q(S, ".kp-led");
  const tries = q(S, ".kp-tries");
  const lcd = q(S, ".kp-lcd");
  const draw = () => {
    slots.forEach((s, i) => {
      const v = locked[i] ?? entry[i - locked.slice(0, i).filter((x) => x !== null).length];
      s.textContent = v === undefined ? "" : String(v);
      s.classList.toggle("lock", locked[i] !== null);
    });
    api.progress(locked.filter((x) => x !== null).length / 4);
  };
  const free = () => locked.filter((x) => x === null).length;
  const press = (k: string) => {
    if (busy) return;
    const btn = S.querySelector<HTMLElement>(`.kp-k[data-k="${k}"]`);
    if (btn) pressKey(btn);
    if (/^\d$/.test(k)) {
      if (entry.length >= free()) return;
      entry.push(Number(k));
      api.sfx(`dtmf_${Number(k)}`);
    } else if (k === "C") {
      entry.pop();
      api.sfx("tick");
    } else if (k === "OK") {
      if (entry.length < free()) { api.sfx("tick"); api.hint("Four digits first."); return; }
      const guess: number[] = [];
      let e = 0;
      for (let i = 0; i < 4; i++) guess.push(locked[i] ?? entry[e++]);
      const right = guess.map((d, i) => d === code[i]);
      const row = el("div", "kp-try", tries, guess.map((d, i) => `<b class="${right[i] ? "ok" : "no"}">${d}</b>`).join(""));
      gsap.from(row, { x: 20, opacity: 0, duration: 0.25 });
      while (tries.children.length > 3) tries.firstElementChild?.remove();
      if (right.every(Boolean)) {
        lcd.classList.add("open");
        led.classList.add("open");
        guess.forEach((d, i) => { locked[i] = d; });
        entry = [];
        draw();
        api.win();
        return;
      }
      busy = true;
      lcd.classList.add("deny");
      api.sfx("bad");
      api.shake();
      api.hint("ACCESS DENIED");
      setTimeout(() => {
        right.forEach((ok, i) => { if (ok) locked[i] = guess[i]; });
        entry = [];
        lcd.classList.remove("deny");
        api.hint("");
        busy = false;
        draw();
      }, 650);
    }
    draw();
  };
  S.querySelectorAll<HTMLElement>(".kp-k").forEach((b) => b.addEventListener("pointerdown", (ev) => { ev.preventDefault(); press(b.dataset.k!); }));
  draw();
  return {
    key(e) {
      if (/^(Digit|Numpad)\d$/.test(e.code)) press(e.code.slice(-1));
      else if (e.code === "Backspace" || e.code === "Delete") press("C");
      else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") press("OK");
    }
  };
}

/** Espresso machine for "Fix the Coffee Machine", in stage units (560 x 300). */
const ESPRESSO_SVG = `<svg class="cf-svg" viewBox="0 0 560 300" aria-hidden="true">
  <defs>
    <linearGradient id="cfChrome" x1="0" x2="1"><stop offset="0" stop-color="#9aa3b3"/><stop offset=".35" stop-color="#ffffff"/><stop offset="1" stop-color="#aeb6c4"/></linearGradient>
    <linearGradient id="cfChromeV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#a7afbd"/></linearGradient>
    <linearGradient id="cfEnamel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9503f"/><stop offset="1" stop-color="#8f3328"/></linearGradient>
  </defs>
  <g stroke="#1c1d21" stroke-width="3" stroke-linejoin="round">
    <rect x="0" y="262" width="560" height="40" fill="#8a5a3b"/>
    <rect x="0" y="258" width="560" height="8" fill="#b07a4f"/>
    <!-- side pipes with joints (leaks spring from the joints) -->
    <rect x="143" y="66" width="16" height="172" rx="8" fill="url(#cfChrome)"/>
    <rect x="401" y="66" width="16" height="172" rx="8" fill="url(#cfChrome)"/>
    <rect x="157" y="96" width="36" height="12" fill="url(#cfChromeV)"/>
    <rect x="157" y="196" width="36" height="12" fill="url(#cfChromeV)"/>
    <rect x="367" y="96" width="36" height="12" fill="url(#cfChromeV)"/>
    <rect x="367" y="196" width="36" height="12" fill="url(#cfChromeV)"/>
    <rect x="139" y="78" width="24" height="12" rx="3" fill="#c9d1e6"/><rect x="139" y="144" width="24" height="12" rx="3" fill="#c9d1e6"/><rect x="139" y="206" width="24" height="12" rx="3" fill="#c9d1e6"/>
    <rect x="397" y="78" width="24" height="12" rx="3" fill="#c9d1e6"/><rect x="397" y="144" width="24" height="12" rx="3" fill="#c9d1e6"/><rect x="397" y="206" width="24" height="12" rx="3" fill="#c9d1e6"/>
    <!-- body -->
    <rect x="190" y="64" width="180" height="186" rx="14" fill="url(#cfEnamel)"/>
    <rect x="182" y="52" width="196" height="18" rx="6" fill="url(#cfChromeV)"/>
    <!-- pressure valves on top -->
    <rect x="214" y="34" width="16" height="20" rx="3" fill="#c9d1e6"/><rect x="330" y="34" width="16" height="20" rx="3" fill="#c9d1e6"/>
    <!-- cups warming on top -->
    <path d="M246 52 v-12 h20 v12 Z" fill="#f7f4ea"/><path d="M272 52 v-14 h20 v14 Z" fill="#f7f4ea"/><path d="M298 52 v-12 h20 v12 Z" fill="#f7f4ea"/>
    <!-- control panel with gauge -->
    <rect x="208" y="80" width="144" height="58" rx="8" fill="#2a2c33"/>
    <circle cx="280" cy="110" r="22" fill="#f7f4ea"/>
    <circle cx="232" cy="110" r="8" fill="#4b9a63"/><circle cx="328" cy="110" r="8" fill="#e9c25a"/>
    <!-- side bolts -->
    <circle cx="205" cy="120" r="6" fill="#c9d1e6"/><circle cx="355" cy="120" r="6" fill="#c9d1e6"/>
    <!-- group head + portafilter -->
    <rect x="248" y="156" width="64" height="18" rx="4" fill="url(#cfChrome)"/>
    <rect x="256" y="172" width="48" height="12" rx="3" fill="#3a3c44"/>
    <rect x="302" y="174" width="56" height="9" rx="4.5" fill="#1c1d21"/>
    <!-- drip tray -->
    <rect x="226" y="242" width="108" height="12" rx="3" fill="url(#cfChromeV)"/>
    <!-- mug -->
    <path d="M300 222 q14 0 14 10 q0 10 -14 10" fill="none" stroke-width="4"/>
    <rect x="262" y="214" width="40" height="30" rx="5" fill="#f7f4ea"/>
  </g>
  <rect class="cf-fill" x="265" y="238" width="34" height="4" fill="#5a3420"/>
  <line class="cf-needle" x1="280" y1="110" x2="280" y2="93" stroke="#c4382c" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="280" cy="110" r="3.5" fill="#1c1d21"/>
  <path d="M276 186 v8 M284 186 v6" stroke="#5a3420" stroke-width="3" stroke-linecap="round"/>
  <text x="280" y="152" text-anchor="middle" font-family="Jersey 10, monospace" font-size="17" fill="#f7f4ea" letter-spacing="1">BREW-TRON 3000</text>
  <path d="M206 72 h148" stroke="#ffffff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>
</svg>`;

// ================================================================== copy

const SHRED_WORDS = ["CONFIDENTIAL", "OFF THE BOOKS", "BURN AFTER READING", "TAX STUFF", "DO NOT AUDIT", "THE REAL Q3"];
const MEMO_WORDS = ["Restructuring", "Right-sizing", "Effective Friday", "We Are A Family", "Headcount", "Difficult Decisions", "Synergies"];
const EMAIL_PHRASES = ["per my last email", "reply all", "circling back", "touch base", "action items", "looping in legal", "see attached", "thanks in advance", "quick sync", "new deck attached", "noted with thanks", "take this offline"];
const EMAIL_SUBJECTS = ["RE: RE: FW: Synergy", "URGENT (not urgent)", "Quick question", "Who ate my yogurt", "Mandatory fun", "Q4 vibes", "RE: Per my last email"];
const SLIDES = [
  { t: "Q3 LOSSES", c: "#c4382c", art: "down" },
  { t: "NEW ORG CHART", c: "#8f97a3", art: "org" },
  { t: "PIZZA FRIDAY", c: "#c97a3a", art: "pie" },
  { t: "SYNERGY", c: "#5b6380", art: "venn" },
  { t: "FLAT IS THE NEW UP", c: "#6aa3b4", art: "flat" }
];
const GROWTH = { t: "GROWTH!", c: "#1fbf6a", art: "up" };

// ================================================================== the games

/** Water the CEO's Plant: the plant wanders, keep the watering can above it. */
function plantGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const need = 2.6 * o.len;
  el("div", "pl-sun", S);
  el("div", "pl-cloud", S);
  el("div", "pl-floor", S);
  const plant = el("div", "pl-plant", S, PLANT_SVG);
  const leaves = plant.querySelector(".pl-leaves") as SVGGElement;
  const mouth = plant.querySelector(".pl-mouth") as SVGPathElement;
  const blush = plant.querySelector(".pl-blush") as SVGGElement;
  const can = el("div", "pl-can", S, CAN_SVG);
  let px = W - 80, py = 64, aimed = false;
  let x = rand(170, 390), y = 270, vx = 0, vy = 0, tx = x, ty = y, retarget = 0;
  let v = 0, tilt = -4, dropT = 0, tickT = 0, pouringWas = false, dryT = 0;
  const speed = 125 + 45 * clamp(o.len - 0.6, 0, 2);
  const drops: { e: HTMLElement; x: number; y: number; vx: number; vy: number; life: number }[] = [];
  const move = (e: PointerEvent) => {
    const p = api.pt(e);
    px = p.x; py = p.y; aimed = true;
  };
  S.addEventListener("pointermove", move);
  S.addEventListener("pointerdown", move);
  return {
    update(dt) {
      retarget -= dt;
      if (retarget <= 0) {
        retarget = rand(0.6, 1.3);
        tx = rand(80, W - 80);
        ty = rand(222, H - 14);
      }
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
      const want = Math.min(speed, d * 2.5);
      const k = Math.min(1, dt * 2.6);
      vx += ((dx / d) * want - vx) * k;
      vy += ((dy / d) * want - vy) * k;
      x = clamp(x + vx * dt, 70, W - 70);
      y = clamp(y + vy * dt, 222, H - 12);

      const pouring = aimed && Math.abs(px - x) < 62 && py < y - 36 && py > y - 260;
      v = clamp(v + (pouring ? dt : -dt * 0.4), 0, need);
      const f = v / need;
      api.progress(f);
      // Losing the plant for too long once you've started costs time.
      if (!pouring && f > 0.04) {
        dryT += dt;
        if (dryT > 1.8) { dryT = 0; api.sfx("bad"); api.pop(x, Math.max(40, y - 170), "THIRSTY!", "#c4382c"); }
      } else dryT = 0;

      const now = performance.now();
      const grow = 0.8 + 0.32 * f;
      const wobble = pouring ? Math.sin(now / 80) * 3 : 0;
      plant.style.transform = `translate(-50%, -100%) rotate(${clamp(vx * 0.045, -9, 9) + wobble}deg) scale(${grow})`;
      at(plant, x, y);
      const perk = Math.min(1, f * 1.6);
      leaves.style.filter = `saturate(${0.3 + 0.9 * perk})`;
      leaves.style.transform = `rotate(${(1 - perk) * 7}deg) scaleY(${0.82 + 0.18 * perk})`;
      mouth.setAttribute("d", pouring ? "M50 134 Q60 147 70 134" : f > 0.5 ? "M52 137 Q60 141 68 137" : "M52 141 Q60 133 68 141");
      blush.setAttribute("opacity", pouring ? "1" : "0");

      tilt += ((pouring ? -36 : -4) - tilt) * Math.min(1, dt * 12);
      can.style.transform = `translate(-4.6%, -26.7%) rotate(${tilt}deg)`;
      at(can, px, py);

      if (pouring) {
        dropT -= dt;
        while (dropT <= 0) {
          dropT += 0.03;
          drops.push({ e: el("div", "pl-drop", S), x: px + rand(-5, 5), y: py + 6, vx: rand(-25, 25), vy: rand(40, 100), life: 0.42 });
        }
        tickT -= dt;
        if (tickT <= 0) { tickT = 0.3; api.sfx("tick"); }
      }
      if (pouring !== pouringWas) {
        pouringWas = pouring;
        api.hint(pouring || f < 0.05 ? "" : "Keep it over the plant!");
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const dr = drops[i];
        dr.life -= dt;
        dr.vy += 900 * dt;
        dr.x += dr.vx * dt;
        dr.y += dr.vy * dt;
        if (dr.life <= 0) { dr.e.remove(); drops.splice(i, 1); continue; }
        at(dr.e, dr.x, dr.y);
        dr.e.style.opacity = String(Math.min(1, dr.life * 5));
      }
      if (v >= need) {
        api.pop(x, y - 180 * grow, "THRIVING!", "#7cc48a");
        api.win();
      }
    },
    destroy() { for (const d of drops) d.e.remove(); }
  };
}

/** Print the Q4 Budget: stop the sliding page on the outline. */
function printGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const rounds = Math.max(2, Math.round(3 * o.len));
  S.insertAdjacentHTML("beforeend", `
    <div class="pr-floor"></div>
    <div class="pr-copier">
      <div class="pr-tray"><div class="pr-stack"></div></div>
      <div class="pr-body"><div class="pr-drawer"></div><div class="pr-drawer two"></div></div>
      <div class="pr-lid">
        <div class="pr-glass"><div class="pr-zone"></div><div class="pr-sheet"></div><div class="pr-scan"></div></div>
        <div class="pr-panel"><i></i><i></i><i></i></div>
      </div>
    </div>
    <div class="key pr-key">SPACE</div>`);
  const zone = q(S, ".pr-zone"), sheet = q(S, ".pr-sheet"), scan = q(S, ".pr-scan"), stack = q(S, ".pr-stack"), key = q(S, ".pr-key");
  // Push in on the copier so the glass fills the frame.
  gsap.from(q(S, ".pr-copier"), { scale: 0.55, y: 40, duration: 0.6, ease: "back.out(1.5)" });
  const leds = [...S.querySelectorAll(".pr-panel i")] as HTMLElement[];
  const SW = 0.13;
  let hits = 0, pos = 0, dir = 1, zoneW = 0.3, zoneX = 0.5, lock = 0;
  const roll = () => {
    zoneW = Math.max(SW + 0.06, 0.3 - hits * 0.035);
    for (let k = 0; k < 20; k++) {
      zoneX = rand(0.02, 0.98 - zoneW);
      if (Math.abs(zoneX + zoneW / 2 - (pos + SW / 2)) > 0.22) break;
    }
    zone.style.left = `${zoneX * 100}%`;
    zone.style.width = `${zoneW * 100}%`;
    gsap.fromTo(zone, { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)" });
  };
  roll();
  const press = () => {
    if (lock > 0) return;
    pressKey(key);
    const c = pos + SW / 2, zc = zoneX + zoneW / 2;
    if (Math.abs(c - zc) <= (zoneW - SW) / 2 + 0.025) {
      hits++;
      lock = 0.4;
      api.sfx("good");
      api.progress(hits / rounds);
      gsap.fromTo(scan, { left: "-12%", opacity: 1 }, { left: "104%", duration: 0.32, ease: "none", onComplete: () => { scan.style.opacity = "0"; } });
      const page = el("div", "pr-out", stack);
      page.style.bottom = `${(hits - 1) * 5}px`;
      gsap.from(page, { x: -70, rotation: -18, opacity: 0, duration: 0.4, ease: "back.out(2)", delay: 0.2 });
      leds.forEach((l, i) => l.classList.toggle("on", i < Math.ceil((hits / rounds) * leds.length)));
      if (hits >= rounds) api.win();
      else setTimeout(roll, 300);
    } else {
      lock = 0.3;
      api.sfx("bad");
      api.shake();
      api.pop(280, 64, "PAPER JAM!", "#c4382c");
      gsap.fromTo(sheet, { rotation: -10, scaleY: 0.7 }, { rotation: 0, scaleY: 1, duration: 0.45, ease: "elastic.out(1, 0.4)" });
    }
  };
  S.addEventListener("pointerdown", press);
  return {
    update(dt) {
      lock -= dt;
      if (lock > 0.15) return;
      pos += dir * dt * (0.6 + hits * 0.1 + (o.len - 1) * 0.12);
      if (pos > 1 - SW) { pos = 1 - SW; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
      sheet.style.left = `${pos * 100}%`;
    },
    key(e) { if (isPress(e)) press(); }
  };
}

/** Shred the Evidence: mash to push each document through. */
function shredGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const docs = Math.max(2, Math.round(3 * o.len));
  const per = Math.max(5, Math.round((19 * o.len) / docs));
  const words = shuffle([...SHRED_WORDS]);
  S.insertAdjacentHTML("beforeend", `
    <div class="sh-clip"><div class="sh-doc"><b></b><i></i><i></i><i style="width:70%"></i><i></i><i style="width:50%"></i></div></div>
    <div class="sh-head"><div class="sh-slot"></div><div class="sh-label">SHRED-O-MATIC</div></div>
    <div class="sh-bin"><div class="sh-window"><div class="sh-fill"></div></div></div>
    <div class="key sh-key">SPACE</div>`);
  const doc = q(S, ".sh-doc"), stamp = q(S, ".sh-doc b"), head = q(S, ".sh-head"), fill = q(S, ".sh-fill"), win = q(S, ".sh-window"), key = q(S, ".sh-key");
  let done = 0, p = 0, swap = 0;
  stamp.textContent = words[0];
  const strip = () => {
    const s = el("i", "sh-strip", win);
    s.style.left = `${rand(4, 92)}%`;
    s.style.background = pick(["#ffffff", "#ece6ff", "#fff1b8"]);
    gsap.fromTo(s, { top: "-30%", rotation: rand(-20, 20) }, {
      top: `${rand(45, 80)}%`, rotation: rand(-70, 70), duration: rand(0.35, 0.6), ease: "power1.in",
      onComplete: () => { gsap.to(s, { opacity: 0, duration: 0.3, onComplete: () => s.remove() }); }
    });
  };
  const render = () => {
    doc.style.top = `${-20 + p * 124}%`;
    const f = (done + p) / docs;
    fill.style.height = `${8 + 80 * f}%`;
    api.progress(f);
  };
  render();
  const press = () => {
    if (swap > 0 || done >= docs) return;
    pressKey(key);
    p += 1 / per;
    api.sfx("tick");
    gsap.fromTo(head, { x: rand(-5, 5), y: 2 }, { x: 0, y: 0, duration: 0.2, ease: "elastic.out(1.2, 0.3)" });
    for (let i = 0; i < 3; i++) strip();
    if (p >= 1) {
      done++;
      api.sfx("good");
      api.pop(280, 96, "SHREDDED!", "#a9adc9");
      for (let i = 0; i < 10; i++) strip();
      if (done >= docs) { p = 0; render(); api.win(); return; }
      p = 0;
      swap = 0.3;
      stamp.textContent = words[done % words.length];
      render();
      gsap.fromTo(doc, { yPercent: -60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.3, ease: "back.out(1.6)" });
      return;
    }
    render();
  };
  S.addEventListener("pointerdown", press);
  return {
    update(dt) {
      swap -= dt;
      if (p > 0 && swap <= 0) { p = Math.max(0, p - dt * 0.22); render(); }
    },
    key(e) { if (e.code === "Space" && !e.repeat) press(); }
  };
}

/** Fix the Coffee Machine: steam leaks pop up, click them shut. */
function coffeeGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const need = Math.max(4, Math.round(6 * o.len));
  S.style.cursor = svgCursor(WRENCH_SVG, 8, 8);
  S.insertAdjacentHTML("beforeend", ESPRESSO_SVG);
  const needle = S.querySelector(".cf-needle") as SVGLineElement;
  const coffee = S.querySelector(".cf-fill") as SVGRectElement;
  const setCoffee = (f: number) => {
    const h = 4 + f * 22;
    coffee.setAttribute("y", String(242 - h));
    coffee.setAttribute("height", String(h));
  };
  setCoffee(0);
  const SPOTS: [number, number][] = [[150, 84], [150, 150], [150, 212], [410, 84], [410, 150], [410, 212], [222, 44], [338, 44], [205, 120], [355, 120]];
  let fixed = 0, spawn = 0.2;
  const life = 2.5 - Math.min(0.8, Math.max(0, o.len - 1) * 0.4);
  const live: { e: HTMLElement; spot: number; t: number }[] = [];
  const spawnLeak = () => {
    const free = SPOTS.map((_, i) => i).filter((i) => !live.some((l) => l.spot === i));
    if (!free.length) return;
    const spot = pick(free);
    const e = el("button", "cf-leak", S, `<span class="steam"><i></i><i></i><i></i></span><span class="bolt"></span>`);
    at(e, SPOTS[spot][0], SPOTS[spot][1]);
    gsap.from(e, { scale: 0, duration: 0.25, ease: "back.out(3)" });
    const leak = { e, spot, t: life };
    live.push(leak);
    api.sfx("tick");
    e.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      const i = live.indexOf(leak);
      if (i < 0) return;
      live.splice(i, 1);
      fixed++;
      api.sfx("good");
      api.progress(fixed / need);
      e.classList.add("fixed");
      gsap.to(q(e, ".bolt"), { rotation: 300, duration: 0.25, ease: "power2.out" });
      gsap.to(e, { scale: 0, duration: 0.2, delay: 0.25, onComplete: () => e.remove() });
      setCoffee(fixed / need);
      if (fixed >= need) {
        api.pop(280, 36, "FRESH POT!", "#ffb37a");
        api.win();
      }
    });
  };
  return {
    update(dt) {
      spawn -= dt;
      if (spawn <= 0 && live.length < 3) { spawn = rand(0.3, 0.7); spawnLeak(); }
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        l.t -= dt;
        if (l.t <= 0) {
          // A leak you didn't get to blows: that costs time.
          live.splice(i, 1);
          api.sfx("bad");
          api.pop(SPOTS[l.spot][0], Math.max(24, SPOTS[l.spot][1] - 30), "LEAK!", "#c4382c");
          gsap.to(l.e, { scale: 0, opacity: 0, duration: 0.2, onComplete: () => l.e.remove() });
        }
      }
      needle.setAttribute("transform", `rotate(${-70 + live.length * 45 + Math.sin(performance.now() / 60) * 4} 280 110)`);
    }
  };
}

/** Prep the Board Deck: the slides flick past, present the GROWTH one. */
function deckGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const rounds = Math.max(2, Math.round(3 * o.len));
  S.insertAdjacentHTML("beforeend", `
    <div class="ps-beam"></div>
    <div class="ps-screen"><div class="ps-slide"></div><div class="ps-num"></div></div>
    <div class="ps-stars">${"<i></i>".repeat(rounds)}</div>
    <div class="key ps-key">SPACE</div>`);
  const slide = q(S, ".ps-slide"), num = q(S, ".ps-num"), key = q(S, ".ps-key");
  const stars = [...S.querySelectorAll(".ps-stars i")] as HTMLElement[];
  let hits = 0, t = 0.9, since = 0, isTarget = false, prev = -1, lock = 0, no = Math.floor(rand(3, 9));
  const show = (target: boolean) => {
    isTarget = target;
    let s = GROWTH;
    if (!target) {
      let i = Math.floor(Math.random() * SLIDES.length);
      if (i === prev) i = (i + 1) % SLIDES.length;
      prev = i;
      s = SLIDES[i];
    }
    slide.style.setProperty("--sc", s.c);
    slide.innerHTML = `<h3>${s.t}</h3>${SLIDE_ART[s.art]}`;
    num.textContent = `${++no} / 48`;
    gsap.fromTo(slide, { xPercent: 14, opacity: 0.3 }, { xPercent: 0, opacity: 1, duration: 0.14, ease: "power2.out" });
  };
  show(false);
  const interval = () => Math.max(0.5, 0.95 - 0.12 * Math.max(0, o.len - 1) - 0.06 * hits);
  const press = () => {
    if (lock > 0) return;
    pressKey(key);
    if (isTarget) {
      stars[hits].classList.add("on");
      gsap.fromTo(stars[hits], { scale: 2.2 }, { scale: 1, duration: 0.35, ease: "back.out(3)" });
      hits++;
      isTarget = false;
      api.sfx("good");
      api.progress(hits / rounds);
      api.pop(280, 110, pick(["NAILED IT!", "STONKS!", "THE BOARD LOVES IT!"]), "#7cc48a");
      if (hits >= rounds) { api.win(); return; }
      lock = 0.3;
      t = 0.35;
      since = 0;
    } else {
      lock = 0.35;
      api.sfx("bad");
      api.shake();
      api.pop(280, 110, "WRONG SLIDE!", "#c4382c");
    }
  };
  S.addEventListener("pointerdown", press);
  return {
    update(dt) {
      lock -= dt;
      t -= dt;
      if (t > 0) return;
      const target = !isTarget && ((since >= 2 && Math.random() < 0.45) || since >= 4);
      since = target ? 0 : since + 1;
      show(target);
      t = interval() * (target ? 1.3 : 1);
    },
    key(e) { if (isPress(e)) press(); }
  };
}

/** Sign the Layoff Memos: scribble a signature on each one. */
function memoGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const memos = Math.max(2, Math.round(2 * o.len));
  const inkNeed = 2.6; // in signature-box widths of scribble
  S.style.cursor = svgCursor(PEN_SVG, 3, 33, "crosshair");
  S.insertAdjacentHTML("beforeend", `<div class="mm-pile"></div><div class="mm-memo"></div>`);
  const pile = q(S, ".mm-pile"), memo = q(S, ".mm-memo");
  let canvas!: HTMLCanvasElement, ctx!: CanvasRenderingContext2D;
  let signed = 0, ink = 0, drawing = false, busy = false, lx = 0, ly = 0;
  const fill = () => {
    memo.innerHTML = `<div class="mm-top"><b>MEMO</b><span>No. ${Math.floor(rand(100, 999))}</span></div>
      <div class="mm-re">RE: ${pick(MEMO_WORDS)}</div>
      <div class="mm-lines"><i></i><i></i><i style="width:72%"></i><i></i><i style="width:48%"></i></div>
      <div class="mm-sign"><canvas></canvas><span>SIGN HERE</span><em>X</em></div>`;
    canvas = memo.querySelector("canvas")!;
    const box = canvas.parentElement!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(10, box.clientWidth * dpr);
    canvas.height = Math.max(10, box.clientHeight * dpr);
    ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 3.2 * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1b3bd8";
    ink = 0;
  };
  fill();
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  };
  const progress = () => api.progress((signed + Math.min(1, ink / inkNeed)) / memos);
  const finishMemo = () => {
    busy = true;
    drawing = false;
    signed++;
    ink = 0;
    api.sfx("good");
    progress();
    const st = el("div", "mm-stamp", memo, "SIGNED");
    gsap.fromTo(st, { scale: 2.6, rotation: -30, opacity: 0 }, { scale: 1, rotation: -12, opacity: 1, duration: 0.22, ease: "power3.in" });
    gsap.to(memo, {
      x: "-125%", rotation: -10, duration: 0.32, delay: 0.38, ease: "power2.in",
      onComplete: () => {
        const sheet = el("i", "", pile);
        sheet.style.transform = `translate(${rand(-4, 4)}px, ${-pile.children.length * 4}px) rotate(${rand(-6, 6)}deg)`;
        if (signed >= memos) { api.win(); return; }
        fill();
        gsap.fromTo(memo, { x: "125%", rotation: 8 }, { x: "0%", rotation: -1.5, duration: 0.35, ease: "back.out(1.4)", onComplete: () => { busy = false; } });
      }
    });
  };
  S.addEventListener("pointerdown", (e) => {
    if (busy) return;
    drawing = true;
    S.setPointerCapture(e.pointerId);
    const p = local(e);
    lx = p.x; ly = p.y;
  });
  S.addEventListener("pointermove", (e) => {
    if (!drawing || busy) return;
    const p = local(e);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (p.inside) ink += Math.hypot(p.x - lx, p.y - ly) / canvas.width;
    lx = p.x; ly = p.y;
    progress();
    if (ink >= inkNeed) finishMemo();
  });
  const stop = () => { drawing = false; };
  S.addEventListener("pointerup", stop);
  S.addEventListener("pointercancel", stop);
  return {};
}

/** Reboot the Server: drag each cable to the port of the same colour. */
function serverGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const n = clamp(Math.round(3 + o.len), 4, 6);
  // Six cables at most, six different colours.
  const COLORS = shuffle(["#d0392e", "#f0c93a", "#2f64c8", "#3fa35a", "#8a52c8", "#eef0f4"]).slice(0, n);
  const ys = Array.from({ length: n }, (_, i) => 62 + (i * 196) / (n - 1));
  const LX = 66, RX = 494;
  S.insertAdjacentHTML("beforeend", `
    <div class="sv-rack l"><b>PATCH</b></div><div class="sv-rack r"><b>SERVER</b></div>
    <div class="sv-status"><i></i><span>SERVER OFFLINE</span></div>
    <svg class="sv-wires" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>`);
  const svg = S.querySelector("svg.sv-wires") as SVGSVGElement;
  const status = q(S, ".sv-status");
  const NS = "http://www.w3.org/2000/svg";
  const makeWire = (color: string) => {
    const g = document.createElementNS(NS, "g");
    const a = document.createElementNS(NS, "path"), b = document.createElementNS(NS, "path");
    a.setAttribute("stroke", INK); a.setAttribute("stroke-width", "15");
    b.setAttribute("stroke", color); b.setAttribute("stroke-width", "8");
    for (const p of [a, b]) { p.setAttribute("fill", "none"); p.setAttribute("stroke-linecap", "round"); g.appendChild(p); }
    svg.appendChild(g);
    return {
      g,
      set(x1: number, y1: number, x2: number, y2: number) {
        const d = `M${x1} ${y1} C${x1 + 130} ${y1} ${x2 - 130} ${y2} ${x2} ${y2}`;
        a.setAttribute("d", d);
        b.setAttribute("d", d);
      }
    };
  };
  const plugs = COLORS.map((c, i) => {
    const e = el("div", "sv-plug", S);
    e.style.setProperty("--w", c);
    at(e, LX, ys[i]);
    return e;
  });
  const order = shuffle(COLORS.map((_, i) => i));
  const ports = order.map((ci, j) => {
    const e = el("div", "sv-port", S);
    e.style.setProperty("--w", COLORS[ci]);
    at(e, RX, ys[j]);
    return { e, ci, y: ys[j] };
  });
  const done = new Set<number>();
  let active: { i: number; wire: ReturnType<typeof makeWire> } | null = null;
  let sticky = false, sx = 0, sy = 0;
  const plugAt = (x: number, y: number) => plugs.findIndex((_, i) => !done.has(i) && Math.abs(x - LX) < 46 && Math.abs(y - ys[i]) < 22);
  const portAt = (x: number, y: number) => ports.findIndex((p) => Math.abs(x - RX) < 52 && Math.abs(y - p.y) < 24);
  const finish = (x: number, y: number) => {
    const a = active!;
    active = null;
    sticky = false;
    const j = portAt(x, y);
    if (j >= 0 && ports[j].ci === a.i) {
      done.add(a.i);
      a.wire.set(LX + 20, ys[a.i], RX - 20, ports[j].y);
      plugs[a.i].classList.add("on");
      ports[j].e.classList.add("on");
      gsap.fromTo(ports[j].e, { scale: 1.5 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
      api.sfx("good");
      api.progress(done.size / n);
      if (done.size >= n) {
        status.classList.add("on");
        q(status, "span").textContent = "SERVER ONLINE";
        api.win();
      }
    } else {
      a.wire.g.remove();
      if (j >= 0) {
        api.sfx("bad");
        api.shake();
        api.pop(RX - 40, ports[j].y - 30, "WRONG PORT!", "#c4382c");
      }
    }
  };
  S.addEventListener("pointerdown", (e) => {
    const p = api.pt(e);
    if (active) { finish(p.x, p.y); return; }
    const i = plugAt(p.x, p.y);
    if (i < 0) return;
    active = { i, wire: makeWire(COLORS[i]) };
    active.wire.set(LX + 20, ys[i], p.x, p.y);
    sx = p.x; sy = p.y;
    sticky = false;
    S.setPointerCapture(e.pointerId);
    api.sfx("tick");
  });
  S.addEventListener("pointermove", (e) => {
    if (!active) return;
    const p = api.pt(e);
    active.wire.set(LX + 20, ys[active.i], p.x, p.y);
  });
  S.addEventListener("pointerup", (e) => {
    if (!active) return;
    const p = api.pt(e);
    // A click (no drag) keeps the cable in hand until the next click.
    if (!sticky && Math.hypot(p.x - sx, p.y - sy) < 10) { sticky = true; return; }
    finish(p.x, p.y);
  });
  return {};
}

/** Reply-All to Emails: type the reply, hit send. */
function emailGame(api: Api, o: MiniOpts): Game {
  const S = api.stage;
  const count = Math.max(1, Math.round(2 * o.len));
  const phrases = shuffle([...EMAIL_PHRASES]).slice(0, count);
  const subjects = shuffle([...EMAIL_SUBJECTS]);
  S.insertAdjacentHTML("beforeend", `
    <div class="em-window">
      <div class="em-bar"><i></i><i></i><i></i><span>New Message</span></div>
      <div class="em-row"><b>To</b><span>All Staff (2,431)</span></div>
      <div class="em-row"><b>Subject</b><span class="em-subj"></span></div>
      <div class="em-body"><div class="em-text"></div></div>
      <div class="em-send">SEND</div>
    </div>
    <div class="em-count"></div>`);
  const text = q(S, ".em-text"), subj = q(S, ".em-subj"), send = q(S, ".em-send"), counter = q(S, ".em-count"), win = q(S, ".em-window");
  let wi = 0, ci = 0, busy = false;
  const render = () => {
    const w = phrases[wi];
    text.innerHTML = `<span class="ok">${w.slice(0, ci)}</span><span class="cur">${w[ci] === " " ? "&nbsp;" : w[ci]}</span><span class="rest">${w.slice(ci + 1)}</span>`;
    subj.textContent = subjects[wi % subjects.length];
    counter.textContent = `Email ${wi + 1} of ${phrases.length}`;
  };
  render();
  const sendIt = () => {
    busy = true;
    text.innerHTML = `<span class="ok">${phrases[wi]}</span>`;
    gsap.fromTo(send, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
    const plane = el("div", "em-plane", S, PLANE_SVG);
    at(plane, 470, 240);
    gsap.to(plane, { x: 160, y: -260, rotation: -18, duration: 0.6, ease: "power2.in", onComplete: () => plane.remove() });
    api.sfx("good");
    wi++;
    ci = 0;
    if (wi >= phrases.length) { api.progress(1); api.win(); return; }
    api.progress(wi / phrases.length);
    gsap.fromTo(win, { rotation: -1.5 }, { rotation: 0, duration: 0.35, ease: "elastic.out(1, 0.4)" });
    gsap.delayedCall(0.35, () => {
      busy = false;
      render();
      gsap.fromTo(text, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2 });
    });
  };
  return {
    key(e) {
      if (busy || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " ") e.preventDefault();
      const want = phrases[wi][ci];
      if (e.key.toLowerCase() === want) {
        ci++;
        api.sfx("tick");
        if (ci >= phrases[wi].length) { sendIt(); return; }
        api.progress((wi + ci / phrases[wi].length) / phrases.length);
        render();
      } else {
        api.sfx("bad");
        api.shake();
      }
    }
  };
}

const THEMES: Record<string, { accent: string; instr: string; make: (api: Api, o: MiniOpts) => Game; light?: boolean }> = {
  plant: { accent: "#4b9a63", instr: "The plant won't sit still. Keep the watering can over it!", make: plantGame },
  print: { light: true, accent: "#6aa3b4", instr: "Press <b>SPACE</b> when the page lines up with the yellow outline.", make: printGame },
  shred: { accent: "#5b6380", instr: "Mash <b>SPACE</b> to feed the evidence into the shredder!", make: shredGame },
  coffee: { accent: "#c97a3a", instr: "Click the steam leaks to tighten them!", make: coffeeGame },
  presentation: { accent: "#2f4f8f", instr: "Press <b>SPACE</b> when the GROWTH slide comes up.", make: deckGame },
  memos: { accent: "#c4382c", instr: "Hold the mouse button and scribble on the signature line.", make: memoGame },
  server: { accent: "#3f8f86", instr: "Drag each cable to the port of the same colour.", make: serverGame },
  emails: { light: true, accent: "#d8a93b", instr: "Type the reply. Every key counts!", make: emailGame },
  jam: { light: true, accent: "#8f97a3", instr: "Wiggle the page out: alternate <b>A</b> and <b>D</b> (or the arrows). Same side twice rips it!", make: jamGame },
  wifi: { accent: "#3f8f86", instr: "Watch the lights, then press them in the same order (<b>1</b>-<b>4</b> or click).", make: wifiGame },
  mail: { light: true, accent: "#2f4f8f", instr: "Send each envelope to its department: click a cubby or press <b>1</b>-<b>4</b>.", make: mailGame },
  board: { light: true, accent: "#4b9a63", instr: "Hold the mouse and scrub the board clean. Don't touch the CEO's note!", make: boardGame },
  keypad: { accent: "#5b6380", instr: "Punch in the 4-digit code. Clues are hidden in today's chores.", make: keypadGame }
};

// ================================================================== host

export function openMini(host: HTMLElement, o: MiniOpts): MiniHandle {
  const th = THEMES[o.chore] ?? THEMES.emails;
  const root = el("div", "mini", host);
  // The panel clips its contents; the wrapper lets the clue note hang off its corner.
  const wrap = el("div", "mini-wrap", root);
  const panel = el("div", "mini-panel", wrap);
  panel.style.setProperty("--accent", th.accent);
  panel.classList.toggle("light", !!th.light);
  const head = el("div", "mini-head", panel);
  el("h2", "", head).textContent = o.title;
  const x = el("button", "mini-x", head, "&#x2715;");
  el("div", "mini-instr", panel, th.instr);
  const stage = el("div", `mini-stage g-${o.chore}`, panel);
  const chip = el("div", "m-chip", stage);
  chip.style.display = "none";
  const foot = el("div", "mini-foot", panel);
  const progFill = el("div", "", el("div", "mini-prog", foot));
  el("div", "mini-esc", foot, "ESC to walk away");

  gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.18 });
  gsap.fromTo(panel, { scale: 0.7, y: 50, rotation: -3 }, { scale: 1, y: 0, rotation: 0, duration: 0.45, ease: "back.out(1.7)" });

  let closed = false, won = false, raf = 0, last = performance.now();
  const api: Api = {
    stage,
    progress: (f) => { progFill.style.width = `${clamp(f, 0, 1) * 100}%`; },
    hint: (t) => {
      chip.textContent = t;
      chip.style.display = t ? "" : "none";
    },
    sfx: (n) => {
      if (closed) return;
      o.sfx(n);
      if (n === "bad" && o.penalty) {
        const p = el("div", "m-pen", head);
        p.textContent = o.penalty;
        gsap.fromTo(p, { y: -4, opacity: 1, scale: 1.4 }, { y: 26, opacity: 0, scale: 1, duration: 0.9, ease: "power2.out", onComplete: () => p.remove() });
      }
    },
    shake: () => { gsap.fromTo(panel, { x: -14 }, { x: 0, duration: 0.5, ease: "elastic.out(1.2, 0.22)" }); },
    pt: (e) => {
      const r = stage.getBoundingClientRect();
      const k = r.width / (stage.offsetWidth || 1);
      return {
        x: ((e.clientX - r.left - stage.clientLeft * k) / (stage.clientWidth * k)) * W,
        y: ((e.clientY - r.top - stage.clientTop * k) / (stage.clientHeight * k)) * H
      };
    },
    pop: (px, py, text, color = "#fff") => {
      const p = el("div", "m-pop", stage);
      p.textContent = text;
      p.style.color = color;
      at(p, px, py);
      gsap.set(p, { xPercent: -50, yPercent: -50 });
      gsap.fromTo(p, { scale: 0.3 }, { scale: 1, duration: 0.25, ease: "back.out(3)" });
      gsap.to(p, { y: -36, opacity: 0, duration: 0.4, delay: 0.5, ease: "power1.in", onComplete: () => p.remove() });
    },
    win: () => {
      if (won || closed) return;
      won = true;
      progFill.style.width = "100%";
      api.hint("");
      o.sfx("win");
      const st = el("div", "m-done", stage, "<span>DONE!</span>");
      gsap.fromTo(q(st, "span"), { scale: 2.8, rotation: -28, opacity: 0 }, { scale: 1, rotation: -8, opacity: 1, duration: 0.28, ease: "power3.in" });
      gsap.to(panel, {
        scale: 0.85, y: -24, opacity: 0, duration: 0.24, delay: 0.8, ease: "power2.in",
        onComplete: () => { if (!closed) { close(); o.onDone(); } }
      });
      gsap.to(root, { opacity: 0, duration: 0.24, delay: 0.8 });
    }
  };
  const game = th.make(api, o);
  if (o.note) {
    const n = el("div", "m-note", wrap, `<b>psst...</b>${o.note}`);
    gsap.fromTo(n, { scale: 0, rotation: 30, opacity: 0 }, { scale: 1, rotation: 6, opacity: 1, duration: 0.45, delay: 0.7, ease: "back.out(2.4)", onStart: () => { if (!closed) o.sfx("note"); } });
  }

  const onKey = (e: KeyboardEvent) => {
    // Keep key presses away from the game underneath (WASD, E, Space...). Releases pass through.
    if (e.type === "keyup") return;
    e.stopPropagation();
    if (e.code === "Escape") {
      e.preventDefault();
      if (e.type === "keydown" && !won) { close(); o.onCancel(); }
      return;
    }
    if (e.type !== "keydown" || won) return;
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    game.key?.(e);
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("keyup", onKey, true);
  x.addEventListener("click", () => { if (!won) { close(); o.onCancel(); } });
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
    gsap.killTweensOf([root, panel]);
    root.remove();
  }
  return { close, win: api.win };
}
