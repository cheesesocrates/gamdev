export type WeaponId = "stapler" | "coffee" | "laser" | "planes" | "toner" | "confetti" | "mister" | "keyboard" | "slips";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** One line for the shop card. */
  desc: string;
  /** Price in banked Overtime at the Performance Review (the stapler is free). */
  cost: number;
  /** Which Kenney pose the boss holds it with. */
  pose: "gun" | "machine" | "silencer" | "hold";
  color: string;
}

/** Scroll-wheel / number-key order. */
export const WEAPONS: WeaponId[] = ["stapler", "coffee", "laser", "planes", "toner", "confetti", "mister", "keyboard", "slips"];

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  stapler: { id: "stapler", name: "Stapler", desc: "One staple per click. R reloads.", cost: 0, pose: "gun", color: "#e9c25a" },
  coffee: { id: "coffee", name: "Hot Coffee", desc: "Scalding shotgun spray. Refill at the coffee machine.", cost: 24, pose: "silencer", color: "#c97a3a" },
  laser: { id: "laser", name: "Laser Pointer", desc: "Hold for a burning beam that lights paper on fire.", cost: 34, pose: "machine", color: "#c4382c" },
  planes: { id: "planes", name: "Paper Planes", desc: "Homing paper airplanes. Refills itself.", cost: 28, pose: "hold", color: "#6aa3b4" },
  toner: { id: "toner", name: "Toner Bomb", desc: "Lobbed cartridge that explodes and smashes drywall.", cost: 36, pose: "hold", color: "#5b6380" },
  confetti: { id: "confetti", name: "Confetti Cannon", desc: "Hold to hose the room with shredded paper.", cost: 30, pose: "machine", color: "#b0885c" },
  mister: { id: "mister", name: "Plant Mister", desc: "Soaks coworkers and leaves slippery puddles.", cost: 22, pose: "silencer", color: "#4b9a63" },
  keyboard: { id: "keyboard", name: "Keyboard", desc: "Melee smash that swats bullets back.", cost: 20, pose: "hold", color: "#3f8f86" },
  slips: { id: "slips", name: "Pink Slips", desc: "Spinning slips that slice through a whole line.", cost: 32, pose: "hold", color: "#cf6a4c" }
};
