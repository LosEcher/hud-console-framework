// Theme "ember" — the reference theme: amber-on-black control-room language,
// originally shaped around an ultra-trail replay. Default face of the framework.

export default {
  id: "ember",
  tokens: { accent: "#ff9a3c", accentRgb: "255,154,60", lightAccent: "#b35c00", lightAccentRgb: "179,92,0" },
  spark: { density: 110, ratio: 0.14, palette: ["255,154,60"], lightPalette: ["179,92,0"], speed: 1, cometEvery: 2.4, opacity: 0.55 },

  brand: { name: "EMBER", sub: "DIAGONALE DES FOUS · 2026" },
  tag: "hud-framework · synthesized terrain",
  chrome: { codes: ["SYNC", "RELAY", "ACK", "HOLD"], copyright: "© HUD FRAMEWORK · EMBER THEME" },

  panels: {
    replay: "RACE REPLAY", replayNote: "1 H = 3.2 S",
    waypoints: "TIME BARRIERS", wpNote: "OFFICIAL 2026",
    formats: "GRAND RAID · RACES", schedule: "FINISH TIMES",
    vpTitle: "LA RÉUNION — OFFICIAL TRACE 2026", vpNote: "SAINT-PIERRE → SAINT-DENIS",
    profile: "ELEVATION PROFILE", gradient: "D+ / D− PER KM",
    origins: "TOP 20 · ORIGINS", cumulative: "CUMULATIVE D+ / D−",
    results: "RESULTS 2025", log: "RACE LOG", bigLabel: "M1 ALTITUDE",
  },
  resultsTags: ["MEN", "WOMEN"],
  legend: [[false, "M1 · 2025"], [false, "F1 · 2025"], [true, "BARRIÈRE"], [false, "TRACÉ 2026"]],

  kpis: [
    { id: "km", label: "M1 · KM" },
    { id: "alt", label: "ALTITUDE · M" },
    { id: "dplus", label: "D+ CUMUL · M" },
    { id: "next", label: "NEXT POST" },
  ],

  race: {
    name: "Diagonale des Fous", edition: 2026,
    km: 180, cutoff: 66, posts: 12, field: 3000,
    start: "DÉPART · RAVINE BLANCHE", startHour: 22,
    days: ["JEU", "VEN", "SAM", "DIM", "LUN"],
    leaderHours: 23.5,
    postNames: ["ST PIERRE", "LA POSSESSION", "MAFATE", "CILAOS", "ROQUE ECIRE", "BASSE VALLEE",
      "TROIS ROCHE", "DIMITILE", "PLAINE DES SABLES", "PAS DES SABLES", "BRAS SEC", "LA REDOUTE"],
    nations: ["FRA", "BEL", "ESP", "CHE", "NOR", "COL", "USA", "DEU"],
    targets: [["ÉLITE", 24, 30], ["PELOTON", 32, 50]],
  },

  geo: {
    seed: 20261009, island: true, widthM: 67500, maxAlt: 3052,
    contourStep: 250, contourMinor: 50, vert: 3.5,
    peaks: ["PITON DES NEIGES", "GRAND BÉNARE"],
    areas: ["CIRQUE DE MAFATE", "CIRQUE DE CILAOS", "PLAINE DES PALMISTES"],
  },

  globe: { hub: [-21.13, 55.53], hubLabel: "LA RÉUNION" },

  view: { title: "DIAGONALE DES FOUS", tagline: "15.10.26 · 22H00" },

  log: {
    start: "DÉPART · RAVINE BLANCHE, SAINT-PIERRE",
    pass: (key, name, c, clock) => `${key} ${name} · ${c.code} ${c.name} · km ${c.km.toFixed(1)} · ${c.alt} m · ${clock}`,
    finish: (key, name, where, clock) => `${key} ${name} · ARRIVÉE ${where} · ${clock}`,
    cutoff: (c, wall) => `BARRIÈRE ${c.code} ${c.name} FERMÉE · ${wall}`,
  },
};
