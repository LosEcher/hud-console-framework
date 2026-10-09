# HUD 控件覆盖清单 —— 对照 shadcn/ui 与 Ant Design

> 图例:✅ 已有(首轮) · 🆕 本批补齐 · ➖ 有意不做(HUD 语境不适用) · 🔜 可后续
> 判定原则:控制室体裁中"数据监控台"角色优先;纯营销/图文类组件降级或不做。

## 一、shadcn/ui(36 项)

| shadcn | HUD 对应 | 状态 |
|---|---|---|
| Accordion | .hud-acc | ✅ |
| Alert | .hud-alert(四语义级) | 🆕 |
| Alert Dialog | .hud-modal(danger 变体) | ✅(变体 🆕) |
| Aspect Ratio | 无 | ➖ 图片排版场景,控制台不需要 |
| Avatar | .hud-avatar(字母方块) | 🆕 |
| Badge | .hud-badge | ✅ |
| Breadcrumb | .hud-breadcrumb | 🆕 |
| Button | .hud-btn 五态 | ✅ |
| Calendar | .hud-calendar(迷你月历) | 🆕 |
| Card | .panel | ✅ |
| Carousel | 无 | ➖ 与体裁冲突(轮换图=营销组件) |
| Checkbox | .hud-check | ✅ |
| Collapsible | details/.hud-acc | ✅ |
| Combobox | .hud-combobox(键位导航) | 🆕 |
| Command | launcher + combobox | ✅ |
| Context Menu | .hud-menu(context 变体) | 🆕 |
| Data Table | .hud-table | ✅ |
| Date Picker | calendar + input 组合 | 🆕(calendar 落地,picker 组合由使用方拼) |
| Dialog | .hud-modal | ✅ |
| Drawer | 无 | 🔜 右侧抽屉,控制台可用面板替代;后续按需 |
| Dropdown Menu | .hud-dropdown | 🆕 |
| Form | .hud-field + 校验态 | ✅(校验态 🆕:error 边框+消息) |
| Hover Card | tooltip/popover | ✅ |
| Input | .hud-input | ✅ |
| Input OTP | .hud-otp | 🆕 |
| Label | .hud-field label / .hud-label | ✅ |
| Menubar | .hud-menu | 🆕 |
| Navigation Menu | .hud-menu(侧栏态) | 🆕 |
| Pagination | .hud-pagination | 🆕 |
| Popover | .hud-popover/.hud-popconfirm | 🆕 |
| Progress | .hud-progress(线性条纹) | ✅ |
| Radio Group | .hud-radio | ✅ |
| Resizable | 无 | ➖ 面板尺寸由网格决定,不开放拖拽 |
| Scroll Area | 全局细滚动条 | ✅ |
| Select | .hud-select | ✅ |
| Separator | .hud-divider(可带字) | 🆕 |
| Sheet | 同 Drawer | 🔜 |
| Skeleton | .hud-skeleton(扫描线微光) | 🆕 |
| Slider | .hud-range | ✅ |
| Sonner(toast) | .hud-toast | ✅ |
| Switch | .hud-switch | ✅ |
| Table | .hud-table | ✅ |
| Tabs | .hud-tabs | ✅ |
| Textarea | .hud-textarea | ✅ |
| Toggle | .hud-switch / .hud-segmented | ✅(segmented 🆕) |
| Toggle Group | .hud-segmented | 🆕 |
| Tooltip | [data-tip] | ✅ |

**shadcn 结论:36 项 → ✅已有 22 · 🆕补齐 12 · ➖不做 2。**

## 二、Ant Design(约 60 项,去重后)

| antd | HUD 对应 | 状态 |
|---|---|---|
| Button / Icon / Typography | .hud-btn · SVG 内联 · 令牌字阶 | ✅ |
| Divider | .hud-divider | 🆕 |
| Grid / Layout / Space | .frame 网格 + gap 令牌 | ✅ |
| Anchor / Menu / PageHeader | .hud-menu + breadcrumb | 🆕 |
| Breadcrumb / Pagination / Steps | 🆕 三件齐 | 🆕 |
| AutoComplete | .hud-combobox | 🆕 |
| Cascader / TreeSelect / Tree | 层级选择器 | 🔜 数据密集后台才需要,控制台场景低频 |
| Checkbox / Radio / Switch / Slider | 已有四件 | ✅ |
| ColorPicker | 无 | ➖ 体裁无取色需求 |
| DatePicker / TimePicker | .hud-calendar | 🆕(picker 组合🔜) |
| Form(校验) | .hud-field.error | 🆕 校验态 |
| Input / InputNumber / Textarea | 🆕 数字步进 | ✅+🆕 |
| Mentions / Transfer | 无 | ➖ |
| Upload | .hud-upload(虚线空投区) | 🆕 |
| Avatar / Badge / Card / Statistic | 🆕 avatar · 其余已有 | 🆕 |
| Calendar | .hud-calendar | 🆕 |
| Carousel / Image | 无 | ➖ |
| Collapse | .hud-acc | ✅ |
| Descriptions | .hud-desc(键值栅) | 🆕 |
| Empty | .hud-empty | 🆕 |
| List | .hud-menu(松散态) / note-list | ✅ |
| Popover / Popconfirm / Tooltip | 🆕 popconfirm | ✅+🆕 |
| Result | .hud-result | 🆕 |
| Segmented | .hud-segmented | 🆕 |
| Table / Tabs / Tag | 已有 | ✅ |
| Timeline | .hud-timeline | 🆕 |
| Tour / Watermark | 无 | ➖ |
| Alert / Notification / Message | .hud-alert / .hud-toast | 🆕 / ✅ |
| Drawer / Modal | .hud-modal | ✅(+drawer 🔜) |
| Progress(环形) | .hud-ring | 🆕 |
| Rate | .hud-rate(方块评分) | 🆕 |
| Skeleton / Spin | .hud-skeleton / .hud-spin | 🆕 |

**antd 结论:约 60 项 → ✅已有 25 · 🆕补齐 22 · 🔜 4(drawer/sheet、cascader/tree、date picker 组合)· ➖ 不做 9。**

## 三、HUD 特有(框架自增,两框架均无)

终端 .hud-terminal · 仪表面板 .panel(角括弧/角标) · 点阵迷你图 · 启动器 · 赛制条 · 点云视口 · 点阵地球 · scramble 数字 · 任务日志 · 加密锁屏(原版有,框架未移植 🔜)。

## 四、本批补齐清单(24 项)

Divider · Avatar · Breadcrumb · Pagination · Steps · Segmented · Menu(侧栏/顶栏) · Dropdown · Context Menu · Alert(四级) · Popover/Popconfirm · Empty · Skeleton · Spin · Result · Descriptions · Timeline · Upload · InputNumber · Rate · Ring Progress · OTP · Combobox · Calendar

➖ 共同不做:Carousel / Aspect Ratio / Resizable / ColorPicker / Transfer / Mentions / Tree / Watermark / Tour —— 与"控制室监控台"角色冲突或低频。
