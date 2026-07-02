# R7 · trace-dataflow.ts 工具改进 — 交接文档

> 基于 R6 双 Agent 实战反馈，对 `tests/composite/trace-dataflow.ts` 做 4 项探查功能改进。
> 仅涉及工具层，不影响编译器逻辑。

---

## 改动摘要

| # | 改动 | 行数 | 驱动因素 |
|---|------|------|---------|
| 1 | `--list-nodes` / `-l` — 列出主图所有节点 | +43 | Agent A 写自定义脚本探测节点列表；Agent B 手动穷举 index |
| 2 | JSON `_info` 提示字段 | +5 | Agent A 看到空 `params: []` 误判为"工具不兼容" |
| 3 | `--all-params` 大数组折叠 | +55 | Agent B 反馈 Assembly List 的 99 个 0 被全部展开 |
| 4 | 用法帮助更新 | +4 | 添加 `--list-nodes` 示例和 deprecation 屏蔽提示 |

总计：888 → 995 行 (+107)

## 各改动细节

### 1. `--list-nodes` / `-l`

**树格式输出：**
```
  1  Get Self Entity                       nid=73            kind=22000    pins=2  term(获取自身实体)
  2  复合:监听信号                               nid=1610612902    kind=22001    pins=2  term
  3  When Entity Is Created                nid=71            kind=22000    pins=1  term(事件上下文)
```

**JSON 输出（`--list-nodes --json`）：**
```json
[{ "index": 1, "name": "Get Self Entity", "nid": 73, "kind": 22000, "pins": 2, "terminal": true, "note": "获取自身实体" }]
```

**定位：** decode 和 `buildCompIdx` 之后、graph 选择逻辑之前的早期返回分支。

### 2. JSON `_info` 提示字段

当 `paramResults.length === 0` 时，在 JSON 输出顶层追加：
```json
{ "_info": "该节点没有输入参数（InParam），通常是终端节点（事件上下文、图变量读取、纯执行流节点）。使用 --list-nodes 查看节点列表。" }
```

**定位：** `main()` JSON 输出段，`call_sites` 之后、`console.log` 之前。

### 3. 大数组折叠（两层）

**层 A — 单 pin 数组值**（`extractLiteral` → `foldUniformArray`）：
- 处理 `bConcreteValue.value.bArray.entries` 的大数组 pin
- 前 10 个元素全相同 → 折叠显示 `"0.0 重复 ×100"`
- 非均匀数组 → 回退为 `[100 items]`

**层 B — 连续相同参数**（`main()` 渲染前折叠）：
- 收集 `paramBranches` 后再折叠
- 连续 ≥5 个相同的 `literalValue` → 折叠为一条，带 `×N` 标记
- 折叠后的 `InParamBranch._foldedCount` 在 `renderBranch` 显示 `×99`，在 `branchToJson` 输出 `folded_count: 99`
- 折叠条的 `inParamName` 后缀 `[count]`，如 `"R<T>[99]"`

### 4. 用法帮助

- 减少 `args.length < 2` → `args.length < 1`（允许仅传文件路径 + `--list-nodes`）
- 新增 `--list-nodes` 示例
- 新增 `NODE_OPTIONS='--no-deprecation'` 提示

## 验证结果

| 测试场景 | 预期 | 结果 |
|---------|------|:----:|
| `--list-nodes` 树格式 | 24 节点，含 term 标记 | ✅ |
| `--list-nodes --json` | JSON 数组，24 元素 | ✅ |
| JSON `_info`（无参节点） | `params: [], _info:` | ✅ |
| 均匀大数组折叠 | `0.0 重复 ×99` | ✅ |
| 非均匀数组不折叠 | `[6 items]` | ✅ |
| 常规 trace（回归） | 不变 | ✅ |
| `--all-params`（回归） | 不变 | ✅ |
| 名字自动查找（回归） | 不变 | ✅ |
| JSON 模式（回归） | 不变 | ✅ |
| `--max-depth 0`（回归） | 不变 | ✅ |

## 已知限制

- **`[DEP0205]` deprecation warning** 来自 tsx 模块加载阶段，无法通过脚本内部抑制。用户应使用 `NODE_OPTIONS='--no-deprecation'` 或 `2>/dev/null`。
- **`--list-nodes` 只列出主图节点**，不列复合 impl 图节点。要查看 impl 图节点，需用 `-c <name>` 进入复合模式后用 index 查看。

---

*编写: 2026-07-02 · 基于 R6 双 Agent 反馈*
