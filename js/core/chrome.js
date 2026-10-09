// Page chrome shared by every theme: ticker, UTC clock, legend, footer, animated grain,
// digit scramble. All content comes from the theme config — this module knows no business meaning.

import { groupDigits, hash } from "./util.js";

const $ = (id) => document.getElementById(id);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function scramble(el, text, ms = 420) {
  const start = performance.now();
  const glyphs = "0123456789#%/<>";
  el.dataset.target = text;
  const tick = () => {
    if (el.dataset.target !== text) return;
    const p = (performance.now() - start) / ms;
    if (p >= 1) { el.textContent = text; return; }
    el.textContent = [...text].map((ch, i) => (i / text.length < p || /\s/.test(ch) ? ch : pick(glyphs))).join("");
    requestAnimationFrame(tick);
  };
  tick();
}

// theme.chrome: { codes: [string,...] } used to fabricate random ticker lines
export function startChrome(theme, { legend, footer }) {
  const codes = theme.chrome?.codes?.length ? theme.chrome.codes : ["SYNC", "RELAY", "ACK", "HOLD"];
  const randomCode = () =>
    `<OP${Math.floor(Math.random() * 900 + 100)},${Math.floor(Math.random() * 90000 + 10000)}> ${pick(codes)}`;

  const tickers = [...$("ticker").children];
  tickers.forEach((el) => (el.textContent = randomCode()));
  setInterval(() => scramble(pick(tickers), randomCode()), 900);

  const keys = legend || Array.from({ length: 4 }, (_, i) => [i === 2, groupDigits(10000 + hash(i, 4) * 89999)]);
  $("legend").innerHTML = keys.map(([accent, text]) => `<span><i class="${accent ? "accent" : ""}"></i>${text}</span>`).join("");

  const foot = $("footer");
  const items = footer || Array.from({ length: 16 }, (_, i) => ["", String(Math.floor(10000 + hash(i, 9) * 89999))]);
  foot.innerHTML = `<strong class="copy">${theme.chrome?.copyright || "© HUD CONSOLE"}</strong>` + items.map(([key, value], i) =>
    `<span><i class="${i % 7 === 3 ? "accent" : ""}"></i>${key ? `${key} ` : ""}<b>${value}</b></span>`).join("")
    + `<em>${theme.tag || ""} / ${new Date().toISOString().slice(0, 10)}</em>`;
  const footerValues = [...foot.querySelectorAll("b")];
  setInterval(() => {
    const k = Math.floor(Math.random() * footerValues.length);
    scramble(footerValues[k], footer ? items[k][1] : String(Math.floor(10000 + Math.random() * 89999)));
  }, 500);

  const grain = $("grain");
  const gctx = grain.getContext("2d");
  const tile = document.createElement("canvas");
  tile.width = tile.height = 192;
  const tctx = tile.getContext("2d");
  const img = tctx.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  const pattern = gctx.createPattern(tile, "repeat");

  const updateClock = () => {
    const now = new Date();
    $("clock").textContent = now.toISOString().slice(11, 19);
    $("date").textContent = `${now.toISOString().slice(0, 10)} · UTC`;
  };
  updateClock();

  return (frameIndex) => {
    if (frameIndex % 2 === 0) {
      if (grain.width !== innerWidth || grain.height !== innerHeight) {
        grain.width = innerWidth;
        grain.height = innerHeight;
      }
      gctx.setTransform(1, 0, 0, 1, Math.random() * 192, Math.random() * 192);
      gctx.fillStyle = pattern;
      gctx.fillRect(-192, -192, grain.width + 192, grain.height + 192);
    }
    if (frameIndex % 15 === 0) updateClock();
  };
}
