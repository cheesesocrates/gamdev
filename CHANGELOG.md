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
- Fix (UI): more dead space past the office's outer walls. In a corner the camera used to stop at the edge of the map,
  so you ended up hidden under the HUD (the to-do note, hearts or minimap); now it can keep scrolling and you stay in
  the open part of the screen.
- UI: the end-of-day internal memo is one line now: "**Due to budget cuts:** the Hatchet Man makes the cuts himself."
  (written once, with the single biggest change for tomorrow: a boss, a new kind of coworker, or the chore load), plus
  tomorrow's quota. No more four bullet points that all start with "Due to budget cuts". The PA reads the same line.
- Gameplay: HR Directors who slip in a puddle keep their riot shield in hand and spin round with it, instead of the
  shield fading away. Zapped in a live puddle, they spin too. (The shield still can't block while they're down; a
  keyboard bonk still knocks it aside.)
- Gameplay: desks, tables, boxes and potted plants only hurt coworkers when **you** sent them flying into them (a
  shove or a dodge-roll), and only the coworkers they're actually travelling into. A coworker walking into the side of
  a sliding desk, or a desk the Hatchet Man knocked loose, doesn't hurt anyone; a pot only throws shrapnel if you threw
  it. Office chairs follow the same rule: a chair a coworker bumped into no longer bowls coworkers over.
- Fix (Gameplay): no coworker spawns inside the code-locked room any more. The Marketing Lounge has a fire exit, and
  on days it was locked, coworkers came in through it and got stuck behind the door (you couldn't reach them, so the
  quota could never be met). Locked-room spawn points are skipped, nobody sits or wanders in there before 5 PM, and
  the Consultant's interns can't appear in there either. Safety net: a coworker with no way to reach you for a few
  seconds comes back in through an entrance.
- Fix: a coworker killed by a live puddle no longer keeps updating for the rest of that frame (it could leave a
  stray flame sprite behind).
- Fix (World): the golden briefcase behind the code-locked door is put down on clear floor near the middle of the
  room, where no furniture is drawn over it. In the Marketing Lounge the middle of the room is under the coffee table,
  so the briefcase used to be drawn underneath it. Checked in all three lockable rooms (Marketing Lounge, Supply
  Closet, Restrooms).
- Gameplay: AI robots that walk into a puddle short out: they freeze, spark and rattle for about a second
  ("SHORT CIRCUIT!"), then blow up. The blast hurts the coworkers around them (never you, like every trap), cracks glass
  but leaves the walls standing, and counts as a trap kill. Finish one off while it's frying and it still goes bang.
- Gameplay: coworkers can't stand inside each other or inside you any more. They push each other apart (bosses and
  riot shields stand their ground), step out of your way, and are never shoved into a wall or a desk. A charging boss
  still ploughs through people, and a dodge-roll still slips through a crowd.
- Gameplay: new upgrade **Open-Plan Office** (rare): your dodge becomes a quick, shorter dash (about 115 px instead
  of the roll's 150) that phases straight through interior walls (drywall, concrete, glass) and desks, with a trail of
  ghostly after-images. The whole path is checked before you move, so it can't go wrong: it stops at the building's
  outer walls, at the code-locked door and at the edge of the locked room (you can't phase in there), and it never
  ends inside a wall or a desk: it carries on to come out the far side or stops at the last open spot. You see from
  the open floor while you're inside a wall, and a dash that's still going when the day's crunch ends is landed
  first. Tested with 4,000 random dashes all over the office.
- Gameplay: **a run is nine days.** Day 3 and day 6 each get a boss drawn at random from the Hatchet Man, the Cold
  Caller and the Consultant (never the same one twice), and day 9 is the finale against **the CEO**. The day banner
  says "DAY 3 / 9". Tomorrow's memo always names the right boss.
- Gameplay: **the CEO** (day 9) is the grand finish. He comes down in the lift and, the first time only, gets an
  entrance: the floor freezes, letterbox bars slide in, the camera cuts to him and he trash-talks you ("So. You're the
  one costing me five salaries.") before the fight (click / Space to go on, Esc or SKIP to skip). Three phases, each
  of which has to be fought (damage stops at the next phase's line until he moves on, with a speech and a shockwave
  in between): **Quarterly Review** (fans of gold coins; golden-parachute leaps that land where a red ring marks the
  floor), **Restructuring** (two HR Directors called up as security, double coin fans, landings that scatter coins)
  and **Liquidation** (burning budget reports lobbed at you, the office set on fire, faster everything). He arrives
  at 25% of the quota instead of 40%, and the day's quota is smaller so he's the main event. His defeat gets a
  golden-confetti send-off.
- Gameplay: the Consultant has his own tricks now instead of a copy of the Hatchet Man's charge: his interns shield
  him (**synergy**: gold tethers, and he takes a quarter damage while any of them are close, so fire them first), and
  below half health he spins up and **pivots**: a full ring of memos.
- Gameplay: **after day 9**: a Letter of Promotion, then a choice: **CASH OUT** (back to the title, the run counts as
  complete) or **KEEP WORKING (ENDLESS)**. In endless a boss still turns up every third day (from the same three) and
  the CEO every ninth day (18, 27, ...), with no cutscene, and every nine days bosses get 30% more health, a little
  faster and attack more often. The quota keeps climbing, more gently than during the run. The title screen's best
  shows "RUN COMPLETE" (plus endless days) once you've finished a run.
- Fix (Gameplay): a boss day could end without the boss if the quota was met before he'd stepped out of the lift.
  The day now waits for the boss to turn up and be fired.
- Fix (UI): every boss was announced as "THE CONSULTANT HAS BEEN LET GO" when fired; it now uses the boss's name.
- UI: **cheat sheet** for debugging. On the Performance Review, type the Konami code (up up down down left right left
  right B A) and a "CONFIDENTIAL" sheet opens: every upgrade with its logo, rarity and description and +/- buttons
  (rarity / chore / owned filters and a search box), every gun with an Owned box, and a God Mode switch. Whatever you
  sign there sticks for the rest of the run. Esc, CLOSE or a click outside closes it; typing in it never reaches the
  game (no accidental mute). Guns you already own can't be bought again, and maxed offers show as MAXED.
- Fix (Gameplay): coworkers' melee reach against another coworker (a Blame Game scapegoat, an ally) now measures
  from that coworker's edge, so a big one standing right there can be hit.

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
