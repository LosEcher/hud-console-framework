// Main view: real terrain as a bokeh point cloud, contour lines, ground grid, rivers,
// the route with replayed runners, and a 2D annotation layer with glitch dressing.
// Driven entirely by the synthesized model + theme palette; no baked assets.

import { program, vao, fitCanvas, perspective, lookAt, mul, project } from "../core/glkit.js";
import { rng, smoothstep, clamp } from "../core/util.js";
import { raceClock } from "../core/synth.js";
import { ink, pal, fgStr, bgStr } from "../core/palette.js";

const GRID_HALF = 70;
const GRID_STEP = 2;
// Device-tier point budget (pattern borrowed from paper-design/shaders'
// resolveDeviceTier/clampAgentCount): weak GPUs get ~45% of the cloud.
const LOW_TIER = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const TIER_SCALE = LOW_TIER ? 0.45 : 1;
const SURFACE_POINTS = Math.round(240000 * TIER_SCALE);
const MIST_POINTS = Math.round(22000 * TIER_SCALE);
const SEA_POINTS = Math.round(26000 * TIER_SCALE);
const EDGE_FADE = 2.5;
const RIVER_STEP = 0.035;
const CANOPY = 0.05;
const REALISM_SPEED = 3;
const SCAN_PERIOD = 11;
const FOCUS_PERIOD = 14;

// land cover classes (ESA-style /10) : [rgb, density, gain] — natural but muted tones
const DEFAULT_LAND = [
  [[1, 1, 1], 1, 1],            // 0 off-map
  [[0.16, 0.6, 0.44], 1.35, 0.95],  // 1 forest
  [[0.45, 0.64, 0.36], 1.1, 0.95],  // 2 shrub
  [[0.62, 0.76, 0.4], 0.9, 1],      // 3 grassland
  [[0.92, 0.74, 0.44], 0.9, 1],     // 4 crops
  [[1, 0.62, 0.28], 1, 1.5],        // 5 built-up
  [[0.74, 0.72, 0.68], 1, 1],       // 6 bare rock
  [[0.84, 0.93, 1], 1.05, 1.3],     // 7 snow & ice
  [[0.32, 0.8, 0.86], 1, 1.2],      // 8 water
  [[0.42, 0.72, 0.64], 1, 1],       // 9 wetland
  [[0.64, 0.68, 0.58], 1, 1],       // 10 moss
];
const MIST = [0.88, 0.94, 1];
const SEA = [0.25, 0.5, 0.62];
const CONTOUR_TINT = [0.78, 1, 0.94];

const POINT_VS = `#version 300 es
uniform mat4 uVP;
uniform float uTime, uFocus, uAperture, uDpr, uGain, uScan, uReal;
uniform vec3 uInk;
in vec4 aPos;      // xyz + luminance
in vec3 aCol;      // natural colour, mixed with white by uReal
in float aSeed;
out float vA;
out float vRing;
out vec3 vCol;
void main() {
  vec4 c = uVP * vec4(aPos.xyz, 1.0);
  gl_Position = c;
  float coc = min(abs(c.w - uFocus) * uAperture, 30.0);   // circle of confusion, px
  float base = 1.0 + aSeed * 1.3;
  float size = base + coc;
  gl_PointSize = size * uDpr;
  float energy = (base * base) / (size * size);           // blur spreads light, adds none
  float twinkle = 0.82 + 0.18 * sin(uTime * (0.7 + aSeed * 2.5) + aSeed * 61.0);
  float scan = 1.0 + 2.2 * exp(-pow((aPos.y - uScan) * 5.0, 2.0)) * step(0.05, aPos.y);
  float fog = exp(-max(c.w - 40.0, 0.0) * 0.03);
  vA = aPos.w * energy * twinkle * scan * fog * uGain;
  vRing = smoothstep(5.0, 15.0, coc);
  vCol = mix(uInk, aCol, uReal);
}`;

const POINT_FS = `#version 300 es
precision highp float;
in float vA;
in float vRing;
in vec3 vCol;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  if (r > 1.0) discard;
  float disc = 1.0 - smoothstep(0.65, 1.0, r);
  float ring = smoothstep(0.55, 0.86, r) * (1.0 - smoothstep(0.88, 1.0, r));
  float a = mix(disc, disc * 0.22 + ring * 1.5, vRing);   // big bokeh = aperture ring
  o = vec4(vCol * (a * vA), a * vA);
}`;

const LINE_VS = `#version 300 es
uniform mat4 uVP;
uniform vec3 uCam;
uniform float uScan, uScanAmount;
in vec3 aPos;
in float aA;
out float vA;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  float d = length(aPos - uCam);
  float fog = exp(-max(d - 30.0, 0.0) * 0.035);
  float scan = 1.0 + uScanAmount * exp(-pow((aPos.y - uScan) * 2.5, 2.0));
  vA = aA * fog * scan;
}`;

const LINE_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
in float vA;
out vec4 o;
void main() { o = vec4(uColor * vA, vA); }`;

// glitch dressing over the 3D view: slice (offset band of the rendered frame), block, bar
function createGlitches(source, rand) {
  const glitches = [];
  let next = 1;
  return (ctx, w, h, dpr, t) => {
    if (t > next) {
      const burst = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < burst; k++) {
        const type = rand() < 0.45 ? "slice" : rand() < 0.75 ? "block" : "bar";
        glitches.push({
          type,
          x: rand() * w * 0.85,
          y: rand() * h * 0.85,
          w: type === "bar" ? w * (0.2 + rand() * 0.5) : 30 + rand() * 180,
          h: type === "bar" ? 1 + rand() * 2 : 6 + rand() * 40,
          shift: (rand() - 0.5) * 60,
          until: t + 0.06 + rand() * 0.35,
        });
      }
      next = t + 0.6 + rand() * 2.4;
    }
    for (let i = glitches.length - 1; i >= 0; i--) {
      const g = glitches[i];
      if (t > g.until) { glitches.splice(i, 1); continue; }
      if (g.type === "slice") {
        ctx.drawImage(source, g.x * dpr, g.y * dpr, g.w * dpr, g.h * dpr, g.x + g.shift, g.y, g.w, g.h);
      } else if (g.type === "block") {
        ctx.fillStyle = `rgb(${bgStr()})`;
        ctx.fillRect(g.x, g.y, g.w, g.h);
        ctx.fillStyle = ink(0.08);
        ctx.fillRect(g.x, g.y + g.h - 2, g.w * 0.6, 1);
      } else {
        ctx.fillStyle = ink(0.5);
        ctx.fillRect(g.x, g.y, g.w, g.h);
      }
    }
  };
}

export function createTerrain(canvas, overlay, model, theme) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  const ctx = overlay.getContext("2d");
  const rand = rng(theme.geo.seed ?? 2077);
  const { meta } = model;
  const D = meta.display;
  const ACCENT = theme.tokens.accentRgb;
  const CORRIDOR = theme.tokens.corridorRgb ?? ACCENT;
  const UNIT_M = D.unitM;
  const VERT = D.vert;
  const BASE = D.base || 0;
  const A = D.altRef;
  const WHITE = [pal.fg[0] / 255, pal.fg[1] / 255, pal.fg[2] / 255];
  const NAMED = new Set(D.named);
  const HALF_X = meta.grid.widthM / 2 / UNIT_M, HALF_Z = meta.grid.depthM / 2 / UNIT_M;
  const toY = (alt) => (Math.max(0, alt - BASE) * VERT) / UNIT_M;
  const edge = D.sea ? () => 1 : (x, z) => smoothstep(0, EDGE_FADE, Math.min(HALF_X - Math.abs(x), HALF_Z - Math.abs(z)));
  const altAt = (x, z) => model.ground(x * UNIT_M, z * UNIT_M);
  const height = (x, z) => toY(altAt(x, z));
  const world = (p) => [p.x / UNIT_M, height(p.x / UNIT_M, p.z / UNIT_M) + 0.03, p.z / UNIT_M];
  const LAND = theme.palette?.land ?? DEFAULT_LAND;

  // ---------- point cloud ----------
  const pointCount = SURFACE_POINTS + MIST_POINTS + (D.sea ? SEA_POINTS : 0);
  const pos = new Float32Array(pointCount * 4);
  const col = new Float32Array(pointCount * 3);
  const seedArr = new Float32Array(pointCount);
  const sun = [-0.45, 0.8, 0.4];
  const landAt = (x, z) => model.land(x * UNIT_M, z * UNIT_M);
  let n = 0;
  const push = (x, y, z, b, rgb) => {
    pos.set([x, y, z, b], n * 4);
    col.set(rgb, n * 3);
    seedArr[n] = rand();
    n++;
  };

  while (n < SURFACE_POINTS) {
    const x = (rand() * 2 - 1) * HALF_X, z = (rand() * 2 - 1) * HALF_Z;
    const alt = altAt(x, z);
    const [rgb, density, gain] = LAND[landAt(x, z)] ?? LAND[6];
    if (alt < 1 || rand() > (0.3 + 0.7 * smoothstep(BASE, 0.6 * A, alt)) * edge(x, z) * density) continue;
    const h = toY(alt), e = 0.08;
    const nx = height(x - e, z) - height(x + e, z), nz = height(x, z - e) - height(x, z + e), ny = 2 * e;
    const len = Math.hypot(nx, ny, nz);
    const light = Math.max(0, (nx * sun[0] + ny * sun[1] + nz * sun[2]) / len);
    const b = (0.22 + 0.78 * light) * (0.5 + 0.5 * smoothstep(BASE, A, alt)) * (0.55 + 0.45 * rand()) * gain;
    const canopy = rgb === LAND[1]?.[0] ? rand() * CANOPY : 0;
    push(x, h + Math.abs(rand() - rand()) * 0.03 + canopy, z, b, rgb);
  }
  const mistEnd = SURFACE_POINTS + MIST_POINTS;
  while (n < mistEnd) {
    const x = (rand() * 2 - 1) * HALF_X, z = (rand() * 2 - 1) * HALF_Z;
    const alt = altAt(x, z);
    if (rand() > smoothstep((A * 4) / 15, (A * 13) / 15, alt) * edge(x, z)) continue;
    push(x, toY(alt) + -Math.log(1 - rand()) * 0.5, z, 0.16 * rand(), MIST);
  }
  while (n < pointCount) {
    const x = (rand() * 2 - 1) * 34, z = (rand() * 2 - 1) * 34;
    if (altAt(x, z) > 0) continue;
    push(x, 0, z, 0.05 + 0.1 * rand(), SEA);
  }

  // ---------- contour lines (marching squares over the altitude grid) ----------
  const g = meta.grid;
  const cell = g.cell / UNIT_M;
  const gx = (i) => -HALF_X + (i + 0.5) * cell, gz = (j) => -HALF_Z + (j + 0.5) * cell;
  const minor = D.contourMinor || D.contourStep;
  const levels = D.sea ? [5] : [];
  for (let a = minor; a < g.maxAlt; a += minor) if (a > Math.max(0, g.minAlt)) levels.push(a);
  const levelAlpha = levels.map((l) => (l === 5 ? 0.55 : l % 1000 === 0 ? 0.42 : l % D.contourStep === 0 ? 0.26 : 0.1));
  const levelSegs = levels.map(() => 0);

  const contour = [], contourDots = [];
  const alts = new Float32Array(g.w * g.h);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) alts[j * g.w + i] = model.ground(gx(i) * UNIT_M, gz(j) * UNIT_M);
  const v = [0, 0, 0, 0], ci = [0, 1, 1, 0], cj = [0, 0, 1, 1];
  for (let j = 0; j < g.h - 1; j++) {
    for (let i = 0; i < g.w - 1; i++) {
      const k = j * g.w + i;
      v[0] = alts[k]; v[1] = alts[k + 1]; v[2] = alts[k + g.w + 1]; v[3] = alts[k + g.w];
      const lo = Math.min(...v), hi = Math.max(...v);
      if (hi <= levels[0] || lo > levels[levels.length - 1]) continue;
      for (let li = 0; li < levels.length; li++) {
        const level = levels[li];
        if (level < lo || level >= hi) continue;
        const y = toY(level) + 0.02;
        const edges = [];
        for (let e = 0; e < 4; e++) {
          const a = e, b = (e + 1) % 4;
          if ((v[a] > level) === (v[b] > level)) continue;
          const t = (level - v[a]) / (v[b] - v[a]);
          edges.push([-HALF_X + (i + ci[a] + (ci[b] - ci[a]) * t + 0.5) * cell, y, -HALF_Z + (j + cj[a] + (cj[b] - cj[a]) * t + 0.5) * cell]);
        }
        for (let e = 0; e + 1 < edges.length; e += 2) {
          const fade = levelAlpha[li] * edge(edges[e][0], edges[e][2]);
          if (fade < 0.01) continue;
          contour.push(...edges[e], fade, ...edges[e + 1], fade);
          if (levelAlpha[li] > 0.2 && levelSegs[li]++ % 19 === 0) contourDots.push(...edges[e], 0.85);
        }
      }
    }
  }

  // ---------- rivers ----------
  const river = [], riverDots = [];
  for (const [km2, ...xz] of meta.rivers) {
    const strength = clamp(0.12 + 0.16 * Math.log10(km2), 0.1, 0.6);
    let prev = null;
    for (let k = 0; k < xz.length; k += 2) {
      const x = xz[k] / UNIT_M, z = xz[k + 1] / UNIT_M;
      const p = [x, height(x, z) + 0.025, z, strength * edge(x, z) * (landAt(x, z) === 7 ? 0.2 : 1)];
      if (prev) {
        river.push(...prev, ...p);
        const steps = Math.ceil(Math.hypot(p[0] - prev[0], p[2] - prev[2]) / RIVER_STEP);
        for (let s = 0; s < steps; s++) {
          const u = s / steps, rx = prev[0] + (p[0] - prev[0]) * u, rz = prev[2] + (p[2] - prev[2]) * u;
          riverDots.push(rx, height(rx, rz) + 0.03, rz, prev[3] * 0.8);
        }
      }
      prev = p;
    }
  }

  // ---------- ground grid (sea level) ----------
  const grid = [], gridDots = [];
  for (let k = -GRID_HALF; k <= GRID_HALF; k += GRID_STEP) {
    const a = k % 10 === 0 ? 0.18 : 0.07;
    grid.push(k, 0, -GRID_HALF, a, k, 0, GRID_HALF, a);
    grid.push(-GRID_HALF, 0, k, a, GRID_HALF, 0, k, a);
    for (let m = -GRID_HALF; m <= GRID_HALF; m += GRID_STEP) gridDots.push(k, 0.01, m, 0.45);
  }

  const extra = new Float32Array([...contourDots, ...gridDots, ...riverDots]);
  const allPos = new Float32Array(pos.length + extra.length);
  allPos.set(pos);
  allPos.set(extra, pos.length);
  const totalPoints = allPos.length / 4;
  const allCol = new Float32Array(totalPoints * 3);
  allCol.set(col);
  const WATER = LAND[8][0];
  const riverStart = totalPoints - riverDots.length / 4;
  for (let i = pointCount; i < totalPoints; i++) allCol.set(i < riverStart ? WHITE : WATER, i * 3);
  const allSeed = new Float32Array(totalPoints);
  allSeed.set(seedArr);
  for (let i = seedArr.length; i < allSeed.length; i++) allSeed[i] = 0.4 + 0.3 * rand();

  const pointProg = program(gl, POINT_VS, POINT_FS);
  const pointVao = vao(gl, pointProg, {
    aPos: { data: allPos, size: 4 }, aCol: { data: allCol, size: 3 }, aSeed: { data: allSeed, size: 1 },
  });
  const lineProg = program(gl, LINE_VS, LINE_FS);
  const splitLines = (flat) => {
    const p = new Float32Array((flat.length / 4) * 3), a = new Float32Array(flat.length / 4);
    for (let i = 0; i < a.length; i++) {
      p.set(flat.slice(i * 4, i * 4 + 3), i * 3);
      a[i] = flat[i * 4 + 3];
    }
    return { p, a };
  };
  const c = splitLines(contour), gr = splitLines(grid), rv = splitLines(river);
  const contourVao = vao(gl, lineProg, { aPos: { data: c.p, size: 3 }, aA: { data: c.a, size: 1 } });
  const gridVao = vao(gl, lineProg, { aPos: { data: gr.p, size: 3 }, aA: { data: gr.a, size: 1 } });
  const riverVao = vao(gl, lineProg, { aPos: { data: rv.p, size: 3 }, aA: { data: rv.a, size: 1 } });
  const contourVerts = c.a.length, gridVerts = gr.a.length, riverVerts = rv.a.length;
  let real = 1, realTarget = 1;
  const tint = (rgb) => rgb.map((k) => 1 + (k - 1) * real);

  // ---------- route & posts in scene coordinates ----------
  const route = meta.trace.points.map((p) => ({ km: p[0], w: world({ x: p[1], z: p[2] }) }));
  const posts = meta.checkpoints.filter((cp) => !cp.code.startsWith("PR")).map((cp) => ({ ...cp, w: world(model.at(cp.km)) }));
  const peaks = meta.peaks.map((p) => ({ ...p, w: world(p) }));
  const areas = meta.areas.map((a) => ({ ...a, w: world(a) }));

  // ---------- camera ----------
  const HOME = { az: 0.35, el: 0.5, r: D.camR || 50 };
  const cam = { ...HOME, target: [0, 1.5, 0], idleSince: -10 };
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    cam.az = drag.az - (e.clientX - drag.x) * 0.005;
    cam.el = clamp(drag.el + (e.clientY - drag.y) * 0.004, 0.06, 1.35);
    cam.idleSince = performance.now() / 1000;
  });
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.r = clamp(cam.r * Math.exp(e.deltaY * 0.001), 14, 90);
    cam.idleSince = performance.now() / 1000;
  }, { passive: false });
  canvas.addEventListener("dblclick", () => Object.assign(cam, HOME));

  const drawGlitches = createGlitches(canvas, rand);
  const placed = [];
  const fits = (x, y, width, height) => {
    const r = [x, y - height / 2, x + width, y + height / 2];
    if (placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) return false;
    placed.push(r);
    return true;
  };
  const fps = { frames: 0, since: 0, value: 60 };

  function frame(t, dt, h) {
    const { w, h: H, dpr } = fitCanvas(canvas);
    fitCanvas(overlay);
    if (!drag && t - cam.idleSince > 4) cam.az += dt * 0.035;
    real += clamp(realTarget - real, -dt * REALISM_SPEED, dt * REALISM_SPEED);

    const eye = [
      cam.target[0] + cam.r * Math.cos(cam.el) * Math.sin(cam.az),
      cam.target[1] + cam.r * Math.sin(cam.el),
      cam.target[2] + cam.r * Math.cos(cam.el) * Math.cos(cam.az),
    ];
    const vp = mul(perspective((38 * Math.PI) / 180, w / H, 0.5, 260), lookAt(eye, cam.target));
    const phase = (t % FOCUS_PERIOD) / FOCUS_PERIOD;
    const pull = smoothstep(0.1, 0.4, phase) - smoothstep(0.6, 0.9, phase);
    const focus = cam.r * (0.7 + 0.4 * pull);
    const scanAlt = BASE + ((t % SCAN_PERIOD) / SCAN_PERIOD) * (A - BASE + 400) - 200;
    const scanY = toY(scanAlt);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(pal.bg[0] / 255, pal.bg[1] / 255, pal.bg[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(...(pal.isLight ? [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA] : [gl.ONE, gl.ONE]));

    gl.useProgram(lineProg.p);
    gl.uniformMatrix4fv(lineProg.u.uVP, false, vp);
    gl.uniform3fv(lineProg.u.uCam, eye);
    gl.uniform1f(lineProg.u.uScan, scanY);
    gl.uniform3f(lineProg.u.uColor, pal.fg[0] / 255, pal.fg[1] / 255, pal.fg[2] / 255);
    gl.uniform1f(lineProg.u.uScanAmount, 0);
    gl.bindVertexArray(gridVao);
    gl.drawArrays(gl.LINES, 0, gridVerts);
    gl.uniform1f(lineProg.u.uScanAmount, 3);
    gl.uniform3fv(lineProg.u.uColor, tint(CONTOUR_TINT));
    gl.bindVertexArray(contourVao);
    gl.drawArrays(gl.LINES, 0, contourVerts);
    gl.uniform1f(lineProg.u.uScanAmount, 0);
    gl.uniform3fv(lineProg.u.uColor, tint(WATER));
    gl.bindVertexArray(riverVao);
    gl.drawArrays(gl.LINES, 0, riverVerts);

    gl.useProgram(pointProg.p);
    gl.uniformMatrix4fv(pointProg.u.uVP, false, vp);
    gl.uniform1f(pointProg.u.uTime, t);
    gl.uniform1f(pointProg.u.uFocus, focus);
    gl.uniform1f(pointProg.u.uAperture, 0.5 * (H / 700));
    gl.uniform1f(pointProg.u.uDpr, dpr);
    gl.uniform1f(pointProg.u.uGain, pal.isLight ? 0.62 : 0.42);
    gl.uniform1f(pointProg.u.uScan, scanY);
    gl.uniform1f(pointProg.u.uReal, real);
    gl.uniform3f(pointProg.u.uInk, pal.fg[0] / 255, pal.fg[1] / 255, pal.fg[2] / 255);
    gl.bindVertexArray(pointVao);
    gl.drawArrays(gl.POINTS, 0, totalPoints);
    gl.bindVertexArray(null);

    fps.frames++;
    if (t - fps.since > 0.5) {
      fps.value = fps.frames / (t - fps.since);
      fps.frames = 0;
      fps.since = t;
    }
    drawOverlay({ t, w, h: H, dpr, vp, focus, scanAlt, hours: h });
  }

  function drawOverlay({ t, w, h, dpr, vp, focus, scanAlt, hours }) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const P = (p) => project(vp, p, w, h);
    ctx.font = '9px "Plex", ui-monospace, monospace';
    ctx.textBaseline = "middle";

    const leaderKm = model.runnerKm(model.runners[0], hours);
    const cutKm = model.cutoffKm(hours);
    placed.length = 0;
    drawAreas(P);
    drawRoute(P, leaderKm, cutKm);
    drawPeaks(P);
    drawPosts(P, leaderKm);
    drawRunners(P, t, hours, cutKm);
    drawLabel(P, t);
    drawRulers(w, h, scanAlt, leaderKm);

    ctx.fillStyle = ink(0.55);
    ctx.textAlign = "left";
    const az = (((cam.az * 180) / Math.PI) % 360 + 360) % 360;
    ctx.fillText(`CAM  AZ ${az.toFixed(1).padStart(5, "0")}°  EL ${((cam.el * 180) / Math.PI).toFixed(1)}°  R ${(cam.r * UNIT_M / 1000).toFixed(0)} km`, 46, 40);
    ctx.fillText(`FOCUS ${(focus * UNIT_M / 1000).toFixed(1)} km   VERT ×${VERT}   GRID ${meta.grid.cell} m`, 46, 53);
    ctx.textAlign = "right";
    ctx.fillText(`PTS ${totalPoints.toLocaleString("en-US")}   ${fps.value.toFixed(0)} FPS`, w - 120, h - 18);
    ctx.fillText(`SCAN ALT ${Math.max(0, scanAlt).toFixed(0)} m   ${raceClock(hours)}`, w - 120, h - 31);
    ctx.textAlign = "left";
    drawGlitches(ctx, w, h, dpr, t);
  }

  // route: covered part in accent, the rest in white dashes
  function drawRoute(P, leaderKm, cutKm) {
    const stroke = (from, to, style, width, dash) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let open = false;
      for (const r of route) {
        if (r.km < from || r.km > to) continue;
        const q = P(r.w);
        if (!q) { open = false; continue; }
        open ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        open = true;
      }
      ctx.stroke();
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (real > 0.01) {
      stroke(0, model.total, `rgba(${CORRIDOR},${0.05 * real})`, 18, []);
      stroke(0, model.total, `rgba(${CORRIDOR},${0.07 * real})`, 7, []);
    }
    stroke(0, model.total, ink(0.45), 1, [2, 3]);
    stroke(0, cutKm, `rgba(${ACCENT},0.35)`, 3, []);
    // leader glow as a wide translucent under-stroke instead of ctx.shadowBlur:
    // same halo, no per-frame offscreen rasterization, identical in both schemes
    stroke(0, leaderKm, `rgba(${ACCENT},${0.3 * real})`, 7, []);
    stroke(0, leaderKm, `rgba(${ACCENT},0.95)`, 1.6, []);
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
  }

  function pin(P, base, pinHeight, color, size = 6) {
    const b = P(base), top = P([base[0], base[1] + pinHeight, base[2]]);
    if (!b || !top) return null;
    ctx.strokeStyle = `rgba(${color},0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const q = P([base[0] + Math.cos(a) * 0.35, base[1], base[2] + Math.sin(a) * 0.35]);
      if (q) k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(top[0], top[1] + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(top[0], top[1], size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(${color},0.95)`;
    ctx.beginPath();
    ctx.arc(top[0], top[1], 1.6, 0, Math.PI * 2);
    ctx.fill();
    return top;
  }

  function drawPosts(P, leaderKm) {
    const next = model.nextCheckpoint(leaderKm);
    for (const p of [...posts].sort((a, b) => (b.code === next.code) - (a.code === next.code))) {
      const hot = p.code === next.code;
      const major = NAMED.has(p.code) || hot;
      const color = hot ? ACCENT : fgStr();
      const top = pin(P, p.w, major ? 2.2 : 1.4, color, major ? 6 : 4);
      if (!top) continue;
      const full = `${p.code} ${p.name.toUpperCase()}`;
      const roomy = major && fits(top[0] + 10, top[1], ctx.measureText(full).width + 4, 24);
      if (!roomy) fits(top[0] + 10, top[1] - 4, ctx.measureText(p.code).width + 4, 10);
      ctx.fillStyle = `rgba(${color},${major ? 0.9 : 0.55})`;
      ctx.fillText(roomy ? full : p.code, top[0] + 10, top[1] - 4);
      if (roomy) {
        ctx.fillStyle = `rgba(${color},0.45)`;
        ctx.fillText(`KM ${p.km.toFixed(1)} · ${p.alt} m`, top[0] + 10, top[1] + 7);
      }
    }
  }

  function drawPeaks(P) {
    for (const p of peaks) {
      const top = pin(P, p.w, 1.8, fgStr(), 5);
      if (!top) continue;
      ctx.fillStyle = ink(0.95);
      ctx.beginPath();
      ctx.moveTo(top[0] - 4, top[1] - 16); ctx.lineTo(top[0] + 4, top[1] - 16); ctx.lineTo(top[0], top[1] - 10);
      ctx.fill();
      if (!fits(top[0] + 9, top[1], ctx.measureText(p.name).width + 4, 24)) continue;
      ctx.fillText(p.name, top[0] + 9, top[1] - 4);
      ctx.fillStyle = ink(0.4);
      ctx.fillText(`${p.alt} m`, top[0] + 9, top[1] + 7);
    }
  }

  function drawAreas(P) {
    ctx.save();
    ctx.font = '8px "Plex", ui-monospace, monospace';
    ctx.textAlign = "center";
    for (const a of areas) {
      const q = P(a.w);
      if (!q) continue;
      ctx.fillStyle = ink(0.42);
      ctx.fillText(a.name.split("").join(" "), q[0], q[1]);
    }
    ctx.restore();
  }

  function drawRunners(P, t, hours, cutKm) {
    const marks = [
      ...model.runners.map((r) => ({ id: r.id, sub: r.name, km: model.runnerKm(r, hours), color: fgStr(), done: hours >= r.hours })),
      { id: "⌛", sub: "CUTOFF", km: cutKm, color: ACCENT },
    ];
    for (const [k, m] of marks.entries()) {
      const p = model.at(m.km);
      const q = P(world(p));
      if (!q) continue;
      const pulse = 4 + 3 * ((t * 1.5 + k * 0.3) % 1);
      ctx.strokeStyle = `rgba(${m.color},${0.9 - (pulse - 4) / 4})`;
      ctx.beginPath(); ctx.arc(q[0], q[1], pulse + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgb(${m.color})`;
      ctx.beginPath();
      ctx.moveTo(q[0], q[1] - 5); ctx.lineTo(q[0] + 4, q[1] + 3); ctx.lineTo(q[0] - 4, q[1] + 3);
      ctx.fill();
      const lx = q[0] - 18, ly = q[1] + 24 + k * 22;
      ctx.strokeStyle = `rgba(${m.color},0.5)`;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] + 4); ctx.lineTo(lx, ly - 6); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillStyle = `rgb(${m.color})`;
      ctx.fillText(`${m.id} ${m.done ? "FINISH" : `KM ${m.km.toFixed(1)}`}`, lx - 3, ly - 6);
      ctx.fillStyle = `rgba(${m.color},0.5)`;
      ctx.fillText(`${m.sub} · ${Math.round(p.alt)} m`, lx - 3, ly + 5);
      ctx.textAlign = "left";
    }
  }

  // tilted title board hovering above the start
  function drawLabel(P, t) {
    const start = posts[0].w;
    const o = [start[0] - 4, D.labelY || 3.2, start[2] + 3], W = 8.6, H = 1.6, yaw = 0.3;
    const ux = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const corner = (u, v) => P([o[0] + ux[0] * u, o[1] - v, o[2] + ux[2] * u]);
    const a = corner(0, 0), b = corner(W, 0), c = corner(W, H), d = corner(0, H);
    const anchor = P(start);
    if (!a || !b || !c || !d || !anchor) return;
    const flicker = Math.sin(t * 37) > 0.97 ? 0.35 : 1;
    ctx.strokeStyle = ink(0.75 * flicker);
    ctx.fillStyle = ink(0.035);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const mid = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(anchor[0], anchor[1]); ctx.stroke();
    ctx.setLineDash([]);

    const LW = 340, LH = 64;
    ctx.save();
    ctx.transform((b[0] - a[0]) / LW, (b[1] - a[1]) / LW, (d[0] - a[0]) / LH, (d[1] - a[1]) / LH, a[0], a[1]);
    ctx.fillStyle = ink(0.92 * flicker);
    ctx.font = '26px "Plex", ui-monospace, monospace';
    ctx.textBaseline = "middle";
    ctx.fillText(theme.view.title, 24, 24);
    const r = meta.race;
    const cutoff = Number.isInteger(r.cutoff) ? `${r.cutoff} H` : `${Math.floor(r.cutoff)}H${String(Math.round((r.cutoff % 1) * 60)).padStart(2, "0")}`;
    const line = `${theme.view.tagline} · ${r.km.toFixed(1)} KM · ${r.dplus} D+ · ${cutoff}`;
    ctx.font = '11px "Plex", ui-monospace, monospace';
    const size = Math.min(11, (11 * (LW - 72)) / ctx.measureText(line).width);
    ctx.font = `${size.toFixed(1)}px "Plex", ui-monospace, monospace`;
    ctx.fillStyle = ink(0.7);
    ctx.fillText(line, 64, 50);
    ctx.fillStyle = ink(0.8);
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(14 + k * 7, 56); ctx.lineTo(19 + k * 7, 56); ctx.lineTo(23 + k * 7, 44); ctx.lineTo(18 + k * 7, 44);
      ctx.fill();
    }
    ctx.restore();
    ctx.font = '9px "Plex", ui-monospace, monospace';
  }

  function drawRulers(w, h, scanAlt, leaderKm) {
    const MAX = D.rulerMax;
    const top = 70, bottom = h - 50, Y = (alt) => bottom - (alt / MAX) * (bottom - top);
    ctx.strokeStyle = ink(0.3);
    ctx.fillStyle = ink(0.32);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, top); ctx.lineTo(14, bottom);
    for (let a = 0; a <= MAX; a += 100) {
      ctx.moveTo(14, Y(a));
      ctx.lineTo(a % 500 === 0 ? 24 : 18, Y(a));
    }
    ctx.stroke();
    for (let a = 0; a <= MAX; a += 500) ctx.fillText(String(a), 28, Y(a));
    const s = Y(clamp(scanAlt, 0, MAX));
    ctx.fillStyle = ink(1);
    ctx.beginPath(); ctx.moveTo(14, s); ctx.lineTo(8, s - 4); ctx.lineTo(8, s + 4); ctx.fill();

    if (w < 700) return;
    ctx.textAlign = "right";
    const at = model.at(leaderKm).index;
    const pts = meta.trace.points;
    for (let k = -12; k <= 12; k++) {
      const p = pts[clamp(at + k * 3, 0, pts.length - 1)];
      const y = h / 2 + k * 15;
      ctx.fillStyle = k === 0 ? `rgb(${ACCENT})` : ink(0.32 - Math.abs(k) * 0.02);
      ctx.fillText(`${p[6].toFixed(5)}  ${p[7].toFixed(5)}  ${String(Math.round(p[3])).padStart(4, " ")}  ${p[0].toFixed(2).padStart(6, "0")}`, w - 16, y);
    }
    ctx.textAlign = "left";
  }

  return {
    frame,
    setRealism(on) { realTarget = on ? 1 : 0; },
  };
}
