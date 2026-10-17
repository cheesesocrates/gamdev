# Changelog

Every change to the game goes here, newest first. **When you open a pull request, add a line under
"Unreleased"** (what changed, from the player's point of view, plus the area: Gameplay / World / UI / Audio / Fix).
When a batch ships, the Unreleased lines move under a new version heading with the date.

## Unreleased

### Playtest feedback batch (branch `run-overhaul-feedback`)
- Fix (World): the Middle Manager (the one who throws three memos) and the Consultant boss showed up as missing
  textures. Their sprites are loaded again; the preload list is now built from the coworker table, so a coworker can't
  lose its art like that again.
- Fix (World): power strips lie flat on the floor. They used to be depth-sorted like desks, so walking just above
  one drew it on top of you and it looked like it was floating.
- World: new art for the kicked-over water cooler (lying on its side with the water gushing out). It is hand-drawn,
  so `tools/render-assets.mjs render` now leaves it alone (`handDrawn` in the spec), and the sprite is re-anchored
  when it swaps in.
- UI: a bought upgrade clipboard is stamped **APPROVED** (not "HIRED"), its price tag disappears and the whole card
  greys out, so it no longer looks like something you can buy again. A bought gun slip loses its price tag too. An
  offer you already have every stack of shows as MAXED.
- Fix (UI): the FIRED x / y bar sometimes stayed one short (e.g. 9 / 10 under "QUOTA MET"): the last firing ended the
  day before the HUD caught up. It now updates on every firing and at the end of the day. When the quota is met but
  the boss is still standing, it says "QUOTA MET: FIRE THE BOSS" instead of looking finished.
- Fix (Gameplay): the Cold Caller's PA line said "Do not pick up the phones", which sounded like something to avoid
  doing. It now says what actually happens: ringing phones blow up, so keep clear of the red rings. A one-time tip
  explains it when the first phone lands (and that a keyboard swing sends one back).

### Story and announcements
- A short intro when you start a run: you're the best employee, and the most expensive, and budget cuts are coming.
- Wall-mounted PA speakers in every room. Management's messages play through them with a chime and a crackle; the
  speakers pulse and throw sound waves and the words are captioned (no synthesised voices).
- 5 PM: the camera finds the nearest speaker for the budget-cuts announcement.
- End of every day: an internal memo says what gets harder tomorrow, e.g. "Due to budget cuts, AI robots will be
  added to divide the workload", a boss visiting, more chores, a bigger quota.

### Crunch Time
- Four new chores (12 in all, up to 7 a day): **Unjam the Printer** (alternate A/D; same side twice rips the page),
  **Reset the Wi-Fi** (repeat the router's light sequence), **Sort the Mail** (send envelopes to the right cubby),
  **Clean the Whiteboard** (scrub it clean, but don't touch the CEO's note).
- Chores move around: desktop printers, a Wi-Fi router and a mail cart spawn in random rooms and halls every day, and
  printing, shredding, whiteboard and email chores pick a different copier, shredder, board or desk each day.
- Mistakes in a chore cost one second (a red "-1s" drops off the clock). The plant gets thirsty if you wander off it,
  and coffee-machine leaks you miss now count.
- The code-locked door: one room (Supply Closet, Restrooms or Marketing Lounge) is locked each day. Chores hide clues
  to its 4-digit code on sticky notes; the digits you find go on your to-do list. The keypad lights up which digits
  were right. Inside: a golden briefcase (a free gun or +15s overtime, and a heart).
- Server cables are always six different colours.

### The Downsizing
- Line-of-sight shadows: the lights go out at 5 PM and walls block your view. You can still see through windows
  (slightly dimmed) and over desks. Coworkers you can't see fade out, and the minimap only shows the ones you can see
  (all of them once five or fewer are left).
- Bosses every third day: **The Hatchet Man** (day 3) stomps, locks on and charges in a straight line, smashing
  drywall, glass and furniture; a charge that hits concrete or a heavy machine leaves him dizzy. **The Cold Caller**
  (day 6) lobs ringing desk phones that explode a second after landing (red ring = blast zone; the keyboard swats them
  back). **The Consultant** moves to day 9. Then the rotation repeats.
- Coworkers hold what they throw: calculators, memo pads, the Hatchet Man's FIRED stamp, the Cold Caller's phone.
- Potted plants can be pushed (and shatter if they hit something hard). The little walls between back-to-back desks
  are gone, so desks slide freely.
- Fire is animated: flickering flames on every burning tile and on burning coworkers.
- Enemy arrows only appear for bosses and when five or fewer coworkers are left to fire.
- The shredder no longer gives you a paper-trail bag.

### Upgrades and UI
- Upgrade cards are clipboards: the board's colour is the rarity (wood, green, purple, gold), and every icon is
  redrawn as a single-colour ballpoint sketch. Guns come as requisition slips.
- Epic upgrades are rarer: the shop now guarantees one rare-or-better card instead of an epic, and epic/legendary
  weights were halved.
- Inventory hotbar at the bottom centre: only the guns you own, always in the same order (a new gun slots in between),
  with ammo bars. Number keys and the mouse wheel follow the same order.
- Title screen: just the logo and the buttons (no control list or floating icons).
- The coffee machine mini-game is a proper espresso machine.

### Sound
- Office sound effects instead of arcade announcers: a reception desk bell for finished tasks, a rubber stamp,
  a cash register for purchases and kill streaks, PA chimes, a punch clock and applause at the end of the day,
  a dot-matrix printer for the pink slip, an error buzz for mistakes, keypad tones, ringing phones and more.
  All synthesised in code; the voice clips and jingles are no longer loaded.

### Performance
- The shadows are drawn with stencil masks instead of a render texture (about 0.3 ms a frame in the stress test).

### Tools
- New playtest scenarios: `ui`, `boss`, `hatchet`, `vault`; `full` covers the intro and the memo.

- Release: the game is online at https://rather-die-than-get-fired.vercel.app (Vercel project `rather-die-than-get-fired`;
  `vercel.json` + `.vercelignore` in the repo). Redeploy with `npx vercel@latest deploy --prod`.
- Fix (UI): the loading-screen logo no longer overlaps the title logo on the first click.

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
