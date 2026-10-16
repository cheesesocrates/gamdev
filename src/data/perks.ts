export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  cost: number; // seconds of banked overtime
  max: number;
  icon: string; // file in public/assets/icons
  /** Only show up as end-of-day rewards (never in the shop). */
  freeOnly?: boolean;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9fb3c8",
  rare: "#4fd1ff",
  epic: "#c77dff",
  legendary: "#ffcf3f"
};

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 12, legendary: 4 };

export const PERKS: PerkDef[] = [
  // ---------------------------------------------------------------- common
  { id: "dmg", name: "Heavy-Duty Staples", desc: "+20% damage on every weapon.", rarity: "common", cost: 10, max: 5, icon: "sword" },
  { id: "firerate", name: "Caffeine Rush", desc: "+15% fire rate.", rarity: "common", cost: 10, max: 5, icon: "fastForward" },
  { id: "bulk", name: "Bulk Order", desc: "+6 stapler mag, faster reloads, +3 coffee cups, +30% laser battery.", rarity: "common", cost: 9, max: 3, icon: "pouch" },
  { id: "hp", name: "Premium Health Plan", desc: "+1 heart and heal it.", rarity: "common", cost: 12, max: 5, icon: "suit_hearts" },
  { id: "speed", name: "Standing Desk", desc: "+10% move speed.", rarity: "common", cost: 9, max: 3, icon: "arrow_diagonal" },
  { id: "dodge", name: "Agile Methodology", desc: "-25% dodge cooldown. Second stack adds a dodge charge.", rarity: "common", cost: 10, max: 3, icon: "arrow_rotate" },
  { id: "size", name: "Supersize Me", desc: "Shots are 40% bigger and knock enemies back harder.", rarity: "common", cost: 8, max: 2, icon: "larger" },
  { id: "velocity", name: "Express Shipping", desc: "+35% shot speed and range.", rarity: "common", cost: 7, max: 2, icon: "zoomIn" },
  { id: "delegation", name: "Delegation", desc: "Chores and sabotage take 35% less time.", rarity: "common", cost: 8, max: 2, icon: "wrench" },
  { id: "hazard", name: "Hazard Pay", desc: "Puddles, fire and explosions hit 60% harder. Slips last longer.", rarity: "common", cost: 8, max: 2, icon: "warning" },

  // ---------------------------------------------------------------- rare
  { id: "multishot", name: "Copy-Paste", desc: "+1 projectile per shot.", rarity: "rare", cost: 20, max: 3, icon: "card" },
  { id: "ricochet", name: "Bounce-Back Policy", desc: "Shots ricochet off walls +2 times. The laser reflects too.", rarity: "rare", cost: 18, max: 3, icon: "arrow_right_curve" },
  { id: "pierce", name: "Cut the Red Tape", desc: "Shots pierce +1 enemy.", rarity: "rare", cost: 18, max: 3, icon: "arrow_cross" },
  { id: "homing", name: "Targeted Outreach", desc: "Shots curve toward nearby enemies.", rarity: "rare", cost: 18, max: 2, icon: "target" },
  { id: "crit", name: "Performance Bonus", desc: "+12% crit chance. Crits deal 2.5x.", rarity: "rare", cost: 16, max: 3, icon: "dice_skull" },
  { id: "ignite", name: "Hot Takes", desc: "Hits set enemies on fire.", rarity: "rare", cost: 16, max: 2, icon: "fire" },
  { id: "thick", name: "Thick Skin", desc: "15% chance to shrug off a hit.", rarity: "rare", cost: 16, max: 3, icon: "shield" },
  { id: "donut", name: "Donut Fridays", desc: "Fired coworkers drop donuts 8% more often.", rarity: "rare", cost: 14, max: 3, icon: "flask_full" },
  { id: "paper", name: "Paper Trail", desc: "Dodging scatters flammable shredded paper.", rarity: "rare", cost: 12, max: 1, icon: "notepad" },
  { id: "coldbrew", name: "Cold Brew", desc: "Coffee slows enemies 45%. Kills refill a cup.", rarity: "rare", cost: 14, max: 1, icon: "flask_half" },
  { id: "laser", name: "Laser Focus", desc: "+50% laser damage, -30% battery drain.", rarity: "rare", cost: 16, max: 2, icon: "power" },
  { id: "electric", name: "Electric Personality", desc: "Every puddle is live. You are immune to shocks.", rarity: "rare", cost: 16, max: 1, icon: "signal3" },
  { id: "flex", name: "Flex Hours", desc: "+15 seconds on every Crunch Time.", rarity: "rare", cost: 14, max: 2, icon: "timer_CW_75" },

  // ---------------------------------------------------------------- epic
  { id: "explode", name: "Disruptive Innovation", desc: "Shots explode on impact.", rarity: "epic", cost: 30, max: 2, icon: "exploding" },
  { id: "chain", name: "Static Shock", desc: "Hits arc lightning to 2 more enemies (+1 per stack).", rarity: "epic", cost: 28, max: 3, icon: "hexagon" },
  { id: "split", name: "Restructuring", desc: "Kills split your shot into 3 shards.", rarity: "epic", cost: 28, max: 2, icon: "exploding_6" },
  { id: "severance", name: "Severance Package", desc: "Fired coworkers explode. Chain reactions encouraged.", rarity: "epic", cost: 30, max: 2, icon: "skull" },
  { id: "orbit", name: "Desk Toys", desc: "Newton's cradle balls orbit you and shred enemies.", rarity: "epic", cost: 26, max: 3, icon: "spinner" },
  { id: "interns", name: "Unpaid Interns", desc: "Every 8 kills, recruit an intern who fights for you.", rarity: "epic", cost: 26, max: 2, icon: "pawns" },
  { id: "scorched", name: "Burnout Culture", desc: "Your dodge leaves a trail of fire.", rarity: "epic", cost: 24, max: 1, icon: "campfire" },

  // ---------------------------------------------------------------- legendary
  { id: "parachute", name: "Golden Parachute", desc: "Revive once with full health when fired.", rarity: "legendary", cost: 40, max: 1, icon: "crown_a" },
  { id: "bullettime", name: "Crunch Mode", desc: "Time slows when you are hurt or on a 5-kill streak.", rarity: "legendary", cost: 42, max: 1, icon: "hourglass" },
  { id: "nuke", name: "Market Crash", desc: "Every 12 kills, a shockwave fires everyone nearby.", rarity: "legendary", cost: 45, max: 1, icon: "dollar" }
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
