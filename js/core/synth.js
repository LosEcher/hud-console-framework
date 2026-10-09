// Data layer: synthesizes a complete race/ops data model from a theme config + seed.
// Produces the same shape the original project baked offline (height grid, land classes,
// rivers, trace, checkpoints, results) — no baked assets required.
//
// Model API (consumed by terrain/globe/panels):
//   meta          everything visual + tabular, mirrors the original data/<race>.json
//   total         race length in km
//   runners       [{id, name, hours}]
//   barriers      checkpoints with a close time
//   at(km)        interpolated trace point {km,x,z,alt,dplus,dminus,lat,lon,index}
//   ground(x,z)   terrain altitude (m) at plan coordinates
//   land(x,z)     land cover class 0..10
//   cutoffKm(h)   where the cutoff barrier stands at race-hour h
//   runnerKm(r,h) km reached by runner at race-hour h (km-effort spread, an estimate)
//   clock(sec)    race hours from wall seconds (loops)
//   nextCheckpoint(km)

import { rng, makeNoise, fbmFactory, lerp, clamp, smoothstep } from "./util.js";

export const REPLAY_SECONDS_PER_HOUR = 3.2;
const LOOP_PAUSE_HOURS = 4;

const LAND = { water: 8, forest: 1, shrub: 2, grass: 3, rock: 6, snow: 7 };

export function buildModel(theme) {
  const seed = theme.geo.seed ?? 20261009;
  const rand = rng(seed);
  const noise = fbmFactory(makeNoise(seed), 5);

  // ---------- terrain grid ----------
  const W = 320, H = 280;
  const widthM = theme.geo.widthM ?? 60000;
  const cell = widthM / W;
  const depthM = cell * H;
  const island = theme.geo.island !== false;
  const maxAlt = theme.geo.maxAlt ?? 3000;
  const half = { x: widthM / 2, z: depthM / 2 };
  const heights = new Float32Array(W * H);
  const landCls = new Uint8Array(W * H);

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W - 0.5, v = (j + 0.5) / H - 0.5;
      const n = noise(u * 4.2 + 7.3, v * 4.2 - 2.1);          // main massifs
      const ridge = 1 - Math.abs(noise(u * 2.2 - 4.4, v * 2.2 + 9.7)); // ridged detail
      let h = (0.55 + 0.45 * n) * (0.45 + 0.55 * ridge);
      const d = Math.hypot(u * (island ? 1.15 : 0.7), v * (island ? 1.35 : 2.6));
      if (island) h = h * smoothstep(0.62, 0.18, d) - 0.06;   // falls into the sea
      else h = h * smoothstep(1.05, 0.55, d) * 0.9 + 0.12;    // massif cut by the grid edge
      const alt = h * maxAlt;
      const k = j * W + i;
      heights[k] = alt;
      if (alt < 1) landCls[k] = LAND.water;
      else if (alt > maxAlt * 0.78) landCls[k] = LAND.snow;
      else if (alt > maxAlt * 0.55) landCls[k] = LAND.rock;
      else {
        const m = noise(u * 9 + 31, v * 9 - 17);
        landCls[k] = m > 0.25 ? LAND.forest : m > -0.1 ? LAND.shrub : LAND.grass;
      }
    }
  }

  const ground = (mx, mz) => {
    const fi = (mx + half.x) / cell - 0.5, fj = (mz + half.z) / cell - 0.5;
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= W - 1 || j >= H - 1) return -50;
    const u = fi - i, v = fj - j, k = j * W + i;
    return (heights[k] * (1 - u) + heights[k + 1] * u) * (1 - v) + (heights[k + W] * (1 - u) + heights[k + W + 1] * u) * v;
  };
  const land = (mx, mz) => {
    const i = Math.floor((mx + half.x) / cell), j = Math.floor((mz + half.z) / cell);
    return i < 0 || j < 0 || i >= W || j >= H ? 0 : landCls[j * W + i];
  };

  // ---------- rivers: steepest descent from high random points ----------
  const rivers = [];
  const drop = () => {
    let x = (rand() * 2 - 1) * half.x * 0.55, z = (rand() * 2 - 1) * half.z * 0.55;
    if (ground(x, z) < maxAlt * 0.35) return;
    const pts = [];
    for (let s = 0; s < 400; s++) {
      pts.push(x, z);
      const e = 120;
      const gx = ground(x - e, z) - ground(x + e, z);
      const gz = ground(x, z - e) - ground(x, z + e);
      const len = Math.hypot(gx, gz) || 1;
      x += (gx / len) * e * 1.2 + (rand() - 0.5) * 90;
      z += (gz / len) * e * 1.2 + (rand() - 0.5) * 90;
      if (ground(x, z) < 1 || Math.abs(x) > half.x || Math.abs(z) > half.z) break;
    }
    if (pts.length > 16) rivers.push([50 + rand() * 900, ...pts]);
  };
  for (let r = 0; r < 10; r++) drop();

  // ---------- trace: noisy waypoint march over the terrain ----------
  const kmTarget = theme.race.km;
  let cx = 0, cz = 0;
  if (island) {                                    // start on the coast
    const a = rand() * Math.PI * 2;
    for (let r = half.x * 0.6; r > 0; r -= 200) {
      cx = Math.cos(a) * r; cz = Math.sin(a) * r * 0.8;
      if (ground(cx, cz) < 5) break;
    }
  } else {
    cx = -half.x * 0.85; cz = (rand() - 0.5) * half.z * 0.8;
  }
  const wpCount = 7;
  const waypoints = [];
  for (let k = 1; k <= wpCount; k++) {
    const a = (k / wpCount) * Math.PI * 2 + rand() * 0.6;
    const r = (island ? 0.55 : 0.75) * Math.min(half.x, half.z) * (0.4 + rand() * 0.6);
    waypoints.push([Math.cos(a) * r, Math.sin(a) * r * (island ? 0.85 : 0.7)]);
  }
  const pts = [];
  let km = 0, dplus = 0, dminus = 0, prev = null;
  const stepM = 60;
  const [hubLat, hubLon] = theme.globe?.hub ?? [0, 0];
  const push = () => {
    const alt = Math.max(0, ground(cx, cz));
    if (prev) {
      const d = Math.hypot(cx - prev[1], cz - prev[2]);
      km += d / 1000;
      dplus += Math.max(0, alt - prev[3]);
      dminus += Math.max(0, prev[3] - alt);
    }
    pts.push([km, cx, cz, alt, dplus, dminus,
      hubLat + cz / 111320, hubLon + cx / (111320 * Math.cos((hubLat * Math.PI) / 180))]);
    prev = pts[pts.length - 1];
  };
  push();
  let wpi = 0, guard = 0;
  while (km < kmTarget && guard++ < 40000) {
    const [tx, tz] = waypoints[wpi];
    const dx = tx - cx, dz = tz - cz;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 1500 && wpi < waypoints.length - 1) wpi++;
    const wob = noise(cx / 9000 + 40, cz / 9000 - 13) * 2.4;
    cx += ((dx / d) * Math.cos(wob) - (dz / d) * Math.sin(wob)) * stepM;
    cz += ((dx / d) * Math.sin(wob) + (dz / d) * Math.cos(wob)) * stepM;
    if (ground(cx, cz) < 1) { cx += (rand() - 0.5) * 800; cz += (rand() - 0.5) * 800; continue; }
    push();
  }
  const total = km;
  const totalDplus = Math.round(dplus);

  // ---------- checkpoints / barriers ----------
  const names = theme.race.postNames ?? [];
  const nPosts = theme.race.posts ?? 12;
  const checkpoints = [{ code: "DEP", name: names[0] ?? "START", km: 0, alt: Math.round(pts[0][3]), close: 0.5 }];
  for (let k = 1; k < nPosts; k++) {
    const atKm = (k / nPosts) * total;
    const i = pts.findIndex((p) => p[0] >= atKm);
    const p = pts[Math.max(0, i)];
    checkpoints.push({
      code: `CP${k}`, name: names[k] ?? `POST ${k}`, km: p[0], alt: Math.round(p[3]),
      close: +(total && (p[4] + p[0] * 100) / (totalDplus + total * 100) * 0.92 * theme.race.cutoff).toFixed(2),
    });
  }
  checkpoints.push({ code: "ARR", name: names[nPosts] ?? "FINISH", km: total, alt: Math.round(pts[pts.length - 1][3]) });
  const barriers = checkpoints.filter((c) => c.close !== undefined);

  // ---------- runners, results, histogram ----------
  const leaderH = theme.race.leaderHours ?? +(theme.race.cutoff * 0.36).toFixed(2);
  const secondH = +(leaderH * 1.22).toFixed(2);
  const natPool = theme.race.nations ?? ["FRA", "ESP", "USA", "JPN", "CHE", "NOR", "KEN", "COL"];
  const namePool = theme.race.athletes?.length ? theme.race.athletes : null;
  const mkName = (i) => namePool
    ? namePool[i % namePool.length]
    : `${String.fromCharCode(65 + ((i * 7) % 26))}. ${String.fromCharCode(65 + ((i * 13) % 26))}${"AEOUIS".split("")[i % 6]}${"LNMTR".split("")[i % 5].toLowerCase()}`;
  const hms = (h) => {
    const m = Math.round(h * 60);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
  };
  const results = {
    year: theme.race.edition ?? 2025,
    men: Array.from({ length: 10 }, (_, i) => [mkName(i), natPool[(i * 3) % natPool.length], hms(leaderH * (1 + i * 0.035 + rand() * 0.01))]),
    women: Array.from({ length: 10 }, (_, i) => [mkName(i + 11), natPool[(i * 5 + 1) % natPool.length], hms(secondH * (1 + i * 0.045 + rand() * 0.012))]),
  };
  const runners = [
    { id: "M1", name: results.men[0][0], hours: leaderH },
    { id: "F1", name: results.women[0][0], hours: +hmsToHours(results.women[0][2]).toFixed(2) },
  ];
  const bins = Math.ceil(theme.race.cutoff);
  const histogram = {
    year: results.year,
    men: Array.from({ length: bins }, (_, k) => Math.round(90 * Math.exp(-((k + 1 - leaderH * 1.15) ** 2) / 22) * (0.7 + rand() * 0.6))),
    women: Array.from({ length: bins }, (_, k) => Math.round(40 * Math.exp(-((k + 1 - secondH * 1.1) ** 2) / 26) * (0.7 + rand() * 0.6))),
  };

  // ---------- derived lookups ----------
  const effort = pts.map((p) => p[0] + p[4] / 100);
  const totalEffort = effort[effort.length - 1];

  function at(k) {
    k = clamp(k, 0, total);
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= k) lo = mid; else hi = mid;
    }
    const a = pts[lo], b = pts[hi];
    const u = b[0] > a[0] ? (k - a[0]) / (b[0] - a[0]) : 0;
    const mix = (i) => a[i] + (b[i] - a[i]) * u;
    return { km: k, x: mix(1), z: mix(2), alt: mix(3), dplus: mix(4), dminus: mix(5), lat: mix(6), lon: mix(7), index: lo };
  }
  function kmForEffort(e) {
    let lo = 0, hi = effort.length - 1;
    if (e >= effort[hi]) return total;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (effort[mid] <= e) lo = mid; else hi = mid;
    }
    const u = (e - effort[lo]) / (effort[hi] - effort[lo] || 1);
    return pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u;
  }
  function cutoffKm(h) {
    if (h <= 0) return 0;
    for (let k = 1; k < barriers.length; k++) {
      const a = barriers[k - 1], b = barriers[k];
      if (h <= b.close) return a.km + ((h - a.close) / (b.close - a.close)) * (b.km - a.km);
    }
    return total;
  }
  const loopHours = theme.race.cutoff + LOOP_PAUSE_HOURS;

  const meta = {
    race: {
      name: theme.race.name, edition: results.year,
      km: total, dplus: totalDplus, dminus: Math.round(dminus),
      cutoff: theme.race.cutoff, runners: theme.race.field ?? 2000,
      start: theme.race.start ?? "DAY 1 · 06:00",
    },
    trace: { points: pts },
    checkpoints, barriers, rivers,
    peaks: (theme.geo.peaks ?? ["SUMMIT", "NORTH PEAK"]).map((name, i) => {
      let bx = 0, bz = 0, best = -1;
      for (let s = 0; s < 400; s++) {
        const x = (rand() * 2 - 1) * half.x * 0.5, z = (rand() * 2 - 1) * half.z * 0.5;
        const a = ground(x, z);
        if (a > best) { best = a; bx = x; bz = z; }
      }
      return { name, x: bx + i * 3000, z: bz - i * 2400, alt: Math.round(best) };
    }),
    areas: (theme.geo.areas ?? ["BASIN", "RIDGE", "VALLEY"]).map((name) => ({
      name, x: (rand() * 2 - 1) * half.x * 0.5, z: (rand() * 2 - 1) * half.z * 0.5,
    })),
    races: theme.race.formats ?? [
      { name: theme.race.name, km: total, dplus: totalDplus, cutoff: theme.race.cutoff, start: "MAIN · D1", date: results.year },
      { name: `${theme.race.name} HALF`, km: +(total * 0.55).toFixed(1), dplus: Math.round(totalDplus * 0.5), cutoff: Math.round(theme.race.cutoff * 0.55), start: "HALF · D2", date: results.year },
      { name: "SHORT", km: +(total * 0.28).toFixed(1), dplus: Math.round(totalDplus * 0.25), cutoff: Math.round(theme.race.cutoff * 0.3), start: "SHORT · D2", date: results.year },
      { name: "VERTICAL", km: 8, dplus: 1200, cutoff: 5, start: "VK · D3", date: results.year },
    ],
    results, histogram,
    targets: theme.race.targets ?? [["ELITE", Math.floor(leaderH), Math.ceil(leaderH * 1.3)], ["FIELD", Math.ceil(leaderH * 1.4), Math.floor(theme.race.cutoff * 0.75)]],
    grid: { w: W, h: H, cell, widthM, depthM, minAlt: -200, maxAlt: Math.round(maxAlt) },
    display: {
      unitM: Math.round(widthM / 40),
      vert: theme.geo.vert ?? 3,
      altRef: Math.round(maxAlt * 0.9),
      rulerMax: Math.ceil(maxAlt / 500) * 500,
      profileMax: Math.ceil(maxAlt / 100) * 100,
      contourStep: theme.geo.contourStep ?? 250,
      contourMinor: theme.geo.contourMinor ?? 50,
      sea: island,
      named: ["DEP", "ARR"],
      profileCodes: ["DEP", "ARR"],
      hub: [hubLat, hubLon],
      startHour: theme.race.startHour ?? 6,
      days: theme.race.days ?? ["DAY1", "DAY2", "DAY3", "DAY4", "DAY5"],
      labelY: 3.2,
    },
  };

  return {
    meta, total, barriers, runners, at, ground, land, cutoffKm,
    clock: (seconds) => (seconds / (theme.race.secondsPerHour ?? REPLAY_SECONDS_PER_HOUR)) % loopHours,
    runnerKm: (runner, h) => kmForEffort(Math.min(1, h / runner.hours) * totalEffort),
    nextCheckpoint: (k) => checkpoints.find((c) => c.km > k + 1e-6) || checkpoints[checkpoints.length - 1],
  };
}

export function hmsToHours(hms) {
  const [h, m, s] = hms.split(":").map(Number);
  return h + m / 60 + s / 3600;
}

// T+27:30 style race clock; "DAY2 14:30" style wall clock from display.startHour/days
export function raceClock(h) {
  const m = Math.floor(h * 60);
  return `T+${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function wallClockFactory(display) {
  return (h) => {
    const abs = display.startHour + h;
    const day = Math.floor(abs / 24);
    const hh = Math.floor(abs % 24), mm = Math.floor((abs * 60) % 60);
    return `${display.days[Math.min(day, display.days.length - 1)]} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
}
