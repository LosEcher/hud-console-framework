---
name: scifi-hud-console
description: 构建"科幻控制室 HUD"风格的单页数据控制台——近黑画布、单一强调色、等宽字体、角括弧面板、跑马灯/颗粒/扫描线氛围层、WebGL 点云主视图 + 2D 仪表阵列。当用户要求做 scifi/控制室/驾驶舱/指挥中心风格的数据大屏、监控界面、dashboard 时使用。主题可配置。
---

# 科幻 HUD 控制台构建技能

从 beastydesign/scifi(MODALE 赛事控制台)提炼的可复用方法。配套参考实现见本框架(hud-framework/):`index.html + css/hud.css + js/{util,glkit,chrome,terrain3d,globe,panels2d,synth,main}.js + themes/*.js`,零依赖、原生 ES Modules,静态托管即可运行。

## 触发场景

"做一个 scifi 风格的数据大屏 / 监控界面 / 飞船控制台 / 指挥中心 UI / 科技感 dashboard"。

## 核心设计律(不可妥协)

1. **单色 + 单强调色**:画布 `#030304` 级近黑;fg 白;中间只允许 3 档白色透明度(0.45/0.22/0.13);全站唯一彩色 `--accent`(默认琥珀 `#ff9a3c`)。强调色**只标记关键状态**(领先者、警戒线、警告),绝不用于装饰。
2. **等宽字体 + 字距层级**:一种 mono 细体(IBM Plex Mono Light 或 ui-monospace),基础 10px;标题用 letter-spacing(0.18–0.32em)而非字重分层;全大写;数字列 `font-variant-numeric: tabular-nums`。
3. **面板即仪器**:1px 弱边框 + 极淡纵向渐变 + **四角 9px 直角括弧**(纯 CSS 伪元素)+ 字母角标(A/B/C)+ 右侧 7.5px 灰小注。面板 header 固定模板:`<span class="tag">A</span>TITLE<small>SOURCE</small>`。
4. **舱室网格布局**:顶栏 44px / 主体 / 底栏 18px;三列(左窄 320px / 中 1fr / 右 340px);统一 gap 10px;顶栏下缘一条短亮线作为签名。
5. **三层氛围纹理**:径向渐变底 → CSS 扫描线(`repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px)`)→ JS 随机颗粒 canvas(opacity ≈0.055, mix-blend screen,每 2 帧重绘平移)。
6. **运动 = 机器在干活**:只许四类动效——数字 scramble 翻滚 settle、日志打字机、相机自动巡航/扫描线周期扫、焦点呼吸。禁止纯装饰动画。

## 必配五件套(chrome 层,与业务零耦合)

| 件 | 做法 | 成本 |
|---|---|---|
| 跑马灯 | 顶栏 3 条随机指令,每 900ms scramble 一条 | ~15 行 |
| UTC 时钟 | 每秒 ISO 时间 + 日期 | 5 行 |
| 页脚数据列 | 16 个数值,每 500ms 随机一个 scramble | 10 行 |
| 胶片颗粒 | 192px 随机 tile → pattern,偶数帧随机偏移重绘 | 20 行 |
| glitch | 每 0.6–3s 爆发 1–4 个:slice(已渲染帧条带错位)/block(黑块+亮线)/bar(白细线),存活 <0.4s | 40 行 |

scramble 实现要点:glyphs 池 `"0123456789#%/<>"`,按进度比例逐字符 reveal,空格跳过,420ms 内 settle;用 `dataset.target` 防过期帧覆盖。

## 主视图(3D)模式

- **WebGL2 点云 + 加色混合** `blendFunc(ONE, ONE)`,静态上传一次,顶点着色器完成全部后期:伪景深 bokeh(`coc=min(|w-focus|*aperture,30)`,大点渲染成光圈圆环 `disc*0.22+ring*1.5`,能量按面积守恒 `base²/size²`)、twinkle、`exp` 距离雾、扫描亮带、单 uniform `uReal` 控制黑白↔自然色渐变。
- **等高线**:marching squares,alpha 分级(海岸 > 整千 > 主距 > 次距)。
- **双 Canvas 叠加**:WebGL 画"物",2D Canvas 画"字"——轨迹(已跑 accent 实线+shadowBlur 辉光 / 未跑白虚线)、脉冲跑者标记、站点 pin(基座圆+杆+顶点圆)、**标签碰撞避让**(每帧矩形集合,放不下降级为短代码)、左右量尺、相机/帧率读数。
- 相机:方位/俯仰/半径轨道 + 拖拽/滚轮/双击复位 + 闲置 4s 自动缓转。
- 相机参数、垂直夸张、等高距、参考海拔等**视觉参数必须数据化**,与业务数据分离(原版放 `display` 字段)。

## 2D 仪表语言

- 不用平滑曲线,用**点阵、短划、台阶**:点云剖面、虚线生长条、逐格点柱;
- 数千点绘制用**透明度分桶**(每档一次 fillRect 批量);
- 每个仪表是 `{ frame(t, state) }` 工厂,由主循环统一驱动;
- 数据缺失时的兜底:生成"看起来合理"的占位数并让它持续翻滚(页脚),比留白更像活系统。

## 数据与估计纪律

- 重型预处理(重采样、栅格、追踪)离线烘焙成二进制 + 索引 JSON;运行时只插值;
- 估计必须可解释(原版:冠军分点成绩未公开 → 用 km-effort = km + D+/100 摊开,并明确注释"估计非实测");
- 回放时钟与循环周期显式参数化(如 1 小时 = 3.2s,循环 = 关门 + 4h)。

## 框架化适配更多主题的要点

1. 主题 = 一个配置对象:`{ tokens: {accent,...}, brand, ticker 词表, kpi 定义, 日志模板, globe hub, 地形配色, seed }`;切换 = 换配置 + `body.dataset.theme` 驱动 CSS 变量。
2. 数据层用**种子化程序化生成**(fbm 噪声 + 最陡下降河流 + 航点轨迹)保证无烘焙资产也能演示完整管线;
3. 引擎层(glkit/terrain/globe/panels/chrome)与主题、数据完全解耦,只允许通过数据模型通信。

## 设计令牌(唯一事实来源)

`tokens/base.json` 沉淀全部可配置项,六组:**color / spark / type / space / panel / motion / chrome**。CSS `:root` 变量是运行时表示,主题 JS 通过 `setProperty` 覆盖。新增能力必须先进令牌再进代码。

关键旋钮:

- `--accent-use`(0..1):强调色参与界面的程度。0 = 完全单色(所有 accent 退成白/透明),1 = 全额参与。与 RATIO 正交:RANTIO 管屏幕火星,ACCENT-USE 管界面控件。实现:`rgba(var(--accent-rgb), calc(0.9 * var(--accent-use)))`。
- `--line-w` / `--bracket-w`(px):线条系统线宽。线是该体裁的"笔",线宽即字号——0.5 发丝级扫描线,1 默认细线,2+ 粗描边仪表感。面板边框、分隔线、控件描边共用 `--line-w`;四角括弧独立 `--bracket-w`。在 `lab.html` 用 LINE-W 滑杆实时对比。
- `scheme`(深/浅双场景):浅色不是深色反色,是独立调色——纸底 `--bg:#f2f1ed` + 墨色 `--fg:#16161a` + 印刷赭石 accent `#b35c00`(发光橙在纸上会变成脏黄,必须降饱和加深),grain 从 `screen` 翻成 `multiply`。CSS 侧 `:root[data-scheme="light"]` 整块覆写;JS 画布侧必须走 `js/palette.js` 的 `ink()/ac()/fgStr()/bgStr()`,禁止再硬编码 `rgba(255,255,255,…)`。WebGL 细节:片元着色器输出预乘 alpha(`vec4(col*a, a)`),深场景 `blendFunc(ONE, ONE)` 加色,浅场景 `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` 上屏;点云基色从 `vec3(1.0)` 改为 `uniform vec3 uInk`;`clearColor` 取 `pal.bg`;glitch 黑块取 `bgStr()`;浅场景 `uGain` 0.42→0.62 补偿失光。切换 = 设 `document.documentElement.dataset.scheme` + `refreshPalette()` + 重放主题重建点云。
- `spark.*`:点缀色火星系统,见下。

## 点缀色系统(sparks,js/sparks.js)

回答"如果不是单色,而是橙/红随机散布流转"的问题:全屏上层一枚 canvas,微粒随 fBm 流场漂移——白尘为底,按比例着点缀色并拖彗尾,定时诞生亮彗星沿流场燃烧划过。

- `ratio` 0→1:0 纯单色白尘;0.1–0.2 微点缀(远看仍单色,近看有火星);0.3–0.4 明确点缀;0.5+ 喧宾夺主(禁忌区)。
- `palette`:单色点缀(同 accent)克制;`["255,154,60","255,77,61","255,120,40"]` 即橙红随机散布;加青/绿即多色星场(打破单强调色律,慎用)。
- `cometEvery`:>0 时有事件感(流星=系统活着);0 则静态氛围。
- `turbulence` 低=大尺度缓流(平静),高=碎乱急流(焦躁)。
- 各主题参考值:modale ratio 0.14 单琥珀;orbital ratio 0.2 双青;cinder ratio 0.35 橙红散布 + 1.6s 彗星。
- `lab.html` 是参数实验室:左 MONO 右 SCATTER 实时对比,含四组预设(纯单色/微点缀/橙红散布/彗雨)与生效令牌输出。

## 控件库(css/hud-components.css + components.html)

全部控件由令牌驱动,`hud-` 前缀。覆盖矩阵见 `tokens/component-checklist.md`(逐项对照 shadcn/ui 36 项与 Ant Design 约 60 项):✅ 首批 22 + 🆕 本批 24(Divider/Avatar/Breadcrumb/Pagination/Steps/Segmented/Menu/Dropdown/Context Menu/Alert/Popover/Popconfirm/Empty/Skeleton/Spin/Result/Descriptions/Timeline/Upload/InputNumber/Rate/Ring Progress/OTP/Combobox/Calendar),➖ 与体裁冲突不做(Carousel/Transfer/Tree/ColorPicker 等),🔜 Drawer/Sheet、Cascader/Tree、Date Picker 组合。

- 语义色:唯一 accent + danger(`--danger` 令牌,仅错误/删除),success/info 用白色层级表达,不引入第三语义色;
- 所有控件具备 hover / focus-visible / disabled 三态;表单有 `.hud-field.error` 校验态;
- `components.html` 六节:01 基础控件 · 02 终端 · 03 表格 · 04 笔记 · 05 启动器 · 06 报表 · 07 扩展控件。

## 禁忌

- 禁止引入框架/构建工具(该体裁的价值一半来自零依赖);
- 禁止第二种强调色、圆角面板、无衬线比例字体;
- 禁止把装饰动画放进数据面板内部;
- 点缀色只许来自 `spark.palette` 与唯一 `--accent`,禁止第三色进入界面控件;
- 画布/WebGL 代码禁止硬编码 `rgba(255,255,255,…)`、`#fff`、`#000`,一律经 `js/palette.js` 的 `ink()/fgStr()/bgStr()`,否则浅场景必然穿帮;
- 注意版权:MODALE 原版为全权利保留,借鉴模式后必须独立实现,不复制其代码与文案。
