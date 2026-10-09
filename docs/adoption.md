# 外部项目适配指引

本框架对外的价值分四层,按需要选择接入深度。**核心原则:令牌是唯一事实来源,任何"改颜色/改线宽"的需求都必须落进 `tokens/base.json` 与 CSS 变量,不进代码。**

```
tokens/base.json          设计令牌(人读的事实来源)
    ↓ 映射
css/hud.css :root 变量    运行时表示,+ [data-scheme="light"] 浅场景覆写
    ↓ 消费
css/hud-components.css    hud-* 控件(只引用变量,零硬编码)
    ↓ 驱动
js/core/palette.js        画布/WebGL 运行时取色层
```

---

## 接入级别

### L1 · 纯 CSS 皮肤(5 分钟)

只要视觉,不要动效。拷贝三个目录进你的项目:

```
assets/fonts/   css/hud.css   css/hud-components.css
```

```html
<link rel="stylesheet" href="hud.css">
<link rel="stylesheet" href="hud-components.css">
<body data-scheme="dark">          <!-- 或 "light" -->
  <button class="hud-btn primary">COMMIT</button>
  <div class="hud-badge accent">HOT</div>
</body>
```

- 你的页面结构(布局/组件树)完全自有,只借用 `hud-*` 控件类与变量;
- 深浅切换 = 改 `<html data-scheme>`,见"双场景契约";
- 字体自动经 `@font-face` 加载;也可删除字体段、回退 `ui-monospace`。

### L2 · CSS + core 动态层(30 分钟)

要火星氛围与装饰 chrome,但仍用自家页面:

```js
import { refreshPalette } from "hud-framework/js/core/palette.js";
import { startSparks }      from "hud-framework/js/core/sparks.js";
import { startChrome }      from "hud-framework/js/core/chrome.js";

// 任何时刻改过 CSS 变量或 data-scheme 之后:
refreshPalette();

const sparks = startSparks(document.getElementById("sparks-canvas"), {
  density: 110,        // 每 100 万 px² 微粒数
  ratio: 0.14,         // 着色占比;0=纯单色,0.2–0.4=明显点缀
  palette: ["255,154,60"],          // 点缀色,多色即"橙红随机散布"
  cometEvery: 2.4,     // 彗星间隔秒,0=关闭
  glow: true,          // 浅场景自动退化为普通叠加,无需干预
});
// sparks.setConfig({ ratio: 0.4 }) 随时调参
```

`js/core/` 六个文件零业务依赖,可直接整体拷贝;`synth.js`(演示数据合成)不需要。

### L3 · 主题体系(写自己的主题)

主控台的"主题"是纯数据对象(`themes/*.js`),克隆一份改名即可:

```js
// themes/mytheme.js —— 骨架,全部字段见 themes/ember.js 完整示例
export default {
  id: "mytheme",
  brand: { name: "MYTHEME", sub: "ORBITAL TELEMETRY" },
  tokens: {
    accent:    "#ff9a3c",   // 唯一强调色(深场景,发光体质)
    accentRgb: "255,154,60",
    lightAccent:    "#b35c00",  // 浅场景同色相的"印刷版":发光色上纸会脏,必须重新调墨
    lightAccentRgb: "179,92,0",
    bg:        "#030304",   // 可省略,取默认近黑
  },
  // 面板标题/业务文案/日志模板/地球枢纽/KPI 定义……
  spark: { ratio: 0.2, palette: ["255,154,60", "255,77,61"] },
};
```

注册进 `js/views/main.js` 的 `THEME_IDS` 即出现在顶栏切换器;也可用
`index.html?theme=mytheme` 直达。主题切换 = 重设 CSS 变量 + `refreshPalette()` + 重建视图。

---

## 双场景契约(最容易穿帮的部分)

浅色不是深色的反色,是独立调色(`:root[data-scheme="light"]` 整块覆写):

| 项 | 深色 | 浅色 |
|---|---|---|
| `--bg` / `--fg` | `#030304` / `#e9e9e9` | `#f2f1ed` / `#16161a` |
| `--accent` | `#ff9a3c`(发光橙) | `#b35c00`(印刷赭石,发光橙上纸会变脏黄,必须换) |
| grain 噪点 | `mix-blend: screen` | `mix-blend: multiply`(纸上只能压暗) |
| WebGL 混合 | `blendFunc(ONE, ONE)` 加色 | `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` 上屏 |

**必须遵守的三条:**

1. **画布代码禁止硬编码白/黑**。一律 `import { ink, ac, fgStr, bgStr, pal } from "palette.js"`:
   - `ink(0.4)` = 主色 40% 透明(CSS 与 Canvas 通用);
   - WebGL 片元输出**预乘 alpha**(`o = vec4(col * a, a)`),不要输出 alpha=1;
   - 点云/线条基色用 `uniform vec3 uInk`(= `pal.fg/255`),不要 `vec3(1.0)`;
   - 清屏色 `gl.clearColor(pal.bg[0]/255, …)`;glitch 黑块用 `rgb(${bgStr()})`。
2. **CSS 侧**所有 `rgba(255,255,255,α)` 改写成
   `color-mix(in srgb, var(--fg) α%, transparent)`——`--fg` 翻墨时自动跟随。
3. **切换流程**:设 `document.documentElement.dataset.scheme` → `refreshPalette()`
   → 重建依赖 baked 颜色的画布对象(点云基色是构造期烘焙的)。

## 线条与点缀参数

- `--line-w`(默认 1px):面板边框/分隔线/控件描边;`--bracket-w`:四角括弧。0.5 = 发丝,2 = 粗描边仪表感。
- `--accent-use`(0..1):强调色参与程度,0 = 界面完全单色(火星仍可有点缀,两者正交)。
- 点缀色纪律:界面控件**只允许** `--accent` 与 `--danger` 两个彩色;其他颜色只允许出现在 `spark.palette` 的全屏微粒里。

## 踩过的坑(接入前请读)

1. **inline style 会压过浅场景**:主题用 `documentElement.style.setProperty("--accent", …)` 时,浅场景必须 `removeProperty` 让 `[data-scheme="light"]` 块接管;
2. **hex 解析**:`palette.js` 的 `refreshPalette()` 需同时解析 `#rrggbb` 与 `r,g,b` 两种格式,漏一个就静默退回深色兜底(本框架 1.0 真实 bug);
3. **Canvas `fillStyle` 的 `color-mix()`** 在部分浏览器不可靠,画布代码请用 `ink()` 而非 CSS 颜色函数;
4. **加色发光在浅场景是增亮逻辑**,直接复用会糊白:必须切预乘 alpha + 普通混合,且浅场景 `uGain` 需上调(0.42→0.62)补偿失光;
5. `lab.html?scheme=light&linew=2&density=300&ratio=0.5` 可复现任意参数组合,调参先看 lab 再落令牌。

## 禁忌(与体裁冲突,做了就不是这个风格)

- 圆角面板、投影层级、第二种强调色、无衬线比例字体;
- 把装饰动画放进数据面板内部;
- 引入框架/构建工具(价值一半来自零依赖)。
