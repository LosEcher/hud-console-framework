// STRAIT WATCH — chokepoint monitoring console (Bosphorus-style vessel transit).
// A demo of the HUD framework applied to maritime traffic: the same token-driven
// visual language (paper/ink light scheme, dot-cloud terrain, hairlines, brackets)
// carrying a completely different business model. All colours flow through
// palette.js; no hardcoded white/black; zero business meaning in the core layer.

import { fitCanvas } from "../core/glkit.js";
import { rng, hash, makeNoise, fbmFactory, clamp, lerp, groupDigits } from "../core/util.js";
import { pal, refreshPalette, ink, ac, fgStr, acStr, bgStr } from "../core/palette.js";
import { startChrome, scramble } from "../core/chrome.js";
import { startSparks } from "../core/sparks.js";
import { surface, dotBuckets, label, FONT } from "./panels2d.js";

const $ = (id) => document.getElementById(id);
const NM = 17;                      // strait length, nautical miles
const GATE_S = 0.06, GATE_N = 0.94; // gate positions along the channel (u)

// ---------------------------------------------------------------- data model
const NAMES = [
  "ORION", "KARA", "BOSPHORUS QUEEN", "AEGEAN WIND", "MERIDIAN", "CASPIAN EAGLE",
  "HALYCON", "MARMARA STAR", "NORTH DAWN", "ARGONAUT", "VELA", "PROPONTIS",
  "KERCH ROVER", "THRACIAN SEA", "ZEPHYR", "ANATOLIA", "SOLIDARITY", "DARDANUS",
];
const FLAGS = ["MALTA", "PANAMA", "LIBERIA", "MARSHALL IS", "TURKIYE", "GREECE", "CYPRUS", "BAHAMAS"];
const TYPES = [
  ["CRUDE TANKER", "CRUDE OIL"], ["CONTAINER", "GEN CARGO"], ["BULK CARRIER", "GRAIN"],
  ["LNG CARRIER", "LNG"], ["PRODUCT TANKER", "FUEL OIL"], ["RORO", "VEHICLES"],
  ["CONTAINER", "CONTAINERS"], ["GENERAL CARGO", "STEEL COILS"], ["CHEM TANKER", "CHEMICALS"],
];
const GREEK = "ABΓΔEZHΘIKΛMNΞOΠPΣTΥΦXΨΩ";

const rand = rng(20261012);
const pick = (l) => l[Math.floor(rand() * l.length)];

function makeVessel() {
  const [type, cargo] = pick(TYPES);
  const name = `MV ${pick(NAMES)}`;
  return {
    id: Math.floor(100000 + rand() * 899999),
    name, type, cargo,
    imo: String(Math.floor(9000000 + rand() * 999999)),
    flag: pick(FLAGS),
    loa: Math.round(90 + rand() * 240),          // m
    draft: (6 + rand() * 9).toFixed(1),          // m
    speed: 6 + rand() * 6.5,                     // kn
    score: Math.round(58 + rand() * 41),         // 58..99
    state: "WAIT",                               // WAIT | TRANSIT
    u: 0.14, dwell: 1 + rand() * 5,              // h at anchorage
    phase: rand() * Math.PI * 2,
    trail: [],
    hdg: 11,
  };
}

const vessels = [];
for (let i = 0; i < 12; i++) {
  const v = makeVessel();
  if (i < 5) { // anchored at V-12, staggered dwell
    v.slot = i;
    v.dwell = 0.3 + i * 0.9 + rand() * 1.5;
  } else {
    v.state = "TRANSIT";
    v.u = 0.2 + (i - 5) * 0.105 + rand() * 0.04;
  }
  vessels.push(v);
}
let selected = vessels[7];
let clearedCount = 0;
let queueHistory = [];
let windDir = 38, windSpd = 9.4; // from NE, m/s

// ---------------------------------------------------------------- channel geometry
let S = [];            // path samples {x,y,u,tx,ty,hw} in px
let byY = [];          // sample indices sorted by y
let mapW = 0, mapH = 0;

function buildPath(w, h) {
  const minWH = Math.min(w, h);
  const gauss = (u, c, s) => Math.exp(-((u - c) ** 2) / (2 * s * s));
  const N = 241;
  S = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const x = (0.5 + 0.17 * Math.sin(u * 2.3 * Math.PI + 0.5) + 0.045 * Math.sin(u * 5.1 * Math.PI + 1.3)) * w;
    const y = (0.965 - u * 0.9) * h;
    S.push({ x, y, u, hw: minWH * (0.042 + 0.05 * (gauss(u, 0.14, 0.06) + gauss(u, 0.86, 0.06))), tx: 0, ty: 0 });
  }
  for (let i = 0; i < N; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(N - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    S[i].tx = dx / L; S[i].ty = dy / L;
  }
  byY = S.map((_, i) => i).sort((a, b) => S[a].y - S[b].y);
}

// distance to channel centreline -> { d, u, hw } (windowed search: path is monotone in y)
function channelAt(px, py) {
  let lo = 0, hi = byY.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (S[byY[mid]].y < py) lo = mid + 1; else hi = mid; }
  let best = 1e9, bi = byY[lo];
  for (let k = Math.max(0, lo - 12); k <= Math.min(byY.length - 1, lo + 12); k++) {
    const s = S[byY[k]];
    const d = (s.x - px) ** 2 + (s.y - py) ** 2;
    if (d < best) { best = d; bi = byY[k]; }
  }
  return { d: Math.sqrt(best), u: S[bi].u, hw: S[bi].hw };
}

function posAt(u) {
  const f = clamp(u, 0, 1) * (S.length - 1);
  const i = Math.floor(f), t = f - i;
  const a = S[i], b = S[Math.min(S.length - 1, i + 1)];
  return {
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
    tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t), hw: lerp(a.hw, b.hw, t),
  };
}

// ---------------------------------------------------------------- static map layer
const mapCanvas = $("map");
let staticLayer = null;
let staticKey = "";
const coastNoise = fbmFactory(makeNoise(77031), 4);
const elevNoise = fbmFactory(makeNoise(41007), 4);

function renderStatic() {
  const { w, h } = fitCanvas(mapCanvas);
  mapW = w; mapH = h;
  buildPath(w, h);
  staticLayer = document.createElement("canvas");
  staticLayer.width = mapCanvas.width; staticLayer.height = mapCanvas.height;
  const ctx = staticLayer.getContext("2d");
  ctx.setTransform(mapCanvas.width / w, 0, 0, mapCanvas.height / h, 0, 0);
  ctx.font = `8px ${FONT}`;
  ctx.textBaseline = "middle";

  // graticule
  ctx.strokeStyle = ink(0.08);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 110; x < w; x += 110) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 110; y < h; y += 110) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  for (let x = 110, k = 0; x < w; x += 110, k++) label(ctx, `028°${50 + k * 5}′E`, x + 3, h - 7, "left", ink(0.3));
  for (let y = 110, k = 0; y < h; y += 110, k++) label(ctx, `40°${55 + k * 5}′N`, 4, y - 6, "left", ink(0.3));

  // dot-cloud landmasses (halftone terrain, coast fading)
  const dots = dotBuckets(8);
  const step = 4;
  for (let gy = 0; gy < h; gy += step) {
    for (let gx = 0; gx < w; gx += step) {
      const px = gx + hash(gx, gy) * 2.4, py = gy + hash(gy, gx) * 2.4;
      const { d, hw } = channelAt(px, py);
      const coast = hw * (1 + 0.55 * coastNoise(px * 0.008, py * 0.008));
      if (d > coast) {
        const e = elevNoise(px * 0.006 + 31, py * 0.006 + 7) * 0.5 + 0.5;
        const a = (0.09 + 0.42 * e) * clamp((d - coast) / 34, 0.15, 1);
        dots.add(px, py, 1 + e * 1.1, a);
      } else if (layers.bathymetry && d < hw * 0.92 && hash(gx * 3, gy * 7) < 0.4) {
        dots.add(px, py, 1, 0.3); // depth soundings
      }
    }
  }
  dots.flush(ctx);

  // a few numeric soundings
  if (layers.bathymetry) {
    const sndRand = rng(99);
    for (let k = 0; k < 7; k++) {
      const u = 0.08 + sndRand() * 0.84, p = posAt(u);
      const off = (sndRand() - 0.5) * p.hw;
      label(ctx, `${Math.round(12 + sndRand() * 52)} M`, p.x + off, p.y, "center", ink(0.4));
    }
  }

  // traffic gates across the channel
  const gate = (u, name) => {
    const p = posAt(u);
    const nx = -p.ty, ny = p.tx;
    ctx.strokeStyle = ink(0.45);
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x - nx * p.hw * 0.9, p.y - ny * p.hw * 0.9);
    ctx.lineTo(p.x + nx * p.hw * 0.9, p.y + ny * p.hw * 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, name, p.x + nx * (p.hw + 12), p.y + ny * (p.hw + 12), "center", ink(0.55));
  };
  gate(GATE_S, "S-GATE");
  gate(GATE_N, "N-GATE");

  // anchorage bays
  if (layers.anchorage) {
    for (const [u, name] of [[0.14, "V-12 ANCHORAGE"], [0.86, "V-15 ANCHORAGE"]]) {
      const p = posAt(u);
      ctx.strokeStyle = ink(0.35);
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.hw * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const nx = -p.ty, ny = p.tx;
      label(ctx, name, p.x - nx * (p.hw * 0.55 + 12), p.y - ny * (p.hw * 0.55 + 12), "center", ink(0.45));
    }
  }

  // compass north + bearing ruler (chart furniture)
  const nx0 = w * 0.515, ny0 = 30;
  label(ctx, "N", nx0, ny0, "center", ink(0.7));
  ctx.strokeStyle = ink(0.5);
  ctx.beginPath(); ctx.moveTo(nx0, ny0 + 8); ctx.lineTo(nx0, ny0 + 16); ctx.stroke();
  const rx = w * 0.44, rw = w * 0.18, ry = h - 26;
  ctx.strokeStyle = ink(0.35);
  ctx.beginPath();
  for (let k = 0; k <= 24; k++) {
    const x = rx + (k / 24) * rw, tall = k % 6 === 0;
    ctx.moveTo(x, ry); ctx.lineTo(x, ry - (tall ? 9 : 5));
  }
  ctx.stroke();
  ["35", "00", "01", "02", "03"].forEach((t, k) => label(ctx, t, rx + (k / 4) * rw, ry + 8, "center", ink(0.45)));
  label(ctx, "011°T", rx + rw / 2, ry - 16, "center", ink(0.6));
  ctx.beginPath(); ctx.moveTo(rx + rw / 2, ry - 12); ctx.lineTo(rx + rw / 2, ry - 6); ctx.stroke();
}

// ---------------------------------------------------------------- layers
const layers = { tracks: true, anchorage: true, aisdark: false, bathymetry: false, weather: false };

// ---------------------------------------------------------------- ship sprite
function drawShip(ctx, v, x, y, ang, t) {
  const L = clamp(v.loa * 0.085, 13, 30), B = L * 0.24;
  const dark = layers.aisdark;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  // wake
  if (v.state === "TRANSIT" && !dark) {
    ctx.strokeStyle = ink(0.28);
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - L * 1.3, 0); ctx.stroke();
    ctx.setLineDash([]);
  }

  // hull
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.quadraticCurveTo(L * 0.32, -B / 2, -L * 0.26, -B / 2);
  ctx.lineTo(-L / 2, -B * 0.38);
  ctx.lineTo(-L / 2, B * 0.38);
  ctx.lineTo(-L * 0.26, B / 2);
  ctx.quadraticCurveTo(L * 0.32, B / 2, L / 2, 0);
  const isSel = v === selected;
  ctx.fillStyle = dark ? "transparent" : `rgba(${bgStr()},0.55)`;
  ctx.strokeStyle = isSel ? `rgb(${acStr()})` : ink(dark ? 0.75 : 0.9);
  ctx.lineWidth = isSel ? 1.4 : 1;
  if (dark) ctx.setLineDash([3, 2]);
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);

  // deck cargo blocks
  if (!dark) {
    ctx.fillStyle = ink(0.5);
    const rows = Math.max(2, Math.round(L / 7));
    for (let k = 0; k < rows; k++) {
      const bx = -L * 0.2 + (k / rows) * L * 0.44;
      ctx.fillRect(bx, -B * 0.26, L * 0.44 / rows - 1, B * 0.52);
    }
    // bridge block aft
    ctx.fillStyle = ink(0.85);
    ctx.fillRect(-L * 0.44, -B * 0.3, L * 0.12, B * 0.6);
    if (isSel) { // accent bay amidship
      ctx.fillStyle = `rgba(${acStr()},0.85)`;
      ctx.fillRect(-L * 0.02, -B * 0.26, L * 0.44 / rows - 1, B * 0.52);
    }
  }
  ctx.restore();

  // AIS-DARK ghost: last known position
  if (dark && v.trail.length > 4) {
    const g = v.trail[0];
    ctx.strokeStyle = ink(0.5);
    ctx.beginPath();
    ctx.moveTo(g.x - 4, g.y - 4); ctx.lineTo(g.x + 4, g.y + 4);
    ctx.moveTo(g.x + 4, g.y - 4); ctx.lineTo(g.x - 4, g.y + 4);
    ctx.stroke();
  }

  // label
  ctx.font = `7px ${FONT}`;
  label(ctx, v.name.replace("MV ", ""), x, y - L * 0.75, "center", isSel ? `rgba(${acStr()},0.95)` : ink(0.5));
}

// ---------------------------------------------------------------- map frame
const weather = Array.from({ length: 42 }, () => ({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.8 }));

function mapFrame(ctx, w, h, t, dt) {
  if (!staticLayer) return;
  ctx.drawImage(staticLayer, 0, 0, w, h);

  // wind streaks
  if (layers.weather) {
    const a = ((windDir + 180) % 360) * Math.PI / 180; // toward SW
    const vx = Math.cos(a), vy = Math.sin(a);
    ctx.strokeStyle = ink(0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const p of weather) {
      p.x += vx * p.v * dt * 0.05; p.y += vy * p.v * dt * 0.05;
      if (p.x < -0.05) p.x += 1.1; if (p.x > 1.05) p.x -= 1.1;
      if (p.y < -0.05) p.y += 1.1; if (p.y > 1.05) p.y -= 1.1;
      const x = p.x * w, y = p.y * h;
      ctx.moveTo(x, y); ctx.lineTo(x + vx * 14, y + vy * 14);
    }
    ctx.stroke();
  }

  // trails
  if (layers.tracks) {
    const dots = dotBuckets(6);
    for (const v of vessels) {
      if (v.state !== "TRANSIT") continue;
      v.trail.forEach((p, k) => {
        const f = k / v.trail.length;
        dots.add(p.x, p.y, 1, f * 0.45);
      });
    }
    dots.flush(ctx);
  }

  // ships
  for (const v of vessels) {
    let x, y, ang;
    if (v.state === "WAIT") {
      const p = posAt(0.14);
      const a = (v.slot / 5) * Math.PI * 2 + 0.6;
      const r = p.hw * 0.34;
      x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
      ang = a + Math.PI / 2 + Math.sin(t * 0.4 + v.phase) * 0.12; // slow yaw at anchor
    } else {
      const p = posAt(v.u);
      const lane = p.hw * 0.32;
      x = p.x - p.ty * lane; y = p.y + p.tx * lane;
      ang = Math.atan2(p.ty, p.tx);
      v.hdg = Math.round((Math.atan2(-p.ty, p.tx) * 180 / Math.PI + 360) % 360);
    }
    v.px = x; v.py = y;
    drawShip(ctx, v, x, y, ang, t);
  }

  // selection reticle
  const v = selected;
  if (v && v.px !== undefined) {
    const R = clamp(v.loa * 0.085, 13, 30) * 1.1 + 9;
    ctx.strokeStyle = `rgba(${acStr()},0.85)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 14;
    ctx.beginPath(); ctx.arc(v.px, v.py, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${acStr()},0.4)`;
    ctx.beginPath();
    ctx.moveTo(v.px - R - 16, v.py); ctx.lineTo(v.px - R + 4, v.py);
    ctx.moveTo(v.px + R - 4, v.py); ctx.lineTo(v.px + R + 16, v.py);
    ctx.moveTo(v.px, v.py - R - 16); ctx.lineTo(v.px, v.py - R + 4);
    ctx.moveTo(v.px, v.py + R - 4); ctx.lineTo(v.px, v.py + R + 16);
    ctx.stroke();
    // data tag
    const tx = v.px + R + 20, ty = v.py - R - 6;
    ctx.font = `7.5px ${FONT}`;
    label(ctx, v.name, tx, ty, "left", `rgba(${acStr()},0.95)`);
    label(ctx, `${v.state === "WAIT" ? "AT ANCHOR" : v.speed.toFixed(1) + " KN"} · HDG ${String(v.hdg).padStart(3, "0")}°`, tx, ty + 9, "left", ink(0.6));
    ctx.strokeStyle = `rgba(${acStr()},0.5)`;
    ctx.beginPath(); ctx.moveTo(v.px + R * 0.7, v.py - R * 0.7); ctx.lineTo(tx - 3, ty + 3); ctx.stroke();
  }
}

mapCanvas.addEventListener("click", (e) => {
  const r = mapCanvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = 30;
  for (const v of vessels) {
    if (v.px === undefined) continue;
    const d = Math.hypot(v.px - x, v.py - y);
    if (d < bd) { bd = d; best = v; }
  }
  if (best) { selected = best; syncTable(); }
});

// ---------------------------------------------------------------- simulation
function stepSim(dt, dtH, t) {
  for (const v of vessels) {
    if (v.state === "TRANSIT") {
      v.u += (v.speed * dtH) / NM;
      if (v.px !== undefined) {
        const last = v.trail[v.trail.length - 1];
        if (!last || Math.hypot(last.x - v.px, last.y - v.py) > 3) {
          v.trail.push({ x: v.px, y: v.py });
          if (v.trail.length > 70) v.trail.shift();
        }
      }
      if (v.u >= 1) { // cleared — respawn as a fresh arrival at V-12
        clearedCount++;
        logLine(`${v.name} CLEARED N-GATE · DWELL ${(v.dwell + (1 - v.u0 || 0)).toFixed(1)}H`);
        Object.assign(v, makeVessel(), { state: "WAIT", u: 0.14, slot: Math.floor(rand() * 5), dwell: 1 + rand() * 5 });
        syncTable();
      }
    } else {
      v.dwell -= dtH;
      if (v.dwell <= 0) {
        v.state = "TRANSIT";
        v.u = 0.14;
        v.u0 = v.u;
        v.trail.length = 0;
        logLine(`V-12 RELEASED ${v.name} · NORTHBOUND`);
      }
    }
  }
}

// ---------------------------------------------------------------- vessels table
function syncTable() {
  const rows = [...vessels].sort((a, b) => (b.state === "TRANSIT") - (a.state === "TRANSIT") || b.u - a.u);
  $("vessels").innerHTML = rows.map((v) => `
    <tr data-id="${v.id}" class="${v === selected ? "on" : ""}">
      <td class="name">${v.name}</td><td>${v.flag}</td>
      <td class="num">${v.state === "WAIT" ? "–" : v.speed.toFixed(1)}</td>
      <td class="num st-${v.state === "WAIT" ? "wait" : "go"}">${v.state === "WAIT" ? "ANC" : "TRN"}</td>
    </tr>`).join("");
  for (const tr of $("vessels").rows) {
    tr.addEventListener("click", () => {
      selected = vessels.find((v) => v.id === Number(tr.dataset.id));
      syncTable();
    });
  }
  const waiting = vessels.filter((v) => v.state === "WAIT").length;
  $("menu-queue").textContent = waiting;
  $("menu-vessels").textContent = vessels.length;
  $("vessels-note").textContent = `${waiting} AT ANCHOR`;
  $("vp-note").textContent = `BOSPHORUS · NORTHBOUND · ${vessels.length} VESSELS`;
}

// ---------------------------------------------------------------- alert feed
const feedEl = $("feed");
const feedItems = []; // { el, t, warn, crit }
const ALERT_TPL = [
  ["AIS GAP", (v) => `${v.name} · ${1 + Math.floor(Math.random() * 6)} MIN`, "warn"],
  ["SPEED DROP", (v) => `${v.name} · −${(1 + Math.random() * 3).toFixed(1)} KN`, "warn"],
  ["OFF-LANE", (v) => `${v.name} · ${(0.1 + Math.random() * 0.4).toFixed(1)} NM`, "crit"],
  ["UKC LOW", (v) => `${v.name} · ${(0.8 + Math.random() * 1.4).toFixed(1)} M`, "crit"],
  ["QUEUE +2", () => `N-GATE · CONVOY FORMING`, "warn"],
  ["AIS SIGNAL", (v) => `${v.name} · RESTORED`, ""],
];
let nextAlert = 4;

function pushAlert(t, ageSec = 0) {
  const [code, fmt, sev] = ALERT_TPL[Math.floor(Math.random() * ALERT_TPL.length)];
  const v = vessels[Math.floor(Math.random() * vessels.length)];
  const li = document.createElement("li");
  if (sev) li.classList.add(sev === "crit" ? "crit" : "warn");
  const now = new Date(Date.now() - ageSec * 1000);
  li.innerHTML = `<time>${now.toISOString().slice(11, 19)}</time><span class="code">${code}</span><span class="msg"></span><span class="sev">${sev ? sev.toUpperCase() : "INFO"}</span>`;
  feedEl.prepend(li);
  feedItems.push({ el: li, t: t - ageSec, warn: !!sev });
  while (feedItems.length > 9) { feedItems.shift().el.remove(); }
  // typewriter
  const text = fmt(v);
  const span = li.querySelector(".msg");
  let i = 0;
  const tw = () => { span.textContent = text.slice(0, ++i) + (i < text.length ? "▌" : ""); if (i < text.length) setTimeout(tw, 12); };
  tw();
}

// ---------------------------------------------------------------- event log
const logEl = $("log");
function logLine(text, warn = false) {
  const li = document.createElement("li");
  li.innerHTML = `<time>${new Date().toISOString().slice(11, 19)}</time><span></span>`;
  if (warn) li.classList.add("warn");
  logEl.prepend(li);
  while (logEl.children.length > 10) logEl.lastElementChild.remove();
  const span = li.querySelector("span");
  let i = 0;
  const tw = () => { span.textContent = text.slice(0, ++i) + (i < text.length ? "▌" : ""); if (i < text.length) setTimeout(tw, 12); };
  tw();
}

// ---------------------------------------------------------------- instruments
const beginMap = surface(mapCanvas);

// TRANSIT panel: per-vessel progress rows along the strait
const transitBegin = surface($("transit"));
function transitFrame(ctx, w, h, t) {
  const rows = [...vessels].sort((a, b) => b.u - a.u);
  const left = 62, right = w - 34, top = 6, rh = Math.min(13, (h - 22) / rows.length);
  // anchorage window + gates
  const X = (u) => left + u * (right - left);
  ctx.fillStyle = `rgba(${acStr()},0.06)`;
  ctx.fillRect(X(0.08), top, X(0.2) - X(0.08), rows.length * rh);
  for (const gu of [GATE_S, GATE_N]) {
    ctx.strokeStyle = ink(0.2);
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(X(gu), top); ctx.lineTo(X(gu), top + rows.length * rh); ctx.stroke();
    ctx.setLineDash([]);
  }
  label(ctx, "V-12", X(0.14), h - 6, "center", ink(0.4));
  label(ctx, "S", X(GATE_S), h - 6, "center", ink(0.4));
  label(ctx, "N", X(GATE_N), h - 6, "center", ink(0.4));
  rows.forEach((v, k) => {
    const y = top + k * rh + rh / 2;
    const isSel = v === selected;
    label(ctx, v.name.replace("MV ", "").slice(0, 10), left - 6, y, "right", isSel ? `rgba(${acStr()},0.95)` : ink(0.6));
    ctx.strokeStyle = ink(0.14);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    const x = X(v.u);
    if (v.state === "WAIT") {
      ctx.fillStyle = ink(0.35);
      for (let dx = -3; dx <= 3; dx += 3) ctx.fillRect(x + dx - 0.5, y - 2.5, 1, 5);
    } else {
      ctx.strokeStyle = isSel ? `rgb(${acStr()})` : ink(0.75);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = isSel ? `rgb(${acStr()})` : ink(0.95);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    label(ctx, v.state === "WAIT" ? "ANC" : `${Math.round(v.u * 100)}%`, right + 6, y, "left", ink(0.4));
  });
}

// TARGET INSPECTOR: side-profile hull + key/value block
const hullBegin = surface($("hull"));
function hullFrame(ctx, w, h, t) {
  const v = selected;
  if (!v) return;
  const pad = 8, W = w - pad * 2, H = h - pad * 2;
  const wl = pad + H * 0.66;                    // waterline
  const loaPx = W * 0.86, bowX = pad + W * 0.92, stX = bowX - loaPx;
  const draftPx = H * 0.3, free = H * 0.12;
  const sheerTop = wl - draftPx - free;
  const bob = v.state === "WAIT" ? Math.sin(t * 0.8 + v.phase) * 1.2 : 0;

  // waterline
  ctx.strokeStyle = ink(0.35);
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -t * 8;
  ctx.beginPath(); ctx.moveTo(pad, wl); ctx.lineTo(w - pad, wl); ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, "DRAFT " + v.draft + " M", w - pad, wl + 7, "right", ink(0.4));

  ctx.save();
  ctx.translate(0, bob);
  // hull body (side view, bow right): flat deck, raked stem, easy bilge
  ctx.beginPath();
  ctx.moveTo(stX + loaPx * 0.05, sheerTop);                    // stern deck
  ctx.lineTo(bowX - loaPx * 0.18, sheerTop);                   // deck line
  ctx.quadraticCurveTo(bowX - loaPx * 0.04, sheerTop + free * 0.7, bowX - loaPx * 0.01, wl - draftPx * 0.3); // stem
  ctx.quadraticCurveTo(bowX - loaPx * 0.06, wl + 1.5, stX + loaPx * 0.32, wl + 1.5); // forefoot to mid
  ctx.lineTo(stX + loaPx * 0.05, wl - draftPx * 0.12);         // bottom run to stern
  ctx.closePath();
  ctx.fillStyle = `rgba(${bgStr()},0.6)`;
  ctx.strokeStyle = ink(0.9);
  ctx.lineWidth = 1;
  ctx.fill(); ctx.stroke();
  // deck cargo blocks
  const isTanker = v.type.includes("TANKER") || v.type.includes("LNG");
  ctx.strokeStyle = ink(0.6);
  if (isTanker) {
    for (let k = 0; k < 4; k++) {
      const x = stX + loaPx * (0.24 + k * 0.13);
      ctx.beginPath(); ctx.arc(x, sheerTop, loaPx * 0.055, Math.PI, 0); ctx.stroke();
    }
  } else {
    ctx.fillStyle = ink(0.45);
    for (let k = 0; k < 8; k++) ctx.fillRect(stX + loaPx * (0.2 + k * 0.062), sheerTop - 5, loaPx * 0.05, 5);
    ctx.fillStyle = `rgba(${acStr()},0.8)`;
    ctx.fillRect(stX + loaPx * 0.39, sheerTop - 5, loaPx * 0.05, 5);
  }
  // bridge aft
  ctx.fillStyle = ink(0.8);
  ctx.fillRect(stX + loaPx * 0.03, sheerTop - 8, loaPx * 0.07, 8);
  ctx.restore();

  // LOA dimension
  const dy = pad + 2;
  ctx.strokeStyle = ink(0.45);
  ctx.beginPath();
  ctx.moveTo(stX, dy + 4); ctx.lineTo(stX, dy); ctx.lineTo(bowX, dy); ctx.lineTo(bowX, dy + 4);
  ctx.stroke();
  label(ctx, `LOA ${v.loa} M`, (stX + bowX) / 2, dy + 7, "center", ink(0.55));
}

const INSPECTOR_FIELDS = ["VESSEL", "IMO", "FLAG", "TYPE", "CARGO", "DRAFT", "SPEED", "HDG", "ETA", "SCORE"];
function syncInspector() {
  const v = selected;
  const etaH = v.state === "WAIT" ? v.dwell : ((1 - v.u) * NM) / v.speed;
  const eta = new Date(Date.now() + etaH * 3600e3).toISOString().slice(11, 16);
  const vals = {
    VESSEL: v.name, IMO: v.imo, FLAG: v.flag, TYPE: v.type, CARGO: v.cargo,
    DRAFT: `${v.draft} M`, SPEED: v.state === "WAIT" ? "0.0 KN" : `${v.speed.toFixed(1)} KN`,
    HDG: v.state === "WAIT" ? "—" : `${String(v.hdg).padStart(3, "0")}°T`,
    ETA: v.state === "WAIT" ? `RELEASE ${eta}` : `N-GATE ${eta}`,
    SCORE: `${v.score} / 100`,
  };
  $("inspector").innerHTML = INSPECTOR_FIELDS.map((k) => {
    const cls = k === "SCORE" ? (v.score >= 75 ? ' class="acc"' : ' class="score-bad"') : "";
    return `<dt>${k}</dt><dd${cls}>${vals[k]}</dd>`;
  }).join("");
  $("inspector-note").textContent = v.state === "WAIT" ? "AT ANCHOR · V-12" : `TRACKING · ${(v.u * NM).toFixed(1)} NM IN`;
}

// TRANSIT QUEUE: KPIs + sparkline
const sparkBegin = surface($("queue-spark"));
function queueFrame(ctx, w, h, t) {
  const left = 4, right = w - 4, base = h - 8, top = 8;
  ctx.strokeStyle = ink(0.15);
  ctx.beginPath(); ctx.moveTo(left, base); ctx.lineTo(right, base); ctx.stroke();
  const max = Math.max(8, ...queueHistory);
  const n = queueHistory.length;
  ctx.fillStyle = `rgba(${acStr()},0.7)`;
  queueHistory.forEach((q, k) => {
    const x = right - (n - 1 - k) * ((right - left) / 59);
    const y = base - (q / max) * (base - top);
    if (x < left) return;
    ctx.fillRect(x, y, 1.6, 1.6);
  });
  label(ctx, "QUEUE / 2 MIN", left, top - 3, "left", ink(0.4));
}

// ENVIRONMENT dial + KPIs
const windBegin = surface($("wind-dial"));
function windFrame(ctx, w, h, t) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6;
  ctx.strokeStyle = ink(0.3);
  ctx.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r1 = R - (k % 6 === 0 ? 6 : 3);
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = ink(0.15); ctx.stroke();
  const a = ((windDir + Math.sin(t * 0.5) * 6) * Math.PI) / 180;
  ctx.strokeStyle = `rgb(${acStr()})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * R * 0.35, cy + Math.sin(a) * R * 0.35); ctx.lineTo(cx + Math.cos(a) * R * 0.8, cy - Math.sin(a) * R * 0.8); ctx.stroke();
  ctx.fillStyle = `rgb(${acStr()})`;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * R * 0.8, cy - Math.sin(a) * R * 0.8);
  ctx.lineTo(cx + Math.cos(a + 2.6) * 5, cy - Math.sin(a + 2.6) * 5);
  ctx.lineTo(cx + Math.cos(a - 2.6) * 5, cy - Math.sin(a - 2.6) * 5);
  ctx.fill();
  ctx.lineWidth = 1;
  label(ctx, "N", cx, cy - R - 1, "center", ink(0.55));
  label(ctx, windSpd.toFixed(1), cx, cy - 3, "center", ink(0.95));
  ctx.font = `6.5px ${FONT}`;
  label(ctx, "M/S", cx, cy + 5, "center", ink(0.45));
  ctx.font = `8px ${FONT}`;
}

// SURVEILLANCE: AIS sweep radar with fading blips
const radarBegin = surface($("radar"));
let sweep = 0;
const blips = new Map(); // vessel id -> {a, r, ttl}
function radarFrame(ctx, w, h, t, dt) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8;
  ctx.strokeStyle = ink(0.18);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  sweep = (sweep + dt * 0.7) % (Math.PI * 2);
  ctx.strokeStyle = `rgba(${acStr()},0.6)`;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); ctx.stroke();
  // refresh blip when sweep passes a vessel
  for (const v of vessels) {
    if (v.px === undefined) continue;
    const a = Math.atan2(v.py - cy, v.px - cx);
    let diff = (a - sweep) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.06) {
      blips.set(v.id, { x: cx + (v.px / mapW - 0.5) * R * 1.7, y: cy + (v.py / mapH - 0.5) * R * 1.7, ttl: 1 });
    }
  }
  for (const [id, b] of blips) {
    b.ttl -= dt * 0.25;
    if (b.ttl <= 0) { blips.delete(id); continue; }
    const inside = Math.hypot(b.x - cx, b.y - cy) < R;
    if (!inside) continue;
    ctx.fillStyle = vessels.find((v) => v.id === id) === selected
      ? `rgba(${acStr()},${b.ttl})` : ink(0.75 * b.ttl);
    ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
  }
  label(ctx, "AIS · VHF CH-16", cx, h - 6, "center", ink(0.4));
}

// TRANSIT COUNT: 24h histogram + today
const countBegin = surface($("count"));
const hist = Array.from({ length: 24 }, (_, k) => Math.round(9 + Math.sin(k / 3.4) * 4 + hash(k, 3) * 5));
function countFrame(ctx, w, h, t) {
  const left = 4, right = w - 4, base = h - 12, top = 8;
  const max = Math.max(...hist) + 6;
  const col = (right - left) / 24;
  hist.forEach((n, k) => {
    const x = left + k * col;
    const done = k < new Date().getUTCHours();
    ctx.fillStyle = done ? ink(0.5) : ink(0.18);
    const bars = Math.round((n / max) * (base - top) / 3);
    for (let j = 0; j < bars; j++) ctx.fillRect(x, base - j * 3, Math.max(1, col - 2), 1.6);
  });
  // today accumulator (growing bar at current hour)
  const hr = new Date().getUTCHours();
  const today = Math.round(clearedCount + (hr / 24) * 8);
  const x = left + hr * col;
  const bars = Math.min(Math.round((base - top) / 3), Math.round(((today + clearedCount) / max) * (base - top) / 3) + 2);
  ctx.fillStyle = `rgba(${acStr()},0.85)`;
  for (let j = 0; j < bars; j++) ctx.fillRect(x, base - j * 3, Math.max(1, col - 2), 1.6);
  label(ctx, "TODAY " + groupDigits(clearedCount + today), right, top, "right", `rgba(${acStr()},0.9)`);
  label(ctx, "0H", left, h - 4, "left", ink(0.35));
  label(ctx, "12H", left + 12 * col, h - 4, "center", ink(0.35));
  label(ctx, "24H", right, h - 4, "right", ink(0.35));
}

// ---------------------------------------------------------------- chrome / sparks / scheme
const fakeTheme = {
  chrome: { codes: ["VTS", "PILOT", "TSS", "AIS", "UKC", "GATE", "CONVOY"], copyright: "© STRAIT WATCH" },
  tag: "CHOKEPOINT WATCH",
};
const chrome = startChrome(fakeTheme, {
  legend: [[false, "TRANSIT"], [true, "ANCHOR"], [false, "TRACK"], [true, "ALERT"]],
  footer: [["S-GATE", "OPEN"], ["V-12", "5 ANC"], ["N-GATE", "OPEN"], ["TSS", "2WAY"], ["AIS", "12 TRK"], ["UKC", "OK"], ["VHF", "16"]],
});

let sparks = null;
function restartSparks() {
  if (sparks) sparks.stop();
  let canvas = $("sparks");
  if (!canvas) { canvas = document.createElement("canvas"); canvas.id = "sparks"; document.body.append(canvas); }
  sparks = startSparks(canvas, {
    seed: 20261012, density: 70, ratio: 0.12, palette: [acStr()],
    speed: 0.7, cometEvery: 3.2, opacity: 0.55,
  });
}

const schemes = $("scheme-nav");
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
  refreshPalette();
  staticKey = "";       // force static layer rebuild with the new ink
  restartSparks();
}

// URL params: ?scheme= ?accent= (same contract as index.html)
{
  const q = new URLSearchParams(location.search);
  const v = (q.get("accent") || "").replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(v)) {
    const n = parseInt(v, 16);
    document.documentElement.style.setProperty("--accent", "#" + v.toLowerCase());
    document.documentElement.style.setProperty("--accent-rgb", `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
  }
}
let savedScheme = "light"; // this console lives on paper+ink, like the reference
try { savedScheme = localStorage.getItem("hud-scheme") || savedScheme; } catch {}
const requestedScheme = new URLSearchParams(location.search).get("scheme");
if (requestedScheme === "light" || requestedScheme === "dark") savedScheme = requestedScheme;
document.documentElement.dataset.scheme = savedScheme;
syncSchemeButtons();
refreshPalette();
restartSparks();

$("map-seal").textContent = "GRID WGS-84 · CHART 2425 · NOT FOR NAVIGATION";
logLine("WATCH OPENED · NORTHBOUND CONVOY ACTIVE");
// boot with a few recent alerts on the feed, like a real watch handover
pushAlert(0, 72); pushAlert(0, 44); pushAlert(0, 18);

// ---------------------------------------------------------------- main loop
let last = performance.now(), lastUi = 0, lastSpark = 0, lastCount = 0;
function loop(now) {
  const t = now / 1000, dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dtH = dt / 3600 * 900; // 900x time compression: 1s wall ≈ 15 min watch time

  stepSim(dt, dtH, t);

  // map (rebuild static layer on resize / scheme change)
  const key = `${mapCanvas.width}x${mapCanvas.height}:${document.documentElement.dataset.scheme}`;
  if (key !== staticKey) { staticKey = key; renderStatic(); }
  {
    const { ctx, w, h } = beginMap();
    mapFrame(ctx, w, h, t, dt);
  }
  {
    const { ctx, w, h } = transitBegin();
    transitFrame(ctx, w, h, t);
  }
  {
    const { ctx, w, h } = hullBegin();
    hullFrame(ctx, w, h, t);
  }
  {
    const { ctx, w, h } = sparkBegin();
    queueFrame(ctx, w, h, t);
  }
  {
    const { ctx, w, h } = windBegin();
    windFrame(ctx, w, h, t);
  }
  {
    const { ctx, w, h } = radarBegin();
    radarFrame(ctx, w, h, t, dt);
  }
  {
    const { ctx, w, h } = countBegin();
    countFrame(ctx, w, h, t);
  }

  // slow UI refreshes
  if (t - lastUi > 0.8) {
    lastUi = t;
    const waiting = vessels.filter((v) => v.state === "WAIT");
    const transit = vessels.length - waiting.length;
    scramble($("q-wait"), String(waiting.length).padStart(2, "0"));
    scramble($("q-dwell"), (waiting.reduce((s, v) => s + v.dwell, 0) / Math.max(1, waiting.length)).toFixed(1) + "H");
    scramble($("q-clear"), String(transit).padStart(2, "0"));
    scramble($("q-delta"), "+" + Math.max(0, waiting.length - 4));
    syncInspector();
    // active alerts = younger than 75s
    const active = feedItems.filter((f) => t - f.t < 75 && f.warn).length;
    scramble($("menu-alerts"), String(active));
    $("menu-alerts").parentElement.classList.toggle("hot", active > 0);
    $("feed-note").textContent = `${active} ACTIVE`;
  }
  if (t - lastSpark > 2) {
    lastSpark = t;
    queueHistory.push(vessels.filter((v) => v.state === "WAIT").length);
    if (queueHistory.length > 60) queueHistory.shift();
  }
  if (t - lastCount > 7) {
    lastCount = t;
    $("transit-note").textContent = `${vessels.filter((v) => v.state === "TRANSIT").length} IN TRANSIT`;
  }
  if (t > nextAlert) {
    nextAlert = t + 7 + Math.random() * 9;
    pushAlert(t);
  }

  chrome(Math.floor(t * 60));
  requestAnimationFrame(loop);
}

syncTable();
syncInspector();
requestAnimationFrame(loop);
