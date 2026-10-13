// Style "phosphor" — the original HUD visual language: alpha-derived grey ladder over a
// radial-gradient field, glowing accent, scanlines + grain + spark embers.
// Every token keeps the hud.css default, so the world's own accent/bg/spark config applies.
export default {
  id: "phosphor",
  ladder: "alpha",
  accent: null,          // null = use the world's accent / lightAccent
  accentUse: null,       // null = world value (default 1)
  sparks: true,
  css: {},
  cssLight: {},
};
