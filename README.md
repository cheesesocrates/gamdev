# Hostile Takeover

A top-down office survival shooter made for the NASCON '26 game jam (themes: **Time** and **Fire**).

You're the highest-paid executive at a failing company. You have until **5:00 PM** to finish your chores and
booby-trap the office. Then the budget cuts land, and every coworker on the floor wants you fired.

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

1. **Crunch Time (120 s):** a clock ticks from 3:00 to 5:00 PM. Do the chores on your sticky note: hold **E** on a glowing
   object to open a quick Among-Us-style task (timing bar, button mash, whack-the-emails, typing, memory pattern,
   number order, cursor tracking). Which chores you get, and which task each uses, is re-rolled every day. Chores get
   harder by alternating: one day adds a chore, the next makes every task longer.
   Spend spare seconds on sabotage: kick water coolers, overload power strips, overheat copiers, lay shredded-paper
   trails, barricade doorways. Finish early and press **ENTER** to bank the leftover time. Missed chores add to
   the day's firing quota.
2. **Performance Review:** spend banked seconds on (pricey) combat upgrades. Unspent time carries over. Traps you
   set during Crunch Time pay +1s overtime whenever they finish off a coworker.
3. **5:00 PM:** *"BUDGET CUTS HAVE BEEN MADE. DOWNSIZING HAS BEGUN."* Coworkers turn hostile, and more pour out
   of the elevators, stairwells and fire exit.
4. **The Downsizing:** fire the quota (10 on day 1, +4 per day) before they fire you. Clear it to pick one free
   chore-stage upgrade (the only place those appear), then do it all again tomorrow, with more enemies, new enemy types and, every 5th day, a boss.

### Controls
| | |
|---|---|
| WASD / arrows | Move |
| Mouse | Aim, left-click to fire (hold for the laser) |
| Space / Shift / right-click | Dodge roll (i-frames) |
| E (hold) | Chores, sabotage, refills |
| 1 2 3 / Q / wheel | Switch weapon |
| R | Reload stapler |
| F | Toggle the shredded-paper trail |
| Enter | Clock out early (all chores done) |
| Esc / P | Pause (volume controls) · M mutes |

### Weapons
- **Rapid Stapler:** starting pistol, 12-staple magazine.
- **Hot Coffee:** shotgun that scalds. Unlocked by fixing the coffee machine; refill there.
- **Laser Pointer:** hold-to-fire beam that ignites paper. Unlocked by prepping the board deck.

### Hazards (shared by both phases)
Water puddles make enemies slip; touching an overloaded power strip electrifies the whole puddle. Shredded paper
burns and fire spreads along it. Overheated copiers explode when shot and set things on fire. Too much fire
trips the sprinklers, which flood the floor. Office chairs can be bowled into enemies (dodge into them).

### Enemies
Interns (fast swarmers) → Full-timers → Accountants (throw calculators) → Middle Managers (memo spreads) →
HR Directors (riot shield + stun megaphone; flank them) → Burnt-Out Employees (burst into flames) →
AI Replacements (laser rifles, sidestep your aim) → **THE CONSULTANT** (boss on days 5, 10, ...).

### Upgrades
33 upgrades across four rarities: ricochet, piercing, multishot, homing, explosive shots, chain lightning, crits,
kill-splitting shards, exploding coworkers, orbiting desk toys, intern allies, bullet time, a revive, and more.
See `src/data/perks.ts`.

## Project layout

```
src/
  main.ts                 Phaser boot
  config.ts               tile size, map size, depth layers, character scale
  scenes/BootScene.ts     asset loading + procedurally generated tiles/projectiles/effects
  scenes/GameScene.ts     the game: phases, combat, camera, lighting, HUD wiring
  world/OfficeMap.ts      the floor plan (rooms, doors, furniture, stations, spawns)
  world/World.ts          collision (tiles + boxes), raycasts, nav grid
  world/Nav.ts            flow-field pathfinding (enemies) + A* (phase-1 coworkers)
  world/Hazards.ts        water / electricity / paper / fire
  world/Furniture.ts      furniture sprites + colliders, pushable chairs
  entities/               Player, Enemy (NPC + hostile + ally AI), Projectiles, Pickups
  systems/                GameState (run + upgrades), Stations (chores/sabotage), Waves, Effects, Audio
  data/                   perks, enemies, day scaling, flavour text
  ui/                     HTML/CSS overlay (HUD, shop, announcements, results)
tools/
  render-assets.mjs       renders the furniture sprites from Kenney 3D models (three.js, headless Edge)
  furniture-specs.mjs     what to render: models, recolours, composites, camera angle
  playtest.mjs            headless smoke test with screenshots (node tools/playtest.mjs <outDir> full|combat)
  analyze-music.mjs       loudness/tempo stats used to pick music loops
public/assets/            all runtime art and audio
```

## Replacing the placeholder art

All art is from [Kenney](https://kenney.nl) (CC0). Swapping it out:

- **Characters:** `public/assets/characters/*.png`. Sprites face **right**; the game rotates them toward the aim
  direction. Keep the same file names or update `CHAR_SPRITES` in `BootScene.ts` and the `sprites` lists in
  `src/data/enemies.ts`. Overall size: `CHAR_SCALE` in `src/config.ts`.
- **Furniture:** `public/assets/furniture/*.png` plus `manifest.json` (sprite size, footprint and ground anchor).
  These are rendered from the 3D models in `tools/models/` by `node tools/render-assets.mjs render`. Edit
  `tools/furniture-specs.mjs` to change models, colours or camera angle. If you hand-draw replacements instead, keep
  the manifest entries in sync (collision uses `footW`/`footD`).
- **Floors and walls:** generated in code in `makeTileset()` in `BootScene.ts`.
- **Music:** `public/assets/audio/music/lobby.mp3` (Crunch Time) and `fight.mp3` (the Downsizing) are the jam's own
  tracks; the title, review and game-over loops are Kenney's. File list: `MUSIC_FILES` in `src/systems/Audio.ts`.
- **Sound effects / announcer:** `public/assets/audio/sfx` and `voice` (Kenney).

## Debug helpers

Open the browser console:

```js
__HT.toFight()          // skip ahead to the fight
__HT.give("ricochet", 3) // grant upgrades (ids in src/data/perks.ts)
__HT.day(5)             // jump to a day (5 = boss)
__HT.god()              // invincible
__HT.killAll()          // fire everyone
__HT.perf(); __HT.prof() // frame cost overall / per system
```

## Credits

Art, sound effects, voice lines and title/review/game-over music: Kenney.nl (CC0).
Furniture sprites rendered from Kenney's 3D kits (Furniture, Mini Arcade, Mini Market, Space, Space Station,
Food, Survival, Factory).
