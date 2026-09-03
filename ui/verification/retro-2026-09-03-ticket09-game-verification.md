# 复盘 · 票09 游戏内核验（2026-09-03）

> 范围：1073741917「UI核验09」真实 CLI + 用户逐条游戏确认（A/B/C）+ 修复轮 R1-R5。
> 完整证据见 ui/verification/ticket09-verification-report.md；PKC/技能回灌随票08 统一执行。

## 历程（一段话）

从零建新图（maps:create+init）→ 锁基线（2602c2ce）→ 05/06/07 命令逐条真实写回 → 游戏内逐条验收。
B1a 首验即暴露大坑（空按钮）→ 一连 5 个修复轮后才把「create=编辑器默认形态」补到「游戏可用」。
C 阶段用"纯 AI 14 步确定性重放 → diff"把玩家净改动精确分离（changed=3 全 PLAYER），用户复核通过。

## 错误谱系（可复用教训）

| 教训 | 层级 | 证据/场景 | 对策 |
|---|---|---|---|
| create 复刻编辑器"新建默认形态"，不代表"游戏可用控件" | 设计层 | B1a 空按钮 / B1b 无文字 / B1c 无图片素材 | create 验收标准必须含"配置后可用"；editorOrGameValidation 一直标 not-performed，09 前没人游戏验 |
| 整组克隆 ≠ 组内成员可编辑 | 能力层 | 常态组混入文本框+图片，无法单独删图片 | 设计早有 `state material`/member 寻址命令面，L4 未实现 → 09 补引擎，CLI 见票10 |
| templateize 对带素材源不克隆模板侧素材树 | 实现层 | 删实例后模板 1853 悬空引用已删组 | 编辑器语义=模板侧独立素材副本+同步；R5 清引用兜底，feature 见票10 |
| 对齐 right 码值未落知识 | 知识层 | list 显示 unknown:2 | 铁证=编辑器样本（第12步 输入框右对齐 f19.f503=2）；解码表补齐 |
| 先写代码后查设计 | 流程层 | R2 曾另起 material-groups 思路 | 模块纪律：改命令面前先对 DESIGN/mappings/trace 推演表；用户"查看我们的设计"纠偏 |
| 子代理黑盒长时间无产出 | 协作层 | R2 子代理 7 轮无文件 | 按时限接管主线程分步实现；长任务给里程碑产物检查点 |
| 用户编辑器保存与 CLI 写交错 | 流程层 | 多次 live SHA 变化（resize/移位置/img） | SHA 门逐一衔接成功；写回前永远先核当前 SHA |

## 沉淀/后续

- 新引擎（可复用）：`ui/src/button-materials.ts`（donor 克隆+文本/颜色改写）、`ui/src/material-groups.ts`（删成员/清状态引用）；
  断言 `ui/tests/button-materials-assert.ts`（含删成员用例）。
- 对齐码与命令层缺口已追加：ui-controls.md / ui/mappings.md（票09 节）。
- 高级控件与 L4 backlog → 票10（悬浮交互页/页签/rich-image/templateize 素材克隆/队列消息/sync）。
