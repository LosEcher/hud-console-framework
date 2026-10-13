// Style "paperlab" — flat grayscale "paper lab" language (from @mika_systems Paper Lab demo):
// solid luminance ladder + solid panels, 1px hairlines, no gradient/glow/scanline/grain/sparks,
// one desaturated brick-red signal. Pure visual layer: works on any world (?theme=).
// All levels verified by `npm run contrast`.
export default {
  id: "paperlab",
  ladder: "solid",
  accent: { dark: "#c8746a", darkRgb: "200,116,106", light: "#8f4238", lightRgb: "143,66,56" },
  accentUse: 1,
  sparks: false,
  // dark: bg 0c → surface 17 → surface-2 20 → line 2e │ faint 90 → dim b0 → fg e6
  css: {
    "--bg": "#0c0c0c", "--bg2": "#0c0c0c",
    "--fg": "#e6e6e6", "--dim": "#b0b0b0", "--faint": "#909090", "--line": "#2e2e2e",
    "--surface": "#171717", "--surface-2": "#202020", "--radius": "2px",
    "--body-bg": "var(--bg)", "--panel-bg": "var(--surface)", "--bracket-color": "var(--line)",
    "--scanline-opacity": "0", "--grain-opacity": "0",
  },
  cssLight: {
    "--bg": "#f2f1ed", "--bg2": "#f2f1ed",
    "--fg": "#16161a", "--dim": "#45433f", "--faint": "#5f5d58", "--line": "#c9c7c0",
    "--surface": "#e9e8e3", "--surface-2": "#dfddd7",
    "--danger": "#a8322a", "--danger-rgb": "168,50,42", "--radius": "2px",
    "--body-bg": "var(--bg)", "--panel-bg": "var(--surface)", "--bracket-color": "var(--line)",
    "--scanline-opacity": "0", "--grain-opacity": "0",
  },
};
