# 演练存档 · 2026-10-12 STRAIT WATCH

## 参考样本

| 文件 | 说明 |
|---|---|
| `reference/2026-10-12-ref-chokepoint-watch.jpg`（未入库，仅本地参考） | Bosphorus chokepoint watch 监控台截图（风格分析对象：纸底墨字 / 赭橙强调 / 点阵陆地 / 发丝线框） |

## 产出截图（shots/）

| 文件 | 说明 |
|---|---|
| `2026-10-12-strait-zh-light.webp` | 中文 · 浅色纸墨（默认场景，README 配图同款） |
| `2026-10-12-strait-en-light.webp` | 英文 · 浅色纸墨 |
| `2026-10-12-strait-dark.webp` | 深色 phosphor 方案 |

## 产出代码（hud-framework/，已入 GitHub main）

- `strait.html` + `js/views/strait.js` —— 海峡船只通行监控台 demo（ZH/EN 双语，?lang / ?scheme / ?accent 契约与 index 一致）
- `docs/custom-console.md` —— 「业务皮肤」方法论沉淀（五步法 + 9 条令牌纪律清单 + 踩坑实录）
- 提交：`767b75d`（demo）→ `ff03fde`（双语+review 修复）→ `5f21da7`（清单沉淀）

复现方式：仓库根目录执行 `npm run dev` → `http://localhost:7100/strait.html`
