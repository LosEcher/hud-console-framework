// Theme "paperlab" — flat grayscale "paper lab" language (from @mika_systems Paper Lab demo):
// near-black luminance ladder, 1px hairlines, no gradient/glow/shadow, single desaturated
// brick-red signal. Reuses the orbital world model; only the visual tokens differ.
// Extra `css` tokens are applied by main.js and cleared on theme switch.

export default {
  id: "paperlab",
  tokens: {
    accent: "#c8746a", accentRgb: "200,116,106", bg: "#0c0c0c", bg2: "#0c0c0c",
    lightAccent: "#9a4a40", lightAccentRgb: "154,74,64", accentUse: 0.6,
    // dark-scheme-only overrides of base tokens (sampled from video frames; * = estimate)
    css: {
      "--fg": "#e6e6e6",
      "--dim": "#8a8a8a",
      "--faint": "#666666",
      "--line": "#2e2e2e",
      "--surface": "#171717",
      "--surface-2": "#202020",
      "--radius": "2px",
    },
  },
  spark: { density: 0, ratio: 0, palette: ["200,116,106"], lightPalette: ["154,74,64"], speed: 0, cometEvery: 0, opacity: 0 },

  brand: { name: "PAPER LAB", sub: "GROUND STATION · K2 ARRAY · 2026" },
  tag: "hud-framework · flat grayscale",
  chrome: { codes: ["ACQUIRE", "TRACK", "DOWNLINK", "STANDBY"], copyright: "© HUD FRAMEWORK · PAPERLAB THEME" },

  panels: {
    replay: "SURVEY REPLAY", replayNote: "1 H = 3.2 S",
    waypoints: "CHECKPOINT GATES", wpNote: "MISSION PLAN v3",
    formats: "KEPLER PROGRAM", schedule: "COMPLETION WINDOW",
    vpTitle: "K2 SECTOR — SURVEY TRAVERSE 2026", vpNote: "APPROACH → SUMMIT RIDGE",
    profile: "TERRAIN PROFILE", gradient: "SLOPE / KM",
    origins: "CREW ORIGINS", cumulative: "CUMULATIVE GAIN / LOSS",
    results: "CREW TIMES 2025", log: "MISSION LOG", bigLabel: "LEAD ALTITUDE",
  },
  resultsTags: ["CREW A", "CREW B"],
  legend: [[false, "L1 · 2025"], [false, "L2 · 2025"], [true, "GATE LIMIT"], [false, "TRAVERSE"]],

  kpis: [
    { id: "km", label: "LEAD · KM" },
    { id: "alt", label: "ALTITUDE · M" },
    { id: "dplus", label: "GAIN CUMUL · M" },
    { id: "next", label: "NEXT GATE" },
  ],

  race: {
    name: "Kepler Traverse", edition: 2026,
    km: 120, cutoff: 48, posts: 10, field: 480,
    start: "DEPLOY · APPROACH CAMP", startHour: 6,
    days: ["SOL1", "SOL2", "SOL3", "SOL4", "SOL5"],
    leaderHours: 19.2,
    postNames: ["APPROACH", "GLACIER GATE", "NORTH COL", "HIGH CAMP", "RIDGE GATE", "SUMMIT",
      "EAST SADDLE", "MORAINE", "LOW CAMP", "EXIT"],
    nations: ["USA", "JPN", "DEU", "CAN", "AUS", "KOR", "GBR", "NOR"],
    targets: [["VETERAN", 20, 26], ["STANDARD", 28, 40]],
  },

  geo: {
    seed: 70517, island: false, widthM: 52000, maxAlt: 4200,
    contourStep: 250, contourMinor: 50, vert: 3,
    peaks: ["KEPLER PEAK", "ARRAY RIDGE"],
    areas: ["NORTH BASIN", "EAST GLACIER", "OLD MORAINE"],
  },

  globe: { hub: [43.6, -110.7], hubLabel: "GROUND STATION K2" },

  view: { title: "KEPLER TRAVERSE", tagline: "04.09.26 · 06H00" },

  log: {
    start: "DEPLOY · APPROACH CAMP, SECTOR K2",
    pass: (key, name, c, clock) => `${key} ${name} · GATE ${c.code} ${c.name} · km ${c.km.toFixed(1)} · ${c.alt} m · ${clock}`,
    finish: (key, name, where, clock) => `${key} ${name} · COMPLETE ${where} · ${clock}`,
    cutoff: (c, wall) => `GATE ${c.code} ${c.name} LOCKED · ${wall}`,
  },
};
