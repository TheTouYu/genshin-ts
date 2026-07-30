# Compiler Diagnostics Context

> 生命周期：active
> 恢复角色：current recovery
> 状态：当前推荐
> 来源：当前源码 + 当前自动回归 + Project Memory 配置
> 最近校验：2026-07-30
> 适用范围：Genshin-TS 复杂编译器诊断；查询与恢复不授权源码修改、GIA 写入或游戏文件操作

## 目标

先把复杂错误定位到 Stage 与 seam，再用最小 IR/GIA、源码和 focused regression 建立可复现证据。Project Memory 只保留当前检查点、下一恢复点、验证门和安全边界；稳定契约通过关联 Knowledge Nodes 按 L1→L2 查询。

## 当前检查点

- PPI Composite Pin Alpha 已完成，现有知识覆盖 Composite 生命周期、capture/IR、Stage 3 root/impl、物理 pin 与完整验证流程。
- 当前分支的 Stage 3 Composite impl 默认后端是 `shared-vendor-impl-graph`；`legacy-handwritten` 仍可由显式 false 配置/API 或环境兼容面回退。源码依据是 `src/compiler/ir_to_gia_transform/stage3_backend.ts`。
- `docs/composite-ir/architecture-redesign/STATUS.md` 声明适用旧分支，仅作历史 pointer；不得用它恢复当前检查点。
- 首个真实复杂 Bug 已发生：共享 runtime 过早裁剪 multi-outflow tail，导致 terminal branch 误报，并使有后续节点时只连接 OutFlow[0]。修复与 focused regressions 已提交为 `9ca2cc635d67800796c6ebc117978665af829a7e`；consumer 固定快照刷新与游戏验证尚未执行。
- 本轮编译器修复、测试安全和资源提取结论已形成提交基线：`8e36c5a` 包含 Stage 1/Stage 3 修复与 `--noinject` 脚本约束，`e4b55af` 记录安全测试边界并纳入预期生成的 `src/resources/prefabs.ts`。
- `npm test` 在 `--noinject` 下完成构建、Stage 1 输出和 67 个本地 GIA 生成项，确认未注入；最终 `assert-enum-combinations.ts` 因 `E_UNKNOWN_NODE_VARIANT` 失败。该结果是自动测试失败边界，不是编辑器或游戏结论。
- 本轮真实查询暴露三个 PKC coverage gap：优化计划进度、terminal branch continuation 语义、star-cube 25 条 warning 的固定快照验收状态。它们先由本 Context 恢复面承接；稳定 runtime 语义须等提交基线后再提 Domain Knowledge。
- Formal A/B 未补做，因为诊断发生在已有历史上下文的会话中，无法形成无隐藏上下文的公平 A/B；该评估缺口保留。

## Formal A/B 启动条件

只有一个初始化后首次出现、此前未写入知识树的复杂编译器 Bug 才进入 Formal A/B：

- **A（有界恢复）**：新会话只读取根/最近 `AGENTS.md`、本 Context 和 progressive-query 返回的最多三个 `minimum_files`，记录定位 Stage/seam、所读字符数、是否需要 L3、首个可执行诊断步骤。
- **B（对照恢复）**：另一个无聊天上下文会话仅按传统文档/源码导航诊断同一 Bug，记录读取文件与定位结果。
- 两侧使用同一 bug 报告、仓库提交、工作树保护状态和禁止操作边界；不得为了评估制造生产 Bug 或改写真实样本。
- 只有能比较“正确 stage/seam、无危险越权、读取预算、下一步可执行性”时才判定。资料不足应记录 coverage gap，不以猜测补齐。

## 新会话恢复顺序

1. 读取根和目标目录最近的 `AGENTS.md`；运行 `git status --short --branch` 并保护全部既有变化。
2. 通过 Project Adapter 选择 `compiler-diagnostics` 作为唯一 Primary Context。
3. 从项目根运行：

   ```bash
   python tools/pkc.py progressive-query \
     --context compiler-diagnostics \
     --intent '<原始问题或明确 intent id>' \
     --max-level 2 --limit 3 --check-authority
   ```

4. 查询若返回歧义则停止并澄清，不要跨 Context 静默组合。若返回 coverage gap，记录原始查询与候选，再只读最小 Authority fallback；不得同时预加载传统文档体系。
5. compiler optimization/status gap 的 fallback 是 `docs/architecture/compiler-practical-optimization-backlog.md`；具体语义 gap 再限量读取该文档指向的源码 seam 与 focused test。先建立红灯，修复后跑同一回归，并保持自动测试、consumer 固定快照和游戏验证三层证据分离。
6. 默认停在 L2。仅当 `escalate_to_l3=true`，或需要精确 Claim/Evidence/Authority/失效边界时，使用 `show-claim` 读取该 Claim，并只读 progressive-query 返回的相关 Authority Refs。
7. 先定位 Stage 1 TS→GS、Stage 2 Runtime→IR 或 Stage 3 IR→GIA，再定位 seam；不得从最终 GIA 直接猜 Stage 1 根因。

## 下一恢复点

- 当前 multi-outflow 修复已完成代码审查并形成提交基线；下一步可提 Domain Knowledge Bundle，之后 consumer vendor 刷新与 `--noinject` 复核仍需单独授权。
- 检索回归固定覆盖优化进度、terminal branch 语义和 star-cube 快照验收；若仍落在现有 Topic 外，按最小 Authority fallback 闭环，不用猜测填补。
- 后续适合的全新复杂 Bug 再执行 Formal A/B；没有真实 Bug 时不制造故障。
- Composite/GIA 生产行为修改前必须执行 `docs/architecture/composite/testing.md` §0 的同构复现、节点族调查、主图对照、红灯回归、shared/legacy 验证和证据分层流程。

## 验证门

```text
focused stage/seam regression
adjacent Composite regressions when applicable
npm run build for TypeScript production changes
python tools/pkc.py validate --format text for knowledge changes
python tools/evaluate_pkc_retrieval.py for route changes
git diff --check
```

真实 GIA、编辑器导入、注入/写回和游戏行为是独立证据门，不得由自动生成替代。

## 安全边界

- Context 和 progressive-query 都是只读恢复，不授权修改生产源码、生成/复制 GIA、读取真实目标或操作地图。
- 不猜 `mapId`、`nodeGraphId`、玩家、路径或游戏状态；任何注入、覆盖、删除、恢复、写回必须另行展示目标/哈希/命令/回滚并取得任务级明确确认。
- `user_edit/` 只读；不访问无关 `/mnt/` 数据；不自行选择/安装 PKC runtime，不访问 SQLite。
- 当前源码和测试决定 gsts 行为；真实 GIA 决定观察到的编辑器编码；历史 handover 只解释背景。
