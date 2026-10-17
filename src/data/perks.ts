import type { WeaponId } from "./weapons";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  cost: number; // seconds of banked overtime (shop prices get a markup on top)
  max: number;
  icon: string; // logo id in src/ui/perkIcons.ts
  /** Chore-stage upgrades: only ever offered as the free end-of-day reward, never in the shop. */
  stage?: "chore";
  /** Weapon-specific upgrades only appear once that weapon has been unlocked. */
  requires?: WeaponId;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#6aa3b4",
  rare: "#4b9a63",
  epic: "#6f5aa0",
  legendary: "#d8a93b"
};

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 6, legendary: 2 };
export const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export const PERKS: PerkDef[] = [
  // ================================================================ combat: common
  { id: "dmg", name: "Heavy-Duty Staples", desc: "+20% damage with every weapon.", rarity: "common", cost: 10, max: 5, icon: "dmg" },
  { id: "firerate", name: "Caffeine Rush", desc: "+15% fire rate.", rarity: "common", cost: 10, max: 5, icon: "firerate" },
  { id: "bulk", name: "Bulk Order", desc: "Bigger stapler mag, faster reloads, more coffee and laser battery.", rarity: "common", cost: 9, max: 3, icon: "bulk" },
  { id: "hp", name: "Health Plan", desc: "+1 heart, and heal it.", rarity: "common", cost: 12, max: 5, icon: "hp" },
  { id: "speed", name: "Standing Desk", desc: "+10% move speed.", rarity: "common", cost: 9, max: 3, icon: "speed" },
  { id: "dodge", name: "Agile Methodology", desc: "Faster dodge recharge. 2nd stack: an extra dodge.", rarity: "common", cost: 10, max: 3, icon: "dodge" },
  { id: "size", name: "Supersize Me", desc: "Bigger shots that knock coworkers back harder.", rarity: "common", cost: 8, max: 2, icon: "size" },
  { id: "velocity", name: "Express Shipping", desc: "+35% shot speed and range.", rarity: "common", cost: 7, max: 2, icon: "velocity" },

  // ================================================================ combat: rare
  { id: "multishot", name: "Copy-Paste", desc: "+1 projectile per shot.", rarity: "rare", cost: 20, max: 3, icon: "multishot" },
  { id: "ricochet", name: "Bounce-Back Policy", desc: "Shots bounce off walls twice. The laser reflects too.", rarity: "rare", cost: 18, max: 3, icon: "ricochet" },
  { id: "pierce", name: "Cut the Red Tape", desc: "Shots pass through +1 coworker.", rarity: "rare", cost: 18, max: 3, icon: "pierce" },
  { id: "homing", name: "Targeted Outreach", desc: "Shots curve toward coworkers.", rarity: "rare", cost: 18, max: 2, icon: "homing" },
  { id: "crit", name: "Performance Bonus", desc: "+12% crit chance. Crits hit for 2.5x.", rarity: "rare", cost: 16, max: 3, icon: "crit" },
  { id: "ignite", name: "Hot Takes", desc: "Your hits set coworkers on fire.", rarity: "rare", cost: 16, max: 2, icon: "ignite" },
  { id: "thick", name: "Thick Skin", desc: "15% chance to shrug off a hit.", rarity: "rare", cost: 16, max: 3, icon: "thick" },
  { id: "donut", name: "Donut Fridays", desc: "Fired coworkers drop more donuts.", rarity: "rare", cost: 14, max: 3, icon: "donut" },
  { id: "paper", name: "Paper Trail", desc: "Dodging scatters flammable paper.", rarity: "rare", cost: 12, max: 1, icon: "paper" },
  { id: "hotdesk", name: "Hot Desking", desc: "After a dodge, your next 3 shots deal double damage.", rarity: "rare", cost: 16, max: 2, icon: "hotdesk" },
  { id: "panic", name: "Panic Button", desc: "Getting hit blasts nearby coworkers back and stuns them.", rarity: "rare", cost: 16, max: 2, icon: "panic" },
  { id: "micdrop", name: "Mic Drop", desc: "Reloading sends out a shockwave.", rarity: "rare", cost: 14, max: 2, icon: "micdrop" },
  { id: "pyramid", name: "Pyramid Scheme", desc: "Every firing today adds +2% damage (up to +60%).", rarity: "rare", cost: 18, max: 2, icon: "pyramid" },
  { id: "coldbrew", name: "Cold Brew", desc: "Coffee slows coworkers. Kills refill a cup.", rarity: "rare", cost: 14, max: 1, icon: "coldbrew", requires: "coffee" },
  { id: "espresso", name: "Espresso Shot", desc: "Coffee fires 4 more drops in a tighter spray.", rarity: "rare", cost: 16, max: 2, icon: "espresso", requires: "coffee" },
  { id: "laser", name: "Laser Focus", desc: "+50% laser damage, less battery drain.", rarity: "rare", cost: 16, max: 2, icon: "laser", requires: "laser" },
  { id: "sniper", name: "Laser Sight", desc: "The laser deals double damage at long range.", rarity: "rare", cost: 16, max: 1, icon: "sniper", requires: "laser" },

  // ================================================================ combat: epic
  { id: "explode", name: "Disruptive Innovation", desc: "Shots explode on impact.", rarity: "epic", cost: 30, max: 2, icon: "explode" },
  { id: "chain", name: "Static Shock", desc: "Hits arc lightning to 2 more coworkers (+1 per stack).", rarity: "epic", cost: 28, max: 3, icon: "chain" },
  { id: "split", name: "Restructuring", desc: "Kills split your shot into 3 shards.", rarity: "epic", cost: 28, max: 2, icon: "split" },
  { id: "severance", name: "Severance Package", desc: "Fired coworkers explode. Chain reactions encouraged.", rarity: "epic", cost: 30, max: 2, icon: "severance" },
  { id: "orbit", name: "Desk Toys", desc: "Newton's cradle balls orbit you and smack coworkers.", rarity: "epic", cost: 26, max: 3, icon: "orbit" },
  { id: "interns", name: "Unpaid Interns", desc: "Every 8 firings, an intern joins your side.", rarity: "epic", cost: 26, max: 2, icon: "interns" },
  { id: "scorched", name: "Burnout Culture", desc: "Your dodge leaves a trail of fire.", rarity: "epic", cost: 24, max: 1, icon: "scorched" },
  { id: "replyall", name: "Reply All", desc: "Every 5th stapler shot also fires a full ring of staples.", rarity: "epic", cost: 28, max: 2, icon: "replyall" },
  { id: "execute", name: "Two Weeks' Notice", desc: "Coworkers under 20% health get fired on the spot.", rarity: "epic", cost: 30, max: 2, icon: "execute" },
  { id: "drone", name: "Office Drone", desc: "A drone follows you and staples the nearest coworker.", rarity: "epic", cost: 30, max: 3, icon: "drone" },
  { id: "chainmail", name: "Chain Email", desc: "Every firing forwards a zap to the next coworker.", rarity: "epic", cost: 26, max: 2, icon: "chainmail" },
  { id: "boomerang", name: "Return to Sender", desc: "Staples fly back to you after they run out of range.", rarity: "epic", cost: 26, max: 1, icon: "boomerang" },
  { id: "irish", name: "Irish Coffee", desc: "Coffee sets coworkers on fire and leaves burning puddles.", rarity: "epic", cost: 26, max: 1, icon: "irish", requires: "coffee" },
  { id: "prism", name: "Prism Pointer", desc: "The laser splits into two more beams when it hits.", rarity: "epic", cost: 30, max: 2, icon: "prism", requires: "laser" },

  // ================================================================ combat: game-changers
  { id: "corner", name: "Corner Office", desc: "Stand still for a moment to dig in: +40% damage and fire rate until you move.", rarity: "rare", cost: 16, max: 1, icon: "corner" },
  { id: "wetfloor", name: "Wet Floor Sign", desc: "Your dodge roll leaves a slippery puddle behind you.", rarity: "rare", cost: 14, max: 1, icon: "wetfloor" },
  { id: "sticky", name: "Sticky Notes", desc: "Hits stick notes on coworkers. Three notes and they freeze, confused. (2nd stack: two notes.)", rarity: "rare", cost: 16, max: 2, icon: "sticky" },
  { id: "ninja", name: "Cubicle Ninja", desc: "Rolling through a coworker staggers them and gives the dodge back.", rarity: "rare", cost: 16, max: 1, icon: "ninja" },
  { id: "deskjockey", name: "Desk Jockey", desc: "Shoved desks and tables fly faster and hit three times as hard.", rarity: "rare", cost: 12, max: 1, icon: "deskjockey" },
  { id: "handshake", name: "Golden Handshake", desc: "Every 4th firing banks +2s of Overtime.", rarity: "rare", cost: 18, max: 2, icon: "handshake" },
  { id: "blame", name: "Blame Game", desc: "Whoever hits you becomes the scapegoat. Every coworker nearby turns on them.", rarity: "epic", cost: 26, max: 1, icon: "blame" },
  { id: "romance", name: "Office Romance", desc: "Dodging drops a heart. The first coworker to step on it fights for you.", rarity: "epic", cost: 28, max: 1, icon: "romance" },
  { id: "binder", name: "Black Hole Binder", desc: "Every 6s, your next shot opens a vortex that drags coworkers into a pile.", rarity: "epic", cost: 28, max: 2, icon: "binder" },
  { id: "command", name: "Chain of Command", desc: "Fire anyone who shoots back and everyone around them freezes.", rarity: "epic", cost: 24, max: 1, icon: "command" },
  { id: "hostile", name: "Hostile Work Environment", desc: "Burning coworkers panic, run around and set each other on fire.", rarity: "legendary", cost: 40, max: 1, icon: "hostile" },

  // ================================================================ combat: legendary
  { id: "parachute", name: "Golden Parachute", desc: "Revive once with full health when you're fired.", rarity: "legendary", cost: 40, max: 1, icon: "parachute" },
  { id: "bullettime", name: "Crunch Mode", desc: "Time slows when you're hurt or on a 5-kill streak.", rarity: "legendary", cost: 42, max: 1, icon: "bullettime" },
  { id: "nuke", name: "Market Crash", desc: "Every 12 firings, a shockwave fires everyone nearby.", rarity: "legendary", cost: 45, max: 1, icon: "nuke" },
  { id: "glass", name: "Glass Cannon", desc: "Double damage. Half your hearts.", rarity: "legendary", cost: 38, max: 1, icon: "glass" },
  { id: "promotion", name: "Promotion", desc: "Every 15 firings, get a free random upgrade.", rarity: "legendary", cost: 44, max: 1, icon: "promotion" },

  // ================================================================ chore stage (free end-of-day rewards only)
  { id: "delegation", name: "Delegation", desc: "Chore mini-games are ~35% shorter.", rarity: "common", cost: 0, max: 2, icon: "delegation", stage: "chore" },
  { id: "overtime", name: "Overtime Pay", desc: "Every finished chore banks +2 extra seconds.", rarity: "common", cost: 0, max: 3, icon: "overtime", stage: "chore" },
  { id: "hazard", name: "Hazard Pay", desc: "Puddles, fire and explosions hit 60% harder.", rarity: "common", cost: 0, max: 2, icon: "hazard", stage: "chore" },
  { id: "bigpuddles", name: "Water Damage", desc: "Kicked coolers flood twice the floor.", rarity: "common", cost: 0, max: 1, icon: "bigpuddles", stage: "chore" },
  { id: "flex", name: "Flex Hours", desc: "+15 seconds on every Crunch Time.", rarity: "rare", cost: 0, max: 2, icon: "flex", stage: "chore" },
  { id: "electric", name: "Electric Personality", desc: "Every puddle you make is live.", rarity: "rare", cost: 0, max: 1, icon: "electric", stage: "chore" },
  { id: "autocomplete", name: "Out of Office", desc: "One chore a day finishes itself.", rarity: "rare", cost: 0, max: 2, icon: "autocomplete", stage: "chore" },
  { id: "prepared", name: "Come Prepared", desc: "Start every Downsizing with a shield heart.", rarity: "rare", cost: 0, max: 3, icon: "prepared", stage: "chore" },
  { id: "kindling", name: "Kindling", desc: "Paper burns 60% longer, and exploding copiers scatter extra burning paper.", rarity: "rare", cost: 0, max: 1, icon: "kindling", stage: "chore" },
  { id: "hotcopiers", name: "Planned Obsolescence", desc: "Every copier starts the fight overheated: one good shot and it blows.", rarity: "epic", cost: 0, max: 1, icon: "hotcopiers", stage: "chore" },
  { id: "livewire", name: "Live Wire", desc: "Overloaded power strips zap the nearest coworker every second.", rarity: "rare", cost: 0, max: 1, icon: "livewire", stage: "chore" },
  { id: "firedrill", name: "Fire Drill", desc: "The sprinklers go off as every fight starts. Puddles everywhere.", rarity: "rare", cost: 0, max: 1, icon: "firedrill", stage: "chore" },
  { id: "plusone", name: "Plus One", desc: "An intern follows you into every fight and brawls for 30s.", rarity: "rare", cost: 0, max: 2, icon: "plusone", stage: "chore" }
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
