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

### 非默认目标 InFlow：connect/connect2 显式 index（2026-08-06 续轮）

同一多分支节点继续只做一个连线变化：node 11 新增 `c / Case3` 并连接到新放置的
node 2「有限循环」（SysCall 5，Fixed）的**非默认** FlowIn「跳出循环」（Break，
ShellIndex=1）。本轮同时新增了目标节点（样本图原无多 FlowIn 节点），属于
“新增节点 + 连线”实验形态。before/after SHA-256 分别为
`6b304153...0a8ae` / `7bd15fd2...4acd1`。证据目录：

```bash
EXP3="$HOME/genshin-ts-evidence/node-graph-logic/node-graph-systematic/\
2026-08-06-connection-v1/experiments/control-flow-case3-node11-to-node5-v13-v14"
npx tsx .agents/skills/editor-incremental-gia-investigator/scripts/\
  verify-control-flow-experiment.ts "$EXP3" \
  --graph-id 1073741836 --source 11 --target 2 --outflow-index 3 --target-index 1 \
  --allow-added 2 --source-generic 3 --source-concrete 4 --target-generic 5 \
  --expected-pin-raw "0a0408021003 120408021003 2a0e08021204080110011a0408011001" \
  --before-hash 6b30415332eb07884957392e899cecac065fca43690a31bd9d9fad7c0490a8ae \
  --after-hash 7bd15fd292bc036fa5ea6fa0482841294bc3c4a6f36cf0f8bf37bb87a6b4acd1
```

图级差分：added=[nodeIndex 2（SysCall 5，Fixed）]、removed=[]、metadata 不变、
唯一 changed node 11（pins 4→5）。新增源 pin 位于 `pins[2]`（Case1/Case2 之后、
参数 pin 之前）：

```text
OutFlow pin (Case3):
  i1 = { kind: OutFlow, index: 3 }
  i2 = { kind: OutFlow, index: 3 }
  connects = [{
    id: 2,
    connect:  { kind: InFlow, index: 1 },
    connect2: { kind: InFlow, index: 1 }
  }]
```

raw pin 为 `0a0408021003 120408021003 2a0e08021204080110011a0408011001`：源
OutFlow `index=3` 显式（与 OutFlow[1]/[2] 同构）；与默认目标 InFlow 样本的关键差异在
connects 段 `2a0e 0802 1204 0801 1001 1a04 0801 1001` —— `connect` 与 `connect2`
都显式携带目标 `index=1`（对应 Break 的 ShellIndex=1）。目标 node 2 不实例化 InFlow
pin（pinCount=0，与默认目标行为一致）。参数化 Validator（`--allow-added` 支持新增
节点实验形态）`ACCEPT 8/8`；case1/case2 在脚本扩展后回归仍 `ACCEPT 8/8`；手工同构重放
（before + 新 pin + 新放置节点）+ 正式 GIA + 临时 GIL 回读与真实 after bytes 一致，未写
真实地图。donor verify 仍只报 node 32 既有 `contextDeclaration.kind=7` gap。

由此非默认目标 InFlow 闭合：**目标 InFlow index 非默认时，`connect/connect2` 显式写
目标 ShellIndex（与源 OutFlow index 写法对称）；默认 InFlow[0] 两个引用都省略 index；
目标节点无论默认还是非默认 InFlow 都不实例化 InFlow pin。** 源侧 OutFlow 显式 index
证据扩展到 1/2/3。

> 生产代码跟进（已修复，2026-08-06）：`applyEditorConnectionWireRules()` 曾无条件删除所有
> InFlow connect 的 index，与非默认目标 InFlow 的真实 wire 冲突；已按本证据修复
> （仅默认 InFlow[0] 省略 index，非默认保留 ShellIndex），含 red/green 测试，待用户编辑器/游戏核验。

### 默认 OutFlow[0]（index 省略）与数据+控制流同节点并存（2026-08-06 续轮）

同一地图内再做两个相邻快照实验（dataflow-case5，before/after SHA-256
`32d0603f...fee5` / `ebe73dfa...832`）：node 27「创建实体」（SysCall 70，Fixed）的默认
FlowOut 连接到 node 24「设置预设状态」（SysCall 66）的默认 FlowIn。node 24 同时已是
3 条数据线的目标（target_entity/preset_index/preset_value）和 node 11 Case1 的控制流目标。

图级差分唯一 changed node 27（pins 0→1），node 24 raw bytes 完全不变。新 pin：

```text
OutFlow pin (默认输出):
  i1 = { kind: OutFlow }            # index=0 省略（与数据流源默认 index 省略对称）
  i2 = { kind: OutFlow }
  connects = [{ id: 24, connect: { kind: InFlow }, connect2: { kind: InFlow } }]
```

raw pin 为 `0a020802 12020802 2a0a0818 12020801 1a020801`。由此闭合：

- **默认 OutFlow[0] 的 i1/i2.index 省略**（此前仅有数据流源默认省略样本，控制流源默认出口
  至此补齐）；真实证据覆盖源 OutFlow 0/1/2/3/4 与目标 InFlow 0/1；
- **数据+控制流可同节点并存**：node 24 同时是 3 数据线目标 + 2 控制流线目标，目标侧只落
  数据 pins（3 个 InParam），控制流线全部只出现在源侧（node 11 与 node 27 各一条 OutFlow）；

独立 Validator `verify-control-flow-experiment.ts --outflow-index 0`（index=0 省略形态
支持）`ACCEPT 8/8`；dataflow case1-4 回归无损。手工重放 GIA/GIL 与真实 after bytes 一致，
未写真实地图；donor verify 仍只报 node 32 既有 `contextDeclaration.kind=7` gap。

## 断线（flow-rm 真实形态，2026-08-08 闭合）

2026-08-08 `flowrm-case1-node11-unlink-n24-v53-v54` 实验只删除了 node 11 OutFlow[1]
指向 node 24 的一条控制流线（该 pin 同时还有 → n51 第二条线）。before/after SHA-256
分别为 `cd72deb3...d9f47` / `0b61ade2...b39c5`（文件大小 -12 字节）。图级比较唯一
changed 仍是 node 11，pinCount 6→6 不变。定点 raw 对比：

```text
before pin[0] OutFlow[1]: 22 24 ... 2a0a 0818 12020801 1a020801  2a0a 0833 12020801 1a020801
after  pin[0] OutFlow[1]: 22 18 ...                            2a0a 0833 12020801 1a020801
```

由此闭合：

- **编辑器断线 = 从源 OutFlow pin 的 connects 重复字段列表删除 f1=target 匹配的整条
  记录**；pin 的 i1/i2 与其他 connects 逐字节保留，不重建、不重排、不移除 pin；
- 目标侧节点完全不变（控制流目标侧本就不落盘）；
- 图外仅 root46 等长替换（与既有 case 一致的已知同步，不归因）。

**删到空形态（flowrm-case2 v54→v55 闭合，2026-08-08）**：紧接上轮只删除 node 11
OutFlow[2] → node 27 的唯一连线（before/after `0b61ade2...b39c5` /
`d325f6fc...e3b0`）。pinCount 6→5：**断后无余线的 OutFlow pin 整条 field 4 记录
移除**，其余 pin 逐字节不变、顺序不变（`2218 0a0408021002...` 整段消失）。
与 Fixed 目标断线（整 pin 移除）同构；目标侧节点仍不变。

## 控制流节点的参数

执行节点通常还带有数据参数。例如“开启运动”可能需要：

- 实体；
- 速度；
- 方向。

这些参数可以直接填写，也可以来自数据流节点。参数来源和连接方式见[数据流与连接](data-flow.md)。

## 拓扑与布局

控制流拓扑决定真实执行语义；节点坐标只帮助人阅读。复杂图推荐使用竖向分叉结构表达主干和分支，见[节点图与拓扑](node-graphs.md)。

## 待逐步还原

- 事件节点的存储和触发类型；
- 条件分支、循环和多出口节点的实际执行语义；
- 同一输出 fork 的 connects 顺序已知，但游戏内执行顺序仍待验证；
- 终点是否需要显式节点或仅由无后续连接表示；
- 更高源 OutFlow index（>4）与更高目标 InFlow index 的交叉组合（0/1 已闭合）。
