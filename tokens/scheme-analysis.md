# 深/浅双场景与线条宽度 —— 可行性分析与落地方案

## 一、结论

**可以,且架构上代价可控。** 令牌体系天然支持双场景:所有颜色已是 CSS 变量,深/浅 = 换一套变量值 + `data-scheme` 切换。真正的工作量在两类"白色硬编码"上:

1. **CSS 里的 `rgba(255,255,255,α)` 字面量**(约 60 处):暗场景是"白色减淡",浅场景必须变成"墨色减淡"。解法不是逐处写双场景值,而是把不透明度语义改为**前景色混合**:`color-mix(in srgb, var(--fg) α%, transparent)`——fg 在暗场景是白、浅场景是墨,一处写法两个场景自动正确。
2. **JS Canvas/WebGL 里的白色字面量**(terrain/globe/panels/sparks 共约 50 处):编译期不存在 CSS 变量,新增 `js/palette.js` 运行时取色层——构造视图前读一次计算样式,缓存 `{fg, accent, isLight}`,提供 `ink(α)` / `ac(α)` 辅助函数替换字面量。

## 二、暗/浅场景的渲染差异(关键设计判断)

| 机制 | 暗场景 | 浅场景 | 处理 |
|---|---|---|---|
| 点云混合 | `blendFunc(ONE,ONE)` 加色发光,光是"加"出来的 | 加色在白底上必然过曝死白 | 改普通 alpha 混合,点用墨色绘制;辉光感靠 bokeh 环 + 浓度而非加法 |
| 单色模式基色 | 白(`vec3(1.0)`) | 墨(`uInk` uniform) | 两个着色器加 `uInk` uniform |
| 雾/海/等高线色调 | 浅蓝白提亮 | 需压暗成灰墨 | 构造时用 palette 混合基色 |
| 扫描线 | 白 2.5% | 墨 2.5% | 改用 `color-mix(var(--fg) 2.5%)` 自动翻转 |
| 胶片颗粒 | screen 混合 | multiply 混合 | `--grain-blend` 变量:dark=screen / light=multiply |
| glitch 黑块 | 黑块+白亮线 | 反白:墨块+墨亮线 | 用 bg/ink 令牌 |
| 强调色 | `#ff9a3c` 亮琥珀 | 同色相降明度 `#b35c00`(白底对比度) | `--accent` 按 scheme 覆盖 |
| 危险色 | `#ff6056` | `#d43a2f` | 同上 |
| 轨迹辉光 shadowBlur | 亮色辉光 | 深色"蚀刻"感,保留 shadowBlur 无妨 | 不变 |

**判断:浅场景不是简单的反色。** 面板渐变、角括弧、排版层级全部复用;只有"发光体"改"造影体"。点云地形在浅底上呈现**测绘图纸/蓝图**气质,仍是同一设计语言。

## 三、线条宽度令牌化

新增两个令牌,作用于"结构线"而不碰装饰:

- `--line-w`(默认 1px):面板边框、角括弧、按钮/输入/菜单/表格边框、页签下划线;
- `--bracket-w`(默认 1px,可独立):四角括弧描边,调粗时"仪器感"最强。

不纳入线宽令牌的:点云点径(渲染参数)、进度条高度(`--track-h` 另行)、分隔虚线(密度语义非宽度语义)。

风险:`border: 1px solid var(--line)` 在 0.5px 时部分浏览器渲染为 hairline,属于可接受退化。

## 四、切换接口

- `document.documentElement.dataset.scheme = "dark" | "light"`(CSS 变量 + 选择器);localStorage 记忆。
- 主控台顶栏加 DARK/LIGHT 分段按钮;lab.html 加场景切换与 LINE-W 滑杆(实时改 preview 的 `--line-w`)。
- 视图生命周期:`applyTheme` 前先 `refreshPalette()`,主题切换/场景切换都重建视图(WebGL 上下文重建成本可忽略,点云生成 ~200ms)。
