// Shared URL preferences for pages that are not the main console (lab, components, strait):
//   ?style=phosphor|paperlab  ?motion=full|reduced (default: prefers-reduced-motion)
//   ?fx=0|1  ?density=compact|cozy
// The lab opts out of ?density= (it means spark density there) and ?style= (opaque flat
// panels would hide the spark previews it exists to tune).
// Style tokens follow the active scheme; a MutationObserver re-applies them whenever a
// page's own scheme switcher flips <html data-scheme>. index.html does this in main.js.
import { refreshPalette } from "./palette.js";

export const STYLE_IDS = ["phosphor", "paperlab"]; // single registry, also used by main.js

export function readMotion(qs = new URLSearchParams(location.search)) {
  const v = qs.get("motion");
  if (v === "full") return "full";
  if (v === "reduced" || v === "off") return "reduced";
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
}

export async function startPrefs({ density = true, styles = true } = {}) {
  const qs = new URLSearchParams(location.search);
  const root = document.documentElement;
  const motion = readMotion(qs);
  root.dataset.motion = motion;
  const fx = qs.get("fx") === "0" ? false : qs.get("fx") === "1" ? true : null;
  const styleId = styles && STYLE_IDS.includes(qs.get("style")) ? qs.get("style") : "phosphor";
  const style = (await import(`../../styles/${styleId}.js`)).default;
  document.body.dataset.style = styleId;
  const urlAccent = /^[0-9a-f]{6}$/i.test((qs.get("accent") || "").replace(/^#/, ""));
  let keys = [];
  const apply = () => {
    const light = root.dataset.scheme === "light";
    for (const k of keys) root.style.removeProperty(k);
    const extra = { ...(light ? style.cssLight : style.css) };
    if (style.accent && !urlAccent) {
      extra["--accent"] = light ? style.accent.light : style.accent.dark;
      extra["--accent-rgb"] = light ? style.accent.lightRgb : style.accent.darkRgb;
    }
    if (style.accentUse != null) extra["--accent-use"] = String(style.accentUse);
    if (density && qs.get("density") === "compact") extra["--gap"] = "8px";
    if (fx === false || motion === "reduced") { extra["--scanline-opacity"] = "0"; extra["--grain-opacity"] = "0"; }
    for (const [k, v] of Object.entries(extra)) root.style.setProperty(k, v);
    keys = Object.keys(extra);
    refreshPalette();
  };
  apply();
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-scheme"] });
  return { style: styleId, motion, fx };
}
