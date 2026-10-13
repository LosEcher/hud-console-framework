# 设计分析与演练存档

本目录由本地 `hud-console-framework/analysis/` 导入，收录对参考项目与本框架视觉演练的分析笔记与截图。

## 内容

| 路径 | 说明 |
|---|---|
| [scifi-analysis.md](./scifi-analysis.md) | 对 beastydesign/scifi（MODALE）的结构与设计令牌解析 |
| [2026-10-12-strait-watch-archive.md](./2026-10-12-strait-watch-archive.md) | STRAIT WATCH 演练存档与产出截图索引 |
| [shots/](./shots/) | 主题/组件/实验室等截图（大图已压到 ≤1600px，多数转 WebP） |
| [shots/shot.sh](./shots/shot.sh)、[shot-tall.sh](./shots/shot-tall.sh) | 本地 headless 截图辅助脚本（依赖本机 Playwright Chromium 路径） |

配套技能文档见 [../skills/scifi-hud-console/SKILL.md](../skills/scifi-hud-console/SKILL.md)。

## 外部参考仓库（未 vendoring）

本地原先还有 `reference/scifi`，对应外部仓库：

- https://github.com/beastydesign/scifi

该仓库版权归原作者，仅作学习参考，**不**并入本仓库。分析见 `scifi-analysis.md`。

## 截图压缩说明

导入时对 `shots/` 做了体积优化：宽度上限约 1600px；PNG 先走 pngquant，仍偏大的 UI 截图改为 WebP q≈80。原稿约 43MB，压缩后约 5MB。
