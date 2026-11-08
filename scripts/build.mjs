// Builds the SVGs used by README.md, in the same style as my portfolio:
// dark/light panels, Gochi Hand headings, an orange accent and dithered pixel art.
// Run: node scripts/build.mjs   (no dependencies; fonts are embedded so GitHub renders them)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets");
mkdirSync(out, { recursive: true });

const b64 = (file) => readFileSync(join(root, file)).toString("base64");
const FONTS = {
  hand: `@font-face{font-family:"Gochi Hand";src:url(data:font/woff2;base64,${b64("fonts/gochi-hand.woff2")}) format("woff2")}`,
  sans: `@font-face{font-family:"Instrument Sans";src:url(data:font/woff2;base64,${b64("fonts/instrument-sans.woff2")}) format("woff2")}`,
  mono: `@font-face{font-family:"Geist Mono";src:url(data:font/woff2;base64,${b64("fonts/geist-mono.woff2")}) format("woff2")}`,
};
const AVATAR = `data:image/jpeg;base64,${b64("assets/avatar.jpg")}`;

const THEMES = {
  dark: { bg: "#08090a", fg: "#f2f3f4", muted: "#8d8d96", line: "#1b1b1f", dot: "#8d8d96", accent: "#ff6a45" },
  light: { bg: "#ffffff", fg: "#111113", muted: "#6b6b73", line: "#e3e3e6", dot: "#6b6b73", accent: "#b84c32" },
};
// Warm palette, dim to bright, from the accent (#ff6a45).
const GLOW = ["#5a2414", "#a83c22", "#ff6a45", "#ffb59e"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Standard 8x8 Bayer matrix for ordered dithering.
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
];
const threshold = (r, c) => (BAYER[r % 8][c % 8] + 0.5) / 64;

/**
 * A band of dots under a wavy, dithered top edge (like the footer of my site), with an optional
 * patch of lit orange pixels around (gx, gy), as if a cursor had just passed by.
 */
function pixelBand({ width, height, y0, theme, glow }) {
  const pitch = 10;
  const edge = (x) => height * 0.3 + 9 * Math.sin(x / 83) + 6 * Math.sin(x / 37 + 1.7) + 3 * Math.sin(x / 17 + 0.5);
  const dots = [];
  const lit = GLOW.map(() => []);
  for (let r = 0; r * pitch < height; r++) {
    for (let c = 0; c * pitch < width; c++) {
      const x = c * pitch + pitch / 2;
      const y = r * pitch + pitch / 2;
      if (y - edge(x) <= (threshold(r, c) - 0.5) * pitch * 2.2) continue;
      if (glow) {
        const d = Math.hypot((x - glow.x) / glow.rx, (y - glow.y) / glow.ry);
        const q = Math.max(0, 1 - d) * GLOW.length;
        const level = Math.min(GLOW.length, Math.floor(q) + (q - Math.floor(q) > threshold(r, c) ? 1 : 0));
        if (level > 0) {
          lit[level - 1].push(`M${x - 3} ${y0 + y - 3}h6v6h-6z`);
          continue;
        }
      }
      dots.push(`M${x - 1} ${y0 + y - 1}h2v2h-2z`);
    }
  }
  return [
    `<path fill="${theme.dot}" fill-opacity="0.4" d="${dots.join("")}"/>`,
    ...lit.map((d, i) => (d.length ? `<path fill="${GLOW[i]}" d="${d.join("")}"/>` : "")),
  ].join("");
}

function header(t) {
  const W = 840;
  const H = 330;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="hey, i'm rafay. full stack developer and AI engineer from Lahore. Open to freelance work.">
<style>${FONTS.hand}${FONTS.sans}${FONTS.mono}
.hand{font-family:"Gochi Hand",cursive}.sans{font-family:"Instrument Sans",sans-serif}.mono{font-family:"Geist Mono",monospace}
.blink{animation:blink 1.6s steps(1) infinite}@keyframes blink{50%{opacity:.15}}
@media (prefers-reduced-motion:reduce){.blink{animation:none}}</style>
<defs><clipPath id="panel"><rect width="${W}" height="${H}" rx="20"/></clipPath><clipPath id="face"><circle cx="86" cy="152" r="42"/></clipPath></defs>
<g clip-path="url(#panel)">
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<g fill="${t.accent}"><rect x="44" y="52" width="6" height="6"/><rect x="52" y="52" width="6" height="6"/><rect x="44" y="60" width="6" height="6"/><rect class="blink" x="52" y="60" width="6" height="6"/></g>
<text x="70" y="64" class="mono" font-size="13" letter-spacing="1.6" fill="${t.muted}">OPEN TO FREELANCE WORK</text>
<image href="${AVATAR}" x="44" y="110" width="84" height="84" clip-path="url(#face)"/>
<circle cx="86" cy="152" r="42" fill="none" stroke="${t.line}" stroke-width="2"/>
<text x="150" y="172" class="hand" font-size="64" fill="${t.fg}">hey, i'm rafay</text>
<text x="44" y="236" class="sans" font-size="19" fill="${t.fg}">a <tspan class="hand" font-size="23" fill="${t.accent}">full stack developer</tspan> &amp; <tspan class="hand" font-size="23" fill="${t.accent}">AI engineer</tspan> from lahore, pakistan.</text>
${pixelBand({ width: W, height: 80, y0: 250, theme: t, glow: { x: 650, y: 62, rx: 120, ry: 52 } })}
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="${t.line}"/>
</svg>`;
}

function heading(text, t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="58" viewBox="0 0 840 58" role="img" aria-label="${esc(text)}">
<style>${FONTS.hand}</style>
<g fill="${t.accent}"><rect x="2" y="27" width="5" height="5"/><rect x="9" y="27" width="5" height="5"/><rect x="2" y="34" width="5" height="5"/><rect x="9" y="34" width="5" height="5" opacity=".35"/></g>
<text x="26" y="44" font-family="Gochi Hand, cursive" font-size="36" fill="${t.fg}">${esc(text)}</text>
</svg>`;
}

function footer(t) {
  const W = 840;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="110" viewBox="0 0 ${W} 110" role="img" aria-label="">
${pixelBand({ width: W, height: 110, y0: 0, theme: t, glow: null })}
</svg>`;
}

const HEADINGS = { about: "about", now: "what i'm doing", built: "things i built", stack: "my stack", elsewhere: "find me" };

for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(join(out, `header-${name}.svg`), header(t));
  writeFileSync(join(out, `footer-${name}.svg`), footer(t));
  for (const [key, text] of Object.entries(HEADINGS)) writeFileSync(join(out, `h-${key}-${name}.svg`), heading(text, t));
}
console.log("built", Object.keys(THEMES).length * (2 + Object.keys(HEADINGS).length), "svgs into assets/");
