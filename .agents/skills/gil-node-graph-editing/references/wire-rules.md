# 节点图 wire 规则速查（已闭合，真实快照来源）

> 供 `gil-node-graph-editing` 操作时按需查阅。详细实验证据见
> `docs/game-engine-knowledge/`（control-flow.md / data-flow.md / node-graphs.md /
> composite-nodes.md）与 `~/genshin-ts-evidence/node-graph-logic/`。

## 字段号速查（wire）

```
NodeGraph {1:id, 2:name, 3:nodes, 4:compositePins}
GraphNode {1:nodeIndex, 2:genericId, 3:concreteId, 4:pins, 5:x, 6:y}
NodePin   {1:i1, 2:i2, 3:value, 4:type, 5:connects, 7:compositePinIndex}
Index     {1:kind(1=InFlow 2=OutFlow 3=InParam 4=OutParam), 2:index}
NodeConnection {1:id, 2:connect, 3:connect2}   # connect/connect2 双写
VarBase   {1:class, 2:alreadySetVal, 4:itemType, 101:bId, 102:bInt, 104:bFloat,
           105:bString, 106:bEnum, 107:bVector}
```

## 控制流（control-flow.md 闭合）

- 默认源 OutFlow[0]：`i1/i2.index` 省略；非默认 OutFlow[n]：`i1/i2.index=n` 显式
- 默认目标 InFlow[0]：`connect/connect2.index` 省略；非默认：显式目标 ShellIndex
- 控制流连线只落源侧（目标节点不实例化 InFlow pin）
- 新 OutFlow pin：`{i1/i2={OutFlow,shell}, connects}`，插在 OutFlow 组 ShellIndex 升序位置
  （整体在参数 pin 之前）
- 断线（flow-rm）= 从源 OutFlow 的 connects 列表删除 f1=target 匹配的整条记录；
  **断后无余线 → 整条 field4 pin 记录移除**；有余线 → pin 逐字节保留
- 目标节点无论默认还是非默认 InFlow 都不落盘 InFlow pin

## 数据流（data-flow.md 闭合）

- 数据连线 connects 挂在**目标侧 InParam pin**：`connects=[{1:源nodeIndex, 2:{1:4(OutParam),2:源shell}, 3:{1:4,2:源shell}}]`
- 替换线 = 改 connects.id（不新增 pin/connects）；目标已有 value 保留（Variant 实例）
- 新建 InParam pin 时按 ShellIndex 升序插入；type 由目标定义输入类型决定
- 值/连线二选一：设值（param）会清空 connects
- 列表参数值（cases）：`ConcreteBase` 内 `ArrayBase(class=10002)` + `bArray(109)` 元素列表，
  `type` = 列表 VarType（8=IntegerList / 11=StringList）

## Variant 节点（node-graphs.md 闭合）

- concreteId = 选中变体 KernelID（未配置变体不落盘）；MultiBranch: Int→3 / Str→4
- 手动选型与连线自动实例化同构：concreteId 缺失 → KernelID + 所有 R<T> 数据 pin 实例化
  （i1/i2.index 默认省略/非默认显式、type 跟随、无 connects）
- 实例化 pin 的 value=ConcreteBase(class=10000, alreadySetVal=true) +
  bConcreteValue.indexOfConcrete=TypeSelectorIndex（0 省略）
- 已连线 Variant 改类型：类型不匹配的线自动断开且目标 InParam pin 整个移除
- 批量注入写 concreteId 对 Variant 是冗余（编辑器保存会移除）

## MultiBranch（SysCall 3）实操（2026-08-09 tab-input-multibranch 闭合）

节点（Int 变体）落盘：
- 节点引用 f2/f3 = `{1:10001, 2:20000, 3:22000, 5:3}`（generic=concrete=3）
- InParam[0]：key（type=3 Int，ConcreteBase，connects 挂目标侧 ← 事件 Int 输出）
- InParam[1]：cases（type=8 IntegerList，ConcreteBase）
- 未连线 case 不实例化 OutFlow pin；Case1=OutFlow[1]（index=1 显式）→ 目标默认 InFlow
- 默认分支（若连线）= OutFlow[0]（index 省略）

cases 条目结构（bInt 的 val 在字段 1！）：
```
条目 = {1:2, 2:1, 4:{1:1, 6:{2:3}}, 102:{1:val}}
102 = IntBaseValue { int32 val = 1 }（gia.proto）
例：[1,2,3,4,5] 的末条 102 段 = b2 06 02 08 05（field102 len2 {1:5}）
```

## 节点增删（node-add-case1/2 + node-del-case1 闭合）

- node-add：nodeIndex = 最小空闲空洞；记录按 nodeIndex 升序插入；无 pin 落盘
  （有默认参数的节点新增也不落盘默认 pin）
- 有同 genericId donor 时克隆 f2/f3（含 concreteId/kind）；无 donor 按 SysCall Fixed
  模板构造（genericId=concreteId, kind=22000）
- Variant donor（genericId≠concreteId）与 Variant 新增未闭合 → fail closed
- node-del：从 nodes 数组移除该记录；nodeIndex 变回空洞可复用；root4 def 记录不删

## 复合（composite-nodes.md 闭合）

- 复合实例节点 kind=22001（普通 SysCall=22000）；实例 pin 带 field7=compositePinIndex
- 复合定义 impl 图与实例记录分离；改名/参数改名走 def 记录
- add/del/swap-input 会重编号实例节点（chooseRebuildIndex/chooseMovedIndex 规则；
  跨轮墓碑无会话史可能低于编辑器）
