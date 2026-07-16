# Composite Stage 3 Redesign 执行协议

> 状态：当前推荐
> 来源：项目工作流约束 + architecture-redesign 全局规划
> 最近校验：2026-07-15
> 适用范围：`refactor/composite-stage3-architecture` 分支上的所有重构会话

本文件是每个新会话的固定执行入口。它规定如何恢复进度、选择工作包、验证、更新文档和准备提交。
架构目标见 [global-plan.md](global-plan.md)，实时进度只看 [STATUS.md](STATUS.md)。

## 1. 会话启动：先报告，不修改

### 恢复读取预算

在唯一工作包已由 `STATUS.md` 明确前，恢复只允许读取本节列出的项目规则、
`EXECUTION.md`、`STATUS.md`、当前 Phase、迁移不变量和该工作包直接相关的 ADR；不得预读
`documentation-map.md`、`documentation-governance.md`、GIA 工具索引、维护 skill、验证矩阵、
`work-packages/`、`checkpoints/`、源码、测试或真实 GIA。它们均须在工作包确定后，按本节的触发条件最小化加载。

若 `STATUS.md` 未给出唯一且可执行的工作包（例如只列下一候选、编号/范围/完成条件缺失），恢复报告必须标记该不一致并停止等待用户决定；不得通过预读历史、源码或测试自行推定工作包。

`STATUS.md` 与 Git history 的差异按下列规则处理，避免将可机械修复的提交同步滞后升级为用户决策闸门：

- STATUS 记录工作包语义状态（当前/最近包、证据、下一包、活跃边界），**不记录 git commit SHA**。
  提交身份以 `git log` / `git show` 为准；不要为了“文档里写上 SHA”而改 STATUS 或 amend。
- 若 HEAD 标题、改动范围和验证记录与 STATUS 所列当前/最近工作包一致，且差异仅为“未提交/待审核”
  字样或“工作树预期”未刷新，视为无实质影响的文档滞后：可在**下一次有实质内容的文档更新**时顺手改掉，
  不得单独为此开工作包，不得为同步 STATUS 而 `git commit --amend`，也不得在恢复报告中反复当作阻塞项。
- 只有工作包范围、完成条件、验证/用户核验记录相互矛盾，或无法从提交和当前状态确定唯一后续工作包时，
  才停止等待用户决定。

按顺序执行：

1. 读取项目根 `AGENTS.md` 和目标源码目录最近的 `AGENTS.md`。
2. 读取本文件全文。
3. 执行：

   ```bash
   git branch --show-current
   git status --short
   git log -5 --oneline --decorate
   ```

4. 读取精简的 [STATUS.md](STATUS.md)，只据此确认当前 Phase、唯一工作包和活跃边界；工作树状态以
   `git status` 为准，不从 STATUS 读 commit SHA。若无法确认唯一可执行工作包，按上文停止。
5. 在唯一工作包已确认后，读取当前 Phase 文档、[migration-invariants.md](migration-invariants.md) 和
   [decision-log.md](decision-log.md) 中与该工作包直接相关的条目。
6. 当前工作包需要历史命令、失败基线、候选 SHA 或逐包证据时，才从
   [work-packages/](work-packages/README.md) 或 [checkpoints/](checkpoints/README.md) 按链接读取对应章节；
   历史归档不得替代当前状态。
7. 若工作包需要用户编辑器、真实 GIA 或 Windows `Beyond_Local_Export` 文件协作，读取
   [COLLABORATION-PLAYBOOK.md](COLLABORATION-PLAYBOOK.md)；仅在本轮需要维护经验手册时读取其
   [维护规则](COLLABORATION-PLAYBOOK-MAINTENANCE.md)。
8. 只读取当前工作包需要的源码、测试、验证矩阵和真实证据文档。
9. 修改前向用户提交恢复报告，并等待用户同意执行。

恢复报告固定格式：

```text
Branch:
Working tree:
Current phase:
Current work package:
Last completed work package:   # 包 ID/名称即可；不要抄 commit SHA
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

1. 对照 `STATUS.md` 的当前工作包与进行中说明；
2. 用 `git diff --name-only` 和 `git diff` 判断已追踪变化的来源；若 `git status --short` 含 `??`，额外运行
   `git ls-files --others --exclude-standard` 并读取每个预期未追踪文件，不能将其视为 diff 中已审查；
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
- 按 [工作包选择协议](work-package-selection.md) 标明优先级类别及解除的上层阻塞；
- 明确输入和修改范围；
- 失败基线或观察基线；
- 实际可运行的验证命令；
- 独立完成条件；
- 独立回滚边界；
- 明确非目标。

`STATUS.md` 必须以调度卡给出唯一的最高优先级工作包；只列“下一候选”、单一 node family 或待验证方向而没有
优先级依据、完成条件和验证命令时，视为不可执行，按第 1 节停止等待用户决定。不得用聊天历史或源码自行将
comparison 等候选提升为工作包。

不得把下列事项塞进同一工作包：

- capture 语义迁移；
- ordinary node lowering 迁移；
- graph connection 迁移；
- 大规模文件移动；
- 布局变化。

**已授权的 P4 批次例外（用户，2026-07-14）**：P4-W1 可包含 B1 capture-only、B2 sparse/optional
binding、B3 nested call data 与 B4 multi-inflow/outflow 四个 boundary 回归子切片，以一次性集中请求用户游戏
核验。它仍是一个唯一工作包，且仅限 boundary 观察/契约/候选，不迁移 capture 语义、ordinary lowering、ordinary
edge、布局或默认 backend。每个子切片必须有独立 focused contract、候选路径/SHA、观察点、游戏结论和回滚边界；
任何子切片失败只归因和阻塞该子切片，不得以其他子切片的通过外推，也不得顺手扩大修复范围。

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

共享 Stage 3 生产编码行为发生变化时，按 phase 文档扩大到 focused composite tests、物理 GIA 生成，并向用户请求
编辑器/游戏核验；自动回归或候选生成不能替代这一步。除非调度卡明确标记为仅自动观察/不可核验实验，否则工作包不得
标记“验证完成”或建议提交，直至用户反馈候选的编辑器/游戏结果。阶段退出前再运行完整测试。没有运行的命令必须明确写
`NOT RUN`，不得写“应该通过”。

触及生产编码、需要用户编辑器核验时，必须按 [COLLABORATION-PLAYBOOK.md](COLLABORATION-PLAYBOOK.md)
完成候选生命周期，不得只停在仓库 staging：

1. 在仓库 `Beyond_Local_Export/` 或 `/tmp` 生成名称明确的 Stage 3 候选 `.gia`；
2. **自动复制/覆盖到游戏导出根目录**（长期授权，见 playbook）：
   `C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\`
   WSL：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/`；
3. 完成报告给出“需游戏测试清单”：游戏目录路径、SHA-256、覆盖点；
4. 用户确认通过后按 playbook 归档到 `真-测试通过/复合节点/`。

仓库内 `genshin-ts/Beyond_Local_Export/` **不是**游戏目录，编辑器看不到；只写 staging 而未复制到游戏导出根，
视为未完成用户核验准备。此复制授权不包含注入、`user_edit/`、地图目录、删除/清理或移动真实参考。

严禁未经用户确认注入。`--noinject` 生成不等于注入。

## 8. 文档更新协议

每个完成的工作包必须更新：

- `STATUS.md`：完成项、证据、下一工作包、活跃边界；
  **不要**写入 git commit SHA。工作树是否 clean 以提交后的 `git status` 为准，STATUS 不必维护
  “工作树预期: clean/dirty”这类会随提交瞬间过期的字段；若需提示未完成改动，写清文件/包语义即可。
- 当前 phase 文档：只更新 checklist/实测结果/偏差，不重写历史计划；
- 按 `COLLABORATION-PLAYBOOK-MAINTENANCE.md` 判断是否更新经验手册；只有高频、可复用、
  可行动且已证实的规律才可更新，默认每工作包最多精修或新增一条经验。

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
需游戏测试清单:   # 若本包需编辑器核验：游戏目录路径 + SHA-256 + 覆盖点；并确认已复制到游戏导出根
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
# 文档状态一致性：STATUS 当前/最近工作包、证据与下一包、ADR/checkpoint
# 必须与本工作包结果和已完成的用户核验语义一致；不得将已完成事项写成待核验/未证明。
# 不要在 STATUS 写入 git commit SHA；也不要为“提交后 STATUS 仍写未提交”单独再开一次提交。
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

**提交内容应在 commit 前一次收齐**：包括本包源码/测试，以及把 STATUS/Phase 写成“本包已完成、
下一包是什么”的文档更新。用户说“提交”后执行一次 commit；**禁止**为同步 STATUS 的“已提交”
字样或补写 commit SHA 而 `git commit --amend` 或立刻再 commit 一次。

提交后检查：

```bash
git status --short
git show --stat --oneline HEAD
git log -3 --oneline --decorate
```

期望工作树 clean。若仍有与本包无关或中断残留的改动，在完成报告里列出；不要为“让 STATUS
显示 clean”再改文档。

## 11. 会话中断恢复

若工作未完成：

1. 不创建“看似完成”的提交；
2. 在 `STATUS.md` 记录已做、未做、失败命令、未提交文件和恢复步骤；
3. 下一会话先审查 diff，不重复或覆盖；
4. 如果半成品无法形成安全 checkpoint，向用户请求是否回滚；模型不得自行丢弃。

## 12. 阶段退出

只有 phase 文档所有退出条件满足，且已建立 checkpoint，才能建议进入下一阶段。阶段切换必须由用户确认。
