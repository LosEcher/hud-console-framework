// Shared small tools: seeded rng, stable hash, 2D gradient noise (Perlin), interpolation, digit grouping.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// integer hash -> [0,1), stable: keeps scrolling dot clouds from flickering
export function hash(a, b = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 2D gradient noise, ~[-1, 1]
export function makeNoise(seed) {
  const rand = rng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    let X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y;
    X &= 255; Y &= 255;
    const u = fade(x), v = fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const top = lerp(grad(aa, x, y), grad(ba, x - 1, y), u);
    const bottom = lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u);
    return lerp(top, bottom, v);
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// fbm helper built on a noise function
export function fbmFactory(noise, octaves = 4) {
  return (x, y) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * f, y * f) * amp;
      f *= 2.1;
      amp *= 0.5;
    }
    return sum;
  };
}

// 28069 -> "28 069"
export const groupDigits = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
