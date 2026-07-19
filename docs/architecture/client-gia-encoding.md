# 客户端 GIA 编码契约

> 状态：已验证 / 下一工作包当前编码基线
> 来源：真实客户端 GIA 观察 + 当前 materializer 实现 + 自动回归 + 用户编辑器/游戏验证
> 最近校验：2026-07-19
> 适用范围：目标地图已有客户端信号的 `sendSignalToServerNodeGraph` 候选编码；尚不等同于生产 `g.client()` 或全量客户端节点支持

本文是客户端 GIA **编码细节**的权威文档。客户端整体路线、`g.client()`、Client IR 和 Stage 1/3 工作包见
[`client-node-support-plan.md`](./client-node-support-plan.md)。

## 1. 证据基线

### 1.1 真实样本

| 样本 | 大小 | SHA-256 | 用途 |
|---|---:|---|---|
| `Beyond_Local_Export/user_edit/客户端/信号-参数-完整.gia` | 2954 bytes | `13543f2453b48ea24c2068865858ce22b0ed34ebbe80e97f5aaf42d9701ed218` | 9 种标量参数、entity/GUID 数据源和 signal pin 编码 |
| `Beyond_Local_Export/user_edit/客户端/信号-参数-完整-列表.gia` | 11308 bytes | `7f7da67532054a407fa848de8b83668befb0eed6bb3db8ddca00a53e6add9304` | 9 种列表参数、typed `assembly_list` 和元素槽位 |

主要命令：

```bash
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts --check-header <file.gia>
npx tsx tools/decode-gil-raw.ts <file.gia>
npx tsx tools/decode-gil-signals.ts <file.gia>
```

语义解码不能单独证明 protobuf 字段 presence；协议问题还必须结合 raw wire 或 message/container
round-trip。

### 1.2 当前候选和用户验证

focused 入口：

```text
tests/composite/test-client-signal-materializer.ts
```

最终组合候选：

```text
Beyond_Local_Export/gsts测试信号_v2_三个信号顺序发送_带参数_实体GUID.gia
```

该候选覆盖：

- 三个目标地图已有信号的顺序发送；
- 9 个标量参数；
- entity/GUID 数据源；
- 9 种列表参数；
- typed `assembly_list`；
- protobuf message/container round-trip。

用户已确认该候选编辑器导入和游戏测试通过。自动生成、编辑器导入和游戏行为是不同证据层级；本节结论不推广到任意地图、任意 signal identity 或未取样客户端节点族。

### 1.3 TS 生产闭环验证结果

当前生产 TS 回归入口为：

```text
tests/runtime/test-client-full-signal-ir-to-gia.ts
```

它使用 `g.client({ type: 'skill', id }).onStart(...)` 表达完整输入，不直接构造 GIA 节点。当前已验证：

- `信号_1` 的 entity 参数由 `getSelfEntity()` 连接；
- `信号_全部列表参数测试` 的 9 类列表由 TS `assemblyList` 生成；
- `bool_list` 支持多个 bool 元素；
- `vec3_list` 支持多个 vec3 元素；
- signal 目标 `InParam` 保留 source `OutParam` 数据边；
- 三个 signal 节点按 TS 调用顺序形成控制流。

最新 TS 产物已由用户导入游戏目录并确认游戏测试通过。该结论是当前 fixture 和目标地图 signal registry 的游戏证据，不推广到所有客户端节点、所有地图或任意 signal schema。

## 2. 目标地图 signal identity

当前 materializer 不复制参考 GIA 的 SignalDef accessories，而是引用目标 `.gil` 中已经注册的 signal：

```text
readRegisteredSignalsFromGil()
→ signal name / params / sendId / monitorId / serverId
```

当前已验证目标地图 `1073741848.gil` 的 sendServer ID：

```text
信号_1               → 1610612740
信号_全部列表参数测试 → 1610612746
信号_全部参数测试    → 1610612743
```

### 2.1 图级契约

当前目标地图已有 signal 的 standalone 候选：

```text
accessories = []
root.graph.relatedIds = 使用到的 sendServerId 列表
```

`accessories=[]` 是当前 materializer 的选择，不代表所有编辑器生成的 signal GIA 都没有定义附件。
真实参考文件中存在 SignalDef/监听信号定义附件；这些附件不能直接复制到当前目标地图已有 signal 方案。

### 2.2 signal GraphNode 契约

```text
genericId.class    = SystemDefined (10001)
genericId.type     = Skill (20002)
genericId.kind     = SysGraph (22001)
genericId.nodeId   = 目标地图的 sendServerId
concreteId.class   = SystemDefined (10001)
concreteId.type    = Skill (20002)
concreteId.kind    = SysCall (22000)
concreteId.nodeId  = 2000
signalVersion      = 1
```

信号名不是普通 `InParam`：

```text
pin.i1.kind       = ClientExecNode (5)
pin.i1.index      = 1
pin.clientExecNode.kind = ClientSignal (6)
pin.value.bString.val   = signal name
```

另有 binding ClientExec pin（`kind=5`）用于客户端执行上下文；其具体 CPI 以目标 signal definition/参考样本为准。

### 2.3 参数 CPI

参数物理 pin index 在当前 signal node 内从 `0` 开始，但 `compositePinIndex` 不能对所有 signal 写死：

| signal | 参数 CPI |
|---|---|
| `信号_1` | `65, 66, 70, 71, 79` |
| `信号_全部列表参数测试` | `176..184` |
| `信号_全部参数测试` | `137..145` |

生产实现必须从目标 signal registry/definition 获取 CPI；不得把这些数字推广成全局常量。

## 3. ClientVarType 与 VarBase

客户端 pin 的 `type` 使用 `ClientVarType`，不能使用服务器 `VarType`。

### 3.1 标量映射

| TS/IR 类型 | ClientVarType | VarBase class | value oneof |
|---|---:|---:|---|
| `entity` | 1 | `Unknown=0` | 无具体值；typed placeholder |
| `guid` | 14 | `IdBase=1` | `bId` |
| `int` | 3 | `IntBase=2` | `bInt` |
| `bool` | 5 | `EnumBase=6` | `bEnum` |
| `float` | 7 | `FloatBase=4` | `bFloat` |
| `str` | 9 | `StringBase=5` | `bString` |
| `vec3` | 11 | `VectorBase=7` | `bVector` |
| `prefab_id` | 19 | `IdBase=1` | `bId` |
| `config_id` | 18 | `IdBase=1` | `bId` |

关键规则：bool 的 protobuf oneof 字段是 `bEnum`，不是 `bBool`。

### 3.2 entity placeholder

信号节点的 entity 参数使用：

```text
class = Unknown (0)
alreadySetVal = false
itemType.classBase = Client (2)
itemType.type_client.type = Entity_ (1)
```

实际值由 `connects` 提供，不能把空 placeholder 当成最终实体值。

辅助节点的 entity pin 在真实样本中使用 `IdBase + bId.val=0` 的 typed 默认值；这与 signal 节点边界 placeholder 是两个不同位置的编码规则。

## 4. entity/GUID 数据源

当前已验证的数据流：

```text
get_self_entity
  genericId.nodeId = 200033
  concreteId.nodeId = 1013
  OutParam[0] = Entity
       ├──→ sendServer entity 参数
       └──→ query_guid_by_entity InParam[0]

query_guid_by_entity
  genericId.nodeId = 200027
  concreteId.nodeId = 1005
  OutParam[0] = GUID
       └──→ sendServer guid 参数
```

连接方向统一为来源节点的 `OutParam[0]` 指向目标节点 `InParam`；来源节点和 signal 参数都必须保留类型正确的物理 pin。

## 5. 九种列表参数

当前目标 signal schema 覆盖：

```text
config_id_list, prefab_id_list, entity_list, guid_list, bool_list,
vec3_list, str_list, float_list, int_list
```

最终生产候选统一采用：

```text
具体类型值
→ typed assembly_list
→ assembly_list.OutParam[0]
→ sendServer signal InParam
```

参考文件中故意未连线的 `config_id_list`、`prefab_id_list`、`float_list`，由已验证的具体类型规律补齐；不能把参考文件中某个未连线状态误当成列表族的通用规则。

### 5.1 列表映射表

| 列表类型 | signal pin type | assembly generic | assembly concrete | 元素 type | 元素 concrete index |
|---|---:|---:|---:|---:|---:|
| `config_id_list` | 20 | 200049 | 568 | 18 | 7 |
| `prefab_id_list` | 21 | 200049 | 569 | 19 | 8 |
| `entity_list` | 2 | 200049 | 1025 | 1 | 0 |
| `guid_list` | 15 | 200049 | 1043 | 14 | 6 |
| `bool_list` | 6 | 200049 | 1027 | 5 | 2 |
| `vec3_list` | 12 | 200049 | 1030 | 11 | 5 |
| `str_list` | 10 | 200049 | 1029 | 9 | 4 |
| `float_list` | 8 | 200049 | 173 | 7 | 3 |
| `int_list` | 4 | 200049 | 1026 | 3 | 1 |

`assembly generic=200049` 是 GIA 解码后的 `genericId.nodeId`。vendor/node-data 表中的同类逻辑 ID 可能以 `169`（`Assembly_List__Generic`）或 typed ID 表示；生产 resolver 必须统一解析到当前 wire 所需的 generic/concrete identity，不能混用两个 ID 空间。

### 5.2 assembly_list 物理布局

```text
GraphNode.genericId.nodeId = 200049
GraphNode.concreteId.nodeId = typed concrete
InParam[0]       = Int 元素数量
InParam[1..10]   = 元素槽位
OutParam[0]      = 列表输出
```

元素槽位：

- 前 `count` 个槽位写入真实元素；
- 未使用槽位保留对应元素类型的默认值；
- 未使用槽位不增加 count；
- `count` 必须来自 IR/TS 的实际元素数量，不能由 encoder 扫描默认 pin 推断。

元素输入使用：

```text
class = ConcreteBase (10000)
alreadySetVal = true
bConcreteValue.indexOfConcrete = 元素 concrete index
bConcreteValue.value = 标量元素 VarBase
```

`OutParam[0]` 使用 `ConcreteBase` 包裹的空 `ArrayBase` 类型值：

```text
bConcreteValue.value.class = ArrayBase (10002)
bConcreteValue.value.itemType.type_client.type = 列表 ClientVarType
bConcreteValue.value.bArray.entries = []
```

signal 的列表 InParam 使用 `ArrayBase`，其 `itemType` 是列表类型；不能把列表类型写到 assembly 元素槽位中。

### 5.3 本轮样本值

这些值用于回归和真实候选，不应硬编码进生产 API：

```text
str_list  = ['测试']
bool_list = [false, true, false]
vec3_list = [(1, 2, 3.4), (4, 5, 6.7)]
```

当前 TS 回归已对 bool/vec3 多元素 count 和实际元素值断言；这证明当前 `assembly_list` lowering 的多元素路径可复现，不代表列表长度上限、空列表、动态列表或超过 10 个元素已获得游戏证据。
```

生产 TS 应允许字面量和连接值产生元素：

```text
assemblyList([str('a'), str('b')], 'str')
assemblyList([bool(false), bool(true)], 'bool')
assemblyList([vec3([3, 0, 2])], 'vec3')
```

空列表、多于 10 个元素、literal/conn 混合列表以及动态列表的游戏行为尚未作为独立证据冻结；生产 API 设计前应分别建立边界回归。

## 6. 生产 TS → Client IR → GIA 前置模型

### 6.1 当前生产 lowering 的列表策略

> 状态：当前实现
> 来源：当前代码实现 + 真实 GIA 结构回归
> 最近校验：2026-07-19
> 适用范围：当前 `ClientIRDocument` → 客户端 GIA lowering；未完成编辑器/游戏核验

`src/runtime/IR.d.ts` 的 `ClientValueIR` 现在显式区分列表编码：

```text
{ kind: 'list', encoding: 'direct-list' | 'assembly-list', elementType, elements }
```

- `direct-list` 直接在 signal `InParam` 写入 `ArrayBase + bArray.entries`，不创建 assembly 节点；当前 focused fixture 只允许字面量元素。
- `assembly-list` 保留 `assembly_list` 数据节点、typed concrete、`InParam[0]` count 和 `OutParam[0]`；signal 目标 `InParam` 保留规范 source → target 数据边。
- assembly `OutParam[0].connects` 不再反向写入 signal；真实样本的规范字段只要求目标 signal `InParam.connects`。
- 现有 runtime `f.assemblyList(...)` 仍明确生成 `assembly-list`，不会按元素类型猜测 direct 路径。

回归：`tests/runtime/test-client-list-encoding.ts` 同时读取真实
`Beyond_Local_Export/user_edit/客户端/信号-参数-完整-列表.gia`（11308 bytes、6 个 assembly、9 个
signal 列表 pin）并检查生成的 direct/assembly 双路径。该回归证明编码结构和 protobuf 解码结果，不证明
当前产物已通过编辑器导入或游戏行为验证。


当前 materializer 是 focused fixture，不是生产入口。下一步 Client IR 应显式表达：

```text
get_self_entity() -> entity
query_guid_by_entity(entity) -> guid
assembly_list<T>(elements: ClientValueIR[]) -> T[]
send_signal_to_server(signalRef, params: ClientValueIR[])
```

建议约束：

1. `signalRef` 通过目标 signal registry 解析 name、schema、serverId 和 CPI；
2. TS 参数顺序必须与 registry schema 完全一致；
3. literal 参数保留具体值和具体类型；
4. conn 参数保留来源 node/pin/type；
5. 列表保留 element type、元素顺序和 count；
6. signal lowering 不猜测 signal ID、CPI 或列表 concrete；
7. Client Stage 3 使用 `ClientVarType`，不能复用服务器 `VarType`；
8. `accessories=[]` 方案与复制 SignalDef accessories 方案必须是显式互斥策略。

## 7. Vendor 与真实 GIA 的职责边界

### vendor/当前源码提供

- protobuf `ClientVarType`、`VarBase`、`ArrayBase`、`ConcreteBase` 外形；
- 客户端/assembly 候选 node ID 表；
- typed `assembly_list` resolver 的基础逻辑；
- 通用 count/element special-arg 布局（主要为服务器 Stage 3 路径）。

### 真实 GIA/目标 GIL 提供

- 客户端 signal node identity 和 signalVersion；
- 目标地图 signal 的 sendServer ID；
- 每个 signal definition 的 CPI；
- 客户端 `ClientVarType` 与 VarBase oneof 的适用组合；
- entity/GUID 和列表元素的真实 wire/topology；
- 编辑器/游戏接受程度。

因此“vendor 有 assembly_list”不能等价为“vendor 已完整支持客户端 signal 列表”。本轮完整候选是 vendor 底层积木、真实 GIA 规律、目标 GIL identity 和 focused materializer 的组合结果。

## 8. 验证门禁

### 当前已通过

```bash
npx tsx tests/composite/test-client-signal-materializer.ts
npx tsx tests/composite/test-client-signal-materializer.ts --output
npm run build
git diff --check
```

证据：自动结构回归、message/container round-trip、GIA header 检查，以及用户编辑器/游戏确认。

### 接入生产 TS 前必须增加

- Client IR 正向构造回归；
- signal schema/参数顺序负向回归；
- 每种列表类型的 assembly concrete/type/index 回归；
- literal、conn、空列表、多元素列表边界回归；
- entity/GUID 数据源连接回归；
- CPI 来自 signal registry 而非硬编码回归；
- Client/Server 混端拒绝回归；
- GIA raw presence 和 message/container round-trip；
- 生成候选的编辑器导入、回导对拍和游戏行为验证。

自动通过不等于编辑器通过；编辑器通过不等于游戏行为通过；注入成功也不等于游戏行为通过。

## 9. 当前未冻结项

- `g.client()` 的正式运行时 API 和 Client IR 类型名；
- signal registry 是否需要缓存 CPI、ClientVarType、concrete kernel 等字段；
- 空列表、10 元素上限和超过上限的诊断；
- monitor/client signal 的对称生产契约；
- 多地图、多游戏版本 signal identity 的缓存与选择；
- 未取样客户端节点族、客户端 Composite、Client Graph variables 和客户端注入。
