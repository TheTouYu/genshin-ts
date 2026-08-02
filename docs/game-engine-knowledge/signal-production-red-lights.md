# 信号生产红灯修复清单

> 状态：红灯已锁定（两个 focused regression 均 RED），修复**待用户明确要求**
> 来源：真实 GIL 相邻快照 + 独立 Validator ACCEPT + 生产实现只读比对（2026-08-02）
> 适用范围：`src/compiler/ir_to_gia_transform/composite.ts` 的信号消费与控制流 lowering
> 证据细节：`docs/game-engine-knowledge/signals.md` 及
> `genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/notes/manifest.md`

本文档是生产修复的唯一入口：记录红灯差异、wire 形态、修复范围和验证方式，避免后续会话
丢失上下文。**修复前必须由用户明确要求**；未获要求时保持红灯，不进入 production seam。

## 红灯总表（实现 vs 真实 vs 测试）

| 项 | production 当前实现 | 真实编辑器 wire | focused regression | 状态 |
| --- | --- | --- | --- | --- |
| A. 数据连接 connect2 | 一律 `connect2=connect=源 index`（composite.ts） | str 源→`3`、entity 源→`4`（跨家族恒定） | `tests/composite/test-signal-monitor-consume-entity-connect2-red.ts` | RED |
| B. exec 连接 connect/connect2 | 写 `{kind:InFlow, index:0}`（composite.ts 636-642/1019-1024 等） | index 字段 wire 缺失（2B 形态） | `tests/composite/test-signal-monitor-exec-conn-index-red.ts` | RED |
| C. OutFlow pin i1/i2 | 写 `{kind:OutFlow, index:0}`（composite.ts 942/1342/1419/1486/1568 等） | index 字段 wire 缺失（2B 形态） | 同上（raw wire 断言覆盖） | RED |
| D. 目标节点 InExec | 不落盘 | 不落盘 | 一致 | 一致 |
| E. exec 连接挂源 OutFlow、connects.id=目标 | 一致 | 一致（vendor/legacy 两路径） | — | 一致 |
| F. fork connects 数组保序 | vendor 路径 push 保序（代码审查） | 顺序即编辑器连线顺序 | — | 一致（未逐字节验证） |

## wire 形态速查（protobuf presence 区分）

protobufjs encode 对 proto3 普通标量的默认值会写**显式字段**：`{kind:1,index:0}` →
`08 01 10 00`（4B），而真实编辑器 `{kind:1}` → `08 01`（2B）。因此断言必须搜索：

```text
InFlow connect 无 index：12 02 08 01      显式 index=0：12 04 08 01 10 00
connect2  无 index：1a 02 08 01          显式 index=0：1a 04 08 01 10 00
OutFlow i1 无 index：0a 02 08 02         显式 index=0：0a 04 08 02 10 00
OutFlow i2 无 index：12 02 08 02         显式 index=0：12 04 08 02 10 00
str 例外 connect2=3：1a 04 08 04 10 03
```

## 修复范围（用户要求后执行）

```text
1. exec Index 不写 index 字段：connect/connect2（InFlow）+ OutFlow pin 的 i1/i2
2. 数据连接 connect2 例外：str 源→3、entity 源→4（经验规则；底层语义 INSUFFICIENT，
   例外值 3/4 的注册定义 pinIndex、compositePinIndex、参数序号等解释均已排除）
```

约束：

- 新 monitor 布局仍必须从当前 CompositeDef/注册定义解析，不能只写死 `3 + 参数序号`；
- 修复后红灯测试转绿（raw wire 断言：2B 形态必须存在、4B 形态必须不存在）；
- 必须跑信号相关全量回归（`tests/signal_consumption_replay_regression.ts`、两个红灯测试、
  涉及 composite lowering 的现有测试）；
- 生产代码改动还需 `npm run build` 和 `git diff --check`；
- 自动测试转绿 ≠ 编辑器导入/游戏行为正确：涉及 Stage 3 生产编码行为变更，完成前必须请求
  用户编辑器/游戏核验。

## 真实证据来源（修复依据，勿重做）

- 数据连接 connect2 例外：entity 跨家族（18 族 2657 与 180 族 183 均 connect2=4，
  实验 `entity-dtc-connect2-discriminator-01`）；str 跨家族（18 族 2656 两样本 +
  打印字符串 SysCall 1 两样本，实验 `str-cross-family-print-string-01` 与
  `print-string-fork-01`；另 branch-node-03 第 6 样本）。
- exec 连接无 index：`print-string-control-flow/fork/order-swap/chain` 四轮独立
  Validator ACCEPT；`branch-node-02`（三连接 fork）与 `branch-node-03`（双分支多槽
  节点 OutFlow 无 index）追加 raw wire 断言。
- 修复只读比对轮：2026-08-02，差异点 A-F 如上表，红灯已锁定，测试驱动与诊断见两个
  红灯测试文件注释。

## 分层证据边界

```text
真实 GIL 相邻快照（用户编辑器保存）→ 独立 Validator ACCEPT → raw wire 断言
→ 红灯 focused regression RED → （修复）生产代码 red→green → 全量回归
→ 用户编辑器导入核验 → 游戏行为核验（步骤 10，尚未进行）
```

当前停在"红灯 RED"；进入修复需满足 SKILL「进入生产修复的门」全部条件（用户要求是其一）。
