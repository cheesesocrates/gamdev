import "./ui.css";
import { PerkDef, RARITY_COLOR, PERK_BY_ID } from "../data/perks";
import { MAP_H, MAP_W, TILE } from "../config";
import { World } from "../world/World";
import { OfficeMap } from "../world/OfficeMap";

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
/**
 * Absolute icon URL. Relative url()s inside CSS variables resolve against the
 * bundled stylesheet in production builds, so always hand CSS an absolute one.
 */
const iconUrl = (name: string) => `url("${new URL(`assets/icons/${name}.png`, document.baseURI).href}")`;
const icon = (name: string, cls = "ico") => `<span class="${cls}" style='--src:${iconUrl(name)}'></span>`;

const WEAPON_SVG: Record<string, string> = {
  stapler: `<svg viewBox="0 0 32 32"><path d="M3 21h22l4-3H8z" fill="#9aa3b0"/><path d="M5 17l17-6 6 2-18 6z" fill="#e6304a"/><rect x="3" y="21" width="26" height="4" rx="1" fill="#4b5160"/></svg>`,
  coffee: `<svg viewBox="0 0 32 32"><path d="M6 10h16l-2 16H8z" fill="#f2f4f7"/><path d="M7 13h14l-.6 5H7.6z" fill="#7a4a24"/><path d="M22 13h3a3 3 0 010 6h-3.5" stroke="#f2f4f7" stroke-width="2.4" fill="none"/><path d="M11 3c0 2 2 2 2 4M16 3c0 2 2 2 2 4" stroke="#c9d1dc" stroke-width="1.6" fill="none"/></svg>`,
  laser: `<svg viewBox="0 0 32 32"><rect x="4" y="13" width="18" height="6" rx="3" fill="#3a404b"/><rect x="18" y="14" width="4" height="4" fill="#9aa3b0"/><circle cx="27" cy="16" r="3" fill="#ff3b55"/><circle cx="27" cy="16" r="5" fill="#ff3b55" opacity=".35"/></svg>`
};

export interface WeaponHud {
  armed: boolean;
  active: string;
  coffee: boolean;
  laser: boolean;
  mag: number;
  maxMag: number;
  reloading: boolean;
  cups: number;
  maxCups: number;
  battery: number;
  maxBattery: number;
}

export interface ArrowMark { x: number; y: number; angle: number; color: string; icon?: string }

export interface ReviewData {
  bank: number;
  notes: { text: string; kind: "good" | "bad" | "" }[];
  offers: { perk: PerkDef; sold: boolean; stacks: number }[];
  healCost: number;
  canHeal: boolean;
  rerollCost: number;
}

export class UI {
  root: HTMLElement;
  private cache = new Map<string, string>();
  private mm!: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; base: HTMLCanvasElement; scale: number };
  private toastBox: HTMLElement;
  private bannerTimer: number | null = null;
  private comboTimer: number | null = null;

  constructor() {
    this.root = document.getElementById("ui")!;
    // Asset URLs in bundled CSS resolve against the CSS file, so set them here (document-relative).
    this.root.style.setProperty("--heart", iconUrl("suit_hearts"));
    this.root.innerHTML = `
      <div id="dusk"></div>
      <div id="vignette"></div>
      <div id="hud" class="hidden">
        <div class="hud-tl">
          <div class="day-chip"><span class="day">DAY 1</span><span class="bank">OVERTIME 0s</span></div>
          <div class="hearts"></div>
          <div class="sticky"><h3>TO-DO BEFORE 5PM</h3><ul></ul><div class="opt"></div></div>
        </div>
        <div class="hud-tc">
          <div class="clock"><span class="t">3:00 PM</span><small>UNTIL 5:00 PM</small></div>
          <div class="quota hidden"><div class="label">FIRED <b>0</b> / 10</div><div class="bar"><div class="fill"></div></div></div>
          <div class="boss-bar hidden"><div class="name">THE CONSULTANT</div><div class="bar"><div class="fill"></div></div></div>
        </div>
        <div class="hud-tr">
          <canvas class="minimap" width="220" height="165"></canvas>
        </div>
        <div class="hud-bl">
          <div class="holstered">Weapons holstered until 5:00 PM</div>
          <div class="wslot" data-w="stapler"><span class="key">1</span>${WEAPON_SVG.stapler}<div class="name">Stapler</div><div class="ammo">12</div><div class="meter"><i></i></div></div>
          <div class="wslot" data-w="coffee"><span class="key">2</span>${WEAPON_SVG.coffee}<div class="name">Coffee</div><div class="ammo">8</div><div class="meter"><i></i></div></div>
          <div class="wslot" data-w="laser"><span class="key">3</span>${WEAPON_SVG.laser}<div class="name">Laser</div><div class="ammo">100%</div><div class="meter"><i></i></div></div>
        </div>
        <div class="hud-br">
          <div class="bag hidden"></div>
          <div class="perk-row"></div>
          <div class="dodge-pips">DODGE <span class="pips"></span></div>
        </div>
        <div id="prompt" class="hidden"><div class="row"><span class="kc">E</span><span class="lbl"></span></div><div class="prog"><i></i></div></div>
        <div id="clockout" class="hidden"></div>
        <div id="combo" class="hidden"><div class="n"></div><div class="w"></div></div>
        <div id="arrows"></div>
      </div>
      <div id="toasts"></div>
      <div id="banner" class="hidden"><div class="inner"><div class="big"></div><div class="small"></div></div></div>
      <div id="unlock" class="hidden"><div class="k">WEAPON UNLOCKED</div><div class="n"></div><div class="d"></div></div>
      <div id="screens"></div>
      <div id="flash"></div>`;
    this.toastBox = $("#toasts", this.root);
    const mmc = $("canvas.minimap", this.root) as HTMLCanvasElement;
    this.mm = { canvas: mmc, ctx: mmc.getContext("2d")!, base: document.createElement("canvas"), scale: 1 };
  }

  /** Loading done: wait for one click/keypress (unlocks browser audio), then reveal the title. */
  hideBoot(onEnter?: () => void) {
    const boot = document.getElementById("boot");
    if (!boot) { onEnter?.(); return; }
    const p = boot.querySelector("p");
    const track = boot.querySelector<HTMLElement>(".track");
    if (track) track.style.visibility = "hidden";
    if (p) {
      p.innerHTML = "CLICK ANYWHERE TO ENTER THE OFFICE";
      p.style.cssText = "color:#e8ecf2;font-weight:800;letter-spacing:3px;animation:pulse 1.2s ease-in-out infinite";
    }
    const style = document.createElement("style");
    style.textContent = "@keyframes pulse{50%{opacity:.35}} #boot{cursor:pointer}";
    document.head.appendChild(style);
    const go = () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
      boot.style.opacity = "0";
      setTimeout(() => boot.remove(), 500);
      onEnter?.();
    };
    window.addEventListener("pointerdown", go);
    window.addEventListener("keydown", go);
  }

  private set(key: string, value: string, apply: () => void) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  // ---------------------------------------------------------------- HUD
  setHudMode(mode: "none" | "crunch" | "fight") {
    this.set("mode", mode, () => {
      const hud = $("#hud", this.root);
      hud.classList.toggle("hidden", mode === "none");
      $(".clock", hud).classList.toggle("hidden", mode !== "crunch");
      $(".sticky", hud).classList.toggle("hidden", mode !== "crunch");
      $(".quota", hud).classList.toggle("hidden", mode !== "fight");
      $(".holstered", hud).classList.toggle("hidden", mode !== "crunch");
      if (mode !== "fight") this.setBoss(null, 0);
    });
  }

  setDay(day: number, bank: number) {
    this.set("day", `${day}|${Math.floor(bank)}`, () => {
      $(".day-chip .day", this.root).textContent = `DAY ${day}`;
      $(".day-chip .bank", this.root).textContent = `OVERTIME ${Math.floor(bank)}s`;
    });
  }

  setHearts(hp: number, max: number, temp: number) {
    this.set("hearts", `${hp}|${max}|${temp}`, () => {
      const box = $(".hearts", this.root);
      let html = "";
      for (let i = 0; i < max; i += 2) {
        const cls = hp >= i + 2 ? "full" : hp === i + 1 ? "half" : "";
        html += `<span class="heart ${cls} ${hp <= 2 && cls ? "beat" : ""}"></span>`;
      }
      for (let i = 0; i < temp; i += 2) html += `<span class="heart shield"></span>`;
      box.innerHTML = html;
      $("#vignette", this.root).classList.toggle("low", hp <= 2 && hp > 0);
    });
  }

  setClock(text: string, secLeft: number, urgent: boolean) {
    this.set("clock", `${text}|${Math.ceil(secLeft)}|${urgent}`, () => {
      const c = $(".clock", this.root);
      $(".t", c).textContent = text;
      $("small", c).textContent = `${Math.ceil(secLeft)}s UNTIL 5:00 PM`;
      c.classList.toggle("urgent", urgent);
    });
  }

  /** Late-afternoon light: 0 = noon-ish, 1 = golden hour right before 5 PM. */
  setDusk(frac: number) {
    this.set("dusk", frac.toFixed(2), () => { ($("#dusk", this.root)).style.opacity = String(Math.max(0, Math.min(1, frac))); });
  }

  setChores(items: { label: string; room: string; done: boolean; tag?: string }[], optional: string) {
    this.set("chores", JSON.stringify(items) + optional, () => {
      $(".sticky ul", this.root).innerHTML = items.map((i) =>
        `<li class="${i.done ? "done" : ""}"><span class="box"></span><span>${i.label}${i.tag ? ` <em class="tag">${i.tag}</em>` : ""}</span><span class="room">${i.room}</span></li>`).join("");
      const opt = $(".sticky .opt", this.root);
      opt.innerHTML = optional;
      opt.classList.toggle("hidden", !optional);
    });
  }

  setQuota(fired: number, quota: number) {
    this.set("quota", `${fired}|${quota}`, () => {
      $(".quota .label", this.root).innerHTML = `FIRED <b>${Math.min(fired, quota)}</b> / ${quota}`;
      ($(".quota .fill", this.root)).style.width = `${Math.min(100, (fired / quota) * 100)}%`;
    });
  }

  setBoss(name: string | null, frac: number) {
    this.set("boss", `${name}|${frac.toFixed(3)}`, () => {
      const b = $(".boss-bar", this.root);
      b.classList.toggle("hidden", !name);
      if (name) {
        $(".name", b).textContent = name;
        ($(".fill", b)).style.width = `${Math.max(0, frac) * 100}%`;
      }
    });
  }

  setWeapons(w: WeaponHud) {
    const key = `${w.armed}|${w.active}|${w.coffee}|${w.laser}|${w.mag}|${w.maxMag}|${w.reloading}|${w.cups}|${w.maxCups}|${Math.round(w.battery)}`;
    this.set("weapons", key, () => {
      for (const el of Array.from(this.root.querySelectorAll<HTMLElement>(".wslot"))) {
        const id = el.dataset.w!;
        const unlocked = id === "stapler" || (id === "coffee" && w.coffee) || (id === "laser" && w.laser);
        el.classList.toggle("locked", !unlocked);
        el.classList.toggle("active", w.armed && w.active === id);
        const ammo = $(".ammo", el), meter = $(".meter i", el);
        if (!unlocked) { ammo.textContent = "LOCKED"; ammo.style.fontSize = "13px"; meter.style.width = "0"; continue; }
        ammo.style.fontSize = "";
        if (id === "stapler") {
          ammo.textContent = w.reloading ? "RELOAD" : `${w.mag}/${w.maxMag}`;
          meter.style.width = `${(w.mag / w.maxMag) * 100}%`;
          meter.style.background = w.reloading ? "#ffcf3f" : "#e8ecf2";
        } else if (id === "coffee") {
          ammo.textContent = `${w.cups} cups`;
          meter.style.width = `${(w.cups / w.maxCups) * 100}%`;
          meter.style.background = "#c48a52";
        } else {
          ammo.textContent = `${Math.round((w.battery / w.maxBattery) * 100)}%`;
          meter.style.width = `${(w.battery / w.maxBattery) * 100}%`;
          meter.style.background = "#ff3b55";
        }
      }
    });
  }

  setDodge(charges: number, max: number) {
    this.set("dodge", `${charges}|${max}`, () => {
      let h = "";
      for (let i = 0; i < max; i++) h += `<i class="${i < charges ? "on" : ""}"></i>`;
      $(".dodge-pips .pips", this.root).innerHTML = h;
    });
  }

  setPerks(stacks: Record<string, number>) {
    this.set("perks", JSON.stringify(stacks), () => {
      $(".perk-row", this.root).innerHTML = Object.entries(stacks).filter(([, n]) => n > 0).map(([id, n]) => {
        const p = PERK_BY_ID[id];
        if (!p) return "";
        return `<div class="perk-chip" title="${p.name}: ${p.desc}" style="color:${RARITY_COLOR[p.rarity]}">${icon(p.icon)}${n > 1 ? `<b>${n}</b>` : ""}</div>`;
      }).join("");
    });
  }

  setBag(n: number, on: boolean) {
    this.set("bag", `${n}|${on}`, () => {
      const b = $(".bag", this.root);
      b.classList.toggle("hidden", n <= 0);
      b.textContent = `SHRED BAG ${n} · trail ${on ? "ON" : "OFF"} (F)`;
    });
  }

  setPrompt(p: { x: number; y: number; label: string; kind: string; progress: number } | null) {
    const el = $("#prompt", this.root);
    if (!p) { el.classList.add("hidden"); this.cache.delete("prompt"); return; }
    el.classList.remove("hidden");
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.set("prompt", `${p.label}|${p.kind}`, () => {
      el.className = p.kind;
      $(".lbl", el).textContent = p.label;
    });
    ($(".prog i", el)).style.width = `${Math.min(100, p.progress * 100)}%`;
  }

  setClockout(visible: boolean, seconds: number) {
    this.set("clockout", `${visible}|${Math.floor(seconds)}`, () => {
      const el = $("#clockout", this.root);
      el.classList.toggle("hidden", !visible);
      el.innerHTML = `All chores done! Press <span class="kc">ENTER</span> to clock out early and bank <b style="color:var(--gold)">${Math.floor(seconds)}s</b> of overtime`;
    });
  }

  setCombo(n: number, word: string) {
    const el = $("#combo", this.root);
    if (n < 2) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    $(".n", el).textContent = `x${n}`;
    $(".w", el).textContent = word;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    if (this.comboTimer) clearTimeout(this.comboTimer);
  }

  setArrows(list: ArrowMark[]) {
    const box = $("#arrows", this.root);
    while (box.children.length < list.length) {
      const d = document.createElement("div");
      d.className = "edge";
      d.innerHTML = `<i></i><span class="ico"></span>`;
      box.appendChild(d);
    }
    Array.from(box.children).forEach((c, i) => {
      const el = c as HTMLElement;
      const a = list[i];
      if (!a) { el.style.display = "none"; return; }
      el.style.display = "";
      el.style.left = `${a.x}px`;
      el.style.top = `${a.y}px`;
      el.style.color = a.color;
      ($("i", el)).style.transform = `rotate(${a.angle}rad)`;
      const ic = $(".ico", el);
      if (a.icon) { ic.style.display = ""; ic.style.setProperty("--src", iconUrl(a.icon)); } else ic.style.display = "none";
    });
  }

  toast(text: string, color = "#ffcf3f", life = 2.6) {
    const t = document.createElement("div");
    t.className = "toast";
    t.style.borderLeftColor = color;
    t.style.setProperty("--life", `${life}s`);
    t.innerHTML = text;
    this.toastBox.appendChild(t);
    while (this.toastBox.children.length > 4) this.toastBox.firstChild!.remove();
    setTimeout(() => t.remove(), (life + 0.5) * 1000);
  }

  banner(big: string, small = "", color = "#ffffff", dur = 2.2) {
    const el = $("#banner", this.root);
    el.classList.remove("hidden");
    const b = $(".big", el);
    b.textContent = big;
    b.style.color = color;
    b.style.animation = "none";
    void b.offsetWidth;
    b.style.animation = "";
    $(".small", el).textContent = small;
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.add("hidden"), dur * 1000);
  }

  unlock(name: string, desc: string) {
    const el = $("#unlock", this.root);
    $(".n", el).textContent = name;
    $(".d", el).textContent = desc;
    el.classList.remove("hidden");
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    setTimeout(() => el.classList.add("hidden"), 3600);
  }

  flash(color = "#ffffff", ms = 160, opacity = 0.7) {
    const f = $("#flash", this.root);
    f.style.transition = "none";
    f.style.background = color;
    f.style.opacity = String(opacity);
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`;
    f.style.opacity = "0";
  }

  // ---------------------------------------------------------------- minimap
  initMinimap(map: OfficeMap, world: World) {
    const scale = Math.min(220 / MAP_W, 165 / MAP_H);
    this.mm.scale = scale;
    const base = this.mm.base;
    base.width = 220;
    base.height = 165;
    const ctx = base.getContext("2d")!;
    ctx.clearRect(0, 0, 220, 165);
    const ox = (220 - MAP_W * scale) / 2, oy = (165 - MAP_H * scale) / 2;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = world.tile(x, y);
      ctx.fillStyle = t === 1 ? "#2a303c" : t === 2 ? "#3c5f80" : "#0d0f14";
      ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (const f of map.furniture) {
      if (f.floor) continue;
      ctx.fillRect(ox + (f.x / TILE) * scale - 1, oy + (f.y / TILE) * scale - 1, 2, 2);
    }
    (this.mm as any).ox = ox;
    (this.mm as any).oy = oy;
  }

  drawMinimap(dots: { x: number; y: number; color: string; r: number }[]) {
    const { ctx, base, scale } = this.mm;
    const ox = (this.mm as any).ox as number, oy = (this.mm as any).oy as number;
    ctx.clearRect(0, 0, 220, 165);
    ctx.drawImage(base, 0, 0);
    for (const d of dots) {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(ox + (d.x / TILE) * scale, oy + (d.y / TILE) * scale, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- screens
  private screen(id: string, cls: string, html: string): HTMLElement {
    this.closeScreen(id);
    const el = document.createElement("div");
    el.id = id;
    el.className = `screen ${cls}`;
    el.innerHTML = html;
    $("#screens", this.root).appendChild(el);
    return el;
  }

  closeScreen(id: string) {
    document.getElementById(id)?.remove();
  }

  showTitle(best: string, onStart: () => void) {
    const el = this.screen("title", "", `
      <div class="wrap">
        <div class="kicker">A CORPORATE SURVIVAL SHOOTER</div>
        <h1>HOSTILE<span>TAKEOVER</span></h1>
        <div class="tag">You're the highest-paid executive at a failing company. You have until <b>5:00 PM</b> to do your chores and booby-trap the office.
        Then the budget cuts hit, and <b style="color:#ff3b55">everyone wants you fired.</b></div>
        <button class="btn clickable" id="start">CLOCK IN</button>
        <div class="controls">
          <span><b>WASD</b>Move</span><span><b>MOUSE</b>Aim + Fire</span><span><b>SPACE</b> / <b>RMB</b> Dodge</span>
          <span><b>E</b>Hold to interact</span><span><b>1 2 3</b> / <b>Q</b> Weapons</span><span><b>R</b>Reload &nbsp; <b>ESC</b>Pause</span>
        </div>
        ${best ? `<div class="best">${best}</div>` : ""}
      </div>
      <div class="credit">Art &amp; audio: Kenney.nl (CC0) · rendered &amp; remixed for the NASCON '26 jam</div>`);
    $("#start", el).addEventListener("click", onStart);
  }

  showReview(d: ReviewData, h: { buy: (i: number) => void; heal: () => void; reroll: () => void; go: () => void }) {
    const el = this.screen("review", "dim", `
      <div class="panel clickable">
        <div class="scr-head">
          <div><h2>PERFORMANCE REVIEW</h2><div class="sub">Spend banked overtime on upgrades. Unspent time carries over to tomorrow.</div></div>
          <div class="bankbox"><div class="v">${Math.floor(d.bank)}s</div><div class="k">OVERTIME BANKED</div></div>
        </div>
        <div class="review-notes">${d.notes.map((n) => `<div class="note ${n.kind}">${n.text}</div>`).join("")}</div>
        <div class="cards">${d.offers.map((o, i) => this.cardHtml(o.perk, o.stacks, o.sold, !o.sold && d.bank >= o.perk.cost, i, true)).join("")}</div>
        <div class="scr-foot">
          <div class="left">
            <button class="btn ghost" id="heal" ${d.canHeal && d.bank >= d.healCost ? "" : "disabled"}>Sick Day: heal fully · ${d.healCost}s</button>
            <button class="btn ghost" id="reroll" ${d.bank >= d.rerollCost ? "" : "disabled"}>Reshuffle offers · ${d.rerollCost}s</button>
          </div>
          <button class="btn" id="go">RETURN TO DESK →</button>
        </div>
      </div>`);
    el.querySelectorAll<HTMLElement>(".card.buyable").forEach((c) => c.addEventListener("click", () => h.buy(Number(c.dataset.i))));
    $("#heal", el).addEventListener("click", h.heal);
    $("#reroll", el).addEventListener("click", h.reroll);
    $("#go", el).addEventListener("click", h.go);
  }

  private cardHtml(p: PerkDef, stacks: number, sold: boolean, buyable: boolean, i: number, showCost: boolean) {
    const c = RARITY_COLOR[p.rarity];
    return `<div class="card ${sold ? "sold" : ""} ${buyable ? "buyable" : showCost ? "poor" : ""} ${showCost ? "" : "free buyable"}" data-i="${i}" style="--rc:${c}">
      <div class="rar">${p.rarity}</div>
      <div class="icon-wrap">${icon(p.icon)}</div>
      <h4>${p.name}</h4>
      <p>${p.desc}</p>
      <div class="foot">${showCost ? `<span class="cost">${p.cost}s</span>` : `<span class="cost" style="color:var(--green)">FREE</span>`}<span class="stk">${stacks > 0 ? `OWNED ${stacks}/${p.max}` : p.max > 1 ? `MAX ${p.max}` : ""}</span></div>
    </div>`;
  }

  showAnnounce(onSkip: () => void): (i: number, text: string, cls?: string) => void {
    const el = this.screen("announce", "", `<div class="lines">
      <div class="ln"></div><div class="ln"></div><div class="ln red"></div><div class="ln huge"></div></div>
      <div class="skip">CLICK OR PRESS SPACE TO SKIP</div>`);
    el.addEventListener("click", onSkip);
    const lines = Array.from(el.querySelectorAll<HTMLElement>(".ln"));
    return (i, text, cls) => {
      const ln = lines[i];
      if (!ln) return;
      ln.innerHTML = text;
      if (cls) ln.className = `ln ${cls}`;
      ln.classList.remove("glitch");
      void ln.offsetWidth;
      ln.classList.add("glitch");
    };
  }

  showResults(d: { day: number; grade: string; gradeColor: string; title: string; stats: [string, string][] }, picks: PerkDef[], stacks: Record<string, number>, onPick: (i: number) => void) {
    const el = this.screen("results", "dim", `
      <div class="panel clickable">
        <div class="scr-head">
          <div><h2>DAY ${d.day} SURVIVED</h2><div class="sub">${d.title}</div></div>
          <div class="bankbox"><div class="grade" style="color:${d.gradeColor}">${d.grade}</div><div class="k">PERFORMANCE RATING</div></div>
        </div>
        <div class="stats-grid">${d.stats.map(([k, v]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("")}</div>
        <div class="pick-title">CHORE-STAGE UPGRADE: <span>PICK ONE, FREE (combat upgrades cost overtime)</span></div>
        <div class="cards">${picks.map((p, i) => this.cardHtml(p, stacks[p.id] ?? 0, false, true, i, false)).join("")}</div>
      </div>`);
    el.querySelectorAll<HTMLElement>(".card").forEach((c) => c.addEventListener("click", () => onPick(Number(c.dataset.i))));
  }

  showGameOver(d: { lines: [string, string][]; best: string; newBest: boolean }, onRestart: () => void, onTitle: () => void) {
    const el = this.screen("gameover", "dim", `
      <div class="panel clickable">
        <h2>YOU'RE FIRED.</h2>
        <div class="slip"><h5>NOTICE OF TERMINATION</h5>${d.lines.map(([k, v]) => `<div><b>${k}:</b> ${v}</div>`).join("")}</div>
        ${d.newBest ? `<div style="color:var(--gold);font-weight:800;letter-spacing:2px;margin-bottom:12px">NEW PERSONAL BEST</div>` : `<div style="color:var(--muted);font-size:13px;margin-bottom:12px">${d.best}</div>`}
        <div style="display:flex;gap:12px;justify-content:center">
          <button class="btn" id="again">REAPPLY FOR THE JOB</button>
          <button class="btn ghost" id="totitle">Title</button>
        </div>
      </div>`);
    $("#again", el).addEventListener("click", onRestart);
    $("#totitle", el).addEventListener("click", onTitle);
  }

  showPause(state: { music: number; sfx: number; muted: boolean }, h: { resume: () => void; music: (v: number) => void; sfx: (v: number) => void; mute: () => void; quit: () => void }) {
    const el = this.screen("pause", "dim", `
      <div class="panel clickable">
        <h2>PAUSED</h2>
        <div class="vol">Music <input type="range" id="mv" min="0" max="1" step="0.05" value="${state.music}"></div>
        <div class="vol">Effects <input type="range" id="sv" min="0" max="1" step="0.05" value="${state.sfx}"></div>
        <button class="btn ghost" id="mute">${state.muted ? "Unmute" : "Mute all"} (M)</button>
        <button class="btn" id="resume">RESUME</button>
        <button class="btn ghost" id="quit">Quit to title</button>
      </div>`);
    $("#resume", el).addEventListener("click", h.resume);
    $("#mute", el).addEventListener("click", h.mute);
    $("#quit", el).addEventListener("click", h.quit);
    ($("#mv", el) as HTMLInputElement).addEventListener("input", (e) => h.music(Number((e.target as HTMLInputElement).value)));
    ($("#sv", el) as HTMLInputElement).addEventListener("input", (e) => h.sfx(Number((e.target as HTMLInputElement).value)));
  }
}
