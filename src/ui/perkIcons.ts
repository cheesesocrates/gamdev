/**
 * Perk logos: one tiny sticker per upgrade, drawn as inline SVG (64x64) in the
 * same ink-outline style as the rest of the UI. Ids match PerkDef.icon.
 */
const K = "#1c1d21";
const O = `stroke="${K}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const T = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const LINE = (d: string, w = 4, c = K) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ARROW_HEAD = (d: string) => LINE(d, 4);

const FLAME = (x: number, y: number, s = 1, fill = "#c97a3a", inner = "#e9c25a") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 18 C-12 18 -14 6 -8 -2 C-6 4 -2 4 -2 -2 C-2 -10 4 -14 6 -18 C8 -8 16 -2 14 8 C13 15 8 18 0 18 Z" fill="${fill}" ${O}/><path d="M0 16 C-5 16 -6 10 -3 6 C-1 9 2 8 2 4 C5 8 7 11 5 14 C4 16 2 16 0 16 Z" fill="${inner}"/></g>`;
const BOLT = (x: number, y: number, s = 1, fill = "#e9c25a") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M2 -18 L-10 2 H-1 L-5 18 L10 -4 H1 L6 -18 Z" fill="${fill}" ${O}/></g>`;
const HEART = (x: number, y: number, s = 1, fill = "#c4382c") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 14 C-10 7 -14 2 -14 -4 C-14 -9 -10 -12 -6 -12 C-3 -12 -1 -10 0 -8 C1 -10 3 -12 6 -12 C10 -12 14 -9 14 -4 C14 2 10 7 0 14 Z" fill="${fill}" ${O}/></g>`;
const ENVELOPE = (x: number, y: number, w = 30, h = 22, fill = "#fff") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" ${O}/>${LINE(`M${x + 2} ${y + 2} L${x + w / 2} ${y + h * 0.55} L${x + w - 2} ${y + 2}`, 3)}`;
const CUP = (fill = "#fff") =>
  `<path d="M42 30 Q52 30 52 37 Q52 44 42 44" fill="none" ${O}/><path d="M18 24 H44 V42 Q44 50 36 50 H26 Q18 50 18 42 Z" fill="${fill}" ${O}/>`;

const LOGOS: Record<string, string> = {
  // ---------------------------------------------------------------- common
  dmg: `<path d="M18 44 V22 H46 V44" fill="none" stroke="${K}" stroke-width="12" stroke-linejoin="round"/><path d="M18 44 V22 H46 V44" fill="none" stroke="#e9edf8" stroke-width="5" stroke-linejoin="round"/>${LINE("M24 50 h16", 4, "#c4382c")}`,
  firerate: `${CUP()}${BOLT(31, 36, 0.7)}`,
  bulk: `<path d="M14 24 L32 15 L50 24 V42 L32 51 L14 42 Z" fill="#f2b66d" ${O}/>${LINE("M14 24 L32 33 L50 24 M32 33 V51", 4)}${LINE("M23 19.5 L41 28.5", 3)}`,
  hp: `${HEART(32, 33, 1.35)}${LINE("M32 25 V39 M25 32 H39", 5, "#fff")}`,
  speed: `<rect x="12" y="38" width="40" height="7" rx="2" fill="#c97b45" ${O}/>${LINE("M18 45 V52 M46 45 V52", 4)}${LINE("M32 33 V12 M23 21 L32 12 L41 21", 5)}`,
  dodge: `${LINE("M14 46 Q20 18 46 20", 6)}${ARROW_HEAD("M38 13 L47 20 L39 28")}${LINE("M12 30 h6 M10 38 h7", 3)}`,
  size: `<circle cx="38" cy="36" r="14" fill="#e9c25a" ${O}/><circle cx="19" cy="22" r="6" fill="#fff" ${O}/>${LINE("M24 26 L29 30", 3)}`,
  velocity: `<rect x="26" y="22" width="24" height="22" rx="3" fill="#f2b66d" ${O}/>${LINE("M38 22 V44", 3)}${LINE("M10 26 h11 M7 33 h14 M11 40 h10", 4)}`,

  // ---------------------------------------------------------------- rare
  multishot: `<rect x="14" y="14" width="24" height="30" rx="3" fill="#fff" ${O}/><rect x="26" y="22" width="24" height="30" rx="3" fill="#e9c25a" ${O}/>${LINE("M31 31 h14 M31 37 h14 M31 43 h9", 3)}`,
  ricochet: `${LINE("M10 46 L24 20 L38 46 L50 24", 5)}${ARROW_HEAD("M43 23 L51 22 L53 30")}<rect x="8" y="48" width="48" height="5" rx="2" fill="#8f97a3" ${T}/>`,
  pierce: `<path d="M8 27 H26 V37 H8 Z" fill="#c4382c" ${O}/><path d="M38 27 H56 V37 H38 Z" fill="#c4382c" ${O}/>${LINE("M12 48 L50 16", 5)}${ARROW_HEAD("M41 15 L51 15 L50 25")}`,
  homing: `<circle cx="32" cy="32" r="17" fill="#fff" ${O}/><circle cx="32" cy="32" r="10" fill="#c4382c" ${O}/><circle cx="32" cy="32" r="3.5" fill="#fff" ${T}/>`,
  crit: `<path d="M32 10 L38 24 L53 25 L42 35 L46 50 L32 42 L18 50 L22 35 L11 25 L26 24 Z" fill="#e9c25a" ${O}/>`,
  ignite: FLAME(32, 32, 1.25),
  thick: `<path d="M32 12 L49 19 V32 C49 42 41 49 32 53 C23 49 15 42 15 32 V19 Z" fill="#2f4f8f" ${O}/>${LINE("M32 20 V46 M21 30 H43", 3, "#cfe0ff")}`,
  donut: `<circle cx="32" cy="32" r="18" fill="#e9a65a" ${O}/><path d="M16 30 C18 18 46 16 48 30 C46 36 42 34 38 38 C34 42 28 36 24 40 C20 42 16 36 16 30 Z" fill="#e2a08f" ${T}/><circle cx="32" cy="30" r="5" fill="#ece5d3" ${T}/>${LINE("M22 24 l3 1 M40 22 l2 2 M42 32 l-2 2", 3, "#6aa3b4")}`,
  paper: `<rect x="12" y="20" width="18" height="22" rx="2" fill="#fff" ${O} transform="rotate(-14 21 31)"/><rect x="30" y="16" width="18" height="22" rx="2" fill="#fff" ${O} transform="rotate(12 39 27)"/><rect x="22" y="34" width="18" height="16" rx="2" fill="#fff6c4" ${O} transform="rotate(-4 31 42)"/>`,
  hotdesk: `<rect x="12" y="36" width="40" height="7" rx="2" fill="#c97b45" ${O}/>${LINE("M17 43 V51 M47 43 V51", 4)}${FLAME(32, 22, 0.75)}`,
  panic: `<rect x="14" y="38" width="36" height="10" rx="3" fill="#8f97a3" ${O}/><path d="M19 38 Q19 20 32 20 Q45 20 45 38 Z" fill="#c4382c" ${O}/>${LINE("M26 27 q3 -3 6 -3", 3, "#fff")}`,
  micdrop: `<circle cx="38" cy="20" r="9" fill="#c9d1e6" ${O}/>${LINE("M32 27 L20 45", 9)}${LINE("M32 27 L20 45", 4, "#3a3c44")}${LINE("M10 52 h10 M24 52 h4 M13 47 l-4 -2", 3)}`,
  pyramid: `<path d="M32 12 L53 48 H11 Z" fill="#e9c25a" ${O}/>${LINE("M20 33 H44 M15 41 H49 M26 23 H38", 3)}`,
  coldbrew: `<path d="M20 16 H44 L40 52 H24 Z" fill="#cfefff" ${O}/><rect x="25" y="28" width="8" height="8" fill="#fff" ${T}/><rect x="33" y="36" width="7" height="7" fill="#fff" ${T}/>${LINE("M36 16 L42 6", 4)}<path d="M23 44 H41 L40 52 H24 Z" fill="#6b3a1f"/>`,
  espresso: `<ellipse cx="31" cy="47" rx="19" ry="5" fill="#fff" ${O}/><path d="M20 28 H42 V38 Q42 46 34 46 H28 Q20 46 20 38 Z" fill="#fff" ${O}/><ellipse cx="31" cy="29" rx="9" ry="2.5" fill="#6b3a1f"/><path d="M42 31 Q49 31 49 36 Q49 41 42 41" fill="none" ${T}/>${LINE("M27 21 q3 -4 0 -8 M35 21 q3 -4 0 -8", 3)}`,
  laser: `<rect x="8" y="27" width="26" height="10" rx="5" fill="#3a3c44" ${O}/>${LINE("M36 32 H54", 6, "#c4382c")}<circle cx="54" cy="32" r="5" fill="#c4382c" ${T}/>${LINE("M44 16 h10 v10 M44 48 h10 v-10", 3)}`,
  sniper: `<circle cx="32" cy="32" r="17" fill="#fff" ${O}/>${LINE("M32 9 V22 M32 42 V55 M9 32 H22 M42 32 H55", 4)}<circle cx="32" cy="32" r="4.5" fill="#c4382c" ${T}/>`,

  // ---------------------------------------------------------------- epic
  explode: `<path d="M32 8 L37 22 L51 14 L45 28 L58 33 L44 38 L50 52 L36 44 L30 57 L26 43 L12 50 L18 36 L6 30 L20 26 L14 12 L28 20 Z" fill="#c97a3a" ${O}/><circle cx="32" cy="32" r="8" fill="#e9c25a" ${T}/>`,
  chain: `${BOLT(26, 30, 1.0)}${BOLT(42, 36, 0.7, "#6aa3b4")}`,
  split: `${LINE("M10 32 H27", 5)}${LINE("M27 32 L48 16 M27 32 H52 M27 32 L48 48", 5)}<circle cx="27" cy="32" r="4" fill="#e9c25a" ${T}/>`,
  severance: `<rect x="14" y="28" width="36" height="24" rx="3" fill="#c4382c" ${O}/><rect x="11" y="22" width="42" height="9" rx="2" fill="#e2a08f" ${O}/>${LINE("M32 22 V52", 4)}${LINE("M32 22 Q24 12 20 18 Q22 24 32 22 Q40 12 44 18 Q42 24 32 22", 3)}${BOLT(50, 12, 0.45)}`,
  orbit: `${LINE("M12 16 H52", 5)}${LINE("M20 16 L20 40 M28 16 L28 42 M36 16 L36 42 M44 16 L50 36", 3)}<circle cx="20" cy="42" r="5" fill="#c9d1e6" ${T}/><circle cx="28" cy="44" r="5" fill="#c9d1e6" ${T}/><circle cx="36" cy="44" r="5" fill="#c9d1e6" ${T}/><circle cx="51" cy="39" r="5" fill="#e9c25a" ${T}/>`,
  interns: `<circle cx="24" cy="24" r="7" fill="#ffd8b0" ${O}/><path d="M12 48 Q12 34 24 34 Q36 34 36 48 Z" fill="#4b9a63" ${O}/><circle cx="41" cy="27" r="6" fill="#ffd8b0" ${O}/><path d="M31 49 Q31 37 41 37 Q51 37 51 49 Z" fill="#6aa3b4" ${O}/>`,
  scorched: `${FLAME(18, 38, 0.55)}${FLAME(32, 34, 0.75)}${FLAME(47, 30, 0.95)}`,
  replyall: `${ENVELOPE(17, 22, 30, 22)}${LINE("M12 18 Q6 32 14 44", 4)}${LINE("M52 18 Q58 32 50 44", 4)}${ARROW_HEAD("M9 40 L14 45 L19 41")}${ARROW_HEAD("M45 41 L50 45 L55 40")}`,
  execute: `<rect x="14" y="14" width="36" height="38" rx="4" fill="#fff" ${O}/><rect x="14" y="14" width="36" height="11" rx="4" fill="#c4382c" ${O}/><text x="32" y="47" text-anchor="middle" font-family="Jersey 10, monospace" font-size="28" fill="${K}">14</text>`,
  drone: `${LINE("M16 16 L48 48 M48 16 L16 48", 4)}<circle cx="16" cy="16" r="8" fill="#cfefff" ${T}/><circle cx="48" cy="16" r="8" fill="#cfefff" ${T}/><circle cx="16" cy="48" r="8" fill="#cfefff" ${T}/><circle cx="48" cy="48" r="8" fill="#cfefff" ${T}/><rect x="23" y="25" width="18" height="14" rx="4" fill="#e9c25a" ${O}/><circle cx="32" cy="32" r="3" fill="#c4382c"/>`,
  chainmail: `${ENVELOPE(12, 22, 32, 24)}${BOLT(46, 30, 0.8)}`,
  boomerang: `<path d="M14 20 Q34 20 50 46 L43 51 Q30 30 14 28 Z" fill="#e9c25a" ${O}/>${LINE("M10 44 Q16 52 26 50", 3)}${ARROW_HEAD("M21 46 L26 50 L22 55")}`,
  irish: `${CUP("#4b9a63")}${FLAME(31, 15, 0.55)}${LINE("M24 34 h12", 3, "#fff")}`,
  prism: `<path d="M26 14 L42 44 H10 Z" fill="#cfefff" ${O}/>${LINE("M4 30 L22 30", 4, "#fff")}${LINE("M34 30 L58 18", 4, "#c4382c")}${LINE("M34 32 L58 32", 4, "#4b9a63")}${LINE("M34 34 L58 46", 4, "#2f4f8f")}`,

  // ---------------------------------------------------------------- legendary
  parachute: `<path d="M10 30 Q32 4 54 30 Z" fill="#e9c25a" ${O}/>${LINE("M10 30 L28 46 M22 30 L30 46 M42 30 L34 46 M54 30 L36 46", 3)}<rect x="26" y="44" width="12" height="10" rx="2" fill="#5b6380" ${O}/>`,
  bullettime: `<path d="M19 12 H45 L35 32 L45 52 H19 L29 32 Z" fill="#cfefff" ${O}/><path d="M24 48 H40 L35 42 H29 Z" fill="#e9c25a"/><path d="M26 18 H38 L32 28 Z" fill="#e9c25a"/>`,
  nuke: `${LINE("M10 16 L24 30 L32 24 L48 44", 6, "#c4382c")}${ARROW_HEAD("M38 44 L49 45 L49 34")}${LINE("M8 52 H56", 3)}`,
  glass: `<rect x="12" y="24" width="32" height="14" rx="6" fill="#cfefff" ${O} transform="rotate(-18 28 31)"/>${LINE("M24 24 l4 6 l-3 4 M34 22 l-2 5", 2.5)}<circle cx="26" cy="44" r="8" fill="#8f97a3" ${O}/><circle cx="26" cy="44" r="2.5" fill="${K}"/>${LINE("M46 16 l4 -4 M50 22 l6 -1", 3)}`,
  promotion: `<path d="M14 42 L16 20 L25 30 L32 16 L39 30 L48 20 L50 42 Z" fill="#e9c25a" ${O}/><rect x="14" y="42" width="36" height="8" rx="2" fill="#d8a93b" ${O}/><circle cx="32" cy="34" r="3" fill="#c4382c"/>`,

  // ---------------------------------------------------------------- chore stage
  delegation: `<rect x="10" y="16" width="22" height="28" rx="3" fill="#fff" ${O}/>${LINE("M15 25 h12 M15 31 h12 M15 37 h8", 3)}${LINE("M34 30 H54", 5)}${ARROW_HEAD("M46 22 L54 30 L46 38")}`,
  saboteur: `<path d="M44 12 a10 10 0 0 0 -10 14 L14 46 a5 5 0 0 0 7 7 L41 33 a10 10 0 0 0 14 -10 L49 29 L43 27 L41 21 Z" fill="#c9d1e6" ${O}/>`,
  overtime: `<circle cx="29" cy="34" r="17" fill="#fff" ${O}/>${LINE("M29 34 V24 M29 34 L36 38", 4)}<circle cx="46" cy="18" r="9" fill="#4b9a63" ${O}/>${LINE("M46 13 V23 M41 18 H51", 3.5, "#fff")}`,
  hazard: `<path d="M32 10 L55 50 H9 Z" fill="#e9c25a" ${O}/>${LINE("M32 24 V36", 6)}<circle cx="32" cy="43" r="3" fill="${K}"/>`,
  bigpuddles: `<path d="M32 10 C40 24 47 31 47 40 C47 48 40 53 32 53 C24 53 17 48 17 40 C17 31 24 24 32 10 Z" fill="#3d9bff" ${O}/>${LINE("M25 40 q0 6 6 7", 3, "#cfefff")}`,
  fortify: `<rect x="10" y="20" width="44" height="30" rx="2" fill="#c97a3a" ${O}/>${LINE("M10 30 H54 M10 40 H54 M24 20 V30 M40 20 V30 M18 30 V40 M32 30 V40 M46 30 V40 M24 40 V50 M40 40 V50", 3)}`,
  flex: `<circle cx="32" cy="36" r="17" fill="#fff" ${O}/><rect x="28" y="10" width="8" height="7" rx="2" fill="#8f97a3" ${T}/><text x="32" y="42" text-anchor="middle" font-family="Jersey 10, monospace" font-size="22" fill="${K}">+15</text>`,
  electric: `<rect x="16" y="28" width="22" height="18" rx="5" fill="#fff" ${O}/>${LINE("M22 28 V18 M32 28 V18", 4)}${LINE("M27 46 V54", 4)}${BOLT(46, 30, 0.75)}`,
  autocomplete: `<path d="M10 32 Q32 8 54 32 Z" fill="#c4382c" ${O}/>${LINE("M32 32 V54", 4)}${LINE("M21 32 Q26 22 32 20 Q38 22 43 32", 3)}<path d="M8 54 Q20 48 32 54 Q44 60 56 54" fill="none" ${T}/>`,
  prepared: `<path d="M32 12 L49 19 V32 C49 42 41 49 32 53 C23 49 15 42 15 32 V19 Z" fill="#2f4f8f" ${O}/>${HEART(32, 32, 0.8, "#e2a08f")}`,
  kindling: `<path d="M16 26 H48 L44 54 H20 Z" fill="#c97b45" ${O}/><rect x="20" y="14" width="12" height="16" rx="1" fill="#fff" ${T} transform="rotate(-10 26 22)"/><rect x="32" y="12" width="12" height="16" rx="1" fill="#fff6c4" ${T} transform="rotate(8 38 20)"/>${FLAME(32, 40, 0.5)}`,
  hotcopiers: `<rect x="12" y="26" width="40" height="26" rx="4" fill="#e9edf8" ${O}/><rect x="10" y="20" width="44" height="9" rx="3" fill="#c9d1e6" ${O}/>${FLAME(22, 12, 0.45)}${FLAME(42, 12, 0.45)}<rect x="20" y="34" width="24" height="7" rx="2" fill="#fff" ${T}/>`,
  livewire: `<rect x="10" y="40" width="30" height="10" rx="3" fill="#fff" ${O}/><circle cx="18" cy="45" r="2" fill="${K}"/><circle cx="26" cy="45" r="2" fill="${K}"/>${LINE("M38 40 L44 30 L38 26 L48 14", 4, "#6aa3b4")}${LINE("M30 40 L26 30 L32 24 L24 12", 3, "#6aa3b4")}${BOLT(50, 34, 0.55)}`,
  firedrill: `<rect x="22" y="8" width="20" height="8" rx="2" fill="#c9d1e6" ${O}/><path d="M24 16 H40 L36 24 H28 Z" fill="#c4382c" ${O}/><circle cx="20" cy="36" r="3.5" fill="#3d9bff" ${T}/><circle cx="32" cy="42" r="3.5" fill="#3d9bff" ${T}/><circle cx="44" cy="36" r="3.5" fill="#3d9bff" ${T}/><circle cx="26" cy="50" r="3" fill="#3d9bff" ${T}/><circle cx="40" cy="52" r="3" fill="#3d9bff" ${T}/>`,
  plusone: `<circle cx="26" cy="24" r="8" fill="#ffd8b0" ${O}/><path d="M12 50 Q12 36 26 36 Q40 36 40 50 Z" fill="#4b9a63" ${O}/><circle cx="46" cy="22" r="9" fill="#e9c25a" ${O}/>${LINE("M46 17 V27 M41 22 H51", 3.5)}`,
  corner: `${LINE("M14 12 V50 H52", 9)}${LINE("M14 12 V50 H52", 4, "#8f97a3")}<circle cx="34" cy="32" r="9" fill="#ffd8b0" ${O}/><circle cx="34" cy="32" r="16" fill="none" stroke="#6aa3b4" stroke-width="3.5" stroke-dasharray="5 4"/>`,
  wetfloor: `<path d="M22 54 L28 12 H36 L42 54" fill="#e9c25a" ${O}/>${LINE("M24 40 H40", 3)}<text x="32" y="33" text-anchor="middle" font-family="Jersey 10, monospace" font-size="20" fill="${K}">!</text><path d="M48 40 C52 46 54 49 54 52 C54 55 52 57 49 57 C46 57 44 55 44 52 C44 49 46 46 48 40 Z" fill="#3d9bff" ${T}/>`,
  sticky: `<path d="M14 12 H50 V42 L40 52 H14 Z" fill="#f2d061" ${O}/><path d="M40 52 V42 H50" fill="#f2c94c" ${O}/><text x="31" y="38" text-anchor="middle" font-family="Jersey 10, monospace" font-size="32" fill="${K}">?</text>`,
  ninja: `<circle cx="32" cy="32" r="18" fill="#3a3c44" ${O}/><rect x="13" y="26" width="38" height="10" rx="3" fill="#c4382c" ${O}/><circle cx="25" cy="31" r="2.5" fill="#fff"/><circle cx="39" cy="31" r="2.5" fill="#fff"/>${LINE("M50 28 L58 22 M50 34 L59 36", 3)}`,
  deskjockey: `<rect x="20" y="26" width="34" height="10" rx="2" fill="#c97b45" ${O}/>${LINE("M24 36 V48 M50 36 V48", 4)}${LINE("M6 28 h9 M4 36 h11 M8 44 h8", 3.5)}`,
  handshake: `<circle cx="32" cy="32" r="17" fill="#e9c25a" ${O}/>${LINE("M32 32 V22 M32 32 L39 36", 4)}<text x="32" y="58" text-anchor="middle" font-family="Jersey 10, monospace" font-size="16" fill="${K}">+2s</text>`,
  blame: `<circle cx="22" cy="22" r="7" fill="#ffd8b0" ${O}/><path d="M10 48 Q10 34 22 34 Q34 34 34 48 Z" fill="#d98a3a" ${O}/><circle cx="44" cy="40" r="11" fill="#fff" ${O}/><circle cx="44" cy="40" r="5" fill="#c4382c" ${T}/>${LINE("M38 14 L28 24", 4, "#c4382c")}`,
  romance: `${HEART(30, 34, 1.15, "#cf6a4c")}${LINE("M10 52 L52 14", 4)}${LINE("M46 12 L53 13 L52 20", 4)}<path d="M10 52 l-2 -7 M10 52 l7 2" fill="none" ${T}/>`,
  binder: `<circle cx="32" cy="32" r="20" fill="#2a2c33" ${O}/>${LINE("M32 32 m-12 0 a12 12 0 1 1 12 12 a8 8 0 1 1 -8 -8 a4 4 0 1 1 4 4", 3, "#a9adc9")}`,
  command: `<path d="M28 12 H36 L40 20 L34 50 L32 54 L30 50 L24 20 Z" fill="#c4382c" ${O}/>${LINE("M24 20 H40", 3)}${BOLT(48, 22, 0.55)}${BOLT(16, 40, 0.45)}`,
  hostile: `${FLAME(22, 34, 0.8)}${FLAME(42, 30, 0.95)}${LINE("M28 52 h10", 3)}`
};

/** A perk logo on a rarity-ringed sticker. */
export function perkLogo(id: string, ring: string): string {
  const inner = LOGOS[id] ?? `<text x="32" y="42" text-anchor="middle" font-family="Jersey 10, monospace" font-size="41" fill="${K}">?</text>`;
  return `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#ece5d3" stroke="${ring}" stroke-width="5"/><circle cx="32" cy="32" r="31" fill="none" stroke="${K}" stroke-width="2.5"/>${inner}</svg>`;
}
