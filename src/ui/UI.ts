import gsap from "gsap";
import "./theme.css";
import "./ui.css";
import { PerkDef, RARITY_COLOR } from "../data/perks";
import { MAP_H, MAP_W, TILE } from "../config";
import type { World } from "../world/World";
import type { OfficeMap } from "../world/OfficeMap";
import { perkLogo } from "./perkIcons";
import { ICON, WEAPON_ICON, heartSvg } from "./icons";
import { INTROS, IntroId, introSeen, markIntro, resetIntros } from "./intros";

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
/** Absolute asset URL (CSS inside the bundle would otherwise resolve relative to the stylesheet). */
const asset = (path: string) => new URL(path, document.baseURI).href;
const iconUrl = (name: string) => `url("${asset(`assets/icons/${name}.png`)}")`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** How long a freshly opened menu ignores clicks and keys, so a stray shot doesn't pick something. */
const MENU_GUARD = 0.5;

export interface WeaponSlot { id: string; key: number; name: string; color: string; text: string; frac: number; warn: boolean }
export interface WeaponHud { armed: boolean; active: string; slots: WeaponSlot[] }

export interface ArrowMark { x: number; y: number; angle: number; color: string; icon?: string }

export interface GunOffer { id: string; name: string; desc: string; color: string; cost: number; sold: boolean; locked: boolean }

export interface ReviewData {
  bank: number;
  notes: { text: string; kind: "good" | "bad" | "" }[];
  offers: { perk: PerkDef; sold: boolean; stacks: number }[];
  guns: GunOffer[];
  healCost: number;
  canHeal: boolean;
  rerollCost: number;
}

type Sfx = "hover" | "click" | "deal" | "stamp";

const FLOATIES = [ICON.slip, WEAPON_ICON.stapler, WEAPON_ICON.coffee, WEAPON_ICON.planes, WEAPON_ICON.confetti, ICON.clock, WEAPON_ICON.slips];

export class UI {
  root: HTMLElement;
  /** Hooked up by the scene so menus can click and whoosh. */
  sfx?: (s: Sfx) => void;
  private cache = new Map<string, string>();
  private mm!: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; base: HTMLCanvasElement; scale: number; ox: number; oy: number };
  private toastBox: HTMLElement;
  private bannerTl: gsap.core.Timeline | null = null;
  private unlockTl: gsap.core.Timeline | null = null;
  private lastHp = -1;
  private reviewKey = "";
  private titleTweens: gsap.core.Tween[] = [];
  private briefClose: (() => void) | null = null;
  /** Drops the open intro card's key listener without running its callback (card replaced). */
  private introDispose: (() => void) | null = null;
  /** The scroll hint disappears once the player has switched weapons. */
  private lastActive = "";
  private switched = false;
  /** Title animations wait for the loading screen to go, so the two logos never overlap. */
  private afterBoot: (() => void)[] = [];

  /** Debug/playtest: dismiss an open phase intro as if Continue was pressed. */
  skipBrief() {
    const f = this.briefClose;
    this.briefClose = null;
    f?.();
  }

  constructor() {
    this.root = document.getElementById("ui")!;
    this.root.innerHTML = `
      <div id="dusk"></div>
      <div id="vignette"></div>
      <div id="hud" class="hidden">
        <div class="h-tl">
          <div class="h-hearts"></div>
          <div class="sticky"><div class="s-title">TO-DO BEFORE 5 PM</div><ul></ul></div>
        </div>
        <div class="h-tc">
          <div class="h-clock"><svg class="ring" viewBox="0 0 46 46"><circle cx="23" cy="23" r="18" fill="#ece5d3" stroke="#1c1d21" stroke-width="3"/><path class="wedge" fill="#e9c25a"/><circle cx="23" cy="23" r="18" fill="none" stroke="#1c1d21" stroke-width="3"/><path d="M23 23 V10" stroke="#1c1d21" stroke-width="3" stroke-linecap="round" class="hand"/></svg><div><div class="tm">3:00<small>PM</small></div><div class="left">120s LEFT</div></div></div>
          <div class="h-quota hidden"><div class="ql">${ICON.slip}<span>FIRED <b>0</b> / 10</span></div><div class="bar"><i></i></div></div>
          <div class="h-boss hidden"><div class="bn">THE CONSULTANT</div><div class="bar"><i></i></div></div>
          <div id="toasts"></div>
        </div>
        <div class="h-tr"><canvas class="minimap" width="220" height="165"></canvas></div>
        <div class="h-bl">
          <div class="w-row"></div>
          <div class="w-card"><div class="w-icon"></div><div><div class="w-name">Stapler</div><div class="w-ammo">12/12</div><div class="bar"><i></i></div></div></div>
          <div class="w-hint hidden">${ICON.mouse}SCROLL TO SWITCH</div>
        </div>
        <div class="h-br">
          <div class="bag hidden"></div>
          <div class="dodge">DODGE <span class="pips"></span></div>
        </div>
        <div id="prompt" class="hidden"><div class="ring"><svg viewBox="0 0 34 34"><circle class="tr" cx="17" cy="17" r="14.5"/><circle class="fl" cx="17" cy="17" r="14.5" stroke-dasharray="91.1" stroke-dashoffset="91.1"/></svg><span>E</span></div><div class="lbl"></div></div>
        <div id="clockout" class="hidden"></div>
        <div id="combo" class="hidden"><div class="n"></div><div class="w"></div></div>
        <div id="arrows"></div>
      </div>
      <div id="banner" class="hidden"><div class="inner"><div class="big"></div><div class="small"></div></div></div>
      <div id="unlock" class="hidden"><div class="u-ico"></div><div><div class="k">NEW</div><div class="n"></div><div class="d"></div></div></div>
      <div id="screens"></div>
      <div id="flash"></div>`;
    this.toastBox = $("#toasts", this.root);
    const mmc = $("canvas.minimap", this.root) as HTMLCanvasElement;
    this.mm = { canvas: mmc, ctx: mmc.getContext("2d")!, base: document.createElement("canvas"), scale: 1, ox: 0, oy: 0 };
  }

  // ================================================================ motion helpers
  /** Squishy hover / press on every button inside a freshly built screen. */
  private juice(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>(".btn").forEach((b) => {
      if (b.dataset.j) return;
      b.dataset.j = "1";
      b.addEventListener("pointerenter", () => {
        if ((b as HTMLButtonElement).disabled) return;
        gsap.to(b, { scale: 1.06, duration: 0.25, ease: "back.out(3)" });
        this.sfx?.("hover");
      });
      b.addEventListener("pointerleave", () => gsap.to(b, { scale: 1, duration: 0.3, ease: "power3.out" }));
      b.addEventListener("pointerdown", () => { if (!(b as HTMLButtonElement).disabled) gsap.to(b, { scale: 0.94, duration: 0.07, ease: "power2.out" }); });
      b.addEventListener("pointerup", () => gsap.to(b, { scale: 1.06, duration: 0.25, ease: "back.out(4)" }));
      b.addEventListener("click", () => { if (!(b as HTMLButtonElement).disabled) this.sfx?.("click"); });
    });
  }

  /** Cards and gun offers lift a little on hover. */
  private lift(el: HTMLElement) {
    el.addEventListener("pointerenter", () => {
      if (el.classList.contains("sold") || el.classList.contains("locked")) return;
      gsap.to(el, { y: -10, duration: 0.25, ease: "back.out(2.5)" });
      this.sfx?.("hover");
    });
    el.addEventListener("pointerleave", () => gsap.to(el, { y: 0, duration: 0.3, ease: "power3.out" }));
  }

  /** Every menu slides up from below, in order, and ignores input until it has landed. */
  private slideUp(items: Element[] | NodeListOf<Element>, delay = 0) {
    gsap.from(items, { y: 140, opacity: 0, duration: 0.45, delay, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity", onStart: () => this.sfx?.("deal") });
  }

  private countUp(el: HTMLElement, to: number, fmt: (v: number) => string, from = 0, dur = 0.8, delay = 0) {
    const o = { v: from };
    el.textContent = fmt(from);
    gsap.to(o, { v: to, duration: dur, delay, ease: "power2.out", onUpdate: () => { el.textContent = fmt(Math.round(o.v)); } });
  }

  /** Loading done: wait for one click/keypress (unlocks browser audio), then reveal the title. */
  hideBoot(onEnter?: () => void) {
    const boot = document.getElementById("boot");
    if (!boot) { onEnter?.(); return; }
    const p = boot.querySelector("p");
    const track = boot.querySelector<HTMLElement>(".track");
    if (track) track.style.visibility = "hidden";
    if (p) {
      p.textContent = "CLICK ANYWHERE TO CLOCK IN";
      gsap.to(p, { opacity: 0.35, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
    boot.style.cursor = "pointer";
    const go = () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
      gsap.killTweensOf(p);
      // The boot logo disappears at once; the title logo then drops in on its own.
      boot.querySelectorAll<HTMLElement>("img, p").forEach((e) => { e.style.visibility = "hidden"; });
      gsap.to(boot, { opacity: 0, duration: 0.3, onComplete: () => boot.remove() });
      const queued = this.afterBoot;
      this.afterBoot = [];
      for (const fn of queued) fn();
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

  // ================================================================ HUD
  /** Crunch shows the clock and the to-do list. The fight shows hearts, quota, map and your weapon. Nothing else. */
  setHudMode(mode: "none" | "crunch" | "fight") {
    this.set("mode", mode, () => {
      const hud = $("#hud", this.root);
      const was = hud.classList.contains("hidden");
      hud.classList.toggle("hidden", mode === "none");
      const crunch = mode === "crunch", fight = mode === "fight";
      $(".h-clock", hud).classList.toggle("hidden", !crunch);
      $(".sticky", hud).classList.toggle("hidden", !crunch);
      $(".h-hearts", hud).classList.toggle("hidden", !fight);
      $(".h-quota", hud).classList.toggle("hidden", !fight);
      $(".h-tr", hud).classList.toggle("hidden", !fight);
      $(".h-bl", hud).classList.toggle("hidden", !fight);
      $(".h-br", hud).classList.toggle("hidden", !fight);
      if (!fight) this.setBoss(null, 0);
      if (mode !== "none" && was) {
        gsap.from(hud.querySelectorAll(".h-tl > :not(.hidden), .h-tc > :not(.hidden):not(#toasts), .h-tr:not(.hidden), .h-bl:not(.hidden), .h-br:not(.hidden)"), { y: -20, opacity: 0, duration: 0.4, stagger: 0.05, ease: "power3.out", clearProps: "opacity,transform" });
      }
    });
  }

  /** Day and overtime live on the menus now; kept so the scene can call it unconditionally. */
  setDay(_day: number, _bank: number) { /* intentionally not shown during play */ }

  setHearts(hp: number, max: number, temp: number) {
    this.set("hearts", `${hp}|${max}|${temp}`, () => {
      const box = $(".h-hearts", this.root);
      let html = "";
      for (let i = 0; i < max; i += 2) {
        const cls = hp >= i + 2 ? "full" : hp === i + 1 ? "half" : "empty";
        html += `<span class="hrt ${cls} ${hp <= 2 && cls !== "empty" ? "beat" : ""}"><i class="bg">${heartSvg("#3a3c44")}</i><i class="fg">${heartSvg("#c4382c")}</i></span>`;
      }
      for (let i = 0; i < temp; i += 2) html += `<span class="hrt full"><i class="bg">${heartSvg("#3a3c44")}</i><i class="fg">${heartSvg("#6aa3b4")}</i></span>`;
      box.innerHTML = html;
      $("#vignette", this.root).classList.toggle("low", hp <= 2 && hp > 0);
      if (this.lastHp >= 0 && hp < this.lastHp) gsap.fromTo(box, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1.2, 0.25)" });
      this.lastHp = hp;
    });
  }

  setClock(text: string, secLeft: number, urgent: boolean, total = 120) {
    this.set("clock", `${text}|${Math.ceil(secLeft)}|${urgent}`, () => {
      const c = $(".h-clock", this.root);
      const [t, ampm] = text.split(" ");
      $(".tm", c).innerHTML = `${t}<small>${ampm ?? ""}</small>`;
      $(".left", c).textContent = `${Math.ceil(secLeft)}s LEFT`;
      const was = c.classList.contains("urgent");
      c.classList.toggle("urgent", urgent);
      if (urgent && !was) gsap.fromTo(c, { scale: 1.2 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
      // The dial fills as the afternoon runs out.
      const f = Math.max(0, Math.min(1, 1 - secLeft / total));
      const a = f * Math.PI * 2;
      const x = 23 + Math.sin(a) * 18, y = 23 - Math.cos(a) * 18;
      ($("path.wedge", c)).setAttribute("d", f <= 0 ? "" : f >= 1 ? "M23 5 A18 18 0 1 1 22.99 5 Z" : `M23 23 L23 5 A18 18 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`);
      ($("path.hand", c)).setAttribute("transform", `rotate(${(f * 360).toFixed(1)} 23 23)`);
    });
  }

  /** Late-afternoon light: 0 = mid-afternoon, 1 = golden hour right before 5 PM. */
  setDusk(frac: number) {
    this.set("dusk", frac.toFixed(2), () => { $("#dusk", this.root).style.opacity = String(Math.max(0, Math.min(1, frac))); });
  }

  setChores(items: { label: string; room: string; done: boolean }[], _optional: string) {
    this.set("chores", JSON.stringify(items), () => {
      const ul = $(".sticky ul", this.root);
      const before = Array.from(ul.querySelectorAll("li")).map((l) => l.classList.contains("done"));
      ul.innerHTML = items.map((i) => `<li class="${i.done ? "done" : ""}"><span class="box"></span><div><div class="t">${esc(i.label)}</div><span class="r">${esc(i.room)}</span></div></li>`).join("");
      ul.querySelectorAll("li").forEach((li, k) => {
        if (items[k]?.done && before[k] === false) gsap.fromTo(li.querySelector(".box"), { scale: 1.8 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
      });
    });
  }

  setQuota(fired: number, quota: number) {
    this.set("quota", `${fired}|${quota}`, () => {
      const q = $(".h-quota", this.root);
      $(".ql span", q).innerHTML = `FIRED <b>${Math.min(fired, quota)}</b> / ${quota}`;
      ($(".bar i", q)).style.width = `${Math.min(100, (fired / quota) * 100)}%`;
      if (fired > 0) gsap.fromTo($(".ql", q), { scale: 1.15 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
    });
  }

  setBoss(name: string | null, frac: number) {
    this.set("boss", `${name}|${frac.toFixed(3)}`, () => {
      const b = $(".h-boss", this.root);
      const wasHidden = b.classList.contains("hidden");
      b.classList.toggle("hidden", !name);
      if (name) {
        $(".bn", b).textContent = name;
        ($(".bar i", b)).style.width = `${Math.max(0, frac) * 100}%`;
        if (wasHidden) gsap.from(b, { y: -40, opacity: 0, duration: 0.45, ease: "power3.out" });
      }
    });
  }

  setWeapons(w: WeaponHud) {
    const active = w.slots.find((s) => s.id === w.active) ?? w.slots[0];
    if (!active) return;
    if (w.armed && this.lastActive && this.lastActive !== active.id) this.switched = true;
    if (w.armed) this.lastActive = active.id;
    const card = $(".w-card", this.root);
    this.set("w-set", `${w.slots.map((s) => s.id).join(",")}|${w.active}|${w.armed}|${this.switched}`, () => {
      card.style.setProperty("--wc", active.color);
      $(".w-icon", card).innerHTML = WEAPON_ICON[active.id] ?? "";
      $(".w-name", card).textContent = active.name;
      const row = $(".w-row", this.root);
      row.innerHTML = w.slots.length > 1 ? w.slots.map((s) => `<div class="w-slot ${s.id === w.active ? "on" : ""}" data-w="${s.id}" style="--wc:${s.color}">${WEAPON_ICON[s.id] ?? ""}</div>`).join("") : "";
      $(".w-hint", this.root).classList.toggle("hidden", w.slots.length < 2 || !w.armed || this.switched);
      if (w.armed) gsap.fromTo($(".w-icon", card), { scale: 0.7 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
    });
    this.set("w-ammo", `${active.text}|${active.frac.toFixed(2)}|${active.warn}`, () => {
      $(".w-ammo", card).textContent = active.text;
      ($(".bar i", card)).style.width = `${Math.max(0, Math.min(1, active.frac)) * 100}%`;
      card.classList.toggle("warn", active.warn);
    });
    this.set("w-dry", w.slots.map((s) => (s.warn ? 1 : 0)).join(""), () => {
      w.slots.forEach((s) => this.root.querySelector(`.w-slot[data-w="${s.id}"]`)?.classList.toggle("dry", s.warn));
    });
  }

  setDodge(charges: number, max: number) {
    this.set("dodge", `${charges}|${max}`, () => {
      let h = "";
      for (let i = 0; i < max; i++) h += `<i class="${i < charges ? "on" : ""}"></i>`;
      $(".dodge .pips", this.root).innerHTML = h;
    });
  }

  /** Owned upgrades show on the review screen, not the HUD (kept as a no-op for the scene). */
  setPerks(_stacks: Record<string, number>, _defs: Record<string, PerkDef>) { /* not shown in play */ }

  setBag(n: number, on: boolean) {
    this.set("bag", `${n}|${on}`, () => {
      const b = $(".bag", this.root);
      b.classList.toggle("hidden", n <= 0);
      b.innerHTML = `PAPER ${n} · <kbd>F</kbd> ${on ? "ON" : "OFF"}`;
    });
  }

  setPrompt(p: { x: number; y: number; label: string; kind: string; progress: number } | null) {
    const el = $("#prompt", this.root);
    if (!p) {
      if (!el.classList.contains("hidden")) el.classList.add("hidden");
      this.cache.delete("prompt");
      return;
    }
    const shown = el.classList.contains("hidden");
    el.classList.remove("hidden");
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.set("prompt", `${p.label}|${p.kind}`, () => {
      el.className = p.kind;
      $(".lbl", el).textContent = p.label;
      if (shown) gsap.fromTo(el, { scale: 0.6 }, { scale: 1, duration: 0.25, ease: "back.out(3)", transformOrigin: "50% 100%" });
    });
    ($("circle.fl", el)).setAttribute("stroke-dashoffset", String(91.1 * (1 - Math.min(1, p.progress))));
  }

  setClockout(visible: boolean, seconds: number) {
    this.set("clockout", `${visible}|${Math.floor(seconds)}`, () => {
      const el = $("#clockout", this.root);
      const was = !el.classList.contains("hidden");
      el.classList.toggle("hidden", !visible);
      el.innerHTML = `All done! <kbd>ENTER</kbd> to clock out early`;
      if (visible && !was) gsap.from(el, { y: 60, opacity: 0, duration: 0.4, ease: "power3.out" });
    });
  }

  setCombo(n: number, word: string) {
    const el = $("#combo", this.root);
    if (n < 2) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    $(".n", el).textContent = `x${n}`;
    $(".w", el).textContent = word;
    gsap.fromTo(el, { scale: 1.4 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
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

  toast(text: string, color = "#e9c25a", life = 2.6) {
    const t = document.createElement("div");
    t.className = "toast";
    t.style.setProperty("--tc", color);
    t.innerHTML = text;
    this.toastBox.appendChild(t);
    while (this.toastBox.children.length > 2) this.toastBox.firstChild!.remove();
    gsap.from(t, { y: -20, opacity: 0, duration: 0.3, ease: "power3.out" });
    gsap.to(t, { opacity: 0, y: -10, duration: 0.3, delay: life, onComplete: () => t.remove() });
  }

  banner(big: string, small = "", color = "#ffffff", dur = 2.2) {
    const el = $("#banner", this.root);
    const b = $(".big", el), s = $(".small", el);
    this.bannerTl?.kill();
    el.classList.remove("hidden");
    b.textContent = big;
    s.textContent = small;
    s.style.display = small ? "" : "none";
    gsap.set([b, s], { clearProps: "all" });
    b.style.color = color;
    this.bannerTl = gsap.timeline({ onComplete: () => el.classList.add("hidden") })
      .fromTo(b, { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" })
      .from(s, { y: 24, opacity: 0, duration: 0.3, ease: "power3.out" }, "-=0.15")
      .to([b, s], { opacity: 0, duration: 0.3, ease: "power2.in" }, `+=${Math.max(0.5, dur - 0.7)}`);
  }

  unlock(name: string, desc: string, weapon?: string, color = "#e9c25a") {
    const el = $("#unlock", this.root);
    this.unlockTl?.kill();
    ($(".u-ico", el)).innerHTML = (weapon && WEAPON_ICON[weapon]) || ICON.lock;
    el.style.setProperty("--uc", color);
    $(".n", el).textContent = name;
    $(".d", el).textContent = desc;
    el.classList.remove("hidden");
    this.unlockTl = gsap.timeline({ onComplete: () => el.classList.add("hidden") })
      .fromTo(el, { x: 460 }, { x: 0, duration: 0.45, ease: "power3.out" })
      .to(el, { x: 480, duration: 0.4, ease: "power3.in" }, "+=3");
  }

  flash(color = "#ffffff", ms = 160, opacity = 0.7) {
    const f = $("#flash", this.root);
    gsap.killTweensOf(f);
    f.style.background = color;
    gsap.fromTo(f, { opacity }, { opacity: 0, duration: ms / 1000, ease: "power2.out" });
  }

  // ================================================================ minimap
  initMinimap(map: OfficeMap, world: World) {
    const W = 220, H = 165;
    const scale = Math.min(W / MAP_W, H / MAP_H);
    const base = this.mm.base;
    base.width = W;
    base.height = H;
    const ctx = base.getContext("2d")!;
    ctx.fillStyle = "#26282e";
    ctx.fillRect(0, 0, W, H);
    const ox = (W - MAP_W * scale) / 2, oy = (H - MAP_H * scale) / 2;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = world.tile(x, y);
      if (t === 0 || t === 3 || t === 4) continue;
      ctx.fillStyle = t === 1 ? "#e6dfcf" : t === 2 ? "#b4d3dc" : "#8b8578";
      ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
    }
    ctx.fillStyle = "rgba(28,29,33,.18)";
    for (const f of map.furniture) {
      if (f.floor) continue;
      ctx.fillRect(ox + (f.x / TILE) * scale - 1.5, oy + (f.y / TILE) * scale - 1.5, 3, 3);
    }
    Object.assign(this.mm, { scale, ox, oy });
  }

  drawMinimap(dots: { x: number; y: number; color: string; r: number }[]) {
    const { ctx, base, scale, ox, oy } = this.mm;
    ctx.drawImage(base, 0, 0);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#1c1d21";
    for (const d of dots) {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(ox + (d.x / TILE) * scale, oy + (d.y / TILE) * scale, d.r + 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ================================================================ screens
  /** Builds a menu. It slides up and ignores clicks for a moment, so nothing gets picked by accident. */
  private screen(id: string, cls: string, html: string): HTMLElement {
    this.closeScreen(id);
    const el = document.createElement("div");
    el.id = id;
    el.className = `screen guard ${cls}`;
    el.innerHTML = html;
    $("#screens", this.root).appendChild(el);
    this.juice(el);
    gsap.delayedCall(MENU_GUARD, () => el.classList.remove("guard"));
    return el;
  }

  private guarded(el: HTMLElement) {
    return el.classList.contains("guard");
  }

  closeScreen(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === "review") this.reviewKey = "";
    if (id === "title") { for (const t of this.titleTweens) t.kill(); this.titleTweens = []; }
    if (id === "intro") this.introDispose?.();
    gsap.killTweensOf(el.querySelectorAll("*"));
    el.remove();
  }

  showTitle(best: string, h: { play: () => void; tutorial: () => void }) {
    const el = this.screen("title", "", `
      <div class="bg-grid"></div>
      ${FLOATIES.map((svg) => `<div class="floaty">${svg}</div>`).join("")}
      <div class="t-wrap">
        <img class="t-logo-img" src="${asset("assets/ui/logo.png")}" alt="Rather Die Than Get Fired" draggable="false">
        <div class="t-btns">
          <button class="btn big" id="start">CLOCK IN</button>
          <button class="btn big ghost" id="tutorial">TUTORIAL</button>
        </div>
        ${best ? `<div class="t-best">${esc(best)}</div>` : ""}
      </div>
      <div class="t-keys"><span><kbd>WASD</kbd> move</span><span><kbd>CLICK</kbd> shoot</span><span><kbd>SPACE</kbd> dodge</span><span><kbd>E</kbd> interact</span><span><kbd>ESC</kbd> pause</span></div>
      <div class="t-credit">NASCON '26 · art &amp; sound: Kenney (CC0)</div>`);
    $("#start", el).addEventListener("click", () => { if (!this.guarded(el)) h.play(); });
    $("#tutorial", el).addEventListener("click", () => { if (!this.guarded(el)) { resetIntros(); h.tutorial(); } });

    const logo = $(".t-logo-img", el);
    const intro = () => {
      gsap.fromTo(logo, { y: -140, scale: 0.7, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.8, ease: "back.out(1.6)" });
      // The flame breathes.
      this.titleTweens.push(gsap.to(logo, { scale: 1.025, rotation: 0.8, duration: 1.4, delay: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "50% 80%" }));
      this.slideUp(el.querySelectorAll(".t-btns .btn, .t-best, .t-keys"), 0.35);
    };
    if (document.getElementById("boot")) {
      gsap.set(logo, { opacity: 0 });
      this.afterBoot.push(intro);
    } else intro();
    // Office junk drifting around in the background.
    el.querySelectorAll<HTMLElement>(".floaty").forEach((f, i) => {
      const left = i % 2 === 0;
      gsap.set(f, { left: `${left ? gsap.utils.random(3, 20) : gsap.utils.random(78, 92)}%`, top: `${gsap.utils.random(8, 78)}%`, rotation: gsap.utils.random(-30, 30), scale: gsap.utils.random(0.7, 1.1) });
      this.titleTweens.push(gsap.to(f, { y: gsap.utils.random(-40, 40), x: gsap.utils.random(-30, 30), rotation: `+=${gsap.utils.random(-40, 40)}`, duration: gsap.utils.random(3, 5), yoyo: true, repeat: -1, ease: "sine.inOut" }));
    });
  }

  /** Shows a phase's rules once (ever), then runs `then`. Already seen: runs it right away. */
  brief(id: IntroId, then: () => void): boolean {
    if (introSeen(id)) { then(); return false; }
    this.showIntroCard(id, () => { markIntro(id); then(); }, false);
    return true;
  }

  /** Read-only rules viewer with tabs (from the pause menu). */
  showHowTo(onClose: () => void) {
    this.showIntroCard("crunch", onClose, true);
  }

  private showIntroCard(id: IntroId, done: () => void, tabs: boolean) {
    this.introDispose?.();
    const d = INTROS[id];
    const el = this.screen("intro", "", `
      <div class="i-card clickable" style="--accent:${d.accent}">
        <div class="i-head ${d.dark ? "dark" : ""}">
          ${tabs ? `<div class="i-tabs">${(Object.keys(INTROS) as IntroId[]).map((k, i) => `<button data-t="${k}" class="${k === id ? "on" : ""}">${i + 1}</button>`).join("")}</div>` : ""}
          <span class="kicker">${d.kicker}</span><h2>${d.title}</h2><div class="sub">${d.sub}</div></div>
        <ol class="i-steps">${d.steps.map((s, i) => `<li class="i-step"><span class="i-num">${i + 1}</span><div class="i-art">${s.art}</div><div><b>${s.title}</b><p>${s.text}</p></div></li>`).join("")}</ol>
        <div class="i-foot"><span></span><button class="btn big red" id="i-go">${tabs ? "CLOSE" : d.go} <kbd>SPACE</kbd></button></div>
      </div>`);
    const card = $(".i-card", el);
    this.slideUp([card]);
    let closed = false;
    const close = (instant = false) => {
      if (closed) return;
      closed = true;
      this.briefClose = null;
      this.introDispose = null;
      document.removeEventListener("keydown", onKey, true);
      if (instant) { this.closeScreen("intro"); done(); return; }
      gsap.to(card, { y: 120, opacity: 0, duration: 0.22, ease: "power2.in", onComplete: () => { this.closeScreen("intro"); done(); } });
    };
    this.briefClose = () => close(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || (tabs && e.code === "Escape")) {
        e.preventDefault();
        e.stopPropagation();
        if (this.guarded(el) || e.repeat) return;
        this.sfx?.("click");
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    this.introDispose = () => {
      closed = true;
      this.briefClose = null;
      this.introDispose = null;
      document.removeEventListener("keydown", onKey, true);
    };
    $("#i-go", el).addEventListener("click", () => { if (!this.guarded(el)) close(); });
    el.querySelectorAll<HTMLElement>(".i-tabs button").forEach((b) => b.addEventListener("click", () => {
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      this.showIntroCard(b.dataset.t as IntroId, done, true);
    }));
  }

  // ---------------------------------------------------------------- Performance Review: upgrades front and centre
  showReview(d: ReviewData, h: { buy: (i: number) => void; buyGun: (i: number) => void; heal: () => void; reroll: () => void; go: () => void }) {
    const key = d.offers.map((o) => o.perk.id).join(",") + "|" + d.guns.map((g) => g.id).join(",");
    const existing = document.getElementById("review");
    if (existing && this.reviewKey === key) {
      this.patchReview(existing, d);
      return;
    }
    const firstShow = !existing;
    this.reviewKey = key;
    const el = this.screen("review", "dim", `
      <div class="rv clickable">
        <div class="rv-top">
          <h2 class="rv-title">PERFORMANCE REVIEW</h2>
          <div class="rv-bank">${ICON.clock}<b>0s</b></div>
        </div>
        <div class="cards">${d.offers.map((o, i) => this.cardHtml(o.perk, o.stacks, i, { cost: o.perk.cost })).join("")}</div>
        ${d.guns.length ? `<div class="guns">${d.guns.map((g, i) => this.gunHtml(g, i)).join("")}</div>` : ""}
        <div class="rv-foot">
          <div class="left">
            <button class="btn ghost small" id="heal">HEAL <small>${d.healCost}s</small></button>
            <button class="btn ghost small" id="reroll">NEW OFFERS <small>${d.rerollCost}s</small></button>
          </div>
          <button class="btn big red" id="go">BACK TO WORK</button>
        </div>
      </div>`);
    const tryBuy = (c: HTMLElement, fn: () => void) => {
      if (this.guarded(el)) return;
      if (c.classList.contains("poor")) { gsap.fromTo(c, { x: -8 }, { x: 0, duration: 0.4, ease: "elastic.out(1.3, 0.25)" }); return; }
      if (c.classList.contains("buyable")) fn();
    };
    el.querySelectorAll<HTMLElement>(".card").forEach((c) => {
      this.lift(c);
      c.addEventListener("click", () => tryBuy(c, () => h.buy(Number(c.dataset.i))));
    });
    el.querySelectorAll<HTMLElement>(".gun").forEach((g) => {
      this.lift(g);
      g.addEventListener("click", () => tryBuy(g, () => h.buyGun(Number(g.dataset.g))));
    });
    $("#heal", el).addEventListener("click", () => { if (!this.guarded(el)) h.heal(); });
    $("#reroll", el).addEventListener("click", () => { if (!this.guarded(el)) h.reroll(); });
    $("#go", el).addEventListener("click", () => { if (!this.guarded(el)) h.go(); });
    const bankEl = $(".rv-bank b", el);
    if (firstShow) {
      this.slideUp(el.querySelectorAll(".rv-top, .card, .gun, .rv-foot"));
      this.countUp(bankEl, Math.floor(d.bank), (v) => `${v}s`, 0, 0.8, 0.2);
    } else {
      bankEl.textContent = `${Math.floor(d.bank)}s`;
      this.slideUp(el.querySelectorAll(".card"));
    }
    this.patchReview(el, d, true);
  }

  /** Updates prices/affordability in place so buying doesn't re-deal the whole table. */
  private patchReview(el: HTMLElement, d: ReviewData, quiet = false) {
    const bankEl = $(".rv-bank b", el);
    const prev = parseInt(bankEl.textContent ?? "0", 10);
    if (!quiet && prev !== Math.floor(d.bank)) {
      this.countUp(bankEl, Math.floor(d.bank), (v) => `${v}s`, prev, 0.4);
      gsap.fromTo($(".rv-bank", el), { scale: 0.9 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
    }
    const stamp = (c: HTMLElement, text: string) => {
      const st = document.createElement("div");
      st.className = "stamp";
      st.textContent = text;
      c.appendChild(st);
      gsap.fromTo(st, { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "power3.in" });
      this.sfx?.("stamp");
    };
    d.offers.forEach((o, i) => {
      const c = el.querySelector<HTMLElement>(`.card[data-i="${i}"]`);
      if (!c) return;
      const afford = d.bank >= o.perk.cost;
      const wasSold = c.classList.contains("sold");
      c.classList.toggle("sold", o.sold);
      c.classList.toggle("buyable", !o.sold && afford);
      c.classList.toggle("poor", !o.sold && !afford);
      const own = $(".c-own", c);
      if (own) own.textContent = o.stacks > 0 ? `${o.stacks}/${o.perk.max}` : "";
      if (o.sold && !wasSold) stamp(c, "HIRED");
    });
    d.guns.forEach((g, i) => {
      const c = el.querySelector<HTMLElement>(`.gun[data-g="${i}"]`);
      if (!c) return;
      const wasSold = c.classList.contains("sold");
      c.classList.toggle("sold", g.sold);
      c.classList.toggle("locked", g.locked);
      c.classList.toggle("buyable", !g.sold && !g.locked && d.bank >= g.cost);
      c.classList.toggle("poor", !g.sold && !g.locked && d.bank < g.cost);
      if (g.sold && !wasSold) stamp(c, "YOURS");
    });
    ($("#heal", el) as HTMLButtonElement).disabled = !(d.canHeal && d.bank >= d.healCost);
    ($("#reroll", el) as HTMLButtonElement).disabled = d.bank < d.rerollCost;
  }

  private cardHtml(p: PerkDef, stacks: number, i: number, o: { cost?: number; free?: boolean }) {
    const rc = RARITY_COLOR[p.rarity];
    return `<div class="card" data-i="${i}" style="--rc:${rc}">
      <div class="c-band">${p.rarity.toUpperCase()}</div>
      <div class="c-logo">${perkLogo(p.icon, rc)}</div>
      <h4>${esc(p.name)}</h4>
      <p>${esc(p.desc)}</p>
      <div class="c-foot">${o.free ? `<span class="c-cost free">FREE</span>` : `<span class="c-cost">${ICON.clock}${o.cost}s</span>`}<span class="c-own">${stacks > 0 ? `${stacks}/${p.max}` : ""}</span></div>
    </div>`;
  }

  private gunHtml(g: GunOffer, i: number) {
    return `<div class="gun" data-g="${i}" style="--wc:${g.color}">
      <div class="g-ico">${WEAPON_ICON[g.id] ?? ""}</div>
      <div class="g-txt"><h4>${esc(g.name)}</h4><p>${esc(g.desc)}</p></div>
      <div class="g-cost">${ICON.clock}${g.cost}s</div>
    </div>`;
  }

  showAnnounce(onSkip: () => void): (i: number, text: string, cls?: string) => void {
    const el = this.screen("announce", "", `<div class="lines">
      <div class="ln"></div><div class="ln"></div><div class="ln red"></div><div class="ln huge"></div></div>
      <div class="skip">CLICK OR PRESS SPACE TO SKIP</div>`);
    el.addEventListener("click", () => { if (!this.guarded(el)) onSkip(); });
    this.slideUp([$(".lines", el)]);
    const lines = Array.from(el.querySelectorAll<HTMLElement>(".ln"));
    return (i, text, cls) => {
      const ln = lines[i];
      if (!ln) return;
      ln.innerHTML = text;
      if (cls) ln.className = `ln ${cls}`;
    };
  }

  // ---------------------------------------------------------------- end of day: three big free picks
  showResults(d: { day: number; grade: string; gradeColor: string; title: string; stats: [string, string][] }, picks: PerkDef[], stacks: Record<string, number>, onPick: (i: number) => void) {
    const starCount = ({ S: 3, A: 3, B: 2, C: 1, D: 0 } as Record<string, number>)[d.grade] ?? 1;
    const star = asset("assets/ui/star.png"), empty = asset("assets/ui/star_empty.png");
    const el = this.screen("results", "dim", `
      <div class="rs clickable">
        <div class="rs-head">
          <h2 class="rs-title">DAY ${d.day} SURVIVED</h2>
          <div class="rs-stars">${[0, 1, 2].map((i) => `<img src="${i < starCount ? star : empty}" alt="">`).join("")}</div>
        </div>
        <div class="rs-label">PICK ONE</div>
        <div class="cards">${picks.map((p, i) => this.cardHtml(p, stacks[p.id] ?? 0, i, { free: true })).join("")}</div>
      </div>`);
    gsap.from(el.querySelectorAll(".rs-stars img"), { scale: 0, duration: 0.4, delay: 0.3, stagger: 0.12, ease: "back.out(3)" });
    const cards = Array.from(el.querySelectorAll<HTMLElement>(".card"));
    this.slideUp([...el.querySelectorAll(".rs-head, .rs-label"), ...cards]);
    cards.forEach((c) => {
      c.classList.add("buyable");
      this.lift(c);
      c.addEventListener("click", () => {
        if (el.dataset.done || this.guarded(el)) return;
        el.dataset.done = "1";
        const st = document.createElement("div");
        st.className = "stamp";
        st.textContent = "MINE";
        c.appendChild(st);
        this.sfx?.("stamp");
        gsap.fromTo(st, { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "power3.in" });
        cards.forEach((o) => { if (o !== c) gsap.to(o, { y: 120, opacity: 0, duration: 0.3, ease: "power2.in" }); });
        gsap.to(c, { y: -20, duration: 0.35, delay: 0.25, ease: "power3.out", onComplete: () => onPick(Number(c.dataset.i)) });
      });
    });
  }

  showGameOver(d: { lines: [string, string][]; best: string; newBest: boolean }, onRestart: () => void, onTitle: () => void) {
    const el = this.screen("gameover", "", `
      <div class="go clickable">
        <div class="slip"><h5>NOTICE OF TERMINATION</h5>${d.lines.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}<div class="stamp">FIRED</div></div>
        ${d.newBest ? `<div class="go-best">NEW PERSONAL BEST!</div>` : ""}
        <div class="go-btns">
          <button class="btn big" id="again">TRY AGAIN</button>
          <button class="btn big ghost" id="totitle">MAIN MENU</button>
        </div>
      </div>`);
    this.slideUp(el.querySelectorAll(".slip, .go-best, .go-btns"));
    gsap.fromTo($(".slip .stamp", el), { scale: 3.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, delay: 0.6, ease: "power4.in", onComplete: () => this.sfx?.("stamp") });
    $("#again", el).addEventListener("click", () => { if (!this.guarded(el)) onRestart(); });
    $("#totitle", el).addEventListener("click", () => { if (!this.guarded(el)) onTitle(); });
  }

  showPause(state: { music: number; sfx: number; muted: boolean }, h: { resume: () => void; music: (v: number) => void; sfx: (v: number) => void; mute: () => void; howto: () => void; quit: () => void }) {
    const el = this.screen("pause", "dim", `
      <div class="pz clickable">
        <h2 class="big-title">PAUSED</h2>
        <button class="btn big red" id="resume">RESUME</button>
        <label class="vol">MUSIC <input type="range" id="mv" min="0" max="1" step="0.05" value="${state.music}"></label>
        <label class="vol">SOUND <input type="range" id="sv" min="0" max="1" step="0.05" value="${state.sfx}"></label>
        <div class="row">
          <button class="btn small ghost" id="howto">HOW TO PLAY</button>
          <button class="btn small ghost" id="mute">${state.muted ? "UNMUTE" : "MUTE"}</button>
          <button class="btn small ghost" id="quit">QUIT</button>
        </div>
      </div>`);
    this.slideUp([$(".pz", el)]);
    $("#resume", el).addEventListener("click", () => { if (!this.guarded(el)) h.resume(); });
    $("#mute", el).addEventListener("click", () => { if (!this.guarded(el)) h.mute(); });
    $("#howto", el).addEventListener("click", () => { if (!this.guarded(el)) h.howto(); });
    $("#quit", el).addEventListener("click", () => { if (!this.guarded(el)) h.quit(); });
    const paint = (i: HTMLInputElement) => i.style.setProperty("--v", `${Number(i.value) * 100}%`);
    const mv = $("#mv", el) as HTMLInputElement, sv = $("#sv", el) as HTMLInputElement;
    paint(mv); paint(sv);
    mv.addEventListener("input", () => { paint(mv); h.music(Number(mv.value)); });
    sv.addEventListener("input", () => { paint(sv); h.sfx(Number(sv.value)); });
  }
}
