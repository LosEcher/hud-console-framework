// Minimal i18n for the demo pages (zh default, en switch).
// Static text: put the English variant in data-en / data-en-ph / data-en-tip;
// the markup keeps Chinese as the default text. Dynamic text: pages call t(zh, en)
// or register onLang(fn) to re-render. Language: ?lang=en|zh > localStorage >
// navigator.language detection. Framework chrome (index.html) stays English.
export let lang = "zh";

const listeners = [];
export function onLang(fn) { listeners.push(fn); }

export function t(zh, en) { return lang === "en" ? en : zh; }

export function applyStatic(root = document) {
  root.querySelectorAll("[data-en]").forEach((el) => {
    if (el.dataset.zh === undefined) el.dataset.zh = el.textContent;
    el.textContent = lang === "en" ? el.dataset.en : el.dataset.zh;
  });
  root.querySelectorAll("[data-en-ph]").forEach((el) => {
    if (el.dataset.zhPh === undefined) el.dataset.zhPh = el.getAttribute("placeholder") || "";
    el.setAttribute("placeholder", lang === "en" ? el.dataset.enPh : el.dataset.zhPh);
  });
  root.querySelectorAll("[data-en-tip]").forEach((el) => {
    if (el.dataset.zhTip === undefined) el.dataset.zhTip = el.dataset.tip || "";
    el.dataset.tip = lang === "en" ? el.dataset.enTip : el.dataset.zhTip;
  });
}

export function setLang(l, root = document) {
  lang = l === "en" ? "en" : "zh";
  try { localStorage.setItem("hud-lang", lang); } catch {}
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  applyStatic(root);
  listeners.forEach((fn) => fn(lang));
}

// host: a .pages container that gets ZH / EN toggle buttons.
export function initLang(host, root = document) {
  let l = "";
  try { l = localStorage.getItem("hud-lang") || ""; } catch {}
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "zh") l = q;
  if (!l) l = (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  if (host) {
    for (const code of ["zh", "en"]) {
      const b = document.createElement("button");
      b.dataset.lang = code;
      b.textContent = code.toUpperCase();
      b.addEventListener("click", () => {
        setLang(code, root);
        host.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.lang === lang));
      });
      host.append(b);
    }
  }
  setLang(l, root);
  if (host) host.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.lang === lang));
  return lang;
}
