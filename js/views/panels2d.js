// 2D instruments: every panel is a { frame(t, hours) } factory driven by the main loop.
// Shared visual language: dot clouds, dashed bars and stepped point columns instead of smooth lines.

import { fitCanvas } from "../core/glkit.js";
import { hash } from "../core/util.js";
import { raceClock, hmsToHours } from "../core/synth.js";
import { ink, fgStr } from "../core/palette.js";

export const FONT = '"Plex", ui-monospace, monospace';

// begin(): size the canvas, clear, return { ctx, w, h } in CSS pixels
export function surface(canvas) {
  const ctx = canvas.getContext("2d");
  return () => {
    const { w, h, dpr } = fitCanvas(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `8px ${FONT}`;
    ctx.textBaseline = "middle";
    return { ctx, w, h };
  };
}

export function label(ctx, text, x, y, align = "left", rgba = ink(0.4)) {
  ctx.fillStyle = rgba;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

// thousands of dots per frame: one fill() per opacity level
export function dotBuckets(levels) {
  const buckets = Array.from({ length: levels }, () => []);
  return {
    add(x, y, size, alpha) {
      const k = Math.min(levels - 1, Math.max(0, Math.floor(alpha * levels)));
      buckets[k].push(x, y, size);
    },
    flush(ctx, rgb = fgStr()) {
      buckets.forEach((b, k) => {
        if (!b.length) return;
        ctx.fillStyle = `rgba(${rgb},${(k + 0.5) / levels})`;
        ctx.beginPath();
        for (let i = 0; i < b.length; i += 3) ctx.rect(b[i], b[i + 1], b[i + 2], b[i + 2]);
        ctx.fill();
        b.length = 0;
      });
    },
  };
}

// ---------- ring: leader, chaser and cutoff progress around one dial ----------
export function raceRing(canvas, model, A) {
  const begin = surface(canvas);
  return {
    frame(t, hours) {
      const { ctx, w, h } = begin();
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4;
      const arc = (r, frac, style, width) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
      };
      const C = model.meta.race.cutoff;
      ctx.strokeStyle = ink(0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < C; k += 6) {
        const a = -Math.PI / 2 + (k / C) * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
      }
      ctx.stroke();
      arc(R, Math.min(1, hours / C), ink(0.35), 1);
      arc(R - 8, model.runnerKm(model.runners[0], hours) / model.total, ink(0.95), 2);
      arc(R - 13, model.runnerKm(model.runners[1], hours) / model.total, ink(0.5), 2);
      arc(R - 18, model.cutoffKm(hours) / model.total, `rgba(${A},0.9)`, 2);
      ctx.font = `10px ${FONT}`;
      label(ctx, raceClock(hours), cx, cy - 4, "center", ink(0.95));
      ctx.font = `7px ${FONT}`;
      label(ctx, `${Math.floor(C)}H LIMIT`, cx, cy + 8, "center", ink(0.45));
    },
  };
}

// ---------- elevation profile as a dot cloud with drooping clusters ----------
export function elevationProfile(canvas, model, A) {
  const begin = surface(canvas);
  const dots = dotBuckets(8);
  const { profileMax: MAX } = model.meta.display;
  return {
    frame(t, hours) {
      const { ctx, w, h } = begin();
      const left = 30, right = w - 6, top = 22, bottom = h - 16;
      const X = (km) => left + (km / model.total) * (right - left);
      const Y = (alt) => bottom - (alt / MAX) * (bottom - top);
      for (let a = 0; a < MAX; a += 1000) {
        ctx.fillStyle = ink(0.07);
        ctx.fillRect(left, Y(a), right - left, 1);
        label(ctx, String(a), left - 4, Y(a), "right", ink(0.35));
      }
      for (let x = left; x < right; x += 1.5) {
        const km = ((x - left) / (right - left)) * model.total;
        const alt = model.at(km).alt;
        const y = Y(alt);
        dots.add(x, y, 1.3, 0.95);
        const c = Math.floor(x * 10);
        for (let j = 0; j < 7 + alt / 180; j++) {
          const d = -Math.log(1 - hash(c, j) * 0.999) * (bottom - top) * 0.16;
          if (y + d < bottom) dots.add(x + (hash(c, j + 40) - 0.5) * 1.5, y + d, 1, Math.max(0, 0.7 - d / ((bottom - top) * 0.5)));
        }
      }
      dots.flush(ctx);
      for (const cp of model.barriers) {
        const x = X(cp.km);
        ctx.fillStyle = ink(0.3);
        ctx.fillRect(x, bottom + 2, 1, 4);
        if (cp.code === "DEP" || cp.code === "ARR") label(ctx, cp.code, x, bottom + 10, "center", ink(0.45));
      }
      const marks = [
        [model.runnerKm(model.runners[0], hours), fgStr(), "M1"],
        [model.runnerKm(model.runners[1], hours), fgStr(), "F1"],
        [model.cutoffKm(hours), A, "⌛"],
      ];
      marks.forEach(([km, rgb, id], k) => {
        const x = X(km), y = Y(model.at(km).alt);
        ctx.strokeStyle = `rgba(${rgb},0.6)`;
        ctx.setLineDash(rgb === A ? [2, 3] : []);
        ctx.beginPath(); ctx.moveTo(x, top - 6); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.strokeRect(x - 3, y - 3, 6, 6);
        label(ctx, id, x + 4, top - 16 + k * 7, "left", `rgba(${rgb},0.9)`);
      });
    },
  };
}

// ---------- D+ / D- per km as opposing tick stacks ----------
export function gradientPerKm(canvas, model, A) {
  const begin = surface(canvas);
  const bins = [];
  for (let km = 0; km < model.total; km++) {
    const a = model.at(km), b = model.at(Math.min(model.total, km + 1));
    bins.push({ up: b.dplus - a.dplus, down: b.dminus - a.dminus });
  }
  const max = Math.max(...bins.map((b) => Math.max(b.up, b.down)), 1);
  return {
    frame(t, hours) {
      const { ctx, w, h } = begin();
      const left = 30, right = w - 6, mid = h / 2 + 4, span = h / 2 - 14;
      const col = (right - left) / bins.length;
      const leaderBin = Math.floor(model.runnerKm(model.runners[0], hours));
      ctx.fillStyle = ink(0.25);
      ctx.fillRect(left, mid, right - left, 1);
      label(ctx, `+${Math.round(max)}`, left - 4, mid - span, "right", ink(0.35));
      label(ctx, `−${Math.round(max)}`, left - 4, mid + span, "right", `rgba(${A},0.6)`);
      bins.forEach((b, k) => {
        const x = left + k * col;
        const hot = k === leaderBin;
        const nUp = Math.round((b.up / max) * span / 3), nDown = Math.round((b.down / max) * span / 3);
        ctx.fillStyle = hot ? ink(1) : ink(0.7);
        for (let j = 0; j < nUp; j++) ctx.fillRect(x, mid - 3 - j * 3, Math.max(1, col - 0.6), 1.2);
        ctx.fillStyle = hot ? `rgb(${A})` : `rgba(${A},0.55)`;
        for (let j = 0; j < nDown; j++) ctx.fillRect(x, mid + 3 + j * 3, Math.max(1, col - 0.6), 1.2);
      });
      for (let km = 0; km <= model.total; km += 30) label(ctx, String(km), left + km * col, h - 5, "center", ink(0.3));
    },
  };
}

// ---------- cumulative D+ / D- along the route ----------
export function cumulative(canvas, model, A) {
  const begin = surface(canvas);
  const MAX = Math.max(4000, Math.ceil(model.meta.race.dplus / 2500) * 2500);
  return {
    frame(t, hours) {
      const { ctx, w, h } = begin();
      const left = 34, right = w - 6, top = 10, bottom = h - 14;
      const X = (km) => left + (km / model.total) * (right - left);
      const Y = (v) => bottom - (v / MAX) * (bottom - top);
      for (let v = 0; v <= MAX; v += MAX / 4) {
        ctx.fillStyle = ink(0.07);
        ctx.fillRect(left, Y(v), right - left, 1);
        label(ctx, String(Math.round(v)), left - 4, Y(v), "right", ink(0.35));
      }
      for (let km = 0; km <= model.total; km += 45) label(ctx, `${km}`, X(km), h - 5, "center", ink(0.35));
      const line = (key, style, dash) => {
        ctx.strokeStyle = style;
        ctx.setLineDash(dash);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let x = left; x <= right; x += 2) {
          const p = model.at(((x - left) / (right - left)) * model.total);
          x === left ? ctx.moveTo(x, Y(p[key])) : ctx.lineTo(x, Y(p[key]));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      line("dplus", ink(0.9), []);
      line("dminus", `rgba(${A},0.7)`, [3, 3]);
      const p = model.at(model.runnerKm(model.runners[0], hours));
      ctx.fillStyle = ink(1);
      ctx.fillRect(X(p.km) - 2, Y(p.dplus) - 2, 4, 4);
      label(ctx, `D+ ${Math.round(p.dplus)}`, X(p.km) + (p.km > model.total * 0.7 ? -6 : 6), Y(p.dplus) - 8, p.km > model.total * 0.7 ? "right" : "left", ink(0.9));
    },
  };
}

// ---------- event formats as bars that periodically regrow ----------
export function raceFormats(canvas, meta, A) {
  const begin = surface(canvas);
  const maxKm = Math.max(...meta.races.map((r) => r.km)), maxDplus = Math.max(...meta.races.map((r) => r.dplus));
  return {
    frame(t) {
      const { ctx, w, h } = begin();
      const rows = meta.races, rh = (h - 4) / rows.length;
      const compact = rh < 19;
      const left = 0, barX = w * (compact ? 0.16 : 0.38), barEnd = compact ? w * 0.52 : w - 4, right = w - 4;
      rows.forEach((r, k) => {
        const y = 4 + k * rh, mid = y + rh / 2;
        const hot = k === 0;
        const rgb = hot ? A : fgStr();
        const kmW = (r.km / maxKm) * (barEnd - barX), dpW = (r.dplus / maxDplus) * (barEnd - barX);
        const grow = Math.min(1, ((t * 0.4 + k * 0.1) % 6) / 1.2);
        const kmY = compact ? mid - 4 : y + 2, dpY = compact ? mid + 2 : y + 11;
        label(ctx, r.name.toUpperCase(), left, compact ? mid : y + 5, "left", `rgba(${rgb},${hot ? 1 : 0.75})`);
        if (!compact) label(ctx, `${r.start} · ${r.date}`, left, y + 15, "left", ink(0.35));
        ctx.fillStyle = `rgba(${rgb},0.8)`;
        for (let x = 0; x < kmW * grow; x += 2) ctx.fillRect(barX + x, kmY, 1, compact ? 4 : 5);
        ctx.fillStyle = `rgba(${rgb},0.4)`;
        ctx.fillRect(barX, dpY, dpW * grow, 2);
        label(ctx, `${r.km} KM · ${r.dplus} D+ · ${r.cutoff}H`, right, compact ? mid : y + 16, "right", ink(0.55));
      });
    },
  };
}

// ---------- finish schedule: histogram, targets, top-10 ticks, replay cursor ----------
export function finishTimes(canvas, meta, A) {
  const begin = surface(canvas);
  const C = meta.race.cutoff;
  const men = meta.results.men.map((r) => hmsToHours(r[2]));
  const women = meta.results.women.map((r) => hmsToHours(r[2]));
  const hist = meta.histogram;
  const peak = hist ? Math.max(...hist.men.map((n, k) => n + hist.women[k])) : 0;
  return {
    frame(t, hours) {
      const { ctx, w, h } = begin();
      const left = 4, right = w - 6, axis = h - 14;
      const X = (hh) => left + (hh / C) * (right - left);
      if (hist && peak) {
        const base = h - 42, span = base - 6, col = X(1) - X(0);
        hist.men.forEach((m, k) => {
          const f = hist.women[k], x = X(k) + 0.5, done = hours >= k + 1;
          const nm = Math.round((m / peak) * span / 2.5), nf = Math.round(((m + f) / peak) * span / 2.5) - nm;
          ctx.fillStyle = done ? ink(0.85) : ink(0.3);
          for (let j = 0; j < nm; j++) ctx.fillRect(x, base - j * 2.5, Math.max(1, col - 1.5), 1.2);
          ctx.fillStyle = done ? `rgb(${A})` : `rgba(${A},0.35)`;
          for (let j = nm; j < nm + nf; j++) ctx.fillRect(x, base - j * 2.5, Math.max(1, col - 1.5), 1.2);
        });
        label(ctx, `${meta.race.runners} FINISHERS ${hist.year} · BY HOUR`, left, 8, "left", ink(0.5));
      }
      (meta.targets || []).forEach(([name, a, b], k) => {
        const y = 6 + k * 13;
        ctx.strokeStyle = ink(0.25);
        ctx.save();
        ctx.beginPath(); ctx.rect(X(a), y, X(b) - X(a), 8); ctx.clip();
        for (let x = X(a) - 10; x < X(b); x += 4) { ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 8, y); ctx.stroke(); }
        ctx.restore();
        label(ctx, `${name} ${a}–${b} H`, X(b) + 4, y + 4, "left", ink(0.5));
      });
      const row = (list, y, tag) => {
        label(ctx, tag, left, y, "left", ink(0.45));
        list.forEach((hh) => {
          const done = hours >= hh;
          ctx.fillStyle = done ? ink(1) : ink(0.25);
          ctx.fillRect(X(hh) - 1.5, y - 1.5, 3, 3);
        });
      };
      row(men, h - 34, "M");
      row(women, h - 24, "F");
      ctx.fillStyle = ink(0.25);
      ctx.fillRect(left, axis, right - left, 1);
      for (let hh = 0; hh <= C; hh += 12) label(ctx, `${hh}H`, X(hh), h - 5, "center", ink(0.35));
      ctx.fillStyle = `rgb(${A})`;
      ctx.fillRect(X(C) - 1, 4, 2, axis - 4);
      const x = X(Math.min(C, hours));
      ctx.fillStyle = ink(0.6);
      ctx.fillRect(x, 4, 1, axis - 4);
    },
  };
}
