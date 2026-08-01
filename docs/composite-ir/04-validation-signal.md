# 信号型复合节点验证

> 状态：已验证
> 来源：真实 GIA 验证（信号目录样本 + log系统.gia + 物理运动.gia + 2026-08-01 增量实验样本 v1-v6）
> 最近校验：2026-08-01
> 适用范围：真实 GIA 信号型复合逆向结论；§12 发送节点实例编码为游戏编辑器真实输出（增量实验逐轮核验）。

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

## 8. 多信号定义身份：三元组与全局 ID 注册

`多信号2.gia`、`多信号3.gia` 提供了当前最直接的多信号 A/B 对照证据。
两份真实编辑器导出均显示：一个信号由三个独立的 GraphUnit 定义组成：

```text
发送信号                      id = N
监听信号                      id = N + 1
向服务器节点图发送信号         id = N + 2
```

三个 GraphUnit 的 `relatedIds` 互相引用，发送节点和监听节点的
`genericId.nodeId` / `concreteId.nodeId` 分别指向同一组的 `N` / `N+1`。
节点上的 ClientExec 字符串仍保存信号名，但不能用它替代 definition identity。

### 8.1 真实样本交叉证据

`多信号2.gia` 中可确认的信号组包括：

| 信号 | 发送 | 监听 | 服务器发送 | schema 规模 |
|---|---:|---:|---:|---:|
| `信号_1` | 1610612738 | 1610612739 | 1610612740 | 5 参数 |
| `信号_全部参数测试` | 1610612741 | 1610612742 | 1610612743 | 9 参数 |
| `信号_全部列表参数测试` | 1610612744 | 1610612745 | 1610612746 | 9 参数 |
| `GSTS_用户验证信号_A` | 1610612748 | 1610612749 | 1610612750 | 1 参数 |
| `GSTS_用户验证信号_B` | 1610612751 | 1610612752 | 1610612753 | 2 参数 |

`多信号3.gia` 只包含 B，仍然得到同一组：

```text
1610612751 / 1610612752 / 1610612753
```

这证明该组 ID 不是由当前文件 accessory 顺序临时重排得到的，而是地图/编辑器信号注册身份的稳定引用。
`多信号2.gia` 中的 `1610612747` 被其他复合对象占用/跳过，因此不能把信号组推导为固定的
`base + index * 6` 序列；可确认的只是每组内部连续三元组。

### 8.2 适用边界

以下结论已由真实 GIA 证实：

- SignalDef ID 不能按信号名 hash、固定步长或任意新整数生成；
- 复用已有三元组 ID 会使编辑器按已有注册信号解析 schema 和名称，即使 ClientExec 字符串不同；
- 仅写入一个新的 ClientExec 字符串不能注册新信号；
- 新信号必须先在地图/编辑器注册并导出其真实三元组，编译器才能安全引用。

**节点 ID 规则（已解决，2026-08-01）**：发送/监听/服务器发送节点一律使用**注册三元组 ID**
（如 cube_turn 1610612741/42/43），`kind=SysGraph(22001)`；1610612738/39/40 不是特殊内置，
而是编辑器首个默认信号 `信号_1` 的三元组（旧样本 001.gia 显示它们只因当时只用了该信号）。
gsts 从不硬编码这些 ID，`patchEncodedSignalNodes`/客户端 patch 始终替换为地图注册 ID。

以下内容仍是当前 gsts 实现待完成项，不是本文的真实 GIA 结论：

- 修改已有信号（换参数/改名）的注册流程；
- SignalDef 的 `pinIndex` 在当前输出中的全局分配策略（gsts 用固定偏移，编辑器用全局计数器，游戏不依赖）。

证据命令：

```bash
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts --compact \\
  <Beyond_Local_Export>/user_edit/信号/多信号2.gia
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts --compact \\
  <Beyond_Local_Export>/user_edit/信号/多信号3.gia
```

适用范围：上述 ID/注册结论仅适用于游戏编辑器真实 GIA；不证明当前 gsts 自动生成的新信号可被游戏接受。

## 9. 信号文件一览

| 文件 | CompositeDef | event? | 复合调用 | 特征 |
|:----|-------------|:------:|:--------:|------|
| 001.gia | 监听信号(内置) | ❌ | 2 | 纯信号测试（发送+监听同信号名） |
| 002.gia | 监听信号 + 发送信号(1) | ❌ | 2 | 信号带参数（int+vec3）|
| 01.gia | 3 个（含两个信号） | ❌ | 2 | 多信号复合 |
| 02.gia | 3 个（含两个信号） | ❌ | 2 | 同上，有非终端 |
| 03.gia | 3 个（含两个信号） | ✅ | 2 | 有 event 的信号测试 |
| 04.gia | 2 个（含监听信号+信号复合） | ✅ | 1 | 信号复合与普通节点混用 |

## 10. 大规模信号网络实践

> **P0** 来自 `复杂gia/物理运动.gia`（gameVersion 6.6.0, 12 SignalDefs, 50 CompositeDefs）。已通过真实文件验证（2026-06-30）。

### 10.1 规模跨越

`物理运动.gia` 的信号网络规模是之前所有已知文件的 **6 倍**：

| 维度 | 用户编辑文件（信号目录） | log系统.gia | 物理运动.gia |
|:----|:-------------------:|:----------:|:------------:|
| SignalDef 数量 | 0（信号目录用 which=12 包装） | 2 | **12** |
| 监听信号复合 | 每文件 1-2 个 | 3 | **6** |
| 最大 OutParam | 6 | 9 | **10** |
| 信号参数类型 | int, vec3 | 界面参数（操作/页/i） | **物理量（v/w/f/位置）** |

### 10.2 信号对（Signal Pair）模式

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

### 10.3 信号 vs 数据连线的设计原则

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

### 10.4 相关文件结构演变

| 维度 | 小文件（信号目录） | log系统.gia | 物理运动.gia |
|:----|:--------------:|:----------:|:------------:|
| 信号实现 | which=12 包装 | which=14 原生 | which=14 原生 |
| 信号-数据混合 | 混合使用 | 信号少，数据为主 | **信号+数据并重** |
| 信号参数 | 1-3 个基本类型 | 界面参数 | **完整物理量集** |
| 架构风格 | 教学/测试 | UI 驱动 | **物理仿真引擎** |

## 11. 注入与信号注册（2026-07-31 真实游戏故障复盘）

### 11.1 根因：注入器覆盖信号注册定义

star-cube-nexus cube_turn 链路在真实游戏不可用的根因之一（已复现并修复）：

- GIL 顶层 field 10（复合容器）的 field 2 存放 CompositeDef，其中包含游戏管理的**信号注册定义**（f4=id、f102=params、f103=outputs、f107=signalDef）。
- 注入器 `mergeWrappedFieldMessages` 按 id 合并 GIA accessories 的 CompositeDef 时，GIA 的 SignalDef（id=注册信号 sendId/monitorId，与 GIL 注册定义同 id）**覆盖**了 GIL 注册定义。
- 覆盖后 `readRegisteredSignalsFromGil` 返回空列表（用户反馈："原始 GIL 仍包含 cube_turn 字符串，但读取器返回空列表"）。
- 复现（只读备份 + 临时副本）：注入前 `['cube_turn']` → 注入后 `[]`。
- 修复：`src/injector/index.ts` merge 同 id 时**保留 GIL 现有定义**（跳过 GIA 引入）。
- 验证：注入两图后注册仍 `['cube_turn']`，图 1073741826 回读 nodes=192。

用户游戏内"新建信号→保存→删除"之所以能修复：编辑器/游戏重新生成了完整的信号注册结构。

### 11.2 GIA 编码对齐规则（修复后样本为权威）

用户游戏内修复后导出的样本（min_main.gia / min_composite.gia，2026-07-31 21:40）与 gsts 产物的确定性差异及修复：

| 差异 | 真实样本（001.gia / 修复后） | gsts（已修复） |
|:----|:--------------------------|:--------------|
| signalVersion | 2 | 2（原 1，153f2ec 误改） |
| 发送节点 pin 顺序 | InParam... 在前，ClientExec 最后 | 同左（原 ClientExec 最前） |
| 监听节点 OutParam pin | 从不编码（CompositeDef 声明，连接直接引用 kind/index） | 不编码（原多 2 个） |
| 监听 accessory type.kind / xxx | 1002 / 2 | 1002 / 2（原 1000 / 1） |
| 图级 relatedIds | 含 send/monitor 信号 ID | 含（原缺失） |

**客户端 sendSignalToServerNodeGraph（2026-08-01 新增对齐，样本：`user_edit/客户端/信号.gia` 等）**：

| 字段 | 真实样本 | gsts（已对齐） |
|:----|:--------|:--------------|
| genericId | {class=10001, type=20002, kind=22001, nodeId=注册 serverId} | 同左（原占位符 300002 + kind=22000） |
| concreteId | {class=10001, type=20002, kind=22000, nodeId=2000} | 同左（未变） |
| signalVersion | 1（客户端；服务器 send/monitor 为 2） | 1（原未设置） |
| InFlow/OutFlow pin | 不编码（start 流出悬空引用其 InFlow(0)） | 不编码（原多 2 个） |
| 信号名 pin clientExecNode | {kind=6（ClientSignal）, index=1} | 同左（原 kind=5 + nodeId） |
| exec 流 pin clientExecNode | {kind=5, index=1, nodeId={id=200124}} | 同左（metadata 自带） |
| accessory | 完整三元组（发送/监听/向服务器） | 同左（原无） |
| 图级 relatedIds | 只含 serverId（{class=23, type=0}） | 同左（原无） |

客户端信号未在地图注册时编译报错（与服务器路径一致）；`manual_verify_2026_07_enum_updates.ts`
因此从 gsts.test.config.ts 批量编译排除（保留命令行手动运行方式）。

**动态值（不可静态对齐，游戏不依赖）**：
- ClientExec cpi（001.gia=7/14、修复后=43/44）：编辑器全局 pin 计数器
- accessory pinIndex（参数 12,13 或 12,16 或 149..157）：同上
- gsts 用 firstParam=12+i（12,13）与真实样本规则兼容

### 11.3 验证命令

```bash
# 注入破坏注册复现/回归（副本，不写真实 GIL）
npx tsx /tmp/inject-test2.ts   # 期望注入后注册仍为 cube_turn
# GIA 编码自检
npx tsx tests/composite/test-signal-min-repro.ts
```

## 12. 发送节点实例编码（2026-08-01 增量实验证实）

> 状态：已验证
> 来源：真实 GIA 验证（游戏内「信号调试」图 1073741836 的 6 轮增量保存样本，每轮经用户核验）
> 最近校验：2026-08-01
> 适用范围：游戏编辑器真实输出（服务器发送节点）；监听/客户端节点仍待增量样本确认

本章结论来自用户驱动增量实验：每轮只改一小步并保存，接收方逐字节核验。所有样本取自
`1073741849.gil`（图 1073741836「信号调试」，信号「工具_新信号」三元组
1610612768/69/70）。旧 GIA 样本（001.gia、修复后 min_main.gia 等）曾在游戏内失败，
**不再作为权威**；本章以增量样本为准。

### 12.1 增量证据链（v1 → v6）

| 版本 | 用户操作 | 核验结论 |
|:---:|---------|---------|
| v1 | 1 个发送节点（无参数） | 发送节点骨架；信号名 pin 必有 |
| v2 | +1 个相同发送节点，节点1 OutFlow→节点2 | 同 sendId 复用、nodeIndex 区分；OutFlow pin 按需编码（有出边才编码） |
| v3 | 参数_1 = 9999（int） | 参数 pin 首次编码：type=3(Integer)、value=IntBase、compositePinIndex=68 |
| v4 | 参数_2 = "abcde"（string） | type=6(String)、value=StringBase；i1.index=1（参数序号规律） |
| v5 | 参数_3 = [false]（bool 列表） | 列表参数不编码 value，connects 引用拼装列表节点（Assembly List 169/175） |
| v6 | 第二个发送节点加全部 3 个参数（456/"cde"/[false]） | 参数编码与节点1完全一致；两个节点共享同一拼装节点 |

每轮核验均确认：**信号定义三元组容器（393/431/331B）一字未变**，图内只有节点实例变化。

### 12.2 发送节点最小字段集（v6 样本）

```json
{
  "nodeIndex": 2,  // 两个发送节点同 sendId，靠 nodeIndex 区分
  "genericId": { "class": 10001, "type": 20000, "kind": 22001, "nodeId": 1610612768 },  // = sendId
  "concreteId": { "class": 10001, "type": 20000, "kind": 22001, "nodeId": 1610612768 },  // = genericId
  "signalVersion": 1,
  "pins": [ /* 按需编码，顺序 = 定义顺序的子序列（见 12.4） */ ],
  "x": ..., "y": ...
}
```

- 发送节点 genericId/concreteId 一律用**注册三元组第一个 ID（sendId）**，kind=SysGraph(22001)；
  与 §8.2「节点 ID 规则」一致。
- `signalVersion: 1`（节点 blob 与图定义容器 GraphNode f9 同步）。

### 12.3 核心规律：compositePinIndex = 信号定义三元组中的 pinIndex（f8）⭐

「工具_新信号」send 定义（GIL f10 内部 f2，331B）中各 pin 的 f8：

| 定义容器条目 | kind | pinIndex（f8） |
|:---|:---|:---:|
| f100 | InFlow | 86 |
| f101 | OutFlow | 87 |
| f102[0] | 参数_1 | 68 |
| f102[1] | 参数_2 | 12 |
| f102[2] | 参数_3 | 70 |
| f106 | 信号名 | 88 |

节点 pin 的 compositePinIndex **全部复用上述定义值**（OutFlow=87、参数=68/12/70、信号名=88），
**不是节点内序号、不是连续值**。参数 pinIndex 分散（68/12/70）是编辑器预分配值；
生成 GIA 必须从真实定义三元组读取，自编索引会导致游戏失败（旧实现失败根因之一）。

### 12.4 发送节点 pin 编码规则

pin 编码顺序 = 定义顺序（f100/f101/f102/f106）的子序列，未编码项跳过：
InFlow（无入边不编码）→ OutFlow（无出边不编码）→ 参数（未赋值不编码）→ 信号名（必有）。

**信号名 pin（必有）**：

```json
{ "i1": { "kind": 5 },  // ClientExecNode，无 index
  "value": { "class": 5, "alreadySetVal": true, "bString": { "val": "工具_新信号" } },
  "clientExecNode": { "kind": 6, "index": 1 },  // ClientSignal
  "compositePinIndex": 88 }
```

**OutFlow pin（仅当有出边）**：

```json
{ "i1": { "kind": 2 }, "i2": { "kind": 2 },
  "connects": [ { "id": 3, "connect": { "kind": 1 }, "connect2": { "kind": 1 } } ],
  // id = 目标 nodeIndex；kind=1 InFlow
  "compositePinIndex": 87 }
```

**参数 pin（仅赋值时编码）**：

```json
{ "i1": { "kind": 3, "index": 0 },  // InParam；index = 参数在定义中的序号，0 省略、1、2 …
  "i2": { "kind": 3, "index": 0 },
  "value": { "class": 2, "alreadySetVal": true,
              "itemType": { "classBase": 1, "type_server": { "type": 3 } },
              "bInt": { "val": 9999 } },
  "type": 3,  // VarType：Integer=3 / String=6 / Boolean=4 / BooleanList=9
  "compositePinIndex": 68 }
```

- 值类型映射：IntBase(2)+Integer(3)、StringBase(5)+String(6)；itemType.classBase=Server(1)。
- **列表参数（如 bool 列表）不编码 value**：参数 pin 变为 `type=9`、无 value、
  `connects: [{ "id": <拼装节点nodeIndex>, "connect": { "kind": 4 }, "connect2": { "kind": 4 } }]`
  （kind=4 OutParam），compositePinIndex 仍用定义值（参数_3=70）。

### 12.5 拼装列表节点（Assembly List，列表参数专用）

列表参数值通过系统节点「Assembly List」（node_pin_records id=169）构造：

```json
{ "genericId": { "class": 10000, "type": 20000, "kind": 22000, "nodeId": 169 },
  "concreteId": { "class": 10000, "type": 20000, "kind": 22000, "nodeId": 175 },
  // 真实样本 type=Server、kind=SysCall
  "pins": [ /* 100 × InParam(1..100) + 1 × OutParam */ ] }
```

- 节点定义 inputs = 1×Int + 100×R<T>，实例编码 **100 个元素槽 InParam（i1/i2 index=1..100，type=Boolean(4)）+ 1 个 OutParam（type=BooleanList(9)）**；Int 槽不编码。
- 元素值：`ConcreteBase{ alreadySetVal:true, bConcreteValue:{ indexOfConcrete:6, value: EnumBase{ itemType:{Server,Boolean}, bEnum:{} } } }`；
  **bEnum 空 = false**。已赋值槽 EnumBase 带 alreadySetVal:true，空槽不带；
  编辑器把全部 100 个槽都编码（空槽也有 ConcreteBase）。
- OutParam 值：`ArrayBase{ itemType:{Server,BooleanList}, bArray:{} }`（元素在槽 pin 里，数组体为空）。
- 该节点**无 compositePinIndex、无 signalVersion**（普通 SysCall 节点）。
- **相同列表值可共享同一个拼装节点**（v6：两个发送节点的参数_3 都 connects 到 nodeIndex=4）。

### 12.6 图定义容器 = nodeGraphBlob 封装（修正旧记录）

图 1073741836 在 GIL 中的存储：f10 内部 f1 @259256 就是 nodeGraphBlob 的外层封装：

```
f1 @259256（外层）→ f1 = nodeGraphMessage { f1=图Id, f2=图名, f3=GraphNode×N }
GraphNode = { f1=nodeIndex, f2=genericId, f3=concreteId, f4=NodePin×N,
              f5=x, f6=y, f9=signalVersion }
```

- dump-graph 工具读取的 nodeGraphBlobFields（10.1.1 路径）即此容器，与「图定义容器」是**同一份数据**（旧记录误记为两处）。
- GraphNode **带 x/y 坐标**（旧记录「无 x/y」有误；坐标与节点 blob 中一致）。
- 发送节点 GraphNode f9=1；拼装节点无 f9（signalVersion=0 省略）。
- 图内新增节点/参数时，此容器是唯一的字节增量来源（v3-v6 各轮总增量=此容器增量）。

### 12.7 与 §11.2 旧对齐表的冲突标注

增量样本（v1-v6）与 §11.2 基于旧样本的表格存在冲突，**以增量样本为准**：

| 项 | §11.2（旧样本） | 增量样本（v1-v6） |
|:---|:---|:---|
| 服务器发送节点 signalVersion | 2 | **1** |
| compositePinIndex | 编辑器全局计数器，gsts 用 firstParam=12+i | **= 定义三元组 f8（68/12/70/87/88）** |
| 发送节点 genericId | 客户端路径 patch 成 serverId | **= sendId（定义三元组第一个）** |
| concreteId | SysCall 2000 | **= genericId（SysGraph）** |

监听节点（onSignal）实例编码见 **§13（增量样本 v7-v10，已证实）**；
客户端 sendSignalToServerNodeGraph 的实例编码仍无增量样本，§11.2 相关行仅作历史记录。
---

## 13 监听信号节点（onSignal）实例编码——增量样本 v7-v10（已证实）

> 证据链：v7 仅监听未用参数 → v8 打印节点直接消费参数 → v9 类型转化链消费「固定三个参数」第一个 → v10 改为第三个。
> 四轮均为用户多次新增后取变更，样本可靠性同 v1-v6。全轮验证：定义容器（cube_turn 三个 268/366/328B、
> 工具_新信号三元组 393/431/331B）一字未变，文件增量全部在图定义容器（nodeGraphBlob）。

### 13.1 监听节点最小字段集（v7）

```
genericId = concreteId = { class:10001, type:20000, kind:22001(SysGraph), nodeId=monitorId }
pins[0]: 信号名 pin — i1=ClientExecNode(无 index), value=StringBase(信号名),
          clientExecNode={ClientSignal, index:1}, compositePinIndex=44
signalVersion = 2；x/y 坐标已编码
```

- **nodeId = monitorId = 信号注册表条目 f2**。cube_turn 的 monitorId=1610612742（0x60000006）；
  对照发送节点 nodeId=sendId=注册表条目 f1（工具_新信号=1610612768/0x60000020）。
  **每个信号在注册表里有一对 ID：f1=sendId（发送节点引用）、f2=monitorId（监听节点引用）**；
  handoff 曾预期 monitorId=1610612769（0x60000021）有误——那是工具_新信号的 monitorId，用户监听的是内置信号 cube_turn。
- **signalVersion 不是节点类型属性，而是信号版本**：= 注册表条目 f6（cube_turn=2、工具_新信号=1）。
  发送节点 signalVersion=1 只是该信号版本恰好为 1（修正 §12.7 的表述）。
- 仅信号名 pin 时无 OutFlow、无参数 pin——pin 按需编码（与发送节点一致）。

### 13.2 信号注册表条目结构（f5 大容器，新发现）

每个信号在 GIL 的 f5 大容器（≈2531B）里一个条目：

```
f1=sendId(NodeGraphId)  f2=monitorId(NodeGraphId)  f3=信号名
f4×N=参数条目 { f1=参数名, f2=类型(3=Integer/6=String/9=BooleanList), f3=1,
               f4/f5/f6=该参数在三个定义容器中的 pinIndex }
f6=信号版本  f7=下一个信号 ID
```

- cube_turn：`{f1=0x60000005, f2=0x60000006, f3="cube_turn", f4=face{6,1,12,34,40}, f4=direction{6,1,16,35,41}, f6=2}`
- 工具_新信号：`{f1=0x60000020, f2=0x60000021, f3="工具_新信号", f4=参数_1{3,1,68,76,83}, f4=参数_2{6,1,12,34,40}, f4=参数_3{9,1,70,78,85}, f6=1}`
- **参数条目 f4/f5/f6 = 同一参数在三个定义容器中的 pinIndex**（face: 12/34/40、direction: 16/35/41），
  与发送节点实例参数 cpi（68/12/70）逐一吻合——三个容器是同一信号定义的三套 pinIndex 视图。
- 工具_新信号 参数_2 的 cpi=12 = cube_turn face 的 cpi=12，坐实「工具_新信号复制自 cube_turn 后改参数」。
- 信号 ID 为 Server 基址 0x60000000 上的小序号；cube_turn 是内置信号（ID 更小、版本更高）。

### 13.3 监听节点输出体系：固定三个参数 + 自定义参数（v9/v10）

cube_turn 定义容器（第二个，366B）的 **f103 = 完整输出 pin 列表**（顺序即输出序号）：

| 输出序号 | pin | 定义 f3 | 定义 f8 | 类型 |
|:---:|:---|:---|:---:|:---|
| 0 | 事件源实体 | {f1:4} | 15 | Entity |
| 1 | 事件源GUID | {f1:4, f2:1} | 16 | GUID |
| 2 | 信号来源实体 | {f1:4, f2:2} | 17 | Entity |
| 3 | face | {f1:4, f2:3} | 34 | String |
| 4 | direction | {f1:4, f2:4} | 35 | String |

- 「固定的三个参数」= 前三个固定输出（事件源实体/GUID/信号来源实体，f3.f1=4 组）；
  自定义参数（face/direction）排在其后。f3.f2 = 组内序号（1 起，固定组内从 1/2 起）。
- 监听节点实例的 OutFlow cpi=13、信号名 cpi=44 均取自定义容器 f8（对照 §12.3 规律）。
- 第一个容器（268B）f102=用户参数视图（face f8=12、direction f8=16，f3={f1:3}=自定义组）；
  第三个容器（328B）为另一视图（face f8=40、direction f8=41）。

### 13.4 参数消费：实例不编码 OutParam，connects 用输出序号引用（v8-v10）

**监听节点实例不编码任何参数 OutParam pin**——参数输出是隐式的（由定义容器决定），消费方只写 connects：

```
消费方 pin.connects = [{ id: 监听节点nodeIndex, connect: {kind: OutParam, index: 输出序号},
                         connect2: {kind: OutParam, index: 输出序号} }]
```

- **OutParam index = 输出序号（0-based，0 省略）**：v9 消费第一个（事件源实体）= 无 index；
  v10 改为第三个（信号来源实体）= index:2；idx=7 遗留连接 face = index:3。与 13.3 表完全对应。
- 消费链示例（v9/v10）：监听节点 OutFlow → 打印节点 InFlow；监听节点 OutParam(0/2)
  → 类型转化节点 InParam(type=1 Entity) → OutParam(type=6 String) → 打印节点 InParam(type=6)。

### 13.5 消费节点（SysCall）模式

- **打印节点 = SysCall genericId=concreteId=1**：InParam type=6，connects 引用来源；
  **无 compositePinIndex、无 signalVersion**（与拼装节点 §12.5 一致）。
- **类型转化节点 = SysCall genericId=180 / concreteId=183**（generic≠concrete，同拼装节点 169/175 模式）：
  InParam 声明 `ConcreteBase{indexOfConcrete:1, itemType:Entity}`（type=1），
  OutParam 声明 `ConcreteBase{indexOfConcrete:2, itemType:String}`（type=6）——类型用 ConcreteBase 声明。
- 类型枚举（实例 pin.type）：Entity=1、Integer=3、Boolean=4、String=6、BooleanList=9。

### 13.6 增量核验表（v7-v10）

| 版本 | 用户操作 | 关键结论 |
|---|---|---|
| v7 | 新增监听节点（仅监听，未用参数） | 最小字段集；monitorId=注册表 f2；signalVersion=注册表 f6=2；信号名 pin cpi=44 |
| v8 | 新增打印节点，直接消费参数 | 监听节点 OutFlow cpi=13；打印节点 SysCall 1；实例不编码 OutParam；index=3=face |
| v9 | 类型转化链消费「第一个」参数 | 固定三参数=事件源实体/GUID/信号来源实体；无 index=输出0；转化节点 SysCall 180/183 |
| v10 | 改消费「第三个」参数 | OutParam index=2=信号来源实体——**index=输出序号（0-based，0 省略）闭环** |

全轮确认：cube_turn 三容器与工具_新信号三元组一字未变；字节增量仅 nodeGraphBlob（v8 +107B、v9 +215B、v10 +4B）。

### 13.7 未解释/待验证

- 第三个容器（328B）的 f8=19/20/45/46 对应 pin 语义未用未证（可能是客户端侧 pinIndex 视图）。
- OutParam index=1（事件源GUID）样本未出现，index 语义由 0/2/3 三点外推。
- f103 定义 f4（如事件源实体 {f3:1,f4:1} vs face {f1:5,f3:6,f4:6}）的差异含义未深究。
- 客户端 sendSignalToServerNodeGraph 节点编码仍无样本。
