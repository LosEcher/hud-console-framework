// Runtime palette: reads the resolved CSS tokens once per theme/scheme change and
// exposes ink()/ac() helpers so Canvas2D / WebGL code never hardcodes white.
// Dark scheme: fg is near-white, additive glow. Light scheme: fg is near-black,
// drawing switches to normal alpha blending (see scheme-analysis.md).

export const pal = {
  fg: [233, 233, 233],
  bg: [3, 3, 4],
  accent: [255, 154, 60],
  isLight: false,
};

const parse = (value, fallback) => {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback;
};

export function refreshPalette() {
  const cs = getComputedStyle(document.documentElement);
  pal.fg = parse(cs.getPropertyValue("--fg").trim(), pal.fg);
  pal.bg = parse(cs.getPropertyValue("--bg").trim(), pal.bg);
  pal.accent = parse(cs.getPropertyValue("--accent-rgb").trim(), pal.accent);
  const lum = 0.2126 * pal.bg[0] + 0.7152 * pal.bg[1] + 0.0722 * pal.bg[2];
  pal.isLight = lum > 128;
}

export const fgStr = () => `${pal.fg[0]},${pal.fg[1]},${pal.fg[2]}`;
export const acStr = () => `${pal.accent[0]},${pal.accent[1]},${pal.accent[2]}`;
export const ink = (a) => `rgba(${fgStr()},${a})`;
export const ac = (a) => `rgba(${acStr()},${a})`;
export const bgStr = () => `${pal.bg[0]},${pal.bg[1]},${pal.bg[2]}`;
