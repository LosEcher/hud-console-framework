// Minimal WebGL2 kernel: programs, VAOs, canvas sizing, column-major matrices, world->screen projection.

export function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

// attribs: { aName: { data: Float32Array, size } }
export function vao(gl, prog, attribs) {
  const v = gl.createVertexArray();
  gl.bindVertexArray(v);
  for (const [name, { data, size }] of Object.entries(attribs)) {
    const loc = gl.getAttribLocation(prog.p, name);
    if (loc < 0) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  return v;
}

// Match canvas resolution to its CSS size. Returns CSS size and the used dpr.
// The expensive part (getBoundingClientRect → forced layout) runs ONCE per canvas
// and then only on ResizeObserver events, not every frame — ten canvases × 60fps
// of layout queries was this framework's hottest hidden cost.

const sizeCache = new WeakMap();
const sizeObserver = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver((entries) => {
      for (const e of entries) {
        const c = sizeCache.get(e.target);
        if (c) { c.w = e.contentRect.width; c.h = e.contentRect.height; }
      }
    })
  : null;

export function fitCanvas(canvas, maxDpr = 2) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  let c = sizeCache.get(canvas);
  if (!c) {
    const r = canvas.getBoundingClientRect();   // once per canvas lifetime
    c = { w: r.width, h: r.height };
    sizeCache.set(canvas, c);
    sizeObserver?.observe(canvas);
  }
  const w = Math.max(1, Math.round(c.w * dpr));
  const h = Math.max(1, Math.round(c.h * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w: c.w, h: c.h, dpr };
}

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAt(eye, target, up = [0, 1, 0]) {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

export function rotationYX(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return new Float32Array([
    cy, sp * sy, -cp * sy, 0,
    0, cp, sp, 0,
    sy, -sp * cy, cp * cy, 0,
    0, 0, 0, 1,
  ]);
}

// world point -> CSS pixels (null if behind the camera)
export function project(m, p, w, h) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const cw = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (cw <= 0.01) return null;
  return [(x / cw * 0.5 + 0.5) * w, (0.5 - y / cw * 0.5) * h, cw];
}

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalize(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
