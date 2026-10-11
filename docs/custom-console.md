# 业务皮肤沉淀 · 以 STRAIT WATCH（船只通行监控台）为例

`strait.html` + `js/views/strait.js` 是一次完整的「套用新主题」演练：把 HUD 框架的核心层原封不动，承载一个与自行车赛完全不同的业务——海峡 chokepoint 船只通行监控。本文把这次演练里可复用的做法沉淀成方法，下次接新业务主题时照着走。

参考样本是一张 Bosphorus 监控台截图（`analysis/` 讨论的 chokepoint watch 风格）：纸底墨字、单一赭橙强调、点阵陆地、发丝线框仪表。风格鉴定结论：**该图与本框架浅色方案同构**，套用只需收敛两点——照片化地图底图换成程序生成的点阵地形，红色按钮归入 `--danger` 语义色。

---

## 分层复用图

```
直接复用(零修改)                新增(业务专属)
─────────────────────────────   ─────────────────────────────
css/hud.css                     strait.html            页面骨架 + 布局 grid
css/hud-components.css          js/views/strait.js     数据模型 / 海图 / 仪表
js/core/palette.js   ink() ac() pal.isLight
js/core/chrome.js    startChrome() scramble()
js/core/sparks.js    startSparks()
js/core/util.js      rng/hash/makeNoise/fbmFactory
js/views/panels2d.js surface() label() dotBuckets()   ← demo 共享层,新页面照样 import
```

**判据：一行核心层代码都不改，新业务只新增「一个 html + 一个 js」。** 改核心层才算犯规。

---

## 五步法

### 第一步 · 页面骨架：只加不改

- 布局用 `.frame` grid + `grid-template-areas` 定义页面自己的骨架（监控台是「左轨 + 海图 + 底条」，自行车台是三栏），**覆写规则放在页面的 `<style id="page-style">` 里，不进 `hud.css`**。
- 面板一律用 `.panel`（边框/渐变/四角括弧白送），header 用 `.tag` + `.p-title` + `.p-note` 三段式。
- 业务专属的小控件（菜单行、告警条、键值表）在 page-style 里新起类名，全走令牌变量。

### 第二步 · 数据模型与时间：一个压缩常量

- 业务实体就是纯 JS 对象（`makeVessel()` 工厂 + 常量表），数据合成用 `rng(固定种子)`——每次刷新长得一样，问题可复现。
- **时间压缩收敛成一个常量**：`dtH = dt / 3600 * 900`（1 秒真实 ≈ 15 分钟业务时）。步进 `stepSim(dt, dtH)` 与渲染彻底解耦，换业务只换步进规则。
- 状态机从简：`WAIT → TRANSIT → CLEARED(重生)` 三态就够一个排队放行闭环。

### 第三步 · 海图画布：静态层 / 动态层分离

海图每帧重算点阵会浪费，拆两层：

1. **静态层**（离屏 canvas，仅在尺寸或 scheme 变化时重建）：
   - 重建 key = `画布宽x高:scheme`，挂在 rAF 循环里自动检测；
   - 点阵陆地 = `dotBuckets` + 距离场：沿航道采样 241 个点，逐像素窗口搜索最近样本得「到航道距离 `d`」，配合 `fbm` 海岸噪声 `land = d > hw * (1 + 0.55 * noise)`，海拔再上一层 `fbm` 决定点的大小与浓度，海岸线自然淡出；
   - 经纬网、闸门线、锚地圈、罗盘标尺等「海图家具」都画在这里。
2. **动态层**（每帧）：`drawImage(静态层)` 之后画船、尾迹、选中 reticle、风场流线。

取色只走 `ink(a)` / `ac(a)` / `acStr()`，深浅方案、换 accent 全都不需要画布代码知情。

### 第四步 · 2D 仪表：遵守既有视觉方言

- 每个仪表 = `surface(canvas)` 工厂返回的 `{ frame(ctx,w,h,t) }`，主循环统一驱动；
- 方言照抄 `panels2d.js`：**点代替平滑线、虚线步进、刻度优先于数字**；
- 表格/列表（船队表、告警流、事件日志）用 DOM 而不是画布——需要点击交互的全用 DOM。

### 第五步 · chrome / sparks / scheme 接线

```js
const chrome = startChrome(fakeTheme, { legend, footer });  // fakeTheme 只要 chrome.codes / copyright / tag
restartSparks();                                             // 换 scheme 必须先 stop 再 start
function setScheme(s) {
  document.documentElement.dataset.scheme = s;
  refreshPalette();
  staticKey = "";          // ★ 强制重建静态层(旧墨水烘焙进去了)
  restartSparks();         // ★ 粒子调色板是启动时快照的
}
```

两个容易漏的坑都标了星：scheme 切换后**静态层必须重建**（浅色墨水和深色墨水不是反色关系，是两套独立调色），**sparks 必须重启**（palette 是 startSparks 时的快照）。

URL 契约与 index 保持一致：`?scheme=dark|light`、`?accent=rrggbb`（重染强调色），这个监控台默认 `light`（纸墨是它的原生场景）。

---

## 令牌纪律检查清单（接新业务前过一遍）

- [ ] 画布/WebGL 代码里**没有**任何硬编码白/黑/十六进制色——只有 `ink()` / `ac()` / `bgStr()`；
- [ ] 装饰色只来自 `--accent` 与 `--danger`（语义），或 sparks 调色板（点缀）；
- [ ] 无投影、无圆角面板，深度只由边框/渐变/括弧表达；
- [ ] 页面专属样式全部在 page-style 内，核心 css 零改动；
- [ ] scheme 切换后静态层重建、sparks 重启；
- [ ] 时间压缩收敛为单个常量，模拟与渲染解耦。

## 本次演练改动清单

| 文件 | 动作 |
|---|---|
| `strait.html` | 新增：页面骨架 + page-style 布局 |
| `js/views/strait.js` | 新增：船队模型 / 海峡海图 / 6 个仪表 |
| `index.html` | 导航加 STRAIT 入口 |
| `docs/custom-console.md` | 本文 |
