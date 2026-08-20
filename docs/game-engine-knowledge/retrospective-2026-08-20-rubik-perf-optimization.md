# 完整复盘：魔方 2×2 性能优化 + 注入事故 + 复用技能教训（2026-08-20）

> 范围：本轮性能优化（日志分析 → 性能画像 → 命中块预知改造 → 编译 → 注入 → 读图自检）
> 视角：流程效率 + DSL 踩坑 + **注入器残留事故（fail-closed 缺失）**
> 证据：会话轨迹、`examples/rubik-2x2/PROGRESS.md`、注入前后 sha（e911e7fa → 175825a9 事故版 → b94a689d 固化版 → ed645c0a 修复版）
> 状态：已修复，待用户游戏核验；产出：game.ts 改造 + 校验工具 + 5 个技能/文档更新

## 一、错误谱系总览

| # | 层 | 具体错误 | 根因 | 修复 | 记录位置 |
|---|---|---|---|---|---|
| 1 | DSL 使用 | `GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED: compositePins duplicate physical route` | 复合内部 `f.link(entry, 复合调用)` 显式对象边 + exec 复合 auto-chain 裸边 → 同一 InFlow 物理路由两条 | 删除显式 f.link，依赖 auto-chain；入口链首用普通节点 | dsl-nodegraph-development 技能 + PROGRESS.md |
| 2 | 工具选择 | 自写临时解码脚本验证 .gia | ① 技能文档声称工具支持 .gia 但实际只吃 .gil ② 不知道项目根 `tools/decode-gia.ts` 是 .gia 解码正解 | 用现成 `tools/decode-gia.ts`；修正技能文档边界 | gil-node-graph-reading / game-from-scratch / debug-log-investigator 技能 |
| 3 | 文档失真 | PROGRESS.md 提到 `examples/rubik-2x2/tools/decode-gia.ts` 不存在 | 工具实际在项目根 `tools/decode-gia.ts` | 技能补充正确路径 | gil-node-graph-reading 技能 |
| 4 | **注入事故** | **游戏拒载（无日志）：残留旧复合类型错位** | 删除 4 复合 → ID 前移（orbit_scheduler 0034→0030）；注入器 merge 只覆盖同 ID **不删除残留**；残留 gsts_in_layer(0032) 引用 0030（现=orbit_scheduler）→ Float/Boolean 参数传给 Integer/Entity 接口 → 拒载 | 恢复注入前干净备份→重注入（残留死复合自洽无害）；新增 `tools/check-gil-composite-refs.ts` 注入后全量校验；open-items O5 登记治本 | PROGRESS.md + 本复盘 + open-items.md |
| 5 | **自检盲区** | 注入后自检只查关键复合 + var-pins，未全量对比复合定义表 | 自检清单无"def 集合全量对比"项 | Step 3.5 新增 check-gil-composite-refs 必跑项 | gil-node-graph-reading 技能 |

## 二、系统性根因（为什么反复踩）

1. **DSL 的隐式 auto-chain 行为没有文档化**：`runCompositeCall` 单 outflow 尾部会推进当前 tail
   （`core.ts` 2221 行），使后续 exec 节点自动串联；显式 link 与其叠加产生重复边。行为在源码里，
   但技能/文档没写"入口链首用普通节点、复合调用不显式 link"的规则 → 每轮都可能踩。
2. **工具边界没写清楚**：`dump_gil_index` / `explain` / `parse` 只支持 .gil 地图，.gia 编译产物验证
   走 `tools/decode-gia.ts`——技能文档含糊地写"适用 .gil 与 .gia"，实际工具不支持，误导使用者自造脚本。
3. **复合 ID 稳定性 + 注入器残留 = 静默坏图**：defineComposite 按定义顺序分配 ID（删除/新增会整体漂移），
   注入器 merge 不清理残留——两者叠加产生"引用存在但类型错位"的坏图，且**编译器/注入器/编辑器都不 fail-closed**，
   游戏拒载前无任何警告。这是本轮最严重的系统性缺口。

## 三、流程与方法论教训

1. **复用优先，自造兜底**：任何"读/改/验证"需求先查技能工具链速查表；工具不顺手才顺手优化工具/技能，
   不自写一次性脚本（用户当场指正，本轮最重要教训）。
2. **技能文档与工具实现不一致时，以实测为准并修正文档**：声称"支持 .gia"实际不支持 → 实测确认后改技能文档。
3. **性能分析要沉淀 playbook**：帧数统计/热点归并/帧预算核算标准命令已写入 debug-log-investigator 技能。
4. **注入后自检必须全量**（事故教训）：不能只看关键复合——必须全量对比复合定义表 + 引用完整性
   （check-gil-composite-refs），因为删除/新增复合会漂移 ID，残留会静默错位。

## 四、产出清单

- **代码**：`examples/rubik-2x2/src/game.ts`（turn_lookup 查表、turn_block/turn_one 简化、do_move 8→4 定时器、
  4 个废弃复合 `_deprecated` 改名示范）；`tools/check-gil-composite-refs.ts`（新增校验工具）
- **注入**：事故版备份 `.gsts/backups/1073741882.gil.2026-08-20.broken-pre-inject.bak`；修复后 sha `ed645c0a…`，Temp 已同步
- **技能更新**：dsl-nodegraph-development（exec 链链接规则+错误速查）、debug-log-investigator（性能分析
  playbook+dump_gil_index 边界）、gil-node-graph-reading（.gia/.gil 工具边界+decode-gia.ts+Step 3.5 全量校验）、
  game-from-scratch（编译产物验证+注入流程：备份/APPDATA/自检/Temp 同步）
- **文档**：`examples/rubik-2x2/PROGRESS.md`（性能优化+事故记录）；`docs/maintenance/open-items.md` O5（治本候选）；
  本复盘
- **待办**：用户游戏核验 → 新日志帧数对比（预期每转动 ~1925→~1700 帧）；open-items O5 注入器/编译器治本

