// Spark system: embers drifting across the whole console on a flow field.
// White dust by default; a configurable share takes accent colours (one or many —
// several colours in the palette gives the "orange/red scatter" look). Coloured sparks
// can trail comet tails; every few seconds a bright comet is born and burns along the flow.
// All knobs come from tokens/base.json §spark; nothing here knows about themes.

import { rng, makeNoise, fbmFactory, clamp } from "./util.js";
import { ink, ac, pal, acStr } from "./palette.js";

export function startSparks(canvas, cfg) {
  const ctx = canvas.getContext("2d");
  const rand = rng(cfg.seed ?? 99173);
  const flow = fbmFactory(makeNoise((cfg.seed ?? 99173) ^ 0x51ab), 3);
  let config = { ...defaults, ...cfg };
  let particles = [], comets = [], nextComet = 0, running = true, raf = 0, last = performance.now();
  const dustBuckets = new Map();

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedParticles();
  };

  const targetCount = () => {
    const area = canvas.clientWidth * canvas.clientHeight;
    return Math.round((area / 1_000_000) * config.density);
  };

  function seedParticles() {
    const count = targetCount();
    particles = Array.from({ length: count }, () => ({
      x: rand() * canvas.clientWidth,
      y: rand() * canvas.clientHeight,
      px: 0, py: 0,
      size: config.sizeMin + rand() * (config.sizeMax - config.sizeMin),
      colored: rand() < config.ratio,
      color: config.palette[Math.floor(rand() * config.palette.length)],
      phase: rand() * Math.PI * 2,
      rate: 0.5 + rand() * 2,
    }));
    for (const p of particles) { p.px = p.x; p.py = p.y; }
  }

  const field = (x, y, t) => flow(x * config.turbulence + t * 0.02, y * config.turbulence - t * 0.013) * Math.PI * 2.4;

  function tick(now) {
    if (!running) return;
    const t = now / 1000;
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = pal.isLight ? "source-over" : (config.glow ? "lighter" : "source-over");
    ctx.globalAlpha = config.opacity;

    // comet births
    if (config.cometEvery > 0 && t > nextComet) {
      const color = config.palette[Math.floor(rand() * config.palette.length)] ?? acStr();
      comets.push({
        x: rand() * w, y: rand() * h, px: 0, py: 0,
        life: 0, ttl: 2.5 + rand() * 3, color,
        speed: 60 + rand() * 90,
      });
      const c = comets[comets.length - 1]; c.px = c.x; c.py = c.y;
      nextComet = t + config.cometEvery * (0.4 + rand() * 1.2);
    }

    // dust: batch fillStyle changes — quantize twinkle into 8 alpha buckets per
    // colour, one fillRect pass per bucket instead of one per particle
    dustBuckets.clear();
    for (const p of particles) {
      p.px = p.x; p.py = p.y;
      const a = field(p.x, p.y, t);
      const v = (8 + p.size * 6) * config.speed;
      p.x += Math.cos(a) * v * dt;
      p.y += Math.sin(a) * v * dt;
      if (p.x < -8) { p.x = w + 8; p.px = p.x; } else if (p.x > w + 8) { p.x = -8; p.px = p.x; }
      if (p.y < -8) { p.y = h + 8; p.py = p.y; } else if (p.y > h + 8) { p.y = -8; p.py = p.y; }
      const tw = 0.55 + 0.45 * Math.sin(t * p.rate + p.phase);
      const k = Math.min(7, (tw * 8) | 0);
      if (p.colored) {
        if (config.trails) {
          ctx.strokeStyle = `rgba(${p.color},${0.28 * tw})`;
          ctx.lineWidth = p.size * 0.7;
          ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        const key = p.color + k;
        let b = dustBuckets.get(key);
        if (!b) { b = { style: `rgba(${p.color},${(0.85 * (k + 0.5)) / 8})`, rects: [] }; dustBuckets.set(key, b); }
        b.rects.push(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        const key = "ink" + k;
        let b = dustBuckets.get(key);
        if (!b) { b = { style: ink((0.32 * (k + 0.5)) / 8), rects: [] }; dustBuckets.set(key, b); }
        b.rects.push(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    for (const b of dustBuckets.values()) {
      ctx.fillStyle = b.style;
      const r = b.rects;
      for (let i = 0; i < r.length; i += 4) ctx.fillRect(r[i], r[i + 1], r[i + 2], r[i + 3]);
    }

    // comets: bright head + segmented burning tail
    for (let i = comets.length - 1; i >=0; i--) {
      const c = comets[i];
      c.life += dt;
      if (c.life > c.ttl) { comets.splice(i, 1); continue; }
      c.px = c.x; c.py = c.y;
      const a = field(c.x, c.y, t) + Math.sin(c.life * 3) * 0.4;
      c.x += Math.cos(a) * c.speed * config.speed * dt;
      c.y += Math.sin(a) * c.speed * config.speed * dt;
      const fade = Math.sin((c.life / c.ttl) * Math.PI);   // in-out burn
      const segs = 6;
      for (let s = 0; s < segs; s++) {
        const u = s / segs;
        const tx = c.px + (c.x - c.px) * u - Math.cos(a) * s * 3;
        const ty = c.py + (c.y - c.py) * u - Math.sin(a) * s * 3;
        ctx.fillStyle = `rgba(${c.color},${(1 - u) * 0.5 * fade})`;
        const sz = 2.6 * (1 - u * 0.6);
        ctx.fillRect(tx - sz / 2, ty - sz / 2, sz, sz);
      }
      ctx.fillStyle = ink(0.9 * fade);
      ctx.fillRect(c.x - 1.2, c.y - 1.2, 2.4, 2.4);
    }

    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  raf = requestAnimationFrame(tick);

  return {
    setConfig(patch) {
      const oldDensity = config.density;
      config = { ...config, ...patch };
      if (patch.palette && !patch.palette.length) config.ratio = 0;
      if (config.density !== oldDensity || patch.ratio !== undefined) seedParticles();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    },
  };
}

const defaults = {
  density: 110,
  ratio: 0.14,
  palette: ["255,154,60"],
  speed: 1,
  sizeMin: 0.8,
  sizeMax: 2.0,
  turbulence: 0.0016,
  glow: true,
  trails: true,
  cometEvery: 2.4,
  opacity: 0.6,
};
