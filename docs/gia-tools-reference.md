# GIA 分析工具索引

> 状态：当前推荐
> 来源：当前工具实现 + 真实 GIA 分析流程
> 最近校验：2026-07-07
> 适用范围：gsts 当前工具链

> 本项目有约 30 个 GIA 分析/调试脚本，分散在 `tests/composite/` 和 `tools/` 下。本文按**使用场景**组织，告诉你遇到什么问题该用哪个工具。

---

## 1. 核心双工具组合：执行流 + 数据流

这两个工具覆盖了 GIA 分析的绝大部分需求，建议优先掌握。

### 1.1 `trace-exec-flow.ts`（原名 find-event-sources）

```
npx tsx tests/composite/trace-exec-flow.ts <文件.gia>
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --io
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --json [--depth=3]
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --json --io --depth=1
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --detail=5
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --expand=<复合名>
```

**能力：**

- 识别事件起点（无上游、有 Branch、非被调用）
- 渲染完整执行流树（含分支名：Double Branch 显示"是/否"，Multiple Branches 显示 case 值）
- `--expand` **穿透复合边界**，展开 impl 图内部事件源分析；嵌套复合节点会显示其当前 OutFlow 名称
- `--expand` 依赖 `compOutflows` 从主分析传入子图分析；`tests/composite/trace-exec-flow.ts` 已覆盖 `更新v、w -> 顺序执行` 场景
- `--json` 结构化输出，适合程序消费
- `--io` 输出每个节点的控制流输入/输出汇总，适合快速比对多 InFlow、多 OutFlow 和 fan-in/fan-out
- `--detail=N` 查看任意节点的完整引脚信息
- 孤悬节点检测

**典型用例：**

```bash
# 看整体执行骨架
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia

# 看每个节点的控制流输入/输出
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia --io

# 钻进复合节点看内部执行流
npx tsx tests/composite/trace-exec-flow.ts 传球.gia --expand=监听信号

# JSON 输出供后续分析
npx tsx tests/composite/trace-exec-flow.ts 弹球.gia --json --depth=3

# JSON 输出控制流 I/O，适合做小范围 diff
npx tsx tests/composite/trace-exec-flow.ts 弹球.gia --json --io --depth=1
```

### 1.2 `trace-dataflow.ts`

```
npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引|节点名> [参数索引...] [flags]
```

**flags：**

- `--all-params` 追溯目标节点的所有输入参数
- `--composite <复合名>` 定位到复合的 impl 图
- `--max-depth N` 追溯深度（默认 5）
- `--json` 嵌套 JSON 输出
- `--list-nodes / -l` 列出当前图的所有节点

**能力：**

- 从任意节点的 InParam 逆向追溯数据来源
- `⤷` 标记跨复合边界（从调用方进入被调复合的 impl 图）
- 支持手选指定参数索引追溯

**典型用例：**

```bash
# 列出主图节点
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia --list-nodes

# 追溯复合内节点的所有数据来源
npx tsx tests/composite/trace-dataflow.ts 传球.gia 3 --all-params --composite=监听信号

# 追溯指定参数，限制深度
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia 5 0 1 --max-depth 10
```

### 1.3 组合工作流

```bash
# Step 1: 看执行骨架
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia

# Step 2: 钻进关键复合
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia --expand=物理运动控制器

# Step 3: 列出内部节点，找到感兴趣的数据节点
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia --list-nodes --composite=物理运动控制器

# Step 4: 追溯数据来源
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia 5 --all-params --composite=物理运动控制器
```

---

## 2. 布局验证工具

验证 gsts 生成的 GIA 节点位置是否合理。

| 工具                        | 功能                                                                                                                  | 用法                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `ascii-layout.ts`           | **ASCII 布局图** — 将节点渲染为 2D 制表符图形，直观看到位置和连线                                                     | `npx tsx tests/composite/ascii-layout.ts <文件.gia>`                      |
| `audit-layout.ts`           | **布局质量审计** — 重叠检测、间距过近（<20px）、OutFlow 分支分析                                                      | `npx tsx tests/composite/audit-layout.ts <文件.gia>`                      |
| `dump-nodes.ts`             | **坐标 dump** — 输出所有 GIA 节点的 `nIdx @ (x, y)`                                                                   | `npx tsx tests/composite/dump-nodes.ts <文件.gia>`                        |
| `analyze-exec-lanes.ts`     | **执行分叉泳道分析** — 输出 fan-out parent/child 坐标、dx/dy、stepFromPrev                                            | `npx tsx tests/composite/analyze-exec-lanes.ts <文件.gia> [files...]`     |
| `calibrate-layout-lanes.ts` | **布局调参校准** — 输出 sibling step、exec/data Y 范围、blockBottom、gapAfterPrevBlock，适合对比参考 GIA 与 gsts 输出 | `npx tsx tests/composite/calibrate-layout-lanes.ts <文件.gia> [files...]` |

**典型问题 → 工具：**

- 节点全堆在一起？→ `ascii-layout.ts` 直观看
- 怀疑有坐标重叠？→ `audit-layout.ts` 精确检测
- 想批量比对坐标？→ `dump-nodes.ts` 输出文本，配合 diff
- 想看 fan-out lane 是否过高/过低？→ `analyze-exec-lanes.ts`
- 想反推 sibling 与上方数据区块的间距？→ `calibrate-layout-lanes.ts`

---

## 3. 跨文件对比工具

| 工具                      | 功能                                                 | 用法                                                                    |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `gia-compare.ts`          | **多维度结构化语义对比** — 对比两个 GIA 的结构异同   | `npx tsx tests/composite/gia-compare.ts <a.gia> <b.gia>`                |
| `gia-diff.ts`             | **文件级结构 diff** — 逐字段 diff                    | `npx tsx tests/composite/gia-diff.ts <a.gia> <b.gia>`                   |
| `gia-inspect.ts`          | **模块化检查** — 单文件结构分析                      | `npx tsx tests/composite/gia-inspect.ts <文件.gia>`                     |
| `verify-composite-gia.ts` | **复合节点对比** — 生成的 GIA vs 参考 GIA 结构化对比 | `npx tsx tests/composite/verify-composite-gia.ts <生成.gia> <参考.gia>` |

**适用场景：** gsts 生成结果与游戏导出参考 GIA 做精确对比。

---

## 4. `tools/` — 独立分析脚本

| 工具                       | 功能                                                | 用法                                                           |
| -------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `decode-gia.ts`            | **解码 GIA → 完整 JSON**，配合 `jq` 查询任意字段    | `npx tsx tools/decode-gia.ts <文件.gia> \| jq '...'`           |
| `analyze-composite-gia.ts` | **CompositeDef/SignalDef 深度分析**，支持多文件对比 | `npx tsx tools/analyze-composite-gia.ts <f1.gia> [f2.gia ...]` |
| `analyze-gia-arch.ts`      | **架构概览** — 分析复杂 GIA 的顶层结构              | `npx tsx tools/analyze-gia-arch.ts`                            |
| `topology.ts`              | **复合调用拓扑** — 主图中复合节点的调用关系图       | `npx tsx tools/topology.ts <文件.gia>`                         |
| `coverage.ts`              | **文档覆盖率** — 按已知模式分类复合定义             | `npx tsx tools/coverage.ts <文件.gia>`                         |
| `gap-scan.ts`              | **文档缺口扫描** — 用启发式找未知模式               | `npx tsx tools/gap-scan.ts <文件.gia>`                         |
| `preview_markdown.ts`      | **终端渲染 Markdown**                               | `npx tsx tools/preview_markdown.ts <文件.md>`                  |

**`decode-gia.ts` 常用 jq 查询：**

```bash
# 查看所有 CompositeDef 名称
npx tsx tools/decode-gia.ts <文件> | jq '[.accessories[] | select(.which==12).name]'

# 查看主图节点
npx tsx tools/decode-gia.ts <文件> | jq '.graph.graph.inner.graph.nodes[]'

# 查看 compositePins
npx tsx tools/decode-gia.ts <文件> | jq '.accessories[] | select(.which==9) | .graph.inner.graph.compositePins'

# 统计 accessories 类型分布
npx tsx tools/decode-gia.ts <文件> | jq '[.accessories[].which] | sort | unique | map({which: ., count: [.accessories[] | select(.which==.)] | length})'
```

---

## 5. 明细 Dump 脚本（`tests/composite/_dump_*.ts`）

这些脚本用于深入探查 GIA 的特定方面。所有脚本都从命令行接受文件路径：

| 脚本                                   | 分析对象                      |
| -------------------------------------- | ----------------------------- |
| `_dump_accessories.ts`                 | accessories 总体结构          |
| `_dump_all_connections.ts`             | 所有连接                      |
| `_dump_all_dataflow.ts`                | 数据流连线                    |
| `_dump_all_dataflow2.ts`               | 扩展数据流（含复合边界）      |
| `_dump_branch_details.ts`              | 分支 pin 细节                 |
| `_dump_composite_outputs.ts`           | 复合输出 pin 映射             |
| `_dump_composite_pinrec.ts`            | 复合 pin 记录                 |
| `_dump_composite_types.ts`             | 复合类型分布                  |
| `_dump_dataflow_n9.ts`                 | 特定节点 n=9 的数据流         |
| `_dump_event_pinrecs.ts`               | 事件 pin 记录                 |
| `_dump_impl_graphs.ts`                 | impl 图节点（含嵌套复合标记） |
| `_dump_literal_values.ts`              | 字面值分布                    |
| `_dump_literals_deep.ts`               | 字面值深度扫描                |
| `_dump_mbranch.ts`                     | Multiple Branches 分析        |
| `_dump_n19n23.ts`                      | 节点 n=19/n=23 专项           |
| `_dump_outparams.ts`                   | OutParam 分布                 |
| `_dump_pinrec_debug.ts`                | pin 记录调试                  |
| `_dump_presets_deep.ts`                | 预制件深度分析                |
| `_dump_setvar_details.ts`              | setVariable 细节              |
| `_dump_setvar_enum.ts`                 | setVariable 枚举值            |
| `_dump_setvar_raw.ts`                  | setVariable 原始值            |
| `_dump_setvar_values.ts`               | setVariable 值分析            |
| `_dump_type_abbrevs.ts`                | 类型缩写统计                  |
| `_debug_graph.ts` / `_debug_graph2.ts` | 图结构调试                    |
| `_debug_pins.ts` / `_debug_pins2.ts`   | pin 调试                      |
| `_debug_trace.ts`                      | 追踪调试                      |
| `_debug_accessories.ts`                | accessories 调试              |
| `_draw_named_branches.ts`              | 命名分支可视化                |
| `_find_deepest_chains.ts`              | 最长执行链查找                |
| `_lookup_params.ts`                    | 参数查找                      |
| `_render_chains.ts`                    | 链渲染                        |
| `_trace_chains.ts`                     | 链追踪                        |

**用法统一：** `npx tsx tests/composite/_dump_XXX.ts <文件.gia>`

---

## 6. 工作流速查

### 调试 gsts 生成的 GIA

```bash
# 1. 整体骨架
npx tsx tests/composite/trace-exec-flow.ts 生成的.gia

# 2. 布局检查
npx tsx tests/composite/audit-layout.ts 生成的.gia

# 3. ASCII 布局可视化
npx tsx tests/composite/ascii-layout.ts 生成的.gia

# 4. 数据流追溯（找到感兴趣的节点后）
npx tsx tests/composite/trace-dataflow.ts 生成的.gia 3 --all-params
```

### 分析参考 GIA（游戏导出）

```bash
# 1. 列事件起点
npx tsx tests/composite/trace-exec-flow.ts 参考.gia

# 2. 展开每个复合看内部结构
npx tsx tests/composite/trace-exec-flow.ts 参考.gia --expand=复合名

# 3. 看复合定义
npx tsx tools/decode-gia.ts 参考.gia | jq '.accessories[] | select(.which==12) | .compositeDef.inner.def.name'

# 4. 看数据流
npx tsx tests/composite/trace-dataflow.ts 参考.gia --list-nodes --composite=复合名
```

### 对比生成 vs 参考

```bash
npx tsx tests/composite/verify-composite-gia.ts 生成.gia 参考.gia
npx tsx tests/composite/gia-compare.ts 生成.gia 参考.gia
```

---

## 7. 快速启动检查清单

初次接触一个 GIA 文件时：

```
□ npx tsx tests/composite/trace-exec-flow.ts <文件.gia>       — 执行骨架
□ npx tsx tests/composite/ascii-layout.ts <文件.gia>          — 布局可视化
□ npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --expand=<所有复合> — 穿透复合
□ npx tsx tests/composite/trace-dataflow.ts <文件.gia> --list-nodes         — 节点列表
□ npx tsx tools/decode-gia.ts <文件.gia> | jq '.graph.graph.inner.graph.nodes | length'  — 节点数
```
