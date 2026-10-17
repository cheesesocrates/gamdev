# Changelog

Every change to the game goes here, newest first. **When you open a pull request, add a line under
"Unreleased"** (what changed, from the player's point of view, plus the area: Gameplay / World / UI / Audio / Fix).
When a batch ships, the Unreleased lines move under a new version heading with the date.

## Unreleased

- _Nothing yet. Add your line here._

## 0.3.0 — 2026-10-17 — "Rather Die Than Get Fired"

### Identity and look
- Renamed the game **Rather Die Than Get Fired**. The team's hand-made logo (upscaled 3x with anti-aliasing) is on
  the loading screen, the title screen and the browser tab icon.
- New office-at-night palette: toner black, copy paper, manila folders, rubber-stamp red, ballpoint navy, cubicle teal.
  No more neon or pink, and no outlined text anywhere.
- One pixel typeface everywhere, in menus and in the game world: **Jersey 10** (SIL Open Font License).
- Every menu slides up and ignores clicks and keys for half a second, so a stray click can't buy or skip anything.

### Simpler screens
- Each phase shows a short rules card the first time only (Crunch Time, Performance Review, The Downsizing).
  **TUTORIAL** on the title screen and **How to play** in the pause menu show them again.
- The HUD only shows what the current phase needs. Crunch Time: the clock and the to-do note. The fight: hearts,
  the firing quota, the map, your weapon and dodge charges.
- **Performance Review** is just the upgrades: your Overtime, three big upgrade cards, two guns (buy one), Heal,
  New offers and Back to work.
- **End of day** is just the stars and three big free picks.
- Every one of the 68 upgrades has its own logo; every weapon has an icon.
- Pause menu with music and sound sliders. Game over is a pink-slip "Notice of Termination".

### Crunch Time
- 120 seconds. Day 1 has three chores; the load grows every other day.
- Every chore is its own mini-game that looks like the job: water a plant that won't sit still, line a page up on the
  copier (zoomed in), feed the shredder, tighten the coffee machine's leaks, stop the deck on the GROWTH slide, sign
  layoff memos, patch server cables, type a reply-all.
- Chores open the moment you press **E** (no holding).
- Crunch Time is only chores now. Water coolers and power strips spawn in new places every day.
- Clocking out early banks half of the time left as Overtime (upgrades are meant to be scarce).

### The Downsizing
- Traps go off the instant you press **E**: kick a cooler, overload a power strip, clog a toilet, or arm a copier
  (3-second fuse). Vending machines, the fridge, the supply closet and the arcade work the same way.
- Barricades removed.
- When the sprinklers trip, small random patches of the office flood.
- Desks, tables and boxes can be shoved. Dodge-roll into one and it flies, bowling coworkers over.
- New, bigger office with distinct rooms, halls and a server core. Interior walls are drywall: bosses and big
  explosions smash through. Everything is repaired overnight.
- Some coworkers wait in their rooms and ambush you together.
- Traps, fire and explosions never hurt you.

### Weapons
- Nine weapons: Stapler, Hot Coffee, Laser Pointer, Paper Planes, Toner Bomb, Confetti Cannon, Plant Mister,
  Keyboard (melee that swats bullets back) and Pink Slips.
- Guns are bought at the Performance Review: two on offer each day, buy one, each at its own price (20s to 36s).
  A gun you just bought is in your hand when the fight starts.
- The stapler fires once per click. The mouse wheel switches one weapon per notch.

### Coworkers
- Runners hide behind desks when you can see them and rush you when you're close, reloading or looking away.
- Shooters keep their distance instead of charging.
- HR riot shields block shots from the front. Slip them in water, bonk them with the keyboard, or bounce a shot off a
  wall for a trick shot.

### Upgrades
- 14 new game-changing upgrades: Corner Office, Wet Floor Sign, Sticky Notes, Cubicle Ninja, Desk Jockey, Golden
  Handshake, Blame Game, Office Romance, Black Hole Binder, Chain of Command, Hostile Work Environment, plus the
  end-of-day picks Live Wire, Fire Drill and Plus One.
- Removed the barricade and sabotage-speed upgrades.
- The shop offers three upgrades at a markup, one of them always epic or better. End-of-day picks are chore-stage only.

### Fixes
- **E had to be pressed twice** to interact after finishing a mini-game (the game thought E was still held). Fixed.
- A replaced rules card could restart Crunch Time when Space was pressed. Fixed.
- Copier explosions and fire could hurt the player. Fixed.

### Performance
- Water is stamped into a half-resolution layer and only changed tiles are repainted (hazards: ~44 ms to ~1-6 ms at
  peak in the stress test).
- HUD updates throttled to ~16 per second; pathfinding fields computed one per tick; one shared graphic for all
  health bars; particles skipped off-screen; full-screen blend modes and animated box-shadows removed.

### Tools
- `tools/playtest.mjs` scenarios: `full`, `combat`, `minis`, `stress`, `props`, `epress`.

## 0.2.0 — 2026-10-16

- Chore mini-games, scaling chore load, merged water and paper visuals, player-safe hazards, ambushers, upgrade rework.

## 0.1.0 — 2026-10-16

- First playable build (Phaser 3 + TypeScript + Vite): Crunch Time, Performance Review, The Downsizing, waves, bosses,
  upgrades, Kenney placeholder art, the team's lobby and fight music.
