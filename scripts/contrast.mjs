#!/usr/bin/env node
// WCAG 2.x contrast check for every theme (world) × style × scheme. Zero dependencies.
// Resolves the same tokens the browser does: base values from css/hud.css (:root and
// :root[data-scheme="light"]), per-world accent/bg from themes/*.js, per-style tokens from styles/*.js, and the
// `color-mix(in srgb, var(--fg) N%, transparent)` / `rgba(accent, a)` alphas composited
// onto each surface they sit on. Exit code 1 on any failure not in KNOWN.
//   npm run contrast            # table + failures
//   npm run contrast -- --strict # ignore the KNOWN baseline
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

// Thresholds: text 4.5:1 (1.4.3), UI components / control boundaries 3:1 (1.4.11).
const TEXT = 4.5, UI = 3;

// Known global failures tracked as issues; reported but not fatal unless --strict.
// Remove an entry once it is fixed so the check ratchets.
const KNOWN = [
];

// ---------- colour math ----------
const hex = (s) => { const m = s.trim().match(/^#([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (c, a, bg) => c.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const toHex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

// ---------- base tokens from hud.css ----------
const css = readFileSync(join(root, "css/hud.css"), "utf8");
const block = (sel) => {
  const i = css.indexOf(sel + " {");
  if (i < 0) throw new Error(`missing ${sel} in hud.css`);
  const body = css.slice(i, css.indexOf("}", i));
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};
const BASE = { dark: block(":root"), light: { ...block(":root"), ...block(':root[data-scheme="light"]') } };

// resolve a token to { rgb, alpha } relative to fg (alpha = color-mix share)
function resolve(t, name, depth = 0) {
  const v = t[name];
  if (v == null || depth > 5) return null;
  const c = hex(v); if (c) return { rgb: c, a: 1 };
  const ref = v.match(/^var\((--[\w-]+)\)$/); if (ref) return resolve(t, ref[1], depth + 1);
  const mix = v.match(/^color-mix\(in srgb, var\((--[\w-]+)\) ([\d.]+)%, transparent\)$/);
  if (mix) { const b = resolve(t, mix[1], depth + 1); return b && { rgb: b.rgb, a: b.a * Number(mix[2]) / 100 }; }
  return null; // gradients etc.
}

// ---------- worlds & styles ----------
const load = async (dir) => {
  const d = join(root, dir), out = [];
  for (const f of readdirSync(d).filter((f) => f.endsWith(".js")).sort()) out.push((await import(pathToFileURL(join(d, f)).href)).default);
  return out;
};
const themes = await load("themes");
const styles = await load("styles");

// mirrors applyTheme() in js/views/main.js
function tokensFor(theme, style, scheme) {
  const t = { ...BASE[scheme] };
  const k = theme.tokens;
  if (scheme === "dark") { t["--accent"] = style.accent?.dark ?? k.accent; t["--bg"] = k.bg ?? t["--bg"]; t["--bg2"] = k.bg2 ?? t["--bg2"]; }
  else t["--accent"] = style.accent?.light ?? k.lightAccent ?? t["--accent"];
  Object.assign(t, (scheme === "dark" ? style.css : style.cssLight) ?? {});
  t.accentUse = style.accentUse ?? k.accentUse ?? 1;
  return t;
}

// surfaces text actually sits on: page bg, and the panel fill (solid surface if the
// theme has one; otherwise the radial-gradient centre --bg2 under a transparent panel)
function surfaces(t) {
  const bg = resolve(t, "--bg").rgb;
  const s = [["bg", bg]];
  const surf = resolve(t, "--surface");
  if (surf) { s.push(["surface", surf.rgb]); const s2 = resolve(t, "--surface-2"); if (s2) s.push(["surface-2", s2.rgb]); }
  else s.push(["panel", resolve(t, "--bg2").rgb]);
  return s;
}

const rows = [], fails = [];
for (const theme of themes) for (const style of styles) for (const scheme of ["dark", "light"]) {
  const t = tokensFor(theme, style, scheme);
  for (const [sname, bg] of surfaces(t)) {
    const col = (name) => { const r = resolve(t, name); return r && over(r.rgb, r.a, bg); };
    const ac = over(resolve(t, "--accent").rgb, Math.min(1, 0.9 * t.accentUse), bg); // --ac in hud-components.css
    const checks = [
      ["fg", col("--fg"), TEXT], ["dim", col("--dim"), TEXT], ["faint(non-text)", col("--faint"), 0],
      ["accent", col("--accent"), TEXT], ["ac(control)", ac, UI], ["danger", col("--danger"), TEXT],
      ["line-strong", col("--line-strong"), UI], ["line", col("--line"), 0],
    ];
    const row = { theme: theme.id, style: style.id, scheme, surface: sname };
    for (const [n, c, min] of checks) {
      if (!c) continue;
      const r = ratio(c, bg);
      row[n] = r.toFixed(2) + (min && r < min ? " ✗" : "");
      if (min && r < min) {
        const key = `${theme.id}+${style.id}/${scheme}/${n}`;
        const known = !strict && KNOWN.includes(key);
        fails.push({ key: `${key}@${sname}`, r, min, known, color: toHex(c), bg: toHex(bg) });
      }
    }
    rows.push(row);
  }
}

// --faint is reserved for decorative / non-text use (borders, disabled states, glyphs).
// Any other `color: var(--faint)` is information-bearing text and must use --dim or --fg.
const ALLOW_FAINT_TEXT = /:disabled|summary::before/;
for (const f of ["css/hud.css", "css/hud-components.css", ...readdirSync(root).filter((f) => f.endsWith(".html"))]) {
  readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
    if (/(^|[^-\w])color:\s*var\(--faint\)/.test(line) && !ALLOW_FAINT_TEXT.test(line))
      fails.push({ key: `faint-as-text ${f}:${i + 1}`, r: 0, min: TEXT, known: false, color: "--faint", bg: "text" });
  });
}

// tokens/base.json §styles documents styles/*.js — keep the two in sync
const baseJson = JSON.parse(readFileSync(join(root, "tokens/base.json"), "utf8"));
const MAPKEY = { bg: "--bg", surface: "--surface", surface2: "--surface-2", line: "--line", faint: "--faint", dim: "--dim", fg: "--fg", danger: "--danger" };
for (const style of styles) {
  const doc = baseJson.styles?.[style.id];
  if (!doc) { if (style.id !== "phosphor") fails.push({ key: `tokens/base.json styles.${style.id} missing`, r: 0, min: 0, known: false, color: "-", bg: "-" }); continue; }
  for (const scheme of ["dark", "light"]) for (const [k, v] of Object.entries(doc[scheme] ?? {})) {
    const actual = k === "accent" ? style.accent?.[scheme] : (scheme === "dark" ? style.css : style.cssLight)[MAPKEY[k]];
    if (actual?.toLowerCase() !== String(v).toLowerCase())
      fails.push({ key: `tokens/base.json styles.${style.id}.${scheme}.${k}`, r: 0, min: 0, known: false, color: String(v), bg: `styles/${style.id}.js=${actual}` });
  }
}

console.table(rows);
const hard = fails.filter((f) => !f.known);
for (const f of fails) console.log(`${f.known ? "known" : "FAIL "}  ${f.key}  ${f.r.toFixed(2)} < ${f.min}  (${f.color} on ${f.bg})`);
console.log(hard.length ? `\n${hard.length} contrast failure(s).` : `\nOK — no new contrast failures${fails.length ? ` (${fails.length} known, see KNOWN)` : ""}.`);
process.exit(hard.length ? 1 : 0);
