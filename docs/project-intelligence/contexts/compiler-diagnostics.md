# Compiler Diagnostics Context

> 生命周期：active
> 恢复角色：current recovery
> 状态：当前推荐
> 来源：当前源码 + 当前自动回归 + Project Memory 配置
> 最近校验：2026-07-27
> 适用范围：Genshin-TS 复杂编译器诊断；查询与恢复不授权源码修改、GIA 写入或游戏文件操作

## 目标

先把复杂错误定位到 Stage 与 seam，再用最小 IR/GIA、源码和 focused regression 建立可复现证据。Project Memory 只保留当前检查点、下一恢复点、验证门和安全边界；稳定契约通过关联 Knowledge Nodes 按 L1→L2 查询。

## 当前检查点

- PPI Composite Pin Alpha 已完成，现有知识覆盖 Composite 生命周期、capture/IR、Stage 3 root/impl、物理 pin 与完整验证流程。
- 当前分支的 Stage 3 Composite impl 默认后端是 `shared-vendor-impl-graph`；`legacy-handwritten` 仍可由显式 false 配置/API 或环境兼容面回退。源码依据是 `src/compiler/ir_to_gia_transform/stage3_backend.ts`。
- `docs/composite-ir/architecture-redesign/STATUS.md` 声明适用旧分支，仅作历史 pointer；不得用它恢复当前检查点。
- 当前尚未以初始化后的首个全新复杂 Bug 完成 Formal A/B；这是一项恢复评估缺口，不表示现有 Alpha 证据失效。

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

4. 查询若返回歧义或 coverage gap，停止并澄清；不要跨 Context 静默组合。只读取返回的 `minimum_files`，不要加载整个 `docs/`、`knowledge/` 或 Authority Ref 表。
5. 默认停在 L2。仅当 `escalate_to_l3=true`，或需要精确 Claim/Evidence/Authority/失效边界时，使用 `show-claim` 读取该 Claim，并只读 progressive-query 返回的相关 Authority Refs。
6. 先定位 Stage 1 TS→GS、Stage 2 Runtime→IR 或 Stage 3 IR→GIA，再定位 seam；不得从最终 GIA 直接猜 Stage 1 根因。

## 下一恢复点

- 下一次真实复杂 Bug 到来时执行 Formal A/B，并把评估结果加入恢复/检索数据；没有真实 Bug 时不制造故障。
- 若问题落在现有 Topic 外，先记录 coverage gap，确认权威源码、测试和边界后再提不可变 Bundle。
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
