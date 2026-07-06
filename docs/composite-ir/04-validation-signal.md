# 信号型复合节点验证

> 状态：已验证
> 来源：真实 GIA 验证（信号目录样本 + log系统.gia + 物理运动.gia）
> 最近校验：2026-07-06
> 适用范围：真实 GIA 信号型复合逆向结论。

覆盖：信号目录 6 个 GIA 文件。信号型复合是复合节点的特殊子类，执行由游戏信号系统驱动而非 InFlow。

## 1. 内置信号复合（无 impl graph）

**"监听信号"**（id=1610612739）是完全内置的复合——`graphId=0` 表示实现在游戏引擎中。

```
监听信号 (id=1610612739, graphId=0)
  ├── inflows: 0          ← 信号系统触发
  ├── outflows: 1         ← 收到信号后触发执行流
  ├── inputs: 0           ← 信号参数从定义获取
  └── outputs: 4-5        ← 事件源实体/GUID/信号来源实体/参数1..N
```

**关键特征**：
- `inflows: []` — 无执行入口
- `outflows: 1` — 收到信号触发 OutFlow
- `graphId: 0` — 无 impl graph
- 同一 id（1610612739）可在多个文件中出现，outputs 数量因信号参数个数而异
- CompositeDef ID 在 `1610612xxx-1610613xxx` 范围且 `graphId=0` → **内置复合**

## 2. ClientExec pin（kind=5）

信号型复合调用节点上出现新 pin 类型——**ClientExecNode (kind=5)**：

```json
{
  "kind": 5,                    // ClientExecNode
  "idx": 0,
  "compositePinIndex": 7,
  "value": {
    "class": 5,                 // StringBase
    "bString": { "val": "信号_1" }
  }
}
```

**特征**：
- kind=5，不同于 InFlow(1)/OutFlow(2)/InParam(3)/OutParam(4)
- 值类型 StringBase（class=5），携带**信号名称**
- 出现在发送信号和监听信号的调用节点上
- 有自己的 compositePinIndex

**001.gia 示例**（信号配对）：
```
node[6] kind=22001 nodeId=1610612738  ← 发送信号
  InParam(0) cpi=12                    ← 参数值 8888
  ClientExec(0) cpi=7  bString="test1" ← 信号名

node[7] kind=22001 nodeId=1610612739  ← 监听信号
  ClientExec(0) cpi=14 bString="test1" ← 信号名（配对）
```

两节点信号名相同 `"test1"`——这是信号收发匹配机制。

## 3. 信号发送复合的典型结构

"发送信号" 系列复合（如 id=1073742018, 1610612754）的 impl 节点指向内置信号节点：

```
"发送信号" 复合
  impl 节点: node[3] kind=22001 nodeId=1610612738  ← 内置发送信号
  compositePins:
    InFlow(0) → node[3] InFlow(0)
    OutFlow(0) → node[3] OutFlow(0)
    InParam(0) → node[3] InParam(0)
    InParam(1) → node[3] InParam(1)
```

**002.gia 完整信号带参数流程**：
```
node[5] kind=22001 nodeId=1610612738  ← 内置发送信号
  OutFlow(0) cpi=5 → [6]
  InParam(0) cpi=12  int=123
  InParam(1) cpi=13  vec3=(1,2,3)
  ClientExec(0) cpi=7  bString="信号_1"

node[6] kind=22001 nodeId=1610612754  ← 用户复合 "发送信号(1)"
  InParam(0) cpi=64  int=456
  InParam(1) cpi=65  vec3=(4,5,6)
```

## 4. compositePins 重复条目（信号特有）

04.gia "信号复合" 的 compositePins 有重复映射：

```json
[
  { "outer": "1:0", "inner": "1:0" },
  { "outer": "3:0", "inner": "3:0" },
  { "outer": "3:0", "inner": "3:0" },   // 重复！
  { "outer": "3:1", "inner": "3:1" },
  { "outer": "3:1", "inner": "3:1" }    // 重复！
]
```

同一外部 InParam 路由到同一内部节点 pin **两次**——信号参数需要"数据定义"和"信号载荷"两条路径。

## 5. 信号型 compositePins 规律

| outerPinKind | 名称 | 出现方式 | 说明 |
|:-----------:|------|---------|------|
| 1 | InFlow | 1 条 | 执行入口（信号发送） |
| 2 | OutFlow | 1 条 | 信号触发后的出口 |
| 3 | InParam | 每参数 **2 条** | 数据路径 + 信号载荷路径 |
| 4 | OutParam | 随输出数 | 信号回调参数 |
| 5 | **ClientExec** | 1 条 | 信号名称（StringBase） |

## 6. 特殊 ID 范围

| 类型 | ID 范围 | 示例 | 特征 |
|------|---------|------|------|
| 常规用户复合（gsts 生成） | 16107xxxxx | 1610700000（整数加法） | 有 impl graph |
| 常规用户复合（编辑器） | 1610612xxx-1610613xxx | 1610612755（双分支-user） | 有 impl graph |
| **内置信号** | 1610612738/1610612739 | 发送/监听 | `graphId=0` |
| **用户信号/编辑复合** | 1073742xxx | 1073742018（发送信号有参） | 包装内置信号 |

## 7. SignalDef（which=14）— 信号发送定义

`log系统.gia` 中发现一种新的 accessory 类型——**SignalDef（which=14）**，定义了"向服务器节点图发送信号"的结构。

```json
{
  "which": 14,
  "name": "向服务器节点图发送信号",
  "relatedIds": [
    { "class": 23, "id": 1610612806 },  // 监听信号 CompositeDef
    { "class": 23, "id": 1610612805 }   // 关联目标
  ],
  "compositeDef": {
    "inner": {
      "def": {
        "inflows":  [{ "pinIndex": 646 }],
        "outflows": [{ "pinIndex": 647 }],
        "inputs": [ /* 信号参数 */ ],
        "outputs": []
      }
    }
  }
}
```

与 CompositeDef 的差异：
- 相同点：同样有 inflows/outflows/inputs/outputs 结构
- 关键点：通过 `relatedIds` 关联到对应的"监听信号" CompositeDef
- 含义：定义了一个从 composite 向服务器发送信号的接口

**log系统.gia 中的实例**：

| 名称 | ID | relatedIds | inputs |
|:----|:--:|:----------:|--------|
| 向服务器节点图发送信号 | 1610612807 | 1610612806(监听信号), 1610612805 | 已同步数量/总数量/定时器实体/msgs实体/数据列表/索引列表 |
| 向服务器节点图发送信号 | 1610612891 | 1610612890(监听信号), 1610612889 | 事件名称/msg/日志操作/i |

### 7.1 relatedIds 关联机制

`relatedIds` 是 SignalDef 的核心关联字段，用于将信号发送定义与其对应的"监听信号"CompositeDef 配对。

**关系链（log系统.gia 实例）**：

```
SignalDef "向服务器节点图发送信号" (id=1610612807, which=14)
  relatedIds[0] = 1610612806 → CompositeDef "监听log信号" (which=12)
  relatedIds[1] = 1610612805 → ?（另一个关联目标，含义待验证）
```

**relatedIds 的跨类型使用**：

| accessory 类型 | relatedIds 用途 | 示例 |
|:--------------|:---------------|:----|
| SignalDef（which=14） | 关联到对应的监听信号 CompositeDef | 1610612807 → 1610612806 |
| structureDef（which=29） | 聚合操作该结构体的所有 CompositeDef | 1077936139 → 拼装/拆分/修改结构体 |

### 7.2 SignalDef 与 CompositeDef 对比

| 维度 | SignalDef（which=14） | CompositeDef（which=12） |
|:----|:--------------------:|:-----------------------:|
| 本质 | 信号发送接口声明 | 可执行的复合节点定义 |
| impl 图 | ❌ 无（信号由游戏引擎内置实现） | ✅ 有（用户定义的节点图） |
| `relatedIds` | ✅ 关联到监听信号 CompositeDef | ✅ 指向 impl 图（which=9 附件）或关联信号配对的 SignalDef |
| `id.type` | `0 (ServerGraph)` | `20000 (CompositeGraph)` |
| 被调用方式 | 通过信号名称触发 | 通过 `kind=22001` 节点调用 |
| 图形化 | 在编辑器中无展开图 | 可以展开查看 impl 图 |
| 多个实例化 | 每次发送创建一个独立实例 | 调用节点可以有多个实例 |

**编码对比**（参见 `05-gia-encoding.md §5-6`）：

```
CompositeDef:  GraphUnit { which=12, compositeDef: {...}, graph: nil }
SignalDef:      GraphUnit { which=14, graph: {...}, relatedIds: [...] }
structureDef:   GraphUnit { which=29, structureDef: {...}, relatedIds: [...] }
```

## 8. 信号文件一览

| 文件 | CompositeDef | event? | 复合调用 | 特征 |
|:----|-------------|:------:|:--------:|------|
| 001.gia | 监听信号(内置) | ❌ | 2 | 纯信号测试（发送+监听同信号名） |
| 002.gia | 监听信号 + 发送信号(1) | ❌ | 2 | 信号带参数（int+vec3）|
| 01.gia | 3 个（含两个信号） | ❌ | 2 | 多信号复合 |
| 02.gia | 3 个（含两个信号） | ❌ | 2 | 同上，有非终端 |
| 03.gia | 3 个（含两个信号） | ✅ | 2 | 有 event 的信号测试 |
| 04.gia | 2 个（含监听信号+信号复合） | ✅ | 1 | 信号复合与普通节点混用 |

## 9. 大规模信号网络实践

> **P0** 来自 `复杂gia/物理运动.gia`（gameVersion 6.6.0, 12 SignalDefs, 50 CompositeDefs）。已通过真实文件验证（2026-06-30）。

### 9.1 规模跨越

`物理运动.gia` 的信号网络规模是之前所有已知文件的 **6 倍**：

| 维度 | 用户编辑文件（信号目录） | log系统.gia | 物理运动.gia |
|:----|:-------------------:|:----------:|:------------:|
| SignalDef 数量 | 0（信号目录用 which=12 包装） | 2 | **12** |
| 监听信号复合 | 每文件 1-2 个 | 3 | **6** |
| 最大 OutParam | 6 | 9 | **10** |
| 信号参数类型 | int, vec3 | 界面参数（操作/页/i） | **物理量（v/w/f/位置）** |

### 9.2 信号对（Signal Pair）模式

每个"监听信号"CompositeDef 对应一对 SignalDef：

```
SignalDef: "发送信号" + "向服务器节点图发送信号"
                     │
                     ├── relatedIds → CompositeDef "监听信号" (which=12, I=0/O=1)
                     │
                     发送方（主图）── 信号名称 ──→ 接收方（主图监听）
```

**6 对信号在物理运动中的映射**：

| 信号对 | 监听信号 ID | OutParam 数目 | 参数类型 |
|:------|:----------:|:-----------:|:--------|
| Update → TickManager | 1073742207 | 6 | 事件源, GUID, TickManager |
| 运动器控制 | 1610612928 | 7 | run, v, w, 额外受力 |
| 角色物理状态 | 1610612738 | **10** | 角色实体, 事件, v, w, f, 位置, 旋转 |
| 运动/挂载 | 1610612748 | 6 | 运动实体, 挂载实体, 参数_1 |
| 日志操作 | 1610612890 | 7 | 事件名称, msg, 日志操作, i |
| 仿真同步 | 1610612871 | 7 | v, w, 额外压力, t |

### 9.3 信号 vs 数据连线的设计原则

基于两个大型文件的对比分析，可以总结：

| 场景 | 使用信号 | 使用数据连线 |
|:----|:--------|:-----------|
| 实时状态 | ✅ 游戏运行时物理参数（v, w, f） | ❌ 不适合 |
| 计算结果 | ❌ 不适合 | ✅ 复合间传递（F_aero, F摩擦力） |
| 跨文件通信 | ✅ SignalDef + relatedIds | ❌ 数据连线仅限当前 GIA |
| 高频更新 | ✅ 信号由游戏引擎调度 | ❌ 需要手动触发 |
| 帧同步（每 tick） | ✅ Update/TickManager 信号 | ✅ 更新间隔等参数 |
| 触发时机 | 事件驱动（碰撞、定时器、状态变化） | 数据依赖（输入变化即传播） |

**物理运动.gia 的关键洞察**：信号传递**实时物理状态**，数据连线传递**计算结果**——这是两类通信机制的**本质分工**。

### 9.4 相关文件结构演变

| 维度 | 小文件（信号目录） | log系统.gia | 物理运动.gia |
|:----|:--------------:|:----------:|:------------:|
| 信号实现 | which=12 包装 | which=14 原生 | which=14 原生 |
| 信号-数据混合 | 混合使用 | 信号少，数据为主 | **信号+数据并重** |
| 信号参数 | 1-3 个基本类型 | 界面参数 | **完整物理量集** |
| 架构风格 | 教学/测试 | UI 驱动 | **物理仿真引擎** |
