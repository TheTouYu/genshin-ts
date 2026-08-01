# 信号

> 状态：已验证（部分规则）
> 来源：真实 GIL 相邻快照 + 手工 GIA 编辑器导入验证
> 最近校验：2026-08-01
> 适用范围：服务器节点图中的已注册信号发送节点；监听、客户端和完整列表矩阵另行验证

信号用于在节点图之间传递一次事件及其参数。信号必须先在关卡中注册，节点图里的发送节点再引用该注册定义。只包含发送节点的 GIA 不等于携带信号注册定义；导入其他地图前必须确认目标地图已经注册同一信号及参数结构。

## 已验证的发送节点骨架

真实基线来自地图 `1073741849.gil`、节点图 `1073741841`「信号调试-发送信号」。未绑定的普通发送节点使用 `SysCall 300000`；绑定信号时，编辑器会重建为信号节点，`nodeIndex` 可以变化。

绑定后的服务器发送节点满足：

```text
genericId = concreteId = 已注册信号的 sendId
kind = SysGraph
signalVersion = 1
未赋值参数不生成实例 pin
信号名 pin 必须存在
```

信号名 pin 使用 `ClientExecNode / ClientSignal` 结构。它的 `compositePinIndex`，以及每个参数 pin 的 `compositePinIndex`，都来自当前信号的注册定义，不能使用固定常量，也不能根据参数序号自行推算。

## 已验证的固定值参数规则

测试信号「信号测试全参数」按定义顺序包含 9 种普通参数。相邻快照逐步填写了其中 8 种可固定填写的参数；每轮只有目标发送节点新增对应 pin，图 metadata、节点数量、节点身份和已有 pin 保持不变。

固定值参数共享以下结构：

```text
i1.kind = i2.kind = InParam
index = 参数在信号定义中的 0-based 序号
alreadySetVal = true
itemType.classBase = Server
type = 对应 VarType
compositePinIndex = 当前信号定义为该参数分配的 pinIndex
```

| 参数类型 | VarType | VarBase / value 字段 | 本轮真实值 | 规则状态 |
|---|---:|---|---|---|
| `int` | 3 | `IntBase / bInt` | `123456` | 已验证 |
| `float` | 5 | `FloatBase / bFloat` | `1.25` | 已验证 |
| `vec3` | 12 | `VectorBase / bVector` | `(1,2,3)` | 已验证 |
| `str` | 6 | `StringBase / bString` | `信号测试` | 已验证 |
| `bool` | 4 | `EnumBase / bEnum` | `true → 1` | 已验证 |
| `guid` | 2 | `IdBase / bId` | `123` | 已验证 |
| `prefab_id` | 21 | `IdBase / bId` | `232323` | 已验证 |
| `config_id` | 20 | `IdBase / bId` | `23232332` | 已验证 |
| `entity` | 1 | `IdBase` 或数据连接 | 本轮未填写 | 待验证发送数据链 |

`bool` 的 protobuf oneof 字段是 `bEnum`，不是 `bBool`。跳过未填写的 `entity` 参数后，后续 `prefab_id` 和 `config_id` 仍保留定义序号 7 和 8；实例 pin 是定义顺序的子序列，不会压缩参数序号。

本轮观察到的 `compositePinIndex=89..97` 只属于「信号测试全参数」这一个注册定义，不推广到其他信号。

## 证据

持久不可变快照位于：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-all-fixed-params/raw/
```

- `signal-send-all-types-v0-unbound.gil`：未绑定发送节点基线；
- `signal-send-all-types-v1-bound.gil`：绑定信号、参数均未填写；
- `signal-send-all-types-v2-int.gil` 至 `signal-send-all-types-v5-str.gil`：逐项固定值；
- `signal-send-all-types-v6-fixed-scalars.gil`：补齐其余四种固定值。

每个原始文件都有同名 `.sha256`。早期真实增量、手工候选及临时注入回读保存在相邻的 `2026-08-01-manual-replay/{raw,replay}/`；`/tmp` 副本不再作为长期恢复入口。

定点比较命令：

```bash
npx tsx tools/compare-gil-node-graph.ts \
  <before.gil> <after.gil> 1073741841 --full
```

另有持久手工 protobuf GIA `2026-08-01-manual-replay/replay/20260801-signal-v5-replay-2.gia`：临时注入后的 GIL 与对应真实编辑器快照逐字节一致，并已由用户确认编辑器导入通过。该证据验证“引用目标地图既有信号定义”的节点图资产，不证明 GIA 自带信号注册定义，也不把单个 Vector 场景推广为全部参数链路的游戏行为验证。

## 尚未闭合

- `entity` 参数的数据源连接；
- 9 种列表参数及各自 Assembly List 节点；
- 控制流输入、输出以及多发送节点复用；
- 监听节点与参数消费的整类重放；
- 客户端信号节点；
- 携带信号注册三元组、可跨地图独立导入的 GIA；
- 全参数端到端游戏行为。

参数类型总表见[参数类型](parameter-types.md)，直接值与数据连接的关系见[数据流与连接](data-flow.md)，GIA/GIL 资产边界见[资产、关卡保存与导出文件](assets-and-files.md)。
