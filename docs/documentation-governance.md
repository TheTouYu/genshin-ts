# Documentation Governance

> 状态：当前推荐
> 来源：当前代码实现 + 真实 GIA 验证流程
> 最近校验：2026-07-06
> 适用范围：gsts 开发者文档、内部逆向文档、用户文档入口

本文档定义 Genshin-TS 文档治理规则。目标是让读者和大模型能快速区分：哪些结论来自真实 GIA 文件，哪些描述的是 gsts 当前实现，哪些只是历史 handover 或待验证推测。

## 状态标签

高优先级入口和容易误导的文档应在开头使用以下标签：

```md
> 状态：当前推荐 / 已验证 / 当前实现 / 历史记录 / 部分过期 / 待验证 / 已废弃
> 来源：真实 GIA 验证 / 当前代码实现 / 历史记录 / 推测
> 最近校验：YYYY-MM-DD
> 适用范围：gsts 当前输出 / 游戏编辑器真实输出 / 两者都适用
```

状态含义：

| 状态 | 含义 |
|---|---|
| 当前推荐 | 新开发优先阅读和使用。 |
| 已验证 | 有真实 GIA、自动脚本或游戏内测试支撑。 |
| 当前实现 | 描述当前代码行为，不保证等同游戏编辑器输出。 |
| 历史记录 | handover、调试过程或过往设计，不作为当前教程。 |
| 部分过期 | 仍有参考价值，但 API、实现或验证状态已有变化。 |
| 待验证 | 推测、源码阅读结论或未完成核验。 |
| 已废弃 | 不再推荐，只保留迁移信息。 |

## 来源规则

真实 GIA 结论和代码实现结论必须分开写。

- `来源：真实 GIA 验证`：必须记录文件、命令和观察结果。常用命令包括 `trace-exec-flow.ts --io`、`trace-dataflow.ts`、`decode-gia.ts`、`analyze-composite-gia.ts`。
- `来源：当前代码实现`：必须指向源文件、函数或测试脚本，并说明是否已经自动验证或游戏内验证。
- `来源：历史记录`：不得写成当前 API 教程；需要链接到当前推荐入口。
- `来源：推测`：必须标 `待验证`，不能与已验证结论混写。

如果真实 GIA 和 gsts 当前实现冲突，文档必须明确差异和适用范围，不要合并成模糊结论。

## 当前权威入口

- 低层手动控制流 DSL：[`architecture/composite/raw-control-flow-dsl-quickstart.md`](architecture/composite/raw-control-flow-dsl-quickstart.md)
- 复合节点用户面 API：[`architecture/composite/dsl-api.md`](architecture/composite/dsl-api.md)
- GIA 工具索引：[`gia-tools-reference.md`](gia-tools-reference.md)
- 真实 GIA 逆向入口：[`composite-ir/index.md`](composite-ir/index.md)
- 历史 handover 入口：[`composite-ir/handover/README.md`](composite-ir/handover/README.md)

## API 名称迁移

当前低层控制流 API 优先使用：

| 当前推荐 | 兼容旧名或旧方式 | 说明 |
|---|---|---|
| `f.entry()` | `f.eventMarker()` | 获取当前 event marker。旧名仍可用。 |
| `f.link(src, outIdx, target, inIdx?)` | `f.linkTo(...)` | 用户文档和新示例优先使用 `link`。当前代码中 `link` 委托到 `linkTo`；旧名仍可用。 |
| `f.node()` / `f.rawExecNode()` | `f.registerExecNode()` | `node()` 创建 detached raw exec node；`registerExecNode()` 会自动串联当前 tail。两者语义不同，不是简单同名替换。 |
| `f.outflow(name, source, idx?)` | `f.leaf(idx)` | `leaf()` 是 deprecated 兼容路径。 |
| `f.inflow(name, target, idx?)` | 无 | 多 InFlow composite 的当前推荐入口。 |

旧 API 出现在 `docs/composite-ir/handover/` 中属于历史上下文；出现在当前教程中必须说明迁移关系或标记为兼容路径。

## 真实 GIA 校正流程

针对每个真实 GIA 结论，文档应保留最小可复现证据：

1. 文件路径，例如 `复杂gia/物理运动.gia` 或 Windows `Beyond_Local_Export/...` 路径。
2. 使用的命令，例如：

```bash
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --io
npx tsx tests/composite/trace-dataflow.ts <file.gia> --list-nodes
npx tsx tools/decode-gia.ts <file.gia>
```

3. 观察结果摘要。
4. 结论和适用范围。
5. 是否已和 gsts 输出对比。

## 当前实现校正流程

针对代码实现结论，文档应记录：

1. 源文件和函数或类名。
2. 当前行为。
3. 相关测试或生成脚本。
4. 游戏内验证状态，如果没有则明确写 `未游戏内验证`。
5. 与游戏编辑器真实输出是否一致；未知时写 `待验证`。

## 精简和归档规则

- 不删除有验证证据的历史材料，除非用户明确要求。
- 不把 handover 当教程维护；只维护入口、索引和状态边界。
- 重复内容优先合并到当前权威入口，旧文档用链接替代复制。
- 大范围移动或重命名文档前必须先给出目录设计并征求确认。
- 用户文档和内部逆向文档保持分界：用户文档只迁移 API 用法和通用调试流程，不暴露内部样本路径、二进制字段细节和未验证推测。
