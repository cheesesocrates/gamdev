import gsap from "gsap";
import "./cheats.css";
import { PERKS, PERK_BY_ID, PerkDef, RARITY_COLOR } from "../data/perks";
import { WEAPONS, WEAPON_DEFS, WeaponId } from "../data/weapons";
import { GameState } from "../systems/GameState";
import { ICON, WEAPON_ICON, heartSvg } from "./icons";
import { perkSketch } from "./perkIcons";
import type { UI } from "./UI";

/** Up up down down left right left right B A. */
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
/** A key matches a step by its physical position (e.code) or by what it types (e.key), so any keyboard layout works. */
const isStep = (e: KeyboardEvent, step: string) => e.code === step || e.key === step || (step.startsWith("Key") && e.key.toLowerCase() === step.slice(3).toLowerCase());
/** A freshly opened cheat sheet ignores clicks this long (ms), so a stray click can't change anything. */
const GUARD_MS = 350;

type Filter = "all" | "common" | "rare" | "epic" | "legendary" | "chore" | "owned";
/** Quick filters above the upgrade list: id, label, swatch colour. */
const FILTERS: [Filter, string, string?][] = [
  ["all", "ALL"],
  ["common", "COMMON", RARITY_COLOR.common],
  ["rare", "RARE", RARITY_COLOR.rare],
  ["epic", "EPIC", RARITY_COLOR.epic],
  ["legendary", "LEGENDARY", RARITY_COLOR.legendary],
  ["chore", "CHORE", "#f2d061"],
  ["owned", "OWNED", "#4b9a63"]
];

const K = "#1c1d21";
/** A halo over a shield: nothing gets through. */
const HALO_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="13" rx="17" ry="6.5" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="32" cy="13" rx="17" ry="6.5" fill="none" stroke="#e9c25a" stroke-width="3.5"/><path d="M32 24 L50 31 V41 C50 50 42 56 32 60 C22 56 14 50 14 41 V31 Z" fill="#2f4f8f" stroke="${K}" stroke-width="4" stroke-linejoin="round"/><path d="M32 31 V53 M22 40 H42" stroke="#cfe0ff" stroke-width="3" stroke-linecap="round"/></svg>`;
const SEARCH_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="#fff" stroke="${K}" stroke-width="3"/><path d="M15 15 L21 21" stroke="${K}" stroke-width="3.5" stroke-linecap="round"/></svg>`;
const MINUS_SVG = `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7 H12" stroke="${K}" stroke-width="3"/></svg>`;
const PLUS_SVG = `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7 H12 M7 2 V12" stroke="${K}" stroke-width="3"/></svg>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode) => root.querySelector(sel) as T;

export interface CheatHooks {
  /** Whether the player currently can't take damage. */
  god: () => boolean;
  setGod: (on: boolean) => void;
  /** Runs right after the sheet closes (the scene re-renders the review). */
  onClose: () => void;
}

/** Closes the cheat sheet that's up (null when there isn't one). */
let closeOpen: (() => void) | null = null;

/**
 * Counts the Konami code on window keydowns while `armed()` holds and the review is on screen,
 * then calls `onCode`. Anywhere else it's a no-op. Returns the unbind.
 */
export function bindKonami(armed: () => boolean, onCode: () => void): () => void {
  let step = 0;
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || /^(Shift|Control|Alt|Meta)/.test(e.code)) return;
    if (closeOpen || !armed() || !document.getElementById("review")) { step = 0; return; }
    if (isStep(e, KONAMI[step])) step++;
    // A wrong key starts over, unless it's Up: that begins the code again (and Up Up Up still counts).
    else step = isStep(e, KONAMI[0]) ? (step === 2 ? 2 : 1) : 0;
    if (step < KONAMI.length) return;
    step = 0;
    // The final key belongs to the sheet, not the game.
    e.preventDefault();
    e.stopPropagation();
    onCode();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

const chipHtml = ([f, label, color]: [Filter, string, string?]) =>
  `<button class="ch-chip${f === "all" ? " on" : ""}" data-act="filter" data-f="${f}"${color ? ` style="--rc:${color}"` : ""}>${color ? "<i></i>" : ""}${label}</button>`;

const gunHtml = (id: WeaponId) => {
  const w = WEAPON_DEFS[id];
  return `<button class="ch-gun" data-act="gun" data-w="${id}" role="switch" aria-checked="false" style="--wc:${w.color}">
      <span class="ch-gi">${WEAPON_ICON[id] ?? ""}</span>
      <span class="ch-gt"><b>${esc(w.name)}</b><small>${esc(w.desc)}</small></span>
      <span class="ch-own"><i></i><em>OWNED</em></span>
    </button>`;
};

const perkHtml = (p: PerkDef) => `<div class="ch-perk r-${p.rarity}" data-id="${p.id}" style="--rc:${RARITY_COLOR[p.rarity]}">
      <div class="ch-logo">${perkSketch(p.icon)}</div>
      <div class="ch-nm"><b>${esc(p.name)}</b><span class="ch-rar">${p.rarity.toUpperCase()}</span></div>
      <p>${esc(p.desc)}</p>
      <div class="ch-ft">
        <span class="ch-tags">${p.stage === "chore" ? `<i class="ch-tag chore">stage: chore</i>` : ""}${p.requires ? `<i class="ch-tag need">needs ${esc(WEAPON_DEFS[p.requires].name)}</i>` : ""}${p.days ? `<i class="ch-tag days">${p.days} fights</i>` : ""}<i class="ch-tag lock hidden">${ICON.lock}<span></span></i></span>
        <span class="ch-ctl"><button class="ch-step dec" data-act="dec" aria-label="Remove one ${esc(p.name)}">${MINUS_SVG}</button><b class="ch-n"></b><button class="ch-step inc" data-act="inc" aria-label="Add one ${esc(p.name)}">${PLUS_SVG}</button></span>
      </div>
    </div>`;

/**
 * The cheat sheet over the Performance Review: every upgrade (add or take back stacks), every gun
 * and god mode. Changes go straight into GameState, so they stick for the rest of the run.
 * Returns false when it can't open (one is already up, or the review isn't on screen).
 */
export function showCheats(ui: UI, h: CheatHooks): boolean {
  const host = ui.root.querySelector<HTMLElement>("#screens");
  const review = document.getElementById("review");
  if (closeOpen || !host || !review) return false;
  const sfx = (s: Parameters<NonNullable<UI["sfx"]>>[0]) => ui.sfx?.(s);
  const guns: WeaponId[] = WEAPONS.filter((w) => w !== "stapler");

  const root = document.createElement("div");
  root.id = "cheats";
  root.tabIndex = -1;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Cheat sheet");
  root.innerHTML = `
    <div class="ch-panel">
      <div class="ch-tab">CONFIDENTIAL</div>
      <div class="ch-head">
        <div class="ch-title">
          <h2>CHEAT SHEET <span class="ch-stamp">OFF THE BOOKS</span></h2>
          <p>Anything you sign here sticks for the rest of the run.</p>
        </div>
        <button class="ch-god" data-act="god" role="switch" aria-checked="false">
          <span class="ch-hal">${HALO_SVG}</span>
          <span class="ch-gt"><b>GOD MODE</b><small>You can't take damage</small></span>
          <span class="ch-sw"><i></i><em>OFF</em></span>
        </button>
        <div class="ch-stat"><span>OVERTIME</span><b>${ICON.clock}<em class="ch-bank"></em></b></div>
        <div class="ch-stat"><span>HEARTS</span><b>${heartSvg("#c4382c")}<em class="ch-hp"></em></b></div>
        <button class="btn small ghost ch-close" data-act="close">CLOSE <kbd>ESC</kbd></button>
      </div>
      <div class="ch-body">
        <section class="ch-col ch-side">
          <div class="ch-sec">WEAPONS</div>
          <div class="ch-sheet ch-guns">${guns.map(gunHtml).join("")}<p class="ch-note">The stapler is always yours.</p></div>
        </section>
        <section class="ch-col">
          <div class="ch-sec">UPGRADES</div>
          <div class="ch-sheet ch-up">
            <div class="ch-bar">
              <div class="ch-chips">${FILTERS.map(chipHtml).join("")}</div>
              <label class="ch-search">${SEARCH_SVG}<input type="text" placeholder="Search upgrades..." spellcheck="false" autocomplete="off" aria-label="Search upgrades"></label>
              <span class="ch-count"></span>
            </div>
            <div class="ch-list"><div class="ch-empty hidden">Nothing in the handbook matches that.</div>${PERKS.map(perkHtml).join("")}</div>
          </div>
        </section>
      </div>
    </div>`;
  host.appendChild(root);
  // The review underneath can't be clicked, tabbed to or typed into while the sheet is up.
  review.inert = true;

  const openedAt = performance.now();
  const ac = new AbortController();
  const on = { signal: ac.signal };
  /** Every tween the sheet starts, so closing it stops them all. */
  const anims = gsap.context(() => {});
  const panel = $(".ch-panel", root), list = $(".ch-list", root), god = $(".ch-god", root);
  const search = $<HTMLInputElement>(".ch-search input", root);
  const rows = new Map<string, HTMLElement>();
  list.querySelectorAll<HTMLElement>(".ch-perk").forEach((r) => rows.set(r.dataset.id ?? "", r));
  /** What the search box matches against, per upgrade. */
  const hay = new Map(PERKS.map((p) => [p.id, [p.name, p.desc, p.id, p.rarity, p.stage === "chore" ? "stage chore" : "", p.requires ? `needs ${WEAPON_DEFS[p.requires].name} ${p.requires}` : ""].join(" ").toLowerCase()]));
  let filter: Filter = "all";
  /** A press that started and ended on the dim backdrop (not a drag into or out of the panel). */
  let backdropPress = false;

  const pop = (el: Element | null, from = 1.45) => {
    if (el) anims.add(() => { gsap.fromTo(el, { scale: from }, { scale: 1, duration: 0.3, ease: "back.out(3)", overwrite: true }); });
  };
  const paintStats = () => {
    $(".ch-bank", root).textContent = `${Math.floor(GameState.bank)}s`;
    $(".ch-hp", root).textContent = `${GameState.hp / 2}/${GameState.stats.maxHp / 2}`;
  };
  const paintPerk = (p: PerkDef) => {
    const row = rows.get(p.id);
    if (!row) return;
    const lock = GameState.lockedBy(p);
    const n = GameState.stack(p.id), can = GameState.canTake(p) && !lock;
    row.classList.toggle("own", n > 0);
    row.classList.toggle("max", !can);
    // Locked out by an upgrade you own (Open-Plan Office makes Desk Jockey's dodge-roll shoves impossible).
    const tag = row.querySelector<HTMLElement>(".ch-tag.lock")!;
    tag.classList.toggle("hidden", !lock);
    if (lock) $("span", tag).textContent = `locked by ${lock.name}`;
    $(".ch-n", row).textContent = `${n}/${p.max}`;
    $<HTMLButtonElement>(".dec", row).disabled = n <= 0;
    $<HTMLButtonElement>(".inc", row).disabled = !can;
    if (p.requires) row.querySelector(".need")?.classList.toggle("ok", !!GameState.unlocked[p.requires]);
  };
  const paintGun = (id: WeaponId) => {
    const b = root.querySelector<HTMLElement>(`.ch-gun[data-w="${id}"]`);
    if (!b) return;
    const own = !!GameState.unlocked[id];
    b.classList.toggle("on", own);
    b.setAttribute("aria-checked", String(own));
  };
  const paintGod = () => {
    const v = h.god();
    god.classList.toggle("on", v);
    god.setAttribute("aria-checked", String(v));
    $(".ch-sw em", god).textContent = v ? "ON" : "OFF";
  };
  /** Shows the upgrades that pass the chip filter and contain every word typed in the search box. */
  const applyFilter = () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const p of PERKS) {
      const row = rows.get(p.id);
      if (!row) continue;
      const pass = filter === "all" || (filter === "chore" ? p.stage === "chore" : filter === "owned" ? GameState.stack(p.id) > 0 : p.rarity === filter);
      const vis = pass && words.every((w) => hay.get(p.id)!.includes(w));
      row.classList.toggle("hidden", !vis);
      if (vis) shown++;
    }
    $(".ch-count", root).textContent = `${shown} / ${PERKS.length}`;
    $(".ch-empty", root).classList.toggle("hidden", shown > 0);
  };

  const stepPerk = (row: HTMLElement, dir: 1 | -1) => {
    const p = PERK_BY_ID[row.dataset.id ?? ""];
    if (!p) return;
    const before = GameState.stack(p.id);
    if (dir > 0) GameState.addPerk(p.id);
    else GameState.removePerk(p.id);
    if (GameState.stack(p.id) === before) return;
    sfx("click");
    // Anything it locks (or unlocks) changes too.
    PERKS.forEach(paintPerk);
    paintStats();
    pop($(".ch-n", row));
  };
  const toggleGun = (b: HTMLElement) => {
    const id = b.dataset.w as WeaponId;
    if (!guns.includes(id)) return;
    GameState.unlocked[id] = !GameState.unlocked[id];
    paintGun(id);
    for (const p of PERKS) if (p.requires === id) paintPerk(p);
    sfx(GameState.unlocked[id] ? "stamp" : "click");
    pop($(".ch-own i", b), 1.6);
  };
  const toggleGod = () => {
    h.setGod(!h.god());
    paintGod();
    sfx(h.god() ? "stamp" : "click");
    pop($(".ch-sw", god), 1.25);
  };
  const setFilter = (b: HTMLElement) => {
    filter = (b.dataset.f as Filter | undefined) ?? "all";
    root.querySelectorAll(".ch-chip").forEach((c) => c.classList.toggle("on", c === b));
    applyFilter();
    list.scrollTop = 0;
    sfx("click");
  };

  // Debug jumps can tear the review down underneath: the sheet goes with it.
  const obs = new MutationObserver(() => { if (!review.isConnected || !root.isConnected) close(); });
  const close = () => {
    if (closeOpen !== close) return;
    closeOpen = null;
    ac.abort();
    obs.disconnect();
    anims.kill();
    review.inert = false;
    root.remove();
    h.onClose();
  };
  closeOpen = close;
  obs.observe(host, { childList: true });

  root.addEventListener("pointerdown", (e) => { backdropPress = e.target === root; }, on);
  root.addEventListener("pointerup", (e) => { if (e.target !== root) backdropPress = false; }, on);
  root.addEventListener("click", (e) => {
    if (performance.now() - openedAt < GUARD_MS) return;
    const t = e.target as Element;
    // The dim backdrop closes the sheet.
    if (t === root) {
      if (backdropPress) { sfx("click"); close(); }
      return;
    }
    const b = t.closest<HTMLElement>("[data-act]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const act = b.dataset.act;
    if (act === "close") { sfx("click"); close(); }
    else if (act === "god") toggleGod();
    else if (act === "gun") toggleGun(b);
    else if (act === "filter") setFilter(b);
    else if (act === "inc" || act === "dec") {
      const row = b.closest<HTMLElement>(".ch-perk");
      if (row) stepPerk(row, act === "inc" ? 1 : -1);
    }
  }, on);
  root.addEventListener("pointerover", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (b && !(b as HTMLButtonElement).disabled && !b.contains(e.relatedTarget as Node | null)) sfx("hover");
  }, on);
  search.addEventListener("input", () => { applyFilter(); list.scrollTop = 0; sfx("type"); }, on);
  const onKey = (e: KeyboardEvent) => {
    // Nothing typed here reaches the game underneath (M mutes it, Escape and P pause it, WASD walks).
    e.stopPropagation();
    if (e.type === "keydown" && e.code === "Escape" && !e.repeat) {
      e.preventDefault();
      close();
    }
  };
  root.addEventListener("keydown", onKey, on);
  root.addEventListener("keyup", onKey, on);
  // Keys that land outside the sheet (focus dropped back to the page) are swallowed too.
  const stray = (e: KeyboardEvent) => { if (!root.contains(e.target as Node | null)) onKey(e); };
  window.addEventListener("keydown", stray, { capture: true, signal: ac.signal });
  window.addEventListener("keyup", stray, { capture: true, signal: ac.signal });

  PERKS.forEach(paintPerk);
  guns.forEach(paintGun);
  paintGod();
  paintStats();
  applyFilter();
  anims.add(() => {
    gsap.from(panel, { y: 140, opacity: 0, duration: 0.45, ease: "power3.out", clearProps: "transform,opacity" });
    gsap.fromTo($(".ch-stamp", root), { scale: 3, opacity: 0 }, { scale: 1, opacity: 0.9, duration: 0.26, delay: 0.32, ease: "power4.in", onComplete: () => sfx("stamp") });
  });
  sfx("deal");
  search.focus({ preventScroll: true });
  return true;
}
