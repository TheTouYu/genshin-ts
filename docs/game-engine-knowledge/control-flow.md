# 控制流

> 状态：部分已验证
> 来源：真实 GIL 相邻快照 + 独立 raw-wire Validator + 手工同构重放 + 当前代码实现与自动回归
> 最近校验：2026-08-06
> 适用范围：普通服务器节点图 SysCall 的基础 FlowOut→FlowIn 编码；事件、循环和游戏执行语义仍待验证

控制流描述逻辑在什么时间、按照什么顺序执行。

## 基本结构

```text
事件触发
→ 执行节点
→ 条件、分支或循环
→ 后续执行节点
→ 没有后续连接时结束
```

控制流的起点通常是事件。普通执行节点完成操作后，把执行权交给下一个节点。

## 多引脚节点

一个节点可能拥有多个控制流引脚。以循环为例，它需要区分：

- 进入循环；
- 执行循环体；
- 循环结束后继续。

因此控制流连接不能只记录“节点 A 连到节点 B”，还必须记录双方使用的是哪个语义引脚。

## 普通图 SysCall 的 FlowOut→FlowIn 落盘

2026-08-05 的 `node-graph-systematic/2026-08-06-connection-v1` 实验在地图内图
`1073741836`「样本-01」只做了一个编辑器变化：多分支 node 11（SysCall 3，Str 变体
concreteId 4）的第一个实际 case `a / Case1` 连接到 node 24「设置预设状态」
（SysCall 66）的默认 FlowIn。before/after SHA-256 分别为
`090fa1cf...204cdb` / `739ff14e...adf95`。证据目录与回验命令：

```bash
EXP="$HOME/genshin-ts-evidence/node-graph-logic/node-graph-systematic/\
2026-08-06-connection-v1/experiments/control-flow-case1-node11-to-node24-v11-v12"
npx tsx tools/compare-gil-node-graph.ts "$EXP/raw/before.gil" "$EXP/raw/after.gil" \
  1073741836 --full
npx tsx .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-raw.ts \
  "$EXP/raw/after.gil" 1073741836 11 --pins
npx tsx "$EXP/validator/validation.ts"
```

图级比较确认节点数保持 41、metadata 不变、无节点增删，唯一 changed node 是 node 11；
node 24 的 GraphNode raw bytes 前后完全相同。新增源 pin 位于 `pins[0]`：

```text
OutFlow pin:
  i1 = { kind: OutFlow, index: 1 }
  i2 = { kind: OutFlow, index: 1 }
  compositePinIndex = 缺失（普通 SysCall）
  connects = [{
    id: 24,
    connect:  { kind: InFlow },
    connect2: { kind: InFlow }
  }]
```

raw pin 为
`0a0408021001 120408021001 2a0a0818 12020801 1a020801`：Case1 的源
OutFlow `index=1` 显式存在；目标默认 InFlow 的 `connect/connect2` 都省略 index。
结合 `signals.md` 的单出口和双分支“是”槽（ShellIndex 0）样本，当前真实证据支持：

- 默认 OutFlow[0] 的 `i1/i2.index` 省略；已观察到的非默认 OutFlow[1] 显式保留 index；
- 执行连接挂在源 OutFlow，`connects.id` 指向目标 nodeIndex；
- 默认目标 InFlow[0] 的两个连接引用都省略 index；
- 目标节点不实例化 InFlow pin；普通 SysCall OutFlow 不带 `compositePinIndex`；
- 已有参数 pin 保持不变，新增 OutFlow 插在 pins 数组最前面。

独立 Validator 直接从原始快照重算并 `ACCEPT 6/6`；手工从 before 仅构造上述 pin 后，
正式 GIA、临时 GIL 回读和真实 after 的目标 NodeGraph protobuf bytes 完全一致。重放没有写入
真实地图，也未做编辑器再导入或游戏行为测试。整份 GIL 另有 root 46 等长保存变化，语义仍为
`INSUFFICIENT`，不归因给控制流连线。重放还遇到原图 node 32 的既有
`contextDeclaration.kind=7` 不被当前 injector verifier 接受，因此只在实验脚本内对该精确错误
做了限界兼容；production injector 未修改。

当前实现已匹配上述 wire：
`src/compiler/ir_to_gia_transform/ordinary_graph_materializer.ts` 的
`applyEditorConnectionWireRules()` 省略 InFlow 和默认 OutFlow[0] index，同时保留非默认
OutFlow index；`tests/composite/test-stage3-ordinary-graph-materializer.ts` 断言
OutFlow[1] 的 `i1/i2.index=1` 不被删除。自动回归证明当前实现结构，不替代真实编辑器或游戏证据。

### OutFlow[2] 与多 OutFlow pin 数组顺序（2026-08-06 续轮）

同一多分支节点继续只做一个编辑器变化：node 11 的 `b / Case2` 连接到 node 27「创建实体」
（SysCall 70，Fixed，未配置任何参数）的默认 FlowIn。before/after SHA-256 分别为
`739ff14e...adf95` / `6b304153...0a8ae`。证据目录：

```bash
EXP2="$HOME/genshin-ts-evidence/node-graph-logic/node-graph-systematic/\
2026-08-06-connection-v1/experiments/control-flow-case2-node11-to-node27-v12-v13"
npx tsx "$EXP2/validator/validation.ts"
npx tsx "$EXP2/replay/replay.ts"
```

图级差分同样唯一 changed node 11（pins 3→4），node 27 raw bytes 不变。新 pin 位于 `pins[1]`，
在既有 Case1 OutFlow[1]（pins[0]）之后、数据参数 pin 之前：

```text
OutFlow pin (Case2):
  i1 = { kind: OutFlow, index: 2 }
  i2 = { kind: OutFlow, index: 2 }
  connects = [{ id: 27, connect: { kind: InFlow }, connect2: { kind: InFlow } }]
```

raw pin 为 `0a0408021002 120408021002 2a0a081b 12020801 1a020801`：源 OutFlow `index=2`
显式存在（与 OutFlow[1] 同构，仅 index 值 1→2 与 connects.id 24→27 不同）；目标 InFlow
引用继续省略 index。独立 Validator `ACCEPT 8/8`；手工从 before 仅构造该 pin 后，正式 GIA、
临时 GIL 回读与真实 after 的目标 NodeGraph bytes 完全一致，未写真实地图。donor verify
仍在未修改 before 上报 node 32 `contextDeclaration.kind=7` 既有 gap，与 OutFlow[2] 无关。

由此 OutFlow 0/1/2 全部由真实证据闭合：每个非默认出口都显式写源 index，默认出口省略；
多个 OutFlow pin 按 index 升序排列，且整体位于参数 pin 之前（插在数组头部区域）。

## 控制流节点的参数

执行节点通常还带有数据参数。例如“开启运动”可能需要：

- 实体；
- 速度；
- 方向。

这些参数可以直接填写，也可以来自数据流节点。参数来源和连接方式见[数据流与连接](data-flow.md)。

## 拓扑与布局

控制流拓扑决定真实执行语义；节点坐标只帮助人阅读。复杂图推荐使用竖向分叉结构表达主干和分支，见[节点图与拓扑](node-graphs.md)。

## 待逐步还原

- 目标使用非默认 InFlow index 时，`connect/connect2.index` 的实际编码；
- 事件节点的存储和触发类型；
- 条件分支、循环和多出口节点的实际执行语义；
- 同一输出 fork 的 connects 顺序已知，但游戏内执行顺序仍待验证；
- 终点是否需要显式节点或仅由无后续连接表示。
