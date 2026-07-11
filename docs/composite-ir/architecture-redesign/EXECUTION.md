# Composite Stage 3 Redesign 执行协议

> 状态：当前推荐
> 来源：项目工作流约束 + architecture-redesign 全局规划
> 最近校验：2026-07-11
> 适用范围：`refactor/composite-stage3-architecture` 分支上的所有重构会话

本文件是每个新会话的固定执行入口。它规定如何恢复进度、选择工作包、验证、更新文档和准备提交。
架构目标见 [global-plan.md](global-plan.md)，实时进度只看 [STATUS.md](STATUS.md)。

## 1. 会话启动：先报告，不修改

按顺序执行：

1. 读取项目根 `AGENTS.md` 和目标源码目录最近的 `AGENTS.md`。
2. 读取本文件全文。
3. 执行：

   ```bash
   git branch --show-current
   git status --short
   git log -5 --oneline --decorate
   ```

4. 读取 [STATUS.md](STATUS.md)。
5. 读取当前 Phase 文档、[migration-invariants.md](migration-invariants.md) 和
   [decision-log.md](decision-log.md) 中相关条目。
6. 只读取当前工作包需要的源码、测试和真实证据文档。
7. 修改前向用户提交恢复报告，并等待用户同意执行。

恢复报告固定格式：

```text
Branch:
Working tree:
Current phase:
Current work package:
Last completed commit:
Confirmed evidence:
Open assumptions:
Files to read:
Files to modify:
Validation commands:
Decision gates:
Explicit non-goals:
```

如果用户在启动消息中明确授权“直接执行当前工作包”，可以报告后继续；否则不得修改。

## 2. 分支与工作树守卫

预期分支：

```text
refactor/composite-stage3-architecture
```

不在该分支时停止并询问用户，不自行创建、切换、合并或 rebase。

理想工作树是 clean。如果不 clean：

1. 对照 `STATUS.md` 的“进行中/未提交变化”；
2. 用 `git diff --name-only` 和 `git diff` 判断来源；
3. 不覆盖、丢弃或重置无法解释的变化；
4. 若变化不属于当前工作包，停止并询问用户。

禁止未经用户明确授权执行：

```text
git reset --hard
git clean
git checkout -- <file>
git restore <file>
rebase/merge/cherry-pick
```

## 3. 一轮只推进一个工作包

工作包 ID 使用 `P<phase>-W<number>`，例如 `P0-W1`。

一个工作包必须具备：

- 单一目标；
- 明确输入和修改范围；
- 失败基线或观察基线；
- 实际可运行的验证命令；
- 独立完成条件；
- 独立回滚边界；
- 明确非目标。

不得把下列事项塞进同一工作包：

- capture 语义迁移；
- ordinary node lowering 迁移；
- graph connection 迁移；
- 大规模文件移动；
- 布局变化。

发现额外问题时记录到 `STATUS.md` 或 phase 文档，不顺手扩展修复。

## 4. 证据与结论

每条重要结论必须标明来源：

- 当前源码观察；
- 自动实验或回归；
- 真实 GIA；
- raw wire/round-trip；
- 注入结果；
- 用户确认的游戏内验证；
- 待验证推测。

真实 GIA 结论记录：文件、复合/节点、命令、观察字段、结论范围。Decoded defaults 不证明 wire
presence；生成成功不证明游戏行为。

Vendor 是编码机制和 schema 数据源，不自动等同真实编辑器规范。实验只能证明其覆盖到的节点、类型和字段。

## 5. 用户决策闸门

遇到以下事项停止并给用户提供证据、方案、影响和推荐，不自行决定：

- 改变目标架构或阶段顺序；
- 在两种 vendor materialization 方案间取舍；
- 把单一真实样本结论推广到类型族；
- 改变 graphValues、composite physical pins 或 capture 语义；
- 删除 legacy fallback/backend；
- 大规模移动或重命名；
- 修改 vendor/generated 文件；
- 注入、覆盖或删除游戏文件；
- mapId/nodeGraphId、游戏状态或布局取舍存在歧义；
- 自动证据与真实 GIA 冲突。

决策确定后更新 `decision-log.md`，再继续实现。

## 6. 修改规则

- Phase 0 不改生产编码行为。
- 先写观察/失败契约，再迁移实现。
- 普通 system node 最终必须使用共享 resolver/factory；不得增加物理变量名特例。
- 不手改 `src/definitions/` 和 `src/thirdparty/`。
- 不展开真实 nested composite。
- 保留 [migration-invariants.md](migration-invariants.md) 中所有基线。
- 临时输出放在已有 ignored 输出目录或 `/tmp`；不提交无说明的 decoded 大文件。

## 7. 验证协议

每次至少运行：

```bash
# 当前工作包 focused command(s)
git diff --check
```

修改 TypeScript 生产代码时至少运行：

```bash
npm run build
```

共享 Stage 3 行为发生变化时，按 phase 文档扩大到 focused composite tests、物理 GIA 生成，阶段退出前再运行
完整测试。没有运行的命令必须明确写 `NOT RUN`，不得写“应该通过”。

严禁未经用户确认注入。`--noinject` 生成不等于注入。

## 8. 文档更新协议

每个完成的工作包必须更新：

- `STATUS.md`：完成项、证据、下一工作包、工作树预期；
- 当前 phase 文档：只更新 checklist/实测结果/偏差，不重写历史计划。

仅在适用时更新：

- `decision-log.md`：产生或改变架构决定；
- `checkpoints/`：阶段结束或关键决策前形成稳定证据；
- 当前权威实现文档：只有实现真的切换后更新，不能把计划写成现状。

所有新文档保留状态、来源、日期和适用范围。每次检查相对链接和 `git diff --check`。

## 9. 完成报告

工作包完成后、提交前，固定报告：

```text
Work package:
Result:
Files changed:
Production behavior changed:
Tests added/changed:
Commands run and results:
Real-GIA evidence:
Unproven claims:
STATUS updated:
Decision log updated:
Suggested commit:
Remaining working-tree changes:
Next work package:
User decision required:
```

然后停止，等待用户审核和“提交”指令。

## 10. 提交协议

默认模式：模型准备提交，用户审核后明确说“提交”，模型才执行 commit。

提交前重新运行：

```bash
git branch --show-current
git status --short
git diff --check
git diff --stat
git diff
# 当前工作包 required focused tests
```

使用明确文件列表：

```bash
git add <file1> <file2> ...
```

禁止默认使用 `git add .`。提交信息应描述单一工作包，例如：

```text
docs(composite): establish stage3 redesign execution protocol
test(composite): add vendor float setter experiment
refactor(stage3): share setter variant resolution
```

需要时在 commit body 写：

```text
Work package: P0-W1
```

提交后检查：

```bash
git status --short
git show --stat --oneline HEAD
git log -3 --oneline --decorate
```

期望工作树 clean。若不 clean，逐项记录到 `STATUS.md`，不得隐藏。

## 11. 会话中断恢复

若工作未完成：

1. 不创建“看似完成”的提交；
2. 在 `STATUS.md` 记录已做、未做、失败命令、未提交文件和恢复步骤；
3. 下一会话先审查 diff，不重复或覆盖；
4. 如果半成品无法形成安全 checkpoint，向用户请求是否回滚；模型不得自行丢弃。

## 12. 阶段退出

只有 phase 文档所有退出条件满足，且已建立 checkpoint，才能建议进入下一阶段。阶段切换必须由用户确认。
