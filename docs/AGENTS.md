# `docs/` 文档维护规则

## 适用范围

本目录是项目的知识中枢：架构、逆向结论、维护记录、用户文档与知识树材料。文档不是代码行为的替代来源；当前源码、测试和真实 GIA/GIL 证据决定结论。

## 修改前必读

- 先读 [`documentation-governance.md`](documentation-governance.md)（状态标签与证据分层）和
  [`documentation-map.md`](documentation-map.md)（按任务找入口），再动手。
- 涉及协作方法论先读 [`collaboration-handbook.md`](collaboration-handbook.md)；涉及 PKC/知识树先读
  `project-intelligence/` 下的 `bundle-governance.md`、`knowledge-capture-canonical-flow.md`、
  `knowledge-capture-common-errors.md`。
- 修改前先确认目标文档属于哪一类：当前实现 / 真实 GIA-GIL 逆向 / 用户文档 / 维护记录 / 历史 handover；
  不同类别使用不同证据标准和写作边界。

## 目录速查

| 路径 | 内容 | 入口 |
| --- | --- | --- |
| `docs/architecture/` | 编译器、注入器、DSL、GIL 资产、Composite 当前实现 | `documentation-map.md` |
| `docs/game-engine-knowledge/` | 真实 GIA/GIL 增量逆向与引擎语义 Authority | `gil-structure-semantics.md`、`variables.md` |
| `docs/composite-ir/` | Composite/Stage 3 逆向与重构材料；`handover/` 仅历史 | `composite-ir/index.md` |
| `docs/adr/` | 已确认的架构决策，改动需记录 why | 按日期编号 |
| `docs/maintenance/`、`docs/operations/` | 工具链缺口、开放问题、操作流程 | `open-items.md` |
| `docs/project-intelligence/` | PKC/知识树/上下文与 Bundle 治理 | `bundle-governance.md` |
| `docs/requirements/`、`docs/bug-reports/`、`docs/traces/` | PRD、bug 复盘、trace 证据 | 按主题 |
| `docs/docs/zh|en/` | Rspress 用户文档站 | 只放面向最终用户的 API/教程 |

## 写作规则

- 默认中文；面向用户的文档与内部逆向/维护文档必须分开。
- 文档开头保留状态标签：`当前推荐 / 已验证 / 当前实现 / 历史记录 / 待验证 / 已废弃`，
  并注明来源（真实 GIA、当前代码、用户游戏验证、推测）。
- 真实 GIA/GIL 结论必须保留：样本路径、命令、观察摘要、结论与适用范围；不能只写“实测”。
- 当前代码实现结论必须指向源文件/函数/测试，并写明是否已自动回归或游戏核验。
- 不要把自动测试、GIA 生成或注入成功表述为“游戏行为已验证”。
- `composite-ir/handover/` 是历史背景，不是当前 API 或当前行为依据；当前权威以
  `documentation-map.md` 指向的入口为准。
- 用户文档不得暴露内部样本路径、二进制字段细节、未验证 wire 推测或破坏性操作步骤。

## 常见坑（先看再改）

- 只改一处结论但不同步 `documentation-map.md`、`open-items.md` 或技能引用，会造成入口过期。
- 用“编辑器保存后变了”当证据却没有相邻只读快照和 hash，无法归因。
- 把旧 handover 的 API/字段名写进当前教程；应先查当前源码/权威文档。
- 在用户文档里写机器相关路径（`/mnt/...`、`user_edit/`、`Beyond_Local_Export/` 等）。
- 删除有证据价值的历史记录；应补状态或指向当前权威入口。

## 验证

- 修改后检查相对链接和命令是否仍有效；可用 `npm run docs:index` 刷新索引、`npm run docs:search` 验证检索入口。
- 运行 `git diff --check`；若修改 Composite 文档，检查是否误用已废弃 API。
- 文档变更本身不构成游戏/编辑器验证；需要核验时按 `verify-injection` 流程另行执行。

## 不要做

- 不要未经确认大规模移动、重命名、合并文档或改变目录结构。
- 不要把未验证 wire 结论、临时路径或局部案例写成通用规则。
- 不要为通过测试或文档检查而掩盖真实 GIA 与当前实现的差异。
