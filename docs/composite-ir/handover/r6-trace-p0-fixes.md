# R6 · trace-dataflow.ts P0 改进 — 交接文档

> 交接目的：完成 R5 实验鉴定的 3 个 P0 改进，使工具具备可配置追溯深度、截断标记和批量参数追溯能力。
> R5 对比报告：`r5-eval-synthesis.md`
> 双 Agent 原始报告：`/tmp/r5a-report.md` (JSON)，`/tmp/r5-agent-b-report.md` (树格式)

---

## 一、改动摘要

| # | 改动 | 文件 | 行数变化 |
|---|------|------|---------|
| P0-1 | `--max-depth N` / `-d N` CLI 参数 | `trace-dataflow.ts` | +5 |
| P0-2 | 树格式截断标记 `... (达到追溯深度限制 N)` | `trace-dataflow.ts` | +7 |
| P0-3 | JSON 截断标记 `"truncated": true` | `trace-dataflow.ts` | +4 |
| P0-4 | `--all-params` 追溯全部输入参数 | `trace-dataflow.ts` | +16 |
| P0-5 | `maxDepth=0` 表示无限制 | `trace-dataflow.ts` | +2 |
| P0-6 | `InParamBranch.truncated` 字段 + 检测逻辑 | `trace-dataflow.ts` | +12 |
| | 总计 | | +47 (841→888 行) |

### 改动文件

仅 1 个文件：`tests/composite/trace-dataflow.ts`

---

## 二、实现细节

### 2.1 CLI 参数解析 (L581-599)

```ts
let maxDepth = 5
let allParams = false

// 在 arg 循环中:
// --max-depth N 或 -d N
// --all-params
if (maxDepth === 0) maxDepth = Infinity  // 0 = 无限制
```

**注意事项：**
- `maxDepth=0` 在 CLI 入口转换为 `Infinity`，因此 `traceInParam` 内部始终使用 `Infinity` 或正整数
- `-d` 是 `--max-depth` 的缩写别名
- `--all-params` 无缩写（`-p` 保留给将来 `--params` 使用）

### 2.2 截断检测 (L300-322)

```ts
if (depth < maxDepth && !term.yes) {
  // 追溯子分支（现有代码）
} else if (!term.yes) {
  // depth >= maxDepth 且来源非终端 → 截断
  truncated = true
}
```

**行为：** 当 `depth >= maxDepth` 时，如果当前来源节点不是终端节点（如 `GetNodeGraphVariable` 或 `GetLocalVariable`），说明链被人为截断，标记 `truncated = true`。如果来源是终端节点，链已自然结束，不标记截断。

### 2.3 树格式截断显示 (L380-383)

```
  <- n=8  3D Vector Cross Product  OutParam[0]
  ... (达到追溯深度限制 6, 使用 --max-depth N 继续)
```

`renderBranch` 新增 `depth` 参数，在子循环后检查 `b.truncated`。显示的 depth = `当前depth + 1`（因为截断发生在子分支级）。

### 2.4 JSON 截断标记 (L435-438)

```json
{
  "index": 0,
  "source": { "node": 1, "name": "3D Vector Addition" },
  "truncated": true
}
```

标记放在**顶层对象**（`obj.truncated`），这样 jq 的 `.. | objects | select(.truncated)` 递归查询可以捕获所有截断点。

### 2.5 `--all-params` 逻辑 (L767-789)

优先级：
1. 复合节点：通过 `compositeDef.inputs` 数量确定所有参数
2. 普通节点：通过 `getInputTypes(nid)` 数量确定
3. 退回：基于 `pins` 中 `kind===3` 的 InParam 数量

**与默认行为的区别：**
- 默认：只追前 `DEFAULT_MAX_PARAMS=3` 个
- `--all-params`：追全部（复合节点可能有 1-6 个输入）

---

## 三、验证结果

| 测试场景 | 命令 | 预期 | 结果 |
|---------|------|------|:----:|
| 默认 depth=5 截断 | `trace 3 -c slip_velocity` | n=8 处显示 `...` | ✅ |
| --max-depth 10 | `trace 3 -c slip_velocity --max-depth 10` | 完整到 n=10 图变量 | ✅ |
| --max-depth 0 | `trace 3 -c slip_velocity -d 0` | 完整到 n=10 图变量 | ✅ |
| JSON truncated | `trace 3 -c slip_velocity --json` | `truncated=true` 出现 2 次 | ✅ |
| JSON 10 depth | `trace 3 -c slip_velocity --json -d 10` | `truncated` 出现 0 次 | ✅ |
| --all-params | `trace 7 -c 计算分力 --all-params` | 3 个参数全显示 | ✅ |
| 回归测试 | `trace 6 -c 计算分力` | 行为不变 | ✅ |

---

## 四、已知问题

1. **JSON 截断标记位置**：`truncated` 在 `obj` 顶层，不在 `obj.source` 层。这意味着如果 jq 用户只想看源头节点的截断标记，需要额外查询。但放在顶层便于统一捕获。

2. **--all-params 与数字参数的冲突**：如果用户同时指定 `--all-params` 和数字参数（如 `0 1 2`），`--all-params` 覆盖，数字参数被忽略。这是合理的行为但需在文档中说明。

3. **截断 depth 显示**：显示为 "限制 6" 而非 "限制 5"，因为 depth 从 0 计数，显示的是实际达到的递归深度。用户看到 "6" 需要理解 6=5+1。这是符合直觉的（显示截断发生时的实际深度）。

4. **输出文件写入方式**：`--json` 模式输出到 stdout，stderr 仍可能混入 deprecation warning。建议用户使用 `2>/dev/null` 过滤（已在 R5 文档中记录）。

---

## 五、后续 P1 方向

基于 R5 实验反馈，下一轮可做：

| 优先级 | 功能 | 工作量估计 |
|--------|------|-----------|
| P1 | `--recursive-composites` / `-r` 递归展开子复合 | 2-3 天 |
| P1 | `--call-sites` 强制模式（始终显示调用点） | 0.5 天 |
| P1 | JSON 输出 stderr 净化（`--quiet` 模式） | 0.5 天 |
| P2 | `--list-nodes` 列出复合中所有节点 | 1 天 |
| P2 | `--table` 汇总表格输出 | 1-2 天 |

---

*编写: 2026-07-02 · 对应 PR: (待创建)*
