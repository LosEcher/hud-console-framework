// Entry point: loads a theme, synthesizes its data model, wires every panel and runs
// the frame loop. A theme is a plain config object (see themes/*.js) — switching themes
// re-applies CSS tokens and rebuilds all views, nothing here knows any business meaning.

import { buildModel, raceClock, wallClockFactory } from "../core/synth.js";
import { createTerrain } from "./terrain3d.js";
import { createGlobe } from "./globe.js";
import { raceRing, elevationProfile, gradientPerKm, cumulative, raceFormats, finishTimes } from "./panels2d.js";
import { groupDigits } from "../core/util.js";
import { scramble, pick, startChrome } from "../core/chrome.js";
import { startSparks } from "../core/sparks.js";
import { refreshPalette, pal, acStr } from "../core/palette.js";

const $ = (id) => document.getElementById(id);

const THEME_IDS = ["ember", "orbital", "cinder"];

// URL-level accent override: ?accent=rrggbb re-inks the whole console regardless
// of the active theme (light scheme included). Same contract as lab.html.
const ACCENT_OVERRIDE = (() => {
  const v = (new URLSearchParams(location.search).get("accent") || "").replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(v) ? "#" + v.toLowerCase() : null;
})();

let stopLoop = null;
let sparks = null;
let currentTheme = THEME_IDS[0];

function ensureSparksCanvas() {
  let canvas = $("sparks");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "sparks";
    document.body.append(canvas);
  }
  return canvas;
}

async function applyTheme(id) {
  currentTheme = id;
  if (stopLoop) { stopLoop(); stopLoop = null; }
  const theme = (await import(`../../themes/${id}.js`)).default;
  document.body.dataset.theme = id;
  const r = document.documentElement.style;
  const light = document.documentElement.dataset.scheme === "light";
  if (light) {
    // paper/ink base comes from the :root[data-scheme="light"] block, but each
    // theme keeps its hue identity via a print-appropriate light accent
    // (bright glow colours go muddy on paper and must be re-inked per theme).
    for (const p of ["--bg", "--bg2"]) r.removeProperty(p);
    r.setProperty("--accent", theme.tokens.lightAccent ?? "#b35c00");
    r.setProperty("--accent-rgb", theme.tokens.lightAccentRgb ?? "179,92,0");
  } else {
    r.setProperty("--accent", theme.tokens.accent);
    r.setProperty("--accent-rgb", theme.tokens.accentRgb);
    r.setProperty("--bg", theme.tokens.bg ?? "#030304");
    r.setProperty("--bg2", theme.tokens.bg2 ?? "#0b0b0d");
  }
  r.setProperty("--accent-use", theme.tokens.accentUse ?? 1);
  if (ACCENT_OVERRIDE) {
    const n = parseInt(ACCENT_OVERRIDE.slice(1), 16);
    r.setProperty("--accent", ACCENT_OVERRIDE);
    r.setProperty("--accent-rgb", `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
  }
  refreshPalette();

  // ---------- spark embers ----------
  if (sparks) sparks.stop();
  const sparkPalette = light && theme.spark?.lightPalette ? theme.spark.lightPalette
    : theme.spark?.palette ?? [acStr()];
  sparks = startSparks(ensureSparksCanvas(), {
    seed: theme.geo.seed ?? 99173,
    ...(theme.spark ?? {}),
    palette: sparkPalette,
  });

  // brand & panel titles
  $("brand-name").textContent = theme.brand.name;
  $("brand-sub").textContent = theme.brand.sub;
  const P = theme.panels;
  const titles = {
    replay: P.replay, waypoints: P.waypoints, formats: P.formats, schedule: P.schedule,
    profile: P.profile, gradient: P.gradient, origins: P.origins, cumulative: P.cumulative,
    results: P.results, log: P.log,
  };
  const sections = document.querySelectorAll(".frame > aside .panel, .frame .center .row .panel");
  // map by panel content id for robustness
  const byId = {
    replay: "ring", waypoints: "checkpoints", formats: "formats", schedule: "finish",
    profile: "profile", gradient: "gradient", origins: "globe", cumulative: "cumulative",
    results: "results", log: "log",
  };
  for (const [key, elId] of Object.entries(byId)) {
    const el = $(elId);
    const panel = el?.closest(".panel");
    if (panel && titles[key]) panel.querySelector(".p-title").textContent = titles[key];
  }
  $("vp-title").textContent = P.vpTitle;
  $("vp-note").textContent = P.vpNote;
  $("replay-note").textContent = P.replayNote ?? "";
  $("wp-note").textContent = P.wpNote ?? "";
  $("big-label").textContent = P.bigLabel ?? "ALTITUDE";
  $("globe-hub").textContent = `HUB · ${theme.globe.hubLabel}`;
  $("profile-note").textContent = "";
  $("log").innerHTML = "";

  // ---------- data model ----------
  const model = buildModel(theme);
  const wallClock = wallClockFactory(model.meta.display);
  const [M1, F1] = model.runners;
  const { meta } = model;

  // ---------- checkpoints table ----------
  const posts = model.barriers;
  $("checkpoints").innerHTML = posts.map((c) => `
    <tr><td>${c.code}</td><td class="name">${c.name}</td><td class="num">${c.km.toFixed(1)}</td><td class="num">${c.alt}</td><td class="num">${wallClock(c.close)}</td></tr>`).join("");
  const postRows = [...$("checkpoints").rows];

  // ---------- results ----------
  const list = (rows, tag) => `<ol><h4>${tag}</h4>${rows.map(([name, nat, time], i) =>
    `<li data-h="${time.split(":").reduce((s, v, k) => s + Number(v) / 60 ** k, 0)}"><span>${i + 1}</span><span>${name} <small>${nat}</small></span><span>${time}</span></li>`).join("")}</ol>`;
  $("results").innerHTML = list(meta.results.men, theme.resultsTags?.[0] ?? "MEN") + list(meta.results.women, theme.resultsTags?.[1] ?? "WOMEN");
  const resultRows = [...$("results").querySelectorAll("li")];

  // ---------- globe ----------
  const nations = {};
  for (const [, nat] of [...meta.results.men, ...meta.results.women]) nations[nat] = (nations[nat] || 0) + 1;
  $("globe-note").textContent = `${Object.keys(nations).length} NATIONS`;
  const accentVec = pal.accent;
  const globe = createGlobe($("globe"), $("globe-hud"), $("globe-readout"), {
    hub: meta.display.hub,
    links: Object.entries(nations).slice(0, 12)
      .map(([nat, n]) => ({ lat: meta.display.hub[0] + (Math.random() * 50 - 25), lon: meta.display.hub[1] + (Math.random() * 80 - 40), label: `${nat} ×${n}` })),
    seed: theme.geo.seed ?? 42,
    accent: [accentVec[0] / 255, accentVec[1] / 255, accentVec[2] / 255],
  });

  // ---------- 3D terrain ----------
  const terrain = createTerrain($("terrain"), $("terrain-hud"), model, theme);
  const modeButtons = [...document.querySelectorAll("#realism button")];
  const setRealism = (on) => {
    terrain.setRealism(on);
    modeButtons.forEach((b) => b.classList.toggle("on", (b.dataset.real === "1") === on));
    try { localStorage.setItem("hud-real", on ? "1" : "0"); } catch {}
  };
  modeButtons.forEach((b) => b.addEventListener("click", () => setRealism(b.dataset.real === "1")));
  let savedReal = true;
  try { savedReal = localStorage.getItem("hud-real") !== "0"; } catch {}
  setRealism(savedReal);

  // ---------- KPIs ----------
  const kpiDefs = theme.kpis ?? [
    { id: "km", label: "M1 · KM" },
    { id: "alt", label: "ALTITUDE · M" },
    { id: "dplus", label: "D+ CUMUL · M" },
    { id: "next", label: "NEXT POST" },
  ];
  $("kpis").innerHTML = kpiDefs.map((k) => `<div><small>${k.label}</small><b id="kpi-${k.id}">—</b></div>`).join("");

  // ---------- panels ----------
  const A = acStr();
  const panels = [
    raceRing($("ring"), model, A),
    elevationProfile($("profile"), model, A),
    gradientPerKm($("gradient"), model, A),
    cumulative($("cumulative"), model, A),
    raceFormats($("formats"), meta, A),
    finishTimes($("finish"), meta, A),
  ];
  $("profile-note").textContent = `${model.total.toFixed(1)} KM · ${meta.race.dplus} D+`;

  // ---------- event log ----------
  const log = $("log");
  const L = theme.log;
  function logLine(hours, text, warn = false) {
    const li = document.createElement("li");
    li.innerHTML = `<time>${raceClock(hours)}</time><span></span>`;
    if (warn) li.classList.add("warn");
    log.prepend(li);
    while (log.children.length > 12) log.lastElementChild.remove();
    const span = li.querySelector("span");
    let i = 0;
    const type = () => {
      span.textContent = text.slice(0, ++i) + (i < text.length ? "▌" : "");
      if (i < text.length) setTimeout(type, 12);
    };
    type();
  }
  const passed = { M1: 0, F1: 0, cut: 0 };
  let lastHours = 0;
  function updateLog(h) {
    if (h < lastHours) {
      log.innerHTML = "";
      passed.M1 = passed.F1 = passed.cut = 0;
      logLine(0, L.start);
    }
    lastHours = h;
    for (const [key, runner] of [["M1", M1], ["F1", F1]]) {
      const km = model.runnerKm(runner, h);
      while (passed[key] < meta.checkpoints.length && meta.checkpoints[passed[key]].km <= km) {
        const c = meta.checkpoints[passed[key]++];
        if (c.code === "DEP") continue;
        logLine(h, c.code === "ARR"
          ? L.finish(key, runner.name, c.name, raceClock(runner.hours))
          : L.pass(key, runner.name, c, raceClock(h)));
      }
    }
    while (passed.cut < posts.length && posts[passed.cut].close <= h) {
      const c = posts[passed.cut++];
      if (c.code !== "DEP") logLine(h, L.cutoff(c, wallClock(c.close)), true);
    }
  }

  // ---------- KPI update ----------
  let lastKpi = 0;
  function updateKpis(h) {
    const p = model.at(model.runnerKm(M1, h));
    const next = model.nextCheckpoint(p.km);
    scramble($("kpi-km"), p.km.toFixed(1));
    scramble($("kpi-alt"), groupDigits(p.alt));
    if ($("kpi-dplus")) scramble($("kpi-dplus"), groupDigits(p.dplus));
    if ($("kpi-next")) $("kpi-next").textContent = h >= M1.hours ? "FINISH" : `${next.code} · ${next.km.toFixed(1)}`;
    $("profile-alt").textContent = `${groupDigits(p.alt)} m`;
    const lastPost = posts.filter((c) => c.km <= p.km + 1e-6).pop();
    postRows.forEach((row, i) => {
      row.classList.toggle("on", posts[i] === lastPost);
      row.classList.toggle("closed", posts[i].close < h);
    });
    const on = postRows.find((r) => r.classList.contains("on"));
    if (on) on.closest(".body").scrollTop = on.offsetTop - 40;
    resultRows.forEach((li) => li.classList.toggle("done", h >= Number(li.dataset.h)));
  }

  // ---------- chrome ----------
  const chrome = startChrome(theme, {
    legend: (theme.legend ?? [[false, `M1 · ${meta.results.year}`], [false, `F1 · ${meta.results.year}`], [true, "CUTOFF"], [false, "TRACE"]])
      .map(([accent, text]) => [accent, text]),
    footer: posts.slice(1).map((c) => [c.code, `${c.alt}`]),
  });

  // ---------- loop ----------
  let raf = 0, last = performance.now(), frameIndex = 0;
  const loop = (now) => {
    const t = now / 1000, dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const h = model.clock(t);
    terrain.frame(t, dt, h);
    globe.frame(t);
    for (const p of panels) p.frame(t, h);
    updateLog(h);
    if (t - lastKpi > 0.6) {
      lastKpi = t;
      updateKpis(h);
    }
    chrome(frameIndex++);
    raf = requestAnimationFrame(loop);
  };
  logLine(0, L.start);
  raf = requestAnimationFrame(loop);
  stopLoop = () => cancelAnimationFrame(raf);

  // theme switcher state
  document.querySelectorAll(".pages button").forEach((b) => b.classList.toggle("on", b.dataset.theme === id));
  try { localStorage.setItem("hud-theme", id); } catch {}
}

// theme switcher in the top bar
const pages = $("theme-nav") ?? document.createElement("div");
pages.className = "pages";
if (!pages.parentElement) $("ticker").after(pages);
for (const id of THEME_IDS) {
  const btn = document.createElement("button");
  btn.dataset.theme = id;
  btn.textContent = id.toUpperCase();
  btn.addEventListener("click", () => applyTheme(id));
  pages.append(btn);
}

// scheme switcher: dark phosphor vs light paper+ink; re-applies the theme so
// WebGL clouds baked with the old ink are rebuilt.
const schemes = $("scheme-nav") ?? document.createElement("div");
schemes.className = "pages";
schemes.id = "scheme-nav";
if (!schemes.parentElement) pages.after(schemes);
for (const s of ["dark", "light"]) {
  const btn = document.createElement("button");
  btn.dataset.scheme = s;
  btn.textContent = s.toUpperCase();
  btn.addEventListener("click", () => setScheme(s));
  schemes.append(btn);
}
function syncSchemeButtons() {
  const cur = document.documentElement.dataset.scheme === "light" ? "light" : "dark";
  schemes.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.scheme === cur));
}
function setScheme(s) {
  document.documentElement.dataset.scheme = s;
  try { localStorage.setItem("hud-scheme", s); } catch {}
  syncSchemeButtons();
  applyTheme(currentTheme);
}

let savedScheme = "dark";
try { savedScheme = localStorage.getItem("hud-scheme") || "dark"; } catch {}
const requestedScheme = new URLSearchParams(location.search).get("scheme");
if (requestedScheme === "light" || requestedScheme === "dark") savedScheme = requestedScheme;
document.documentElement.dataset.scheme = savedScheme;
syncSchemeButtons();

let initial = THEME_IDS[0];
try { initial = localStorage.getItem("hud-theme") || THEME_IDS[0]; } catch {}
const requested = new URLSearchParams(location.search).get("theme");
if (requested && THEME_IDS.includes(requested)) initial = requested;
if (!THEME_IDS.includes(initial)) initial = THEME_IDS[0];
applyTheme(initial);
