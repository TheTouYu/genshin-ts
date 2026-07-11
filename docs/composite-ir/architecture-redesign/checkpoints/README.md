# Architecture Redesign Checkpoints

> 状态：当前推荐
> 来源：architecture-redesign 执行协议
> 最近校验：2026-07-11
> 适用范围：阶段完成或关键架构决策前的稳定证据

本目录保存阶段性 checkpoint，不保存逐轮聊天记录。实时进度只维护上级目录的 `STATUS.md`。

## 何时创建

- 一个 Phase 满足退出条件时；
- 需要用户在多个架构方案中决策时；
- 发现会改变全局计划的重要反证时；
- 会话即将中断且已有可复用、不可丢失的完整证据时。

普通小工作包只更新 `STATUS.md` 和对应 phase checklist，不创建 checkpoint。

## 命名

```text
phase-0-vendor-evidence.md
phase-1-resolved-contract.md
decision-vendor-graph-materialization.md
```

使用稳定主题名，不使用聊天轮次或日期作为唯一名称。

## 内容模板

```md
# Checkpoint 标题

> 状态：已验证 / 待决策 / 部分完成
> 来源：当前代码实现 + 自动实验 + 真实 GIA（按实际填写）
> 最近校验：YYYY-MM-DD
> 适用范围：明确节点、类型、scope 和字段

## Git 基线

- branch:
- start commit:
- end commit:
- working tree:

## 完成工作包

- P0-W1：...

## 命令与结果

```bash
...
```

## 观察

- 文件/fixture：
- node/composite：
- fields：
- result：

## 已证明

...

## 未证明

...

## 与原计划的偏差

...

## 方案与影响（如待决策）

### A

### B

## 推荐与理由

...

## 下一阶段输入

...
```

## 证据规则

- 真实 GIA 写明路径、命令、节点和字段。
- 自动实验不升级为游戏验证。
- decoded defaults 不证明 wire presence。
- 大型 decoded JSON 不直接提交；提交可复现脚本和精简结果。
- Checkpoint 一旦用于阶段决策，后续不重写结论历史；新增更正段或新 checkpoint。

## 提交关系

阶段 checkpoint 应和完成该阶段的最后一个工作包一起提交，或形成独立 `docs(composite)` 提交。提交正文列出覆盖的
工作包 ID。Checkpoint 中记录 commit 时，如提交前 hash 尚未知，可在提交后下一轮补充，不为填 hash amend 已审查提交。
