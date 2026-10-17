/**
 * Turns the sticker-style SVG icons into ballpoint-pen sketches for the clipboard cards:
 * one ink colour, thin wobbly lines, light fills left as bare paper, mid tones hatched,
 * dark fills inked solid, and a faint second pass like the pen went over it twice.
 */
export const INK = "#26355e";
const PAPER = "#f7f4ea";
const cache = new Map<string, string>();
let defsReady = false;

/** Shared hatch patterns and the wobble filter, defined once for the whole page. */
function ensureDefs() {
  if (defsReady || typeof document === "undefined") return;
  defsReady = true;
  const holder = document.createElement("div");
  holder.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <pattern id="sk-hatch" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
      <rect width="4.5" height="4.5" fill="${PAPER}"/><line x1="0" y1="0" x2="0" y2="4.5" stroke="${INK}" stroke-width="1.15" opacity=".62"/>
    </pattern>
    <pattern id="sk-cross" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
      <rect width="4" height="4" fill="${PAPER}"/><path d="M0 0 V4 M0 0 H4" stroke="${INK}" stroke-width="1.1" opacity=".72"/>
    </pattern>
    <filter id="sk-pen" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="sk-pen2" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs></svg>`;
  document.body.appendChild(holder.firstElementChild!);
}

/** Rough perceived lightness of a #rgb / #rrggbb colour (0 = black, 1 = white). */
function lightness(c: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return c === "white" ? 1 : c === "black" ? 0 : null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.3 * r + 0.55 * g + 0.15 * b;
}

const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "text"]);

function inkFill(f: string): string {
  const L = lightness(f);
  if (L === null) return INK;
  if (L < 0.3) return INK;
  if (L > 0.8) return PAPER;
  return L < 0.5 ? "url(#sk-cross)" : "url(#sk-hatch)";
}

/**
 * `markup` is a whole <svg>; `key` caches the result. Returns the same viewBox drawn in pen.
 * Runs in the browser (uses DOMParser); falls back to the original when that isn't available.
 */
export function sketchSvg(markup: string, key: string, cls = "sketch"): string {
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof DOMParser === "undefined") return markup;
  ensureDefs();
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg") return markup;
  const all = Array.from(svg.querySelectorAll("*"));
  for (const el of all) {
    const tag = el.nodeName;
    if (!SHAPES.has(tag) && tag !== "g") continue;
    const fill = el.getAttribute("fill");
    if (fill && fill !== "none" && !fill.startsWith("url(")) el.setAttribute("fill", inkFill(fill));
    else if (!fill && SHAPES.has(tag)) {
      // No fill of its own: inherit from a group if one sets it, otherwise SVG's default black is ink.
      let p = el.parentElement, inherited = false;
      while (p && p !== svg) { if (p.getAttribute("fill")) { inherited = true; break; } p = p.parentElement; }
      if (!inherited) el.setAttribute("fill", tag === "line" || tag === "polyline" ? "none" : INK);
    }
    const stroke = el.getAttribute("stroke");
    if (stroke && stroke !== "none") {
      const L = lightness(stroke);
      el.setAttribute("stroke", L !== null && L > 0.8 ? PAPER : INK);
      const w = parseFloat(el.getAttribute("stroke-width") ?? "1");
      el.setAttribute("stroke-width", String(+(w * 0.6).toFixed(2)));
    }
    if (tag === "text") el.setAttribute("fill", INK);
    el.removeAttribute("opacity");
  }
  const inner = Array.from(svg.childNodes).map((n) => new XMLSerializer().serializeToString(n)).join("");
  const vb = svg.getAttribute("viewBox") ?? "0 0 64 64";
  const out = `<svg class="${cls}" viewBox="${vb}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">`
    + `<g filter="url(#sk-pen2)" opacity=".28" transform="translate(.9 .7)">${inner}</g>`
    + `<g filter="url(#sk-pen)">${inner}</g></svg>`;
  cache.set(key, out);
  return out;
}
