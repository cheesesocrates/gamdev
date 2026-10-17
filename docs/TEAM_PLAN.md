# Team plan: three people, three parts of the game

The game splits cleanly into three areas. Each person **owns** one area: they make the decisions there, review changes
to those files, and keep that part working. Put your name next to a role and start on the first task in your list.

| Role | Owner | In one line |
|---|---|---|
| **A. Gameplay & Combat** | _name_ | Everything that happens in the fight: weapons, coworkers, bosses, waves, upgrades, balance |
| **B. World, Art & Audio** | _name_ | The office itself: map, sprites, effects, lighting, sound and music |
| **C. UI, Mini-games & Release** | _name_ | Everything on screen that isn't the world: menus, HUD, mini-games, tutorial, testing, shipping |

---

## A. Gameplay & Combat

**Owns:** `src/entities/` (Player, Enemy, Projectiles, Pickups), `src/systems/Waves.ts`, `src/systems/GameState.ts`,
`src/systems/Vault.ts`, `src/data/enemies.ts`, `src/data/days.ts`, `src/data/perks.ts`, `src/data/weapons.ts`, and the
combat helpers in `src/scenes/GameScene.ts` (`hitEnemy`, `killEnemy`, `explosion`, `shockwave`, `keyboardSwing`,
`tonerBlast`, `vortex`, `bossSmash`, `phoneLanded`, `phoneBlast`).

1. **Difficulty curve (days 1-10).** Play each day, write down how it felt, tune quota, spawn rate, enemy mix and HP in
   `src/data/days.ts`. Target: a new player clears day 1, the day-5 boss is beatable with 2-3 upgrades.
2. **A fourth boss** for the rotation (Hatchet Man day 3, Cold Caller day 6, Consultant day 9). Ideas: *The CFO*
   (budget cuts: drains your ammo), *The HR Overlord* (summons riot-shield guards). Telegraphed attack + a weakness.
3. **Two new coworker types.** Ideas: *IT Guy* who drops a small turret; *Team Lead* who speeds up nearby coworkers.
4. **Weapon feel and price pass.** Recoil, fire rate, damage and shop price for all nine guns. Add one weapon-specific
   upgrade for each new gun (coffee and laser already have some, see `requires` in `perks.ts`).
5. **Upgrade audit.** Check all 68 upgrades actually do what their card says and stack sensibly. Fix or cut outliers.
6. **AI polish.** Groups that flank, shooters that peek out from cover, the boss smashing walls at the right moments.
7. **Endless mode** after day 10, or a hard-mode toggle.

## B. World, Art & Audio

**Owns:** `src/world/` (OfficeMap, World, Nav, Hazards, Furniture, Props), the generated textures and tiles in
`src/scenes/BootScene.ts`, `tools/render-assets.mjs`, `tools/furniture-specs.mjs`, everything in `public/assets/`,
`src/systems/Effects.ts`, `src/systems/Audio.ts`, `src/systems/OfficeSfx.ts`, `src/systems/Speakers.ts`,
`src/systems/Vision.ts` (the fight's line-of-sight shadows), and the lighting code in `GameScene.ts` (`updateLighting`).

1. **Replace the placeholder characters.** Custom office workers for the player, the seven coworker types and the boss
   (Kenney sprites are stand-ins). Keep the "faces right" convention; walk and attack frames if there's time.
2. **Map pass.** Give every room its own look and props, make doors easy to read, add cover to the big rooms, and check
   every room is reachable. Stretch goal: a second floor layout for later days.
3. **Effects pass.** Fire, puddle edges, electricity, explosions, drywall debris and a muzzle flash per weapon.
4. **Lighting.** Smooth afternoon-to-dusk during Crunch Time, emergency red at 5 PM, flicker when a strip overloads.
5. **Audio.** A distinct sound for each new weapon (planes, toner, confetti, mister, keyboard, slips), more office
   sounds in `OfficeSfx.ts` (no voice lines: the team decided against them), music balance, duck music while paused.
6. **Low-end check.** Measure FPS on a weak laptop with 30 coworkers, floods and fire (`__HT.perf()` in the console);
   pack furniture sprites into an atlas if loading or draw calls are slow.

## C. UI, Mini-games & Release

**Owns:** `src/ui/` (UI.ts, ui.css, theme.css, Minigames.ts, minigames.css, intros.ts, icons.ts, perkIcons.ts, sketch.ts),
`index.html`, the HUD and menu wiring in `GameScene.ts` (`updateHud*`, `renderReview`, `showResults`, `togglePause`),
`tools/playtest.mjs`, `README.md`, `CHANGELOG.md`, and the build.

1. **More chores.** There are 12 mini-games now (up to 7 a day, hosts move around daily). Ideas: answer the phones,
   restock the vending machine, fix the projector. Each needs a clear way to fail (mistakes cost a second).
2. **Settings.** Screen-shake toggle, a controls page, and a colour-blind friendly option for the rarity colours.
3. **First-time hints in the world.** An arrow to the first chore and to the first trap on day 1; check that new
   players understand the Performance Review without reading.
4. **Upgrade screens.** A "your upgrades" drawer on the Performance Review, and simple stat bars on gun cards.
5. **Run summary.** On game over: days survived, best combo, favourite weapon, personal bests.
6. **Release.** itch.io page (cover image from the logo, five screenshots, a GIF), test in Chrome, Edge, Firefox and
   Safari, add a full-screen button, pause automatically when the tab loses focus.
7. **QA.** Keep the playtest scenarios passing, add one for every new feature, keep CHANGELOG.md up to date.

---

## Shared file: `src/scenes/GameScene.ts`

It's the biggest file and everyone touches it. Rules: keep edits inside your own sections (listed above), keep pull
requests small, and say in the team chat when you're about to change something outside your section. If it gets
painful, Person C can split it by phase (crunch, review, fight).

## How we work

- **Branches:** `a/<feature>`, `b/<feature>`, `c/<feature>` off `main`. Pull `main` every morning.
- **Before opening a pull request**, all of these must pass:
  ```bash
  npx tsc --noEmit
  npm run build
  node tools/playtest.mjs playtest-out full     # must end with "console errors/warnings (0)"
  ```
- **Every pull request adds a line to CHANGELOG.md** under "Unreleased".
- **Review:** the owner of the files you touched reviews the pull request. Merge once it's approved and green.
- **Debug shortcuts** in the browser console: `__HT.toFight()`, `__HT.give("binder", 2)`, `__HT.day(5)`, `__HT.god()`.

## Suggested timeline (one week)

| Day | A. Gameplay | B. World & Audio | C. UI & Release |
|---|---|---|---|
| 1 | Difficulty curve | Character sprites (player first) | Settings + first-time hints |
| 2 | Boss #2 | Character sprites (coworkers) | Second mini-games (4) |
| 3 | New coworker types | Map pass | Second mini-games (4) |
| 4 | Weapon feel + prices | Effects pass + weapon sounds | Upgrade screen polish |
| 5 | Upgrade audit | Lighting + music balance | Run summary |
| 6 | Boss #3, AI polish | Low-end performance check | Browser testing, itch.io page |
| 7 | Balance from playtests | Bug fixes | Release build + CHANGELOG |
