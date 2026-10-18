# Rather Die Than Get Fired

A top-down office survival shooter made for the NASCON '26 game jam (themes: **Time** and **Fire**).

You're the best employee this office has ever had, and the most expensive. You have until **5:00 PM** to finish your
chores. Then the budget cuts land, and every coworker on the floor has done the math: your salary pays for several of theirs.

**Team docs:** [CHANGELOG.md](CHANGELOG.md) (every change, newest first) · [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md) (who owns what)

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ locally
```

**Shipping to itch.io:** run `npm run build`, zip the *contents* of `dist/` (so `index.html` is at the zip root),
upload as an HTML5 project and tick "This file will be played in the browser". The build uses relative paths, so it
works from any folder.

## How a day works

Each phase explains itself once with a rules card before it starts. **TUTORIAL** on the title screen shows them again.
Menus slide up and ignore clicks for half a second, so a stray click never buys or skips anything.

1. **Crunch Time (120 s, +4 s a day from day 4, up to +20 s):** a clock ticks from 3:00 to 5:00 PM. Walk to the
   glowing stations on your sticky note and press **E**. Every chore is a small mini-game that looks like the job
   (12 of them, up to 6 a day): water a plant that won't sit still, line a page up on the copier, drag documents into
   the shredder at a steady speed, tighten the coffee machine's leaks, stop the deck on the GROWTH slide, sign layoff
   memos, patch server cables, type a reply-all, unjam a printer, aim the Wi-Fi router's antennas for full bars, sort
   the mail, clean a whiteboard. **Mistakes cost a second.** Later days add a chore or make them a bit longer.
   Chores move around: printers, the Wi-Fi router and the mail cart turn up in new rooms and halls every day, and a
   chore can be done at any copier, shredder or whiteboard the to-do list points to. Water coolers and power strips
   also spawn in new places every day, so scout them. Done early? Press **ENTER**: half of the time left is banked as
   Overtime. Missed chores add to the firing quota.
   **The locked door:** one room is behind a code-locked security door each day. Chores hide clues to the 4-digit code
   (on a sticky note while you do them); punch it into the keypad. Wrong guesses cost a second but show which digits
   were right. Inside: a golden briefcase (a free gun or overtime, plus a heart).
2. **Performance Review:** three upgrade offers on clipboards (one rare or better; epics are a treat) and two guns,
   of which you can buy one. Everything is paid in Overtime and priced so a good day buys one thing and a great day
   two. Unspent time carries over.
3. **5:00 PM:** the PA speakers on the walls chime: *"BUDGET CUTS HAVE BEEN MADE. DOWNSIZING HAS BEGUN."* Coworkers
   turn hostile and more pour out of the elevators, stairwells and fire exits.
4. **The Downsizing:** the lights go out. Walls block your view (windows and desks don't), and coworkers you can't see
   fade into the dark. Fire the quota before they fire you. Press **E** by a cooler, power strip, copier, toilet,
   vending machine or fridge and the trap or bonus goes off instantly. Clear the quota to pick one free chore-stage
   upgrade (the only place those appear), read management's two-line memo about tomorrow ("**Due to budget cuts:** AI
   robots join the payroll." / "Tomorrow: 5 chores (one more) · +4s on the clock · quota 22."), then do it all again.

### A run
A run is **nine days**. Day 3 and day 6 each bring a boss drawn from the Hatchet Man, the Cold Caller and the
Consultant (never the same one twice), and day 9 is the finale against **the CEO**. Beat him and you get a Letter of
Promotion: **CASH OUT** (the run counts as complete) or **KEEP WORKING** in endless mode, where a boss still turns up
every third day, the CEO every ninth, and every nine days they get tougher.

### Controls
| | |
|---|---|
| WASD / arrows | Move |
| Mouse | Aim. Click to fire (the stapler and toner are one shot per click, the rest fire while held) |
| Mouse wheel / Q / 1-9 | Switch weapon (the hotbar shows the guns you own, in a fixed order) |
| Space / Shift / right-click | Dodge roll (i-frames; roll into desks to send them flying). With Open-Plan Office it's a dash through walls |
| E | Chores, traps, refills |
| R | Reload the stapler |
| Enter | Clock out early (all chores done) |
| Esc / P | Pause (volume, how to play) · M mutes |

### Weapons (bought at the Performance Review, each at its own price)
Stapler (free, start) · Keyboard melee that swats shots back (20s) · Plant Mister that soaks coworkers and leaves
puddles (22s) · Hot Coffee shotgun (24s) · homing Paper Planes (28s) · Confetti Cannon (30s) · piercing Pink Slips
(32s) · Laser Pointer beam (34s) · lobbed Toner Bomb that smashes drywall (36s). A gun you buy is in your hand when
the fight starts; scroll to switch.

### The office fights back
- Puddles make coworkers slip; an overloaded power strip electrifies the whole puddle. A live puddle hurts for as
  long as they stand in it (and slows them to a wade); AI robots short out in any puddle and blow up. A boss stuck in
  live water for 3 seconds gets insulated for a few seconds so he can walk out. Traps never hurt you.
- Shredded paper burns and fire spreads along it. Overheated copiers blow up (E arms one with a 3-second fuse).
- Too much fire trips the sprinklers: they douse the flames and flood small patches all over the floor.
- Desks, tables and boxes can be shoved; a dodge-rolled desk bowls coworkers over.
- Interior walls are drywall: bosses and big blasts smash through them (the CEO goes through concrete too).
  Everything is repaired overnight.

### Coworkers
Runners duck behind desks when you can see them and rush you when you're close or reloading. Shooters keep their
distance. HR Directors carry riot shields: slip them in water, bonk them with the keyboard, or bounce a shot off a
wall to hit them. Some coworkers wait in other rooms and ambush you together. Coworkers who throw things hold them
(calculators, memo pads, phones).

**Bosses, every third day:** **The Hatchet Man** stomps, locks on and charges in a straight line through drywall,
glass and furniture; dodge so he slams into concrete and he's dizzy. **The Cold Caller** lobs ringing desk phones
that blow up a second after they land (swat one back with the keyboard), and when hurt, a conference call drops a
ring of them around you. **The Consultant** brings in interns who shield him (fire them first) and, below half
health, pivots: a full ring of memos.

**The CEO** (day 9) comes down in the lift for a cutscene, then fights in three phases, each with its own share of
his health. He has his own moves (fans of gold coins, golden-parachute leaps that land on a red ring) and borrows
everyone else's: the Hatchet Man's charge, except nothing inside the building stops it (only the outer walls, the
locked room and heavy machines do, and then he's dizzy); from phase 2, security from HR and the Cold Caller's
conference call; in phase 3, burning budget reports, the office on fire with the sprinklers cut, the Consultant's
pivot (a ring of coins and memos), and charges in pairs.

### Upgrades
69 of them (13 are chore-stage picks), in four rarities (the clipboard's colour), each with its own pen-drawn logo: the
classics (ricochet, piercing, multishot, homing, explosive shots, chain lightning) and game-changers like Black Hole
Binder (vortex shots), Office Romance (a dodge heart that charms a coworker), Blame Game (whoever hits you becomes
everyone's target), Open-Plan Office (the dodge becomes a dash through walls, with a cooldown on walls; it locks Desk
Jockey), Electric Personality (every puddle is live, for two fights), Cubicle Ninja, Corner Office, Sticky Notes,
Hostile Work Environment and Golden Handshake. See `src/data/perks.ts`.

## Project layout

```
src/
  main.ts                 Phaser boot
  config.ts               tile size, map size, depth layers, character scale, crunch length
  scenes/BootScene.ts     asset loading + procedurally generated tiles/projectiles/effects
  scenes/GameScene.ts     the game: phases, combat, camera, lighting, HUD wiring
  world/OfficeMap.ts      the floor plan (rooms, drywall, doors, furniture, stations, spawns)
  world/World.ts          collision (tiles + boxes), raycasts, nav grid
  world/Nav.ts            flow-field pathfinding (enemies, bosses through drywall) + A* (phase-1 coworkers)
  world/Hazards.ts        water / electricity / paper / fire
  world/Furniture.ts      furniture sprites + colliders, pushable chairs, runtime spawning
  world/Props.ts          shove-able desks and tables
  entities/               Player, Enemy (NPC + hostile + ally AI), Projectiles, Pickups
  systems/                GameState (run + upgrades), Stations (chores/traps, daily chore hosts), Waves, Effects,
                          Audio, OfficeSfx (synthesised office sounds), Speakers (PA), Vision (line-of-sight
                          shadows), Vault (the code-locked door)
  data/                   perks, weapons, enemies, day scaling, flavour text
  ui/                     HTML/CSS overlay: HUD, menus, intro cards, mini-games, icons and perk logos (GSAP);
                          sketch.ts turns the icons into pen drawings for the clipboards
tools/
  render-assets.mjs       renders the furniture sprites from Kenney 3D models (three.js, headless Edge)
  furniture-specs.mjs     what to render: models, recolours, composites, camera angle
  playtest.mjs            headless smoke test with screenshots
                          (full | combat | minis | stress | props | epress | ui | boss | hatchet | vault)
  analyze-music.mjs       loudness/tempo stats used to pick music loops
public/assets/            runtime art, audio and the Jersey 10 font
```

## Replacing the placeholder art

All art is from [Kenney](https://kenney.nl) (CC0) unless noted.

- **Characters:** `public/assets/characters/*.png`. Sprites face **right**; the game rotates them toward the aim
  direction. Keep the same file names or update `CHAR_SPRITES` in `BootScene.ts` and the `sprites` lists in
  `src/data/enemies.ts`. Overall size: `CHAR_SCALE` in `src/config.ts`.
- **Furniture:** `public/assets/furniture/*.png` plus `manifest.json` (sprite size, footprint and ground anchor),
  rendered from the 3D models in `tools/models/` by `node tools/render-assets.mjs render`.
- **Floors and walls:** generated in code in `makeTileset()` in `BootScene.ts`.
- **Music:** `public/assets/audio/music/lobby.mp3` (Crunch Time) and `fight.mp3` (the Downsizing) are the jam's own
  tracks; the title, review and game-over loops are Kenney's. File list: `MUSIC_FILES` in `src/systems/Audio.ts`.
- **Office sounds** (desk bell, rubber stamp, cash register, PA chimes, punch clock, printer, applause, ringing
  phone...) are synthesised at boot in `src/systems/OfficeSfx.ts`; no voice lines.
- **UI colours and type:** `src/ui/theme.css` (office palette) and `index.html` (the Jersey 10 `@font-face`).

## Debug helpers

Open the browser console:

```js
__HT.toFight()          // skip ahead to the fight
__HT.give("binder", 2)  // grant upgrades (ids in src/data/perks.ts)
__HT.day(3)             // jump to a day (3, 6, 9... = boss)
__HT.god()              // invincible
__HT.killAll()          // fire everyone
__HT.boss()             // bring today's boss in now (boss days)
__HT.endless()          // turn the run endless
__HT.perf(); __HT.prof() // frame cost overall / per system
```

**Cheat sheet:** on the Performance Review, type the Konami code (up up down down left right left right B A). Every
upgrade with +/- buttons, every gun, and a God Mode switch; whatever you sign there sticks for the run.

**Playtests:** `node tools/playtest.mjs <outDir> <scenario>` boots the game in headless Edge or Chrome and drives a
scripted session (screenshots plus a log). Scenarios include `full`, `boss`, `ceo`, `ceomoves`, `hatchet`, `phase`,
`dashperks`, `livewater`, `memo`, `minis`, `cheats`, `fire` and `combat`.

## Credits

Art, sound effects and title/review/game-over music: Kenney.nl (CC0). Office sound effects are synthesised in code.
Furniture sprites rendered from Kenney's 3D kits (Furniture, Mini Arcade, Mini Market, Space, Space Station,
Food, Survival, Factory). Font: Jersey 10 by Sarah Cadigan-Fried (SIL Open Font License).
Motion: GSAP.
