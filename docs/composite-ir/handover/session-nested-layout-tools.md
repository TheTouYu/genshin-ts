# Session 交接：嵌套复合布局验证 + 工具链索引

> **会话日期：** 2026-07-03
> **当前分支：** `feat/fork-api-and-layout`（已 stash）
> **干净状态基底：** `8335329 add docs`

---

## 1. 本会话完成的工作

### 1.1 REASONIX.md 初始化

`REASONIX.md` 已写入项目根目录，包含：
- Stack（TS 5.9, Node.js, protobufjs, Zod, Chokidar, ESLint 9, Prettier）
- Layout（12 个顶层目录的用途）
- Commands（build, test, quicktest, gen, dev, example, to-gs）
- Conventions（`.js` import specifiers、named exports、import 排序规则）
- Watch out for（生成目录、excluded d.ts、resource 权威源、test pipeline 依赖）

### 1.2 嵌套复合 GIA 生成 + 布局验证

创建了 `tests/composite/nested-layout-test.ts`（未跟踪，仍在磁盘上），定义了三层嵌套：

```
nested_math (level 3)
  └─ callComposite → mul3 (level 2)
       └─ callComposite ×3 → add1 (level 1)
            └─ addition(x, 1)
```

生成了 `tests/composite/output/nested_layout_test.gia`（2103 bytes，已复制到游戏导出目录）。

**布局发现问题：** 纯数据复合的 impl 图节点 Y 坐标为负（`LAYOUT_DATA_Y_OFFSET = -250`），根因在 `src/compiler/ir_to_gia_transform/composite.ts:206`：

```typescript
const LAYOUT_DATA_Y_OFFSET = -250
```

该偏移量是硬编码的，纯数据复合（无 exec flow）的所有内部节点都落在 Y 负半轴。主图使用不同的布局引擎（`layout.ts` 的 `layoutPositions`），通过 `placeDetachedGrid` 确保 `maxY ≥ 300`，不受此问题影响。

### 1.3 游戏导出目录记录

路径已记入 `remember`（scope=project, name=game-export-path）：

- **WSL:** `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/`
- **Windows:** `%USERPROFILE%\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\`

### 1.4 `find-event-sources.ts` → `trace-exec-flow.ts` 重命名

原文件名 `find-event-sources.ts` 严重低估了该工具的实际能力：

| 能力 | 说明 |
|---|---|
| 事件源识别 | 检测独立执行流触发点 |
| 执行流树渲染 | 递归渲染下游链，含分支命名（是/否、case 值、outflow 名） |
| `--expand` | 穿透复合边界，展开 impl 图内部事件源 |
| `--detail=N` | 任意节点的完整引脚详情 |
| `--json --depth=N` | 结构化 JSON 输出 |
| 孤悬节点检测 | 有 OutFlow 但无上游调用的节点 |

已更新内部 header 注释和 usage 提示行。

### 1.5 GIA 工具索引文档

`docs/gia-tools-reference.md` — 按使用场景组织的工具索引，覆盖：

- 核心双工具组合 `trace-exec-flow` + `trace-dataflow`
- 布局验证套件（ascii-layout, audit-layout, dump-nodes）
- 跨文件对比工具（gia-compare, gia-diff, verify-composite-gia）
- `tools/` 独立脚本（decode-gia, analyze-composite-gia, topology, coverage, gap-scan）
- `_dump_*` 明细脚本
- 工作流速查（调试生成 GIA / 分析参考 GIA / 对比生成 vs 参考）
- 快速启动检查清单

---

## 2. 工具链使用总览

### 分析新 GIA 的推荐流程

```bash
# Step 1: 执行骨架
npx tsx tests/composite/trace-exec-flow.ts <文件.gia>

# Step 2: 布局可视化
npx tsx tests/composite/ascii-layout.ts <文件.gia>

# Step 3: 布局质量
npx tsx tests/composite/audit-layout.ts <文件.gia>

# Step 4: 穿透复合节点
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --expand=<复合名>
npx tsx tests/composite/trace-dataflow.ts <文件.gia> --list-nodes --composite=<复合名>
```

### 验证 gsts 生成结果的推荐流程

```bash
# 生成
npx tsx tests/composite/my-test.ts

# 验证
npx tsx tests/composite/trace-exec-flow.ts output/my-test.gia
npx tsx tests/composite/audit-layout.ts output/my-test.gia

# 对比参考
npx tsx tests/composite/verify-composite-gia.ts output/my-test.gia user_edit/参考.gia
```

---

## 3. 遗留问题 / 下一轮建议

| 问题 | 优先级 | 说明 |
|---|---|---|
| `LAYOUT_DATA_Y_OFFSET = -250` 导致纯数据复合 impl 图节点 Y 为负 | P1 | 可能是参考 GIA 也如此（游戏编辑器内部消化负坐标），也可能需要改为 0。建议用 `trace-exec-flow --expand` 对照分析 `user_edit/` 中的参考 GIA 确认编辑器期望的坐标范围 |
| `nested-layout-test.ts` 未入 git（stash 时的未跟踪文件仍留在磁盘上） | — | 要不要提交取决于是否想保留这个测试 |
| `trace-dataflow` 的 `--json` 模式和 `trace-exec-flow` 的 `--json` 格式不统一 | P3 | 后续可以统一输出 schema，方便两个工具流水线组合 |
| `docs/composite-ir/handover/` 下有几份引用旧文件名的文档（`find-event-sources-handover.md`、`r8-dual-tool-integration.md`、`r9-cross-graph-dataflow-tracing.md`） | P3 | 工具已重命名，引用文件未更新。如果这些文档后续还会被读，应当更新其中的文件名 |

---

## 4. 关键代码位置

| 位置 | 内容 |
|---|---|
| `src/compiler/ir_to_gia_transform/composite.ts:206` | `LAYOUT_DATA_Y_OFFSET = -250` 布局偏移 |
| `src/compiler/ir_to_gia_transform/layout.ts` | 主图布局引擎（`layoutPositions`） |
| `src/compiler/ir_to_gia_transform/composite.ts:315` | impl 图布局引擎（`computeImplLayout`） |
| `tests/composite/trace-exec-flow.ts` | 执行流分析工具（原名 `find-event-sources.ts`） |
| `tests/composite/trace-dataflow.ts` | 数据流追溯工具 |
| `docs/gia-tools-reference.md` | 工具索引文档（本会话创建） |
| `docs/architecture/runtime-dsl.md` | DSL 运行时 API 参考 |
| `docs/architecture/definition-system.md` | `f.*` 函数分类全集 |
