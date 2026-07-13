# 新会话启动提示

> 状态：当前推荐
> 来源：architecture-redesign 执行协议
> 最近校验：2026-07-13
> 适用范围：每次开启新的 Composite Stage 3 Redesign 会话

将下面内容作为新会话的启动消息发送给大模型：

```text
请按以下固定执行入口恢复 Composite Stage 3 架构重构：

docs/composite-ir/architecture-redesign/EXECUTION.md

完整执行“会话启动”步骤。先只读取精简 STATUS.md；仅当它明确给出唯一、可执行的工作包后，才读取当前
Phase 文档、迁移不变量和该工作包直接相关的决策。
在工作包确定前，不要读取 documentation-map/governance、GIA 工具索引、维护 skill、验证矩阵、历史
handover、work-packages/checkpoints、源码、测试或真实 GIA；不要依赖聊天历史或自行拼接历史来推定工作包。
若 STATUS 未给出唯一工作包，或其状态与 Git history 冲突，恢复报告中标明不一致并停止等待我的决定。只有
已确定的当前工作包需要精确历史证据时，才按 STATUS 的链接读取 work-packages/checkpoints 中对应章节。

修改前先向我提交协议规定的恢复报告，至少包含：
1. 当前分支、工作树和最近提交；
2. 当前 Phase 与唯一工作包；
3. 已确认事实和未确认假设；
4. 本轮拟读取与拟修改文件；
5. 实际验证命令与完成条件；
6. 用户决策闸门和明确非目标。

在我同意前不要修改。每轮只推进一个工作包；完成后更新 STATUS.md 并提交完成报告，等待我审核。
未经明确指示不要 git commit，不要切换/合并/rebase 分支，不要修改 vendor/generated，不要注入或操作游戏目录。
```

如果希望授权模型在恢复报告后直接执行，但仍不提交，可以追加：

```text
恢复报告如与 STATUS.md 完全一致，可以直接执行当前工作包；仍然不得提交，遇到决策闸门必须停止。
```

如果只希望核验状态，不执行，追加：

```text
本轮只做恢复和审计，不修改任何文件。
```

## 用户审核最小清单

收到恢复报告后只需重点确认：

- Branch 是否为 `refactor/composite-stage3-architecture`；
- Working tree 是否 clean，或每项变化是否都被精简 STATUS 的当前工作包解释；
- 是否只有一个工作包；
- 是否把待验证假设误写成事实；
- 修改范围是否符合 phase；
- 是否触发需要用户决定的闸门。

工作包完成后，可回复：

```text
先按 EXECUTION.md 做提交前核验，展示最终 diff/验证结果，不提交。
```

确认无误后再回复：

```text
按 EXECUTION.md 提交当前工作包。
```
