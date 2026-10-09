# 优化审查:重叠遮罩 · 着色器写法 · 性能

参考对象:`chenglou/pretext`(纯 JS 文本测量/排版,绕开 DOM reflow)与本地 `reference/shaders`(paper-design/shaders,WebGPU 效果组件库,200+ 效果)。日期:2026-10-09。

## 一、重叠遮罩审计结论

逐层检查了 index/components/lab 的层叠与遮挡关系:

**没有硬 bug**,两处为 deliberate 设计、一处轻微 UX 摩擦:

| 层 | 关系 | 结论 |
|---|---|---|
| sparks (z18) / scanlines (z20) / grain (z21) | 全屏浮在所有面板**文字之上**,`pointer-events:none` | 故意的"余烬浮在控制台上"氛围;components 里 modal z50 / popover z45 高于它们,弹层不被污染 |
| terrain `#terrain-hud` overlay | 绝对定位跟在 WebGL canvas 之后,`.mode` 按钮 z3 在其上 | 正确,按钮可点、标注不挡操作 |
| 地形标注 `fits()` 贪心避让 | 每帧重置 `placed` 重算,相机旋转时标注排序变化 | ⚠ **轻微闪烁**:贪心解帧间不稳定。建议:下一帧把上一帧的标注框先种进 `placed`(hysteresis),代价小、收益明显。未实施(怕引入回归),留作后续 |
| checkpoints 表 `scrollTop = on.offsetTop - 40` | 每 0.6s 读 `offsetTop`(强制布局)+ 写滚动 | 用户手动滚动时会被周期性"拽回"。建议改为仅在 active 行变化时滚动 |

## 二、pretext 的启示

pretext 的核心主张:**`getBoundingClientRect`/`offsetHeight` 等 DOM 测量触发 layout reflow,是浏览器里最贵的操作之一;一次 prepare + 纯算术 layout 是热路径**。

对照本框架,我们正中两条:

1. **`fitCanvas()` 每帧对每个 canvas 调 `getBoundingClientRect()`** —— 主控台 10 个 canvas × 60fps ≈ 600 次强制布局查询/秒,且与 scramble 的 textContent 写入交错时每次都要真实排版。**已修**:WeakMap 缓存 + ResizeObserver 失效,每 canvas 一生只测一次(见下)。
2. **KPI scramble 的并发 rAF** —— 每个 scramble 自起 rAF 循环,420ms 内每帧写 textContent;4 个 KPI + ticker + footer 峰值 6 个并发循环。暂未合并(改动面大),列入后续:把 scramble 收进主循环按 frameIndex 驱动。

## 三、shaders 库技法对照

| shaders 库技法 | 我们的情况 | 处置 |
|---|---|---|
| **全链路预乘 alpha 约定**(canvas `alphaMode:'premultiplied'`,末遍输出 `vec4f(rgb*a, a)`) | 深浅双场景改造时已独立落地同一约定(`o = vec4(col*a, a)` + 双 blendFunc) | ✅ 外部验证一致,写法保持 |
| **设备分级**(`resolveDeviceTier` / `clampAgentCount` / `resolveRenderRes`,按 CPU 核数/内存降 agent 数与分辨率) | 点云 24 万点对所有设备一视同仁 | ✅ **已采纳**:弱机(≤4 核或 ≤4GB)点云降至 45% |
| **效果半分辨率渲染**(`halfUvProps` 半尺寸 RTT + 上采样) | 暂无全屏后处理;grain 是 DOM canvas | 若未来加辉光/模糊后处理再引入;grain 更优解是 CSS 合成层(见后续建议) |
| **管线/程序缓存**(`pipelineCache`) | 我们每主题切换重建 2 个 program,切完即用 | 频率低,无需缓存 |
| **`fract(sin·k)` 哈希纪律**(文档明确"是 decorrelator 不是 noise,不可互换) | util.js 用 mulberry32 系 PRNG,语义正确 | ✅ 无需改 |
| **层级混合 kit**(命名 blend mode:`screen`/`add`…) | 深场景加色=additive、浅场景=上屏,语义对应 | 概念对齐,我们按场景二选一而非运行时参数 |

## 四、已落地优化(本轮)

1. **fitCanvas ResizeObserver 缓存**(glkit.js):消灭 ~600 次/秒强制布局,全站所有 canvas 受益,签名不变。
2. **设备分级点云**(terrain3d.js):`hardwareConcurrency≤4 || deviceMemory≤4` 时 24 万→10.8 万点,弱机帧率显著改善,观感密度损失不可辨。
3. **路线辉光去 shadowBlur**(terrain3d.js):宽 7px 低透明下划线替代逐帧离屏光晕栅格化,GPU 合成路径更便宜,两场景表现一致。
4. **火星 dust 按 alpha 分批**(sparks.js):twinkle 量化为 8 桶,`fillStyle` 切换从每粒子一次降为每色每帧 ≤8 次;density 400 的高密度场景收益最大。

回归截图:`shot-opt-dark.png` / `shot-opt-light.png` / `shot-opt-cinder-light.png`,视觉与优化前一致(辉光、点云密度、火星分布无可见劣化)。

## 五、后续建议(按收益排序)

1. **scramble 收编主循环**:消除并发 rAF 与 textContent 写风暴(pretext 思路的延伸)。
2. **grain 转 CSS 合成层**:192px 噪点 tile 做 `background-image` + `steps()` 动画 transform,从"每 2 帧一次全屏 canvas 合成"降为 GPU compositor 零 JS 成本。
3. **地形标注 hysteresis**:消除相机旋转时的标注闪烁(第一节)。
4. **checkpoints 表只在 active 行变化时滚**。
5. **若加全屏后处理**(辉光/色差/扫描线着色器化):引入 shaders 库的半分辨率 RTT 模式。
