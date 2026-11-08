// Builds my GitHub profile: every section is an SVG panel in the style of my portfolio
// (dark cards, orange accent, Gochi Hand headings, dithered pixel art), plus README.md.
//
//   node scripts/build.mjs
//
// Words, projects and links live in profile.config.json. {contributions} and {repos} are
// filled from GitHub; if that fails, the last good values in data/cache.json are used.
// No dependencies. Fonts are embedded (SIL OFL, see fonts/) so GitHub renders them.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "generated");
const config = JSON.parse(readFileSync(join(root, "profile.config.json"), "utf8"));

// ---------- look ----------

const C = {
  page: "#08090a",
  card: "#0e0e10",
  line: "#1f1f24",
  fg: "#f2f3f4",
  muted: "#8d8d96",
  dim: "#5d5d66",
  accent: "#ff6a45",
};
// Dark to bright, from the accent.
const PALETTE = ["#1a0f0b", "#2e160e", "#5a2414", "#a83c22", "#ff6a45", "#ffb59e"];

const b64 = (file) => readFileSync(join(root, file)).toString("base64");
const fontFace = (family, file, weight) =>
  `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}`;
const FONT = {
  hand: fontFace("Gochi Hand", "fonts/gochi-hand.woff2", 400),
  sans: fontFace("Instrument Sans", "fonts/instrument-sans.woff2", 400),
  sansBold: fontFace("Instrument Sans", "fonts/instrument-sans-600.woff2", 600),
  mono: fontFace("Geist Mono", "fonts/geist-mono.woff2", 400),
  monoBold: fontFace("Geist Mono", "fonts/geist-mono-500.woff2", 500),
};
const CLASSES =
  ".h{font-family:'Gochi Hand',cursive}.s{font-family:'Instrument Sans',sans-serif}.m{font-family:'Geist Mono',monospace}" +
  ".blink{animation:blink 1.6s steps(1) infinite}@keyframes blink{50%{opacity:.15}}";
const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word wrap by character count (fonts are close enough to fixed width for this). */
function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function svg(width, height, label, styles, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
<style>${styles.join("")}${CLASSES}${REDUCED}</style>
${body}
</svg>
`;
}

// Full-width panels sit 6px in from each side, so their edges line up with the 2-up project cards.
const INSET = 6;

const frame = (x, y, w, h) =>
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="16" fill="${C.card}" stroke="${C.line}"/>`;

const statusMark = (x, y, size = 5) =>
  `<g fill="${C.accent}"><rect x="${x}" y="${y}" width="${size}" height="${size}"/><rect x="${x + size + 1}" y="${y}" width="${size}" height="${size}"/><rect x="${x}" y="${y + size + 1}" width="${size}" height="${size}"/><rect class="blink" x="${x + size + 1}" y="${y + size + 1}" width="${size}" height="${size}"/></g>`;

// ---------- ordered dithering ----------

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
];
const threshold = (r, c) => (BAYER[r % 8][c % 8] + 0.5) / 64;

/** Brightness field -> one <path> per palette colour, horizontal runs merged. */
function dither({ cols, rows, cell, palette, field }) {
  const paths = palette.map(() => []);
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    let run = 0;
    let start = 0;
    for (let c = 0; c <= cols; c++) {
      let level = 0;
      if (c < cols) {
        const q = Math.min(1, Math.max(0, field(c / cols, v))) * palette.length;
        level = Math.min(palette.length, Math.floor(q) + (q - Math.floor(q) > threshold(r, c) ? 1 : 0));
      }
      if (level !== run || c === cols) {
        if (run > 0) paths[run - 1].push(`M${start * cell} ${r * cell}h${(c - start) * cell}v${cell}h${-(c - start) * cell}z`);
        run = level;
        start = c;
      }
    }
  }
  return palette.map((fill, i) => (paths[i].length ? `<path fill="${fill}" d="${paths[i].join("")}"/>` : "")).join("");
}

// ---------- live data ----------

async function liveData() {
  const cacheFile = join(root, "data", "cache.json");
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const headers = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const data = { ...cache };
  try {
    const res = await fetch(`https://api.github.com/users/${config.username}`, { headers });
    if (res.ok) data.repos = String((await res.json()).public_repos);
  } catch {}
  try {
    const res = await fetch(`https://github.com/users/${config.username}/contributions`);
    const m = res.ok && (await res.text()).match(/([\d,]+)\s+contributions?\s+in the last year/);
    if (m) data.contributions = m[1];
  } catch {}
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(data, null, 2) + "\n");
  return data;
}

const fill = (s, data) => String(s).replace(/\{(\w+)\}/g, (_, k) => data[k] ?? "—");

// ---------- panels ----------

function header(data) {
  const W = 860;
  const H = 440;
  const BAND_Y = 44;
  const CELL = 6;
  const ROWS = 22;
  const TILE_COLS = 144; // tile is 864px wide; two copies scroll by one tile
  const TILE = TILE_COLS * CELL;
  const TAU = Math.PI * 2;
  // Periodic in u (whole multiples of 2πu), so the tile loops without a seam.
  const glow = (u, v) => Math.pow(v, 1.4) * (0.7 + 0.3 * Math.sin(2 * TAU * u));
  const crest = (u, v) =>
    Math.max(0, 1 - Math.abs(v - (0.52 + 0.2 * Math.sin(3 * TAU * u + 0.6))) * 4.2) * (0.75 + 0.25 * Math.cos(TAU * u));
  const layer = (field, palette) => {
    const tile = dither({ cols: TILE_COLS, rows: ROWS, cell: CELL, palette, field });
    return `<g>${tile}</g><g transform="translate(${TILE} 0)">${tile}</g>`;
  };
  const bandH = ROWS * CELL;
  const nameY = BAND_Y + bandH + 76;

  const facts = config.facts
    .map(
      (f, i) =>
        `<text x="28" y="${nameY + 102 + i * 26}" class="m" font-size="11" letter-spacing="1.2" fill="${C.dim}">${esc(f.label.toUpperCase())}</text>` +
        `<text x="104" y="${nameY + 102 + i * 26}" class="m" font-size="13" fill="${C.fg}">${esc(f.value)}</text>`,
    )
    .join("");

  const gx = 548;
  const gw = (W - INSET - gx) / 2;
  const gy = BAND_Y + bandH;
  const gh = (H - gy) / 2;
  const stats = config.stats
    .map((s, i) => {
      const x = gx + (i % 2) * gw + 20;
      const y = gy + Math.floor(i / 2) * gh;
      return (
        `<text x="${x}" y="${y + 32}" class="m" font-size="10.5" letter-spacing="1.2" fill="${C.dim}">${esc(s.label.toUpperCase())}</text>` +
        `<text x="${x}" y="${y + 66}" class="m" font-weight="500" font-size="26" fill="${C.fg}">${esc(fill(s.value, data))}</text>` +
        `<text x="${x}" y="${y + 90}" class="s" font-size="13" fill="${C.muted}">${esc(s.note)}</text>`
      );
    })
    .join("");

  const tagline = wrap(config.tagline, 56)
    .map((l, i) => `<text x="28" y="${nameY + 40 + i * 21}" class="s" font-size="15.5" fill="${C.muted}">${esc(l)}</text>`)
    .join("");

  const body = `
<defs>
  <clipPath id="card"><rect x="${INSET}" width="${W - 2 * INSET}" height="${H}" rx="16"/></clipPath>
</defs>
<style>.da{animation:da 80s steps(${TILE_COLS}) infinite}.db{animation:db 40s steps(${TILE_COLS}) infinite}
@keyframes da{to{transform:translateX(-${TILE}px)}}@keyframes db{from{transform:translateX(-${TILE}px)}to{transform:translateX(0)}}</style>
<g clip-path="url(#card)">
  <rect x="${INSET}" width="${W - 2 * INSET}" height="${H}" fill="${C.card}"/>
  <text x="20" y="28" class="m" font-weight="500" font-size="13" fill="${C.fg}">${esc(config.username)}</text>
  ${statusMark(122, 16)}
  <text x="140" y="28" class="m" font-size="12" letter-spacing="1.2" fill="${C.fg}">${esc(config.status.toUpperCase())}</text>
  <text x="${W - 20}" y="28" text-anchor="end" class="m" font-size="12" fill="${C.muted}">${esc(config.siteLabel)}</text>
  <rect y="${BAND_Y}" width="${W}" height="${bandH}" fill="${C.page}"/>
  <g transform="translate(0 ${BAND_Y})">
    <g class="da">${layer(glow, PALETTE.slice(0, 4))}</g>
    <g class="db">${layer(crest, PALETTE.slice(3))}</g>
  </g>
  <path d="M0 ${BAND_Y + 0.5}H${W}M0 ${gy + 0.5}H${W}M${gx + 0.5} ${gy}V${H}M${gx + gw + 0.5} ${gy}V${H}M${gx} ${gy + gh + 0.5}H${W}" stroke="${C.line}"/>
  <text x="26" y="${nameY}" class="h" font-size="68" fill="${C.fg}">${esc(config.name)}</text>
  ${tagline}
  ${facts}
  ${stats}
</g>
<rect x="${INSET + 0.5}" y="0.5" width="${W - 2 * INSET - 1}" height="${H - 1}" rx="16" fill="none" stroke="${C.line}"/>`;
  return svg(W, H, `${config.name}. ${config.tagline}`, [FONT.hand, FONT.sans, FONT.mono, FONT.monoBold], body);
}

function projectCard(p) {
  const W = 430;
  const H = 530;
  const x0 = 6; // gap between neighbouring cards
  const cw = W - 12;
  const ix = x0 + 12;
  const iw = cw - 24;
  const ih = Math.round(iw * 0.625);
  const desc = wrap(p.description, 52).slice(0, 3);
  const statW = iw / 3;
  const stats = p.stats
    .map(([label, value], i) => {
      const x = ix + i * statW + (i ? 14 : 0);
      return (
        (i ? `<path d="M${ix + i * statW + 0.5} 402V448" stroke="${C.line}"/>` : "") +
        `<text x="${x}" y="418" class="m" font-size="10" letter-spacing="1.1" fill="${C.dim}">${esc(label.toUpperCase())}</text>` +
        `<text x="${x}" y="440" class="s" font-weight="600" font-size="14" fill="${C.fg}">${esc(value)}</text>`
      );
    })
    .join("");
  const button =
    p.button === "visit"
      ? `<rect x="${x0 + cw - 12 - 96}" y="474" width="96" height="32" rx="16" fill="${C.accent}"/><text x="${x0 + cw - 12 - 48}" y="494.5" text-anchor="middle" class="m" font-weight="500" font-size="11" letter-spacing="1.2" fill="#0b0b0c">VISIT ↗</text>`
      : `<rect x="${x0 + cw - 12 - 96 + 0.5}" y="474.5" width="95" height="31" rx="15.5" fill="#151518" stroke="${C.line}"/><text x="${x0 + cw - 12 - 48}" y="494.5" text-anchor="middle" class="m" font-weight="500" font-size="11" letter-spacing="1.2" fill="${C.fg}">SOURCE ↗</text>`;
  const live = p.live
    ? `<rect x="${ix + 10}" y="28" width="62" height="22" rx="11" fill="#08090acc" stroke="${C.line}"/><circle class="blink" cx="${ix + 23}" cy="39" r="3.5" fill="${C.accent}"/><text x="${ix + 32}" y="43" class="m" font-weight="500" font-size="10.5" letter-spacing="1.2" fill="${C.fg}">LIVE</text>`
    : "";
  const body = `
<defs><clipPath id="shot"><rect x="${ix}" y="18" width="${iw}" height="${ih}" rx="10"/></clipPath></defs>
${frame(x0, 6, cw, H - 12)}
<image href="data:image/jpeg;base64,${b64(p.image)}" x="${ix}" y="18" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMin slice" clip-path="url(#shot)"/>
<rect x="${ix + 0.5}" y="18.5" width="${iw - 1}" height="${ih - 1}" rx="9.5" fill="none" stroke="${C.line}"/>
${live}
<text x="${ix}" y="${ih + 52}" class="s" font-weight="600" font-size="19" fill="${C.fg}">${esc(p.name)}</text>
<text x="${ix + iw}" y="${ih + 51}" text-anchor="end" class="m" font-size="10.5" letter-spacing="1.2" fill="${C.dim}">${esc(p.tag.toUpperCase())}</text>
${desc.map((l, i) => `<text x="${ix}" y="${ih + 80 + i * 20}" class="s" font-size="14" fill="${C.muted}">${esc(l)}</text>`).join("")}
<path d="M${ix} 400.5H${ix + iw}" stroke="${C.line}"/>
${stats}
<text x="${ix}" y="494" class="m" font-size="11.5" fill="${C.muted}">${esc(p.urlLabel)}</text>
${button}`;
  return svg(W, H, `${p.name}: ${p.description}`, [FONT.sans, FONT.sansBold, FONT.mono, FONT.monoBold], body);
}

function sectionTitle(title, note, W) {
  return (
    `<text x="26" y="52" class="h" font-size="32" fill="${C.fg}">${esc(title)}</text>` +
    `<text x="${W - 26}" y="48" text-anchor="end" class="m" font-size="11.5" fill="${C.muted}">${esc(note)}</text>` +
    `<path d="M${INSET} 74.5H${W - INSET}" stroke="${C.line}"/>`
  );
}

function experience() {
  const W = 860;
  const ROW = 62;
  const H = 76 + config.experience.length * ROW + 8;
  const rows = config.experience
    .map((e, i) => {
      const y = 76 + i * ROW;
      return (
        `<clipPath id="l${i}"><rect x="26" y="${y + 13}" width="36" height="36" rx="9"/></clipPath>` +
        `<image href="data:image/png;base64,${b64(e.logo)}" x="26" y="${y + 13}" width="36" height="36" clip-path="url(#l${i})"/>` +
        `<text x="78" y="${y + 28}" class="s" font-weight="600" font-size="15" fill="${C.fg}">${esc(e.org)}</text>` +
        `<text x="78" y="${y + 47}" class="s" font-size="13.5" fill="${C.muted}">${esc(e.role)}</text>` +
        (e.current ? `<circle class="blink" cx="${W - 26 - e.when.length * 7.2 - 12}" cy="${y + 31}" r="3" fill="${C.accent}"/>` : "") +
        `<text x="${W - 26}" y="${y + 35}" text-anchor="end" class="m" font-size="12" fill="${e.current ? C.fg : C.muted}">${esc(e.when)}</text>` +
        (i < config.experience.length - 1 ? `<path d="M26 ${y + ROW + 0.5}H${W - 26}" stroke="${C.line}" stroke-dasharray="2 4"/>` : "")
      );
    })
    .join("");
  const body = `${frame(INSET, 0, W - 2 * INSET, H)}${sectionTitle("experience", "now and before", W)}${rows}`;
  return svg(W, H, "Experience: " + config.experience.map((e) => `${e.role} at ${e.org}, ${e.when}`).join("; "), [FONT.hand, FONT.sans, FONT.sansBold, FONT.mono], body);
}

function writing() {
  const W = 860;
  const posts = config.writing.posts;
  const ROW = 64;
  const H = 76 + posts.length * ROW + 14;
  const fmt = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const rows = posts
    .map((p, i) => {
      const y = 76 + i * ROW;
      const lines = wrap(p.title, 72).slice(0, 2);
      return (
        `<text x="26" y="${y + 30}" class="m" font-size="10.5" letter-spacing="1.2" fill="${C.accent}">${esc(p.tag.toUpperCase())}</text>` +
        lines.map((l, j) => `<text x="130" y="${y + 30 + j * 21}" class="s" font-weight="600" font-size="15" fill="${C.fg}">${esc(l)}</text>`).join("") +
        `<text x="${W - 26}" y="${y + 30}" text-anchor="end" class="m" font-size="12" fill="${C.muted}">${esc(fmt(p.date))}</text>`
      );
    })
    .join("");
  const body = `${frame(INSET, 0, W - 2 * INSET, H)}${sectionTitle("writing", config.writing.source, W)}${rows}`;
  return svg(W, H, "Writing: " + posts.map((p) => p.title).join("; "), [FONT.hand, FONT.sans, FONT.sansBold, FONT.mono], body);
}

function linkButton(l) {
  const W = 172;
  const H = 58;
  const fillColor = l.primary ? C.accent : C.card;
  const text = l.primary ? "#0b0b0c" : C.fg;
  const body = `<rect x="4.5" y="6.5" width="${W - 9}" height="${H - 13}" rx="22.5" fill="${fillColor}" stroke="${l.primary ? C.accent : C.line}"/>
<text x="${W / 2}" y="${H / 2 + 4.5}" text-anchor="middle" class="m" font-weight="500" font-size="12" letter-spacing="1.4" fill="${text}">${esc(l.label.toUpperCase())} ↗</text>`;
  return svg(W, H, l.label, [FONT.monoBold], body);
}

/** Footer: dim dots under a wavy dithered edge, with a small glow wandering along it. */
function footer() {
  const W = 860;
  const H = 120;
  const P = 10;
  const edge = (x) => H * 0.32 + 9 * Math.sin(x / 83) + 6 * Math.sin(x / 37 + 1.7) + 3 * Math.sin(x / 17 + 0.5);
  const dots = [];
  const shape = [];
  for (let r = 0; r * P < H; r++) {
    for (let c = 0; c * P < W; c++) {
      const x = c * P + P / 2;
      const y = r * P + P / 2;
      if (y - edge(x) <= (threshold(r, c) - 0.5) * P * 2.2) continue;
      dots.push(`M${x - 1} ${y - 1}h2v2h-2z`);
      shape.push(`M${c * P} ${r * P}h${P}v${P}h-${P}z`);
    }
  }
  // A dithered glow on the same 10px grid, moved in whole cells so it stays on the dots.
  const lit = PALETTE.slice(2).map(() => []);
  for (let r = -5; r <= 5; r++) {
    for (let c = -8; c <= 8; c++) {
      const q = Math.max(0, 1 - Math.hypot(c / 8, r / 4.5)) * 4;
      const level = Math.min(4, Math.floor(q) + (q - Math.floor(q) > threshold(r + 8, c + 8) ? 1 : 0));
      if (level > 0) lit[level - 1].push(`M${c * P + 2} ${r * P + 2}h6v6h-6z`);
    }
  }
  const glow = lit.map((d, i) => (d.length ? `<path fill="${PALETTE[i + 2]}" d="${d.join("")}"/>` : "")).join("");
  const steps = 64;
  const body = `<defs><clipPath id="band"><path d="${shape.join("")}"/></clipPath></defs>
<style>.walk{animation:walk 26s steps(${steps}) infinite alternate}@keyframes walk{from{transform:translate(90px,70px)}to{transform:translate(${90 + steps * P}px,70px)}}</style>
<path fill="${C.muted}" fill-opacity="0.35" d="${dots.join("")}"/>
<g clip-path="url(#band)"><g class="walk">${glow}</g></g>`;
  return svg(W, H, "", [], body);
}

// ---------- build ----------

const data = await liveData();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const files = {};
const write = (name, content) => {
  writeFileSync(join(OUT, name), content);
  files[name] = createHash("sha1").update(content).digest("hex").slice(0, 10);
};

write("header.svg", header(data));
config.projects.forEach((p, i) => write(`project-${i + 1}.svg`, projectCard(p)));
write("experience.svg", experience());
write("writing.svg", writing());
config.links.forEach((l, i) => write(`link-${i + 1}.svg`, linkButton(l)));
write("footer.svg", footer());

// ?v=<hash> makes GitHub's image cache fetch a panel again whenever it changes.
const img = (name, alt, width) => `<img src="./generated/${name}?v=${files[name]}" width="${width}" alt="${esc(alt)}">`;
const link = (url, inner) => `<a href="${esc(url)}">${inner}</a>`;

const projects = config.projects
  .map((p, i) => link(p.url, img(`project-${i + 1}.svg`, `${p.name}: ${p.description}`, "50%")))
  .reduce((rows, a, i) => (i % 2 ? rows.at(-1).push(a) : rows.push([a]), rows), [])
  .map((pair) => pair.join(""))
  .join("\n");

const readme = `<!-- Generated by scripts/build.mjs from profile.config.json. Edit those, then run: node scripts/build.mjs -->

${link(config.site, img("header.svg", `${config.name}. ${config.tagline}`, "100%"))}

${projects}

${img("experience.svg", "Experience: " + config.experience.map((e) => `${e.role} at ${e.org} (${e.when})`).join("; "), "100%")}

${link(config.writing.posts[0].url, img("writing.svg", "Writing: " + config.writing.posts.map((p) => p.title).join("; "), "100%"))}

${config.links.map((l, i) => link(l.url, img(`link-${i + 1}.svg`, l.label, `${100 / config.links.length}%`))).join("")}

${img("footer.svg", "", "100%")}
`;
writeFileSync(join(root, "README.md"), readme);

console.log(`built ${readdirSync(OUT).length} panels + README.md · contributions ${data.contributions ?? "?"} · repos ${data.repos ?? "?"}`);
