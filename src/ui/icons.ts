/** Inline SVG icons for the HUD, in the same thick-outline sticker style. */
const K = "#1c1d21";
const O = `stroke="${K}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const T = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const L = (d: string, w = 4, c = K) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const svg = (body: string, vb = "0 0 64 64") => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const WEAPON_ICON: Record<string, string> = {
  stapler: svg(`<path d="M8 44 H56 V52 H8 Z" fill="#8f97a3" ${O}/><path d="M10 40 L44 20 Q57 15 58 28 V33 L14 46 Z" fill="#c4382c" ${O}/><circle cx="14" cy="43" r="5" fill="#e9edf8" ${T}/>`),
  coffee: svg(`<path d="M44 28 Q56 28 56 37 Q56 46 44 46" fill="none" ${O}/><path d="M12 22 H46 V46 Q46 54 38 54 H20 Q12 54 12 46 Z" fill="#fff" ${O}/><path d="M15 27 H43 V32 H15 Z" fill="#7a4a24"/>${L("M21 15 q4 -4 0 -9 M29 15 q4 -4 0 -9 M37 15 q4 -4 0 -9", 3)}`),
  laser: svg(`<rect x="4" y="27" width="34" height="11" rx="5.5" fill="#3a3c44" ${O}/><rect x="36" y="28" width="7" height="9" fill="#e9edf8" ${T}/>${L("M46 32.5 H58", 6, "#c4382c")}<circle cx="58" cy="32.5" r="5" fill="#c4382c" ${T}/>`),
  planes: svg(`<path d="M5 30 L59 9 L41 55 L30 38 Z" fill="#fff" ${O}/><path d="M30 38 L59 9 L23 47 Z" fill="#dce6ea" ${O}/>`),
  toner: svg(`<rect x="8" y="22" width="44" height="24" rx="6" fill="#2a2c33" ${O}/><rect x="16" y="28" width="22" height="12" rx="3" fill="#5b6380" ${T}/>${L("M52 18 l5 -6 M56 26 l6 -1 M47 15 l-1 -7", 3, "#c97a3a")}`),
  confetti: svg(`<path d="M8 56 L24 20 L44 40 Z" fill="#c4382c" ${O}/>${L("M17 36 L30 46 M13 46 L22 52", 3, "#fff")}<rect x="38" y="8" width="8" height="8" fill="#e9c25a" ${T} transform="rotate(20 42 12)"/><rect x="50" y="22" width="8" height="8" fill="#6aa3b4" ${T} transform="rotate(-15 54 26)"/><circle cx="33" cy="12" r="4" fill="#4b9a63" ${T}/><circle cx="54" cy="40" r="3.5" fill="#e9c25a" ${T}/>`),
  mister: svg(`<path d="M18 28 H40 V54 Q40 58 36 58 H22 Q18 58 18 54 Z" fill="#4b9a63" ${O}/><path d="M22 14 H42 V28 H22 Z" fill="#fff" ${O}/>${L("M42 18 H50", 4)}${L("M22 22 L14 32", 4)}<circle cx="56" cy="12" r="3" fill="#3d9bff" ${T}/><circle cx="58" cy="20" r="3" fill="#3d9bff" ${T}/><circle cx="54" cy="26" r="2.5" fill="#3d9bff" ${T}/>`),
  keyboard: svg(`<rect x="3" y="18" width="58" height="30" rx="6" fill="#e9edf8" ${O}/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${9 + i * 10}" y="23" width="7" height="6" rx="1.5" fill="#fff" ${T}/>`).join("")}${[0, 1, 2, 3].map((i) => `<rect x="${13 + i * 10}" y="31" width="7" height="6" rx="1.5" fill="#fff" ${T}/>`).join("")}<rect x="17" y="39" width="30" height="5" rx="1.5" fill="#3f8f86" ${T}/>`),
  slips: svg(`<rect x="10" y="14" width="30" height="40" rx="3" fill="#efc6b4" ${O} transform="rotate(-14 25 34)"/><rect x="24" y="10" width="30" height="40" rx="3" fill="#cf6a4c" ${O} transform="rotate(10 39 30)"/>${L("M30 20 l14 2 M29 27 l14 2 M28 34 l9 1.5", 3, "#fff")}`)
};

export const HEART_PATH = "M18 30 C6 21 2 15 2 9.5 C2 5 5.6 2 9.8 2 C13.4 2 16.2 4 18 7 C19.8 4 22.6 2 26.2 2 C30.4 2 34 5 34 9.5 C34 15 30 21 18 30 Z";
export const heartSvg = (fill: string) =>
  `<svg viewBox="-2 -2 40 36" aria-hidden="true"><path d="${HEART_PATH}" fill="${fill}" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/><path d="M8 9 q1 -3 4 -3.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".7"/></svg>`;

export const ICON = {
  clock: svg(`<circle cx="32" cy="32" r="24" fill="#fff" ${O}/>${L("M32 32 V18 M32 32 L42 38", 5)}`),
  mouse: svg(`<rect x="16" y="6" width="32" height="52" rx="16" fill="#fff" ${O}/>${L("M32 8 V26", 3)}<rect x="28.5" y="14" width="7" height="12" rx="3.5" fill="#e9c25a" ${T}/>`),
  lock: svg(`<path d="M20 28 V20 Q20 8 32 8 Q44 8 44 20 V28" fill="none" ${O}/><rect x="12" y="28" width="40" height="28" rx="6" fill="#e9c25a" ${O}/><circle cx="32" cy="40" r="4" fill="${K}"/>${L("M32 42 V48", 4)}`),
  slip: svg(`<rect x="14" y="8" width="36" height="48" rx="4" fill="#cf6a4c" ${O}/>${L("M21 20 H43 M21 28 H43 M21 36 H35", 3.5, "#fff")}`),
  skull: svg(`<path d="M32 8 C18 8 10 18 10 30 C10 38 14 42 20 44 V54 H44 V44 C50 42 54 38 54 30 C54 18 46 8 32 8 Z" fill="#fff" ${O}/><circle cx="23" cy="30" r="5" fill="${K}"/><circle cx="41" cy="30" r="5" fill="${K}"/>${L("M27 54 V48 M37 54 V48", 3)}`)
};
