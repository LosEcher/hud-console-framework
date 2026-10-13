// Theme "paperlab" — flat grayscale "paper lab" visual language (from @mika_systems Paper Lab demo):
// solid luminance ladder, 1px hairlines, no gradient/glow/scanline/grain, single desaturated
// brick-red signal. It has no world of its own: it reuses the orbital world (copy, terrain,
// race data) and only replaces visual tokens, so orbital content is imported, not duplicated.
// `tokens.css` / `tokens.cssLight` are applied by main.js for the active scheme and cleared on
// every theme/scheme switch. All text levels are checked by `npm run contrast`.

import orbital from "./orbital.js";

export default {
  ...orbital,
  id: "paperlab",
  tokens: {
    accent: "#c8746a", accentRgb: "200,116,106", bg: "#0c0c0c", bg2: "#0c0c0c",
    lightAccent: "#8f4238", lightAccentRgb: "143,66,56",
    // 1 = full-strength control accent; at 0.6 it dropped to ~2.4:1 (fails WCAG 1.4.11)
    accentUse: 1,
    // dark scheme: solid ladder. bg 0c → surface 17 → surface-2 20 → line 2e │ faint 90 → dim b0 → fg e6
    // (colours sampled from video frames; faint/dim lifted so both pass 4.5:1 on surface-2)
    css: {
      "--fg": "#e6e6e6",
      "--dim": "#b0b0b0",
      "--faint": "#909090",
      "--line": "#2e2e2e",
      "--surface": "#171717",
      "--surface-2": "#202020",
      "--radius": "2px",
      "--body-bg": "var(--bg)",
      "--panel-bg": "var(--surface)",
      "--bracket-color": "var(--line)",
      "--scanline-opacity": "0",
      "--grain-opacity": "0",
    },
    // light scheme: same structure on warm paper, ink ladder
    cssLight: {
      "--bg": "#f2f1ed",
      "--bg2": "#f2f1ed",
      "--fg": "#16161a",
      "--dim": "#45433f",
      "--faint": "#5f5d58",
      "--line": "#c9c7c0",
      "--surface": "#e9e8e3",
      "--surface-2": "#dfddd7",
      "--danger": "#a8322a",
      "--danger-rgb": "168,50,42",
      "--radius": "2px",
      "--body-bg": "var(--bg)",
      "--panel-bg": "var(--surface)",
      "--bracket-color": "var(--line)",
      "--scanline-opacity": "0",
      "--grain-opacity": "0",
    },
  },
  spark: { density: 0, ratio: 0, palette: ["200,116,106"], lightPalette: ["143,66,56"], speed: 0, cometEvery: 0, opacity: 0 },

  brand: { ...orbital.brand, name: "PAPER LAB" },
  tag: "hud-framework · flat grayscale",
  chrome: { ...orbital.chrome, copyright: "© HUD FRAMEWORK · PAPERLAB THEME" },
};
