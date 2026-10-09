// Theme "cinder" — volcanic network operations: a convoy route across an active volcanic
// island monitored by a sensor grid. Red accent, terse operations copy.

export default {
  id: "cinder",
  tokens: { accent: "#ff4d3d", accentRgb: "255,77,61", bg: "#040303", bg2: "#120b08", lightAccent: "#c0392b", lightAccentRgb: "192,57,43" },
  spark: { density: 150, ratio: 0.35, palette: ["255,77,61", "255,154,60", "255,120,40"], lightPalette: ["192,57,43", "179,92,0", "191,103,34"], speed: 1.3, turbulence: 0.0022, cometEvery: 1.6, opacity: 0.65 },

  brand: { name: "CINDERNET", sub: "VOLCANIC GRID · SECTOR 7 · 2026" },
  tag: "hud-framework · synthesized grid",
  chrome: { codes: ["SCAN", "ALERT", "PING", "ROUTE"], copyright: "© HUD FRAMEWORK · CINDER THEME" },

  panels: {
    replay: "CONVOY REPLAY", replayNote: "1 H = 3.2 S",
    waypoints: "SENSOR GATES", wpNote: "GRID MANIFEST",
    formats: "GRID SEGMENTS", schedule: "TRANSIT WINDOW",
    vpTitle: "SECTOR 7 — CONVOY ROUTE 2026", vpNote: "BEACON 01 → BEACON 12",
    profile: "ROUTE PROFILE", gradient: "GRADIENT / KM",
    origins: "UNIT ORIGINS", cumulative: "CUMULATIVE ELEV / DROP",
    results: "TRANSIT TIMES 2025", log: "GRID LOG", bigLabel: "LEAD ELEVATION",
  },
  resultsTags: ["UNITS", "RESERVE"],
  legend: [[false, "U1 · 2025"], [false, "U2 · 2025"], [true, "GATE CLOSE"], [false, "ROUTE"]],

  kpis: [
    { id: "km", label: "LEAD · KM" },
    { id: "alt", label: "ELEVATION · M" },
    { id: "dplus", label: "RISE CUMUL · M" },
    { id: "next", label: "NEXT GATE" },
  ],

  race: {
    name: "Cinder Convoy", edition: 2026,
    km: 95, cutoff: 36, posts: 10, field: 220,
    start: "ROLL OUT · BEACON 01", startHour: 4,
    days: ["D1", "D2", "D3", "D4", "D5"],
    leaderHours: 14.8,
    postNames: ["BEACON 01", "ASH FLAT", "CALDERA RIM", "OBSIDIAN GATE", "FUMAROLE", "CRATER VIEW",
      "SOUTH SPUR", "LAVA BENCH", "BASALT FIELD", "BEACON 12"],
    nations: ["ISL", "ITA", "JPN", "MEX", "NZL", "CHL", "IDN", "ETH"],
    targets: [["RAPID", 15, 20], ["STANDARD", 22, 30]],
  },

  geo: {
    seed: 90210, island: true, widthM: 48000, maxAlt: 2400,
    contourStep: 200, contourMinor: 40, vert: 4,
    peaks: ["MT. CINDER", "ASH MONT"],
    areas: ["CALDERA", "EAST FLANK", "OBSIDIAN FIELD"],
  },

  globe: { hub: [-8.34, 115.5], hubLabel: "GRID HUB · SECTOR 7" },

  view: { title: "CINDER CONVOY", tagline: "22.03.26 · 04H00" },

  log: {
    start: "ROLL OUT · BEACON 01, SECTOR 7",
    pass: (key, name, c, clock) => `${key} ${name} · GATE ${c.code} ${c.name} · km ${c.km.toFixed(1)} · ${c.alt} m · ${clock}`,
    finish: (key, name, where, clock) => `${key} ${name} · DOCKED ${where} · ${clock}`,
    cutoff: (c, wall) => `GATE ${c.code} ${c.name} CLOSED · ${wall}`,
  },
};
