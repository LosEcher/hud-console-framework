// Dot globe: continents from a procedural land mask, graticule, accent arcs radiating
// from a hub with a pulse running along each arc, rotating bezel in the 2D overlay.

import { program, vao, fitCanvas, perspective, lookAt, mul, rotationYX, project } from "../core/glkit.js";
import { rng, makeNoise, fbmFactory } from "../core/util.js";
import { ink, pal } from "../core/palette.js";

const SPHERE_POINTS = 24000;
const TILT = 0.38;
const SPIN = 0.07;

const VS = `#version 300 es
uniform mat4 uVP, uModel;
uniform vec3 uCam;
uniform float uDpr, uTime;
in vec4 aPos;     // xyz + type (0 ocean, 1 land, 2 accent)
in float aT;      // position along an arc (-1 = not on arc)
out float vA;
out float vType;
out float vT;
void main() {
  vec4 wp = uModel * vec4(aPos.xyz, 1.0);
  gl_Position = uVP * wp;
  float facing = dot(normalize(wp.xyz), normalize(uCam - wp.xyz));
  float front = smoothstep(-0.05, 0.12, facing);
  float type = aPos.w;
  float rim = 1.0 - clamp(facing, 0.0, 1.0);
  if (type < 0.5)      { vA = mix(0.0, 0.14, front); gl_PointSize = 1.0 * uDpr; }
  else if (type < 1.5) { vA = mix(0.06, 0.6 + 0.4 * rim, front); gl_PointSize = 1.3 * uDpr; }
  else                 { vA = mix(0.25, 1.0, front); gl_PointSize = 2.6 * uDpr; }
  vType = type;
  vT = aT;
}`;

const FS = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uLines;
uniform vec3 uAccent;
uniform vec3 uInk;
in float vA;
in float vType;
in float vT;
out vec4 o;
void main() {
  float a = vA;
  if (uLines < 0.5) {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    a *= 1.0 - smoothstep(0.5, 1.0, length(c));
  }
  vec3 col = vType > 1.5 ? uAccent : uInk;
  if (vT >= 0.0) {                         // arc: trailing pulse behind the head
    float head = fract(uTime * 0.28 + (vType - 2.0) * 7.0);   // each arc its own phase
    float d = head - vT;
    if (d < 0.0) d += 1.0;
    a *= 0.18 + 1.6 * exp(-d * 9.0);
  }
  o = vec4(col * a, a);
}`;

const toVec = (lat, lon, r = 1) => {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
};

// low-res procedural continent mask (lon -180..180, lat 90..-90)
function makeLandMask(seed) {
  const W = 360, H = 180;
  const fbm = fbmFactory(makeNoise(seed ^ 0x9e37), 4);
  const bits = new Uint8Array((W * H) >> 3);
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    for (let x = 0; x < W; x++) {
      const lon = -180 + ((x + 0.5) / W) * 360;
      const n = fbm(lon / 55 + 3, lat / 38 - 7);
      const polar = Math.abs(lat) > 72 ? -0.3 : 0;   // keep poles ocean
      const land = n + polar > 0.18;
      if (land) {
        const i = y * W + x;
        bits[i >> 3] |= 1 << (7 - (i & 7));
      }
    }
  }
  return { W, H, bits };
}

// hub: [lat, lon]; links: [{ lat, lon, label }]
export function createGlobe(canvas, overlay, readout, { hub: HUB, links, seed = 42, accent = [1, 0.6, 0.24] }) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  const ctx = overlay.getContext("2d");
  const rand = rng(seed);

  const mask = makeLandMask(seed);
  const isLand = (lat, lon) => {
    const x = Math.min(mask.W - 1, Math.floor(((lon + 180) / 360) * mask.W));
    const y = Math.min(mask.H - 1, Math.floor(((90 - lat) / 180) * mask.H));
    const i = y * mask.W + x;
    return (mask.bits[i >> 3] >> (7 - (i & 7))) & 1;
  };

  // --- points: Fibonacci sphere filtered by the land mask ---
  const pts = [], ts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SPHERE_POINTS; i++) {
    const y = 1 - (2 * (i + 0.5)) / SPHERE_POINTS;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lon = ((((i * golden * 180) / Math.PI) % 360) + 360) % 360 - 180;
    const land = isLand(lat, lon);
    if (!land && i % 3) continue;
    pts.push(...toVec(lat, lon), land ? 1 : 0);
    ts.push(-1);
  }
  // accent cluster around the hub
  for (let i = 0; i < 260; i++) {
    const r = Math.sqrt(rand()) * 4.5, a = rand() * Math.PI * 2;
    pts.push(...toVec(HUB[0] + Math.sin(a) * r, HUB[1] + Math.cos(a) * r * 1.4, 1.002), 2);
    ts.push(-1);
  }
  const pointCount = ts.length;
  const pointProg = program(gl, VS, FS);
  const pointVao = vao(gl, pointProg, { aPos: { data: new Float32Array(pts), size: 4 }, aT: { data: new Float32Array(ts), size: 1 } });

  // --- lines: graticule + arcs + terminal spikes ---
  const lines = [];
  const lineT = [];
  const seg = (a, b, type, ta = -1, tb = -1) => { lines.push(...a, type, ...b, type); lineT.push(ta, tb); };
  for (let lat = -60; lat <= 60; lat += 30)
    for (let lon = -180; lon < 180; lon += 4) seg(toVec(lat, lon, 1.001), toVec(lat, lon + 4, 1.001), 0);
  for (let lon = -180; lon < 180; lon += 30)
    for (let lat = -88; lat < 88; lat += 4) seg(toVec(lat, lon, 1.001), toVec(lat + 4, lon, 1.001), 0);
  const gratCount = lineT.length;

  const hub = toVec(...HUB);
  for (const [ci, link] of links.entries()) {
    const type = 2 + ci * 0.05;
    const to = toVec(link.lat, link.lon);
    const angle = Math.acos(Math.min(1, hub[0] * to[0] + hub[1] * to[1] + hub[2] * to[2]));
    const STEPS = 64;
    let prev = null;
    for (let s = 0; s <= STEPS; s++) {
      const u = s / STEPS;
      const k0 = Math.sin((1 - u) * angle) / Math.sin(angle), k1 = Math.sin(u * angle) / Math.sin(angle);
      const lift = 1 + Math.sin(Math.PI * u) * angle * 0.22;
      const p = [0, 1, 2].map((i) => (hub[i] * k0 + to[i] * k1) * lift);
      if (prev) seg(prev.p, p, type, prev.u, u);
      prev = { p, u };
    }
    seg(toVec(link.lat, link.lon, 1.0), toVec(link.lat, link.lon, 1.12), type);
  }
  const lineVao = vao(gl, pointProg, { aPos: { data: new Float32Array(lines), size: 4 }, aT: { data: new Float32Array(lineT), size: 1 } });
  const lineCount = lineT.length;

  const eye = [0, 0, 3.3];
  const cities = links.map((l) => toVec(l.lat, l.lon, 1.0));

  function frame(t) {
    const { w, h, dpr } = fitCanvas(canvas);
    fitCanvas(overlay);
    const radiusPx = Math.min(w, h) * 0.4;
    const fov = 2 * Math.atan(Math.tan(Math.asin(1 / eye[2])) * (h / 2) / radiusPx);
    const vp = mul(perspective(fov, w / h, 0.1, 10), lookAt(eye, [0, 0, 0]));
    const yaw = (-HUB[1] * Math.PI) / 180 + t * SPIN - 0.6;
    const model = rotationYX(yaw, TILT);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(pal.bg[0] / 255, pal.bg[1] / 255, pal.bg[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(...(pal.isLight ? [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA] : [gl.ONE, gl.ONE]));
    gl.useProgram(pointProg.p);
    gl.uniformMatrix4fv(pointProg.u.uVP, false, vp);
    gl.uniformMatrix4fv(pointProg.u.uModel, false, model);
    gl.uniform3fv(pointProg.u.uCam, eye);
    gl.uniform1f(pointProg.u.uDpr, dpr);
    gl.uniform1f(pointProg.u.uTime, t);
    gl.uniform3f(pointProg.u.uAccent, ...accent);
    gl.uniform3f(pointProg.u.uInk, pal.fg[0] / 255, pal.fg[1] / 255, pal.fg[2] / 255);

    gl.uniform1f(pointProg.u.uLines, 1);
    gl.bindVertexArray(lineVao);
    gl.drawArrays(gl.LINES, 0, lineCount);
    gl.uniform1f(pointProg.u.uLines, 0);
    gl.bindVertexArray(pointVao);
    gl.drawArrays(gl.POINTS, 0, pointCount);
    gl.bindVertexArray(null);

    drawOverlay(t, w, h, dpr, mul(vp, model), radiusPx, yaw);
  }

  function drawOverlay(t, w, h, dpr, mvp, R, yaw) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    ctx.strokeStyle = ink(0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // slowly rotating graduated bezel
    const ring = R * 1.12;
    ctx.beginPath();
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2 - t * 0.05;
      const len = k % 10 === 0 ? 8 : 3;
      ctx.moveTo(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring);
      ctx.lineTo(cx + Math.cos(a) * (ring + len), cy + Math.sin(a) * (ring + len));
    }
    ctx.strokeStyle = ink(0.28);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${(accent[0]*255)|0},${(accent[1]*255)|0},${(accent[2]*255)|0},0.8)`;
    ctx.beginPath();
    ctx.arc(cx, cy, ring + 12, -t * 0.4, -t * 0.4 + 0.5);
    ctx.stroke();

    // visible city markers
    ctx.font = '8px "Plex", ui-monospace, monospace';
    ctx.textBaseline = "middle";
    cities.forEach((c, i) => {
      const p = project(mvp, c, w, h);
      if (!p || p[2] > eye[2] - 0.3) return;           // backface
      ctx.strokeStyle = `rgba(${(accent[0]*255)|0},${(accent[1]*255)|0},${(accent[2]*255)|0},0.9)`;
      ctx.strokeRect(p[0] - 3, p[1] - 3, 6, 6);
      ctx.fillStyle = ink(0.5);
      ctx.fillText(links[i].label, p[0] + 6, p[1]);
    });

    const lon = (((-yaw * 180) / Math.PI) % 360 + 540) % 360 - 180;
    readout.textContent = `LAT ${(TILT * 180 / Math.PI).toFixed(2)}N  LON ${Math.abs(lon).toFixed(2)}${lon < 0 ? "W" : "E"}`;
  }

  return { frame };
}
